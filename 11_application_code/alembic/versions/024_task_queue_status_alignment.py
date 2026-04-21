"""Phase 4.2 Step 5-6 — Align tenant.task_queue status CHECK to v4 engine

Migration 022 added task_queue_status_valid
    (OPEN | COMPLETED | SKIPPED | EXPIRED | CANCELLED)
but left the pre-existing task_queue_status_check
    (OPEN | IN_PROGRESS | COMPLETED | CANCELLED | ESCALATED)
in place. Their intersection is OPEN | COMPLETED | CANCELLED only, which
blocks any write of status='SKIPPED' or 'EXPIRED'.

This is a Phase 4.2 production regression: POST /tasks/{id}/skip and the
automation-engine auto-expiry path both crash against the legacy CHECK.
Caught during Step 5-6 integration-test verification 2026-04-21.

Fix: drop the legacy task_queue_status_check. task_queue_status_valid
remains and is the single source of truth for status values.

Downgrade is reversible: any rows at status='SKIPPED' or 'EXPIRED' at
downgrade time are coerced to 'CANCELLED' (closest legacy equivalent)
before the legacy CHECK is re-added. No data loss.

Revises: 023_audit_events_v4
Revision: 024_task_queue_status_alignment
"""
from __future__ import annotations

from alembic import op


# Alembic identifiers
revision = "024_task_queue_status_alignment"
down_revision = "023_audit_events_v4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the legacy check that blocks SKIPPED/EXPIRED.
    # task_queue_status_valid (from migration 022) remains and enforces the v4 set.
    op.execute(
        "ALTER TABLE tenant.task_queue "
        "DROP CONSTRAINT IF EXISTS task_queue_status_check"
    )


def downgrade() -> None:
    # Coerce v4-only statuses back to the closest legacy value before re-adding
    # the tighter constraint. CANCELLED is the closest terminal state to both
    # SKIPPED (user-declined) and EXPIRED (system-timeout).
    op.execute(
        "UPDATE tenant.task_queue "
        "SET status = 'CANCELLED' "
        "WHERE status IN ('SKIPPED', 'EXPIRED')"
    )
    op.execute(
        "ALTER TABLE tenant.task_queue "
        "ADD CONSTRAINT task_queue_status_check "
        "CHECK (status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ESCALATED'))"
    )
