"""POULTRY Dashboard endpoint — Phase 6.7-1.

GET /api/v1/poultry/dashboard
  Composite payload: 5 KPIs + recent events + per-flock cards.
  Read-only. RLS handles tenant isolation. No audit emissions.

All compute is JSONB queries on tenant.poultry_event_log + joins to tenant.flocks.
Time window: last 7 days for time-bounded KPIs.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.rls import get_current_user, get_tenant_db
from app.schemas.envelope import success_envelope

router = APIRouter()


@router.get("/poultry/dashboard")
async def poultry_dashboard(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return composite dashboard payload for POULTRY group."""
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

    # KPI 1: total active flocks
    row = await db.execute(text("""
        SELECT COUNT(*) AS n FROM tenant.flocks WHERE is_active = TRUE
    """))
    active_flocks = row.scalar() or 0

    # KPI 2: total birds across active flocks
    row = await db.execute(text("""
        SELECT COALESCE(SUM(current_count), 0) AS n FROM tenant.flocks WHERE is_active = TRUE
    """))
    total_birds = row.scalar() or 0

    # KPI 3: eggs collected last 7d (sum payload_jsonb->>'qty_eggs' from EGGS_COLLECTED)
    row = await db.execute(text("""
        SELECT COALESCE(SUM((payload_jsonb->>'qty_eggs')::INT), 0) AS n
        FROM tenant.poultry_event_log
        WHERE event_type = 'EGGS_COLLECTED'
          AND occurred_at >= :since
    """), {"since": seven_days_ago})
    eggs_this_week = row.scalar() or 0

    # KPI 4: mortality last 7d / total birds (rate %)
    row = await db.execute(text("""
        SELECT COALESCE(SUM((payload_jsonb->>'qty_dead')::INT), 0) AS n
        FROM tenant.poultry_event_log
        WHERE event_type = 'MORTALITY_LOGGED'
          AND occurred_at >= :since
    """), {"since": seven_days_ago})
    mortality_count_7d = row.scalar() or 0
    baseline = total_birds + mortality_count_7d  # birds at start of week ≈ current + dead
    mortality_rate_pct = round((mortality_count_7d / baseline * 100), 2) if baseline > 0 else 0

    # KPI 5: revenue last 7d (EGGS_SOLD + BIRDS_SOLD total_revenue_fjd)
    row = await db.execute(text("""
        SELECT COALESCE(SUM((payload_jsonb->>'total_revenue_fjd')::NUMERIC), 0) AS n
        FROM tenant.poultry_event_log
        WHERE event_type IN ('EGGS_SOLD', 'BIRDS_SOLD')
          AND occurred_at >= :since
    """), {"since": seven_days_ago})
    revenue_fjd_this_week = float(row.scalar() or 0)

    # Recent 10 events
    result = await db.execute(text("""
        SELECT event_id, event_type, farm_id, pu_id, flock_id, occurred_at,
               created_at, payload_jsonb, created_by
        FROM tenant.poultry_event_log
        ORDER BY occurred_at DESC
        LIMIT 10
    """))
    recent_events = []
    for r in result.mappings().all():
        recent_events.append({
            "event_id": str(r["event_id"]),
            "event_type": r["event_type"],
            "farm_id": r["farm_id"],
            "pu_id": r["pu_id"],
            "flock_id": r["flock_id"],
            "occurred_at": r["occurred_at"].isoformat() if r["occurred_at"] else None,
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "payload": r["payload_jsonb"],
        })

    # Per-flock cards
    result = await db.execute(text("""
        SELECT
            f.flock_id, f.farm_id, f.flock_label, f.breed_id, f.current_pu_id,
            f.placed_date, f.placed_count, f.current_count, f.flock_type, f.lifecycle_status,
            (SELECT COALESCE(SUM((payload_jsonb->>'qty_eggs')::INT), 0)
               FROM tenant.poultry_event_log pel
               WHERE pel.event_type = 'EGGS_COLLECTED'
                 AND pel.flock_id = f.flock_id
                 AND pel.occurred_at >= :since) AS eggs_this_week,
            (SELECT COALESCE(SUM((payload_jsonb->>'qty_dead')::INT), 0)
               FROM tenant.poultry_event_log pel
               WHERE pel.event_type = 'MORTALITY_LOGGED'
                 AND pel.flock_id = f.flock_id
                 AND pel.occurred_at >= :since) AS mortality_this_week,
            EXTRACT(DAY FROM now() - f.placed_date) AS days_since_placed
        FROM tenant.flocks f
        WHERE f.is_active = TRUE
        ORDER BY f.placed_date DESC
    """), {"since": seven_days_ago})
    flock_cards = []
    for r in result.mappings().all():
        flock_cards.append({
            "flock_id": r["flock_id"],
            "farm_id": r["farm_id"],
            "flock_label": r["flock_label"],
            "breed_id": str(r["breed_id"]) if r["breed_id"] else None,
            "current_pu_id": r["current_pu_id"],
            "placed_date": r["placed_date"].isoformat() if r["placed_date"] else None,
            "placed_count": r["placed_count"],
            "current_count": r["current_count"],
            "flock_type": r["flock_type"],
            "lifecycle_status": r["lifecycle_status"],
            "eggs_this_week": int(r["eggs_this_week"] or 0),
            "mortality_this_week": int(r["mortality_this_week"] or 0),
            "days_since_placed": int(r["days_since_placed"] or 0),
        })

    # ─── TRENDS SECTION (Phase 6.7-2) ─────────────────────────
    # 30-day rolling window. Farm-wide aggregate (per-flock deferred to 6.7-3).

    eggs_daily = await db.execute(text("""
        SELECT
            date_trunc('day', occurred_at)::date AS day,
            SUM((payload_jsonb->>'qty_eggs')::numeric) AS eggs
        FROM tenant.poultry_event_log
        WHERE event_type = 'EGGS_COLLECTED'
          AND occurred_at > now() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
    """))
    eggs_series = [{"day": r.day.isoformat(), "eggs": int(r.eggs or 0)} for r in eggs_daily.fetchall()]

    mortality_daily = await db.execute(text("""
        SELECT
            date_trunc('day', occurred_at)::date AS day,
            SUM((payload_jsonb->>'qty_dead')::numeric) AS dead
        FROM tenant.poultry_event_log
        WHERE event_type = 'MORTALITY_LOGGED'
          AND occurred_at > now() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
    """))
    mortality_series = [{"day": r.day.isoformat(), "dead": int(r.dead or 0)} for r in mortality_daily.fetchall()]

    fcr_data = await db.execute(text("""
        WITH feed_consumed AS (
            SELECT COALESCE(SUM((payload_jsonb->>'qty_kg')::numeric), 0) AS feed_kg
            FROM tenant.poultry_event_log
            WHERE event_type = 'FEED_USED'
              AND occurred_at > now() - INTERVAL '30 days'
        ),
        eggs_produced AS (
            SELECT COALESCE(SUM((payload_jsonb->>'qty_eggs')::numeric), 0) AS eggs_count
            FROM tenant.poultry_event_log
            WHERE event_type = 'EGGS_COLLECTED'
              AND occurred_at > now() - INTERVAL '30 days'
        ),
        feed_consumed_prior AS (
            SELECT COALESCE(SUM((payload_jsonb->>'qty_kg')::numeric), 0) AS feed_kg
            FROM tenant.poultry_event_log
            WHERE event_type = 'FEED_USED'
              AND occurred_at BETWEEN now() - INTERVAL '60 days' AND now() - INTERVAL '30 days'
        ),
        eggs_produced_prior AS (
            SELECT COALESCE(SUM((payload_jsonb->>'qty_eggs')::numeric), 0) AS eggs_count
            FROM tenant.poultry_event_log
            WHERE event_type = 'EGGS_COLLECTED'
              AND occurred_at BETWEEN now() - INTERVAL '60 days' AND now() - INTERVAL '30 days'
        )
        SELECT
            (SELECT feed_kg FROM feed_consumed) AS curr_feed_kg,
            (SELECT eggs_count FROM eggs_produced) AS curr_eggs,
            (SELECT feed_kg FROM feed_consumed_prior) AS prior_feed_kg,
            (SELECT eggs_count FROM eggs_produced_prior) AS prior_eggs
    """))
    fcr_row = fcr_data.first()

    def safe_fcr(feed_kg, eggs_count):
        feed_kg = float(feed_kg or 0)
        eggs_count = float(eggs_count or 0)
        egg_kg = eggs_count * 0.060  # 60g per egg industry standard
        if egg_kg <= 0 or feed_kg <= 0:
            return None
        return round(feed_kg / egg_kg, 2)

    fcr_current = safe_fcr(fcr_row.curr_feed_kg, fcr_row.curr_eggs) if fcr_row else None
    fcr_prior = safe_fcr(fcr_row.prior_feed_kg, fcr_row.prior_eggs) if fcr_row else None
    fcr_trend = None
    if fcr_current is not None and fcr_prior is not None and fcr_prior > 0:
        # Lower FCR is BETTER (less feed per egg). Negative delta = improvement.
        pct_change = ((fcr_current - fcr_prior) / fcr_prior) * 100
        fcr_trend = {
            "delta_pct": round(pct_change, 1),
            "direction": "improving" if pct_change < 0 else ("worsening" if pct_change > 0 else "flat"),
        }

    trends_payload = {
        "window_days": 30,
        "eggs_daily": eggs_series,
        "mortality_daily": mortality_series,
        "fcr": {
            "current": fcr_current,
            "prior_period": fcr_prior,
            "trend": fcr_trend,
            "interpretation": "Lower is better. Industry layer benchmark: 2.0-2.5 kg feed per kg egg.",
            "feed_kg_30d": float(fcr_row.curr_feed_kg or 0) if fcr_row else 0,
            "eggs_30d": int(fcr_row.curr_eggs or 0) if fcr_row else 0,
        },
    }

    return success_envelope({
        "kpis": {
            "active_flocks": active_flocks,
            "total_birds": total_birds,
            "eggs_this_week": eggs_this_week,
            "mortality_rate_pct_7d": mortality_rate_pct,
            "revenue_fjd_this_week": revenue_fjd_this_week,
        },
        "recent_events": recent_events,
        "flock_cards": flock_cards,
        "trends": trends_payload,
        "window": {"days": 7, "since": seven_days_ago.isoformat()},
    })
