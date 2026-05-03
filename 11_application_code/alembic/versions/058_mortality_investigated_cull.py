"""Phase 6.3-15/16: MORTALITY_INVESTIGATED + CULL_LOGGED 2-form pack.

Adds both events to audit.events CHECK enum + event_type_catalog.
PRE-CHECK confirmed both net-new (no idempotency collisions).

Strike #72: each DDL one op.execute() call.
Strike #51: catalog INSERTs ON CONFLICT DO NOTHING (defensive).

Revision ID: 058_mortality_inv_cull
Revises: 057_feed_purchased_water
"""
from alembic import op
import sqlalchemy as sa
import re


revision = '058_mortality_inv_cull'
down_revision = '057_feed_purchased_water'
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
            for v in ('MORTALITY_INVESTIGATED', 'CULL_LOGGED'):
                if v not in new_values:
                    new_values.append(v)
            if len(new_values) > len(existing):
                array_lit = ", ".join([f"'{v}'::text" for v in new_values])
                op.execute(f"ALTER TABLE audit.events DROP CONSTRAINT {constraint_name};")
                op.execute(
                    f"ALTER TABLE audit.events ADD CONSTRAINT {constraint_name} "
                    f"CHECK (event_type = ANY (ARRAY[{array_lit}]));"
                )

    # 2. Insert MORTALITY_INVESTIGATED into catalog
    op.execute("""
        INSERT INTO shared.event_type_catalog
            (event_type, catalog_group, sort_order, is_user_facing, is_compound,
             livestock_only, min_role, min_mode, backdating_window_days, is_active, notes)
        VALUES
            ('MORTALITY_INVESTIGATED', 'POULTRY', 350, TRUE, FALSE, TRUE,
             'WORKER', 'SOLO', 30, TRUE,
             'Phase 6.3-15: Logged when a mortality event is investigated. Captures suspected cause + investigation method + findings for disease tracking + regulator visibility.')
        ON CONFLICT (event_type) DO NOTHING;
    """)

    # 3. Insert CULL_LOGGED into catalog
    op.execute("""
        INSERT INTO shared.event_type_catalog
            (event_type, catalog_group, sort_order, is_user_facing, is_compound,
             livestock_only, min_role, min_mode, backdating_window_days, is_active, notes)
        VALUES
            ('CULL_LOGGED', 'POULTRY', 360, TRUE, FALSE, TRUE,
             'WORKER', 'SOLO', 30, TRUE,
             'Phase 6.3-16: Logged when birds are culled (intentional removal). Captures qty + reason + disposal method.')
        ON CONFLICT (event_type) DO NOTHING;
    """)


def downgrade():
    op.execute("DELETE FROM shared.event_type_catalog WHERE event_type IN ('MORTALITY_INVESTIGATED','CULL_LOGGED');")
    # Don't downgrade CHECK enum - orphan rows worse than retaining permissive enum
