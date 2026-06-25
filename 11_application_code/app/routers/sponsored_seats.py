"""Sponsored Farmer Seats (Product 5) — mounted at /api/v1.

An org (bank/ministry/NGO) sponsors farmer seats; each seat is a redemption code
a farmer enters to receive the funded farmer plan free. Distribution = farmers,
monetization = the sponsor.

Admin:
  POST   /admin/sponsored-seats/orgs                 create sponsoring org
  GET    /admin/sponsored-seats/orgs                 list orgs + seat counts
  PATCH  /admin/sponsored-seats/orgs/{id}            update org fields/status
  POST   /admin/sponsored-seats/orgs/{id}/issue      mint N seat codes
  GET    /admin/sponsored-seats/orgs/{id}/seats      list seats (codes + state)
  GET    /admin/sponsored-seats/orgs/{id}/impact     impact summary
  POST   /admin/sponsored-seats/seats/{id}/revoke    revoke (restores farmer tier)

Farmer:
  POST   /sponsored-seats/redeem                      redeem a code → funded plan
  GET    /sponsored-seats/mine                        current sponsor (if any)

community.* is cross-tenant with no RLS; tenant.tenants is permissive-RLS so the
tier flip mirrors the admin tier-approve path.
"""
import logging
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from pydantic import BaseModel

from app.db.session import get_rls_db, get_db_ctx
from app.middleware.rls import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

_ADMIN = {"ADMIN", "FOUNDER"}
# Unambiguous alphabet (no O/0/I/1/L).
_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
# Default daily TIS allowance per farmer plan if the plans table is absent.
_FALLBACK_DAILY = {"FREE": 5, "BASIC": 50, "PROFESSIONAL": 500}


def _gen_code() -> str:
    return "TVK-" + "".join(secrets.choice(_ALPHABET) for _ in range(8))


def _require_admin(user: dict):
    if user.get("role") not in _ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")


async def _granted_daily_limit(db, tier: str) -> int:
    """Daily TIS allowance the granted plan should give the farmer."""
    try:
        has = (await db.execute(text(
            "SELECT to_regclass('community.subscription_plans') IS NOT NULL"))).scalar()
        if has:
            row = (await db.execute(text(
                "SELECT tis_daily_limit FROM community.subscription_plans WHERE tier = :t"),
                {"t": tier})).scalar()
            if row is not None:
                return int(row)
    except Exception:  # noqa: BLE001
        pass
    return _FALLBACK_DAILY.get(tier, 5)


# ── Admin: organisations ─────────────────────────────────────────────────────
class OrgIn(BaseModel):
    name: str
    kind: str = "NGO"
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    granted_tier: str = "BASIC"
    price_per_seat_fjd: float = 10
    notes: Optional[str] = None


@router.post("/admin/sponsored-seats/orgs")
async def create_org(body: OrgIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Organisation name is required")
    org_id = "SPON-" + secrets.token_hex(3).upper()
    async with get_db_ctx() as db:
        await db.execute(text("""
            INSERT INTO community.sponsor_orgs
                (id, name, kind, contact_name, contact_email, granted_tier,
                 price_per_seat_fjd, notes, created_by)
            VALUES (:id, :name, :kind, :cn, :ce, :gt, :pps, :notes, cast(:by AS uuid))
        """), {
            "id": org_id, "name": body.name.strip(), "kind": body.kind.upper(),
            "cn": body.contact_name, "ce": body.contact_email,
            "gt": body.granted_tier.upper(), "pps": body.price_per_seat_fjd,
            "notes": body.notes, "by": str(user["user_id"]),
        })
        await db.commit()
    return {"data": {"id": org_id}}


@router.get("/admin/sponsored-seats/orgs")
async def list_orgs(user: dict = Depends(get_current_user)):
    _require_admin(user)
    async with get_db_ctx() as db:
        if not (await db.execute(text(
                "SELECT to_regclass('community.sponsor_orgs') IS NOT NULL"))).scalar():
            return {"data": []}
        rows = (await db.execute(text("""
            SELECT o.*,
                   COUNT(s.id)                                              AS seats_issued,
                   COUNT(s.id) FILTER (WHERE s.status='REDEEMED')           AS seats_redeemed,
                   COUNT(s.id) FILTER (WHERE s.status='AVAILABLE')          AS seats_available,
                   COUNT(s.id) FILTER (WHERE s.status='REVOKED')            AS seats_revoked
            FROM community.sponsor_orgs o
            LEFT JOIN community.sponsored_seats s ON s.sponsor_org_id = o.id
            GROUP BY o.id
            ORDER BY o.created_at DESC
        """))).mappings().all()
    return {"data": [dict(r) for r in rows]}


class OrgPatch(BaseModel):
    name: Optional[str] = None
    kind: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    granted_tier: Optional[str] = None
    price_per_seat_fjd: Optional[float] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    portal_enabled: Optional[bool] = None


@router.patch("/admin/sponsored-seats/orgs/{org_id}")
async def update_org(org_id: str, body: OrgPatch, user: dict = Depends(get_current_user)):
    _require_admin(user)
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if not fields:
        return {"data": {"id": org_id, "updated": False}}
    sets, params = [], {"id": org_id}
    for k, v in fields.items():
        params[k] = v.upper() if k in ("kind", "granted_tier", "status") and isinstance(v, str) else v
        sets.append(f"{k} = :{k}")
    async with get_db_ctx() as db:
        res = await db.execute(text(
            f"UPDATE community.sponsor_orgs SET {', '.join(sets)} WHERE id = :id"), params)
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Organisation not found")
        await db.commit()
    return {"data": {"id": org_id, "updated": True}}


@router.post("/admin/sponsored-seats/orgs/{org_id}/rotate-portal")
async def rotate_portal(org_id: str, user: dict = Depends(get_current_user)):
    """Issue a fresh portal token (invalidates the old public link)."""
    _require_admin(user)
    async with get_db_ctx() as db:
        tok = (await db.execute(text(
            "UPDATE community.sponsor_orgs "
            "SET portal_token = replace(gen_random_uuid()::text, '-', '') "
            "WHERE id = :id RETURNING portal_token"), {"id": org_id})).scalar()
        if not tok:
            raise HTTPException(status_code=404, detail="Organisation not found")
        await db.commit()
    return {"data": {"id": org_id, "portal_token": tok}}


# ── Admin: seat issuance ─────────────────────────────────────────────────────
class IssueIn(BaseModel):
    count: int = 1


@router.post("/admin/sponsored-seats/orgs/{org_id}/issue")
async def issue_seats(org_id: str, body: IssueIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    count = max(1, min(int(body.count or 1), 5000))
    codes: list[str] = []
    async with get_db_ctx() as db:
        if not (await db.execute(text(
                "SELECT 1 FROM community.sponsor_orgs WHERE id = :id"), {"id": org_id})).scalar():
            raise HTTPException(status_code=404, detail="Organisation not found")
        for _ in range(count):
            # Retry on the (rare) unique-code collision.
            for _attempt in range(5):
                code = _gen_code()
                got = (await db.execute(text("""
                    INSERT INTO community.sponsored_seats (sponsor_org_id, code, created_by)
                    VALUES (:org, :code, cast(:by AS uuid))
                    ON CONFLICT (code) DO NOTHING
                    RETURNING code
                """), {"org": org_id, "code": code, "by": str(user["user_id"])})).scalar()
                if got:
                    codes.append(got)
                    break
        await db.commit()
    return {"data": {"org_id": org_id, "issued": len(codes), "codes": codes}}


@router.get("/admin/sponsored-seats/orgs/{org_id}/seats")
async def list_seats(org_id: str, user: dict = Depends(get_current_user)):
    _require_admin(user)
    async with get_db_ctx() as db:
        rows = (await db.execute(text("""
            SELECT id, code, status, redeemed_by_tenant_id, redeemed_farmer_name,
                   redeemed_farm_label, redeemed_at, created_at
            FROM community.sponsored_seats
            WHERE sponsor_org_id = :org
            ORDER BY created_at, id
        """), {"org": org_id})).mappings().all()
    return {"data": [dict(r) for r in rows]}


async def _build_impact(db, org) -> dict:
    """Impact payload for an org row (shared by admin view + public portal)."""
    counts = (await db.execute(text("""
        SELECT COUNT(*)                                       AS issued,
               COUNT(*) FILTER (WHERE status='REDEEMED')      AS redeemed,
               COUNT(*) FILTER (WHERE status='AVAILABLE')     AS available,
               COUNT(*) FILTER (WHERE status='REVOKED')       AS revoked
        FROM community.sponsored_seats WHERE sponsor_org_id = :org
    """), {"org": org["id"]})).mappings().first()
    farmers = (await db.execute(text("""
        SELECT redeemed_farmer_name, redeemed_farm_label, redeemed_at
        FROM community.sponsored_seats
        WHERE sponsor_org_id = :org AND status = 'REDEEMED'
        ORDER BY redeemed_at DESC
    """), {"org": org["id"]})).mappings().all()
    redeemed = counts["redeemed"] or 0
    monthly = float(org["price_per_seat_fjd"] or 0) * redeemed
    return {
        "org": dict(org),
        "counts": dict(counts),
        "monthly_value_fjd": round(monthly, 2),
        "annual_value_fjd": round(monthly * 12, 2),
        "redeemed_farmers": [dict(f) for f in farmers],
    }


@router.get("/admin/sponsored-seats/orgs/{org_id}/impact")
async def org_impact(org_id: str, user: dict = Depends(get_current_user)):
    _require_admin(user)
    async with get_db_ctx() as db:
        org = (await db.execute(text(
            "SELECT id, name, kind, granted_tier, price_per_seat_fjd, status "
            "FROM community.sponsor_orgs WHERE id = :id"), {"id": org_id})).mappings().first()
        if not org:
            raise HTTPException(status_code=404, detail="Organisation not found")
        return {"data": await _build_impact(db, org)}


@router.get("/sponsor-portal/{token}")
async def sponsor_portal(token: str):
    """PUBLIC, read-only impact dashboard for one sponsor — reached by an
    unguessable, rotatable token (no account). Allowlisted in auth middleware."""
    token = (token or "").strip()
    if not token:
        raise HTTPException(status_code=404, detail="Not found")
    async with get_db_ctx() as db:
        if not (await db.execute(text(
                "SELECT to_regclass('community.sponsor_orgs') IS NOT NULL"))).scalar():
            raise HTTPException(status_code=404, detail="Not found")
        org = (await db.execute(text(
            "SELECT id, name, kind, granted_tier, price_per_seat_fjd, status, portal_enabled "
            "FROM community.sponsor_orgs WHERE portal_token = :t"), {"t": token})).mappings().first()
        if not org or not org["portal_enabled"]:
            raise HTTPException(status_code=404, detail="This sponsor link is not active")
        data = await _build_impact(db, org)
    # Privacy-safe public view: aggregate only — never expose farmer identities
    # over the tokenized public URL. Keep an anonymous activation timeline (dates
    # only) so the sponsor still sees momentum. Admin view keeps full names.
    data["redeemed_farmers"] = [
        {"redeemed_at": f.get("redeemed_at")} for f in data.get("redeemed_farmers", [])
    ]
    # Drop internal fields from the payload.
    data["org"].pop("id", None)
    data["org"].pop("portal_enabled", None)
    return {"data": data}


@router.post("/admin/sponsored-seats/seats/{seat_id}/revoke")
async def revoke_seat(seat_id: int, user: dict = Depends(get_current_user)):
    _require_admin(user)
    async with get_db_ctx() as db:
        seat = (await db.execute(text(
            "SELECT id, status, redeemed_by_tenant_id, prev_tier, prev_tis_daily_limit "
            "FROM community.sponsored_seats WHERE id = :id"), {"id": seat_id})).mappings().first()
        if not seat:
            raise HTTPException(status_code=404, detail="Seat not found")
        # Restore the farmer's prior tier if this seat had been redeemed.
        if seat["status"] == "REDEEMED" and seat["redeemed_by_tenant_id"]:
            prev_tier = seat["prev_tier"] or "FREE"
            prev_limit = seat["prev_tis_daily_limit"]
            if prev_limit is None:
                prev_limit = await _granted_daily_limit(db, prev_tier)
            res = await db.execute(text(
                "UPDATE tenant.tenants SET subscription_tier = :t, tis_daily_limit = :l "
                "WHERE tenant_id = :tid"),
                {"t": prev_tier, "l": prev_limit, "tid": str(seat["redeemed_by_tenant_id"])})
            if res.rowcount == 0:
                raise HTTPException(status_code=500,
                                    detail="Seat revoke blocked: tenant tier restore did not apply — investigate")
        await db.execute(text(
            "UPDATE community.sponsored_seats SET status = 'REVOKED' WHERE id = :id"),
            {"id": seat_id})
        await db.commit()
    return {"data": {"id": seat_id, "revoked": True}}


# ── Farmer: redeem + current sponsor ─────────────────────────────────────────
class RedeemIn(BaseModel):
    code: str


@router.post("/sponsored-seats/redeem")
async def redeem(body: RedeemIn, user: dict = Depends(get_current_user)):
    code = (body.code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Enter a sponsor code")
    tenant_id = str(user["tenant_id"])

    # 0) Resolve the seat + org (and validate redeemability) on the global tables.
    async with get_db_ctx() as db:
        if not (await db.execute(text(
                "SELECT to_regclass('community.sponsored_seats') IS NOT NULL"))).scalar():
            raise HTTPException(status_code=400, detail="Sponsored seats are not available")
        seat = (await db.execute(text("""
            SELECT s.id, s.status, o.id AS org_id, o.name AS org_name,
                   o.granted_tier, o.status AS org_status
            FROM community.sponsored_seats s
            JOIN community.sponsor_orgs o ON o.id = s.sponsor_org_id
            WHERE s.code = :c
        """), {"c": code})).mappings().first()
        if not seat:
            raise HTTPException(status_code=404, detail="Invalid sponsor code")
        if seat["status"] != "AVAILABLE":
            raise HTTPException(status_code=409, detail="This code has already been used")
        if seat["org_status"] != "ACTIVE":
            raise HTTPException(status_code=409, detail="This sponsor programme is not active")
        granted = (seat["granted_tier"] or "BASIC").upper()
        granted_limit = await _granted_daily_limit(db, granted)

    # 1) Snapshot the farmer + prior tier under their own RLS context.
    async with get_rls_db(tenant_id) as tdb:
        info = (await tdb.execute(text("""
            SELECT u.full_name, t.company_name, t.subscription_tier, t.tis_daily_limit
            FROM tenant.users u
            JOIN tenant.tenants t ON t.tenant_id = u.tenant_id
            WHERE u.user_id = :uid
        """), {"uid": str(user["user_id"])})).mappings().first()
    farmer_name = (info or {}).get("full_name")
    farm_label = (info or {}).get("company_name")
    prev_tier = (info or {}).get("subscription_tier") or "FREE"
    prev_limit = (info or {}).get("tis_daily_limit")

    # 2) Atomically claim the seat (guards against a double redeem).
    async with get_db_ctx() as db:
        claimed = (await db.execute(text("""
            UPDATE community.sponsored_seats SET
                status = 'REDEEMED',
                redeemed_by_tenant_id = cast(:tid AS uuid),
                redeemed_by_user_id   = cast(:uid AS uuid),
                redeemed_farmer_name  = :fname,
                redeemed_farm_label   = :flabel,
                redeemed_at           = now(),
                prev_tier             = :ptier,
                prev_tis_daily_limit  = :plimit
            WHERE id = :sid AND status = 'AVAILABLE'
            RETURNING id
        """), {
            "tid": tenant_id, "uid": str(user["user_id"]),
            "fname": farmer_name, "flabel": farm_label,
            "ptier": prev_tier, "plimit": prev_limit, "sid": seat["id"],
        })).scalar()
        if not claimed:
            raise HTTPException(status_code=409, detail="This code has already been used")
        await db.commit()

    # 3) Flip the farmer's tenant to the funded plan (own RLS context, auto-commit).
    async with get_rls_db(tenant_id) as tdb:
        await tdb.execute(text(
            "UPDATE tenant.tenants SET subscription_tier = :t, tis_daily_limit = :l "
            "WHERE tenant_id = :tid"),
            {"t": granted, "l": granted_limit, "tid": tenant_id})

    logger.info("sponsored seat %s redeemed by tenant %s → %s (sponsor %s)",
                seat["id"], tenant_id, granted, seat["org_id"])
    return {"data": {
        "redeemed": True, "granted_tier": granted,
        "sponsor_name": seat["org_name"],
    }}


@router.get("/sponsored-seats/mine")
async def my_sponsor(user: dict = Depends(get_current_user)):
    """The current tenant's active sponsorship, if any (for /me/subscription)."""
    async with get_db_ctx() as db:
        if not (await db.execute(text(
                "SELECT to_regclass('community.sponsored_seats') IS NOT NULL"))).scalar():
            return {"data": None}
        row = (await db.execute(text("""
            SELECT s.redeemed_at, s.code, o.name AS sponsor_name, o.kind, o.granted_tier
            FROM community.sponsored_seats s
            JOIN community.sponsor_orgs o ON o.id = s.sponsor_org_id
            WHERE s.redeemed_by_tenant_id = cast(:tid AS uuid) AND s.status = 'REDEEMED'
            ORDER BY s.redeemed_at DESC LIMIT 1
        """), {"tid": str(user["tenant_id"])})).mappings().first()
    return {"data": dict(row) if row else None}
