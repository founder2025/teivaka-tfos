"""
decision_engine.py — Decision Engine endpoints.

Routes:
  GET /decision-engine/{farm_id}           → read from mv_decision_signals_current
  GET /decision-engine/{farm_id}/summary   → aggregated signal counts by type/severity
  POST /decision-engine/refresh            → manually trigger MV refresh (FOUNDER only)
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional
from uuid import UUID
import logging

from app.middleware.rls import get_current_user, get_tenant_db, require_role

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/{farm_id}", summary="Decision signals for farm")
async def get_decision_signals(
    farm_id: UUID,
    severity: Optional[str] = Query(None, description="Filter: CRITICAL | HIGH | MEDIUM | LOW"),
    signal_type: Optional[str] = Query(None, description="Filter by signal type"),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """
    Reads current decision signals from the mv_decision_signals_current
    materialised view.

    IMPORTANT: This endpoint NEVER computes signals on demand. It always
    reads the pre-computed MV which is refreshed on a schedule (default: 15 min).
    This ensures sub-100ms response times regardless of farm complexity.

    Signal types include:
    - INACTIVITY: Zone/crop not recorded in N days
    - ROTATION_DUE: Rotation window approaching
    - KAVA_STRESS: Kava-specific inactivity (180+ days)
    - HARVEST_OVERDUE: Expected harvest date passed
    - CHEMICAL_WINDOW: Approaching chemical withholding period end
    - LOW_STOCK: Input inventory below minimum threshold
    - CYCLE_COST: CoKG exceeding benchmark for crop type
    - WEATHER_RISK: Weather-triggered advisory (if weather module active)
    """
    # Verify farm belongs to tenant (RLS handles cross-tenant, but good UX)
    farm_check = await db.execute(
        text("SELECT farm_id, farm_code FROM tenant.farms WHERE farm_id = :fid"),
        {"fid": str(farm_id)},
    )
    farm = farm_check.mappings().first()
    if not farm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found")

    filters = ["farm_id = :farm_id"]
    params: dict = {"farm_id": str(farm_id), "limit": limit}

    if severity:
        filters.append("severity = :severity")
        params["severity"] = severity.upper()

    if signal_type:
        filters.append("signal_type = :signal_type")
        params["signal_type"] = signal_type.upper()

    where_clause = f"WHERE {' AND '.join(filters)}"

    result = await db.execute(
        text(f"""
            SELECT
                zone_id,
                zone_code,
                production_unit_id,
                crop_name,
                crop_family,
                signal_type,
                severity,
                signal_message,
                suggested_action,
                days_since_event,
                metric_value,
                benchmark_value,
                computed_at
            FROM tenant.mv_decision_signals_current
            {where_clause}
            ORDER BY
                CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
                days_since_event DESC
            LIMIT :limit
        """),
        params,
    )
    signals = [dict(r) for r in result.mappings().all()]

    # Get the timestamp of the last MV refresh
    mv_meta_result = await db.execute(
        text("""
            SELECT MAX(computed_at) AS last_refresh_at
            FROM tenant.mv_decision_signals_current
            WHERE farm_id = :farm_id
        """),
        {"farm_id": str(farm_id)},
    )
    mv_meta = mv_meta_result.mappings().first()

    return {
        "farm_id": str(farm_id),
        "farm_code": farm["farm_code"],
        "signals": signals,
        "total_signals": len(signals),
        "last_refresh_at": str(mv_meta["last_refresh_at"]) if mv_meta and mv_meta["last_refresh_at"] else None,
        "note": "Signals are pre-computed. Use POST /decision-engine/refresh to force a refresh.",
    }


@router.get("/{farm_id}/summary", summary="Decision signal summary by type and severity")
async def get_signal_summary(
    farm_id: UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """
    Returns aggregated counts of signals by type and severity for a farm.
    Used by dashboard widgets and mobile notification badges.
    """
    farm_check = await db.execute(
        text("SELECT farm_id, farm_code FROM tenant.farms WHERE farm_id = :fid"),
        {"fid": str(farm_id)},
    )
    farm = farm_check.mappings().first()
    if not farm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found")

    # By severity
    severity_result = await db.execute(
        text("""
            SELECT
                severity,
                COUNT(*) AS count
            FROM tenant.mv_decision_signals_current
            WHERE farm_id = :farm_id
            GROUP BY severity
            ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END
        """),
        {"farm_id": str(farm_id)},
    )
    by_severity = {r["severity"]: r["count"] for r in severity_result.mappings().all()}

    # By type
    type_result = await db.execute(
        text("""
            SELECT
                signal_type,
                severity,
                COUNT(*) AS count
            FROM tenant.mv_decision_signals_current
            WHERE farm_id = :farm_id
            GROUP BY signal_type, severity
            ORDER BY signal_type, CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END
        """),
        {"farm_id": str(farm_id)},
    )
    by_type = [dict(r) for r in type_result.mappings().all()]

    total = sum(by_severity.values())
    critical_count = by_severity.get("CRITICAL", 0)
    high_count = by_severity.get("HIGH", 0)

    return {
        "farm_id": str(farm_id),
        "farm_code": farm["farm_code"],
        "total_signals": total,
        "requires_immediate_action": critical_count > 0,
        "by_severity": by_severity,
        "by_type": by_type,
        "badge_count": critical_count + high_count,  # for mobile notification badge
    }


@router.post("/refresh", summary="Manually refresh decision signals MV (FOUNDER only)")
async def refresh_decision_signals(
    farm_id: Optional[UUID] = Query(None, description="If omitted, refreshes all farms for tenant"),
    user: dict = Depends(require_role("FOUNDER")),
    db: AsyncSession = Depends(get_tenant_db),
):
    """
    Forces a refresh of the mv_decision_signals_current materialised view.
    Normally this runs on a cron schedule every 15 minutes.
    FOUNDER role required.

    Note: A full concurrent refresh may take several seconds on large farms.
    """
    try:
        # CONCURRENTLY allows reads during refresh but requires a unique index
        await db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY tenant.mv_decision_signals_current"))
        logger.info(f"MV refresh triggered by FOUNDER {user['user_id']} farm_id={farm_id}")
    except Exception as e:
        logger.error(f"MV refresh failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Materialized view refresh failed. Check DB logs.",
        )

    return {
        "status": "refreshed",
        "message": "mv_decision_signals_current refreshed successfully",
        "triggered_by": str(user["user_id"]),
    }
