"""007 - Add idempotency keys for offline sync conflict resolution
Revision ID: 007_idempotency
Revises: 006_seed
Create Date: 2026-04-07
"""
from alembic import op

revision = '007_idempotency'
down_revision = '006_seed'
branch_labels = None
depends_on = None

def upgrade():
    op.execute("ALTER TABLE tenant.harvest_log ADD COLUMN IF NOT EXISTS idempotency_key TEXT")
    op.execute("ALTER TABLE tenant.labor_attendance ADD COLUMN IF NOT EXISTS idempotency_key TEXT")
    op.execute("ALTER TABLE tenant.field_events ADD COLUMN IF NOT EXISTS idempotency_key TEXT")
    op.execute("CREATE INDEX IF NOT EXISTS idx_harvest_idempotency ON tenant.harvest_log(idempotency_key) WHERE idempotency_key IS NOT NULL")
    op.execute("CREATE INDEX IF NOT EXISTS idx_labor_idempotency ON tenant.labor_attendance(idempotency_key) WHERE idempotency_key IS NOT NULL")
    op.execute("CREATE INDEX IF NOT EXISTS idx_field_events_idempotency ON tenant.field_events(idempotency_key) WHERE idempotency_key IS NOT NULL")

def downgrade():
    op.execute("ALTER TABLE tenant.harvest_log DROP COLUMN IF EXISTS idempotency_key")
    op.execute("ALTER TABLE tenant.labor_attendance DROP COLUMN IF EXISTS idempotency_key")
    op.execute("ALTER TABLE tenant.field_events DROP COLUMN IF EXISTS idempotency_key")
