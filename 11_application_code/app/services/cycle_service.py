from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from decimal import Decimal
from typing import Optional
from datetime import date
from uuid import UUID
import uuid
import logging

from app.core.audit_chain import emit_audit_event
from app.services.rotation_service import validate_rotation, CAN_START, log_rotation_override

logger = logging.getLogger(__name__)


# Migration 026 partial unique index name — checked to map IntegrityError
# into the application's PU_ALREADY_HAS_ACTIVE_CYCLE sentinel.
_ACTIVE_PU_INDEX = "ix_cycles_one_active_per_pu"


# ─── State machine ────────────────────────────────────────────────────────────
# Phase 4.2 Step 5-6 addendum. Rotation validation runs on CREATE only;
# transitions do NOT re-validate rotation (PU crop does not change during
# a cycle lifecycle, so rotation is a create-time invariant).

_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "PLANNED":    {"ACTIVE", "FAILED"},
    "ACTIVE":     {"HARVESTING", "CLOSING", "FAILED"},
    "HARVESTING": {"CLOSING", "FAILED"},
    "CLOSING":    {"CLOSED", "FAILED"},
    "CLOSED":     set(),
    "FAILED":     set(),
}


def is_valid_transition(from_status: str, to_status: str) -> bool:
    return to_status in _ALLOWED_TRANSITIONS.get(from_status, set())


def generate_cycle_id(farm_id: str, pu_id: str, year: int, seq: int) -> str:
    """CYC-F001-Z01-PU01-2026-001"""
    pu_parts = pu_id.replace(farm_id + "-", "")
    return f"CYC-{farm_id}-{pu_parts}-{year}-{seq:03d}"


def compute_cogk(
    total_labor_cost: Decimal,
    total_input_cost: Decimal,
    total_other_cost: Decimal,
    total_harvest_kg: Decimal,
) -> Optional[Decimal]:
    """
    CoKG = (LaborCost + InputCost + OtherCost) / HarvestQty_kg
    Returns NULL (None) if total_harvest_kg is zero or None.
    NEVER divide by zero.
    """
    if not total_harvest_kg or total_harvest_kg == 0:
        return None
    total_cost = total_labor_cost + total_input_cost + total_other_cost
    return round(total_cost / total_harvest_kg, 4)


async def create_cycle(
    session: AsyncSession,
    pu_id: str,
    production_id: str,
    planting_date: date,
    planned_area_sqm: Optional[float],
    planned_yield_kg: Optional[float],
    cycle_notes: Optional[str],
    created_by_user_id: str,
    tenant_id: str,
    override_reason: Optional[str] = None,
    farm_id: Optional[str] = None,
) -> dict:
    """
    Creates a production cycle. Validates rotation first.
    Returns the created cycle dict.
    Raises ValueError if rotation BLOCK (cannot override BLOCK, only AVOID).
    """
    # 1. Validate rotation (DB function is the single source of truth)
    rotation = await validate_rotation(
        session,
        pu_id=pu_id,
        production_id=production_id,
        planting_date=planting_date,
        tenant_id=tenant_id,
    )

    if rotation["rotation_status"] == "BLOCK":
        raise ValueError(
            f"ROTATION_BLOCKED: {rotation['message']} "
            f"days_short={rotation.get('days_short')} "
            f"alternatives={[a.get('production_name') or a.get('production_id') for a in rotation['alternatives']]}"
        )

    if rotation["rotation_status"] == "AVOID" and not override_reason:
        raise ValueError(
            f"ROTATION_AVOID: Override reason required. {rotation['message']}"
        )

    # 2. Get next sequence for this PU
    seq_result = await session.execute(
        text("""
            SELECT COUNT(*) + 1 AS next_seq
            FROM tenant.production_cycles
            WHERE pu_id = :pu_id AND EXTRACT(YEAR FROM planting_date) = :year
        """),
        {"pu_id": pu_id, "year": planting_date.year}
    )
    seq = seq_result.scalar_one()

    # 3. Get farm_id if not provided
    if not farm_id:
        pu_result = await session.execute(
            text("SELECT farm_id FROM tenant.production_units WHERE pu_id = :pu_id"),
            {"pu_id": pu_id}
        )
        farm_id = pu_result.scalar_one()

    # 4. Generate cycle_id
    cycle_id = generate_cycle_id(farm_id, pu_id, planting_date.year, seq)

    final_status = "ACTIVE"

    # 5. Insert cycle. Migration 026 partial unique index on
    #    (pu_id) WHERE cycle_status IN (ACTIVE,HARVESTING,CLOSING) blocks
    #    a second live cycle on the same PU; translate that specific
    #    IntegrityError into PU_ALREADY_HAS_ACTIVE_CYCLE so the router
    #    surfaces a 4xx rather than a 500.
    try:
        await session.execute(
            text("""
                INSERT INTO tenant.production_cycles
                    (cycle_id, tenant_id, pu_id, zone_id, farm_id, production_id,
                     cycle_status, planting_date, planned_area_sqm, planned_yield_kg,
                     cycle_notes, created_by, total_labor_cost_fjd, total_input_cost_fjd,
                     total_other_cost_fjd, total_revenue_fjd)
                SELECT
                    :cycle_id, :tenant_id, :pu_id, pu.zone_id, :farm_id, :production_id,
                    :final_status, :planting_date, :planned_area_sqm, :planned_yield_kg,
                    :cycle_notes, :created_by, 0, 0, 0, 0
                FROM tenant.production_units pu
                WHERE pu.pu_id = :pu_id
            """),
            {
                "cycle_id": cycle_id,
                "tenant_id": tenant_id,
                "pu_id": pu_id,
                "farm_id": farm_id,
                "production_id": production_id,
                "planting_date": planting_date,
                "planned_area_sqm": planned_area_sqm,
                "planned_yield_kg": planned_yield_kg,
                "cycle_notes": cycle_notes,
                "created_by": created_by_user_id,
                "final_status": final_status,
            }
        )
    except IntegrityError as e:
        if _ACTIVE_PU_INDEX in str(getattr(e, "orig", e)):
            raise ValueError(
                f"PU_ALREADY_HAS_ACTIVE_CYCLE: pu_id={pu_id} already has a "
                "non-terminal cycle. Close or fail the existing cycle before "
                "starting a new one."
            ) from e
        raise

    # 6. Update PU current cycle
    await session.execute(
        text("""
            UPDATE tenant.production_units
            SET current_cycle_id = :cycle_id,
                current_production_id = :production_id,
                updated_at = NOW()
            WHERE pu_id = :pu_id
        """),
        {"cycle_id": cycle_id, "production_id": production_id, "pu_id": pu_id}
    )

    # 7. Log override if needed
    if rotation["rotation_status"] == "AVOID" and override_reason:
        await log_rotation_override(
            session, pu_id, production_id, "AVOID",
            override_reason, created_by_user_id, cycle_id, tenant_id
        )

    # 8. Emit audit.events (v4.1 Bank Evidence spine — non-negotiable).
    #    Step 5-6 smoke test exposed that create_cycle did not hash-chain
    #    into audit.events. from_status=None reflects the genesis
    #    transition into final_status (typically ACTIVE). The hash is NOT
    #    plumbed back into the response envelope — create responses are
    #    narrower than PATCH transition responses by design.
    await emit_audit_event(
        db=session,
        tenant_id=UUID(tenant_id),
        actor_user_id=UUID(created_by_user_id),
        event_type="CYCLE_TRANSITION",
        entity_type="production_cycle",
        entity_id=cycle_id,
        payload={
            "from_status": None,
            "to_status": final_status,
            "pu_id": pu_id,
            "production_id": production_id,
            "planting_date": planting_date.isoformat(),
            "rotation_status": rotation["rotation_status"],
            "override_reason": override_reason,
        },
    )

    return {
        "cycle_id": cycle_id,
        "pu_id": pu_id,
        "farm_id": farm_id,
        "production_id": production_id,
        "cycle_status": final_status,
        "planting_date": planting_date.isoformat(),
        "rotation_status": rotation["rotation_status"],
        "override_applied": rotation["rotation_status"] == "AVOID",
    }


async def get_cycle_financials(
    session: AsyncSession,
    cycle_id: str,
) -> dict:
    """
    Returns cycle financials with CoKG as first field.
    Reads from cycle_financials materialized summary if available,
    falls back to production_cycles columns.
    """
    result = await session.execute(
        text("""
            SELECT
                cf.cogk_fjd_per_kg,
                cf.total_labor_cost_fjd,
                cf.total_input_cost_fjd,
                cf.total_other_cost_fjd,
                cf.total_cost_fjd,
                cf.total_revenue_fjd,
                cf.gross_profit_fjd,
                cf.gross_margin_pct,
                cf.total_harvest_kg,
                cf.labor_cost_ratio_pct,
                cf.harvest_variance_pct,
                cf.last_computed_at,
                pc.cycle_id,
                pc.production_id,
                pc.cycle_status,
                pc.planting_date,
                p.production_name
            FROM tenant.cycle_financials cf
            JOIN tenant.production_cycles pc ON pc.cycle_id = cf.cycle_id
            JOIN shared.productions p ON p.production_id = pc.production_id
            WHERE cf.cycle_id = :cycle_id
        """),
        {"cycle_id": cycle_id}
    )
    row = result.mappings().first()

    if not row:
        # Fall back to production_cycles if cycle_financials not yet computed
        result = await session.execute(
            text("""
                SELECT
                    pc.*,
                    p.production_name,
                    CASE WHEN pc.actual_yield_kg > 0
                        THEN ROUND((pc.total_labor_cost_fjd + pc.total_input_cost_fjd + pc.total_other_cost_fjd) / pc.actual_yield_kg, 4)
                        ELSE NULL
                    END AS cogk_fjd_per_kg
                FROM tenant.production_cycles pc
                JOIN shared.productions p ON p.production_id = pc.production_id
                WHERE pc.cycle_id = :cycle_id
            """),
            {"cycle_id": cycle_id}
        )
        row = result.mappings().first()

    if not row:
        raise ValueError(f"Cycle {cycle_id} not found")

    return dict(row)


async def transition_cycle_status(
    session: AsyncSession,
    cycle_id: str,
    target_status: str,
    actor_user_id: str,
    tenant_id: str,
    notes: Optional[str] = None,
) -> dict:
    """Advance a cycle through the allowed state machine.

    Side effects per target:
      HARVESTING → sets actual_harvest_start = CURRENT_DATE if NULL
      CLOSING    → sets actual_harvest_end   = CURRENT_DATE if NULL
      CLOSED     → compute_cogk, UPSERT tenant.cycle_financials row,
                   set closed_by/closed_at, clear PU.current_cycle_id
      FAILED     → set closed_by/closed_at, clear PU.current_cycle_id
                   (skip compute_cogk — FAILED cycles carry no harvest.
                    TODO: once cycle_financials gains a sunk_cost_fjd
                    field, write a partial roll-up here.)

    No rotation re-validation: the rotation gate is create-time only.

    Emits one audit.events row with event_type='CYCLE_TRANSITION' and
    payload {cycle_id, farm_id, from_status, to_status, notes,
    actor_user_id}. Returns (cycle_id, from_status, to_status,
    audit_event_id, audit_this_hash).
    """
    # App-layer tenant scope: teivaka DB role currently bypasses RLS, so
    # enforce the tenant boundary here rather than rely on policies.
    row = (await session.execute(
        text("""
            SELECT pu_id, farm_id, cycle_status
            FROM tenant.production_cycles
            WHERE cycle_id = :cid AND tenant_id = :tid
        """),
        {"cid": cycle_id, "tid": tenant_id},
    )).mappings().first()
    if not row:
        raise LookupError(f"Cycle {cycle_id} not found")

    from_status = row["cycle_status"]
    if from_status == target_status:
        raise ValueError(
            f"CYCLE_TRANSITION_NOOP: cycle already in status {target_status}"
        )
    if not is_valid_transition(from_status, target_status):
        raise ValueError(
            f"CYCLE_TRANSITION_INVALID: {from_status} → {target_status} not allowed"
        )

    if target_status == "HARVESTING":
        await session.execute(
            text("""
                UPDATE tenant.production_cycles
                SET cycle_status = 'HARVESTING',
                    actual_harvest_start = COALESCE(actual_harvest_start, CURRENT_DATE),
                    updated_at = NOW()
                WHERE cycle_id = :cid
            """),
            {"cid": cycle_id},
        )
    elif target_status == "CLOSING":
        await session.execute(
            text("""
                UPDATE tenant.production_cycles
                SET cycle_status = 'CLOSING',
                    actual_harvest_end = COALESCE(actual_harvest_end, CURRENT_DATE),
                    updated_at = NOW()
                WHERE cycle_id = :cid
            """),
            {"cid": cycle_id},
        )
    elif target_status == "CLOSED":
        # Compute CoKG inline from production_cycles.* totals (which are
        # maintained by the existing update_cycle_on_harvest /
        # recompute_cycle_financials triggers). The tenant.compute_cogk()
        # DB function references unqualified `labor_log` / `cash_ledger`
        # and cannot run — that's a latent schema-drift bug that needs
        # its own migration; not fixing it here (scope = transition path).
        await session.execute(
            text("""
                INSERT INTO tenant.cycle_financials (
                    financial_id, tenant_id, cycle_id, farm_id,
                    total_labor_cost_fjd, total_input_cost_fjd, total_other_cost_fjd,
                    total_cost_fjd, total_revenue_fjd, total_harvest_kg,
                    cogk_fjd_per_kg, last_computed_at
                )
                SELECT
                    'CFN-' || pc.cycle_id, pc.tenant_id, pc.cycle_id, pc.farm_id,
                    pc.total_labor_cost_fjd, pc.total_input_cost_fjd, pc.total_other_cost_fjd,
                    pc.total_labor_cost_fjd + pc.total_input_cost_fjd + pc.total_other_cost_fjd,
                    pc.total_revenue_fjd, COALESCE(pc.actual_yield_kg, 0),
                    CASE WHEN pc.actual_yield_kg IS NOT NULL AND pc.actual_yield_kg > 0
                         THEN ROUND(
                             (pc.total_labor_cost_fjd + pc.total_input_cost_fjd
                              + pc.total_other_cost_fjd) / pc.actual_yield_kg, 4)
                         ELSE NULL END,
                    NOW()
                FROM tenant.production_cycles pc
                WHERE pc.cycle_id = :cid
                ON CONFLICT (cycle_id) DO UPDATE SET
                    total_labor_cost_fjd = EXCLUDED.total_labor_cost_fjd,
                    total_input_cost_fjd = EXCLUDED.total_input_cost_fjd,
                    total_other_cost_fjd = EXCLUDED.total_other_cost_fjd,
                    total_cost_fjd       = EXCLUDED.total_cost_fjd,
                    total_revenue_fjd    = EXCLUDED.total_revenue_fjd,
                    total_harvest_kg     = EXCLUDED.total_harvest_kg,
                    cogk_fjd_per_kg      = EXCLUDED.cogk_fjd_per_kg,
                    last_computed_at     = NOW()
            """),
            {"cid": cycle_id},
        )
        await session.execute(
            text("""
                UPDATE tenant.production_cycles pc
                SET cycle_status = 'CLOSED',
                    closed_by = :actor,
                    closed_at = NOW(),
                    cogk_fjd_per_kg = CASE
                        WHEN pc.actual_yield_kg IS NOT NULL AND pc.actual_yield_kg > 0
                        THEN ROUND(
                            (pc.total_labor_cost_fjd + pc.total_input_cost_fjd
                             + pc.total_other_cost_fjd) / pc.actual_yield_kg, 4)
                        ELSE NULL END,
                    updated_at = NOW()
                WHERE pc.cycle_id = :cid
            """),
            {"cid": cycle_id, "actor": actor_user_id},
        )
        await session.execute(
            text("""
                UPDATE tenant.production_units
                SET current_cycle_id = NULL, updated_at = NOW()
                WHERE pu_id = :puid AND current_cycle_id = :cid
            """),
            {"puid": row["pu_id"], "cid": cycle_id},
        )
    elif target_status == "FAILED":
        await session.execute(
            text("""
                UPDATE tenant.production_cycles
                SET cycle_status = 'FAILED',
                    closed_by = :actor,
                    closed_at = NOW(),
                    updated_at = NOW()
                WHERE cycle_id = :cid
            """),
            {"cid": cycle_id, "actor": actor_user_id},
        )
        await session.execute(
            text("""
                UPDATE tenant.production_units
                SET current_cycle_id = NULL, updated_at = NOW()
                WHERE pu_id = :puid AND current_cycle_id = :cid
            """),
            {"puid": row["pu_id"], "cid": cycle_id},
        )
    else:  # ACTIVE
        await session.execute(
            text("""
                UPDATE tenant.production_cycles
                SET cycle_status = :ts, updated_at = NOW()
                WHERE cycle_id = :cid
            """),
            {"cid": cycle_id, "ts": target_status},
        )

    event_id, this_hash = await emit_audit_event(
        db=session,
        tenant_id=UUID(tenant_id),
        event_type="CYCLE_TRANSITION",
        entity_type="production_cycle",
        entity_id=cycle_id,
        actor_user_id=UUID(actor_user_id),
        payload={
            "cycle_id": cycle_id,
            "farm_id": row["farm_id"],
            "from_status": from_status,
            "to_status": target_status,
            "notes": notes,
            "actor_user_id": actor_user_id,
        },
    )

    return {
        "cycle_id": cycle_id,
        "from_status": from_status,
        "to_status": target_status,
        "audit_event_id": str(event_id),
        "audit_this_hash": this_hash,
    }


async def close_cycle(
    session: AsyncSession,
    cycle_id: str,
    closed_by_user_id: str,
    closing_notes: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> dict:
    """Sugar wrapper around transition_cycle_status(target_status='CLOSED').

    Kept for the PATCH /{id}/close endpoint. All close-time semantics
    (compute_cogk + cycle_financials UPSERT + PU clear + audit) live in
    transition_cycle_status — this function is a single delegating call.
    """
    if tenant_id is None:
        # Resolve tenant_id from the cycle row if the caller didn't pass it.
        tid_row = (await session.execute(
            text("SELECT tenant_id FROM tenant.production_cycles WHERE cycle_id = :cid"),
            {"cid": cycle_id},
        )).scalar()
        if tid_row is None:
            raise ValueError(f"Cycle {cycle_id} not found")
        tenant_id = str(tid_row)
    return await transition_cycle_status(
        session,
        cycle_id=cycle_id,
        target_status="CLOSED",
        actor_user_id=closed_by_user_id,
        tenant_id=tenant_id,
        notes=closing_notes,
    )
