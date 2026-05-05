"""Strike #100 — uppercase production_name for CROPS pillar productions

Normalize the CASSAVA-style UPPERCASE convention across all CRP-/FRT-/SUP-
prefixed rows so the CROP dropdown reads consistently.

Untouched: LIV-* (livestock + apiculture), AQU-* (aquaculture),
FOR-* (forestry) — outside CROPS pillar dropdown, may have intentional
casing for those pillars.

Affects ~80 rows. Rows already UPPERCASE (CASSAVA, EGGPLANT, KAVA, etc.)
are no-ops since UPPER('CASSAVA') = 'CASSAVA'.

Revision ID kept short to fit alembic_version VARCHAR(32) cap.

asyncpg requires one DDL statement per op.execute() call (Strike #72).

Revision ID: 069_crop_name_uppercase
Revises: 068_crop_varieties_catalog
Create Date: 2026-05-05
"""
from alembic import op

revision = '069_crop_name_uppercase'
down_revision = '068_crop_varieties_catalog'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        UPDATE shared.productions
        SET production_name = UPPER(production_name)
        WHERE production_id LIKE 'CRP-%'
           OR production_id LIKE 'FRT-%'
           OR production_id LIKE 'SUP-%';
    """)


def downgrade() -> None:
    # No clean reverse — case info lost on UPPER. Manual restore required if needed.
    pass
