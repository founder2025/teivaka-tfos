"""Phase 6.3-23/24: INCIDENT_REPORTED + SUPPLIES_RECEIVED 2-form pack.

Strike #72: each DDL one op.execute() call.
Strike #51: catalog INSERTs ON CONFLICT DO NOTHING.

Revision ID: 062_incident_supplies
Revises: 061_flock_equip_maint
"""
from alembic import op
import sqlalchemy as sa

revision = '062_incident_supplies'
down_revision = '061_flock_equip_maint'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

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
            for v in ('INCIDENT_REPORTED', 'SUPPLIES_RECEIVED'):
                if v not in new_values:
                    new_values.append(v)
            if len(new_values) > len(existing):
                array_lit = ", ".join([f"'{v}'::text" for v in new_values])
                op.execute(f"ALTER TABLE audit.events DROP CONSTRAINT {constraint_name};")
                op.execute(f"ALTER TABLE audit.events ADD CONSTRAINT {constraint_name} CHECK (event_type = ANY (ARRAY[{array_lit}]));")

    op.execute("""
        INSERT INTO shared.event_type_catalog
            (event_type, catalog_group, sort_order, is_user_facing, is_compound,
             livestock_only, min_role, min_mode, backdating_window_days, is_active, notes)
        VALUES
            ('INCIDENT_REPORTED', 'POULTRY', 430, TRUE, FALSE, TRUE,
             'WORKER', 'SOLO', 7, TRUE,
             'Phase 6.3-23: Logged when an incident occurs (predator attack, theft, escape, structural damage, etc.). Severity-classified for risk tracking.')
        ON CONFLICT (event_type) DO NOTHING;
    """)

    op.execute("""
        INSERT INTO shared.event_type_catalog
            (event_type, catalog_group, sort_order, is_user_facing, is_compound,
             livestock_only, min_role, min_mode, backdating_window_days, is_active, notes)
        VALUES
            ('SUPPLIES_RECEIVED', 'POULTRY', 440, TRUE, FALSE, TRUE,
             'WORKER', 'SOLO', 30, TRUE,
             'Phase 6.3-24: Logged when poultry supplies are received (bedding, medical, cleaning, packaging, etc.). Bank Evidence cashflow input via cost_fjd.')
        ON CONFLICT (event_type) DO NOTHING;
    """)


def downgrade():
    op.execute("DELETE FROM shared.event_type_catalog WHERE event_type IN ('INCIDENT_REPORTED','SUPPLIES_RECEIVED');")
