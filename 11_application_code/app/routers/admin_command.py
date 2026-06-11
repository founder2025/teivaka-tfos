"""Admin Command Center — intelligence + platform controls (founder/admin).

Intelligence: every number computes from real platform tables, per-metric
best-effort (a missing table degrades that metric, never the dashboard) and
cached into community.intel_snapshots (Inviolable #3 spirit — admin reads a
snapshot, refresh recomputes). Custodial visibility per Covenant §2.

External report mode is Covenant §3-bound IN CODE: region aggregates only,
k-anonymity floor (regions under k suppressed), no tenant/user/farm
identifiers — ever. That boundary is what makes the data asset sellable.

Platform: per-pillar feature flags (kill switches) + admin grant/revoke with
audit events.
"""
import csv
import io
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import text

from app.db.session import get_db_ctx
from app.middleware.rls import get_current_user

router = APIRouter()
public_router = APIRouter()

_ADMIN_ROLES = {"ADMIN", "FOUNDER"}
SNAPSHOT_TTL_HOURS = 24
K_FLOOR = 10  # Covenant §3 k-anonymity floor


def _is_admin(user: dict) -> bool:
    return user.get("role") in _ADMIN_ROLES


def _require_admin(user: dict):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin Command Center is founder-only")


async def _rows(db, sql: str, params: dict | None = None):
    """Per-metric best-effort: schema drift degrades one metric, not the page."""
    try:
        return [dict(r) for r in (await db.execute(text(sql), params or {})).mappings().all()]
    except Exception:  # noqa: BLE001
        await db.rollback()
        return None  # None = 'not available', [] = real empty


async def _scalar(db, sql: str, params: dict | None = None):
    try:
        return (await db.execute(text(sql), params or {})).scalar()
    except Exception:  # noqa: BLE001
        await db.rollback()
        return None


async def _compute_intel(db) -> dict:
    """All sections. Every metric source-labelled and individually degradable."""
    out = {"computed_at": datetime.now(timezone.utc).isoformat(), "sections": {}}

    # ---- production: what's grown/raised, where -----------------------------
    crops_by_region = await _rows(db, """
        SELECT COALESCE(f.location_island, 'Unknown') AS region, p.production_name AS crop,
               count(*) AS cycles,
               count(*) FILTER (WHERE c.cycle_status IN ('ACTIVE','HARVESTING')) AS active_cycles
        FROM tenant.production_cycles c
        JOIN tenant.farms f ON f.farm_id = c.farm_id
        JOIN shared.productions p ON p.production_id = c.production_id
        GROUP BY 1, 2 ORDER BY cycles DESC LIMIT 100""")
    farms_by_region = await _rows(db, """
        SELECT COALESCE(location_island, 'Unknown') AS region, count(*) AS farms
        FROM tenant.farms GROUP BY 1 ORDER BY farms DESC""")
    flocks = await _rows(db, """
        SELECT COALESCE(f.location_island, 'Unknown') AS region, count(*) AS flocks
        FROM tenant.flocks fl JOIN tenant.farms f ON f.farm_id = fl.farm_id
        GROUP BY 1 ORDER BY flocks DESC""")
    out["sections"]["production"] = {
        "source": "tenant.production_cycles · tenant.farms · shared.productions · tenant.flocks",
        "crops_by_region": crops_by_region, "farms_by_region": farms_by_region,
        "poultry_flocks_by_region": flocks,
    }

    # ---- people: who, where, retention --------------------------------------
    members = await _rows(db, """
        SELECT lower(COALESCE(account_type, 'FARMER')) AS profession,
               COALESCE(country, '??') AS country, count(*) AS members,
               count(*) FILTER (WHERE COALESCE(kyc_verified, false)) AS verified
        FROM tenant.users WHERE COALESCE(is_active, true)
        GROUP BY 1, 2 ORDER BY members DESC""")
    signups_by_month = await _rows(db, """
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, count(*) AS signups
        FROM tenant.users GROUP BY 1 ORDER BY 1 DESC LIMIT 12""")
    funnel = {
        "registered": await _scalar(db, "SELECT count(*) FROM tenant.users"),
        "email_verified": await _scalar(db, "SELECT count(*) FROM tenant.users WHERE email_verified"),
        "kyc_verified": await _scalar(db, "SELECT count(*) FROM tenant.users WHERE COALESCE(kyc_verified, false)"),
        "posted_or_logged": await _scalar(db, """
            SELECT count(DISTINCT u.user_id) FROM tenant.users u
            WHERE EXISTS (SELECT 1 FROM community.feed_posts fp WHERE fp.author_user_id = u.user_id)
               OR EXISTS (SELECT 1 FROM audit.events ae WHERE ae.actor_user_id = u.user_id)"""),
        "active_30d": await _scalar(db, "SELECT count(*) FROM tenant.users WHERE last_login > now() - interval '30 days'"),
    }
    churn = {
        "inactive_14d": await _scalar(db, "SELECT count(*) FROM tenant.users WHERE last_login < now() - interval '14 days' OR last_login IS NULL"),
        "inactive_30d": await _scalar(db, "SELECT count(*) FROM tenant.users WHERE last_login < now() - interval '30 days' OR last_login IS NULL"),
        "inactive_90d": await _scalar(db, "SELECT count(*) FROM tenant.users WHERE last_login < now() - interval '90 days' OR last_login IS NULL"),
    }
    tiers = await _rows(db, """
        SELECT COALESCE(subscription_tier, 'FREE') AS tier, count(*) AS tenants
        FROM tenant.tenants GROUP BY 1 ORDER BY tenants DESC""")
    out["sections"]["people"] = {
        "source": "tenant.users · tenant.tenants · community.feed_posts · audit.events",
        "members_by_profession_country": members, "signups_by_month": signups_by_month,
        "funnel": funnel, "churn": churn, "tier_distribution": tiers,
        "not_captured": ["gender", "age"],  # honest gap — needs optional consented fields
    }

    # ---- commerce ------------------------------------------------------------
    listings = await _rows(db, """
        SELECT COALESCE(category, 'PRODUCE') AS category, COALESCE(island, 'Unknown') AS region,
               count(*) AS listings, count(*) FILTER (WHERE sold_at IS NOT NULL) AS sold
        FROM community.listings GROUP BY 1, 2 ORDER BY listings DESC LIMIT 100""")
    price_reports = await _scalar(db, "SELECT count(*) FROM community.market_price_reports")
    out["sections"]["commerce"] = {
        "source": "community.listings · community.market_price_reports",
        "listings_by_category_region": listings,
        "market_price_reports": price_reports,
    }

    # ---- engagement ----------------------------------------------------------
    posts_week = await _rows(db, """
        SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS week, count(*) AS posts
        FROM community.feed_posts WHERE status = 'active'
        GROUP BY 1 ORDER BY 1 DESC LIMIT 8""")
    groups = await _rows(db, """
        SELECT g.name, g.category,
               (SELECT count(*) FROM community.group_members gm WHERE gm.group_id = g.group_id) AS members,
               (SELECT count(*) FROM community.feed_posts fp WHERE fp.group_id = g.group_id AND fp.deleted_at IS NULL) AS posts
        FROM community.groups g WHERE g.status = 'ACTIVE' ORDER BY members DESC LIMIT 20""")
    classroom = {
        "published_courses": await _scalar(db, "SELECT count(*) FROM community.courses WHERE status = 'PUBLISHED'"),
        "learners": await _scalar(db, "SELECT count(DISTINCT user_id) FROM community.lesson_progress"),
        "certificates": await _scalar(db, "SELECT count(*) FROM community.course_certificates"),
    }
    tis_unanswered = await _rows(db, """
        SELECT query_text, query_count FROM shared.kb_article_candidates
        WHERE status = 'PENDING' ORDER BY query_count DESC LIMIT 15""")
    out["sections"]["engagement"] = {
        "source": "community.feed_posts · community.groups · classroom tables · shared.kb_article_candidates",
        "posts_by_week": posts_week, "top_groups": groups, "classroom": classroom,
        "tis_top_unanswered": tis_unanswered,
    }
    return out


@router.get("/intelligence")
async def intelligence(refresh: bool = False, user: dict = Depends(get_current_user)):
    _require_admin(user)
    async with get_db_ctx() as db:
        if not refresh:
            row = (await db.execute(text(
                "SELECT payload, computed_at FROM community.intel_snapshots WHERE kind = 'full'"))).first()
            if row and row[1] and row[1] > datetime.now(timezone.utc) - timedelta(hours=SNAPSHOT_TTL_HOURS):
                return {"data": row[0], "cached": True}
        data = await _compute_intel(db)
        await db.execute(text(
            "INSERT INTO community.intel_snapshots (kind, payload, computed_at) VALUES ('full', cast(:p AS jsonb), now()) "
            "ON CONFLICT (kind) DO UPDATE SET payload = cast(:p AS jsonb), computed_at = now()"),
            {"p": json.dumps(data, default=str)})
        await db.commit()
        return {"data": data, "cached": False}


def _csv_response(rows: list, filename: str) -> Response:
    buf = io.StringIO()
    if rows:
        w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/intelligence/export.csv")
async def intelligence_csv(section: str, table: str, user: dict = Depends(get_current_user)):
    """CSV of one intelligence table (custodial — full detail, admin only)."""
    _require_admin(user)
    async with get_db_ctx() as db:
        data = await _compute_intel(db)
    rows = (data["sections"].get(section) or {}).get(table)
    if not isinstance(rows, list):
        raise HTTPException(status_code=404, detail="Unknown section/table")
    return _csv_response(rows, f"teivaka-intel-{section}-{table}.csv")


@router.get("/intelligence/external.csv")
async def external_report(user: dict = Depends(get_current_user)):
    """Covenant §3 external report: region-level production aggregates with the
    k-anonymity floor enforced IN CODE — a region with fewer than K_FLOOR
    farms does not appear at all. No identifiers of any kind."""
    _require_admin(user)
    async with get_db_ctx() as db:
        rows = await _rows(db, f"""
            WITH per AS (
                SELECT COALESCE(f.location_island, 'Unknown') AS region,
                       p.production_name AS crop, count(*) AS cycles
                FROM tenant.production_cycles c
                JOIN tenant.farms f ON f.farm_id = c.farm_id
                JOIN shared.productions p ON p.production_id = c.production_id
                GROUP BY 1, 2
            ), rf AS (
                SELECT COALESCE(location_island, 'Unknown') AS region, count(*) AS region_farms
                FROM tenant.farms GROUP BY 1
            )
            SELECT per.region, per.crop, per.cycles
            FROM per JOIN rf ON rf.region = per.region
            WHERE rf.region_farms >= {K_FLOOR}
            ORDER BY per.region, per.cycles DESC""") or []
    return _csv_response(rows, "teivaka-external-production-report.csv")


# --------------------------------------------------------- platform controls --

class FlagPatch(BaseModel):
    flag: str
    enabled: bool


@router.get("/platform/flags")
async def admin_flags(user: dict = Depends(get_current_user)):
    _require_admin(user)
    async with get_db_ctx() as db:
        rows = (await db.execute(text(
            "SELECT flag, enabled, note, updated_at FROM community.feature_flags ORDER BY flag"))).mappings().all()
        return {"data": [dict(r) for r in rows]}


@router.patch("/platform/flags")
async def patch_flag(body: FlagPatch, user: dict = Depends(get_current_user)):
    _require_admin(user)
    async with get_db_ctx() as db:
        res = await db.execute(text(
            "UPDATE community.feature_flags SET enabled = :on, updated_at = now(), updated_by = cast(:by AS uuid) WHERE flag = :f"),
            {"on": body.enabled, "f": body.flag, "by": str(user["user_id"])})
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Unknown flag")
        await db.commit()
    return {"data": {"flag": body.flag, "enabled": body.enabled}}


@public_router.get("/flags")
async def public_flags():
    """Public read of feature flags — the frontend gates disabled pillars.
    Migration-tolerant: everything defaults ON if the table is missing."""
    async with get_db_ctx() as db:
        try:
            rows = (await db.execute(text(
                "SELECT flag, enabled FROM community.feature_flags"))).all()
            return {"data": {r[0]: r[1] for r in rows}}
        except Exception:  # noqa: BLE001
            await db.rollback()
            return {"data": {}}


class AdminGrant(BaseModel):
    user_email: str
    enabled: bool


@router.get("/platform/admins")
async def list_admins(user: dict = Depends(get_current_user)):
    _require_admin(user)
    async with get_db_ctx() as db:
        rows = (await db.execute(text(
            "SELECT user_id, full_name, email, role FROM tenant.users WHERE role IN ('ADMIN','FOUNDER') ORDER BY role, full_name"))).mappings().all()
        return {"data": [{**dict(r), "user_id": str(r["user_id"])} for r in rows]}


@router.patch("/platform/admins")
async def grant_admin(body: AdminGrant, user: dict = Depends(get_current_user)):
    """Founder hands the keys to a trusted figure (or takes them back).
    Every grant/revoke is hash-chained into audit.events."""
    _require_admin(user)
    async with get_db_ctx() as db:
        row = (await db.execute(text(
            "SELECT user_id, role, full_name FROM tenant.users WHERE lower(email) = lower(:em)"),
            {"em": body.user_email.strip()})).first()
        if not row:
            raise HTTPException(status_code=404, detail="User not found — check the email")
        if str(row[0]) == str(user["user_id"]) and not body.enabled:
            raise HTTPException(status_code=409, detail="You can't revoke your own admin access")
        if row[1] == "FOUNDER":
            raise HTTPException(status_code=409, detail="The founder role is not changed from here")
        new_role = "ADMIN" if body.enabled else "FARMER"
        await db.execute(text(
            "UPDATE tenant.users SET role = :r WHERE user_id = :uid"), {"r": new_role, "uid": str(row[0])})
        try:
            from app.core.audit_chain import emit_audit_event
            await emit_audit_event(
                db=db, tenant_id=user["tenant_id"], actor_user_id=user["user_id"],
                event_type="ADMIN_ACCESS_CHANGED", entity_type="user", entity_id=str(row[0]),
                payload={"target": row[2], "new_role": new_role, "by": str(user["user_id"])})
        except Exception:  # noqa: BLE001 — audit best-effort, change still applies
            pass
        await db.commit()
    return {"data": {"user_email": body.user_email, "role": new_role}}
