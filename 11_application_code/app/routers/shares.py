"""Share Sessions — secure, permissioned, revocable passport sharing (TATI Phase 3, Pillar A).

Farmers own their data; institutions access only with permission (D2/P2). The farmer mints a
scoped, expiring, revocable (optionally password-protected, one-time) Share Session; the QR/link
opens a token-gated portal. Every resolve is logged. Public /verify/{hash} stays proof-only.

Owner side (authed, RLS-normal via get_tenant_db):
  POST /shares   GET /shares   POST /shares/{id}/revoke
Public resolve (unauth, token-gated, rate-limited):
  GET /s/{token}   (HTML portal)
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.rls import get_current_user, get_tenant_db
from app.schemas.envelope import success_envelope
from app.core.payment_lock import pin_context  # passlib CryptContext — reused to hash share passwords

router = APIRouter()       # /shares (authed)
html_router = APIRouter()  # /s/{token} (public)

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

_AUDIENCES = {"LOAN", "BUYER", "INSURANCE", "GOVERNMENT", "INVESTOR", "RESEARCHER", "NGO", "OTHER"}
# Default scope: identity/reputation/trust/farm shared by default; photo+block EVIDENCE is
# opt-in (sensitive — the farmer chooses to include it per share).
_DEFAULT_SCOPE = {"identity": True, "reputation": True, "trust": True, "farm": True,
                  "evidence": False, "documents": False}


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _now():
    return datetime.now(timezone.utc)


# ───────────────────────── owner side ─────────────────────────
class ShareCreate(BaseModel):
    audience: str = Field("OTHER")
    share_reason: Optional[str] = Field(None, max_length=200)
    recipient: Optional[str] = Field(None, max_length=200)
    scope: Optional[dict] = None
    expiry_days: int = Field(30, ge=1, le=365)
    password: Optional[str] = Field(None, max_length=100)
    one_time: bool = False
    view_only: bool = True


@router.post("/shares")
async def create_share(body: ShareCreate, db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    audience = body.audience.upper() if body.audience else "OTHER"
    if audience not in _AUDIENCES:
        audience = "OTHER"
    # Evidence defaults ON for loan/buyer/insurer audiences (proving yourself is the point);
    # an explicit value in body.scope always wins. Backstop for direct API callers — the
    # frontend share sheet sets the same default per audience.
    defaults = dict(_DEFAULT_SCOPE)
    if audience in ("LOAN", "BUYER", "INSURANCE"):
        defaults["evidence"] = True
    scope = {k: bool((body.scope or {}).get(k, defaults[k])) for k in _DEFAULT_SCOPE}
    token = secrets.token_urlsafe(24)
    token_hash = _hash_token(token)
    expires_at = _now() + timedelta(days=body.expiry_days)
    pw_hash = pin_context.hash(body.password) if body.password else None
    import json
    sid = (await db.execute(text("""
        INSERT INTO tenant.share_sessions
            (tenant_id, owner_user_id, audience, share_reason, recipient, scope, token_hash,
             password_hash, view_only, one_time, expires_at)
        VALUES (cast(:t AS uuid), cast(:u AS uuid), :aud, :reason, :rcpt, cast(:scope AS jsonb), :th,
                :pw, :vo, :ot, :exp)
        RETURNING session_id
    """), {"t": str(user["tenant_id"]), "u": str(user["user_id"]), "aud": audience,
           "reason": body.share_reason, "rcpt": body.recipient, "scope": json.dumps(scope),
           "th": token_hash, "pw": pw_hash, "vo": body.view_only, "ot": body.one_time,
           "exp": expires_at})).scalar()
    return success_envelope({
        "session_id": str(sid), "token": token,
        "url": f"https://teivaka.com/s/{token}",
        "expires_at": expires_at.isoformat(), "audience": audience,
        "password_protected": bool(pw_hash), "one_time": body.one_time,
    })


@router.get("/shares")
async def list_shares(db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    rows = (await db.execute(text("""
        SELECT s.session_id, s.audience, s.share_reason, s.recipient, s.expires_at, s.revoked_at,
               s.one_time, s.used_at, s.created_at, (s.password_hash IS NOT NULL) AS password_protected,
               (SELECT COUNT(*) FROM tenant.share_session_access a WHERE a.session_id = s.session_id) AS views,
               (SELECT MAX(accessed_at) FROM tenant.share_session_access a WHERE a.session_id = s.session_id) AS last_viewed
        FROM tenant.share_sessions s
        ORDER BY s.created_at DESC LIMIT 100
    """))).mappings().all()
    now = _now()
    out = []
    for r in rows:
        d = dict(r)
        d["session_id"] = str(d["session_id"])
        for k in ("expires_at", "revoked_at", "used_at", "created_at", "last_viewed"):
            d[k] = d[k].isoformat() if d[k] else None
        d["status"] = ("revoked" if r["revoked_at"] else
                       "expired" if (r["expires_at"] and r["expires_at"] < now) else
                       "used" if (r["one_time"] and r["used_at"]) else "active")
        out.append(d)
    return success_envelope({"shares": out})


@router.post("/shares/{session_id}/revoke")
async def revoke_share(session_id: str, db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    res = await db.execute(text(
        "UPDATE tenant.share_sessions SET revoked_at=now() WHERE session_id=cast(:s AS uuid) AND revoked_at IS NULL"),
        {"s": session_id})
    if res.rowcount == 0:
        raise HTTPException(404, detail="Share not found or already revoked")
    return success_envelope({"session_id": session_id, "revoked": True})


# ───────────────────────── public resolve ─────────────────────────
def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    return xff.split(",")[0].strip() if xff else (request.client.host if request.client else "unknown")


async def _assemble_scoped(db: AsyncSession, tenant_id: str, scope: dict) -> dict:
    """Read the scoped passport view under app.tenant_id (set by the caller)."""
    data: dict = {}
    if scope.get("identity"):
        u = (await db.execute(text(
            "SELECT full_name, avatar_url, created_at FROM tenant.users ORDER BY created_at LIMIT 1"))).mappings().first() or {}
        p = (await db.execute(text(
            "SELECT preferred_name, bio, professional_photo_url FROM tenant.passport_profile LIMIT 1"))).mappings().first() or {}
        f = (await db.execute(text(
            "SELECT farm_id FROM tenant.farms WHERE is_active=TRUE ORDER BY created_at LIMIT 1"))).scalar()
        data["identity"] = {
            "name": p.get("preferred_name") or u.get("full_name") or "Farmer",
            "bio": p.get("bio"), "farmer_id": f,
            "photo_url": p.get("professional_photo_url") or u.get("avatar_url"),
            "member_since": u["created_at"].date().isoformat() if u.get("created_at") else None,
        }
    if scope.get("reputation"):
        seasons = (await db.execute(text("SELECT COUNT(*) FROM tenant.production_cycles WHERE cycle_status='CLOSED'"))).scalar() or 0
        hk = (await db.execute(text("SELECT COALESCE(SUM(gross_yield_kg),0) AS kg FROM tenant.harvest_log"))).scalar() or 0
        sales = (await db.execute(text("SELECT COALESCE(SUM(amount_fjd),0) AS f, COUNT(*) AS n FROM tenant.cash_ledger WHERE transaction_type='INCOME'"))).mappings().first() or {}
        data["reputation"] = {"seasons": int(seasons), "production_kg": round(float(hk), 1),
                              "sales_fjd": round(float(sales.get("f") or 0), 2), "sales_n": int(sales.get("n") or 0)}
    if scope.get("trust"):
        snaps = (await db.execute(text(
            "SELECT dimension, score, band, why FROM tenant.trust_snapshots"))).mappings().all()
        overall = next((s for s in snaps if s["dimension"] == "__overall__"), None)
        data["trust"] = {
            "overall_score": overall["score"] if overall else None,
            "overall_band": overall["band"] if overall else "Building",
            "dimensions": [{"key": s["dimension"], "score": s["score"], "band": s["band"], "why": s["why"]}
                           for s in snaps if s["dimension"] != "__overall__"],
        }
    if scope.get("farm"):
        farms = (await db.execute(text(
            "SELECT farm_name, location_island, land_tenure FROM tenant.farms WHERE is_active=TRUE ORDER BY created_at"))).mappings().all()
        data["farms"] = [{"name": f["farm_name"], "location": f["location_island"],
                          "tenure": f["land_tenure"]} for f in farms]
        # Farm profile (always-on with farm scope): what's grown, the farming types,
        # the 3-Layer mix, and total land — shared helper so owner + share never drift.
        from app.services.farm_profile import gather_farm_profile
        data["profile"] = await gather_farm_profile(db)
    if scope.get("evidence"):
        # Photo + block evidence — opt-in, permission-gated (only because this share grants it).
        blocks = (await db.execute(text("""
            SELECT pu.pu_name, COALESCE(pu.area_sqm, 0) AS area_sqm,
                   (SELECT count(*) FROM tenant.production_cycles pc WHERE pc.pu_id = pu.pu_id
                      AND pc.cycle_status IN ('ACTIVE','HARVESTING','CLOSING')) AS active_cycles
            FROM tenant.production_units pu WHERE pu.is_active = TRUE ORDER BY pu.pu_name
        """))).mappings().all()
        photos = (await db.execute(text("""
            SELECT event_type, event_date::date AS d, pu_id, photo_url, photo_sha256
            FROM tenant.field_events WHERE photo_url IS NOT NULL AND deleted_at IS NULL
            ORDER BY event_date DESC LIMIT 60
        """))).mappings().all()
        data["evidence"] = {
            "blocks": [{"pu_name": b["pu_name"], "area_ha": round(float(b["area_sqm"] or 0) / 10000.0, 2),
                        "active_cycles": int(b["active_cycles"])} for b in blocks],
            "photos": [{"event": str(p["event_type"]).replace("_", " ").title(),
                        "date": p["d"].isoformat() if p["d"] else None,
                        "photo_url": p["photo_url"], "sha256": p["photo_sha256"]} for p in photos],
        }
    if scope.get("documents"):
        # Document METADATA only (title/type/dates/hash + verification) — never a file URL
        # over a share (raw legal files stay behind the owner-gated route).
        docs = (await db.execute(text("""
            SELECT doc_type, title, issued_date, expiry_date, verification_status, sha256
            FROM tenant.documents WHERE deleted_at IS NULL ORDER BY uploaded_at DESC LIMIT 50
        """))).mappings().all()
        data["documents"] = [{"doc_type": d["doc_type"], "title": d["title"],
                              "issued_date": d["issued_date"].isoformat() if d["issued_date"] else None,
                              "expiry_date": d["expiry_date"].isoformat() if d["expiry_date"] else None,
                              "verification_status": d["verification_status"],
                              "sha256": (d["sha256"] or "")[:12]} for d in docs]
    return data


@html_router.get("/s/{token}", response_class=HTMLResponse)
async def resolve_share(token: str, request: Request, pw: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    """Public token-gated portal. Validates token → sets tenant context → renders the scoped view."""
    def page(**ctx):
        ctx.setdefault("request", request)
        return templates.TemplateResponse("share_portal.html", ctx)

    th = _hash_token(token.strip())
    row = (await db.execute(text("""
        SELECT * FROM audit.resolve_share(:th)
    """), {"th": th})).mappings().first()
    if not row:
        return page(state="invalid", message="This link is not valid.")
    if row["revoked_at"]:
        return page(state="revoked", message="The farmer has revoked this link.")
    if row["expires_at"] and row["expires_at"] < _now():
        return page(state="expired", message="This link has expired.")
    if row["one_time"] and row["used_at"]:
        return page(state="used", message="This one-time link has already been opened.")
    if row["password_hash"]:
        if not pw:
            return page(state="password", token=token)
        if not pin_context.verify(pw, row["password_hash"]):
            return page(state="password", token=token, message="Incorrect password.")

    tenant_id = str(row["tenant_id"])
    # From here, operate under the share owner's tenant (txn-local — cleared when the session closes).
    await db.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": tenant_id})
    scope = row["scope"] or {}
    view = await _assemble_scoped(db, tenant_id, scope)
    # log + one-time burn (RLS now satisfied for this tenant)
    await db.execute(text(
        "INSERT INTO tenant.share_session_access (session_id, tenant_id, ip) VALUES (:s, cast(:t AS uuid), :ip)"),
        {"s": str(row["session_id"]), "t": tenant_id, "ip": _client_ip(request)})
    if row["one_time"]:
        await db.execute(text(
            "UPDATE tenant.share_sessions SET used_at=now() WHERE session_id=:s AND used_at IS NULL"),
            {"s": str(row["session_id"])})
    await db.commit()

    return page(state="ok", view=view, audience=row["audience"], reason=row["share_reason"],
                view_only=row["view_only"], token=token)


@html_router.get("/s/{token}/qr.png")
async def share_qr(token: str):
    """Public QR PNG of the share link — so a farmer can print/show it for an in-person
    loan or buyer meeting (DB-free; just encodes the URL the holder already has)."""
    from fastapi.responses import Response
    from app.routers.poultry_bank_evidence import generate_qr_image
    buf = generate_qr_image(f"https://teivaka.com/s/{token}")
    return Response(content=buf.getvalue(), media_type="image/png",
                    headers={"Cache-Control": "public, max-age=86400"})
