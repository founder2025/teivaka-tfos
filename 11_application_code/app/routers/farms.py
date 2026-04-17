"""
farms.py — Farm management endpoints.

Routes:
  GET  /farms                    → list all farms for tenant
  POST /farms                    → create new farm (FOUNDER only)
  GET  /farms/{farm_id}          → farm detail
  GET  /farms/{farm_id}/dashboard → farm dashboard (signals + cycles + alerts)
  PATCH /farms/{farm_id}         → update farm (FOUNDER/MANAGER only)
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel, field_validator
from typing import Optional
from uuid import UUID
import logging

from app.middleware.rls import get_current_user, get_tenant_db, require_role

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class FarmCreate(BaseModel):
    farm_code: str
    farm_name: str
    location_description: Optional[str] = None
    island: Optional[str] = None
    total_area_ha: Optional[float] = None
    notes: Optional[str] = None

    @field_validator("farm_code")
    @classmethod
    def farm_code_upper(cls, v: str) -> str:
        return v.upper().strip()


class FarmUpdate(BaseModel):
    farm_name: Optional[str] = None
    location_description: Optional[str] = None
    island: Optional[str] = None
    total_area_ha: Optional[float] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", summary="List all farms for tenant")
async def list_farms(
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    island: Optional[str] = Query(None, description="Filter by island name"),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """
    Returns all farms belonging to the authenticated user's tenant.
    RLS ensures cross-tenant isolation automatically.
    """
    filters = []
    params: dict = {}

    if is_active is not None:
        filters.append("f.is_active = :is_active")
        params["is_active"] = is_active

    if island:
        filters.append("f.island ILIKE :island")
        params["island"] = f"%{island}%"

    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""

    result = await db.execute(
        text(f"""
            SELECT
                f.farm_id,
                f.farm_code,
                f.farm_name,
                f.location_description,
                f.island,
                f.total_area_ha,
                f.is_active,
                f.notes,
                f.created_at,
                COUNT(DISTINCT z.zone_id) AS zone_count,
                COUNT(DISTINCT pc.cycle_id) FILTER (WHERE pc.status = 'ACTIVE') AS active_cycles,
                COUNT(DISTINCT a.alert_id) FILTER (WHERE a.status = 'OPEN') AS open_alerts
            FROM tenant.farms f
            LEFT JOIN tenant.zones z ON z.farm_id = f.farm_id
            LEFT JOIN tenant.production_cycles pc ON pc.farm_id = f.farm_id
            LEFT JOIN tenant.alerts a ON a.farm_id = f.farm_id
            {where_clause}
            GROUP BY f.farm_id
            ORDER BY f.farm_code
        """),
        params,
    )
    rows = result.mappings().all()
    return {"farms": [dict(r) for r in rows], "total": len(rows)}


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create farm")
async def create_farm(
    payload: FarmCreate,
    user: dict = Depends(require_role("FOUNDER")),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Creates a new farm under the current tenant. FOUNDER role required."""
    # Check farm_code uniqueness within tenant (RLS handles cross-tenant)
    exists = await db.execute(
        text("SELECT 1 FROM tenant.farms WHERE farm_code = :code"),
        {"code": payload.farm_code},
    )
    if exists.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Farm code '{payload.farm_code}' already exists",
        )

    result = await db.execute(
        text("""
            INSERT INTO tenant.farms
                (farm_code, farm_name, location_description, island, total_area_ha, notes)
            VALUES
                (:farm_code, :farm_name, :location_description, :island, :total_area_ha, :notes)
            RETURNING farm_id, farm_code, farm_name, location_description,
                      island, total_area_ha, is_active, notes, created_at
        """),
        payload.model_dump(),
    )
    row = result.mappings().first()
    logger.info(f"Farm created: {row['farm_code']} by user {user['user_id']}")
    return dict(row)


@router.get("/{farm_id}", summary="Farm detail")
async def get_farm(
    farm_id: UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Returns full detail for a single farm including zone summary."""
    result = await db.execute(
        text("""
            SELECT
                f.farm_id,
                f.farm_code,
                f.farm_name,
                f.location_description,
                f.island,
                f.total_area_ha,
                f.is_active,
                f.notes,
                f.created_at,
                f.updated_at,
                COUNT(DISTINCT z.zone_id) AS zone_count,
                COALESCE(SUM(z.area_ha), 0) AS zones_area_ha,
                COUNT(DISTINCT pc.cycle_id) FILTER (WHERE pc.status = 'ACTIVE') AS active_cycles,
                COUNT(DISTINCT pc.cycle_id) FILTER (WHERE pc.status = 'CLOSED') AS closed_cycles,
                COUNT(DISTINCT a.alert_id) FILTER (WHERE a.status = 'OPEN' AND a.severity = 'CRITICAL') AS critical_alerts,
                COUNT(DISTINCT a.alert_id) FILTER (WHERE a.status = 'OPEN') AS open_alerts
            FROM tenant.farms f
            LEFT JOIN tenant.zones z ON z.farm_id = f.farm_id
            LEFT JOIN tenant.production_cycles pc ON pc.farm_id = f.farm_id
            LEFT JOIN tenant.alerts a ON a.farm_id = f.farm_id
            WHERE f.farm_id = :farm_id
            GROUP BY f.farm_id
        """),
        {"farm_id": str(farm_id)},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found")
    return dict(row)


@router.get("/{farm_id}/dashboard", summary="Farm dashboard")
async def farm_dashboard(
    farm_id: UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """
    Returns a consolidated farm dashboard view:
    - Decision signals from mv_decision_signals_current (materialised view)
    - Active production cycles with CoKG
    - Open alerts grouped by severity
    - Recent harvests (last 10)
    """
    farm_id_str = str(farm_id)

    # Verify farm exists and belongs to tenant
    farm_check = await db.execute(
        text("SELECT farm_id, farm_code, farm_name FROM tenant.farms WHERE farm_id = :fid"),
        {"fid": farm_id_str},
    )
    farm = farm_check.mappings().first()
    if not farm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found")

    # Decision signals from materialised view
    signals_result = await db.execute(
        text("""
            SELECT
                zone_id, zone_code, production_unit_id, crop_name,
                signal_type, severity, signal_message,
                suggested_action, days_since_event, computed_at
            FROM tenant.mv_decision_signals_current
            WHERE farm_id = :fid
            ORDER BY
                CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
                days_since_event DESC
            LIMIT 20
        """),
        {"fid": farm_id_str},
    )
    signals = [dict(r) for r in signals_result.mappings().all()]

    # Active cycles with basic financials
    cycles_result = await db.execute(
        text("""
            SELECT
                pc.cycle_id,
                pc.cycle_code,
                z.zone_code,
                pu.crop_name,
                pc.status,
                pc.planted_date,
                pc.expected_harvest_date,
                pc.actual_harvest_date,
                COALESCE(h_agg.total_qty_kg, 0) AS harvested_kg,
                COALESCE(cost_agg.total_cost, 0) AS total_cost,
                CASE
                    WHEN COALESCE(h_agg.total_qty_kg, 0) > 0
                    THEN ROUND(COALESCE(cost_agg.total_cost, 0) / h_agg.total_qty_kg, 4)
                    ELSE NULL
                END AS cokg
            FROM tenant.production_cycles pc
            JOIN tenant.zones z ON z.zone_id = pc.zone_id
            JOIN tenant.production_units pu ON pu.production_unit_id = pc.production_unit_id
            LEFT JOIN (
                SELECT cycle_id, SUM(quantity_kg) AS total_qty_kg
                FROM tenant.harvests
                WHERE is_compliant = true
                GROUP BY cycle_id
            ) h_agg ON h_agg.cycle_id = pc.cycle_id
            LEFT JOIN (
                SELECT cycle_id,
                    SUM(labor_cost) + SUM(input_cost) + SUM(other_cost) AS total_cost
                FROM tenant.cycle_cost_summary
                GROUP BY cycle_id
            ) cost_agg ON cost_agg.cycle_id = pc.cycle_id
            WHERE pc.farm_id = :fid AND pc.status = 'ACTIVE'
            ORDER BY pc.planted_date DESC
        """),
        {"fid": farm_id_str},
    )
    active_cycles = [dict(r) for r in cycles_result.mappings().all()]

    # Open alerts by severity
    alerts_result = await db.execute(
        text("""
            SELECT
                alert_id, alert_type, severity, title, message,
                zone_id, production_unit_id, created_at, due_date
            FROM tenant.alerts
            WHERE farm_id = :fid AND status = 'OPEN'
            ORDER BY
                CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
                created_at DESC
            LIMIT 20
        """),
        {"fid": farm_id_str},
    )
    open_alerts = [dict(r) for r in alerts_result.mappings().all()]

    # Recent harvests
    harvests_result = await db.execute(
        text("""
            SELECT
                h.harvest_id, h.harvest_date,
                z.zone_code, pu.crop_name,
                h.quantity_kg, h.grade, h.is_compliant,
                h.sold_to_customer_id, h.sale_price_per_kg
            FROM tenant.harvests h
            JOIN tenant.production_cycles pc ON pc.cycle_id = h.cycle_id
            JOIN tenant.zones z ON z.zone_id = pc.zone_id
            JOIN tenant.production_units pu ON pu.production_unit_id = pc.production_unit_id
            WHERE pc.farm_id = :fid
            ORDER BY h.harvest_date DESC
            LIMIT 10
        """),
        {"fid": farm_id_str},
    )
    recent_harvests = [dict(r) for r in harvests_result.mappings().all()]

    return {
        "farm": dict(farm),
        "decision_signals": signals,
        "active_cycles": active_cycles,
        "open_alerts": open_alerts,
        "recent_harvests": recent_harvests,
        "summary": {
            "signal_count": len(signals),
            "critical_signals": sum(1 for s in signals if s["severity"] == "CRITICAL"),
            "active_cycle_count": len(active_cycles),
            "open_alert_count": len(open_alerts),
            "critical_alert_count": sum(1 for a in open_alerts if a["severity"] == "CRITICAL"),
        },
    }


@router.patch("/{farm_id}", summary="Update farm")
async def update_farm(
    farm_id: UUID,
    payload: FarmUpdate,
    user: dict = Depends(require_role("FOUNDER", "MANAGER")),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Updates editable farm fields. FOUNDER or MANAGER role required."""
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    set_clauses = ", ".join(f"{col} = :{col}" for col in updates)
    updates["farm_id"] = str(farm_id)

    result = await db.execute(
        text(f"""
            UPDATE tenant.farms
            SET {set_clauses}, updated_at = NOW()
            WHERE farm_id = :farm_id
            RETURNING farm_id, farm_code, farm_name, location_description,
                      island, total_area_ha, is_active, notes, updated_at
        """),
        updates,
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found")

    logger.info(f"Farm {farm_id} updated by user {user['user_id']}")
    return dict(row)
