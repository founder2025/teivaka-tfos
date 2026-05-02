"""Vaccination withholding tracking + WITHHOLDING_VIOLATION_ATTEMPTED system event.

Phase 6.6-1: POULTRY Compliance Gate 6 opens.

Three coordinated changes:
1. Extend POULTRY_VACCINE library entries' attributes JSONB with
   withholding_eggs_days + withholding_meat_days (default 0). Library admins
   set per-vaccine values via Library Management UI.
2. Insert WITHHOLDING_VIOLATION_ATTEMPTED into shared.event_type_catalog as a
   system-emitted (non-user-facing) event capturing blocked sale attempts for
   regulator audit trail.
3. Extend audit.events.event_type CHECK constraint enum to include the new
   system event (Strike #51).

Strikes 1-53 binding. Lessons applied:
- #50: catalog scanned for existing equivalents (none — distinct event class)
- #51: catalog INSERT + CHECK constraint extension done together
- #52: min_role='WORKER' / min_mode='SOLO' (catalog enum compliance)
- #53: revision id '052_vaccine_withholding' (24 chars, ≤32)

Live constraint format (verified pre-migration via 051):
  CHECK (((event_type)::text = ANY ((ARRAY['VAL'::character varying, ...])::text[])))

Revision ID: 052_vaccine_withholding
Revises: 051_health_feed_events
"""
import re

from alembic import op
import sqlalchemy as sa


revision = '052_vaccine_withholding'
down_revision = '051_health_feed_events'
branch_labels = None
depends_on = None


NEW_EVENT_TYPE = 'WITHHOLDING_VIOLATION_ATTEMPTED'


def upgrade():
    conn = op.get_bind()

    # 1. Extend POULTRY_VACCINE attributes JSONB (library globals + tenant-specific)
    conn.execute(sa.text("""
        UPDATE shared.farm_libraries
        SET attributes = COALESCE(attributes, '{}'::jsonb)
                       || jsonb_build_object(
                              'withholding_eggs_days', COALESCE((attributes->>'withholding_eggs_days')::int, 0),
                              'withholding_meat_days', COALESCE((attributes->>'withholding_meat_days')::int, 0)
                          )
        WHERE library_type = 'POULTRY_VACCINE';
    """))

    # 2. Insert WITHHOLDING_VIOLATION_ATTEMPTED catalog row (idempotent)
    conn.execute(sa.text("""
        INSERT INTO shared.event_type_catalog
            (event_type, catalog_group, sort_order, is_user_facing, is_compound,
             livestock_only, min_role, min_mode, backdating_window_days, is_active, notes)
        VALUES
            ('WITHHOLDING_VIOLATION_ATTEMPTED', 'POULTRY', 200, FALSE, FALSE, FALSE,
             'WORKER', 'SOLO', 0, TRUE,
             'Phase 6.6-1: System-emitted on blocked EGGS_SOLD or BIRDS_SOLD due to active vaccine withholding.')
        ON CONFLICT (event_type) DO NOTHING;
    """))

    # 3. Extend audit.events.event_type CHECK constraint enum
    constraint_row = conn.execute(sa.text("""
        SELECT conname, pg_get_constraintdef(oid) AS defn
        FROM pg_constraint
        WHERE conrelid = 'audit.events'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%event_type%'
        LIMIT 1;
    """)).first()

    if constraint_row is None:
        return

    if NEW_EVENT_TYPE in constraint_row.defn:
        return

    constraint_name = constraint_row.conname
    match = re.search(r"ARRAY\[(.*?)\]", constraint_row.defn, re.DOTALL)
    if not match:
        raise RuntimeError(f"Cannot parse current event_type CHECK: {constraint_row.defn}")

    array_body = match.group(1)
    existing_values = re.findall(r"'([^']+)'::character varying", array_body)
    if not existing_values:
        raise RuntimeError(
            f"Parsed zero existing values from CHECK; refusing to recreate empty enum. "
            f"Body: {array_body[:200]}"
        )

    new_values = list(existing_values)
    if NEW_EVENT_TYPE not in new_values:
        new_values.append(NEW_EVENT_TYPE)

    conn.execute(sa.text(f"ALTER TABLE audit.events DROP CONSTRAINT {constraint_name};"))

    array_literal = ", ".join([f"'{v}'::character varying" for v in new_values])
    conn.execute(sa.text(
        f"ALTER TABLE audit.events ADD CONSTRAINT {constraint_name} "
        f"CHECK (((event_type)::text = ANY ((ARRAY[{array_literal}])::text[])));"
    ))


def downgrade():
    conn = op.get_bind()

    # Remove the two attribute keys; preserve other JSONB content
    conn.execute(sa.text("""
        UPDATE shared.farm_libraries
        SET attributes = attributes - 'withholding_eggs_days' - 'withholding_meat_days'
        WHERE library_type = 'POULTRY_VACCINE';
    """))

    # Remove catalog row
    conn.execute(sa.text("""
        DELETE FROM shared.event_type_catalog
        WHERE event_type = 'WITHHOLDING_VIOLATION_ATTEMPTED';
    """))

    # CHECK constraint left permissive on downgrade — removing the value would
    # orphan any audit.events rows already written under this type.
