"""Promotions — WH4 "Boost your listing" (mounted at /api/v1).

A trust-earning member can FEATURE one of their own OPEN postings (a job listing or a
service job) for a fixed window; featured items sort to the top of the relevant
"available" list with a Featured label. No payment is faked — boost is trust-gated
(TRUSTED / ID-verified) and capped at one active at a time for alpha. Paid boost will
ride this same table once the payment rail lands.

  GET    /promotions/mine            eligibility + my active features + my boostable items
  POST   /promotions/feature         feature an item I own (trust-gated, cap 1 active)
  DELETE /promotions/feature/{id}     remove one of my features

community.* is cross-tenant (no RLS) — get_db_ctx (NULL context).
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from app.db.session import get_db_ctx
from app.middleware.rls import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

FEATURE_DAYS = 7
_ELIGIBLE_LEVELS = ("TRUSTED", "VERIFIED")
_TARGETS = {"JOB_LISTING", "SERVICE_JOB"}
_MAX_ACTIVE = 1


async def _trust_level(db, user_id) -> str:
    lvl = (await db.execute(text(
        "SELECT level FROM community.user_trust WHERE user_id = cast(:u AS uuid)"),
        {"u": str(user_id)})).scalar()
    return (lvl or "NEW")


async def _owns_open_target(db, target_type, target_id, user_id) -> bool:
    """True iff the caller owns the target AND it's OPEN (only open items are worth featuring)."""
    if target_type == "JOB_LISTING":
        row = (await db.execute(text(
            "SELECT 1 FROM community.job_listings WHERE listing_id = :t "
            "AND poster_user_id = cast(:u AS uuid) AND status = 'OPEN'"),
            {"t": target_id, "u": str(user_id)})).first()
    else:  # SERVICE_JOB
        row = (await db.execute(text(
            "SELECT 1 FROM community.service_jobs WHERE job_id = :t "
            "AND requester_user_id = cast(:u AS uuid) AND status = 'OPEN'"),
            {"t": target_id, "u": str(user_id)})).first()
    return bool(row)


@router.get("/promotions/mine")
async def my_promotions(user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        if not (await db.execute(text(
                "SELECT to_regclass('community.featured_placements') IS NOT NULL"))).scalar():
            return {"data": {"eligible": False, "active": [], "featurable": []}}
        eligible = (await _trust_level(db, uid)) in _ELIGIBLE_LEVELS
        active = [dict(r) for r in (await db.execute(text("""
            SELECT fp.placement_id, fp.target_type, fp.target_id, fp.featured_until,
                   COALESCE(jl.role_title, sj.title) AS title
            FROM community.featured_placements fp
            LEFT JOIN community.job_listings jl ON fp.target_type = 'JOB_LISTING' AND jl.listing_id = fp.target_id
            LEFT JOIN community.service_jobs sj ON fp.target_type = 'SERVICE_JOB' AND sj.job_id = fp.target_id
            WHERE fp.user_id = cast(:u AS uuid) AND fp.featured_until > now()
            ORDER BY fp.featured_until DESC
        """), {"u": uid})).mappings().all()]
        # Boostable = my OPEN postings not already featured.
        featurable = [dict(r) for r in (await db.execute(text("""
            SELECT listing_id AS target_id, role_title AS title, 'JOB_LISTING' AS target_type
            FROM community.job_listings jl
            WHERE jl.poster_user_id = cast(:u AS uuid) AND jl.status = 'OPEN'
              AND NOT EXISTS (SELECT 1 FROM community.featured_placements fp
                              WHERE fp.target_type = 'JOB_LISTING' AND fp.target_id = jl.listing_id
                                AND fp.featured_until > now())
            UNION ALL
            SELECT job_id AS target_id, title, 'SERVICE_JOB' AS target_type
            FROM community.service_jobs sj
            WHERE sj.requester_user_id = cast(:u AS uuid) AND sj.status = 'OPEN'
              AND NOT EXISTS (SELECT 1 FROM community.featured_placements fp
                              WHERE fp.target_type = 'SERVICE_JOB' AND fp.target_id = sj.job_id
                                AND fp.featured_until > now())
            LIMIT 100
        """), {"u": uid})).mappings().all()]
    return {"data": {"eligible": eligible, "active": active, "featurable": featurable,
                     "max_active": _MAX_ACTIVE, "days": FEATURE_DAYS}}


class FeatureBody(BaseModel):
    target_type: str
    target_id: str


@router.post("/promotions/feature")
async def feature_item(body: FeatureBody, user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    tt = (body.target_type or "").upper()
    if tt not in _TARGETS:
        raise HTTPException(status_code=400, detail=f"target_type must be one of {sorted(_TARGETS)}")
    async with get_db_ctx() as db:
        if (await _trust_level(db, uid)) not in _ELIGIBLE_LEVELS:
            raise HTTPException(status_code=403,
                                detail="Featuring is for ID-verified or Trusted members. Verify your ID or build your record to unlock it.")
        if not await _owns_open_target(db, tt, body.target_id, uid):
            raise HTTPException(status_code=404, detail="That posting isn't yours or isn't open.")
        # Cap: one active feature at a time (re-featuring the SAME item is allowed = extend).
        others = (await db.execute(text(
            "SELECT count(*) FROM community.featured_placements "
            "WHERE user_id = cast(:u AS uuid) AND featured_until > now() "
            "AND NOT (target_type = :tt AND target_id = :tid)"),
            {"u": uid, "tt": tt, "tid": body.target_id})).scalar() or 0
        if others >= _MAX_ACTIVE:
            raise HTTPException(status_code=409,
                                detail="You can feature one item at a time. Remove the current one first.")
        row = (await db.execute(text("""
            INSERT INTO community.featured_placements (target_type, target_id, user_id, featured_until)
            VALUES (:tt, :tid, cast(:u AS uuid), now() + make_interval(days => :days))
            ON CONFLICT (target_type, target_id) DO UPDATE
              SET featured_until = now() + make_interval(days => :days), user_id = cast(:u AS uuid)
            RETURNING placement_id, featured_until
        """), {"tt": tt, "tid": body.target_id, "u": uid, "days": FEATURE_DAYS})).mappings().first()
        await db.commit()
    return {"data": {"placement_id": str(row["placement_id"]),
                     "featured_until": row["featured_until"].isoformat() if row["featured_until"] else None}}


@router.delete("/promotions/feature/{placement_id}")
async def unfeature_item(placement_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        res = await db.execute(text(
            "DELETE FROM community.featured_placements "
            "WHERE placement_id = cast(:p AS uuid) AND user_id = cast(:u AS uuid) RETURNING placement_id"),
            {"p": placement_id, "u": str(user["user_id"])})
        if not res.scalar():
            raise HTTPException(status_code=404, detail="Feature not found")
        await db.commit()
    return {"data": {"removed": True}}
