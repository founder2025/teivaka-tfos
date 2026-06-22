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
from uuid import UUID, uuid4

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
import hashlib
import os
from pathlib import Path

# Where uploaded photos physically live (mirrors feed.py upload storage).
_MEDIA_DIR = Path(os.environ.get("TFOS_MEDIA_DIR", "/app/uploads"))


def _hash_local_photo(photo_url) -> tuple[Optional[str], Optional[int]]:
    """SHA-256 + byte size of a locally-stored upload, resolved by filename. Fail-soft.

    Binds the IMAGE CONTENT — not just its URL — into the audit chain: the returned
    sha256 is folded into the audit payload, so the hash chain covers the exact bytes.
    A swapped or back-dated file no longer matches its logged hash → tamper-evident
    evidence. Never raises; returns (None, None) if the file can't be resolved or read
    (e.g. an external URL), so a photo problem can never block an event submission.
    """
    if not photo_url:
        return None, None
    try:
        name = str(photo_url).split("?", 1)[0].rstrip("/").rsplit("/", 1)[-1]
        if not name:
            return None, None
        base = _MEDIA_DIR.resolve()
        path = (base / name).resolve()
        if path != base and base not in path.parents:  # path-traversal guard
            return None, None
        if not path.is_file():
            return None, None
        data = path.read_bytes()
        return hashlib.sha256(data).hexdigest(), len(data)
    except Exception:
        return None, None


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
    idempotency_key: Optional[str] = Field(default=None, description="Client key; replays/double-taps return the original result instead of duplicating.")


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

    # 0. Idempotency — offline replays + double-taps return the original result
    # instead of creating a duplicate event (offline-first capture).
    idem_key = (submission.idempotency_key or "").strip() or None
    if idem_key:
        prior = (await db.execute(
            text("SELECT response_json FROM tenant.idempotency_keys WHERE tenant_id = :t AND idempotency_key = :k"),
            {"t": str(tenant_uuid), "k": idem_key},
        )).scalar()
        if prior is not None:
            return prior

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

    # 2p. FEED_PURCHASED-specific: feed_id valid POULTRY_FEED, supplier_id valid if provided (Phase 6.3-13)
    #     flock_id OPTIONAL - farm-wide purchase event.
    if submission.event_type == "FEED_PURCHASED":
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))
        feed_id_value = submission.payload.get("feed_id")
        if not feed_id_value:
            raise HTTPException(400, error_envelope("missing_feed_id", "feed_id is required."))
        try:
            feed_uuid = UUID(str(feed_id_value))
        except (ValueError, TypeError):
            raise HTTPException(400, error_envelope("invalid_feed_id", "feed_id must be a valid UUID."))
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
                error_envelope("feed_not_found", f"Feed {feed_id_value} not found or not active."),
            )
        supplier_id_value = submission.payload.get("supplier_id")
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

    # 2q. WATER_CONSUMED-specific: flock_id REQUIRED (coop-scoped event) (Phase 6.3-14)
    if submission.event_type == "WATER_CONSUMED":
        if submission.anchors.flock_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("water_consumed_requires_flock", "WATER_CONSUMED requires a flock_id anchor (coop-scoped event)."),
            )
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))

    # 2r. MORTALITY_INVESTIGATED-specific: flock_id REQUIRED, optional mortality_event_id UUID format check (Phase 6.3-15)
    if submission.event_type == "MORTALITY_INVESTIGATED":
        if submission.anchors.flock_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("mortality_investigated_requires_flock", "MORTALITY_INVESTIGATED requires a flock_id anchor (flock-scoped event)."),
            )
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))
        # If mortality_event_id provided, validate UUID format (existence check is soft - audit chain link only)
        mortality_event_id_value = submission.payload.get("mortality_event_id")
        if mortality_event_id_value is not None:
            try:
                UUID(str(mortality_event_id_value))
            except (ValueError, TypeError):
                raise HTTPException(400, error_envelope("invalid_mortality_event_id", "mortality_event_id must be a valid UUID."))

    # 2s. CULL_LOGGED-specific: flock_id REQUIRED (Phase 6.3-16)
    if submission.event_type == "CULL_LOGGED":
        if submission.anchors.flock_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("cull_logged_requires_flock", "CULL_LOGGED requires a flock_id anchor (flock-scoped event)."),
            )
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))

    # 2t. VISITOR_LOGGED-specific: farm_id required (flock_id optional), no FK validations (Phase 6.3-17)
    if submission.event_type == "VISITOR_LOGGED":
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))

    # 2u. PEST_CONTROL_APPLIED-specific: at least one of chemical_id / non_chemical_method must be provided (Phase 6.3-18)
    #     chemical_id is TEXT FK to shared.chemical_library.chemical_id (e.g. 'CHEM-001'), not a UUID.
    if submission.event_type == "PEST_CONTROL_APPLIED":
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))
        chemical_id_value = submission.payload.get("chemical_id")
        non_chemical_method_value = submission.payload.get("non_chemical_method")
        if not chemical_id_value and not non_chemical_method_value:
            raise HTTPException(
                status_code=400,
                detail=error_envelope("pest_control_method_required", "PEST_CONTROL_APPLIED requires either chemical_id or non_chemical_method (or both)."),
            )
        if chemical_id_value:
            if not isinstance(chemical_id_value, str) or not chemical_id_value.strip():
                raise HTTPException(400, error_envelope("invalid_chemical_id", "chemical_id must be a non-empty string."))
            chem_check = await db.execute(
                text("SELECT chemical_id FROM shared.chemical_library WHERE chemical_id = :cid LIMIT 1"),
                {"cid": chemical_id_value},
            )
            if chem_check.first() is None:
                raise HTTPException(
                    404,
                    error_envelope("chemical_not_found", f"Chemical {chemical_id_value} not found in shared.chemical_library."),
                )

    # 2v. TEMPERATURE_RECORDED-specific: flock_id REQUIRED (coop-scoped) (Phase 6.3-19)
    if submission.event_type == "TEMPERATURE_RECORDED":
        if submission.anchors.flock_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("temperature_recorded_requires_flock", "TEMPERATURE_RECORDED requires a flock_id anchor (coop-scoped event)."),
            )
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))

    # 2w. EGGS_GRADED-specific: flock_id REQUIRED (Phase 6.3-20)
    #     Subtotal validation enforced by Pydantic model_validator
    if submission.event_type == "EGGS_GRADED":
        if submission.anchors.flock_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("eggs_graded_requires_flock", "EGGS_GRADED requires a flock_id anchor (flock-scoped event)."),
            )
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))

    # 2x. FLOCK_MOVED-specific: flock_id REQUIRED (Phase 6.3-21)
    if submission.event_type == "FLOCK_MOVED":
        if submission.anchors.flock_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("flock_moved_requires_flock", "FLOCK_MOVED requires a flock_id anchor (flock-scoped event)."),
            )
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))

    # 2y. EQUIPMENT_MAINTAINED-specific: farm_id required (flock_id OPTIONAL — whole-farm or coop-specific) (Phase 6.3-22)
    if submission.event_type == "EQUIPMENT_MAINTAINED":
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))

    # 2z. INCIDENT_REPORTED-specific: farm_id required (flock_id OPTIONAL — whole-farm or coop-specific) (Phase 6.3-23)
    if submission.event_type == "INCIDENT_REPORTED":
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))

    # 2aa. SUPPLIES_RECEIVED-specific: farm_id required (flock_id OPTIONAL) (Phase 6.3-24)
    if submission.event_type == "SUPPLIES_RECEIVED":
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))

    # 2bb. CROPS-specific: cycle_id + pu_id REQUIRED (Strike #96 + 134 G3 unlocks)
    if submission.event_type in {"PLANTING", "IRRIGATION", "CHEMICAL_APPLIED",
                                  "FERTILIZER_APPLIED", "WEED_MANAGEMENT",
                                  "PRUNING_TRAINING", "TRANSPLANT_LOGGED", "LAND_PREP",
                                  "MULCHING", "THINNING", "COVER_CROP_PLANTED", "SEED_SAVED",
                                  "BIOLOGICAL_CONTROL_APPLIED", "CROP_HEALTH_OBSERVATION",
                                  "PEST_CONFIRMED", "DISEASE_CONFIRMED", "STORAGE_CHECK",
                                  "STORAGE_LOGGED", "INPUT_INVENTORY_CHECK", "NURSERY_LOSS",
                                  "CYCLE_ABANDONED", "CROP_SOLD", "CROP_GIVEN"}:
        if submission.anchors.cycle_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("crops_event_requires_cycle", "CROPS events require a cycle_id anchor (production cycle instance)."),
            )
        if submission.anchors.pu_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("crops_event_requires_pu", "CROPS events require a pu_id anchor (production unit)."),
            )
        if not isinstance(submission.payload, dict):
            raise HTTPException(400, error_envelope("invalid_payload", "Payload must be a dict."))

    # 2cc. CYCLE_CREATED-specific: pu_id REQUIRED + 409 ACTIVE_CYCLE_EXISTS guard (Strike #C2a)
    if submission.event_type == "CYCLE_CREATED":
        if submission.anchors.pu_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("cycle_create_requires_pu", "CYCLE_CREATED requires a pu_id anchor (block where cycle goes)."),
            )
        active_cycle_check = await db.execute(
            text("""
                SELECT cycle_id FROM tenant.production_cycles
                WHERE pu_id = :pu
                  AND cycle_status IN ('ACTIVE', 'HARVESTING', 'CLOSING')
                LIMIT 1
            """),
            {"pu": submission.anchors.pu_id},
        )
        existing_active = active_cycle_check.first()
        if existing_active is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=error_envelope(
                    code="ACTIVE_CYCLE_EXISTS",
                    message=f"Block {submission.anchors.pu_id} already has an active cycle: {existing_active.cycle_id}",
                ),
            )

    # 2dd. MEDICATION_GIVEN-specific: flock_id REQUIRED (129 catalog forensic)
    if submission.event_type == "MEDICATION_GIVEN":
        if submission.anchors.flock_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("medication_requires_flock", "MEDICATION_GIVEN requires a flock_id anchor."),
            )

    # 2ee. LIVESTOCK pack: farm anchor only (validated at step 2); flock_id must NOT
    #      be sent — livestock events are animal_ref-scoped, not flock-scoped (129).
    from app.schemas.events_registry import LIVESTOCK_EVENT_TYPES
    if submission.event_type in LIVESTOCK_EVENT_TYPES:
        if submission.anchors.flock_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_envelope("livestock_event_no_flock", "Livestock events use animal_ref in the payload, not a poultry flock anchor."),
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

    # Content-bind any attached photo: hash the stored bytes and fold the digest into
    # the audit payload so the hash chain covers the image itself (tamper-evident).
    photo_sha256_val, photo_byte_size_val = _hash_local_photo(payload_dict.get("photo_url"))

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
    if photo_sha256_val:
        audit_payload["photo_sha256"] = photo_sha256_val

    # 4b. Pre-generate field_event_id for CROPS branch (Strike #96 Path A — D1: FE-{12-hex})
    field_event_id_text: Optional[str] = None
    cycle_id_text: Optional[str] = None
    if target_table == "tenant.field_events":
        field_event_id_text = f"FE-{uuid4().hex[:12]}"
    elif target_table == "tenant.production_cycles":
        # Strike #C2a: pre-generate structured cycle_id CYC-{farm_id}-{pu_short}-{year}-{seq:03d}
        pu_short = submission.anchors.pu_id.rsplit("-", 1)[-1]
        planting_date_val = payload_dict["planting_date"]
        year = planting_date_val.year if hasattr(planting_date_val, "year") else int(str(planting_date_val)[:4])
        seq_check = await db.execute(
            text("""
                SELECT COALESCE(MAX(SUBSTRING(cycle_id FROM '(\\d+)$')::int), 0) + 1 AS next_seq
                FROM tenant.production_cycles
                WHERE pu_id = :pu
                  AND EXTRACT(YEAR FROM planting_date) = :yr
            """),
            {"pu": submission.anchors.pu_id, "yr": year},
        )
        next_seq = seq_check.first().next_seq
        cycle_id_text = f"CYC-{submission.anchors.farm_id}-{pu_short}-{year}-{next_seq:03d}"

    audit_event_id, audit_hash = await emit_audit_event(
        db=db,
        tenant_id=tenant_uuid,
        actor_user_id=actor_uuid,
        event_type=submission.event_type,
        entity_type=(
            "field_event" if target_table == "tenant.field_events"
            else "production_cycle" if target_table == "tenant.production_cycles"
            else "poultry_event"
        ),
        entity_id=field_event_id_text or cycle_id_text,
        occurred_at=occurred_ts,
        payload=audit_payload,
    )

    if audit_event_id is None or not audit_hash:
        raise HTTPException(500, error_envelope("audit_emission_failed", "Audit event emission failed."))

    # 5. INSERT event row — registry's target_table decides destination (Strike #96 Path A)
    if target_table == "tenant.field_events":
        # 5b. CROPS branch — vocabulary translation + structured-column mapping + payload_jsonb overflow
        CATALOG_TO_FIELD_VERB = {
            "PLANTING":           "PLANTING",
            "IRRIGATION":         "IRRIGATE",
            "CHEMICAL_APPLIED":   "SPRAY",
            "FERTILIZER_APPLIED": "FERTILIZE",
            "WEED_MANAGEMENT":    "WEED_MANAGEMENT",
            "PRUNING_TRAINING":   "PRUNE",
            "TRANSPLANT_LOGGED":  "TRANSPLANT",
            "LAND_PREP":          "LAND_PREP",
            # Phase I5 — scouting/observations onto existing field_events verbs
            "PEST_SCOUTING":      "PEST_OBSERVE",
            "DISEASE_SCOUTING":   "DISEASE_OBSERVE",
            "FIELD_OBSERVATION":  "INSPECTION",
            # CROPS G3 (134) — 15 unlocked crop forms
            "MULCHING":                   "MULCH",
            "THINNING":                   "THIN",
            "COVER_CROP_PLANTED":         "COVER_CROP",
            "SEED_SAVED":                 "SEED_SAVE",
            "BIOLOGICAL_CONTROL_APPLIED": "BIO_CONTROL",
            "CROP_HEALTH_OBSERVATION":    "CROP_HEALTH",
            "PEST_CONFIRMED":             "PEST_OBSERVE",
            "DISEASE_CONFIRMED":          "DISEASE_OBSERVE",
            "STORAGE_CHECK":              "STORAGE",
            "STORAGE_LOGGED":             "STORAGE",
            "INPUT_INVENTORY_CHECK":      "INSPECTION",
            "NURSERY_LOSS":               "LOSS",
            "CYCLE_ABANDONED":            "CYCLE_ABANDON",
            "CROP_SOLD":                  "CROP_SALE",
            "CROP_GIVEN":                 "CROP_GIVEN",
            "POST_HARVEST_LOSS":          "LOSS",
            "GRADING":                    "GRADE",
            "DELIVERY_DISPATCHED":        "DELIVERY_DISPATCH",
            "DELIVERY_CONFIRMED":         "DELIVERY_CONFIRM",
        }
        field_event_type = CATALOG_TO_FIELD_VERB[submission.event_type]
        is_chemical = submission.event_type == "CHEMICAL_APPLIED"

        await db.execute(
            text("""
                INSERT INTO tenant.field_events (
                    event_id, tenant_id, cycle_id, pu_id, farm_id,
                    event_type, event_date,
                    input_id, input_qty_used, input_cost_fjd,
                    labor_hours, labor_cost_fjd,
                    observation_text, photo_url, photo_sha256, photo_byte_size, gps_lat, gps_lng,
                    chemical_application, chemical_id,
                    chemical_dose_per_liter, tank_volume_liters,
                    created_by, audit_hash, payload_jsonb
                )
                VALUES (
                    :event_id, :tid, :cid, :pu, :fid,
                    :etype, :event_date,
                    :input_id, :input_qty_used, :input_cost_fjd,
                    :labor_hours, :labor_cost_fjd,
                    :observation_text, :photo_url, :photo_sha256, :photo_byte_size, :gps_lat, :gps_lng,
                    :chemical_application, :chemical_id,
                    :chemical_dose_per_liter, :tank_volume_liters,
                    :created_by, :audit_hash, CAST(:payload_jsonb AS jsonb)
                )
            """),
            {
                "event_id": field_event_id_text,
                "tid": tenant_uuid,
                "cid": submission.anchors.cycle_id,
                "pu": submission.anchors.pu_id,
                "fid": submission.anchors.farm_id,
                "etype": field_event_type,
                "event_date": occurred_ts,
                "input_id": payload_dict.get("input_id"),
                "input_qty_used": payload_dict.get("input_qty_used"),
                "input_cost_fjd": payload_dict.get("input_cost_fjd"),
                "labor_hours": payload_dict.get("labor_hours"),
                "labor_cost_fjd": payload_dict.get("labor_cost_fjd"),
                "observation_text": payload_dict.get("notes"),
                "photo_url": payload_dict.get("photo_url"),
                "photo_sha256": photo_sha256_val,
                "photo_byte_size": photo_byte_size_val,
                "audit_hash": audit_hash,
                "gps_lat": payload_dict.get("gps_lat"),
                "gps_lng": payload_dict.get("gps_lng"),
                "chemical_application": is_chemical,
                "chemical_id": payload_dict.get("chemical_id") if is_chemical else None,
                "chemical_dose_per_liter": payload_dict.get("application_rate") if is_chemical else None,
                "tank_volume_liters": payload_dict.get("tank_volume_liters") if is_chemical else None,
                "created_by": actor_uuid,
                "payload_jsonb": payload_json,
            },
        )
        event_id = field_event_id_text
    elif target_table == "tenant.production_cycles":
        # 5c. CYCLE_CREATED branch (Strike #C2a) — derive zone_id from PU then INSERT lifecycle row
        zone_check = await db.execute(
            text("SELECT zone_id FROM tenant.production_units WHERE pu_id = :pu"),
            {"pu": submission.anchors.pu_id},
        )
        zone_row = zone_check.first()
        if zone_row is None:
            raise HTTPException(404, error_envelope("pu_not_found", f"Production unit {submission.anchors.pu_id} not found."))

        # Every cycle carries a 3-Layer classification (Strike #101/#103). Resolve
        # from suggested_layer when not supplied; borderline crops must specify one.
        from app.services.cycle_service import resolve_layer
        try:
            resolved_layer = await resolve_layer(db, payload_dict["production_id"], payload_dict.get("layer"))
        except ValueError as e:
            raise HTTPException(422, error_envelope("layer_required", str(e)))

        await db.execute(
            text("""
                INSERT INTO tenant.production_cycles (
                    cycle_id, tenant_id, pu_id, zone_id, farm_id, production_id,
                    cycle_status, planting_date, expected_harvest_date,
                    planned_area_sqm, planned_yield_kg,
                    layer, farmer_label, cycle_notes, created_by
                )
                VALUES (
                    :cycle_id, :tid, :pu, :zone, :fid, :prod,
                    'PLANNED', :planting_date, :expected_harvest_date,
                    :planned_area_sqm, :planned_yield_kg,
                    :layer, :farmer_label, :cycle_notes, :created_by
                )
            """),
            {
                "cycle_id": cycle_id_text,
                "tid": tenant_uuid,
                "pu": submission.anchors.pu_id,
                "zone": zone_row.zone_id,
                "fid": submission.anchors.farm_id,
                "prod": payload_dict["production_id"],
                "planting_date": payload_dict["planting_date"],
                "expected_harvest_date": payload_dict.get("expected_harvest_date"),
                "planned_area_sqm": payload_dict.get("planned_area_sqm"),
                "planned_yield_kg": payload_dict.get("planned_yield_kg"),
                "layer": resolved_layer,
                "farmer_label": payload_dict.get("farmer_label"),
                "cycle_notes": payload_dict.get("cycle_notes"),
                "created_by": actor_uuid,
            },
        )
        event_id = cycle_id_text
    elif target_table == "tenant.livestock_events":
        # 5d. LIVESTOCK branch (129 catalog forensic) — animal_ref-scoped events
        insert_result = await db.execute(
            text("""
                INSERT INTO tenant.livestock_events (
                    tenant_id, farm_id, pu_id, animal_ref, species, created_by,
                    event_type, occurred_at, payload_jsonb, payload_schema_version, audit_event_id
                )
                VALUES (
                    :tid, :fid, :pu, :aref, :sp, :uid,
                    :et, :occ, CAST(:p AS jsonb), :ver, :aud
                )
                RETURNING event_id
            """),
            {
                "tid": tenant_uuid,
                "fid": submission.anchors.farm_id,
                "pu": submission.anchors.pu_id,
                "aref": payload_dict.get("animal_ref"),
                "sp": payload_dict.get("species"),
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
            raise HTTPException(500, error_envelope("insert_failed", "Livestock event insert failed after audit emission."))
        event_id = new_row.event_id
    else:
        # 5. (existing POULTRY path) INSERT event row with audit_event_id linked (TEXT anchors per Strike #21; flock_id added Phase 6.2-3)
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

    resp = success_envelope(
        {
            "event_id": str(event_id),
            "event_type": submission.event_type,
            "audit_event_id": str(audit_event_id),
            "audit_hash": audit_hash[-8:],
            "payload_schema_version": schema_version,
        },
        meta={"created": True, "table": target_table},
    )
    # Store the response under the idempotency key in the SAME transaction, so a
    # later replay returns this exact result without re-inserting the event.
    if idem_key:
        import json as _json
        await db.execute(
            text("INSERT INTO tenant.idempotency_keys (tenant_id, idempotency_key, user_id, response_json) "
                 "VALUES (:t, :k, :u, CAST(:r AS jsonb)) ON CONFLICT DO NOTHING"),
            {"t": str(tenant_uuid), "k": idem_key, "u": str(actor_uuid), "r": _json.dumps(resp)},
        )

    await db.commit()
    return resp
