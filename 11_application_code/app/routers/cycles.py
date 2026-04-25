"""cycles.py — Thin router for production cycles. Delegates to cycle_service.

Routes:
  GET    /api/v1/cycles                       → list cycles
  POST   /api/v1/cycles                       → create cycle (rotation-gated)
  GET    /api/v1/cycles/{cycle_id}            → cycle detail
  GET    /api/v1/cycles/{cycle_id}/financials → financials with CoKG
  PATCH  /api/v1/cycles/{cycle_id}/close      → close cycle

Hard rule: rotation enforcement at the API layer (Layer 1) via
`tenant.validate_rotation()`. BLOCK → 409. AVOID without override → 409.
AVOID with override → 201 + audit row in tenant.rotation_override_log.
"""
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.rls import get_current_user, get_tenant_db
from app.schemas.envelope import error_envelope, success_envelope
from app.services import cycle_service
from app.services.rotation_service import validate_rotation as rotation_check

router = APIRouter()

_VALID_STATUSES = {"PLANNED", "ACTIVE", "HARVESTING", "CLOSING", "CLOSED", "FAILED"}


# ─── Schemas ──────────────────────────────────────────────────────────────────

class CycleCreate(BaseModel):
    pu_id: str
    production_id: str
    planting_date: date
    planned_area_sqm: Optional[float] = Field(default=None, gt=0)
    planned_yield_kg: Optional[float] = Field(default=None, gt=0)
    cycle_notes: Optional[str] = None
    override_reason: Optional[str] = None  # required iff rotation = AVOID


class CycleClose(BaseModel):
    closing_notes: Optional[str] = None


class CyclePatch(BaseModel):
    cycle_status: str
    notes: Optional[str] = None  # emitted into audit payload, NOT appended to cycle_notes

    @field_validator("cycle_status")
    @classmethod
    def _uppercase_status(cls, v: str) -> str:
        return v.upper() if v else v


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", summary="List production cycles")
async def list_cycles(
    farm_id: Optional[str] = Query(None),
    pu_id: Optional[str] = Query(None),
    cycle_status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    if cycle_status and cycle_status not in _VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=error_envelope(
                "INVALID_CYCLE_STATUS",
                f"cycle_status must be one of {sorted(_VALID_STATUSES)}",
            ),
        )

    # App-layer tenant scope (see get_cycle note on RLS bypass).
    filters = ["pc.tenant_id = :tid"]
    params: dict = {"limit": limit, "offset": offset, "tid": str(user["tenant_id"])}
    if farm_id:      filters.append("pc.farm_id = :farm_id");           params["farm_id"] = farm_id
    if pu_id:        filters.append("pc.pu_id = :pu_id");               params["pu_id"] = pu_id
    if cycle_status: filters.append("pc.cycle_status = :cycle_status"); params["cycle_status"] = cycle_status
    where = f"WHERE {' AND '.join(filters)}"

    rows = (await db.execute(
        text(f"""
            SELECT pc.cycle_id, pc.farm_id, pc.pu_id, pc.zone_id, pc.production_id,
                   p.production_name, pc.cycle_status, pc.planting_date,
                   pc.expected_harvest_date, pc.actual_yield_kg, pc.cogk_fjd_per_kg,
                   pc.created_at,
                   pc.farmer_label,
                   pu.farmer_label AS pu_farmer_label
            FROM   tenant.production_cycles pc
            JOIN   shared.productions p ON p.production_id = pc.production_id
            LEFT JOIN tenant.production_units pu ON pu.pu_id = pc.pu_id
            {where}
            ORDER BY pc.planting_date DESC, pc.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )).mappings().all()
    cycles = [dict(r) for r in rows]
    return success_envelope(
        {"cycles": cycles},
        meta={"limit": limit, "offset": offset, "count": len(cycles)},
    )


@router.post("/rotation-check", summary="Pre-flight rotation check (no insert)")
async def rotation_pre_check(
    payload: CycleCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    result = await rotation_check(
        db,
        pu_id=payload.pu_id,
        production_id=payload.production_id,
        planting_date=payload.planting_date,
        tenant_id=str(user["tenant_id"]),
    )
    return success_envelope(result)


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create production cycle")
async def create_cycle(
    payload: CycleCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    try:
        result = await cycle_service.create_cycle(
            db,
            pu_id=payload.pu_id,
            production_id=payload.production_id,
            planting_date=payload.planting_date,
            planned_area_sqm=payload.planned_area_sqm,
            planned_yield_kg=payload.planned_yield_kg,
            cycle_notes=payload.cycle_notes,
            created_by_user_id=str(user["user_id"]),
            tenant_id=str(user["tenant_id"]),
            override_reason=payload.override_reason,
        )
    except ValueError as e:
        msg = str(e)
        if msg.startswith("ROTATION_BLOCKED") or msg.startswith("ROTATION_AVOID"):
            # Re-run rotation_check to surface full payload (alternatives etc.)
            payload_data = await rotation_check(
                db,
                pu_id=payload.pu_id,
                production_id=payload.production_id,
                planting_date=payload.planting_date,
                tenant_id=str(user["tenant_id"]),
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=error_envelope("ROTATION_VIOLATION", msg, data=payload_data),
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_envelope("CYCLE_CREATE_FAILED", msg),
        )
    await db.commit()
    return success_envelope(result)


@router.get("/{cycle_id}", summary="Cycle detail")
async def get_cycle(
    cycle_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    # App-layer tenant scope. RLS is currently bypassed by the teivaka DB
    # role (SUPERUSER+BYPASSRLS — see Phase 4.2 Step 5-6 deferred notes),
    # so explicit tenant_id filter is the enforced isolation boundary.
    row = (await db.execute(
        text("""
            SELECT pc.*, p.production_name,
                   pu.farmer_label AS pu_farmer_label
            FROM   tenant.production_cycles pc
            JOIN   shared.productions p ON p.production_id = pc.production_id
            LEFT JOIN tenant.production_units pu ON pu.pu_id = pc.pu_id
            WHERE  pc.cycle_id = :cid AND pc.tenant_id = :tid
        """),
        {"cid": cycle_id, "tid": str(user["tenant_id"])},
    )).mappings().first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_envelope("CYCLE_NOT_FOUND", f"Cycle {cycle_id!r} not found"),
        )
    return success_envelope(dict(row))


@router.get("/{cycle_id}/financials", summary="Cycle financials — CoKG first")
async def get_cycle_financials(
    cycle_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    try:
        result = await cycle_service.get_cycle_financials(db, cycle_id=cycle_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_envelope("CYCLE_NOT_FOUND", str(e)),
        )
    return success_envelope(result)


@router.patch("/{cycle_id}", summary="Transition cycle_status (state machine)")
async def patch_cycle(
    cycle_id: str,
    payload: CyclePatch,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    if payload.cycle_status not in _VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=error_envelope(
                "INVALID_CYCLE_STATUS",
                f"cycle_status must be one of {sorted(_VALID_STATUSES)}",
            ),
        )
    try:
        result = await cycle_service.transition_cycle_status(
            db,
            cycle_id=cycle_id,
            target_status=payload.cycle_status,
            actor_user_id=str(user["user_id"]),
            tenant_id=str(user["tenant_id"]),
            notes=payload.notes,
        )
    except LookupError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_envelope("CYCLE_NOT_FOUND", f"Cycle {cycle_id!r} not found"),
        )
    except ValueError as e:
        msg = str(e)
        code = msg.split(":", 1)[0] if ":" in msg else "CYCLE_TRANSITION_INVALID"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=error_envelope(code, msg),
        )
    await db.commit()
    return success_envelope(result)


@router.patch("/{cycle_id}/close", summary="Close production cycle (sugar → PATCH)")
async def close_cycle(
    cycle_id: str,
    payload: CycleClose,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    try:
        result = await cycle_service.close_cycle(
            db,
            cycle_id=cycle_id,
            closed_by_user_id=str(user["user_id"]),
            closing_notes=payload.closing_notes,
            tenant_id=str(user["tenant_id"]),
        )
    except LookupError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_envelope("CYCLE_NOT_FOUND", f"Cycle {cycle_id!r} not found"),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=error_envelope("CYCLE_CLOSE_FAILED", str(e)),
        )
    await db.commit()
    return success_envelope(result)
