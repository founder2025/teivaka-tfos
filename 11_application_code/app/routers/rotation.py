"""
rotation.py — Rotation engine endpoints.

Routes:
  POST /rotation/validate   → call shared.validate_rotation() and return full result
  GET  /rotation/history    → view rotation history for a zone
  GET  /rotation/rules      → list shared rotation rules (crop compatibility matrix)
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import date
import logging

from app.middleware.rls import get_current_user, get_tenant_db

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class RotationValidateRequest(BaseModel):
    zone_id: UUID
    production_unit_id: UUID
    planned_plant_date: date


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/validate", summary="Validate rotation for zone + crop + date")
async def validate_rotation(
    payload: RotationValidateRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """
    Calls the shared.validate_rotation() PostgreSQL function and returns the full result.

    The function evaluates:
    - Minimum rest period since last crop of same family
    - Chemical withholding period compliance
    - Nitrogen fixation sequencing
    - F002 ferry supply buffer for island farms

    Response includes:
    - status: ALLOW | WARN | BLOCK
    - message: human-readable explanation
    - alternatives: list of recommended (crop, date) alternatives if BLOCK
    - days_since_last_same_family: integer days
    - rotation_score: 0.0-1.0 (higher = better rotation choice)
    """
    try:
        result = await db.execute(
            text("""
                SELECT shared.validate_rotation(
                    CAST(:zone_id AS uuid),
                    CAST(:production_unit_id AS uuid),
                    CAST(:planned_plant_date AS date)
                ) AS result
            """),
            {
                "zone_id": str(payload.zone_id),
                "production_unit_id": str(payload.production_unit_id),
                "planned_plant_date": payload.planned_plant_date.isoformat(),
            },
        )
        rotation_result = result.scalar()
    except Exception as e:
        logger.error(f"validate_rotation DB function error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Rotation validation function failed. Ensure shared.validate_rotation() is deployed.",
        )

    if not rotation_result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Rotation function returned null",
        )

    # Normalise to dict in case DB returns a JSON object
    if isinstance(rotation_result, dict):
        result_dict = rotation_result
    else:
        result_dict = dict(rotation_result)

    return {
        "validation": result_dict,
        "request": {
            "zone_id": str(payload.zone_id),
            "production_unit_id": str(payload.production_unit_id),
            "planned_plant_date": payload.planned_plant_date.isoformat(),
        },
    }


@router.get("/history", summary="Rotation history for a zone")
async def rotation_history(
    zone_id: UUID = Query(..., description="Zone to query"),
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """
    Returns the planting history for a zone in reverse chronological order.
    Used by the rotation engine and displayed in zone detail views.
    """
    result = await db.execute(
        text("""
            SELECT
                pc.cycle_id,
                pc.cycle_code,
                pu.crop_name,
                pu.crop_family,
                pu.crop_category,
                pc.planted_date,
                pc.actual_harvest_date,
                pc.status,
                CASE
                    WHEN pc.actual_harvest_date IS NOT NULL
                    THEN (CURRENT_DATE - pc.actual_harvest_date)
                    ELSE NULL
                END AS days_since_harvest
            FROM tenant.production_cycles pc
            JOIN tenant.production_units pu ON pu.production_unit_id = pc.production_unit_id
            WHERE pc.zone_id = :zone_id
            ORDER BY pc.planted_date DESC
            LIMIT :limit
        """),
        {"zone_id": str(zone_id), "limit": limit},
    )
    rows = result.mappings().all()
    return {
        "zone_id": str(zone_id),
        "history": [dict(r) for r in rows],
        "total_returned": len(rows),
    }


@router.get("/rules", summary="List rotation rules (crop compatibility matrix)")
async def list_rotation_rules(
    crop_family: Optional[str] = Query(None, description="Filter by crop family"),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """
    Returns the shared rotation rules table.
    Rules are in the shared schema and visible to all tenants.
    Used by the rotation engine and for farmer education.
    """
    filters = []
    params: dict = {}

    if crop_family:
        filters.append("preceding_crop_family ILIKE :crop_family OR following_crop_family ILIKE :crop_family")
        params["crop_family"] = f"%{crop_family}%"

    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""

    result = await db.execute(
        text(f"""
            SELECT
                rule_id,
                preceding_crop_family,
                following_crop_family,
                min_rest_days,
                recommendation,
                rotation_score_modifier,
                notes
            FROM shared.rotation_rules
            {where_clause}
            ORDER BY preceding_crop_family, following_crop_family
        """),
        params,
    )
    rows = result.mappings().all()
    return {"rules": [dict(r) for r in rows], "total": len(rows)}
