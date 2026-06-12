"""124 — buyer fields + type taxonomy on tenant.customers (Buyers add-form fix)

Two things:
1. The Add-buyer flow was broken — the API INSERT referenced columns that don't exist
   (contact_person/market_location/tin_number/created_by) and offered customer_type values
   outside the CHECK. This migration aligns the data model so the corrected API can write.
2. Adds the prototype's Add-buyer fields so they can persist: distance_km, contact_role,
   preferred_channel, ferry_dependent. Expands the customer_type CHECK to the prototype's
   richer taxonomy (existing values kept, so current rows stay valid).

Revision ID: 124_customer_buyer_fields
Revises: 123_buyer_communications
"""
from alembic import op

revision = "124_customer_buyer_fields"
down_revision = "123_buyer_communications"
branch_labels = None
depends_on = None

# Existing 6 (kept so current rows validate) + prototype additions.
TYPES = (
    "'DIRECT','WHOLESALE','RESTAURANT','SUPERMARKET','EXPORT','RELATED_PARTY',"
    "'HOTEL','MUNICIPAL','COOP','ROADSIDE','INDIVIDUAL'"
)


def upgrade():
    op.execute("ALTER TABLE tenant.customers ADD COLUMN IF NOT EXISTS distance_km NUMERIC(8,1)")
    op.execute("ALTER TABLE tenant.customers ADD COLUMN IF NOT EXISTS contact_role TEXT")
    op.execute("ALTER TABLE tenant.customers ADD COLUMN IF NOT EXISTS preferred_channel TEXT")
    op.execute("ALTER TABLE tenant.customers ADD COLUMN IF NOT EXISTS ferry_dependent BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE tenant.customers DROP CONSTRAINT IF EXISTS customers_customer_type_check")
    op.execute(f"ALTER TABLE tenant.customers ADD CONSTRAINT customers_customer_type_check CHECK (customer_type IN ({TYPES}))")


def downgrade():
    op.execute("ALTER TABLE tenant.customers DROP CONSTRAINT IF EXISTS customers_customer_type_check")
    op.execute(
        "ALTER TABLE tenant.customers ADD CONSTRAINT customers_customer_type_check "
        "CHECK (customer_type IN ('DIRECT','WHOLESALE','RESTAURANT','SUPERMARKET','EXPORT','RELATED_PARTY'))"
    )
    op.execute("ALTER TABLE tenant.customers DROP COLUMN IF EXISTS ferry_dependent")
    op.execute("ALTER TABLE tenant.customers DROP COLUMN IF EXISTS preferred_channel")
    op.execute("ALTER TABLE tenant.customers DROP COLUMN IF EXISTS contact_role")
    op.execute("ALTER TABLE tenant.customers DROP COLUMN IF EXISTS distance_km")
