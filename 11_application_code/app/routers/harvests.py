"""harvests.py — Thin router; delegates to harvest_service.

Routes:
  POST   /api/v1/harvests/compliance-check  → pre-flight (no insert)
  POST   /api/v1/harvests                   → log harvest
  GET    /api/v1/harvests                   → list with filters
  GET    /api/v1/harvests/{harvest_id}      → detail

Hard enforcement of WHD compliance lives in the DB trigger
`tenant.enforce_harvest_compliance` (migration 015a). This router's
pre-check is a UX convenience for clean HTTP 409 responses.
"""
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.rls import get_current_user, get_tenant_db
from app.services import harvest_service

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ComplianceCheckRequest(BaseModel):
    cycle_id: str
    pu_id: str
    harvest_date: date


class HarvestCreate(BaseModel):
    cycle_id: str
    pu_id: str
    harvest_date: date
    qty_kg: Decimal = Field(gt=0)
    grade: Optional[str] = None  # A | B | C
    destination: Optional[str] = None  # NAYANS | MARKET | WASTE | etc.
    compliance_override: bool = False
    override_reason: Optional[str] = None
    idempotency_key: Optional[str] = None

    @field_validator("grade")
    @classmethod
    def grade_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.upper().strip()
        if v not in ("A", "B", "C"):
            raise ValueError("grade must be A, B, or C")
        return v


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/compliance-check", summary="Pre-flight WHD compliance check (no insert)")
async def compliance_check(
    payload: ComplianceCheckRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    return await harvest_service.check_chemical_compliance(
        db,
        cycle_id=payload.cycle_id,
        pu_id=payload.pu_id,
        harvest_date=payload.harvest_date,
    )


@router.post("", status_code=status.HTTP_201_CREATED, summary="Log a harvest")
async def create_harvest(
    payload: HarvestCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    result = await harvest_service.log_harvest(
        db,
        tenant_id=str(user["tenant_id"]),
        recorded_by=str(user["user_id"]),
        cycle_id=payload.cycle_id,
        pu_id=payload.pu_id,
        harvest_date=payload.harvest_date,
        qty_kg=payload.qty_kg,
        grade=payload.grade,
        destination=payload.destination,
        compliance_override=payload.compliance_override,
        override_reason=payload.override_reason,
        idempotency_key=payload.idempotency_key,
    )
    await db.commit()
    return result


@router.get("", summary="List harvests")
async def list_harvests(
    farm_id:   Optional[str] = Query(None),
    pu_id:     Optional[str] = Query(None),
    cycle_id:  Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to:   Optional[date] = Query(None),
    limit:     int = Query(50, ge=1, le=500),
    offset:    int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    rows = await harvest_service.list_harvests(
        db,
        farm_id=farm_id, pu_id=pu_id, cycle_id=cycle_id,
        date_from=date_from, date_to=date_to,
        limit=limit, offset=offset,
    )
    return {"harvests": rows, "limit": limit, "offset": offset}


@router.get("/{harvest_id}", summary="Harvest detail")
async def get_harvest(
    harvest_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    row = await harvest_service.get_harvest(db, harvest_id=harvest_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Harvest not found")
    return row
