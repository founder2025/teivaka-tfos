"""012 - Add farm_count_limit and worker_count_limit to tenant.tenants

Revision ID: 012_farm_worker_limits
Revises: 011_password_reset
Create Date: 2026-04-14

Captures a schema change that was applied directly to production without a
migration. Two NOT NULL integer columns were added live to tenant.tenants:

  * farm_count_limit    INTEGER NOT NULL DEFAULT 1
  * worker_count_limit  INTEGER NOT NULL DEFAULT 5

Both are referenced by app/middleware/auth.py at session-load time and gate
how many farms / workers a tenant may create.

Upgrade is idempotent (ADD COLUMN IF NOT EXISTS) so it is safe to run on the
live DB where the columns already exist, and on a fresh deploy where they do
not. Downgrade drops the columns; the IF EXISTS guard keeps it safe to
re-run.
"""
from alembic import op


revision = "012_farm_worker_limits"
down_revision = "011_password_reset"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE tenant.tenants "
        "ADD COLUMN IF NOT EXISTS farm_count_limit INTEGER NOT NULL DEFAULT 1"
    )
    op.execute(
        "ALTER TABLE tenant.tenants "
        "ADD COLUMN IF NOT EXISTS worker_count_limit INTEGER NOT NULL DEFAULT 5"
    )


def downgrade():
    op.execute("ALTER TABLE tenant.tenants DROP COLUMN IF EXISTS worker_count_limit")
    op.execute("ALTER TABLE tenant.tenants DROP COLUMN IF EXISTS farm_count_limit")
