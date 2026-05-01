"""Polymorphic events endpoint — Phase 6.2-1.

POST /api/v1/events — single endpoint for all event types.

Architecture:
- Outer envelope: {event_type, occurred_at, anchors: {farm_id, pu_id, cycle_id}, payload}
- Dispatch via EVENT_TYPE_REGISTRY (events_registry.py)
- Anchors validated against tenant tables (Farm + Coop + Crop existence)
- Payload validated against per-event-type Pydantic schema
- INSERT into per-event-type table (registry's table_name)
- Audit emitted with full anchor metadata, FK-linked from event_log row

Anchor types per Strike #21:
- farm_id: str (TEXT in DB; e.g. 'F001-A0EE')
- pu_id: Optional[str] (TEXT in DB; e.g. 'PU001')
- cycle_id: Optional[str] (TEXT in DB; INSTANCE identifier per Strike #22)

Phase 6.2-1 scope: EGGS_COLLECTED only. flock_id added Phase 6.2-3.
"""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_chain import emit_audit_event
from app.middleware.rls import get_current_user, get_tenant_db
from app.schemas.envelope import error_envelope, success_envelope
from app.schemas.events_registry import get_schema_for_event_type, MORTALITY_CAUSES, VACCINATION_ROUTES
from sqlalchemy.exc import IntegrityError

import json


router = APIRouter()


class EventAnchors(BaseModel):
    """Four-anchor envelope: Farm + Coop (pu_id) + Crop (cycle_id) + Flock (flock_id) + Operator (from session).

    Per Doctrine Inviolable #14, every event row carries the four anchors.
    Per Strike #21: anchors are TEXT (human-readable IDs), not UUIDs.
    Per Strike #22: Crop anchor uses cycle_id (instance) NOT production_id (category).

    Phase 6.2-3: flock_id added for POULTRY events. Optional (whole-farm events still work).
    Validated: flock must exist, be active, and belong to the same farm as farm_id.
    """
    farm_id: str = Field(..., min_length=1, description="Anchor 1: Farm. TEXT (e.g. F001-A0EE).")
    pu_id: Optional[str] = Field(default=None, description="Anchor 2: Coop. TEXT (e.g. PU001).")
    cycle_id: Optional[str] = Field(
        default=None,
        description="Anchor 3: Crop INSTANCE (cycle_id). TEXT. None when no specific crop applies.",
    )
    flock_id: Optional[str] = Field(
        default=None,
        description="Anchor 4 (POULTRY): Flock. TEXT (e.g. F001-A0EE-FLK001). None for whole-farm events.",
    )


class EventSubmission(BaseModel):
    """Request envelope for POST /api/v1/events."""
    event_type: str = Field(..., description="Event type (must be registered in EVENT_TYPE_REGISTRY)")
    occurred_at: Optional[datetime] = Field(default=None, description="Event time. Defaults to now() if omitted.")
    anchors: EventAnchors
    payload: dict = Field(default_factory=dict, description="Event-type-specific payload.")


def _resolve_actor_uuid(user: dict) -> UUID:
    """Defensive UUID extraction (precedent: farm_libraries.py)."""
    raw = user.get("user_id") or user.get("sub")
    if not raw:
        raise HTTPException(401, error_envelope("missing_user_id", "Session missing user_id."))
    try:
        return UUID(str(raw))
    except (ValueError, TypeError):
        raise HTTPException(401, error_envelope("invalid_user_id", "Session user_id not a valid UUID."))


def _resolve_tenant_uuid(user: dict) -> UUID:
    """Defensive UUID extraction (precedent: farm_libraries.py)."""
    raw = user.get("tenant_id")
    if not raw:
        raise HTTPException(401, error_envelope("missing_tenant_id", "Session missing tenant_id."))
    try:
        return UUID(str(raw))
    except (ValueError, TypeError):
        raise HTTPException(401, error_envelope("invalid_tenant_id", "Session tenant_id not a valid UUID."))


@router.post("/events", status_code=status.HTTP_201_CREATED)
async def submit_event(
    submission: EventSubmission,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Polymorphic event submission endpoint."""
    tenant_uuid = _resolve_tenant_uuid(user)
    actor_uuid = _resolve_actor_uuid(user)

    # 1. Look up event type in registry
    registry_entry = get_schema_for_event_type(submission.event_type)
    if registry_entry is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_envelope(
                code="unregistered_event_type",
                message=f"Event type '{submission.event_type}' is not registered.",
            ),
        )
    payload_schema_class, target_table, schema_version = registry_entry

    # 2. Validate anchors — Farm must exist (RLS hides other-tenant)
    farm_check = await db.execute(
        text("SELECT farm_id FROM tenant.farms WHERE farm_id = :fid"),
        {"fid": submission.anchors.farm_id},
    )
    if farm_check.first() is None:
        raise HTTPException(404, error_envelope("farm_not_found", f"Farm {submission.anchors.farm_id} not found."))

    # 2b. Coop must belong to the Farm (if provided)
    if submission.anchors.pu_id is not None:
        pu_check = await db.execute(
            text("SELECT pu_id FROM tenant.production_units WHERE pu_id = :pu AND farm_id = :fid"),
            {"pu": submission.anchors.pu_id, "fid": submission.anchors.farm_id},
        )
        if pu_check.first() is None:
            raise HTTPException(
                404,
                error_envelope(
                    "pu_not_found",
                    f"Production unit {submission.anchors.pu_id} not found or does not belong to farm {submission.anchors.farm_id}.",
                ),
            )

    # 2c. Crop INSTANCE (cycle_id) must exist if provided
    if submission.anchors.cycle_id is not None:
        cycle_check = await db.execute(
            text("SELECT cycle_id FROM tenant.production_cycles WHERE cycle_id = :cid"),
            {"cid": submission.anchors.cycle_id},
        )
        if cycle_check.first() is None:
            raise HTTPException(404, error_envelope("cycle_not_found", f"Production cycle {submission.anchors.cycle_id} not found."))

    # 2d. Flock must exist, be active, and belong to the anchor's farm (Phase 6.2-3)
    if submission.anchors.flock_id is not None:
        flock_check = await db.execute(
            text("""
                SELECT flock_id, farm_id, is_active
                FROM tenant.flocks
                WHERE flock_id = :fid
            """),
            {"fid": submission.anchors.flock_id},
        )
        flock_row = flock_check.first()
        if flock_row is None:
            raise HTTPException(
                404,
                error_envelope("flock_not_found", f"Flock {submission.anchors.flock_id} not found."),
            )
        if not flock_row.is_active:
            raise HTTPException(
                400,
                error_envelope("flock_inactive", f"Flock {submission.anchors.flock_id} is not active; cannot log events to it."),
            )
        if flock_row.farm_id != submission.anchors.farm_id:
            raise HTTPException(
                400,
                error_envelope(
                    "flock_farm_mismatch",
                    f"Flock {submission.anchors.flock_id} belongs to farm {flock_row.farm_id}, not {submission.anchors.farm_id}.",
                ),
            )

    # 2e. MORTALITY_LOGGED-specific: flock_id REQUIRED, cause in vocab
    if submission.event_type == "MORTALITY_LOGGED":
        if submission.anchors.flock_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope(
                    "mortality_requires_flock",
                    "MORTALITY_LOGGED requires a flock_id anchor.",
                ),
            )
        cause_value = submission.payload.get("cause") if isinstance(submission.payload, dict) else None
        if cause_value not in MORTALITY_CAUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope(
                    "invalid_mortality_cause",
                    f"cause must be one of {sorted(MORTALITY_CAUSES)}.",
                ),
            )

    # 2f. VACCINATION_GIVEN-specific: flock_id REQUIRED, vaccine_id valid, route in vocab
    if submission.event_type == "VACCINATION_GIVEN":
        if submission.anchors.flock_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope(
                    "vaccination_requires_flock",
                    "VACCINATION_GIVEN requires a flock_id anchor.",
                ),
            )
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))

        vaccine_id_value = submission.payload.get("vaccine_id")
        route_value = submission.payload.get("route")

        if route_value not in VACCINATION_ROUTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope(
                    "invalid_vaccination_route",
                    f"route must be one of {sorted(VACCINATION_ROUTES)}.",
                ),
            )

        # vaccine_id must be UUID-parseable + exist in shared.farm_libraries POULTRY_VACCINE active
        try:
            vaccine_uuid = UUID(str(vaccine_id_value)) if vaccine_id_value else None
        except (ValueError, TypeError):
            raise HTTPException(400, error_envelope("invalid_vaccine_id", "vaccine_id must be a valid UUID."))

        if vaccine_uuid is None:
            raise HTTPException(400, error_envelope("missing_vaccine_id", "vaccine_id is required."))

        vaccine_check = await db.execute(
            text("""
                SELECT library_id FROM shared.farm_libraries
                WHERE library_id = :vid AND library_type = 'POULTRY_VACCINE' AND is_active = TRUE
            """),
            {"vid": vaccine_uuid},
        )
        if vaccine_check.first() is None:
            raise HTTPException(
                404,
                error_envelope("vaccine_not_found", f"Vaccine {vaccine_id_value} not found or not active."),
            )

    # 3. Validate payload against registered schema
    try:
        validated_payload = payload_schema_class(**submission.payload)
    except ValidationError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_envelope(
                code="invalid_payload",
                message=f"Payload validation failed for {submission.event_type}.",
            ),
        )

    occurred_ts = submission.occurred_at or datetime.now(timezone.utc)
    payload_dict = validated_payload.model_dump(exclude_none=True)
    payload_json = json.dumps(payload_dict, default=str)

    # 4. Emit audit event FIRST (gets audit_event_id back for FK linkage)
    audit_payload = {
        "event_type": submission.event_type,
        "anchors": {
            "farm_id": submission.anchors.farm_id,
            "pu_id": submission.anchors.pu_id,
            "cycle_id": submission.anchors.cycle_id,
            "flock_id": submission.anchors.flock_id,
        },
        "payload_keys": sorted(payload_dict.keys()),
        "payload_schema_version": schema_version,
    }

    audit_event_id, audit_hash = await emit_audit_event(
        db=db,
        tenant_id=tenant_uuid,
        actor_user_id=actor_uuid,
        event_type=submission.event_type,
        entity_type="poultry_event",
        entity_id=None,
        occurred_at=occurred_ts,
        payload=audit_payload,
    )

    if audit_event_id is None or not audit_hash:
        raise HTTPException(500, error_envelope("audit_emission_failed", "Audit event emission failed."))

    # 5. INSERT event row with audit_event_id linked (TEXT anchors per Strike #21; flock_id added Phase 6.2-3)
    insert_result = await db.execute(
        text("""
            INSERT INTO tenant.poultry_event_log (
                tenant_id, farm_id, pu_id, cycle_id, flock_id, created_by,
                event_type, occurred_at, payload_jsonb, payload_schema_version, audit_event_id
            )
            VALUES (
                :tid, :fid, :pu, :cid, :flk, :uid,
                :et, :occ, CAST(:p AS jsonb), :ver, :aud
            )
            RETURNING event_id
        """),
        {
            "tid": tenant_uuid,
            "fid": submission.anchors.farm_id,
            "pu": submission.anchors.pu_id,
            "cid": submission.anchors.cycle_id,
            "flk": submission.anchors.flock_id,
            "uid": actor_uuid,
            "et": submission.event_type,
            "occ": occurred_ts,
            "p": payload_json,
            "ver": schema_version,
            "aud": audit_event_id,
        },
    )
    new_row = insert_result.first()
    if new_row is None:
        raise HTTPException(500, error_envelope("insert_failed", "Event row insert failed after audit emission."))
    event_id = new_row.event_id

    # 6. Side effect for MORTALITY_LOGGED: decrement tenant.flocks.current_count
    #    Same transaction; CHECK constraint on flocks (current_count >= 0) catches underflow
    if submission.event_type == "MORTALITY_LOGGED":
        qty_dead = payload_dict.get("qty_dead", 0)
        try:
            await db.execute(
                text("""
                    UPDATE tenant.flocks
                    SET current_count = current_count - :qty,
                        updated_at = now()
                    WHERE flock_id = :fid
                """),
                {"qty": qty_dead, "fid": submission.anchors.flock_id},
            )
        except IntegrityError as ie:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope(
                    "would_underflow_count",
                    f"Logging {qty_dead} dead birds would put flock {submission.anchors.flock_id} below zero.",
                ),
            )

    await db.commit()

    return success_envelope(
        {
            "event_id": str(event_id),
            "event_type": submission.event_type,
            "audit_event_id": str(audit_event_id),
            "audit_hash": audit_hash[-8:],
            "payload_schema_version": schema_version,
        },
        meta={"created": True, "table": target_table},
    )
