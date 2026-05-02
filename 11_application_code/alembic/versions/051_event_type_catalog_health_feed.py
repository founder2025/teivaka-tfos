"""Add HEALTH_OBSERVATION and FEED_USED to event_type_catalog AND audit.events CHECK enum.

Phase 6.3-9/10: ships two new POULTRY events (Operator-locked naming). Legacy
SICK_BIRD_NOTED + FEED_GIVEN remain in catalog as deprecated-but-not-removed
(precedent: EVENT_CORRECTED, PAYMENT_RECEIVED system-derived rows).

Strike #51: must update BOTH catalog AND CHECK constraint enum.

Live constraint format (verified pre-migration):
  CHECK (((event_type)::text = ANY ((ARRAY['ADVISORY_READ'::character varying, ...])::text[])))

Revision ID: 051_health_feed_events
Revises: 050_audit_public_stats
"""
import re

from alembic import op
import sqlalchemy as sa


revision = '051_health_feed_events'
down_revision = '050_audit_public_stats'
branch_labels = None
depends_on = None


NEW_EVENT_TYPES = ('HEALTH_OBSERVATION', 'FEED_USED')


def upgrade():
    conn = op.get_bind()

    # 1. Insert catalog rows (idempotent via ON CONFLICT)
    conn.execute(sa.text("""
        INSERT INTO shared.event_type_catalog
            (event_type, catalog_group, sort_order, is_user_facing, is_compound,
             livestock_only, min_role, min_mode, backdating_window_days, is_active, notes)
        VALUES
            ('HEALTH_OBSERVATION', 'POULTRY', 100, TRUE, FALSE, FALSE,
             'WORKER', 'SOLO', 7, TRUE,
             'Phase 6.3-9: severity + symptoms[] + qty_affected. flock_id required.'),
            ('FEED_USED', 'POULTRY', 101, TRUE, FALSE, FALSE,
             'WORKER', 'SOLO', 7, TRUE,
             'Phase 6.3-10: feed_type_id + qty_kg + used_date. flock_id required.')
        ON CONFLICT (event_type) DO NOTHING;
    """))

    # 2. Extend audit.events.event_type CHECK constraint enum.
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

    constraint_name = constraint_row.conname
    current_defn = constraint_row.defn

    if all(v in current_defn for v in NEW_EVENT_TYPES):
        return

    match = re.search(r"ARRAY\[(.*?)\]", current_defn, re.DOTALL)
    if not match:
        raise RuntimeError(f"Cannot parse current event_type CHECK: {current_defn}")

    array_body = match.group(1)
    existing_values = re.findall(r"'([^']+)'::character varying", array_body)
    if not existing_values:
        raise RuntimeError(
            f"Parsed zero existing values from CHECK constraint; refusing to recreate empty enum. "
            f"Body: {array_body[:200]}"
        )

    new_values = list(existing_values)
    for v in NEW_EVENT_TYPES:
        if v not in new_values:
            new_values.append(v)

    conn.execute(sa.text(f"ALTER TABLE audit.events DROP CONSTRAINT {constraint_name};"))

    array_literal = ", ".join([f"'{v}'::character varying" for v in new_values])
    conn.execute(sa.text(
        f"ALTER TABLE audit.events ADD CONSTRAINT {constraint_name} "
        f"CHECK (((event_type)::text = ANY ((ARRAY[{array_literal}])::text[])));"
    ))


def downgrade():
    conn = op.get_bind()

    conn.execute(sa.text("""
        DELETE FROM shared.event_type_catalog
        WHERE event_type IN ('HEALTH_OBSERVATION', 'FEED_USED');
    """))
    # CHECK constraint left permissive on downgrade — removing values would orphan
    # any audit.events rows already written under these types.
