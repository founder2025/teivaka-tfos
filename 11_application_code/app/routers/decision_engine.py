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
    farm_id: str,
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

    # Live read from the real engine output (decision_signal_snapshots, latest
    # snapshot per signal) joined to its config — NOT the never-built phantom MV
    # (mv_decision_signals_current was defined against a different shape and the
    # endpoint read columns that never existed). Always-current; no refresh job.
    # Only AMBER/RED are returned — GREEN = healthy, not "what the farm is telling
    # you". status → severity: RED=CRITICAL, AMBER=HIGH.
    params: dict = {"farm_id": str(farm_id), "tid": str(user["tenant_id"]), "limit": limit}
    outer = ["latest.signal_status IN ('RED','AMBER')"]
    if severity:
        outer.append("latest.severity = :severity")
        params["severity"] = severity.upper()
    if signal_type:
        outer.append("(upper(latest.signal_type) = :signal_type OR upper(latest.signal_category) = :signal_type)")
        params["signal_type"] = signal_type.upper()
    outer_where = " AND ".join(outer)

    result = await db.execute(
        text(f"""
            SELECT latest.signal_id, latest.signal_type, latest.signal_category,
                   latest.severity, latest.signal_message, latest.suggested_action,
                   latest.crop_name, latest.metric_value, latest.signal_status,
                   latest.computed_at
            FROM (
                SELECT DISTINCT ON (dss.signal_id)
                    dss.signal_id,
                    dsc.signal_name                                              AS signal_type,
                    dsc.signal_category,
                    CASE dss.signal_status WHEN 'RED' THEN 'CRITICAL'
                                           WHEN 'AMBER' THEN 'HIGH'
                                           ELSE 'LOW' END                        AS severity,
                    COALESCE(dss.notes, dsc.signal_name)                         AS signal_message,
                    dss.notes                                                    AS suggested_action,
                    NULL::text                                                   AS crop_name,
                    dss.computed_value                                           AS metric_value,
                    dss.signal_status,
                    dss.snapshot_date                                            AS computed_at
                FROM tenant.decision_signal_snapshots dss
                JOIN tenant.decision_signal_config dsc
                  ON dsc.signal_id = dss.signal_id AND dsc.tenant_id = dss.tenant_id
                WHERE dss.farm_id = :farm_id AND dss.tenant_id = :tid AND dsc.is_active = true
                ORDER BY dss.signal_id, dss.snapshot_date DESC
            ) latest
            WHERE {outer_where}
            ORDER BY CASE latest.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
                     latest.computed_at DESC
            LIMIT :limit
        """),
        params,
    )
    signals = [dict(r) for r in result.mappings().all()]

    last_row = (await db.execute(
        text("""
            SELECT MAX(snapshot_date) AS last_at
            FROM tenant.decision_signal_snapshots
            WHERE farm_id = :farm_id AND tenant_id = :tid
        """),
        {"farm_id": str(farm_id), "tid": str(user["tenant_id"])},
    )).mappings().first()

    return {
        "farm_id": str(farm_id),
        "farm_code": farm["farm_code"],
        "signals": signals,
        "total_signals": len(signals),
        "last_refresh_at": str(last_row["last_at"]) if last_row and last_row["last_at"] else None,
        "note": "Live from decision_signal_snapshots (latest per signal); AMBER/RED only.",
    }


@router.get("/{farm_id}/summary", summary="Decision signal summary by type and severity")
async def get_signal_summary(
    farm_id: str,
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

    # Aggregate the latest snapshot per signal (live), AMBER/RED only.
    rows = (await db.execute(
        text("""
            SELECT severity, signal_type, COUNT(*) AS count
            FROM (
                SELECT DISTINCT ON (dss.signal_id)
                    CASE dss.signal_status WHEN 'RED' THEN 'CRITICAL'
                                           WHEN 'AMBER' THEN 'HIGH'
                                           ELSE 'LOW' END AS severity,
                    dsc.signal_name AS signal_type,
                    dss.signal_status
                FROM tenant.decision_signal_snapshots dss
                JOIN tenant.decision_signal_config dsc
                  ON dsc.signal_id = dss.signal_id AND dsc.tenant_id = dss.tenant_id
                WHERE dss.farm_id = :farm_id AND dss.tenant_id = :tid AND dsc.is_active = true
                ORDER BY dss.signal_id, dss.snapshot_date DESC
            ) latest
            WHERE latest.signal_status IN ('RED','AMBER')
            GROUP BY severity, signal_type
        """),
        {"farm_id": str(farm_id), "tid": str(user["tenant_id"])},
    )).mappings().all()
    by_severity: dict = {}
    by_type = []
    for r in rows:
        by_severity[r["severity"]] = by_severity.get(r["severity"], 0) + int(r["count"])
        by_type.append({"signal_type": r["signal_type"], "severity": r["severity"], "count": int(r["count"])})

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
    farm_id: Optional[str] = Query(None, description="If omitted, refreshes all farms for tenant"),
    user: dict = Depends(require_role("FOUNDER")),
    db: AsyncSession = Depends(get_tenant_db),
):
    """
    Forces a refresh of the mv_decision_signals_current materialised view.
    Normally this runs on a cron schedule every 15 minutes.
    FOUNDER role required.

    Note: A full concurrent refresh may take several seconds on large farms.
    """
    # Signals are now read live from decision_signal_snapshots (latest per
    # signal) — there is no materialized view to refresh. Kept as a no-op
    # success so any existing caller / button does not 500. The decision engine
    # worker still writes fresh snapshots on its own schedule.
    logger.info(f"decision-signals refresh requested by FOUNDER {user['user_id']} farm_id={farm_id} — no-op (always-live)")

    return {
        "status": "ok",
        "message": "Signals are read live from decision_signal_snapshots — no refresh needed.",
        "triggered_by": str(user["user_id"]),
    }
