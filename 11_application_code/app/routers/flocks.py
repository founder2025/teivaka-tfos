"""Flocks resource endpoints — Phase 6.2-2.

GET /api/v1/flocks[?farm_id=...&is_active=...&lifecycle_status=...]
  - List flocks for the session's tenant; optional filters
  - Auth required (any role)

POST /api/v1/flocks
  - Body: {farm_id, flock_label, breed_id, current_pu_id?, placed_date, placed_count, flock_type, notes?}
  - Server-generates flock_id as <farm_id>-FLK<NNN>
  - INSERT new flock + emit FLOCK_PLACED audit event
  - Initial lifecycle_status = PLACED, current_count = placed_count, is_active = TRUE
  - Auth required (FOUNDER or OWNER or MANAGER or FARMER)

PATCH (Phase 6.4) and DELETE blocker (Phase 6.4) ship in subsequent phases.
"""

import json
from datetime import date as date_type
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_chain import emit_audit_event
from app.middleware.rls import get_current_user, get_tenant_db
from app.schemas.envelope import error_envelope, success_envelope


router = APIRouter()

VALID_FLOCK_TYPES = {"LAYER", "BROILER", "DUAL_PURPOSE", "BREEDER"}


class FlockCreateRequest(BaseModel):
    farm_id: str = Field(..., min_length=1)
    flock_label: str = Field(..., min_length=1, max_length=255)
    breed_id: UUID = Field(..., description="library_id from shared.farm_libraries (POULTRY_BREED)")
    current_pu_id: Optional[str] = Field(default=None, description="Coop housing this flock; nullable")
    placed_date: date_type = Field(..., description="Date flock was placed")
    placed_count: int = Field(..., gt=0, le=1000000)
    flock_type: str = Field(..., description="One of VALID_FLOCK_TYPES")
    notes: Optional[str] = Field(default=None, max_length=500)


def _resolve_actor_uuid(user: dict) -> UUID:
    raw = user.get("user_id") or user.get("sub")
    if not raw:
        raise HTTPException(401, error_envelope("missing_user_id", "Session missing user_id."))
    try:
        return UUID(str(raw))
    except (ValueError, TypeError):
        raise HTTPException(401, error_envelope("invalid_user_id", "Session user_id not a valid UUID."))


def _resolve_tenant_uuid(user: dict) -> UUID:
    raw = user.get("tenant_id")
    if not raw:
        raise HTTPException(401, error_envelope("missing_tenant_id", "Session missing tenant_id."))
    try:
        return UUID(str(raw))
    except (ValueError, TypeError):
        raise HTTPException(401, error_envelope("invalid_tenant_id", "Session tenant_id not a valid UUID."))


async def _generate_flock_id(db: AsyncSession, farm_id: str) -> str:
    """Generate next flock_id for farm: <farm_id>-FLK<NNN>.

    Counts existing flocks for this farm (active + inactive) and increments.
    Format: F001-FLK001, F001-FLK002, etc.
    """
    result = await db.execute(
        text("""
            SELECT COUNT(*) AS cnt FROM tenant.flocks
            WHERE farm_id = :fid
        """),
        {"fid": farm_id},
    )
    row = result.first()
    next_num = (row.cnt if row else 0) + 1
    return f"{farm_id}-FLK{next_num:03d}"


@router.get("/flocks")
async def list_flocks(
    farm_id: Optional[str] = Query(None, description="Filter to one farm"),
    is_active: Optional[bool] = Query(True, description="True (default) | False | omit for both"),
    lifecycle_status: Optional[str] = Query(None, description="Filter by lifecycle_status"),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List flocks visible to session tenant. RLS filters automatically."""
    query_parts = [
        "SELECT flock_id, farm_id, flock_label, breed_id, current_pu_id,",
        "       placed_date, placed_count, current_count, flock_type, lifecycle_status,",
        "       notes, is_active, created_at, updated_at",
        "FROM tenant.flocks",
        "WHERE TRUE",
    ]
    params: dict = {}

    if farm_id is not None:
        query_parts.append("AND farm_id = :fid")
        params["fid"] = farm_id

    if is_active is not None:
        query_parts.append("AND is_active = :ia")
        params["ia"] = is_active

    if lifecycle_status is not None:
        query_parts.append("AND lifecycle_status = :ls")
        params["ls"] = lifecycle_status

    query_parts.append("ORDER BY farm_id, flock_id")
    sql = " ".join(query_parts)

    result = await db.execute(text(sql), params)
    rows = result.mappings().all()

    items = [
        {
            "flock_id": row["flock_id"],
            "farm_id": row["farm_id"],
            "flock_label": row["flock_label"],
            "breed_id": str(row["breed_id"]),
            "current_pu_id": row["current_pu_id"],
            "placed_date": row["placed_date"].isoformat() if row["placed_date"] else None,
            "placed_count": row["placed_count"],
            "current_count": row["current_count"],
            "flock_type": row["flock_type"],
            "lifecycle_status": row["lifecycle_status"],
            "notes": row["notes"],
            "is_active": row["is_active"],
        }
        for row in rows
    ]

    return success_envelope(
        {"items": items},
        meta={"total": len(items), "filtered_by": {"farm_id": farm_id, "is_active": is_active, "lifecycle_status": lifecycle_status}},
    )


@router.get("/flocks/{flock_id}/sale-eligibility")
async def flock_sale_eligibility(
    flock_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Read-only pre-check: can this flock be sold right now?

    Surfaces the SAME gates POST /events enforces at sale (Phase 6.6-1 vaccination
    withholding + 6.6-2 SEVERE health block) so the (+) capture form can WARN the
    farmer BEFORE they fill out a sale they can't complete — never instead of the
    hard gate, which still runs server-side on submit. Importing the exact gate
    functions keeps this warning from drifting away from the real block.
    """
    # Imported lazily to avoid any router import-order coupling at module load.
    from app.routers.events import check_severe_health_block, check_vaccination_withholding

    tenant_uuid = _resolve_tenant_uuid(user)

    # Confirm the flock is visible to this tenant (RLS already scopes; 404 on miss).
    flock_check = await db.execute(
        text("SELECT flock_id FROM tenant.flocks WHERE flock_id = :fid"),
        {"fid": flock_id},
    )
    if flock_check.first() is None:
        raise HTTPException(404, error_envelope("flock_not_found", f"Flock {flock_id} not found."))

    blocks: list[dict] = []

    health = await check_severe_health_block(db, tenant_uuid, flock_id)
    if health:
        blocks.append({"type": "SEVERE_HEALTH", **health})

    for sale_kind in ("eggs", "meat"):
        wh = await check_vaccination_withholding(db, tenant_uuid, flock_id, sale_kind)
        if wh:
            blocks.append({"type": "WITHHOLDING", **wh})

    return success_envelope(
        {"flock_id": flock_id, "sellable": len(blocks) == 0, "blocks": blocks},
        meta={"checked": ["SEVERE_HEALTH", "WITHHOLDING"]},
    )


@router.post("/flocks", status_code=status.HTTP_201_CREATED)
async def create_flock(
    payload: FlockCreateRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Create a new flock + emit FLOCK_PLACED audit event."""

    if payload.flock_type not in VALID_FLOCK_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_envelope("invalid_flock_type", f"flock_type must be one of {sorted(VALID_FLOCK_TYPES)}"),
        )

    tenant_uuid = _resolve_tenant_uuid(user)
    actor_uuid = _resolve_actor_uuid(user)

    # Validate Farm exists (RLS filters cross-tenant)
    farm_check = await db.execute(
        text("SELECT farm_id FROM tenant.farms WHERE farm_id = :fid"),
        {"fid": payload.farm_id},
    )
    if farm_check.first() is None:
        raise HTTPException(404, error_envelope("farm_not_found", f"Farm {payload.farm_id} not found."))

    # Validate breed_id exists in shared.farm_libraries (POULTRY_BREED type)
    breed_check = await db.execute(
        text("""
            SELECT library_id FROM shared.farm_libraries
            WHERE library_id = :bid AND library_type = 'POULTRY_BREED' AND is_active = TRUE
        """),
        {"bid": payload.breed_id},
    )
    if breed_check.first() is None:
        raise HTTPException(404, error_envelope("breed_not_found", f"Breed {payload.breed_id} not found or not active."))

    # Validate current_pu_id if provided (must belong to farm)
    if payload.current_pu_id is not None:
        pu_check = await db.execute(
            text("SELECT pu_id FROM tenant.production_units WHERE pu_id = :pu AND farm_id = :fid"),
            {"pu": payload.current_pu_id, "fid": payload.farm_id},
        )
        if pu_check.first() is None:
            raise HTTPException(
                404,
                error_envelope("pu_not_found", f"PU {payload.current_pu_id} not found on farm {payload.farm_id}."),
            )

    # Generate flock_id
    new_flock_id = await _generate_flock_id(db, payload.farm_id)

    cleaned_label = payload.flock_label.strip()

    # Emit audit FIRST (gets audit_event_id; flocks doesn't FK to audit but pattern stays consistent)
    audit_payload = {
        "flock_id": new_flock_id,
        "farm_id": payload.farm_id,
        "flock_label": cleaned_label,
        "breed_id": str(payload.breed_id),
        "placed_count": payload.placed_count,
        "flock_type": payload.flock_type,
        "current_pu_id": payload.current_pu_id,
    }

    audit_event_id, audit_hash = await emit_audit_event(
        db=db,
        tenant_id=tenant_uuid,
        actor_user_id=actor_uuid,
        event_type="FLOCK_PLACED",
        entity_type="flock",
        entity_id=new_flock_id,
        payload=audit_payload,
    )

    if audit_event_id is None or not audit_hash:
        raise HTTPException(500, error_envelope("audit_emission_failed", "FLOCK_PLACED audit emission failed."))

    # INSERT flock row
    insert_result = await db.execute(
        text("""
            INSERT INTO tenant.flocks (
                flock_id, tenant_id, farm_id, flock_label, breed_id, current_pu_id,
                placed_date, placed_count, current_count, flock_type, lifecycle_status,
                notes, is_active, created_by
            )
            VALUES (
                :fid, :tid, :farm, :label, :breed, :pu,
                :pdate, :pcount, :pcount, :ftype, 'PLACED',
                :notes, TRUE, :uid
            )
            RETURNING flock_id, lifecycle_status, current_count
        """),
        {
            "fid": new_flock_id,
            "tid": tenant_uuid,
            "farm": payload.farm_id,
            "label": cleaned_label,
            "breed": payload.breed_id,
            "pu": payload.current_pu_id,
            "pdate": payload.placed_date,
            "pcount": payload.placed_count,
            "ftype": payload.flock_type,
            "notes": payload.notes,
            "uid": actor_uuid,
        },
    )
    row = insert_result.first()
    if row is None:
        raise HTTPException(500, error_envelope("insert_failed", "Flock insert returned no row."))

    await db.commit()

    return success_envelope(
        {
            "flock_id": row.flock_id,
            "lifecycle_status": row.lifecycle_status,
            "current_count": row.current_count,
            "audit_event_id": str(audit_event_id),
            "audit_hash": audit_hash[-8:],
        },
        meta={"created": True},
    )
