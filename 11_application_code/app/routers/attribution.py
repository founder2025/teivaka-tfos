"""Attribution capture endpoint.

Public, unauthenticated landing-page funnel logger. Writes to
shared.attribution_events (cross-tenant by design — pre-signup events have
no tenant_id yet). Failures are swallowed: attribution must never break the
frontend.
"""
import logging
from typing import Any, Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.config import settings
from app.db.session import get_db

router = APIRouter()
logger = logging.getLogger(__name__)

RATE_LIMIT_MAX = 10
RATE_LIMIT_WINDOW_SECONDS = 300  # 5 minutes


class AttributionCaptureRequest(BaseModel):
    anonymous_id: Optional[str] = Field(default=None, max_length=64)
    source: Optional[str] = Field(default=None, max_length=32)
    campaign: Optional[str] = Field(default=None, max_length=64)
    utm_source: Optional[str] = Field(default=None, max_length=32)
    utm_medium: Optional[str] = Field(default=None, max_length=32)
    utm_campaign: Optional[str] = Field(default=None, max_length=64)
    utm_content: Optional[str] = Field(default=None, max_length=64)
    referral_code: Optional[str] = Field(default=None, max_length=16)
    metadata: Optional[dict[str, Any]] = None


async def _is_rate_limited(anonymous_id: str, client_ip: str) -> bool:
    """Mirror the tis_service Redis pattern: incr, set expire on first hit.

    Keys on (anonymous_id, client_ip) so a spoofed anonymous_id can't bypass
    the limit by rotating values from the same machine.
    """
    try:
        r = aioredis.from_url(settings.redis_url)
        try:
            key = f"attr:rate:{anonymous_id}:{client_ip}"
            count = await r.incr(key)
            if count == 1:
                await r.expire(key, RATE_LIMIT_WINDOW_SECONDS)
            return count > RATE_LIMIT_MAX
        finally:
            await r.aclose()
    except Exception as e:
        logger.warning("Attribution rate limiter unavailable: %s", e)
        return False  # fail-open: never block on infra error


@router.post("/capture", status_code=status.HTTP_204_NO_CONTENT)
async def capture(
    payload: AttributionCaptureRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Response:
    client_ip = request.client.host if request.client else "unknown"
    if payload.anonymous_id and await _is_rate_limited(payload.anonymous_id, client_ip):
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    try:
        # Prefer explicit source, fall back to utm_source
        source = payload.source or payload.utm_source
        campaign = payload.campaign or payload.utm_campaign

        properties: dict[str, Any] = dict(payload.metadata or {})
        if payload.utm_source:   properties.setdefault("utm_source", payload.utm_source)
        if payload.utm_medium:   properties.setdefault("utm_medium", payload.utm_medium)
        if payload.utm_campaign: properties.setdefault("utm_campaign", payload.utm_campaign)
        if payload.utm_content:  properties.setdefault("utm_content", payload.utm_content)
        if payload.referral_code:
            properties.setdefault("referral_code", payload.referral_code)

        referrer_url = request.headers.get("referer")
        user_agent = request.headers.get("user-agent")
        # landing_path = where the user actually was, NOT this API endpoint.
        # Prefer metadata.url → Referer header → "/".
        from urllib.parse import urlparse
        landing_path = "/"
        for candidate in (
            (payload.metadata or {}).get("url") if payload.metadata else None,
            referrer_url,
        ):
            if candidate:
                try:
                    p = urlparse(candidate).path or "/"
                    landing_path = p
                    break
                except Exception:
                    continue

        await db.execute(
            text("""
                INSERT INTO shared.attribution_events (
                    event_type, anonymous_id, source, campaign, medium,
                    referrer_url, landing_path, user_agent, properties
                ) VALUES (
                    'LANDING_VIEW', :anonymous_id, :source, :campaign, :medium,
                    :referrer_url, :landing_path, :user_agent,
                    CAST(:properties AS jsonb)
                )
            """),
            {
                "anonymous_id": payload.anonymous_id,
                "source": source,
                "campaign": campaign,
                "medium": payload.utm_medium,
                "referrer_url": referrer_url,
                "landing_path": landing_path,
                "user_agent": user_agent,
                "properties": __import__("json").dumps(properties),
            },
        )
        await db.commit()
    except Exception as e:
        logger.warning("Attribution capture failed (silently swallowed): %s", e)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
