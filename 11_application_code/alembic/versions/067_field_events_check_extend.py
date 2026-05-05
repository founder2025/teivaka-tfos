"""Strike #96 — extend tenant.field_events for CROPS B2 polymorphic wrapper

Path A: ADD payload_jsonb column + extend event_type CHECK enum with
WEED_MANAGEMENT and LAND_PREP. Hypertable-safe (column add is metadata-only;
CHECK extension does not trigger TimescaleDB chunk rewrite).

asyncpg requires one DDL statement per op.execute() call (Strike #72).

Revision ID: 067_field_events_check_extend
Revises: 066_b63_cluster_a
Create Date: 2026-05-05
"""
from alembic import op

revision = '067_field_events_check_extend'
down_revision = '066_b63_cluster_a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add payload_jsonb column (Path A).
    op.execute("""
        ALTER TABLE tenant.field_events
        ADD COLUMN IF NOT EXISTS payload_jsonb jsonb;
    """)
    # 2. Drop old CHECK constraint.
    op.execute("""
        ALTER TABLE tenant.field_events
        DROP CONSTRAINT IF EXISTS field_events_event_type_check;
    """)
    # 3. Add extended CHECK with WEED_MANAGEMENT + LAND_PREP.
    op.execute("""
        ALTER TABLE tenant.field_events
        ADD CONSTRAINT field_events_event_type_check
        CHECK (event_type IN (
            'PLANTING', 'TRANSPLANT', 'FERTILIZE', 'IRRIGATE',
            'SPRAY', 'PRUNE', 'PEST_OBSERVE', 'DISEASE_OBSERVE',
            'HARVEST_PARTIAL', 'HARVEST_FINAL', 'INSPECTION',
            'SOIL_TEST', 'PHOTO', 'OTHER',
            'WEED_MANAGEMENT', 'LAND_PREP'
        ));
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE tenant.field_events
        DROP CONSTRAINT IF EXISTS field_events_event_type_check;
    """)
    op.execute("""
        ALTER TABLE tenant.field_events
        ADD CONSTRAINT field_events_event_type_check
        CHECK (event_type IN (
            'PLANTING', 'TRANSPLANT', 'FERTILIZE', 'IRRIGATE',
            'SPRAY', 'PRUNE', 'PEST_OBSERVE', 'DISEASE_OBSERVE',
            'HARVEST_PARTIAL', 'HARVEST_FINAL', 'INSPECTION',
            'SOIL_TEST', 'PHOTO', 'OTHER'
        ));
    """)
    op.execute("""
        ALTER TABLE tenant.field_events
        DROP COLUMN IF EXISTS payload_jsonb;
    """)
