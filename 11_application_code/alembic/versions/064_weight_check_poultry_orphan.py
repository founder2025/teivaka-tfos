"""Strike #92 close-out: add WEIGHT_CHECK to POULTRY catalog (orphan resolution).

Context: WEIGHT_CHECK had form file + App.jsx route + LogSheet EVENT_ROUTES entry
but no row in shared.event_type_catalog for catalog_group='POULTRY'. Reachable via
direct URL only; invisible from the (+) Poultry catalog UI.

Revision ID: 064_weight_check_poultry_orphan
Revises: 063_poultry_label_backfill
"""
from alembic import op
import sqlalchemy as sa

revision = '064_weight_check_poultry_orphan'
down_revision = '063_poultry_label_backfill'
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
            if 'WEIGHT_CHECK' not in existing:
                new_values = list(existing) + ['WEIGHT_CHECK']
                array_lit = ", ".join([f"'{v}'::text" for v in new_values])
                op.execute(f"ALTER TABLE audit.events DROP CONSTRAINT {constraint_name};")
                op.execute(f"ALTER TABLE audit.events ADD CONSTRAINT {constraint_name} CHECK (event_type = ANY (ARRAY[{array_lit}]));")
    op.execute("""
        INSERT INTO shared.event_type_catalog
            (event_type, catalog_group, sort_order, is_user_facing, is_compound,
             livestock_only, min_role, min_mode, backdating_window_days, is_active, notes)
        VALUES
            ('WEIGHT_CHECK', 'POULTRY', 450, TRUE, FALSE, TRUE,
             'WORKER', 'SOLO', 14, TRUE,
             'Strike #92 orphan close-out: form was built but never registered as POULTRY catalog row.')
        ON CONFLICT (event_type) DO NOTHING;
    """)


def downgrade():
    op.execute("DELETE FROM shared.event_type_catalog WHERE event_type='WEIGHT_CHECK' AND catalog_group='POULTRY';")
