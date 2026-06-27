"""Third-party attestation — claims stop being self-asserted (TATI Phase 3, Pillar B).

Link-based (DD-2): the farmer mints a one-time link addressed to an officer / cooperative /
landowner / buyer; they open it, see the specific claim, and Confirm/Decline. A confirm writes
a claim_verifications row with THAT source's weight (D4) and lifts the Trust score immediately.

Owner side (authed): POST/GET /attestations
Public verifier side (token-gated): GET /a/{token} (page) · POST /a/{token}/respond
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Form
from fastapi.responses import HTMLResponse
from fastapi.concurrency import run_in_threadpool
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.rls import get_current_user, get_tenant_db
from app.schemas.envelope import success_envelope
from app.services.trust_engine import SOURCE_WEIGHTS
from app.routers.verify import _client_ip, _rate_limit_check

router = APIRouter()
html_router = APIRouter()

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

_SOURCES = {"EXTENSION_OFFICER", "COOPERATIVE", "LANDOWNER", "BUYER", "GOV_PROGRAMME"}
_CLAIMS = {"IDENTITY", "FARM_OWNERSHIP", "LAND_BOUNDARY", "PRODUCTION", "SALE"}


def _h(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


def _now():
    return datetime.now(timezone.utc)


class AttestCreate(BaseModel):
    claim_type: str
    claim_ref: Optional[str] = None       # defaults: IDENTITY→user, FARM_*→first farm
    subject_label: Optional[str] = Field(None, max_length=200)
    verifier_source: str
    verifier_label: Optional[str] = Field(None, max_length=200)
    expiry_days: int = Field(14, ge=1, le=90)


@router.post("/attestations")
async def create_attestation(body: AttestCreate, request: Request, db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    claim_type = body.claim_type.upper()
    source = body.verifier_source.upper()
    if claim_type not in _CLAIMS or source not in _SOURCES:
        raise HTTPException(400, detail="Unknown claim type or verifier source")
    claim_ref = body.claim_ref
    if not claim_ref:
        if claim_type == "IDENTITY":
            claim_ref = str(user["user_id"])
        else:
            claim_ref = (await db.execute(text(
                "SELECT farm_id FROM tenant.farms WHERE is_active=TRUE ORDER BY created_at LIMIT 1"))).scalar()
    if not claim_ref:
        raise HTTPException(400, detail="No subject to verify (set up your farm first)")
    token = secrets.token_urlsafe(24)
    rid = (await db.execute(text("""
        INSERT INTO tenant.attestation_requests
            (tenant_id, requested_by_user_id, claim_type, claim_ref, subject_label,
             verifier_source, verifier_label, token_hash, expires_at, creator_ip)
        VALUES (cast(:t AS uuid), cast(:u AS uuid), :ct, :cr, :sl, :vs, :vl, :th, :exp, :ip)
        RETURNING request_id
    """), {"t": str(user["tenant_id"]), "u": str(user["user_id"]), "ct": claim_type, "cr": claim_ref,
           "sl": body.subject_label, "vs": source, "vl": body.verifier_label, "th": _h(token),
           "exp": _now() + timedelta(days=body.expiry_days), "ip": _client_ip(request)})).scalar()
    return success_envelope({"request_id": str(rid), "url": f"https://teivaka.com/a/{token}",
                             "verifier_source": source, "claim_type": claim_type})


@router.get("/attestations")
async def list_attestations(db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    rows = (await db.execute(text("""
        SELECT request_id, claim_type, verifier_source, verifier_label, status, responded_at, expires_at, created_at
        FROM tenant.attestation_requests ORDER BY created_at DESC LIMIT 100
    """))).mappings().all()
    now = _now()
    out = []
    for r in rows:
        d = dict(r); d["request_id"] = str(d["request_id"])
        for k in ("responded_at", "expires_at", "created_at"):
            d[k] = d[k].isoformat() if d[k] else None
        if r["status"] == "PENDING" and r["expires_at"] and r["expires_at"] < now:
            d["status"] = "EXPIRED"
        out.append(d)
    return success_envelope({"attestations": out})


# ───────────────────────── verifier side (public, token-gated) ─────────────────────────
_SOURCE_LABEL = {"EXTENSION_OFFICER": "Extension Officer", "COOPERATIVE": "Cooperative",
                 "LANDOWNER": "Landowner", "BUYER": "Buyer", "GOV_PROGRAMME": "Government Programme"}
_CLAIM_LABEL = {"IDENTITY": "is a real farmer (identity)", "FARM_OWNERSHIP": "owns/operates this farm",
                "LAND_BOUNDARY": "farms this land", "PRODUCTION": "produced this", "SALE": "sold this to you"}


async def _resolve(db, token):
    return (await db.execute(text("SELECT * FROM audit.resolve_attestation(:th)"), {"th": _h(token.strip())})).mappings().first()


@html_router.get("/a/{token}", response_class=HTMLResponse)
async def attestation_page(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    def page(**ctx):
        ctx.setdefault("request", request)
        return templates.TemplateResponse("attestation.html", ctx)
    r = await _resolve(db, token)
    if not r:
        return page(state="invalid", message="This verification link is not valid.")
    if r["status"] != "PENDING":
        return page(state="done", message=f"This request was already { r['status'].lower() }.")
    if r["expires_at"] and r["expires_at"] < _now():
        return page(state="done", message="This verification link has expired.")
    return page(state="ask", token=token,
                source_label=_SOURCE_LABEL.get(r["verifier_source"], r["verifier_source"]),
                claim_label=_CLAIM_LABEL.get(r["claim_type"], r["claim_type"]),
                subject_label=r["subject_label"])


@html_router.post("/a/{token}/respond", response_class=HTMLResponse)
async def attestation_respond(token: str, request: Request, decision: str = Form(...),
                              verifier_name: str = Form(""), verifier_role: str = Form(""),
                              note: str = Form(""), db: AsyncSession = Depends(get_db)):
    def page(**ctx):
        ctx.setdefault("request", request)
        return templates.TemplateResponse("attestation.html", ctx)
    await _rate_limit_check(request)
    r = await _resolve(db, token)
    if not r or r["status"] != "PENDING" or (r["expires_at"] and r["expires_at"] < _now()):
        return page(state="done", message="This request is no longer open.")

    confirm = decision == "confirm"
    # The verifier must identify themselves — a confirmation with no name isn't a verification (PP-18).
    if confirm and not verifier_name.strip():
        return page(state="ask", token=token,
                    source_label=_SOURCE_LABEL.get(r["verifier_source"], r["verifier_source"]),
                    claim_label=_CLAIM_LABEL.get(r["claim_type"], r["claim_type"]),
                    subject_label=r["subject_label"], message="Please enter your name to confirm.")

    tenant_id = str(r["tenant_id"])
    await db.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": tenant_id})
    # Self-confirm detection (PP-18/PP-20): if the confirmer's IP matches the farmer who minted
    # the request, record it but NOT as independent — the trust engine won't grant third-party weight.
    creator_ip = (await db.execute(text(
        "SELECT creator_ip FROM tenant.attestation_requests WHERE request_id=:rid"),
        {"rid": str(r["request_id"])})).scalar()
    responder_ip = _client_ip(request)
    independent = bool(creator_ip) and bool(responder_ip) and creator_ip != responder_ip

    if confirm:
        weight = SOURCE_WEIGHTS.get(r["verifier_source"], 15)
        verifier_id = f"{verifier_name.strip()}" + (f" ({verifier_role.strip()})" if verifier_role.strip() else "")
        await db.execute(text("""
            INSERT INTO tenant.claim_verifications
                (tenant_id, claim_type, claim_ref, source, source_ref, status, confidence_weight,
                 independent, request_id, verified_at)
            VALUES (cast(:t AS uuid), :ct, :cr, :src, :sref, 'VERIFIED', :w, :ind, :rid, now())
            ON CONFLICT (tenant_id, claim_type, claim_ref, source) DO UPDATE SET
                status='VERIFIED', confidence_weight=EXCLUDED.confidence_weight,
                source_ref=EXCLUDED.source_ref, independent=EXCLUDED.independent,
                request_id=EXCLUDED.request_id, verified_at=now()
        """), {"t": tenant_id, "ct": r["claim_type"], "cr": r["claim_ref"], "src": r["verifier_source"],
               "sref": verifier_id, "w": weight, "ind": independent, "rid": str(r["request_id"])})
    await db.execute(text("""
        UPDATE tenant.attestation_requests SET status=:st, response_note=:n, verifier_label=COALESCE(:vn, verifier_label), responded_at=now()
        WHERE request_id=:rid
    """), {"st": "CONFIRMED" if confirm else "DECLINED",
           "n": (note or None), "vn": (verifier_name.strip() or None), "rid": str(r["request_id"])})
    await db.commit()

    if confirm:
        # Lift the trust score immediately (same compute path as the nightly job).
        try:
            from app.workers.trust_worker import refresh_tenant
            await run_in_threadpool(refresh_tenant, tenant_id)
        except Exception:  # noqa: BLE001 — recompute is best-effort; nightly will catch up
            pass
    return page(state="thanks", confirmed=confirm)
