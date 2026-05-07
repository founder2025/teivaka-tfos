"""Strike #114: Add farm_id to tenant.inputs with NOT NULL + FK + btree index.

Revision ID: 074_inputs_farm_id
Revises: 073_signal_config_seed
Create Date: 2026-05-07

Bug E real fix. tenant.inputs was missing farm_id since deploy (Migration 004
stubbed pending this). Strike #113 made the Decision Engine resilient to the
absence via SAVEPOINT isolation; this migration fixes the schema gap so
DS-004 (Input Stock Adequacy %) can compute real values.

Greenfield column on an empty table — no backfill required (verified via
recon: tenant.inputs row count is 0 across all 3 active tenants). NOT NULL
applied immediately. CASCADE on delete matches existing tenant_id FK pattern.

Strike #113 SAVEPOINT wrap on DS-004 is intentionally preserved as defensive
scaffolding. Not removed in this strike.

Out of scope (separate strikes):
- order_line_items.farm_id (not queried by Decision Engine)
- Migration 004 matview real implementation (mv_input_balance stub remains)
- automation_worker.py sweep for farm_id usage (defer until failure surfaces)
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '074_inputs_farm_id'
down_revision = '073_signal_config_seed'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add farm_id column with NOT NULL + FK to tenant.farms + btree index."""
    op.execute("""
        ALTER TABLE tenant.inputs
        ADD COLUMN farm_id text NOT NULL
        REFERENCES tenant.farms(farm_id) ON DELETE CASCADE
    """)
    op.execute("""
        CREATE INDEX idx_inputs_farm_id ON tenant.inputs(farm_id)
    """)


def downgrade() -> None:
    """Remove the farm_id column + its index. Reversible because table is empty."""
    op.execute("DROP INDEX IF EXISTS tenant.idx_inputs_farm_id")
    op.execute("ALTER TABLE tenant.inputs DROP COLUMN farm_id")
