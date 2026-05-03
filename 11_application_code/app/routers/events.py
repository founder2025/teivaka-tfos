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
from app.schemas.events_registry import get_schema_for_event_type, MORTALITY_CAUSES, VACCINATION_ROUTES, BIRD_REPLACEMENT_REASONS, BIRDS_SOLD_TYPES, HEALTH_SEVERITY, HEALTH_SYMPTOMS
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


async def check_severe_health_block(
    db: AsyncSession,
    tenant_id: UUID,
    flock_id: str,
) -> Optional[dict]:
    """Phase 6.6-2: latest HEALTH_OBSERVATION on this flock blocks sales if SEVERE.

    Returns block dict if latest is SEVERE, None if CLEARED / MILD / MODERATE / absent.
    Operator clears by logging a CLEARED HEALTH_OBSERVATION with later occurred_at.
    Stateless: each call recomputes from audit chain (Strike #56: payload_jsonb).
    """
    result = await db.execute(text("""
        SELECT
            pel.occurred_at,
            pel.payload_jsonb->>'severity' AS severity,
            pel.payload_jsonb->'symptoms' AS symptoms,
            pel.payload_jsonb->>'qty_affected' AS qty_affected
        FROM tenant.poultry_event_log pel
        WHERE pel.tenant_id = :tid
          AND pel.event_type = 'HEALTH_OBSERVATION'
          AND pel.flock_id = :fid
        ORDER BY pel.occurred_at DESC
        LIMIT 1
    """), {"tid": str(tenant_id), "fid": flock_id})

    row = result.first()
    if row is None or row.severity != "SEVERE":
        return None

    return {
        "severity": row.severity,
        "observed_at": row.occurred_at.isoformat(),
        "symptoms": row.symptoms,
        "qty_affected": int(row.qty_affected) if row.qty_affected else None,
        "resolution": "Log a HEALTH_OBSERVATION with severity=CLEARED on this flock to allow sales.",
    }


async def check_vaccination_withholding(
    db: AsyncSession,
    tenant_id: UUID,
    flock_id: str,
    sale_kind: str,
) -> Optional[dict]:
    """Phase 6.6-1: query latest VACCINATION_GIVEN events for this flock; resolve
    vaccine_id → library attributes → withholding_*_days; return violation dict
    if any active withholding window blocks this sale_kind, else None.

    sale_kind is 'eggs' or 'meat'. Stateless: each call recomputes from audit chain.
    """
    attr_field = f"withholding_{sale_kind}_days"

    result = await db.execute(text(f"""
        SELECT
            pel.occurred_at,
            fl.name AS vaccine_name,
            COALESCE((fl.attributes->>'{attr_field}')::int, 0) AS withholding_days,
            pel.occurred_at + COALESCE((fl.attributes->>'{attr_field}')::int, 0) * INTERVAL '1 day' AS withholding_until
        FROM tenant.poultry_event_log pel
        LEFT JOIN shared.farm_libraries fl ON fl.library_id = (pel.payload_jsonb->>'vaccine_id')::uuid
        WHERE pel.tenant_id = :tid
          AND pel.event_type = 'VACCINATION_GIVEN'
          AND pel.flock_id = :fid
          AND pel.occurred_at + COALESCE((fl.attributes->>'{attr_field}')::int, 0) * INTERVAL '1 day' > now()
        ORDER BY pel.occurred_at + COALESCE((fl.attributes->>'{attr_field}')::int, 0) * INTERVAL '1 day' DESC
        LIMIT 1
    """), {"tid": str(tenant_id), "fid": flock_id})

    row = result.first()
    if row is None or row.withholding_days == 0:
        return None

    days_remaining = (row.withholding_until - datetime.now(timezone.utc)).days + 1
    return {
        "vaccine_name": row.vaccine_name,
        "vaccinated_at": row.occurred_at.isoformat(),
        "withholding_days": row.withholding_days,
        "withholding_until": row.withholding_until.isoformat(),
        "days_remaining": max(days_remaining, 0),
        "sale_kind": sale_kind,
    }


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

    # 2l. HEALTH_OBSERVATION-specific: flock_id REQUIRED, severity + symptoms in vocab
    if submission.event_type == "HEALTH_OBSERVATION":
        if submission.anchors.flock_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("health_observation_requires_flock", "HEALTH_OBSERVATION requires a flock_id anchor."),
            )
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))
        severity_value = submission.payload.get("severity")
        if severity_value not in HEALTH_SEVERITY:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("invalid_severity", f"severity must be one of {sorted(HEALTH_SEVERITY)}."),
            )
        symptoms_value = submission.payload.get("symptoms", [])
        # CLEARED severity allows empty symptoms (operator confirming healthy);
        # MILD/MODERATE/SEVERE require at least one symptom.
        if not isinstance(symptoms_value, list):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("invalid_symptoms", "symptoms must be a list."),
            )
        if severity_value != "CLEARED" and len(symptoms_value) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("invalid_symptoms", "symptoms must be a non-empty list (unless severity is CLEARED)."),
            )
        bad_symptoms = [s for s in symptoms_value if s not in HEALTH_SYMPTOMS]
        if bad_symptoms:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("invalid_symptoms_value", f"symptoms must be from {sorted(HEALTH_SYMPTOMS)}; got invalid: {bad_symptoms}."),
            )

    # 2m. FEED_USED-specific: flock_id REQUIRED, feed_type_id valid POULTRY_FEED
    if submission.event_type == "FEED_USED":
        if submission.anchors.flock_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("feed_used_requires_flock", "FEED_USED requires a flock_id anchor."),
            )
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))
        feed_type_id_value = submission.payload.get("feed_type_id")
        try:
            feed_uuid = UUID(str(feed_type_id_value)) if feed_type_id_value else None
        except (ValueError, TypeError):
            raise HTTPException(400, error_envelope("invalid_feed_type_id", "feed_type_id must be a valid UUID."))
        if feed_uuid is None:
            raise HTTPException(400, error_envelope("missing_feed_type_id", "feed_type_id is required."))
        feed_check = await db.execute(
            text("""
                SELECT library_id FROM shared.farm_libraries
                WHERE library_id = :fid AND library_type = 'POULTRY_FEED' AND is_active = TRUE
            """),
            {"fid": feed_uuid},
        )
        if feed_check.first() is None:
            raise HTTPException(
                404,
                error_envelope("feed_type_not_found", f"Feed type {feed_type_id_value} not found or not active."),
            )

    # 2j. EGGS_SOLD-specific: buyer_id valid if provided (flock_id OPTIONAL)
    if submission.event_type == "EGGS_SOLD":
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))
        buyer_id_value = submission.payload.get("buyer_id")
        if buyer_id_value is not None:
            try:
                buyer_uuid = UUID(str(buyer_id_value))
            except (ValueError, TypeError):
                raise HTTPException(400, error_envelope("invalid_buyer_id", "buyer_id must be a valid UUID."))
            buyer_check = await db.execute(
                text("SELECT library_id FROM shared.farm_libraries WHERE library_id = :bid AND library_type = 'POULTRY_BUYER' AND is_active = TRUE"),
                {"bid": buyer_uuid},
            )
            if buyer_check.first() is None:
                raise HTTPException(404, error_envelope("buyer_not_found", f"Buyer {buyer_id_value} not found or not active."))

    # 2j-h. EGGS_SOLD: SEVERE health block check (Phase 6.6-2)
    if submission.event_type == "EGGS_SOLD" and submission.anchors.flock_id:
        health_block = await check_severe_health_block(
            db, tenant_uuid, submission.anchors.flock_id
        )
        if health_block:
            await emit_audit_event(
                db=db,
                tenant_id=tenant_uuid,
                event_type="WITHHOLDING_VIOLATION_ATTEMPTED",
                payload={
                    "blocked_event_type": "EGGS_SOLD",
                    "block_reason": "severe_health_observation",
                    "farm_id": submission.anchors.farm_id,
                    "pu_id": submission.anchors.pu_id,
                    "flock_id": submission.anchors.flock_id,
                    "violation": health_block,
                },
                actor_user_id=actor_uuid,
                entity_type="flock",
                entity_id=submission.anchors.flock_id,
            )
            await db.commit()
            raise HTTPException(
                status_code=409,
                detail=error_envelope(
                    "severe_health_block_active",
                    "Cannot sell eggs from this flock. Last health observation logged a SEVERE issue. Log a CLEARED HEALTH_OBSERVATION first.",
                    data=health_block,
                ),
            )

    # 2j-w. EGGS_SOLD: vaccination withholding check (Phase 6.6-1, Compliance Gate 6)
    if submission.event_type == "EGGS_SOLD" and submission.anchors.flock_id:
        violation = await check_vaccination_withholding(
            db, tenant_uuid, submission.anchors.flock_id, sale_kind="eggs"
        )
        if violation:
            await emit_audit_event(
                db=db,
                tenant_id=tenant_uuid,
                event_type="WITHHOLDING_VIOLATION_ATTEMPTED",
                payload={
                    "blocked_event_type": "EGGS_SOLD",
                    "farm_id": submission.anchors.farm_id,
                    "flock_id": submission.anchors.flock_id,
                    "violation": violation,
                },
                actor_user_id=actor_uuid,
                entity_type="flock",
                entity_id=submission.anchors.flock_id,
            )
            await db.commit()
            raise HTTPException(
                status_code=409,
                detail=error_envelope(
                    "vaccination_withholding_active",
                    f"Cannot sell eggs from this flock yet. {violation['vaccine_name']} withholding period ends in {violation['days_remaining']} day(s) (on {violation['withholding_until'][:10]}).",
                    data=violation,
                ),
            )

    # 2k. BIRDS_SOLD-specific: flock_id REQUIRED, sale_type in vocab, buyer_id valid if provided
    if submission.event_type == "BIRDS_SOLD":
        if submission.anchors.flock_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("birds_sold_requires_flock", "BIRDS_SOLD requires a flock_id anchor."),
            )
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))
        sale_type_value = submission.payload.get("sale_type")
        if sale_type_value not in BIRDS_SOLD_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("invalid_sale_type", f"sale_type must be one of {sorted(BIRDS_SOLD_TYPES)}."),
            )
        buyer_id_value = submission.payload.get("buyer_id")
        if buyer_id_value is not None:
            try:
                buyer_uuid = UUID(str(buyer_id_value))
            except (ValueError, TypeError):
                raise HTTPException(400, error_envelope("invalid_buyer_id", "buyer_id must be a valid UUID."))
            buyer_check = await db.execute(
                text("SELECT library_id FROM shared.farm_libraries WHERE library_id = :bid AND library_type = 'POULTRY_BUYER' AND is_active = TRUE"),
                {"bid": buyer_uuid},
            )
            if buyer_check.first() is None:
                raise HTTPException(404, error_envelope("buyer_not_found", f"Buyer {buyer_id_value} not found or not active."))

    # 2k-h. BIRDS_SOLD: SEVERE health block check (Phase 6.6-2)
    # SEVERE blocks ALL bird sales regardless of sale_type
    if submission.event_type == "BIRDS_SOLD" and submission.anchors.flock_id:
        health_block = await check_severe_health_block(
            db, tenant_uuid, submission.anchors.flock_id
        )
        if health_block:
            await emit_audit_event(
                db=db,
                tenant_id=tenant_uuid,
                event_type="WITHHOLDING_VIOLATION_ATTEMPTED",
                payload={
                    "blocked_event_type": "BIRDS_SOLD",
                    "block_reason": "severe_health_observation",
                    "sale_type": submission.payload.get("sale_type") if isinstance(submission.payload, dict) else None,
                    "farm_id": submission.anchors.farm_id,
                    "pu_id": submission.anchors.pu_id,
                    "flock_id": submission.anchors.flock_id,
                    "violation": health_block,
                },
                actor_user_id=actor_uuid,
                entity_type="flock",
                entity_id=submission.anchors.flock_id,
            )
            await db.commit()
            raise HTTPException(
                status_code=409,
                detail=error_envelope(
                    "severe_health_block_active",
                    "Cannot sell birds from this flock. Last health observation logged a SEVERE issue. Log a CLEARED HEALTH_OBSERVATION first.",
                    data=health_block,
                ),
            )

    # 2k-w. BIRDS_SOLD: vaccination withholding check for meat (Phase 6.6-1)
    if submission.event_type == "BIRDS_SOLD" and submission.anchors.flock_id:
        sale_type_for_check = submission.payload.get("sale_type") if isinstance(submission.payload, dict) else None
        if sale_type_for_check in ("LIVE_BIRD", "DRESSED"):
            violation = await check_vaccination_withholding(
                db, tenant_uuid, submission.anchors.flock_id, sale_kind="meat"
            )
            if violation:
                await emit_audit_event(
                    db=db,
                    tenant_id=tenant_uuid,
                    event_type="WITHHOLDING_VIOLATION_ATTEMPTED",
                    payload={
                        "blocked_event_type": "BIRDS_SOLD",
                        "sale_type": sale_type_for_check,
                        "farm_id": submission.anchors.farm_id,
                        "flock_id": submission.anchors.flock_id,
                        "violation": violation,
                    },
                    actor_user_id=actor_uuid,
                    entity_type="flock",
                    entity_id=submission.anchors.flock_id,
                )
                await db.commit()
                raise HTTPException(
                    status_code=409,
                    detail=error_envelope(
                        "vaccination_withholding_active",
                        f"Cannot sell birds from this flock yet for meat. {violation['vaccine_name']} withholding period ends in {violation['days_remaining']} day(s) (on {violation['withholding_until'][:10]}).",
                        data=violation,
                    ),
                )

    # 2h. WEIGHT_CHECK-specific: flock_id REQUIRED
    if submission.event_type == "WEIGHT_CHECK":
        if submission.anchors.flock_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("weight_check_requires_flock", "WEIGHT_CHECK requires a flock_id anchor."),
            )

    # 2i. BIRD_REPLACEMENT-specific: flock_id REQUIRED, reason in vocab, supplier_id valid if provided
    if submission.event_type == "BIRD_REPLACEMENT":
        if submission.anchors.flock_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("bird_replacement_requires_flock", "BIRD_REPLACEMENT requires a flock_id anchor."),
            )
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))
        reason_value = submission.payload.get("reason")
        if reason_value not in BIRD_REPLACEMENT_REASONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("invalid_replacement_reason", f"reason must be one of {sorted(BIRD_REPLACEMENT_REASONS)}."),
            )
        supplier_id_value = submission.payload.get("supplier_id")
        if supplier_id_value is not None:
            try:
                supplier_uuid = UUID(str(supplier_id_value))
            except (ValueError, TypeError):
                raise HTTPException(400, error_envelope("invalid_supplier_id", "supplier_id must be a valid UUID."))
            supplier_check = await db.execute(
                text("SELECT library_id FROM shared.farm_libraries WHERE library_id = :sid AND library_type = 'POULTRY_SUPPLIER' AND is_active = TRUE"),
                {"sid": supplier_uuid},
            )
            if supplier_check.first() is None:
                raise HTTPException(404, error_envelope("supplier_not_found", f"Supplier {supplier_id_value} not found or not active."))

    # 2g. FEED_RECEIVED-specific: feed_type_id valid, supplier_id valid (if provided)
    if submission.event_type == "FEED_RECEIVED":
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))

        feed_type_id_value = submission.payload.get("feed_type_id")
        supplier_id_value = submission.payload.get("supplier_id")

        # feed_type_id REQUIRED + must be valid UUID + active POULTRY_FEED in libraries
        try:
            feed_uuid = UUID(str(feed_type_id_value)) if feed_type_id_value else None
        except (ValueError, TypeError):
            raise HTTPException(400, error_envelope("invalid_feed_type_id", "feed_type_id must be a valid UUID."))
        if feed_uuid is None:
            raise HTTPException(400, error_envelope("missing_feed_type_id", "feed_type_id is required."))

        feed_check = await db.execute(
            text("""
                SELECT library_id FROM shared.farm_libraries
                WHERE library_id = :fid AND library_type = 'POULTRY_FEED' AND is_active = TRUE
            """),
            {"fid": feed_uuid},
        )
        if feed_check.first() is None:
            raise HTTPException(
                404,
                error_envelope("feed_type_not_found", f"Feed type {feed_type_id_value} not found or not active."),
            )

        # supplier_id OPTIONAL but if provided must be valid UUID + active POULTRY_SUPPLIER
        if supplier_id_value is not None:
            try:
                supplier_uuid = UUID(str(supplier_id_value))
            except (ValueError, TypeError):
                raise HTTPException(400, error_envelope("invalid_supplier_id", "supplier_id must be a valid UUID."))

            supplier_check = await db.execute(
                text("""
                    SELECT library_id FROM shared.farm_libraries
                    WHERE library_id = :sid AND library_type = 'POULTRY_SUPPLIER' AND is_active = TRUE
                """),
                {"sid": supplier_uuid},
            )
            if supplier_check.first() is None:
                raise HTTPException(
                    404,
                    error_envelope("supplier_not_found", f"Supplier {supplier_id_value} not found or not active."),
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

    # 2n. LITTER_CHANGED-specific: flock_id REQUIRED (Phase 6.3-11)
    if submission.event_type == "LITTER_CHANGED":
        if submission.anchors.flock_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("litter_changed_requires_flock", "LITTER_CHANGED requires a flock_id anchor (coop-scoped event)."),
            )
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))

    # 2o. COOP_CLEANED-specific: flock_id REQUIRED, disinfectant_id valid POULTRY_DISINFECTANT if provided (Phase 6.3-12)
    if submission.event_type == "COOP_CLEANED":
        if submission.anchors.flock_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("coop_cleaned_requires_flock", "COOP_CLEANED requires a flock_id anchor (coop-scoped event)."),
            )
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))
        disinfectant_id_value = submission.payload.get("disinfectant_id")
        if disinfectant_id_value is not None:
            try:
                disinfectant_uuid = UUID(str(disinfectant_id_value))
            except (ValueError, TypeError):
                raise HTTPException(400, error_envelope("invalid_disinfectant_id", "disinfectant_id must be a valid UUID."))
            disinfectant_check = await db.execute(
                text("""
                    SELECT library_id FROM shared.farm_libraries
                    WHERE library_id = :did AND library_type = 'POULTRY_DISINFECTANT' AND is_active = TRUE
                """),
                {"did": disinfectant_uuid},
            )
            if disinfectant_check.first() is None:
                raise HTTPException(
                    404,
                    error_envelope("disinfectant_not_found", f"Disinfectant {disinfectant_id_value} not found or not active."),
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
                text("UPDATE tenant.flocks SET current_count = current_count - :qty, updated_at = now() WHERE flock_id = :fid"),
                {"qty": qty_dead, "fid": submission.anchors.flock_id},
            )
        except IntegrityError as ie:
            await db.rollback()
            raise HTTPException(400, error_envelope("would_underflow_count", f"Logging {qty_dead} dead birds would put flock {submission.anchors.flock_id} below zero."))

    # 6b. Side effect for BIRD_REPLACEMENT: INCREMENT current_count (mirrors MORTALITY)
    if submission.event_type == "BIRD_REPLACEMENT":
        qty_added = payload_dict.get("qty_added", 0)
        await db.execute(
            text("UPDATE tenant.flocks SET current_count = current_count + :qty, updated_at = now() WHERE flock_id = :fid"),
            {"qty": qty_added, "fid": submission.anchors.flock_id},
        )

    # 6c. Side effect for BIRDS_SOLD: DECREMENT current_count (mirrors MORTALITY)
    if submission.event_type == "BIRDS_SOLD":
        qty_sold = payload_dict.get("qty_sold", 0)
        try:
            await db.execute(
                text("UPDATE tenant.flocks SET current_count = current_count - :qty, updated_at = now() WHERE flock_id = :fid"),
                {"qty": qty_sold, "fid": submission.anchors.flock_id},
            )
        except IntegrityError as ie:
            await db.rollback()
            raise HTTPException(400, error_envelope("would_underflow_count", f"Selling {qty_sold} birds would put flock {submission.anchors.flock_id} below zero."))

    # 6d. Phase 8-2: Compliance task auto-generation
    if submission.event_type == "HEALTH_OBSERVATION" and submission.anchors.flock_id:
        from app.services.task_generator import (
            create_compliance_task,
            close_compliance_tasks_for_entity,
            severe_health_task,
        )
        severity = payload_dict.get("severity")
        if severity == "SEVERE":
            flock_lookup = await db.execute(
                text("SELECT flock_label FROM tenant.flocks WHERE flock_id = :fid LIMIT 1"),
                {"fid": submission.anchors.flock_id},
            )
            flock_row = flock_lookup.first()
            flock_label = flock_row.flock_label if flock_row else submission.anchors.flock_id
            qty_affected = payload_dict.get("qty_affected")
            title, imperative, description = severe_health_task(
                submission.anchors.flock_id, flock_label, qty_affected
            )
            await create_compliance_task(
                db=db,
                tenant_id=tenant_uuid,
                farm_id=submission.anchors.farm_id,
                entity_type="flock",
                entity_id=submission.anchors.flock_id,
                title=title,
                imperative=imperative,
                description=description,
                priority="HIGH",
                task_rank=500,
            )
        elif severity == "CLEARED":
            await close_compliance_tasks_for_entity(
                db=db,
                tenant_id=tenant_uuid,
                entity_type="flock",
                entity_id=submission.anchors.flock_id,
                title_prefix="auto:severe_health:",
            )

    if submission.event_type == "VACCINATION_GIVEN" and submission.anchors.flock_id:
        from app.services.task_generator import (
            create_compliance_task,
            vaccination_withholding_task,
        )
        vaccine_id = payload_dict.get("vaccine_id")
        if vaccine_id:
            vaccine_lookup = await db.execute(
                text("""
                    SELECT name,
                           COALESCE((attributes->>'withholding_eggs_days')::int, 0) AS eggs_days,
                           COALESCE((attributes->>'withholding_meat_days')::int, 0) AS meat_days
                    FROM shared.farm_libraries WHERE library_id = :vid
                """),
                {"vid": vaccine_id},
            )
            v_row = vaccine_lookup.first()
            if v_row:
                max_days = max(int(v_row.eggs_days or 0), int(v_row.meat_days or 0))
                if max_days > 0:
                    flock_lookup = await db.execute(
                        text("SELECT flock_label FROM tenant.flocks WHERE flock_id = :fid LIMIT 1"),
                        {"fid": submission.anchors.flock_id},
                    )
                    f_row = flock_lookup.first()
                    flock_label = f_row.flock_label if f_row else submission.anchors.flock_id
                    sale_kind = "eggs" if v_row.eggs_days >= v_row.meat_days else "meat"
                    title, imperative, description = vaccination_withholding_task(
                        submission.anchors.flock_id, flock_label, v_row.name, max_days, sale_kind
                    )
                    await create_compliance_task(
                        db=db,
                        tenant_id=tenant_uuid,
                        farm_id=submission.anchors.farm_id,
                        entity_type="flock",
                        entity_id=submission.anchors.flock_id,
                        title=title,
                        imperative=imperative,
                        description=description,
                        priority="MEDIUM",
                        task_rank=600,
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
