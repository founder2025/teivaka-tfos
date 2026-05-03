"""Phase 6.3-13/14: FEED_PURCHASED + WATER_CONSUMED 2-form pack.

Adds both events to audit.events CHECK enum + event_type_catalog.
PRE-CHECK confirmed both net-new (no idempotency collisions).

Strike #72: each DDL one op.execute() call.
Strike #51: catalog INSERTs ON CONFLICT DO NOTHING (defensive).

Revision ID: 057_feed_purchased_water
Revises: 056_litter_coop_disinfect
"""
from alembic import op
import sqlalchemy as sa
import re


revision = '057_feed_purchased_water'
down_revision = '056_litter_coop_disinfect'
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
            for v in ('FEED_PURCHASED', 'WATER_CONSUMED'):
                if v not in new_values:
                    new_values.append(v)
            if len(new_values) > len(existing):
                array_lit = ", ".join([f"'{v}'::text" for v in new_values])
                op.execute(f"ALTER TABLE audit.events DROP CONSTRAINT {constraint_name};")
                op.execute(
                    f"ALTER TABLE audit.events ADD CONSTRAINT {constraint_name} "
                    f"CHECK (event_type = ANY (ARRAY[{array_lit}]));"
                )

    # 2. Insert FEED_PURCHASED into event_type_catalog
    op.execute("""
        INSERT INTO shared.event_type_catalog
            (event_type, catalog_group, sort_order, is_user_facing, is_compound,
             livestock_only, min_role, min_mode, backdating_window_days, is_active, notes)
        VALUES
            ('FEED_PURCHASED', 'POULTRY', 330, TRUE, FALSE, TRUE,
             'WORKER', 'SOLO', 30, TRUE,
             'Phase 6.3-13: Logged when feed is bought from a supplier. Cost + supplier captured for Bank Evidence + cashflow tracking.')
        ON CONFLICT (event_type) DO NOTHING;
    """)

    # 3. Insert WATER_CONSUMED into event_type_catalog
    op.execute("""
        INSERT INTO shared.event_type_catalog
            (event_type, catalog_group, sort_order, is_user_facing, is_compound,
             livestock_only, min_role, min_mode, backdating_window_days, is_active, notes)
        VALUES
            ('WATER_CONSUMED', 'POULTRY', 340, TRUE, FALSE, TRUE,
             'WORKER', 'SOLO', 30, TRUE,
             'Phase 6.3-14: Logged when water consumption is recorded for a flock. Coop-scoped event for hydration tracking.')
        ON CONFLICT (event_type) DO NOTHING;
    """)


def downgrade():
    op.execute("DELETE FROM shared.event_type_catalog WHERE event_type IN ('FEED_PURCHASED','WATER_CONSUMED');")
    # Don't downgrade CHECK enum - orphan rows worse than retaining permissive enum
