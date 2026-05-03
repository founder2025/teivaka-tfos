"""Phase 6.3-19/20: TEMPERATURE_RECORDED + EGGS_GRADED 2-form pack.

TEMPERATURE_RECORDED: net-new event type. Adds to CHECK enum + catalog.
EGGS_GRADED: already in catalog from Phase 6.1 taxonomy seed (migration 043).
  Catalog INSERT is ON CONFLICT no-op. CHECK enum entry verified.

Strike #72: each DDL one op.execute() call.
Strike #51: catalog INSERTs ON CONFLICT DO NOTHING (defensive).

Revision ID: 060_temp_eggs_graded
Revises: 059_visitor_pest_ctrl
"""
from alembic import op
import sqlalchemy as sa

revision = '060_temp_eggs_graded'
down_revision = '059_visitor_pest_ctrl'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # Extend audit.events CHECK enum (idempotent — Strike #51 pattern)
    constraint_row = conn.execute(sa.text("""
        SELECT conname, pg_get_constraintdef(oid) AS defn
        FROM pg_constraint
        WHERE conrelid='audit.events'::regclass AND contype='c'
        AND pg_get_constraintdef(oid) LIKE '%event_type%' LIMIT 1;
    """)).first()

    if constraint_row:
        import re
        constraint_name = constraint_row.conname
        defn = constraint_row.defn
        match = re.search(r"ARRAY\[(.*)\]", defn)
        if match:
            existing = re.findall(r"'([^']+)'::text", match.group(1))
            new_values = list(existing)
            for v in ('TEMPERATURE_RECORDED', 'EGGS_GRADED'):
                if v not in new_values:
                    new_values.append(v)
            if len(new_values) > len(existing):
                array_lit = ", ".join([f"'{v}'::text" for v in new_values])
                op.execute(f"ALTER TABLE audit.events DROP CONSTRAINT {constraint_name};")
                op.execute(f"ALTER TABLE audit.events ADD CONSTRAINT {constraint_name} CHECK (event_type = ANY (ARRAY[{array_lit}]));")

    # TEMPERATURE_RECORDED: net-new catalog entry
    op.execute("""
        INSERT INTO shared.event_type_catalog
            (event_type, catalog_group, sort_order, is_user_facing, is_compound,
             livestock_only, min_role, min_mode, backdating_window_days, is_active, notes)
        VALUES
            ('TEMPERATURE_RECORDED', 'POULTRY', 390, TRUE, FALSE, TRUE,
             'WORKER', 'SOLO', 7, TRUE,
             'Phase 6.3-19: Logged when coop temperature + humidity recorded. Environmental tracking for heat stress prevention.')
        ON CONFLICT (event_type) DO NOTHING;
    """)

    # EGGS_GRADED: already seeded from 6.1; ON CONFLICT defensive no-op
    op.execute("""
        INSERT INTO shared.event_type_catalog
            (event_type, catalog_group, sort_order, is_user_facing, is_compound,
             livestock_only, min_role, min_mode, backdating_window_days, is_active, notes)
        VALUES
            ('EGGS_GRADED', 'POULTRY', 400, TRUE, FALSE, TRUE,
             'WORKER', 'SOLO', 14, TRUE,
             'Phase 6.3-20: Logged when collected eggs are graded (Grade A/B/cracked/dirty). Sales prep + Bank Evidence pricing input.')
        ON CONFLICT (event_type) DO NOTHING;
    """)


def downgrade():
    # Only delete TEMPERATURE_RECORDED (we added it); EGGS_GRADED stays (Phase 6.1 owns it)
    op.execute("DELETE FROM shared.event_type_catalog WHERE event_type = 'TEMPERATURE_RECORDED';")
    # CHECK enum NOT downgraded (orphan rows worse than retaining permissive enum)
