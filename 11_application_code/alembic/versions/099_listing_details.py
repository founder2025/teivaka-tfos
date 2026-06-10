"""099 - Category-native listings: price_basis + details JSONB

price_basis: what the price is per (kg/unit/hour/job/day/head/pack/item, or
'budget' for WANTED). details: category-specific structured fields (grade,
condition, brand, head_count, service_area, needed_by, ...) stored honestly
instead of overloading the kg/price columns. Apply-as-owner (Strike #123).
"""
from alembic import op

revision = "099_listing_details"
down_revision = "098_marketplace_v2"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        "ALTER TABLE community.listings ADD COLUMN IF NOT EXISTS price_basis TEXT NOT NULL DEFAULT 'kg'",
        "ALTER TABLE community.listings ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb",
    ])


def downgrade():
    _exec_each([
        "ALTER TABLE community.listings DROP COLUMN IF EXISTS details",
        "ALTER TABLE community.listings DROP COLUMN IF EXISTS price_basis",
    ])
