"""Phase 4 farm-ops Part 2 — one active cycle per production_unit

Smoke test on 2026-04-22 surfaced that the cycle_service.create_cycle
path would happily create a second ACTIVE cycle on a PU that already
held F001-PU002-EGG-2026-001 in status=ACTIVE. Domain invariant: a PU
may hold at most ONE cycle in a non-terminal status at any time.

Enforcement: partial unique index on (pu_id) WHERE cycle_status IN
('ACTIVE','HARVESTING','CLOSING'). CLOSED and FAILED cycles are
terminal and may freely coexist with a new live cycle on the same PU.
PLANNED is excluded from the guard intentionally — the business can
queue a future cycle in the 'PLANNED' bucket without conflicting
with the currently-running one. Transition PLANNED→ACTIVE will hit
the guard at that point and must be resolved first.

Revises: 025_audit_add_cycle_transition  (registered revision id —
         file on disk is 025_audit_events_add_cycle_transition.py.
         The revision id was shortened to satisfy the VARCHAR(32)
         limit on tenant.alembic_version.version_num.)
Revision: 026_one_active_cycle_per_pu
"""
from __future__ import annotations

from alembic import op


revision = "026_one_active_cycle_per_pu"
down_revision = "025_audit_add_cycle_transition"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS ix_cycles_one_active_per_pu
        ON tenant.production_cycles (pu_id)
        WHERE cycle_status IN ('ACTIVE','HARVESTING','CLOSING')
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS tenant.ix_cycles_one_active_per_pu")
