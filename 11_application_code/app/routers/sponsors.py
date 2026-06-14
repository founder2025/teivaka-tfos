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
           "starts_at", "ends_at", "status"]


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
    uid = str(user["user_id"])
    async with get_rls_db(str(user["tenant_id"])) as db:
        vc = (await db.execute(text("SELECT country FROM tenant.users WHERE user_id = cast(:u AS uuid)"), {"u": uid})).scalar()
        rows = (await db.execute(text("""
            SELECT placement_id, sponsor_name, sponsor_logo, title, blurb, image_url, cta_label, cta_url
            FROM community.sponsor_placements
            WHERE status = 'ACTIVE'
              AND (starts_at IS NULL OR starts_at <= now())
              AND (ends_at   IS NULL OR ends_at   >= now())
              AND (target_country IS NULL OR target_country = :vc)
            ORDER BY priority DESC, random()
            LIMIT :lim
        """), {"vc": vc, "lim": limit})).mappings().all()
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


# ----------------------------------------------------------------------------- admin
@router.get("/admin/sponsors")
async def admin_list_sponsors(admin: dict = Depends(require_admin())):
    async with get_rls_db(str(admin["tenant_id"])) as db:
        rows = (await db.execute(text("""
            SELECT placement_id, sponsor_name, sponsor_logo, title, blurb, image_url, cta_label, cta_url,
                   placement_type, priority, target_country, target_vertical, starts_at, ends_at,
                   status, impressions, clicks, created_at
            FROM community.sponsor_placements
            ORDER BY status, priority DESC, created_at DESC
        """))).mappings().all()
    return {"data": [_row(r) for r in rows]}


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
