"""field_events.py — Log and query farm field events.

Event types (14, enforced by CHECK constraint on tenant.field_events.event_type):
    PLANTING, TRANSPLANT, FERTILIZE, IRRIGATE, SPRAY, PRUNE,
    PEST_OBSERVE, DISEASE_OBSERVE, HARVEST_PARTIAL, HARVEST_FINAL,
    INSPECTION, SOIL_TEST, PHOTO, OTHER

SPRAY events feed the chemical compliance engine. The BEFORE INSERT trigger
`tenant.set_whd_clearance_date` (migration 015b) sets whd_clearance_date =
event_date + shared.chemical_library.withholding_period_days. This router
does NOT compute WHD — it hands a valid chemical_id + chemical_application
flag to the DB and trusts the trigger.

Responses use the Part 13 envelope helper (app.schemas.envelope).
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_chain import emit_audit_event
from app.core.task_engine import emit_task
from app.middleware.rls import (
    ROLE_ADMIN,
    ROLE_FOUNDER,
    get_current_user,
    get_tenant_db,
    require_role,
)
from app.schemas.envelope import error_envelope, success_envelope

router = APIRouter()


# ─── Enum ─────────────────────────────────────────────────────────────────────

EVENT_TYPES: frozenset[str] = frozenset({
    "PLANTING", "TRANSPLANT", "FERTILIZE", "IRRIGATE", "SPRAY", "PRUNE",
    "PEST_OBSERVE", "DISEASE_OBSERVE", "HARVEST_PARTIAL", "HARVEST_FINAL",
    "INSPECTION", "SOIL_TEST", "PHOTO", "OTHER",
})


# ─── Schemas ─────────────────────────────────────────────────────────────────

class FieldEventCreate(BaseModel):
    """Request body. `chemical_application` is the chem_name string for
    SPRAY events — looked up against shared.chemical_library.chem_name.
    (Not to be confused with the DB column of the same name, which is the
    boolean flag the trigger reads.)"""
    farm_id: str
    pu_id: str
    cycle_id: str  # DB is NOT NULL — required despite task spec saying optional
    event_type: str
    event_date: date
    performed_by_worker_id: Optional[str] = None
    input_id: Optional[str] = None
    notes: Optional[str] = None
    # SPRAY-only
    chemical_application: Optional[str] = None   # chem_name (human readable)
    quantity: Optional[Decimal] = Field(default=None, ge=0)
    quantity_unit: Optional[str] = None

    @field_validator("event_type")
    @classmethod
    def _event_type_valid(cls, v: str) -> str:
        v = v.upper().strip()
        if v not in EVENT_TYPES:
            raise ValueError(
                f"event_type must be one of {sorted(EVENT_TYPES)}"
            )
        return v


class FieldEventDelete(BaseModel):
    reason: str = Field(min_length=1)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _row_to_dict(row: dict) -> dict:
    """Normalise a SQLAlchemy mapping row for JSON."""
    out: dict[str, Any] = {}
    for k, v in row.items():
        if isinstance(v, (datetime, date)):
            out[k] = v.isoformat()
        elif isinstance(v, Decimal):
            out[k] = float(v)
        else:
            out[k] = v
    return out


async def _resolve_chemical_id(db: AsyncSession, chem_name: str) -> Optional[str]:
    row = (await db.execute(
        text("""
            SELECT chemical_id
              FROM shared.chemical_library
             WHERE chem_name = :name
             LIMIT 1
        """),
        {"name": chem_name.strip()},
    )).first()
    return row[0] if row else None


async def _next_event_id(db: AsyncSession, event_date: date) -> str:
    tag = event_date.strftime("%Y%m%d")
    row = (await db.execute(
        text("SELECT COUNT(*) FROM tenant.field_events WHERE event_id LIKE :pat"),
        {"pat": f"EVT-{tag}-%"},
    )).first()
    seq = int(row[0]) + 1 if row else 1
    return f"EVT-{tag}-{seq:03d}"


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED, summary="Log a field event")
async def create_field_event(
    payload: FieldEventCreate,
    response: Response,
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    tenant_id = str(user["tenant_id"])
    user_id   = str(user["user_id"])

    # Idempotency: if caller sent the same key before, return the existing
    # row with 200 OK (the work has already been done; no new resource is
    # created). First-time writes get the default 201.
    if idempotency_key:
        existing = (await db.execute(
            text("""
                SELECT *
                  FROM tenant.field_events
                 WHERE idempotency_key = :k
                 LIMIT 1
            """),
            {"k": idempotency_key},
        )).mappings().first()
        if existing:
            response.status_code = status.HTTP_200_OK
            return success_envelope(
                _row_to_dict(dict(existing)),
                meta={"idempotent_replay": True},
            )

    # SPRAY-specific validation
    chemical_id: Optional[str] = None
    chemical_application_flag = False
    if payload.event_type == "SPRAY":
        missing: list[str] = []
        if not payload.chemical_application: missing.append("chemical_application")
        if payload.quantity is None:         missing.append("quantity")
        if not payload.quantity_unit:        missing.append("quantity_unit")
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=error_envelope(
                    "SPRAY_FIELDS_REQUIRED",
                    f"SPRAY events require: {', '.join(missing)}",
                ),
            )
        chemical_id = await _resolve_chemical_id(db, payload.chemical_application)
        if not chemical_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=error_envelope(
                    "UNKNOWN_CHEMICAL",
                    f"No entry in shared.chemical_library for chem_name={payload.chemical_application!r}",
                ),
            )
        chemical_application_flag = True

    # Verify pu_id belongs to this tenant (RLS filters reads; this gives a
    # clean 404 instead of a generic FK failure).
    pu = (await db.execute(
        text("SELECT pu_id FROM tenant.production_units WHERE pu_id = :pu"),
        {"pu": payload.pu_id},
    )).first()
    if not pu:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_envelope(
                "PU_NOT_FOUND",
                f"Production unit {payload.pu_id!r} not found in this tenant.",
            ),
        )

    # Stash quantity_unit in observation_text (no dedicated column on DB).
    notes_parts: list[str] = []
    if payload.event_type == "SPRAY" and payload.quantity_unit:
        notes_parts.append(f"[qty: {payload.quantity} {payload.quantity_unit}]")
    if payload.notes:
        notes_parts.append(payload.notes.strip())
    observation_text = " ".join(notes_parts) if notes_parts else None

    event_id = await _next_event_id(db, payload.event_date)

    try:
        row = (await db.execute(
            text("""
                INSERT INTO tenant.field_events (
                    event_id, tenant_id, cycle_id, pu_id, farm_id,
                    event_type, event_date, performed_by_worker_id,
                    input_id, input_qty_used, observation_text,
                    chemical_application, chemical_id,
                    created_by, idempotency_key
                ) VALUES (
                    :event_id, :tenant_id, :cycle_id, :pu_id, :farm_id,
                    :event_type, :event_date, :worker_id,
                    :input_id, :qty, :notes,
                    :chem_flag, :chem_id,
                    :created_by, :idempotency_key
                )
                RETURNING *
            """),
            {
                "event_id":       event_id,
                "tenant_id":      tenant_id,
                "cycle_id":       payload.cycle_id,
                "pu_id":          payload.pu_id,
                "farm_id":        payload.farm_id,
                "event_type":     payload.event_type,
                "event_date":     payload.event_date,
                "worker_id":      payload.performed_by_worker_id,
                "input_id":       payload.input_id,
                "qty":            payload.quantity,
                "notes":          observation_text,
                "chem_flag":      chemical_application_flag,
                "chem_id":        chemical_id,
                "created_by":     user_id,
                "idempotency_key": idempotency_key,
            },
        )).mappings().first()

        # Emit audit.events (v4.1 Bank Evidence spine).
        #
        # SPRAY events emit CHEMICAL_APPLIED — the existing
        # audit_events_event_type_valid CHECK constraint already includes
        # this value. Hash-chain participation is mandatory for SPRAY
        # because it gates harvest compliance (WHD trigger).
        #
        # Other 13 event types (PLANTING, FERTILIZE, IRRIGATE, PRUNE,
        # PEST_OBSERVE, DISEASE_OBSERVE, etc.) have no matching value in
        # the audit.events CHECK constraint — adding FIELD_EVENT_LOGGED
        # would require a migration that broadens the constraint. Deferred
        # to a Phase 4.x.5 follow-up; non-SPRAY events skip audit for now.
        # The field_events row itself is the system of record for those.
        if payload.event_type == "SPRAY":
            # Seed a WHD-clearance reminder for harvest readiness.
            # Composed from human-readable fields only — no internal IDs leak
            # into farmer-facing text (Universal Naming v2). Skipped silently
            # if the BEFORE-INSERT trigger could not derive whd_clearance_date.
            whd_date = row.get("whd_clearance_date")
            seeded_task_id: Optional[str] = None
            if whd_date is not None:
                display = (await db.execute(
                    text("""
                        SELECT
                          (SELECT chem_name
                             FROM shared.chemical_library
                            WHERE chemical_id = :chem_id) AS chem_name,
                          (SELECT p.production_name
                             FROM tenant.production_cycles pc
                             JOIN shared.productions p
                               ON p.production_id = pc.production_id
                            WHERE pc.cycle_id = :cyc_id) AS production_name,
                          (SELECT pu_name
                             FROM tenant.production_units
                            WHERE pu_id = :pu_id) AS pu_name
                    """),
                    {
                        "chem_id": chemical_id,
                        "cyc_id":  payload.cycle_id,
                        "pu_id":   payload.pu_id,
                    },
                )).first()

                prod_label = (display.production_name if display and display.production_name else "Crop")
                pu_label   = (display.pu_name         if display and display.pu_name         else "block")
                chem_label = (display.chem_name       if display and display.chem_name       else "spray")

                imperative = (
                    f"{prod_label} on {pu_label} ready to harvest — "
                    f"{chem_label} withholding period complete"
                )[:120]

                task_uuid = await emit_task(
                    db=db,
                    tenant_id=UUID(tenant_id),
                    farm_id=payload.farm_id,
                    source_module="compliance",
                    source_reference=event_id,
                    imperative=imperative,
                    rank=400,
                    icon_key="Sprout",
                    input_hint="confirm_yn",
                    entity_type="CYCLE",
                    entity_id=payload.cycle_id,
                    task_type="REMINDER",
                )
                seeded_task_id = str(task_uuid)

                # emit_task does not expose due_date; set the WHD scheduling
                # date on the row it just upserted. Same transaction as the
                # field_event insert so the reminder cannot exist without
                # the SPRAY event that spawned it.
                await db.execute(
                    text("""
                        UPDATE tenant.task_queue
                           SET due_date = :due
                         WHERE task_id  = :tid
                    """),
                    {"due": whd_date, "tid": seeded_task_id},
                )

            # CHEMICAL_APPLIED is the v4.1 audit-chain spine for SPRAY.
            # TASK_SEEDED is not in audit_events_event_type_valid, so
            # task_id + due_date piggyback into this payload to keep the
            # reminder seed traceable through the hash chain.
            await emit_audit_event(
                db=db,
                tenant_id=UUID(tenant_id),
                actor_user_id=UUID(user_id),
                event_type="CHEMICAL_APPLIED",
                entity_type="field_event",
                entity_id=event_id,
                payload={
                    "event_id":             event_id,
                    "cycle_id":             payload.cycle_id,
                    "pu_id":                payload.pu_id,
                    "farm_id":              payload.farm_id,
                    "event_type":           payload.event_type,
                    "event_date":           payload.event_date.isoformat(),
                    "chemical_id":          chemical_id,
                    "chemical_application": chemical_application_flag,
                    "whd_clearance_date":   whd_date.isoformat() if whd_date else None,
                    "seeded_task_id":       seeded_task_id,
                },
            )

        await db.commit()
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        msg = str(e)
        # Surface FK failures as 409 instead of 500.
        if "foreign key" in msg.lower() or "violates" in msg.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=error_envelope("FK_VIOLATION", msg.split("\n")[0]),
            )
        raise

    return success_envelope(_row_to_dict(dict(row)))


@router.get("", summary="List field events")
async def list_field_events(
    farm_id:    Optional[str] = Query(None),
    pu_id:      Optional[str] = Query(None),
    cycle_id:   Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    from_date:  Optional[date] = Query(None),
    to_date:    Optional[date] = Query(None),
    limit:      int = Query(50, ge=1, le=200),
    offset:     int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    filters = ["deleted_at IS NULL"]
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    if farm_id:
        filters.append("farm_id = :farm_id");   params["farm_id"] = farm_id
    if pu_id:
        filters.append("pu_id = :pu_id");       params["pu_id"] = pu_id
    if cycle_id:
        filters.append("cycle_id = :cycle_id"); params["cycle_id"] = cycle_id
    if event_type:
        et = event_type.upper().strip()
        if et not in EVENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=error_envelope(
                    "INVALID_EVENT_TYPE",
                    f"event_type must be one of {sorted(EVENT_TYPES)}",
                ),
            )
        filters.append("event_type = :event_type")
        params["event_type"] = et
    if from_date:
        filters.append("event_date::DATE >= :from_date"); params["from_date"] = from_date
    if to_date:
        filters.append("event_date::DATE <= :to_date");   params["to_date"] = to_date

    where = " AND ".join(filters)

    rows = (await db.execute(
        text(f"""
            SELECT *
              FROM tenant.field_events
             WHERE {where}
          ORDER BY event_date DESC, event_id DESC
             LIMIT :limit OFFSET :offset
        """),
        params,
    )).mappings().all()

    total = (await db.execute(
        text(f"SELECT COUNT(*) FROM tenant.field_events WHERE {where}"),
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )).scalar_one()

    events = [_row_to_dict(dict(r)) for r in rows]
    next_offset = offset + len(events) if offset + len(events) < total else None

    return success_envelope(
        {"events": events, "total": int(total)},
        meta={"limit": limit, "offset": offset, "next_offset": next_offset},
    )


@router.get("/{event_id}", summary="Field event detail")
async def get_field_event(
    event_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    row = (await db.execute(
        text("""
            SELECT *
              FROM tenant.field_events
             WHERE event_id = :eid
               AND deleted_at IS NULL
             LIMIT 1
        """),
        {"eid": event_id},
    )).mappings().first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_envelope("EVENT_NOT_FOUND", f"No event {event_id!r}"),
        )
    return success_envelope(_row_to_dict(dict(row)))


@router.delete("/{event_id}", summary="Soft-delete a field event")
async def soft_delete_field_event(
    event_id: str,
    payload: FieldEventDelete,
    user: dict = Depends(require_role(ROLE_FOUNDER, ROLE_ADMIN)),
    db: AsyncSession = Depends(get_tenant_db),
):
    result = await db.execute(
        text("""
            UPDATE tenant.field_events
               SET deleted_at     = NOW(),
                   deleted_by     = :uid,
                   deleted_reason = :reason
             WHERE event_id   = :eid
               AND deleted_at IS NULL
         RETURNING event_id, deleted_at
        """),
        {
            "eid":    event_id,
            "uid":    str(user["user_id"]),
            "reason": payload.reason.strip(),
        },
    )
    row = result.mappings().first()
    await db.commit()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_envelope(
                "EVENT_NOT_FOUND",
                f"No live event {event_id!r} to delete",
            ),
        )
    return success_envelope(_row_to_dict(dict(row)))
