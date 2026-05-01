"""Farm Libraries CRUD endpoints — Phase 6.1b-2 (GET + POST).

Per Vertical Completeness Doctrine Gate 4 v1.1 (farmer-extensible at runtime).
Single polymorphic endpoint scaling across all 11 groups via library_type query param.

GET /api/v1/farm-libraries[?library_type=...&is_active=...]
  - Returns globals (tenant_id IS NULL) + own farm-private rows merged via RLS
  - Auth required (any role)
  - First hybrid-scope endpoint in TFOS

POST /api/v1/farm-libraries
  - Body: {library_type, name, attributes?}
  - Inserts as farm-private (tenant_id from session via RLS)
  - Globals immutable from runtime (RLS INSERT policy enforces)
  - Duplicate-name guard: 409 within (tenant + library_type + active)
  - Emits LIBRARY_ROW_ADDED audit event with hash chain link

PATCH (Phase 6.1b-3) and DELETE blocker (Phase 6.1b-5) ship in subsequent phases.
"""

import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_chain import emit_audit_event
from app.middleware.rls import get_current_user, get_tenant_db
from app.schemas.envelope import error_envelope, success_envelope


router = APIRouter()

# Mirror of DB CHECK on library_type. Update both in lockstep when adding new
# library types per group (Phase X.1 of each subsequent group).
VALID_LIBRARY_TYPES = {
    "POULTRY_VACCINE",
    "POULTRY_BREED",
    "POULTRY_FEED",
    "POULTRY_SUPPLIER",
    "POULTRY_BUYER",
}


class LibraryAddRequest(BaseModel):
    library_type: str = Field(..., description="One of VALID_LIBRARY_TYPES")
    name: str = Field(..., min_length=1, max_length=255)
    attributes: Optional[dict] = Field(default_factory=dict)


def _resolve_actor_uuid(user: dict) -> UUID:
    """Defensive UUID extraction from session user dict.

    Some auth flows put the user_id under 'user_id', others under 'sub'.
    Both come back as strings. Returns clean UUID or raises 401.
    """
    raw = user.get("user_id") or user.get("sub")
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_envelope(
                code="missing_user_id",
                message="Session missing user_id; cannot attribute action.",
            ),
        )
    try:
        return UUID(str(raw))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_envelope(
                code="invalid_user_id",
                message="Session user_id is not a valid UUID.",
            ),
        )


def _resolve_tenant_uuid(user: dict) -> UUID:
    """Defensive UUID extraction for tenant_id from session."""
    raw = user.get("tenant_id")
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_envelope(
                code="missing_tenant_id",
                message="Session missing tenant_id.",
            ),
        )
    try:
        return UUID(str(raw))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_envelope(
                code="invalid_tenant_id",
                message="Session tenant_id is not a valid UUID.",
            ),
        )


@router.get("/farm-libraries")
async def list_libraries(
    library_type: Optional[str] = Query(None, description="Filter to one library type"),
    is_active: Optional[bool] = Query(True, description="True = active only (default); False = inactive only; omit param for both"),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List globals (tenant_id IS NULL) + own farm-private rows. RLS enforces visibility."""

    if library_type is not None and library_type not in VALID_LIBRARY_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_envelope(
                code="invalid_library_type",
                message=f"library_type must be one of {sorted(VALID_LIBRARY_TYPES)}",
            ),
        )

    query_parts = [
        "SELECT library_id, library_type, tenant_id, name, attributes, is_active",
        "FROM shared.farm_libraries",
        "WHERE TRUE",
    ]
    params: dict = {}

    if library_type is not None:
        query_parts.append("AND library_type = :lt")
        params["lt"] = library_type

    if is_active is not None:
        query_parts.append("AND is_active = :ia")
        params["ia"] = is_active

    query_parts.append("ORDER BY library_type, name")

    sql = " ".join(query_parts)
    result = await db.execute(text(sql), params)
    rows = result.mappings().all()

    items = [
        {
            "library_id": str(row["library_id"]),
            "library_type": row["library_type"],
            "name": row["name"],
            "attributes": row["attributes"] or {},
            "is_active": row["is_active"],
            "is_global": row["tenant_id"] is None,
        }
        for row in rows
    ]

    return success_envelope(
        {"items": items},
        meta={
            "total": len(items),
            "filtered_by": {
                "library_type": library_type,
                "is_active": is_active,
            },
        },
    )


@router.post("/farm-libraries", status_code=status.HTTP_201_CREATED)
async def add_library_row(
    payload: LibraryAddRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Add a farm-private library row + emit LIBRARY_ROW_ADDED audit event.

    Globals (tenant_id IS NULL) cannot be created from runtime — RLS INSERT policy
    enforces tenant_id matching session var. Migration is the only path for globals.
    """

    if payload.library_type not in VALID_LIBRARY_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_envelope(
                code="invalid_library_type",
                message=f"library_type must be one of {sorted(VALID_LIBRARY_TYPES)}",
            ),
        )

    tenant_uuid = _resolve_tenant_uuid(user)
    actor_uuid = _resolve_actor_uuid(user)

    cleaned_name = payload.name.strip()
    if not cleaned_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_envelope(
                code="empty_name",
                message="Library row name cannot be empty or whitespace-only.",
            ),
        )

    # Duplicate-name guard within (tenant + library_type + active rows)
    dup_check = await db.execute(
        text("""
            SELECT library_id FROM shared.farm_libraries
            WHERE tenant_id = :tid
              AND library_type = :lt
              AND lower(trim(name)) = lower(trim(:n))
              AND is_active = TRUE
            LIMIT 1
        """),
        {"tid": tenant_uuid, "lt": payload.library_type, "n": cleaned_name},
    )
    existing = dup_check.first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=error_envelope(
                code="duplicate_name",
                message=f"An active {payload.library_type} named '{cleaned_name}' already exists for this farm.",
            ),
        )

    # INSERT (RLS WITH CHECK enforces tenant_id matches session var)
    attributes_json = json.dumps(payload.attributes or {})
    insert_result = await db.execute(
        text("""
            INSERT INTO shared.farm_libraries
                (library_type, tenant_id, name, attributes, is_active, created_by)
            VALUES (:lt, :tid, :n, CAST(:attr AS jsonb), TRUE, :uid)
            RETURNING library_id
        """),
        {
            "lt": payload.library_type,
            "tid": tenant_uuid,
            "n": cleaned_name,
            "attr": attributes_json,
            "uid": actor_uuid,
        },
    )
    row = insert_result.first()
    if row is None or row.library_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_envelope(
                code="insert_failed",
                message="Library row insert returned no library_id.",
            ),
        )
    library_id: UUID = row.library_id

    # Emit audit event — payload contains scrubbed metadata only
    audit_event_id, audit_hash = await emit_audit_event(
        db=db,
        tenant_id=tenant_uuid,
        actor_user_id=actor_uuid,
        event_type="LIBRARY_ROW_ADDED",
        entity_type="farm_library",
        entity_id=str(library_id),
        payload={
            "library_type": payload.library_type,
            "name": cleaned_name,
            "attributes_keys": sorted((payload.attributes or {}).keys()),
        },
    )

    if audit_event_id is None or not audit_hash:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_envelope(
                code="audit_emission_failed",
                message="Library row inserted but audit event was not emitted.",
            ),
        )

    await db.commit()

    return success_envelope(
        {
            "library_id": str(library_id),
            "library_type": payload.library_type,
            "name": cleaned_name,
            "audit_event_id": str(audit_event_id),
            "audit_hash": audit_hash[-8:],
        },
        meta={"created": True},
    )


class LibraryPatchRequest(BaseModel):
    """PATCH v1 supports is_active toggle ONLY.

    Attribute editing deferred to Phase 6.1b-4 (requires LIBRARY_ROW_UPDATED
    event type registered in shared.event_type_catalog).
    """
    is_active: bool = Field(..., description="Target state. true=reactivate, false=deactivate.")


@router.patch("/farm-libraries/{library_id}")
async def patch_library_row(
    library_id: UUID = Path(..., description="library_id of farm-private row to update"),
    payload: LibraryPatchRequest = ...,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Toggle is_active on a farm-private library row.

    Globals (tenant_id IS NULL) cannot be patched — RLS UPDATE policy excludes them
    silently; handler returns 404 when zero rows updated.
    Other farm's rows are similarly excluded by RLS → 404.
    Idempotent: state-already-target returns 200 with no_change=true and no audit emission.
    """

    tenant_uuid = _resolve_tenant_uuid(user)
    actor_uuid = _resolve_actor_uuid(user)

    # Read current state first (RLS will return None if row is global or other-tenant)
    current_result = await db.execute(
        text("""
            SELECT library_id, library_type, name, is_active
            FROM shared.farm_libraries
            WHERE library_id = :lid
        """),
        {"lid": library_id},
    )
    current_row = current_result.first()

    if current_row is None:
        # Either doesn't exist, or is global, or belongs to other tenant — RLS hides it.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_envelope(
                code="library_not_found",
                message=f"Library row {library_id} not found, is global (immutable), or belongs to another farm.",
            ),
        )

    current_is_active = current_row.is_active
    target_is_active = payload.is_active

    # Idempotent no-op
    if current_is_active == target_is_active:
        return success_envelope(
            {
                "library_id": str(library_id),
                "library_type": current_row.library_type,
                "name": current_row.name,
                "is_active": current_is_active,
                "no_change": True,
            },
            meta={"already_in_target_state": True},
        )

    # Determine event type
    event_type = "LIBRARY_ROW_DEACTIVATED" if not target_is_active else "LIBRARY_ROW_REACTIVATED"

    # UPDATE (RLS USING+WITH CHECK enforces tenant scope)
    update_result = await db.execute(
        text("""
            UPDATE shared.farm_libraries
            SET is_active = :ia, updated_at = now()
            WHERE library_id = :lid
            RETURNING library_id, library_type, name, is_active
        """),
        {"ia": target_is_active, "lid": library_id},
    )
    updated_row = update_result.first()

    if updated_row is None:
        # RLS rejected the update — should have been caught by SELECT above, but defense in depth
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_envelope(
                code="library_not_found",
                message=f"Library row {library_id} could not be updated (RLS).",
            ),
        )

    # Emit audit event
    audit_event_id, audit_hash = await emit_audit_event(
        db=db,
        tenant_id=tenant_uuid,
        actor_user_id=actor_uuid,
        event_type=event_type,
        entity_type="farm_library",
        entity_id=str(library_id),
        payload={
            "library_type": updated_row.library_type,
            "name": updated_row.name,
            "previous_is_active": current_is_active,
            "new_is_active": target_is_active,
        },
    )

    if audit_event_id is None or not audit_hash:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_envelope(
                code="audit_emission_failed",
                message=f"{event_type} emission failed.",
            ),
        )

    await db.commit()

    return success_envelope(
        {
            "library_id": str(library_id),
            "library_type": updated_row.library_type,
            "name": updated_row.name,
            "is_active": target_is_active,
            "audit_event_id": str(audit_event_id),
            "audit_hash": audit_hash[-8:],
            "event_type": event_type,
        },
        meta={"updated": True, "no_change": False},
    )


@router.delete("/farm-libraries/{library_id}")
async def delete_library_row(
    library_id: UUID = Path(..., description="library_id"),
    user: dict = Depends(get_current_user),
):
    """DELETE is permanently blocked. Library deactivation is soft-delete only.

    Per Vertical Completeness Doctrine Gate 4 v1.1 mutation rules:
    'DELETE blocked at RLS layer; UPDATE is_active=false is the only deactivation path'

    Defense in depth: API layer also blocks, even though RLS would block at DB layer.
    """
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail=error_envelope(
            code="method_not_allowed",
            message="DELETE is not supported on farm libraries. To deactivate a row, use PATCH with {\"is_active\": false}. To reactivate, PATCH with {\"is_active\": true}. This preserves audit chain integrity per Vertical Completeness Doctrine Gate 4.",
        ),
        headers={"Allow": "GET, POST, PATCH"},
    )
