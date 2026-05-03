"""Phase 6.3-17/18: VISITOR_LOGGED + PEST_CONTROL_APPLIED 2-form pack.

Adds both events to audit.events CHECK enum + event_type_catalog.
PRE-CHECK confirmed both net-new (no idempotency collisions).

Strike #72: each DDL one op.execute() call.
Strike #51: catalog INSERTs ON CONFLICT DO NOTHING (defensive).

Revision ID: 059_visitor_pest_ctrl
Revises: 058_mortality_inv_cull
"""
from alembic import op
import sqlalchemy as sa
import re


revision = '059_visitor_pest_ctrl'
down_revision = '058_mortality_inv_cull'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # 1. Extend audit.events CHECK enum: add both new types in one DROP+ADD cycle
    constraint_row = conn.execute(sa.text("""
        SELECT conname, pg_get_constraintdef(oid) AS defn
        FROM pg_constraint
        WHERE conrelid='audit.events'::regclass AND contype='c'
        AND pg_get_constraintdef(oid) LIKE '%event_type%'
        LIMIT 1;
    """)).first()

    if constraint_row:
        constraint_name = constraint_row.conname
        defn = constraint_row.defn
        match = re.search(r"ARRAY\[(.*)\]", defn)
        if match:
            existing = re.findall(r"'([^']+)'::(?:character varying|text)", match.group(1))
            new_values = list(existing)
            for v in ('VISITOR_LOGGED', 'PEST_CONTROL_APPLIED'):
                if v not in new_values:
                    new_values.append(v)
            if len(new_values) > len(existing):
                array_lit = ", ".join([f"'{v}'::text" for v in new_values])
                op.execute(f"ALTER TABLE audit.events DROP CONSTRAINT {constraint_name};")
                op.execute(
                    f"ALTER TABLE audit.events ADD CONSTRAINT {constraint_name} "
                    f"CHECK (event_type = ANY (ARRAY[{array_lit}]));"
                )

    # 2. Insert VISITOR_LOGGED into catalog
    op.execute("""
        INSERT INTO shared.event_type_catalog
            (event_type, catalog_group, sort_order, is_user_facing, is_compound,
             livestock_only, min_role, min_mode, backdating_window_days, is_active, notes)
        VALUES
            ('VISITOR_LOGGED', 'POULTRY', 370, TRUE, FALSE, TRUE,
             'WORKER', 'SOLO', 14, TRUE,
             'Phase 6.3-17: Logged when a visitor enters the farm. Captures visitor type + purpose + biosecurity disinfection status. Critical for outbreak traceability.')
        ON CONFLICT (event_type) DO NOTHING;
    """)

    # 3. Insert PEST_CONTROL_APPLIED into catalog
    op.execute("""
        INSERT INTO shared.event_type_catalog
            (event_type, catalog_group, sort_order, is_user_facing, is_compound,
             livestock_only, min_role, min_mode, backdating_window_days, is_active, notes)
        VALUES
            ('PEST_CONTROL_APPLIED', 'POULTRY', 380, TRUE, FALSE, TRUE,
             'WORKER', 'SOLO', 14, TRUE,
             'Phase 6.3-18: Logged when pest control is applied. Captures chemical OR non-chemical method, target pest, qty + unit. Chemical FK validates against shared.chemical_library.')
        ON CONFLICT (event_type) DO NOTHING;
    """)


def downgrade():
    op.execute("DELETE FROM shared.event_type_catalog WHERE event_type IN ('VISITOR_LOGGED','PEST_CONTROL_APPLIED');")
    # Don't downgrade CHECK enum
