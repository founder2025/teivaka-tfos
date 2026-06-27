"""Public audit verification — Phase 9-1.

Endpoints:
  GET /api/v1/verify/{audit_hash}   -> JSON
  GET /verify/{audit_hash}          -> server-rendered HTML

Both unauth. Rate-limited via Redis (10 req/min per IP).
Privacy enforced at THREE layers:
  1. SECURITY DEFINER function audit.verify_event_by_hash (Migration 049) -- DB-layer projection
  2. Python whitelist in _build_response_payload -- code-layer enforcement
  3. Strict response model + automated forbidden-field check in deploy smoke

Uses get_db (auth-free, no RLS binding) -- the SECURITY DEFINER functions
bypass RLS internally and return only sanitized fields.
"""

import base64
import os
import re
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.envelope import error_envelope

try:
    import qrcode
    import qrcode.constants
    _QR_AVAILABLE = True
except ImportError:
    _QR_AVAILABLE = False

router = APIRouter()
html_router = APIRouter()

HASH_REGEX = re.compile(r'^[a-f0-9]{64}$')
RATE_LIMIT_MAX = 10
RATE_LIMIT_WINDOW = 60

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

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
    key = f"verify:rl:{ip}"
    try:
        current = await redis_client.incr(key)
        if current == 1:
            await redis_client.expire(key, RATE_LIMIT_WINDOW)
        if current > RATE_LIMIT_MAX:
            raise HTTPException(
                status_code=429,
                detail=error_envelope("rate_limited", f"Verification rate limit exceeded. Try again in {RATE_LIMIT_WINDOW}s."),
            )
    except aioredis.RedisError:
        pass


async def _lookup_hash(db: AsyncSession, audit_hash: str) -> Optional[dict]:
    row = await db.execute(text("""
        SELECT event_type, occurred_at, farm_id, tenant_id
        FROM audit.verify_event_by_hash(:h)
    """), {"h": audit_hash})
    result = row.first()
    if result is None:
        return None
    return {
        "event_type": result.event_type,
        "occurred_at": result.occurred_at.isoformat() if result.occurred_at else None,
        "farm_id": result.farm_id,
        "tenant_id": str(result.tenant_id),
    }


async def _chain_integrity(db: AsyncSession, tenant_id: str) -> dict:
    row = await db.execute(text("""
        SELECT total_events, break_count, verified_at
        FROM audit.verify_chain_for_tenant(cast(:tid AS uuid))
    """), {"tid": tenant_id})
    result = row.first()
    total = result.total_events if result else 0
    breaks = result.break_count if result else 0
    verified_at = (
        result.verified_at.isoformat()
        if result and result.verified_at
        else datetime.now(timezone.utc).isoformat()
    )
    return {
        "integrity_ok": (breaks == 0),
        "verified_at": verified_at,
        "events_in_chain": int(total),
        "chain_break_count": int(breaks),
    }


def _build_response_payload(verified: bool, event: Optional[dict], chain: Optional[dict], audit_hash: str) -> dict:
    if not verified:
        return {
            "verified": False,
            "audit_hash": audit_hash,
            "platform": {
                "name": "Teivaka Farm OS",
                "verify_method": "sha256-hash-chain",
            },
        }
    safe_event = {
        "event_type": event["event_type"],
        "occurred_at": event["occurred_at"],
        "farm_id": event["farm_id"],
    }
    safe_chain = {
        "integrity_ok": chain["integrity_ok"],
        "verified_at": chain["verified_at"],
        "events_in_chain": chain["events_in_chain"],
        "chain_break_count": chain["chain_break_count"],
    }
    return {
        "verified": True,
        "audit_hash": audit_hash,
        "audit_event": safe_event,
        "chain": safe_chain,
        "platform": {
            "name": "Teivaka Farm OS",
            "verify_method": "sha256-hash-chain",
        },
    }


async def _verify_core(audit_hash: str, request: Request, db: AsyncSession) -> dict:
    audit_hash = audit_hash.lower().strip()

    if not HASH_REGEX.match(audit_hash):
        raise HTTPException(
            status_code=400,
            detail=error_envelope("invalid_hash_format", "Audit hash must be 64 lowercase hex characters."),
        )

    await _rate_limit_check(request)

    event = await _lookup_hash(db, audit_hash)
    if event is None:
        return _build_response_payload(False, None, None, audit_hash)

    chain = await _chain_integrity(db, event["tenant_id"])
    return _build_response_payload(True, event, chain, audit_hash)


@router.get("/verify/{audit_hash}", response_class=JSONResponse)
async def verify_json(
    audit_hash: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    payload = await _verify_core(audit_hash, request, db)
    response = JSONResponse(content=payload)
    response.headers["Cache-Control"] = "public, max-age=300"
    return response


def _generate_sample_qr_b64(verify_url: str) -> str:
    """Generate a base64-encoded PNG QR code for inline embedding in HTML."""
    if not _QR_AVAILABLE:
        return ""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(verify_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#5C4033", back_color="#F8F3E9")
    buf = BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return base64.b64encode(buf.read()).decode('ascii')


def _format_iso_human(iso_str):
    """Convert ISO 8601 to '1 May 2026 · 15:43 UTC'. None-safe; returns raw on parse failure."""
    if not iso_str:
        return None
    try:
        normalized = iso_str.replace('Z', '+00:00') if iso_str.endswith('Z') else iso_str
        dt = datetime.fromisoformat(normalized)
        return dt.strftime("%-d %B %Y · %H:%M UTC")
    except (ValueError, AttributeError):
        return iso_str


@html_router.get("/verify", response_class=HTMLResponse)
async def verify_about(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Public 'About verification' explainer page (Phase 9-3)."""
    await _rate_limit_check(request)

    row = await db.execute(text("""
        SELECT total_events, tenant_count, chain_break_count, latest_bank_pdf_hash
        FROM audit.public_chain_stats()
    """))
    stats = row.first()
    total_events = stats.total_events if stats else 0
    tenant_count = stats.tenant_count if stats else 0
    chain_break_count = stats.chain_break_count if stats else 0
    sample_hash = stats.latest_bank_pdf_hash if stats and stats.latest_bank_pdf_hash else None

    sample_qr_b64 = ""
    if sample_hash:
        sample_qr_b64 = _generate_sample_qr_b64(f"https://teivaka.com/verify/{sample_hash}")

    context = {
        "request": request,
        "total_events_human": f"{total_events:,}",
        "tenants_human": f"{tenant_count:,}",
        "chain_break_count": chain_break_count,
        "sample_hash": sample_hash,
        "sample_qr_b64": sample_qr_b64,
    }
    response = templates.TemplateResponse("verify_about.html", context)
    response.headers["Cache-Control"] = "public, max-age=300"
    return response


@html_router.get("/verify/{audit_hash}", response_class=HTMLResponse)
async def verify_html(
    audit_hash: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    payload = await _verify_core(audit_hash, request, db)

    event = payload.get("audit_event")
    chain = payload.get("chain")
    event_human = None
    chain_human = None
    if event:
        event_human = {**event, "occurred_at_human": _format_iso_human(event.get("occurred_at"))}
    if chain:
        chain_human = {**chain, "verified_at_human": _format_iso_human(chain.get("verified_at"))}

    # Evidence behind a Bank Evidence report (Operator decision 2026-06-27, softens D2):
    # for a BANK_PDF_GENERATED hash ONLY, show the blocks + photos that back the numbers
    # — the report hash is the capability (only someone the farmer handed the report to
    # has it). Scoped to that report's evidence; never money, notes or identities.
    evidence = None
    if payload.get("verified") and event and event.get("event_type") == "BANK_PDF_GENERATED":
        raw = (await db.execute(text(
            "SELECT audit.report_evidence_by_hash(:h) AS r"), {"h": audit_hash.lower().strip()})).scalar()
        import json as _json
        ev = raw if isinstance(raw, dict) else (_json.loads(raw) if raw else None)
        if ev and (ev.get("blocks") or ev.get("photos")):
            evidence = ev

    # PUBLIC PAGE = PROOF ONLY (Operator decision 2026-06-27, D2). This page answers
    # exactly one question — "is this report genuine?" — and exposes NO farm data
    # (no photos, blocks, GPS, financials, history, PII). Evidence is delivered only
    # through permissioned, revocable Share Sessions (Phase 3), never public-by-hash.
    context = {
        "request": request,
        "verified": payload.get("verified", False),
        "audit_hash": payload["audit_hash"],
        "event": event_human,
        "chain": chain_human,
        "evidence": evidence,
        "platform": payload["platform"],
    }
    response = templates.TemplateResponse("verify_result.html", context)
    response.headers["Cache-Control"] = "public, max-age=300"
    return response


# ─────────── Independent photo verification (safe, proof-only) ───────────
_PLATFORM = {"name": "Teivaka Farm OS", "verify_method": "sha256-hash-chain"}


async def _verify_photo_core(sha: str, request: Request, db: AsyncSession) -> dict:
    sha = sha.lower().strip()
    if not HASH_REGEX.match(sha):
        raise HTTPException(
            status_code=400,
            detail=error_envelope("invalid_hash_format", "Photo hash must be 64 lowercase hex characters."),
        )
    await _rate_limit_check(request)
    raw = (await db.execute(text("SELECT audit.verify_photo_by_hash(:h) AS r"), {"h": sha})).scalar()
    import json as _json
    info = raw if isinstance(raw, dict) else (_json.loads(raw) if raw else {})
    if not info or not info.get("found"):
        return {"verified": False, "photo_hash": sha, "platform": _PLATFORM}
    chain = await _chain_integrity(db, str(info["tenant_id"]))
    return {
        "verified": True,
        "photo_hash": sha,
        "evidence": {"event_type": info.get("event_type"), "occurred_at": info.get("occurred_at")},
        "chain": chain,
        "platform": _PLATFORM,
    }


@router.get("/verify/photo/{sha}", response_class=JSONResponse)
async def verify_photo_json(sha: str, request: Request, db: AsyncSession = Depends(get_db)):
    payload = await _verify_photo_core(sha, request, db)
    response = JSONResponse(content=payload)
    response.headers["Cache-Control"] = "public, max-age=300"
    return response


@html_router.get("/verify/photo/{sha}", response_class=HTMLResponse)
async def verify_photo_html(sha: str, request: Request, db: AsyncSession = Depends(get_db)):
    payload = await _verify_photo_core(sha, request, db)
    ev = payload.get("evidence")
    chain = payload.get("chain")
    ev_human = {**ev, "occurred_at_human": _format_iso_human(ev.get("occurred_at"))} if ev else None
    chain_human = {**chain, "verified_at_human": _format_iso_human(chain.get("verified_at"))} if chain else None
    context = {
        "request": request,
        "verified": payload.get("verified", False),
        "photo_hash": payload["photo_hash"],
        "evidence": ev_human,
        "chain": chain_human,
        "platform": payload["platform"],
    }
    response = templates.TemplateResponse("verify_evidence.html", context)
    response.headers["Cache-Control"] = "public, max-age=300"
    return response
