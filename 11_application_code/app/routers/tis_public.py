"""
TIS-Public FastAPI router — public chat assistant endpoint.

Mirrors verify.py: unauthenticated, Redis-rate-limited, error-enveloped,
thin wrapper over tis_public_service.ask().

Exposes POST /api/v1/tis-public/ask — accepts a visitor question, runs it
through the harness, and returns either a grounded answer with citations
or a refusal with WhatsApp handoff.

Rate limit: 20 requests per minute per IP (higher than verify's 10 because
chat conversations have multiple turns). Fail-open if Redis is unavailable.
"""
from __future__ import annotations

import logging
import os
import uuid
from typing import Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.schemas.envelope import error_envelope
from app.services.tis_public_service import ask, HarnessResult


logger = logging.getLogger(__name__)

router = APIRouter()

RATE_LIMIT_MAX = 20
RATE_LIMIT_WINDOW = 60

_redis_client: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
        _redis_client = aioredis.from_url(url, decode_responses=True)
    return _redis_client


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _rate_limit_check(request: Request) -> None:
    ip = _client_ip(request)
    redis_client = await get_redis()
    key = f"tis_public:rl:{ip}"
    try:
        current = await redis_client.incr(key)
        if current == 1:
            await redis_client.expire(key, RATE_LIMIT_WINDOW)
        if current > RATE_LIMIT_MAX:
            raise HTTPException(
                status_code=429,
                detail=error_envelope("rate_limited", f"Chat rate limit exceeded. Try again in {RATE_LIMIT_WINDOW}s."),
            )
    except aioredis.RedisError:
        # Fail open: a Redis outage must not take down the public assistant.
        logger.warning("Redis unavailable for tis_public rate limit; failing open for ip=%s", ip)


# ────────────────────────────────────────────────────────────────────
# Pydantic schemas
# ────────────────────────────────────────────────────────────────────

class TisPublicAskRequest(BaseModel):
    question: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="The visitor's question. Trimmed and length-capped server-side.",
    )
    session_id: Optional[str] = Field(
        None,
        max_length=64,
        description="Optional caller-provided session id. If omitted, server generates.",
    )


class TisPublicChatRequest(BaseModel):
    """Widget-compatible payload shape — accepts 'message' field instead of 'question'."""
    message: str = Field(
        min_length=1,
        max_length=500,
        description="The visitor's message. Trimmed and length-capped server-side."
    )
    session_id: Optional[str] = Field(
        default=None,
        max_length=64,
        description="Optional caller-provided session id. If omitted, server generates."
    )


class TisPublicAskResponse(BaseModel):
    answer_text: Optional[str] = Field(
        None, description="Grounded answer with citation line. None if refused."
    )
    text: Optional[str] = Field(
        None,
        description="Widget-compatible alias for answer_text. Mirrors answer_text value. Added 2026-05-25 for tis-widget.js v1 compatibility (widget reads data.text).",
    )
    refusal_category: Optional[str] = Field(
        None,
        description="Refusal script category (e.g., 'ship_dates', 'pricing'). None if answered.",
    )
    cited_chunk_ids: list[str] = Field(
        default_factory=list,
        description="Corpus chunk ids cited by the answer (empty on refusal).",
    )
    confidence_score: Optional[float] = Field(
        None, description="Cosine similarity of the best retrieved chunk."
    )
    handoff_to_whatsapp: bool = Field(
        ..., description="True when the refusal path suggests WhatsApp escalation."
    )
    latency_ms: int = Field(..., description="End-to-end harness latency.")
    session_id: str = Field(..., description="Server-confirmed session id.")


# ────────────────────────────────────────────────────────────────────
# Endpoint
# ────────────────────────────────────────────────────────────────────

@router.post(
    "/ask",
    response_model=TisPublicAskResponse,
    status_code=status.HTTP_200_OK,
    summary="Ask the public Teivaka assistant a question.",
)
async def tis_public_ask(
    payload: TisPublicAskRequest,
    request: Request,
):
    """Public chat endpoint. Unauthenticated, Redis-rate-limited (20/min/IP)."""
    await _rate_limit_check(request)

    session_id = payload.session_id or f"web-{uuid.uuid4().hex[:12]}"
    client_ip = _client_ip(request)
    user_agent = request.headers.get("user-agent")

    result: HarnessResult = await ask(
        question=payload.question,
        session_id=session_id,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    return TisPublicAskResponse(
        answer_text=result.answer_text,
        text=result.answer_text,
        refusal_category=result.refusal_category,
        cited_chunk_ids=result.cited_chunk_ids,
        confidence_score=result.confidence_score,
        handoff_to_whatsapp=result.handoff_to_whatsapp,
        latency_ms=result.latency_ms,
        session_id=result.session_id,
    )


@router.post(
    "/chat",
    response_model=TisPublicAskResponse,
    status_code=status.HTTP_200_OK,
    summary="Widget-compatible alias for /ask. Accepts {message, session_id} payload.",
)
async def tis_public_chat(
    payload: TisPublicChatRequest,
    request: Request,
):
    """
    Widget-compatible endpoint — accepts {message, session_id} per the deployed
    tis-widget.js contract. Delegates to the same ask() pipeline as /ask, just
    with the field renamed. Bridge-trust posture per Memory #26 and #28.
    """
    # Construct the standard request shape and reuse the existing handler logic
    standard_payload = TisPublicAskRequest(
        question=payload.message,
        session_id=payload.session_id,
    )
    return await tis_public_ask(payload=standard_payload, request=request)
