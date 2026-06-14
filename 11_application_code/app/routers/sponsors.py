"""Sponsor Corner — sponsored placements on Home (mounted at /api/v1/community).

  GET    /sponsors                      active, country-targeted, rotated (auth)
  POST   /sponsors/{id}/click           track a click → returns the cta_url
  POST   /sponsors/inquiry              "become a sponsor" lead → attribution_event
  GET    /admin/sponsors                list all (admin)
  POST   /admin/sponsors                create (admin)
  PATCH  /admin/sponsors/{id}           update fields / status (admin)
  DELETE /admin/sponsors/{id}           delete (admin)

Placements are clearly labelled "Sponsored" in the UI. impressions/clicks are
tracked so the placement can be billed later (Power-thousands tier). community.*
is cross-tenant, no RLS. Inviolable #7: shared.attribution_events is one of the
two runtime-writable shared tables.
"""
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from pydantic import BaseModel

from app.db.session import get_rls_db
from app.middleware.rls import get_current_user, require_admin

logger = logging.getLogger(__name__)
router = APIRouter()

_FIELDS = ["sponsor_name", "sponsor_logo", "title", "blurb", "image_url", "cta_label",
           "cta_url", "placement_type", "priority", "target_country", "target_vertical",
           "target_account_type", "starts_at", "ends_at", "status"]


class SponsorIn(BaseModel):
    sponsor_name: str
    title: str
    sponsor_logo: str | None = None
    blurb: str | None = None
    image_url: str | None = None
    cta_label: str | None = None
    cta_url: str | None = None
    placement_type: str | None = "STANDARD"
    priority: int | None = 0
    target_country: str | None = None
    target_vertical: str | None = None
    target_account_type: str | None = None
    starts_at: str | None = None
    ends_at: str | None = None
    status: str | None = "ACTIVE"


class SponsorPatch(BaseModel):
    sponsor_name: str | None = None
    sponsor_logo: str | None = None
    title: str | None = None
    blurb: str | None = None
    image_url: str | None = None
    cta_label: str | None = None
    cta_url: str | None = None
    priority: int | None = None
    target_country: str | None = None
    target_vertical: str | None = None
    starts_at: str | None = None
    ends_at: str | None = None
    status: str | None = None


class InquiryIn(BaseModel):
    organisation: str | None = None
    email: str | None = None
    note: str | None = None


class AdIn(BaseModel):
    """Self-serve ad created by a profile owner."""
    title: str
    sponsor_name: str | None = None     # defaults to the owner's name
    sponsor_logo: str | None = None
    blurb: str | None = None
    image_url: str | None = None
    cta_label: str | None = None
    cta_url: str | None = None
    surface: str | None = "HOME_RAIL"
    billing_period: str = "WEEKLY"      # DAILY | WEEKLY | MONTHLY
    target_country: str | None = None
    target_vertical: str | None = None
    target_account_type: str | None = None   # general-category key; NULL = everyone
    starts_at: str | None = None


class RejectIn(BaseModel):
    note: str | None = None


class MarkPaidIn(BaseModel):
    payment_ref: str | None = None


class RatePatch(BaseModel):
    price_fjd: float
    active: bool | None = None


_PERIOD_DAYS = {"DAILY": 1, "WEEKLY": 7, "MONTHLY": 30}


def _row(m):
    d = dict(m)
    d["placement_id"] = str(d["placement_id"])
    if d.get("created_by") is not None:
        d["created_by"] = str(d["created_by"])
    return d


@router.get("/sponsors")
async def list_sponsors(limit: int = Query(4, ge=1, le=10), user: dict = Depends(get_current_user)):
    """Active placements for the viewer's country (NULL target = everyone),
    highest priority first, randomised tiebreak. Bumps impressions."""
    from app.core.account_types import category_of, clean_also_categories
    uid = str(user["user_id"])
    async with get_rls_db(str(user["tenant_id"])) as db:
        vrow = (await db.execute(text("SELECT country, account_type, also_account_types FROM tenant.users WHERE user_id = cast(:u AS uuid)"), {"u": uid})).mappings().first()
        vc = vrow["country"] if vrow else None
        # the viewer's category set (primary + 'I also do' tags) for role targeting
        cats = []
        if vrow:
            pc = category_of(vrow["account_type"])
            if pc:
                cats.append(pc)
            for k in clean_also_categories(list(vrow["also_account_types"] or [])):
                if k not in cats:
                    cats.append(k)
        rows = (await db.execute(text("""
            SELECT placement_id, sponsor_name, sponsor_logo, title, blurb, image_url, cta_label, cta_url
            FROM community.sponsor_placements
            WHERE status = 'ACTIVE'
              AND payment_status IN ('PAID','WAIVED')
              AND (paid_through IS NULL OR paid_through >= now())
              AND (starts_at IS NULL OR starts_at <= now())
              AND (ends_at   IS NULL OR ends_at   >= now())
              AND (target_country IS NULL OR target_country = :vc)
              AND (target_account_type IS NULL OR target_account_type = ANY(:cats))
            ORDER BY priority DESC, random()
            LIMIT :lim
        """), {"vc": vc, "cats": cats, "lim": limit})).mappings().all()
        out = [_row(r) for r in rows]
        ids = [r["placement_id"] for r in out]
        if ids:
            await db.execute(text("UPDATE community.sponsor_placements SET impressions = impressions + 1 WHERE placement_id::text = ANY(:ids)"), {"ids": ids})
    return {"data": out}


@router.post("/sponsors/{placement_id}/click")
async def click_sponsor(placement_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        row = (await db.execute(text("""
            UPDATE community.sponsor_placements SET clicks = clicks + 1
            WHERE placement_id = cast(:id AS uuid) AND status = 'ACTIVE'
            RETURNING cta_url
        """), {"id": placement_id})).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Placement not found")
    return {"data": {"url": row["cta_url"]}}


@router.post("/sponsors/inquiry")
async def sponsor_inquiry(body: InquiryIn, user: dict = Depends(get_current_user)):
    """'Become a sponsor' lead — a real attribution_event (Inviolable #7)."""
    props = {"organisation": body.organisation, "email": body.email, "note": body.note,
             "user_id": str(user["user_id"])}
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO shared.attribution_events (event_type, landing_path, properties)
            VALUES ('sponsor_inquiry', '/home', CAST(:p AS jsonb))
        """), {"p": json.dumps(props)})
    return {"data": {"ok": True}}


# ----------------------------------------------------------------------------- rate card (public)
@router.get("/ad-rates")
async def ad_rates(user: dict = Depends(get_current_user)):
    """Active flat-rate prices per surface + duration so the advertiser UI can
    show the live price. Rates are data (admin-configurable), never hardcoded."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        rows = (await db.execute(text(
            "SELECT surface, billing_period, price_fjd FROM community.ad_rates WHERE active = true ORDER BY surface, "
            "CASE billing_period WHEN 'DAILY' THEN 1 WHEN 'WEEKLY' THEN 2 ELSE 3 END"))).mappings().all()
    return {"data": [{"surface": r["surface"], "billing_period": r["billing_period"], "price_fjd": float(r["price_fjd"])} for r in rows]}


# ----------------------------------------------------------------------------- self-serve ads (owner)
@router.get("/me/ads")
async def my_ads(user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    async with get_rls_db(str(user["tenant_id"])) as db:
        rows = (await db.execute(text("""
            SELECT placement_id, title, sponsor_name, sponsor_logo, blurb, image_url, cta_label, cta_url,
                   surface, billing_period, price_fjd, status, payment_status, paid_through,
                   target_country, target_account_type, starts_at, ends_at, impressions, clicks, review_note, created_at
            FROM community.sponsor_placements
            WHERE owner_user_id = cast(:uid AS uuid)
            ORDER BY created_at DESC
        """), {"uid": uid})).mappings().all()
    out = []
    for r in rows:
        d = _row(r)
        if d.get("price_fjd") is not None:
            d["price_fjd"] = float(d["price_fjd"])
        out.append(d)
    return {"data": out}


@router.post("/me/ads")
async def create_my_ad(body: AdIn, user: dict = Depends(get_current_user)):
    """Create a self-serve ad → PENDING_REVIEW, UNPAID. Price is resolved
    server-side from ad_rates (never trust the client). Never serves until an
    admin approves AND marks it paid (Step 2 activation gate)."""
    uid = str(user["user_id"])
    period = (body.billing_period or "WEEKLY").upper()
    if period not in _PERIOD_DAYS:
        raise HTTPException(status_code=422, detail="billing_period must be DAILY, WEEKLY or MONTHLY")
    if not (body.title and body.title.strip()):
        raise HTTPException(status_code=422, detail="Title is required")
    surface = (body.surface or "HOME_RAIL").upper()
    cta = (body.cta_url or "").strip() or None
    if cta and not (cta.startswith("http://") or cta.startswith("https://")):
        raise HTTPException(status_code=422, detail="CTA URL must start with http:// or https://")
    async with get_rls_db(str(user["tenant_id"])) as db:
        price = (await db.execute(text(
            "SELECT price_fjd FROM community.ad_rates WHERE surface = :s AND billing_period = :p AND active = true"),
            {"s": surface, "p": period})).scalar()
        if price is None:
            raise HTTPException(status_code=400, detail="No active rate for that surface/duration")
        name = (body.sponsor_name or user.get("full_name") or "Sponsor").strip()
        from app.core.account_types import CATEGORY_KEYS
        target_role = (body.target_account_type or "").upper().strip() or None
        if target_role and target_role not in CATEGORY_KEYS:
            target_role = None
        row = (await db.execute(text("""
            INSERT INTO community.sponsor_placements
                (owner_user_id, sponsor_name, sponsor_logo, title, blurb, image_url, cta_label, cta_url,
                 surface, billing_period, price_fjd, target_country, target_vertical, target_account_type, starts_at,
                 status, payment_status, placement_type, priority)
            VALUES (cast(:uid AS uuid), :name, :logo, :title, :blurb, :image, :clabel, :curl,
                 :surface, :period, :price, :country, :vertical, :trole, :starts,
                 'PENDING_REVIEW', 'UNPAID', 'SELF_SERVE', 0)
            RETURNING placement_id
        """), {"uid": uid, "name": name, "logo": body.sponsor_logo, "title": body.title.strip(),
               "blurb": body.blurb, "image": body.image_url, "clabel": body.cta_label, "curl": cta,
               "surface": surface, "period": period, "price": price,
               "country": body.target_country, "vertical": body.target_vertical, "trole": target_role, "starts": body.starts_at})).mappings().first()
    return {"data": {"placement_id": str(row["placement_id"]), "price_fjd": float(price), "status": "PENDING_REVIEW"}}


async def _owned(db, placement_id: str, uid: str):
    row = (await db.execute(text(
        "SELECT status FROM community.sponsor_placements WHERE placement_id = cast(:id AS uuid) AND owner_user_id = cast(:uid AS uuid)"),
        {"id": placement_id, "uid": uid})).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Ad not found")
    return row


@router.post("/me/ads/{placement_id}/pause")
async def pause_my_ad(placement_id: str, user: dict = Depends(get_current_user)):
    """Owner pauses their own running ad (stops serving immediately)."""
    uid = str(user["user_id"])
    async with get_rls_db(str(user["tenant_id"])) as db:
        r = await _owned(db, placement_id, uid)
        if r["status"] != "ACTIVE":
            raise HTTPException(status_code=409, detail="Only a live ad can be paused")
        await db.execute(text("UPDATE community.sponsor_placements SET status = 'PAUSED' WHERE placement_id = cast(:id AS uuid)"), {"id": placement_id})
    return {"data": {"ok": True, "status": "PAUSED"}}


@router.post("/me/ads/{placement_id}/resume")
async def resume_my_ad(placement_id: str, user: dict = Depends(get_current_user)):
    """Owner resumes a paused ad — only while it's still paid (within paid_through)."""
    uid = str(user["user_id"])
    async with get_rls_db(str(user["tenant_id"])) as db:
        row = (await db.execute(text(
            "SELECT status, payment_status, paid_through FROM community.sponsor_placements WHERE placement_id = cast(:id AS uuid) AND owner_user_id = cast(:uid AS uuid)"),
            {"id": placement_id, "uid": uid})).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Ad not found")
        if row["status"] != "PAUSED":
            raise HTTPException(status_code=409, detail="Only a paused ad can be resumed")
        res = await db.execute(text("""
            UPDATE community.sponsor_placements SET status = 'ACTIVE'
            WHERE placement_id = cast(:id AS uuid)
              AND payment_status IN ('PAID','WAIVED')
              AND (paid_through IS NULL OR paid_through >= now())
        """), {"id": placement_id})
        if not res.rowcount:
            raise HTTPException(status_code=409, detail="This ad's paid period has ended — use Extend to run it again")
    return {"data": {"ok": True, "status": "ACTIVE"}}


@router.post("/me/ads/{placement_id}/extend")
async def extend_my_ad(placement_id: str, user: dict = Depends(get_current_user)):
    """Owner re-runs an ENDED/PAUSED ad for another paid period → back into the
    payment queue. (A LIVE ad is left running — extend it once it ends.) On admin
    mark-paid the new period stacks onto paid_through (GREATEST logic)."""
    uid = str(user["user_id"])
    async with get_rls_db(str(user["tenant_id"])) as db:
        r = await _owned(db, placement_id, uid)
        if r["status"] not in ("PAUSED", "ENDED"):
            raise HTTPException(status_code=409, detail="Extend applies to an ended or paused ad. A live ad is already running — Pause it or wait until it ends.")
        await db.execute(text("UPDATE community.sponsor_placements SET status = 'PENDING_PAYMENT', payment_status = 'UNPAID' WHERE placement_id = cast(:id AS uuid)"), {"id": placement_id})
    return {"data": {"ok": True, "status": "PENDING_PAYMENT"}}


# ----------------------------------------------------------------------------- admin
@router.get("/admin/sponsors")
async def admin_list_sponsors(admin: dict = Depends(require_admin())):
    async with get_rls_db(str(admin["tenant_id"])) as db:
        rows = (await db.execute(text("""
            SELECT placement_id, owner_user_id, sponsor_name, sponsor_logo, title, blurb, image_url, cta_label, cta_url,
                   placement_type, priority, target_country, target_vertical, starts_at, ends_at,
                   surface, billing_period, price_fjd, payment_status, paid_through, payment_ref, review_note,
                   status, impressions, clicks, created_at
            FROM community.sponsor_placements
            ORDER BY (status = 'PENDING_REVIEW') DESC, status, priority DESC, created_at DESC
        """))).mappings().all()
    out = []
    for r in rows:
        d = _row(r)
        if d.get("price_fjd") is not None:
            d["price_fjd"] = float(d["price_fjd"])
        out.append(d)
    return {"data": out}


@router.post("/admin/sponsors/{placement_id}/approve")
async def admin_approve(placement_id: str, admin: dict = Depends(require_admin())):
    """Approve a self-serve ad → PENDING_PAYMENT (awaiting payment)."""
    async with get_rls_db(str(admin["tenant_id"])) as db:
        res = await db.execute(text("""
            UPDATE community.sponsor_placements SET status = 'PENDING_PAYMENT', review_note = NULL
            WHERE placement_id = cast(:id AS uuid) AND status IN ('PENDING_REVIEW','REJECTED')
        """), {"id": placement_id})
        if not res.rowcount:
            raise HTTPException(status_code=404, detail="Not found or not awaiting review")
    return {"data": {"ok": True, "status": "PENDING_PAYMENT"}}


@router.post("/admin/sponsors/{placement_id}/reject")
async def admin_reject(placement_id: str, body: RejectIn, admin: dict = Depends(require_admin())):
    async with get_rls_db(str(admin["tenant_id"])) as db:
        res = await db.execute(text("""
            UPDATE community.sponsor_placements SET status = 'REJECTED', review_note = :note
            WHERE placement_id = cast(:id AS uuid)
        """), {"id": placement_id, "note": (body.note or "").strip() or None})
        if not res.rowcount:
            raise HTTPException(status_code=404, detail="Not found")
    return {"data": {"ok": True, "status": "REJECTED"}}


@router.post("/admin/sponsors/{placement_id}/mark-paid")
async def admin_mark_paid(placement_id: str, body: MarkPaidIn, admin: dict = Depends(require_admin())):
    """Interim payment confirmation (admin/invoice/M-PAiSA ref). Sets PAID,
    computes paid_through from the billing period, and activates. A real payment
    rail later calls the same transition — no rework."""
    async with get_rls_db(str(admin["tenant_id"])) as db:
        row = (await db.execute(text(
            "SELECT billing_period, starts_at FROM community.sponsor_placements WHERE placement_id = cast(:id AS uuid)"),
            {"id": placement_id})).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        days = _PERIOD_DAYS.get(row["billing_period"], 7)
        # Stack from the later of now / current paid_through, so EXTEND adds time
        # to a still-running ad instead of resetting it.
        res = await db.execute(text(f"""
            UPDATE community.sponsor_placements
            SET payment_status = 'PAID', payment_ref = :ref, status = 'ACTIVE',
                starts_at = COALESCE(starts_at, now()),
                paid_through = GREATEST(COALESCE(paid_through, now()), now()) + INTERVAL '{days} days'
            WHERE placement_id = cast(:id AS uuid)
        """), {"id": placement_id, "ref": (body.payment_ref or "").strip() or None})
        if not res.rowcount:
            raise HTTPException(status_code=404, detail="Not found")
    return {"data": {"ok": True, "status": "ACTIVE"}}


@router.get("/admin/ad-rates")
async def admin_ad_rates(admin: dict = Depends(require_admin())):
    async with get_rls_db(str(admin["tenant_id"])) as db:
        rows = (await db.execute(text("SELECT rate_id, surface, billing_period, price_fjd, active FROM community.ad_rates ORDER BY surface, billing_period"))).mappings().all()
    return {"data": [{"rate_id": str(r["rate_id"]), "surface": r["surface"], "billing_period": r["billing_period"], "price_fjd": float(r["price_fjd"]), "active": r["active"]} for r in rows]}


@router.patch("/admin/ad-rates/{rate_id}")
async def admin_update_rate(rate_id: str, body: RatePatch, admin: dict = Depends(require_admin())):
    fields = {"price_fjd": body.price_fjd, "id": rate_id}
    sets = "price_fjd = :price_fjd, updated_at = now()"
    if body.active is not None:
        fields["active"] = body.active
        sets += ", active = :active"
    async with get_rls_db(str(admin["tenant_id"])) as db:
        res = await db.execute(text(f"UPDATE community.ad_rates SET {sets} WHERE rate_id = cast(:id AS uuid)"), fields)
        if not res.rowcount:
            raise HTTPException(status_code=404, detail="Rate not found")
    return {"data": {"ok": True}}


@router.post("/admin/sponsors")
async def admin_create_sponsor(body: SponsorIn, admin: dict = Depends(require_admin())):
    data = body.model_dump()
    data["created_by"] = str(admin["user_id"])
    cols = _FIELDS + ["created_by"]
    placeholders = ", ".join(f":{c}" for c in cols)
    async with get_rls_db(str(admin["tenant_id"])) as db:
        row = (await db.execute(text(f"""
            INSERT INTO community.sponsor_placements ({", ".join(cols)})
            VALUES ({placeholders})
            RETURNING placement_id
        """), {**{k: data.get(k) for k in cols}})).mappings().first()
    return {"data": {"placement_id": str(row["placement_id"])}}


@router.patch("/admin/sponsors/{placement_id}")
async def admin_update_sponsor(placement_id: str, body: SponsorPatch, admin: dict = Depends(require_admin())):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        return {"data": {"ok": True}}
    sets = ", ".join(f"{k} = :{k}" for k in fields)
    fields["id"] = placement_id
    async with get_rls_db(str(admin["tenant_id"])) as db:
        res = await db.execute(text(f"UPDATE community.sponsor_placements SET {sets} WHERE placement_id = cast(:id AS uuid)"), fields)
        if not res.rowcount:
            raise HTTPException(status_code=404, detail="Placement not found")
    return {"data": {"ok": True}}


@router.delete("/admin/sponsors/{placement_id}")
async def admin_delete_sponsor(placement_id: str, admin: dict = Depends(require_admin())):
    async with get_rls_db(str(admin["tenant_id"])) as db:
        await db.execute(text("DELETE FROM community.sponsor_placements WHERE placement_id = cast(:id AS uuid)"), {"id": placement_id})
    return {"data": {"ok": True}}
