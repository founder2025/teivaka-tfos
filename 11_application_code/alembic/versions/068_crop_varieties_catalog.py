"""Strike #100 — shared.crop_varieties catalog

Adds a new shared.crop_varieties table for structured variety taxonomy.
Backs the VARIETY dropdown in the redesigned PLANTING + TRANSPLANT_LOGGED
forms (Strike #98 Rule 6 satisfaction; B68 promotion of free-text variety
to catalog FK).

Seeds 6 initial demo varieties for CASSAVA (3) and EGGPLANT (3) — the two
crops with active demo cycles in F001 tenant. Operator can extend via a
future B64 Per-Pillar Vertical Map session.

asyncpg requires one DDL statement per op.execute() call (Strike #72).

Revision ID: 068_crop_varieties_catalog
Revises: 067_field_events_check_extend
Create Date: 2026-05-05
"""
from alembic import op

revision = '068_crop_varieties_catalog'
down_revision = '067_field_events_check_extend'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create the table.
    op.execute("""
        CREATE TABLE shared.crop_varieties (
            variety_id    VARCHAR(120) PRIMARY KEY,
            production_id VARCHAR(120) NOT NULL REFERENCES shared.productions(production_id),
            variety_name  VARCHAR(120) NOT NULL,
            local_name    VARCHAR(120),
            notes         TEXT,
            is_active     BOOLEAN NOT NULL DEFAULT TRUE,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (production_id, variety_name)
        );
    """)
    # 2. Index on active varieties scoped by production.
    op.execute("""
        CREATE INDEX idx_crop_varieties_production
        ON shared.crop_varieties(production_id) WHERE is_active = TRUE;
    """)
    # 3. Seed initial demo varieties for CASSAVA and EGGPLANT.
    op.execute("""
        INSERT INTO shared.crop_varieties (variety_id, production_id, variety_name) VALUES
            ('CRP-CAS-VINKESI',      'CRP-CAS', 'Vinkesi'),
            ('CRP-CAS-YABIA',        'CRP-CAS', 'Yabia'),
            ('CRP-CAS-LOCAL-WHITE',  'CRP-CAS', 'Local White'),
            ('CRP-EGG-LONG-PURPLE',  'CRP-EGG', 'Long Purple'),
            ('CRP-EGG-BLACK-BEAUTY', 'CRP-EGG', 'Black Beauty'),
            ('CRP-EGG-ROUND-GREEN',  'CRP-EGG', 'Round Green');
    """)


def downgrade() -> None:
    op.execute("DROP TABLE shared.crop_varieties CASCADE;")
