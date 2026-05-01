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
               payload_jsonb, created_by
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
        "window": {"days": 7, "since": seven_days_ago.isoformat()},
    })
