"""rotation_service.py — wrapper around tenant.validate_rotation() DB function.

Master spec: rotation logic lives in the DB function (single source of truth).
Python only translates input/output and adds messaging.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import date
from typing import Optional
import logging

logger = logging.getLogger(__name__)


ROTATION_STATUS_MESSAGES = {
    "PREF":    "Excellent choice. This crop is preferred for rotation here.",
    "OK":      "Good to proceed. This rotation is acceptable.",
    "COND":    "Conditional. Specific requirements must be met before planting.",
    "OVERLAY": "Companion planting allowed. This can grow alongside the current crop.",
    "AVOID":   "Not recommended. Agronomic risk exists — override requires manager approval.",
    "BLOCK":   "Cannot plant. Minimum rest period not met. See days_short.",
    "N/A":     "No previous cycle on record — rotation rules do not apply.",
}

CAN_START        = {"PREF", "OK", "COND", "OVERLAY", "N/A"}
BLOCKED_STATUSES = {"BLOCK"}
AVOID_STATUSES   = {"AVOID"}


async def validate_rotation(
    session: AsyncSession,
    pu_id: str,
    production_id: str,
    planting_date: date,
    tenant_id: Optional[str] = None,  # accepted for back-compat; not used
) -> dict:
    """Calls tenant.validate_rotation(p_pu_id, p_production_id, p_planting_date).

    DB function returns JSONB with: allowed, enforcement_decision, rule_status,
    min_rest_days, days_short, days_since_last_harvest, rotation_key,
    current_production_id, previous_production_id, alternatives[].
    """
    result = await session.execute(
        text("SELECT tenant.validate_rotation(:pu_id, :production_id, :planting_date) AS r"),
        {"pu_id": pu_id, "production_id": production_id, "planting_date": planting_date},
    )
    payload = result.scalar()  # JSONB → dict
    if not payload:
        raise ValueError(
            f"validate_rotation returned NULL for pu_id={pu_id} production_id={production_id}"
        )

    rule_status = payload.get("rule_status", "N/A")
    return {
        "pu_id": pu_id,
        "production_id": production_id,
        # rotation_status alias kept for any older callers
        "rotation_status": rule_status,
        "rule_status": rule_status,
        "can_plant": rule_status in CAN_START,
        "requires_override": rule_status in AVOID_STATUSES,
        "blocked": rule_status in BLOCKED_STATUSES,
        "enforcement_decision": payload.get("enforcement_decision"),
        "min_rest_days": payload.get("min_rest_days"),
        "days_short": payload.get("days_short"),
        "days_since_last_harvest": payload.get("days_since_last_harvest"),
        "previous_production_id": payload.get("previous_production_id"),
        "rotation_key": payload.get("rotation_key"),
        "message": ROTATION_STATUS_MESSAGES.get(rule_status, rule_status),
        "alternatives": payload.get("alternatives") or [],
    }


async def get_rotation_alternatives(
    session: AsyncSession,
    pu_id: str,
    tenant_id: Optional[str] = None,
    limit: int = 5,
) -> list[dict]:
    """Top recommended next crops for this PU based on its current production_id.

    Pulls from shared.rotation_top_choices (real cols: production_id,
    choice_rank, recommended_next_id, reason) joined to productions.
    """
    rows = (await session.execute(
        text("""
            SELECT
                rtc.recommended_next_id  AS production_id,
                p.production_name,
                p.category,
                rtc.reason,
                rtc.choice_rank
            FROM shared.rotation_top_choices rtc
            JOIN shared.productions p ON p.production_id = rtc.recommended_next_id
            WHERE rtc.production_id = (
                SELECT current_production_id FROM tenant.production_units
                WHERE pu_id = :pu_id
            )
              AND COALESCE(p.is_active_in_system, true) = true
            ORDER BY rtc.choice_rank
            LIMIT :limit
        """),
        {"pu_id": pu_id, "limit": limit},
    )).mappings().all()
    return [dict(r) for r in rows]


async def log_rotation_override(
    session: AsyncSession,
    pu_id: str,
    production_id: str,
    rotation_status: str,
    override_reason: str,
    approved_by_user_id: str,
    cycle_id: Optional[str],
    tenant_id: str,
) -> str:
    """Insert-only audit row in tenant.rotation_override_log."""
    import uuid
    override_id = f"OVR-{pu_id}-{uuid.uuid4().hex[:8].upper()}"
    await session.execute(
        text("""
            INSERT INTO tenant.rotation_override_log
                (override_id, tenant_id, pu_id, requested_production_id,
                 rotation_status, override_reason, agronomic_risk_acknowledged,
                 approved_by, cycle_id)
            VALUES
                (:override_id, :tenant_id, :pu_id, :production_id,
                 :rotation_status, :override_reason, true,
                 :approved_by, :cycle_id)
        """),
        {
            "override_id": override_id,
            "tenant_id": tenant_id,
            "pu_id": pu_id,
            "production_id": production_id,
            "rotation_status": rotation_status,
            "override_reason": override_reason,
            "approved_by": approved_by_user_id,
            "cycle_id": cycle_id,
        },
    )
    return override_id
