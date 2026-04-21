"""Phase 4.2 farm-ops Step 1 — add CYCLE_TRANSITION to audit.events CHECK

The generic PATCH /api/v1/cycles/{id} endpoint emits one canonical audit
row per state transition with event_type='CYCLE_TRANSITION'. The existing
audit_events_event_type_valid CHECK (from migration 023) lists
CYCLE_CREATED and CYCLE_CLOSED but not the unified CYCLE_TRANSITION
value. Extending the CHECK is the single-line fix.

Upgrade: DROP the check, re-add with CYCLE_TRANSITION appended.
Downgrade is destructive to any in-flight audit rows with
event_type='CYCLE_TRANSITION' — we coerce them to 'CYCLE_CLOSED' (the
closest pre-existing cycle event) before re-adding the tighter check.
audit.events has REVOKE UPDATE + DELETE + an immutability trigger in
migration 023, so downgrade bypasses those via SET session_replication_role
= 'replica' inside a transaction. Only run downgrade if you know why.

Revises: 024_task_queue_status_alignment
Revision: 025_audit_add_cycle_transition
"""
from __future__ import annotations

from alembic import op


revision = "025_audit_add_cycle_transition"
down_revision = "024_task_queue_status_alignment"
branch_labels = None
depends_on = None


_NEW_VALUES = (
    "'TASK_COMPLETED', 'TASK_SKIPPED', 'TASK_CANCELLED', 'TASK_EXPIRED', "
    "'HARVEST_LOGGED', 'CHEMICAL_APPLIED', "
    "'CYCLE_CREATED', 'CYCLE_CLOSED', 'CYCLE_TRANSITION', "
    "'ROTATION_OVERRIDE', 'COMPLIANCE_OVERRIDE', "
    "'PAYMENT_RECEIVED', 'PAYMENT_SENT', 'LABOR_LOGGED', "
    "'INVENTORY_ADJUSTED', 'ALERT_RESOLVED', 'USER_INVITED', "
    "'FARM_CREATED', 'FARM_CLOSED', 'SUBSCRIPTION_CHANGED', "
    "'REFERRAL_ACTIVATED', 'BANK_PDF_GENERATED', 'CREDIT_SCORE_UPDATED'"
)

_OLD_VALUES = (
    "'TASK_COMPLETED', 'TASK_SKIPPED', 'TASK_CANCELLED', 'TASK_EXPIRED', "
    "'HARVEST_LOGGED', 'CHEMICAL_APPLIED', "
    "'CYCLE_CREATED', 'CYCLE_CLOSED', "
    "'ROTATION_OVERRIDE', 'COMPLIANCE_OVERRIDE', "
    "'PAYMENT_RECEIVED', 'PAYMENT_SENT', 'LABOR_LOGGED', "
    "'INVENTORY_ADJUSTED', 'ALERT_RESOLVED', 'USER_INVITED', "
    "'FARM_CREATED', 'FARM_CLOSED', 'SUBSCRIPTION_CHANGED', "
    "'REFERRAL_ACTIVATED', 'BANK_PDF_GENERATED', 'CREDIT_SCORE_UPDATED'"
)


def upgrade() -> None:
    op.execute(
        "ALTER TABLE audit.events "
        "DROP CONSTRAINT IF EXISTS audit_events_event_type_valid"
    )
    op.execute(
        "ALTER TABLE audit.events "
        "ADD CONSTRAINT audit_events_event_type_valid "
        f"CHECK (event_type IN ({_NEW_VALUES}))"
    )


def downgrade() -> None:
    # Coerce any CYCLE_TRANSITION rows to CYCLE_CLOSED so the tighter
    # constraint re-applies cleanly. Requires replica-role bypass because
    # audit.events has REVOKE UPDATE + immutability trigger.
    op.execute("SET session_replication_role = 'replica'")
    op.execute(
        "UPDATE audit.events SET event_type = 'CYCLE_CLOSED' "
        "WHERE event_type = 'CYCLE_TRANSITION'"
    )
    op.execute("SET session_replication_role = 'origin'")
    op.execute(
        "ALTER TABLE audit.events "
        "DROP CONSTRAINT IF EXISTS audit_events_event_type_valid"
    )
    op.execute(
        "ALTER TABLE audit.events "
        "ADD CONSTRAINT audit_events_event_type_valid "
        f"CHECK (event_type IN ({_OLD_VALUES}))"
    )
