"""158 — add GRADE / DELIVERY_DISPATCH / DELIVERY_CONFIRM to field_events CHECK.

Revision ID: 158_field_events_grade_deliv
Revises: 157_drop_tenant_mode
Create Date: 2026-06-22

Backend gap (post-harvest/sales pack). Unlocks GRADING, DELIVERY_DISPATCHED,
DELIVERY_CONFIRMED on the polymorphic /events path. The audit.events CHECK already
lists these catalog event_types (verified) — NO audit migration. This only adds the
three new FIELD verbs to tenant.field_events_event_type_check so the field_events
backing row passes its CHECK.

Bulletproof (135-style): the new constraint = intended verb set ∪ every event_type
already in the table, so ADD can never fail on existing data. CHECK extension on a
hypertable is metadata-only (no chunk rewrite, per migration 067). asyncpg-safe:
single DO block = one statement (Strike #72). Apply as owner (Strike #123).
rev id 27 chars (<= 32, B41).
"""
from alembic import op

revision = "158_field_events_grade_deliv"
down_revision = "157_drop_tenant_mode"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        DO $$
        DECLARE vals text;
        BEGIN
          ALTER TABLE tenant.field_events DROP CONSTRAINT IF EXISTS field_events_event_type_check;
          SELECT string_agg(DISTINCT quote_literal(v), ', ') INTO vals FROM (
            SELECT unnest(ARRAY[
              'PLANTING','TRANSPLANT','FERTILIZE','IRRIGATE','SPRAY','PRUNE',
              'PEST_OBSERVE','DISEASE_OBSERVE','HARVEST_PARTIAL','HARVEST_FINAL',
              'INSPECTION','SOIL_TEST','PHOTO','OTHER','WEED_MANAGEMENT','LAND_PREP',
              'MULCH','THIN','COVER_CROP','SEED_SAVE','BIO_CONTROL','CROP_HEALTH',
              'STORAGE','LOSS','CYCLE_ABANDON','CROP_SALE','CROP_GIVEN',
              'GRADE','DELIVERY_DISPATCH','DELIVERY_CONFIRM'
            ]) AS v
            UNION
            SELECT event_type FROM tenant.field_events WHERE event_type IS NOT NULL
          ) s;
          EXECUTE 'ALTER TABLE tenant.field_events ADD CONSTRAINT field_events_event_type_check CHECK (event_type IN ('||vals||'))';
        END $$;
        """
    )


def downgrade():
    # No-op: re-adding a superset CHECK is not meaningfully reversible (135 precedent).
    pass
