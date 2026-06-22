"""157 - drop the dead tenant.tenants.mode column (mode purge, final).

Revision ID: 157_drop_tenant_mode
Revises: 156_cycle_layer_not_null
Create Date: 2026-06-22

Final slice of the Solo/Growth/Commercial mode purge. After purge sub-steps A–C,
NO code reads or writes tenant.tenants.mode:
  - event_catalog.py no longer fetches/filters by mode (A)
  - onboarding no longer SELECTs/writes mode; tasks mode-chain deleted (B)
  - frontend LauncherContext no longer fetches it (C)

This drops the now-unread column + its CHECK constraint. Differentiation is now
subscription tier + role, enforced server-side. Destructive (the SOLO/GROWTH/
COMMERCIAL labels are discarded — that's the intent; they're abandoned). Take a
backup before applying (the apply runbook does). Reversible structurally (downgrade
re-adds a nullable column; prior label values are not restored — they're meaningless).

Apply as owner (Strike #123). asyncpg: one statement per op.execute. rev id 20 chars.
"""
from alembic import op

revision = "157_drop_tenant_mode"
down_revision = "156_cycle_layer_not_null"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE tenant.tenants DROP COLUMN IF EXISTS mode")


def downgrade():
    # Structural restore only — prior SOLO/GROWTH/COMMERCIAL values are not recoverable.
    op.execute("ALTER TABLE tenant.tenants ADD COLUMN IF NOT EXISTS mode TEXT")
