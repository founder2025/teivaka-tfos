"""020 - Soft-delete column on tenant.field_events

Revision ID: 020_field_events_soft_delete
Revises: 019_harvest_compliance_overrides
Create Date: 2026-04-20

Phase 4.1 Step 2. The new DELETE /api/v1/field-events/{event_id} endpoint
performs a soft delete (never hard — field events feed chemical compliance
computation and must survive for audit). Adds a nullable `deleted_at`
column and a partial index so live lookups skip tombstoned rows cheaply.

tenant.field_events is a TimescaleDB hypertable, but ADD COLUMN with a
nullable type requires no rewrite and propagates to child chunks.

Reversibility
-------------
Downgrade drops the index and column. Any deleted_at values are lost.
"""
from alembic import op

revision = "020_field_events_soft_delete"
down_revision = "019_harvest_compliance_overrides"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        "ALTER TABLE tenant.field_events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ",
        "ALTER TABLE tenant.field_events ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES tenant.users(user_id)",
        "ALTER TABLE tenant.field_events ADD COLUMN IF NOT EXISTS deleted_reason TEXT",
        "CREATE INDEX IF NOT EXISTS idx_field_events_live ON tenant.field_events(tenant_id, event_date DESC) WHERE deleted_at IS NULL",
    ])


def downgrade():
    _exec_each([
        "DROP INDEX IF EXISTS tenant.idx_field_events_live",
        "ALTER TABLE tenant.field_events DROP COLUMN IF EXISTS deleted_reason",
        "ALTER TABLE tenant.field_events DROP COLUMN IF EXISTS deleted_by",
        "ALTER TABLE tenant.field_events DROP COLUMN IF EXISTS deleted_at",
    ])
