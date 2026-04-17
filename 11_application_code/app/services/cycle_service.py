from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from decimal import Decimal
from typing import Optional
from datetime import date
import uuid
import logging

from app.services.rotation_service import validate_rotation, CAN_START, log_rotation_override

logger = logging.getLogger(__name__)


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

    # 5. Insert cycle
    await session.execute(
        text("""
            INSERT INTO tenant.production_cycles
                (cycle_id, tenant_id, pu_id, zone_id, farm_id, production_id,
                 cycle_status, planting_date, planned_area_sqm, planned_yield_kg,
                 cycle_notes, created_by, total_labor_cost_fjd, total_input_cost_fjd,
                 total_other_cost_fjd, total_revenue_fjd)
            SELECT
                :cycle_id, :tenant_id, :pu_id, pu.zone_id, :farm_id, :production_id,
                'ACTIVE', :planting_date, :planned_area_sqm, :planned_yield_kg,
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
        }
    )

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

    return {
        "cycle_id": cycle_id,
        "pu_id": pu_id,
        "farm_id": farm_id,
        "production_id": production_id,
        "cycle_status": "ACTIVE",
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


async def close_cycle(
    session: AsyncSession,
    cycle_id: str,
    closed_by_user_id: str,
    closing_notes: Optional[str] = None,
) -> dict:
    """
    Closes a cycle: sets status to CLOSING -> triggers final CoKG compute.
    Also clears current_cycle_id on the PU.
    """
    # Get cycle info
    result = await session.execute(
        text("SELECT pu_id, cycle_status, actual_yield_kg FROM tenant.production_cycles WHERE cycle_id = :cycle_id"),
        {"cycle_id": cycle_id}
    )
    cycle = result.mappings().first()
    if not cycle:
        raise ValueError(f"Cycle {cycle_id} not found")
    if cycle["cycle_status"] in ("CLOSED", "FAILED"):
        raise ValueError(f"Cycle {cycle_id} is already {cycle['cycle_status']}")

    # Compute final CoKG via DB function
    await session.execute(
        text("SELECT tenant.compute_cogk(:cycle_id)"),
        {"cycle_id": cycle_id}
    )

    # Set status to CLOSED
    await session.execute(
        text("""
            UPDATE tenant.production_cycles
            SET cycle_status = 'CLOSED',
                closed_by = :closed_by,
                closed_at = NOW(),
                cycle_notes = COALESCE(:notes, cycle_notes),
                updated_at = NOW()
            WHERE cycle_id = :cycle_id
        """),
        {"cycle_id": cycle_id, "closed_by": closed_by_user_id, "notes": closing_notes}
    )

    # Clear PU current cycle
    await session.execute(
        text("""
            UPDATE tenant.production_units
            SET current_cycle_id = NULL,
                updated_at = NOW()
            WHERE pu_id = :pu_id AND current_cycle_id = :cycle_id
        """),
        {"pu_id": cycle["pu_id"], "cycle_id": cycle_id}
    )

    return {"cycle_id": cycle_id, "status": "CLOSED", "closed_at": "now"}
