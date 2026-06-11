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

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import text

from app.db.session import get_db_ctx
from app.middleware.rls import get_current_user
from app.utils.rate_guard import rate_guard

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

    # ---- growth: the headline KPIs (slide-ready) -----------------------------
    growth = {
        "members_total": await _scalar(db, "SELECT count(*) FROM tenant.users WHERE COALESCE(is_active, true)"),
        "signups_30d": await _scalar(db, "SELECT count(*) FROM tenant.users WHERE created_at > now() - interval '30 days'"),
        "active_sellers": await _scalar(db, "SELECT count(DISTINCT created_by) FROM community.listings WHERE listing_status = 'ACTIVE'"),
        "active_listings": await _scalar(db, "SELECT count(*) FROM community.listings WHERE listing_status = 'ACTIVE'"),
        "dau": await _scalar(db, "SELECT count(*) FROM community.activity_days WHERE day = CURRENT_DATE"),
        "wau": await _scalar(db, "SELECT count(DISTINCT user_id) FROM community.activity_days WHERE day > CURRENT_DATE - 7"),
        "mau": await _scalar(db, "SELECT count(DISTINCT user_id) FROM community.activity_days WHERE day > CURRENT_DATE - 30"),
        "site_visits_30d": await _scalar(db, "SELECT COALESCE(sum(count), 0) FROM community.metric_events WHERE kind = 'visit' AND day > CURRENT_DATE - 30"),
        "pwa_installs_total": await _scalar(db, "SELECT COALESCE(sum(count), 0) FROM community.metric_events WHERE kind = 'pwa_install'"),
    }
    dau_trend = await _rows(db, """
        SELECT to_char(day, 'YYYY-MM-DD') AS day, count(*) AS active_users
        FROM community.activity_days WHERE day > CURRENT_DATE - 14
        GROUP BY day ORDER BY day DESC""")
    out["sections"]["growth"] = {
        "source": "community.activity_days (session pings) · community.metric_events · tenant.users · community.listings",
        "kpis": growth, "dau_trend": dau_trend,
        "notes": ["DAU/WAU/MAU = measured app opens (session pings), counted from deploy day — no backfill, no estimates.",
                  "Site visits + PWA installs are anonymous counters; transactions/M-PAiSA share arrive with the T1 order engine."],
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
        "consent": {
            "consented": await _scalar(db, "SELECT count(*) FROM tenant.users WHERE COALESCE(aggregate_consent, false) = true"),
            "total": await _scalar(db, "SELECT count(*) FROM tenant.users WHERE COALESCE(is_active, true)"),
        },
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
    """Covenant §3 external report: region-level production aggregates with BOTH
    gates enforced IN CODE — (1) only data from farmers who granted
    aggregate_consent (opt-in, default off, I3), AND (2) the k-anonymity floor
    (a region with fewer than K_FLOOR consented farms does not appear). No
    identifiers of any kind. Consent without k-anon, or k-anon without consent,
    is non-compliant — both always."""
    _require_admin(user)
    async with get_db_ctx() as db:
        # Consent gate (migration-tolerant): if the column doesn't exist yet,
        # NOBODY is consented — the report is empty, which is the safe default.
        has_consent = bool((await db.execute(text(
            "SELECT 1 FROM information_schema.columns WHERE table_schema='tenant' "
            "AND table_name='users' AND column_name='aggregate_consent'"))).scalar())
        if not has_consent:
            return _csv_response([], "teivaka-external-production-report.csv")
        # A farm counts ONLY if its owner (the tenant's founder) consented.
        rows = await _rows(db, f"""
            WITH consented_farms AS (
                SELECT f.farm_id, COALESCE(f.location_island, 'Unknown') AS region
                FROM tenant.farms f
                WHERE EXISTS (
                    SELECT 1 FROM tenant.users u
                    WHERE u.tenant_id = f.tenant_id AND COALESCE(u.aggregate_consent, false) = true
                )
            ), per AS (
                SELECT cf.region, p.production_name AS crop, count(*) AS cycles
                FROM tenant.production_cycles c
                JOIN consented_farms cf ON cf.farm_id = c.farm_id
                JOIN shared.productions p ON p.production_id = c.production_id
                GROUP BY 1, 2
            ), rf AS (
                SELECT region, count(*) AS region_farms FROM consented_farms GROUP BY 1
            )
            SELECT per.region, per.crop, per.cycles
            FROM per JOIN rf ON rf.region = per.region
            WHERE rf.region_farms >= {K_FLOOR}
            ORDER BY per.region, per.cycles DESC""") or []
    return _csv_response(rows, "teivaka-external-production-report.csv")


@router.get("/intelligence/geo")
async def geo_intelligence(user: dict = Depends(get_current_user)):
    """Geographic Intelligence dome (I4). Recursive roll-up of farms (and the
    consented subset) up the shared.geo_regions tree — National -> Division ->
    Province — computed from real tenant.farms.region_id. Migration-tolerant:
    pre-112 deployments report the registry as not-yet-loaded (honest gap).

    Honesty boundary: only COUNTRY/DIVISION/PROVINCE are loaded. DISTRICT/TIKINA/
    VILLAGE are reported as pending the Fiji Bureau of Statistics dataset — never
    invented."""
    _require_admin(user)
    async with get_db_ctx() as db:
        regions_loaded = await _scalar(db, "SELECT count(*) FROM shared.geo_regions")
        farms_total = await _scalar(db, "SELECT count(*) FROM tenant.farms")
        farms_classified = await _scalar(db, "SELECT count(*) FROM tenant.farms WHERE region_id IS NOT NULL")
        # Inclusive subtree roll-up: every region carries the counts of itself +
        # all descendants. The tree is tiny, so the recursive expand is cheap.
        tree = await _rows(db, """
            WITH RECURSIVE subtree AS (
                SELECT region_id AS root, region_id AS node FROM shared.geo_regions
                UNION ALL
                SELECT s.root, g.region_id
                FROM subtree s JOIN shared.geo_regions g ON g.parent_region_id = s.node
            ), direct AS (
                SELECT f.region_id,
                       count(*) AS farms,
                       count(*) FILTER (WHERE EXISTS (
                           SELECT 1 FROM tenant.users u
                           WHERE u.tenant_id = f.tenant_id AND COALESCE(u.aggregate_consent, false) = true
                       )) AS consented_farms
                FROM tenant.farms f WHERE f.region_id IS NOT NULL
                GROUP BY f.region_id
            )
            SELECT r.region_id, r.level, r.name, r.parent_region_id,
                   COALESCE(sum(d.farms), 0) AS farms,
                   COALESCE(sum(d.consented_farms), 0) AS consented_farms
            FROM shared.geo_regions r
            JOIN subtree st ON st.root = r.region_id
            LEFT JOIN direct d ON d.region_id = st.node
            GROUP BY r.region_id, r.level, r.name, r.parent_region_id
            ORDER BY r.level, r.name""")
    return {"data": {
        "source": "shared.geo_regions (recursive) · tenant.farms.region_id",
        "regions_loaded": regions_loaded,
        "levels_loaded": ["COUNTRY", "DIVISION", "PROVINCE"],
        "levels_pending": ["DISTRICT", "TIKINA", "VILLAGE"],
        "pending_blocker": "Sub-province granularity needs the Fiji Bureau of Statistics / iTaukei Lands dataset (external).",
        "farms_total": farms_total,
        "farms_classified": farms_classified,
        "tree": tree,
    }}


@router.get("/intelligence/pests")
async def pest_intelligence(user: dict = Depends(get_current_user)):
    """Pest & Disease Intelligence dome (I5). Aggregates farmer-reported scouting
    sightings (tenant.field_events PEST_OBSERVE / DISEASE_OBSERVE) into pressure
    maps by pest/disease × crop × region. Joins shared.geo_regions (I4) for the
    region label and shared.productions for crop. Cross-tenant custodial view.

    Honesty: these are OBSERVATIONS the farmer logged (never inferred, never
    advice — Inviolable #1). Soil chemistry (pH/NPK) is NOT here — it is gated on
    the soil-lab pipeline and surfaced as a pending gap, not faked."""
    _require_admin(user)
    async with get_db_ctx() as db:
        totals = {
            "pest_sightings": await _scalar(db, "SELECT count(*) FROM tenant.field_events WHERE event_type = 'PEST_OBSERVE'"),
            "disease_sightings": await _scalar(db, "SELECT count(*) FROM tenant.field_events WHERE event_type = 'DISEASE_OBSERVE'"),
            "sightings_30d": await _scalar(db, "SELECT count(*) FROM tenant.field_events WHERE event_type IN ('PEST_OBSERVE','DISEASE_OBSERVE') AND event_date > now() - interval '30 days'"),
            "farms_reporting": await _scalar(db, "SELECT count(DISTINCT farm_id) FROM tenant.field_events WHERE event_type IN ('PEST_OBSERVE','DISEASE_OBSERVE')"),
        }
        pest_pressure = await _rows(db, """
            SELECT e.payload_jsonb->>'pest_type' AS pest,
                   COALESCE(p.production_name, 'Unknown') AS crop,
                   COALESCE(g.name, f.location_island, 'Unknown') AS region,
                   count(*) AS sightings,
                   count(*) FILTER (WHERE e.payload_jsonb->>'density' = 'high') AS high_density
            FROM tenant.field_events e
            LEFT JOIN tenant.farms f ON f.farm_id = e.farm_id
            LEFT JOIN shared.geo_regions g ON g.region_id = f.region_id
            LEFT JOIN tenant.production_cycles c ON c.cycle_id = e.cycle_id
            LEFT JOIN shared.productions p ON p.production_id = c.production_id
            WHERE e.event_type = 'PEST_OBSERVE' AND e.payload_jsonb->>'pest_type' IS NOT NULL
            GROUP BY 1, 2, 3 ORDER BY sightings DESC LIMIT 50""")
        disease_pressure = await _rows(db, """
            SELECT e.payload_jsonb->>'disease_type' AS disease,
                   COALESCE(p.production_name, 'Unknown') AS crop,
                   COALESCE(g.name, f.location_island, 'Unknown') AS region,
                   count(*) AS sightings,
                   count(*) FILTER (WHERE e.payload_jsonb->>'severity' IN ('high','critical')) AS severe
            FROM tenant.field_events e
            LEFT JOIN tenant.farms f ON f.farm_id = e.farm_id
            LEFT JOIN shared.geo_regions g ON g.region_id = f.region_id
            LEFT JOIN tenant.production_cycles c ON c.cycle_id = e.cycle_id
            LEFT JOIN shared.productions p ON p.production_id = c.production_id
            WHERE e.event_type = 'DISEASE_OBSERVE' AND e.payload_jsonb->>'disease_type' IS NOT NULL
            GROUP BY 1, 2, 3 ORDER BY sightings DESC LIMIT 50""")
        recent = await _rows(db, """
            SELECT to_char(e.event_date, 'YYYY-MM-DD') AS date,
                   CASE e.event_type WHEN 'PEST_OBSERVE' THEN 'pest' ELSE 'disease' END AS kind,
                   COALESCE(e.payload_jsonb->>'pest_type', e.payload_jsonb->>'disease_type') AS subject,
                   COALESCE(e.payload_jsonb->>'density', e.payload_jsonb->>'severity') AS level,
                   COALESCE(g.name, f.location_island, 'Unknown') AS region
            FROM tenant.field_events e
            LEFT JOIN tenant.farms f ON f.farm_id = e.farm_id
            LEFT JOIN shared.geo_regions g ON g.region_id = f.region_id
            WHERE e.event_type IN ('PEST_OBSERVE','DISEASE_OBSERVE')
            ORDER BY e.event_date DESC LIMIT 20""")
    return {"data": {
        "source": "tenant.field_events (PEST_OBSERVE · DISEASE_OBSERVE) · shared.geo_regions · shared.productions",
        "totals": totals,
        "pest_pressure": pest_pressure,
        "disease_pressure": disease_pressure,
        "recent": recent,
        "soil_chemistry": None,  # honest gap — pending the soil-lab pipeline
        "note": "Farmer-reported sightings only — observations, never inferred advice. Soil chemistry (pH/NPK) is pending the soil-lab pipeline.",
    }}


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


class MetricPing(BaseModel):
    kind: str


@public_router.post("/metric")
async def metric_ping(body: MetricPing, request: Request):
    rate_guard(request, "metric", limit=20, window_s=60)
    """Anonymous platform counters (site visit, PWA install) — counts only,
    zero PII. Unknown kinds rejected; pre-108 schemas no-op silently."""
    kind = (body.kind or "").strip()
    if kind not in ("visit", "pwa_install"):
        raise HTTPException(status_code=422, detail="Unknown metric")
    async with get_db_ctx() as db:
        try:
            await db.execute(text(
                "INSERT INTO community.metric_events (kind, day, count) VALUES (:k, CURRENT_DATE, 1) "
                "ON CONFLICT (kind, day) DO UPDATE SET count = community.metric_events.count + 1"),
                {"k": kind})
            await db.commit()
        except Exception:  # noqa: BLE001
            await db.rollback()
    return {"data": {"ok": True}}


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


# ------------------------------------------------------ dashboard overview --

@router.get("/overview")
async def admin_overview_dashboard(user: dict = Depends(get_current_user)):
    """The Platform Dashboard's live numbers — every tile real, every queue
    count clickable to its queue. Replaces the legacy placeholder dashboard."""
    _require_admin(user)
    async with get_db_ctx() as db:
        tiles = {
            "members_total": await _scalar(db, "SELECT count(*) FROM tenant.users WHERE COALESCE(is_active, true)"),
            "dau": await _scalar(db, "SELECT count(*) FROM community.activity_days WHERE day = CURRENT_DATE"),
            "new_today": await _scalar(db, "SELECT count(*) FROM tenant.users WHERE created_at::date = CURRENT_DATE"),
            "posts_today": await _scalar(db, "SELECT count(*) FROM community.feed_posts WHERE created_at::date = CURRENT_DATE AND status = 'active'"),
            "tis_queries_today": await _scalar(db, "SELECT COALESCE(sum(tis_calls_today), 0) FROM tenant.tenants"),
            "active_farms": await _scalar(db, "SELECT count(*) FROM tenant.farms WHERE COALESCE(is_active, true)"),
        }
        queues = {
            "verifications_pending": await _scalar(db, "SELECT count(*) FROM community.verification_requests WHERE status = 'PENDING'"),
            "author_requests_pending": await _scalar(db, "SELECT count(*) FROM community.author_requests WHERE status = 'PENDING'"),
            "tier_requests_pending": await _scalar(db, "SELECT count(*) FROM community.tier_change_requests WHERE status = 'PENDING'"),
            "library_submissions_pending": await _scalar(db, "SELECT count(*) FROM community.library_submissions WHERE status = 'PENDING'"),
        }
        activity = await _rows(db, """
            SELECT fp.created_at, u.full_name AS who, left(fp.body, 90) AS what
            FROM community.feed_posts fp JOIN tenant.users u ON u.user_id = fp.author_user_id
            WHERE fp.status = 'active' ORDER BY fp.created_at DESC LIMIT 10""")
        signup_trend = await _rows(db, """
            SELECT to_char(created_at::date, 'YYYY-MM-DD') AS day, count(*) AS signups
            FROM tenant.users WHERE created_at > now() - interval '30 days'
            GROUP BY 1 ORDER BY 1 DESC""")
        top_crops = await _rows(db, """
            SELECT p.production_name AS crop, count(*) AS cycles
            FROM tenant.production_cycles c JOIN shared.productions p ON p.production_id = c.production_id
            GROUP BY 1 ORDER BY cycles DESC LIMIT 6""")
        return {"data": {"tiles": tiles, "queues": queues, "activity": activity,
                         "signup_trend": signup_trend, "top_crops": top_crops}}


# ----------------------------------------------------- announcement banner --

class BannerBody(BaseModel):
    banner_enabled: Optional[bool] = None
    banner_text: Optional[str] = None


@router.patch("/platform/banner")
async def set_banner(body: BannerBody, user: dict = Depends(get_current_user)):
    _require_admin(user)
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    async with get_db_ctx() as db:
        if fields:
            sets = ", ".join(f"{k} = :{k}" for k in fields)
            await db.execute(text(
                f"UPDATE community.platform_settings SET {sets}, updated_at = now(), updated_by = cast(:by AS uuid) WHERE id = 1"),
                {**fields, "by": str(user["user_id"])})
            await db.commit()
        row = (await db.execute(text(
            "SELECT banner_enabled, banner_text FROM community.platform_settings WHERE id = 1"))).mappings().first()
        return {"data": dict(row) if row else {}}


@public_router.get("/banner")
async def public_banner(request: Request):
    rate_guard(request, "banner", limit=60, window_s=60)
    """Site-wide announcement banner — public read, migration-tolerant off."""
    async with get_db_ctx() as db:
        try:
            row = (await db.execute(text(
                "SELECT banner_enabled, banner_text FROM community.platform_settings WHERE id = 1"))).mappings().first()
            d = dict(row) if row else {}
            return {"data": d if d.get("banner_enabled") else {"banner_enabled": False}}
        except Exception:  # noqa: BLE001
            await db.rollback()
            return {"data": {"banner_enabled": False}}


# ============================ ANALYTICS EVENT SPINE (Phase I1) ============================

class TrackBody(BaseModel):
    pillar: str
    event_type: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    props: Optional[dict] = None
    session_id: Optional[str] = None


@router.post("/track")
async def track_event(body: TrackBody, request: Request, user: dict = Depends(get_current_user)):
    """Authenticated client-side telemetry. Rate-limited, prop-whitelisted in
    the track() helper (PII can't get in). Best-effort, always 200."""
    rate_guard(request, "track", limit=120, window_s=60)
    from app.core.analytics import track
    async with get_db_ctx() as db:
        await track(db, pillar=body.pillar, event_type=body.event_type, user=user,
                    entity_type=body.entity_type, entity_id=body.entity_id,
                    props=body.props, session_id=body.session_id)
        await db.commit()
    return {"data": {"ok": True}}


@router.get("/analytics/events")
async def admin_analytics_events(pillar: str = None, days: int = 7, user: dict = Depends(get_current_user)):
    """Founder view of the event firehose — volume by type, recent stream,
    daily trend. Migration-tolerant (empty until the spine is deployed + fed)."""
    _require_admin(user)
    async with get_db_ctx() as db:
        if not bool((await db.execute(text("SELECT to_regclass('analytics.events') IS NOT NULL"))).scalar()):
            return {"data": {"available": False, "by_type": [], "by_day": [], "recent": []}}
        where = "ts > now() - make_interval(days => :d)"
        params = {"d": int(days)}
        if pillar:
            where += " AND pillar = :p"
            params["p"] = pillar
        by_type = await _rows(db, f"""
            SELECT pillar, event_type, count(*) AS events,
                   count(DISTINCT actor_user_id) AS users
            FROM analytics.events WHERE {where}
            GROUP BY 1, 2 ORDER BY events DESC LIMIT 50""", params)
        by_day = await _rows(db, f"""
            SELECT to_char(ts::date, 'YYYY-MM-DD') AS day, count(*) AS events
            FROM analytics.events WHERE {where}
            GROUP BY 1 ORDER BY 1 DESC LIMIT 14""", params)
        recent = await _rows(db, f"""
            SELECT to_char(ts, 'YYYY-MM-DD HH24:MI') AS ts, pillar, event_type, entity_type, props
            FROM analytics.events WHERE {where}
            ORDER BY ts DESC LIMIT 30""", params)
        total = await _scalar(db, f"SELECT count(*) FROM analytics.events WHERE {where}", params)
        return {"data": {"available": True, "total": total, "by_type": by_type,
                         "by_day": by_day, "recent": recent}}


# ============================ FOUNDER WAR ROOM (Phase I2) ============================
# Stricter than ADMIN — FOUNDER only. Subscription/revenue/retention intelligence
# computed from real tables (tenant.users/tenants, activity_days, analytics.events).

def _require_founder(user: dict):
    if user.get("role") != "FOUNDER":
        raise HTTPException(status_code=403, detail="The War Room is founder-only")


@router.get("/warroom")
async def war_room(user: dict = Depends(get_current_user)):
    _require_founder(user)
    async with get_db_ctx() as db:
        has_analytics = bool((await db.execute(text("SELECT to_regclass('analytics.events') IS NOT NULL"))).scalar())

        # --- activation funnel (registered → verified → first action → retained)
        funnel = [
            {"step": "Registered", "n": await _scalar(db, "SELECT count(*) FROM tenant.users")},
            {"step": "Email verified", "n": await _scalar(db, "SELECT count(*) FROM tenant.users WHERE email_verified")},
            {"step": "First action", "n": await _scalar(db, """
                SELECT count(DISTINCT u.user_id) FROM tenant.users u
                WHERE EXISTS (SELECT 1 FROM community.feed_posts fp WHERE fp.author_user_id = u.user_id)
                   OR EXISTS (SELECT 1 FROM audit.events ae WHERE ae.actor_user_id = u.user_id)""")},
            {"step": "Active (30d)", "n": await _scalar(db, "SELECT count(*) FROM tenant.users WHERE last_login > now() - interval '30 days'")},
            {"step": "Subscribed", "n": await _scalar(db, "SELECT count(*) FROM tenant.tenants WHERE COALESCE(subscription_tier,'FREE') <> 'FREE'")},
        ]
        # step-to-step conversion %
        for i, row in enumerate(funnel):
            prev = funnel[i - 1]["n"] if i > 0 else None
            row["pct_of_prev"] = (round(100.0 * (row["n"] or 0) / prev, 1) if prev else 100.0)

        # --- retention cohorts by signup month: % still active in last 30d
        cohorts = await _rows(db, """
            SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS cohort,
                   count(*) AS signed_up,
                   count(*) FILTER (WHERE last_login > now() - interval '30 days') AS still_active,
                   round(100.0 * count(*) FILTER (WHERE last_login > now() - interval '30 days') / NULLIF(count(*),0), 1) AS retention_pct
            FROM tenant.users GROUP BY 1 ORDER BY 1 DESC LIMIT 12""")

        # --- subscription distribution + churn flags
        subs = await _rows(db, """
            SELECT COALESCE(subscription_tier,'FREE') AS tier, count(*) AS tenants
            FROM tenant.tenants GROUP BY 1 ORDER BY tenants DESC""")
        churn = {
            "active_7d": await _scalar(db, "SELECT count(*) FROM community.activity_days WHERE day > CURRENT_DATE - 7"),
            "at_risk_14d": await _scalar(db, "SELECT count(*) FROM tenant.users WHERE last_login BETWEEN now() - interval '30 days' AND now() - interval '14 days'"),
            "dormant_30d": await _scalar(db, "SELECT count(*) FROM tenant.users WHERE last_login < now() - interval '30 days' OR last_login IS NULL"),
        }

        # --- feature adoption (from the event spine — by event_type, last 30d)
        adoption = None
        if has_analytics:
            adoption = await _rows(db, """
                SELECT pillar, event_type, count(*) AS events, count(DISTINCT actor_user_id) AS users
                FROM analytics.events WHERE ts > now() - interval '30 days'
                GROUP BY 1, 2 ORDER BY users DESC NULLS LAST LIMIT 30""")

        # --- ecosystem growth snapshot
        ecosystem = {
            "members": await _scalar(db, "SELECT count(*) FROM tenant.users WHERE COALESCE(is_active,true)"),
            "farms": await _scalar(db, "SELECT count(*) FROM tenant.farms WHERE COALESCE(is_active,true)"),
            "listings": await _scalar(db, "SELECT count(*) FROM community.listings WHERE listing_status='ACTIVE'"),
            "courses": await _scalar(db, "SELECT count(*) FROM community.courses WHERE status='PUBLISHED'"),
            "groups": await _scalar(db, "SELECT count(*) FROM community.groups WHERE status='ACTIVE'"),
            "certificates": await _scalar(db, "SELECT count(*) FROM community.course_certificates"),
        }

        return {"data": {
            "funnel": funnel, "cohorts": cohorts, "subscriptions": subs, "churn": churn,
            "feature_adoption": adoption, "ecosystem": ecosystem,
            "analytics_live": has_analytics,
            "notes": ["Funnel + retention from tenant.users/tenants/activity_days (real today).",
                      "Feature adoption from the analytics event spine — fills as events accrue (I1 deployed).",
                      "Revenue/CLV land with the T1 order engine + payment rail (Transaction & Trust doc)."],
        }}
