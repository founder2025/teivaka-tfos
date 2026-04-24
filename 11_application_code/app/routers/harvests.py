"""harvests.py — Thin router; delegates to harvest_service.

Routes:
  POST   /api/v1/harvests/compliance-check  → pre-flight (no insert)
  POST   /api/v1/harvests                   → log harvest
  GET    /api/v1/harvests                   → list with filters
  GET    /api/v1/harvests/{harvest_id}      → detail

Three enforcement layers for inviolable rule #2 (chemical WHD):
  1. API role gate (this file) — only FOUNDER may set compliance_override.
     Every attempt is written to tenant.harvest_compliance_overrides before
     the harvest is touched, so denials leave a forensic trail.
  2. Service pre-check (harvest_service.check_chemical_compliance) — clean
     HTTP 409 when harvest is blocked and override was not set.
  3. DB trigger (tenant.enforce_harvest_compliance, 015a) — authoritative
     gate. RAISEs regardless of how the INSERT arrived.
"""
import json
import logging
import uuid
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.middleware.rls import ROLE_FOUNDER, get_current_user, get_tenant_db
from app.schemas.envelope import error_envelope, success_envelope
from app.services import harvest_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Override audit helpers ──────────────────────────────────────────────────
# These run in their own sessions so an approved-attempt row persists even if
# the subsequent harvest INSERT rolls back, and a denial row persists after
# we raise 403. Each session re-sets app.tenant_id for RLS.

async def _audit_override_attempt(
    *,
    tenant_id: str,
    user_id: str,
    role: str,
    reason: str,
    approved: bool,
    request_payload: dict,
) -> str:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config('app.tenant_id', :tid, true)"),
                {"tid": tenant_id},
            )
            row = (await session.execute(
                text("""
                    INSERT INTO tenant.harvest_compliance_overrides
                        (tenant_id, attempted_by_user_id, attempted_role,
                         reason, approved, request_payload)
                    VALUES
                        (:tenant_id, :user_id, :role,
                         :reason, :approved, CAST(:payload AS JSONB))
                    RETURNING override_id
                """),
                {
                    "tenant_id": tenant_id,
                    "user_id": user_id,
                    "role": role,
                    "reason": reason,
                    "approved": approved,
                    "payload": json.dumps(request_payload, default=str),
                },
            )).first()
    return str(row[0])


async def _link_override_to_harvest(
    *, tenant_id: str, override_id: str, harvest_id: str,
) -> None:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config('app.tenant_id', :tid, true)"),
                {"tid": tenant_id},
            )
            await session.execute(
                text("""
                    UPDATE tenant.harvest_compliance_overrides
                       SET harvest_id = :harvest_id
                     WHERE override_id = :override_id
                """),
                {"harvest_id": harvest_id, "override_id": override_id},
            )


async def _fire_override_critical_alert(
    *,
    tenant_id: str,
    cycle_id: str,
    pu_id: str,
    harvest_date: date,
    harvest_id: str,
    override_id: str,
    attempted_by_user_id: str,
    attempted_role: str,
    reason: str,
) -> None:
    """Write a CRITICAL business alert to tenant.alerts for a FOUNDER
    chemical-compliance override. Silent-safe: never raises — the override
    itself has already succeeded, alert failure must not 500 the request.

    rule_id points at RULE-038 (ChemicalCompliance), seeded by migration 021.
    WhatsApp dispatch is still a follow-up step (the template is stored on
    the rule row but not yet wired into the notification worker).
    """
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                await session.execute(
                    text("SELECT set_config('app.tenant_id', :tid, true)"),
                    {"tid": tenant_id},
                )

                compliance = await harvest_service.check_chemical_compliance(
                    session,
                    cycle_id=cycle_id,
                    pu_id=pu_id,
                    harvest_date=harvest_date,
                )

                farm_row = (await session.execute(
                    text("SELECT farm_id FROM tenant.production_units WHERE pu_id = :pu"),
                    {"pu": pu_id},
                )).first()
                if not farm_row:
                    logger.error("override alert: pu_id %s has no farm_id", pu_id)
                    return
                farm_id = farm_row[0]

                alert_id  = f"ALT-{uuid.uuid4().hex[:12].upper()}"
                alert_key = f"RULE-038:{farm_id}:{pu_id}:{override_id}"
                title     = "Chemical compliance override applied"
                message   = (
                    f"FOUNDER override on harvest {harvest_id} at {pu_id}. "
                    f"Reason: {reason}"
                )
                metadata = {
                    "event_type":           "FOUNDER_COMPLIANCE_OVERRIDE",
                    "override_id":          override_id,
                    "harvest_id":           harvest_id,
                    "pu_id":                pu_id,
                    "attempted_by_user_id": attempted_by_user_id,
                    "attempted_role":       attempted_role,
                    "reason":               reason,
                    "blocking_chemicals":   compliance.get("blocking_chemicals", []),
                    "whd_days_remaining":   compliance.get("days_remaining", 0),
                }

                await session.execute(
                    text("""
                        INSERT INTO tenant.alerts
                            (alert_id, tenant_id, farm_id, rule_id, alert_key,
                             severity, title, message, alert_status,
                             entity_type, entity_id, metadata)
                        VALUES
                            (:alert_id, CAST(:tenant_id AS uuid), :farm_id, :rule_id,
                             :alert_key, 'CRITICAL', :title, :message, 'ACTIVE',
                             'PU', :pu_id, CAST(:metadata AS JSONB))
                    """),
                    {
                        "alert_id":  alert_id,
                        "tenant_id": tenant_id,
                        "farm_id":   farm_id,
                        "rule_id":   "RULE-038",
                        "alert_key": alert_key,
                        "title":     title,
                        "message":   message,
                        "pu_id":     pu_id,
                        "metadata":  json.dumps(metadata, default=str),
                    },
                )
    except Exception:
        logger.exception("override alert write failed")


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
    result = await harvest_service.check_chemical_compliance(
        db,
        cycle_id=payload.cycle_id,
        pu_id=payload.pu_id,
        harvest_date=payload.harvest_date,
    )
    return success_envelope(result)


@router.post("", status_code=status.HTTP_201_CREATED, summary="Log a harvest")
async def create_harvest(
    payload: HarvestCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    tenant_id = str(user["tenant_id"])
    user_id   = str(user["user_id"])
    role      = user.get("role") or ""

    override_id: Optional[str] = None
    if payload.compliance_override:
        reason = (payload.override_reason or "").strip()
        if not reason:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=error_envelope(
                    "OVERRIDE_REASON_REQUIRED",
                    "override_reason is required when compliance_override is true",
                ),
            )

        request_payload = payload.model_dump(mode="json")

        if role != ROLE_FOUNDER:
            await _audit_override_attempt(
                tenant_id=tenant_id, user_id=user_id, role=role,
                reason=reason, approved=False, request_payload=request_payload,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=error_envelope(
                    "ROLE_REQUIRED_FOUNDER",
                    "Only FOUNDER can override chemical compliance.",
                ),
            )

        override_id = await _audit_override_attempt(
            tenant_id=tenant_id, user_id=user_id, role=role,
            reason=reason, approved=True, request_payload=request_payload,
        )

    result = await harvest_service.log_harvest(
        db,
        tenant_id=tenant_id,
        recorded_by=user_id,
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

    if override_id and result.get("harvest_id"):
        await _link_override_to_harvest(
            tenant_id=tenant_id,
            override_id=override_id,
            harvest_id=result["harvest_id"],
        )
        await _fire_override_critical_alert(
            tenant_id=tenant_id,
            cycle_id=payload.cycle_id,
            pu_id=payload.pu_id,
            harvest_date=payload.harvest_date,
            harvest_id=result["harvest_id"],
            override_id=override_id,
            attempted_by_user_id=user_id,
            attempted_role=role,
            reason=payload.override_reason or "",
        )

    return success_envelope(
        result,
        meta={"compliance_override_applied": bool(override_id)},
    )


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
    return success_envelope(
        {"harvests": rows},
        meta={"limit": limit, "offset": offset, "count": len(rows)},
    )


@router.get("/{harvest_id}", summary="Harvest detail")
async def get_harvest(
    harvest_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    row = await harvest_service.get_harvest(db, harvest_id=harvest_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_envelope("HARVEST_NOT_FOUND", f"No harvest {harvest_id!r}"),
        )
    return success_envelope(row)
