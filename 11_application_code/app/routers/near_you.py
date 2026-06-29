"""near_you.py — the "Near You" feed (audit Slice 1).

ONE read-only aggregation over four EXISTING cross-tenant community.* marketplaces
(job listings, service jobs, the public WANTED buyer-demand board, sponsor placements),
ranked by urgency + proximity. NOT a fifth marketplace: the owning routers keep their
lifecycles; this never writes and never claims.

Hardened per the design + stress test:
- Buyer-demand sourced ONLY from community.demand_records (the PUBLIC board). NEVER
  tenant.buyer_demand_signals (RLS-private CRM) — see test_near_you_no_crm_import.
- Country gate on every source (jobs/services were globe-wide — leak when a 2nd country
  onboards; migration 198 adds + backfills `country`).
- Uniform liveness: a passed deadline DROPS the row (never mis-buckets to CRITICAL).
- Self-exclusion at list time (your own need never occupies a slot with a dead CTA).
- claim_state is ADVISORY: the feed deep-links to the item's owning surface where the
  existing atomic claim (UPDATE ... WHERE status='OPEN' RETURNING → 409) is the guard.
- No write in the read path (sponsor impressions handled elsewhere) — get_db_ctx is a
  NULL-RLS session; a write here would risk RLS-context bleed.
- Every targeting/liveness predicate is in SQL WHERE before LIMIT; Python sees <= limit+1.

Verify on prod (cannot run SQL from the build env): curl the endpoint, EXPLAIN ANALYZE
the union for index usage, and run the no-CRM-import test.
"""
import hashlib
import json

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy import text

from app.core.account_types import category_of, clean_also_categories
from app.core.geo import resolve_viewer_origin, sql_distance_case
from app.db.session import get_db_ctx, get_rls_db
from app.middleware.rls import get_current_user
from app.schemas.envelope import success_envelope

router = APIRouter()

# Base urgency per source (service > demand > job > sponsor).
_BASE = {"SERVICE": 60, "BUYER_DEMAND": 55, "JOB": 50, "SPONSOR": 25}
_VALID_TYPES = set(_BASE)


def _deadline_bucket(col: str) -> str:
    """+points for time-pressure on a DATE/timestamptz deadline column (already filtered live)."""
    d = f"({col})::date - CURRENT_DATE"
    return (f"CASE WHEN {col} IS NULL THEN 0 WHEN {d} <= 2 THEN 40 "
            f"WHEN {d} <= 7 THEN 25 WHEN {d} <= 30 THEN 10 ELSE 0 END")


_PROX = ("CASE WHEN distance_km IS NULL THEN 0 WHEN distance_km <= 5 THEN 15 "
         "WHEN distance_km <= 25 THEN 8 ELSE 0 END")


def _job_sql() -> str:
    dist = sql_distance_case("base_lat", "base_lng")
    return f"""
    SELECT item_id, type, native_id, title, subtitle, poster_user_id, poster_name,
           island, region, distance_km, needed_by, created_at, amount, amount_label, sponsored,
           LEAST(100, {_BASE['JOB']} + {_deadline_bucket('needed_by')} + {_PROX} + :job_boost) AS score
    FROM (
      SELECT 'job:' || listing_id AS item_id, 'JOB' AS type, listing_id::text AS native_id,
             role_title AS title, COALESCE(poster_org_name, '') AS subtitle,
             poster_user_id::text AS poster_user_id, poster_org_name AS poster_name,
             NULL::text AS island, region, apply_deadline::timestamptz AS needed_by, created_at,
             pay_rate_fjd AS amount, pay_period AS amount_label, false AS sponsored,
             {dist} AS distance_km
      FROM community.job_listings
      WHERE status = 'OPEN' AND (apply_deadline IS NULL OR apply_deadline >= CURRENT_DATE)
        AND (country = :vc OR country IS NULL)
        AND poster_user_id != cast(:uid AS uuid)
    ) j
    WHERE (NOT :has_origin OR distance_km IS NULL OR distance_km <= :radius)
    """


def _service_sql() -> str:
    dist = sql_distance_case("pickup_lat", "pickup_lng")
    return f"""
    SELECT item_id, type, native_id, title, subtitle, poster_user_id, poster_name,
           island, region, distance_km, needed_by, created_at, amount, amount_label, sponsored,
           LEAST(100, {_BASE['SERVICE']} + {_deadline_bucket('needed_by')} + {_PROX} + :svc_boost) AS score
    FROM (
      SELECT 'svc:' || job_id AS item_id, 'SERVICE' AS type, job_id::text AS native_id,
             title, COALESCE(service_type, '') AS subtitle,
             requester_user_id::text AS poster_user_id, NULL::text AS poster_name,
             NULL::text AS island, NULL::text AS region, needed_by, created_at,
             NULL::numeric AS amount, NULL::text AS amount_label, false AS sponsored,
             {dist} AS distance_km
      FROM community.service_jobs
      WHERE status = 'OPEN' AND (needed_by IS NULL OR needed_by >= now())
        AND (country = :vc OR country IS NULL)
        AND requester_user_id != cast(:uid AS uuid)
    ) s
    WHERE (NOT :has_origin OR distance_km IS NULL OR distance_km <= :radius)
    """


def _demand_sql() -> str:
    # No lat/lng on demand_records — island-text only; distance is always NULL (never faked).
    return f"""
    SELECT 'dmd:' || demand_record_id AS item_id, 'BUYER_DEMAND' AS type, demand_record_id::text AS native_id,
           COALESCE(buyer_name, 'A buyer') || ' wants produce' AS title,
           COALESCE(location_region, island, '') AS subtitle,
           created_by::text AS poster_user_id, buyer_name AS poster_name,
           island, location_region AS region, NULL::numeric AS distance_km,
           required_by::timestamptz AS needed_by, created_at,
           price_offered_fjd AS amount, 'FJD' AS amount_label, false AS sponsored,
           LEAST(100, {_BASE['BUYER_DEMAND']} + {_deadline_bucket('required_by')} + :demand_boost) AS score
    FROM community.demand_records
    WHERE status = 'OPEN' AND (required_by IS NULL OR required_by >= CURRENT_DATE)
      AND (country = :vc OR country IS NULL)
      AND created_by != cast(:uid AS uuid)
    """


def _sponsor_sql() -> str:
    # Capped to <=2 so promos never dominate the trust surface; ranks low (base 25).
    return f"""
    SELECT 'spn:' || placement_id AS item_id, 'SPONSOR' AS type, placement_id::text AS native_id,
           title, COALESCE(sponsor_name, '') AS subtitle,
           NULL::text AS poster_user_id, sponsor_name AS poster_name,
           NULL::text AS island, NULL::text AS region, NULL::numeric AS distance_km,
           NULL::timestamptz AS needed_by, COALESCE(starts_at, now()) AS created_at,
           NULL::numeric AS amount, NULL::text AS amount_label, true AS sponsored,
           LEAST(100, {_BASE['SPONSOR']} + LEAST(COALESCE(priority, 0), 20)) AS score
    FROM community.sponsor_placements
    WHERE status = 'ACTIVE' AND payment_status IN ('PAID', 'WAIVED')
      AND (paid_through IS NULL OR paid_through >= now())
      AND (starts_at IS NULL OR starts_at <= now())
      AND (ends_at IS NULL OR ends_at >= now())
      AND (target_country IS NULL OR target_country = :vc)
      AND (target_account_type IS NULL OR target_account_type = ANY(:cats))
    ORDER BY priority DESC NULLS LAST, created_at DESC
    LIMIT 2
    """


_BUILDERS = {"JOB": _job_sql, "SERVICE": _service_sql, "BUYER_DEMAND": _demand_sql, "SPONSOR": _sponsor_sql}
_TABLE = {
    "JOB": "community.job_listings", "SERVICE": "community.service_jobs",
    "BUYER_DEMAND": "community.demand_records", "SPONSOR": "community.sponsor_placements",
}


@router.get("/near-you")
async def near_you(
    request: Request,
    response: Response,
    types: str = Query(None, description="CSV of JOB,SERVICE,BUYER_DEMAND,SPONSOR (default all)"),
    radius_km: float = Query(50, ge=1, le=200),
    limit: int = Query(6, ge=1, le=20),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    uid = str(user["user_id"])
    tid = str(user["tenant_id"])

    # Viewer country + category set (role boosts), under the viewer's RLS context.
    vc = user.get("country")
    cats: list[str] = []
    try:
        async with get_rls_db(tid) as vdb:
            vrow = (await vdb.execute(text(
                "SELECT country, account_type, also_account_types FROM tenant.users WHERE user_id = cast(:u AS uuid)"
            ), {"u": uid})).mappings().first()
        if vrow:
            vc = vrow["country"] or vc
            pc = category_of(vrow["account_type"])
            if pc:
                cats.append(pc)
            for k in clean_also_categories(list(vrow["also_account_types"] or [])):
                if k not in cats:
                    cats.append(k)
    except Exception:
        pass
    vc = vc or "FJ"
    is_farmerish = any(c in ("FARMER",) for c in cats) or not cats   # demand/jobs relevance default-on

    origin = await resolve_viewer_origin(tid, uid)

    requested = [t.strip().upper() for t in types.split(",")] if types else list(_VALID_TYPES)
    requested = [t for t in requested if t in _VALID_TYPES]

    params = {
        "vc": vc, "uid": uid, "cats": cats or [""],
        "has_origin": origin["has_origin"], "olat": origin["lat"] or 0.0, "olng": origin["lng"] or 0.0,
        "radius": radius_km,
        "job_boost": 10 if is_farmerish else 0,
        "svc_boost": 10 if is_farmerish else 0,
        "demand_boost": 10 if is_farmerish else 0,
        "lim": limit + 1, "off": offset,
    }

    partial_sources: list[str] = []
    frags: list[str] = []
    async with get_db_ctx() as db:
        for t in requested:
            exists = (await db.execute(text("SELECT to_regclass(:rel) IS NOT NULL"), {"rel": _TABLE[t]})).scalar()
            if exists:
                frags.append(_BUILDERS[t]())
            else:
                partial_sources.append(t)

        if not frags:
            return success_envelope({"items": []}, meta={"has_origin": origin["has_origin"], "partial_sources": partial_sources, "note": "no sources available"})

        union = "\nUNION ALL\n".join(f"({f})" for f in frags)
        sql = (f"SELECT * FROM (\n{union}\n) feed "
               "ORDER BY score DESC, (distance_km IS NULL), distance_km ASC, created_at DESC, item_id "
               "LIMIT :lim OFFSET :off")
        rows = (await db.execute(text(sql), params)).mappings().all()

    truncated = len(rows) > limit
    rows = rows[:limit]

    items = []
    for r in rows:
        d = r["distance_km"]
        items.append({
            "item_id": r["item_id"], "type": r["type"],
            "title": r["title"], "subtitle": r["subtitle"],
            "poster": {"user_id": r["poster_user_id"], "name": r["poster_name"]},
            "geo": {"island": r["island"], "region": r["region"],
                    "distance_km": round(float(d), 1) if d is not None else None,
                    "distance_basis": ("EXACT" if d is not None else ("ISLAND_APPROX" if r["type"] == "BUYER_DEMAND" else "NONE"))},
            "urgency": {"score": int(r["score"])},
            "needed_by": r["needed_by"].isoformat() if r["needed_by"] else None,
            "amount": float(r["amount"]) if r["amount"] is not None else None,
            "amount_label": r["amount_label"], "currency": "FJD",
            "sponsored": bool(r["sponsored"]),
            "deep_link": f"/near-you/{r['item_id']}",   # resolves to the item's owning detail surface
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        })

    body = {"items": items}
    meta = {
        "has_origin": origin["has_origin"],
        "geo_mode": "RADIUS" if origin["has_origin"] else "UNRANKED",
        "radius_km": radius_km,
        "partial_sources": partial_sources,
        "truncated": truncated,
        "applied_types": requested,
    }

    # ETag: unchanged payloads return 304 (cheap on metered connections).
    etag = 'W/"' + hashlib.sha256(json.dumps(body, sort_keys=True, default=str).encode()).hexdigest()[:16] + '"'
    response.headers["ETag"] = etag
    if request.headers.get("if-none-match") == etag:
        response.status_code = status.HTTP_304_NOT_MODIFIED
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag})

    return success_envelope(body, meta=meta)
