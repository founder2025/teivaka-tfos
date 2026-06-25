"""185 — B2 demand consolidation: WANTED listings → demand_records

Makes community.demand_records the single source of truth for buyer demand.
Marketplace "Wanted" was a parallel surface in community.listings; this backfills
crop-bearing WANTED listings into demand_records and archives the originals, so
the two demand surfaces become one (and all WANTED demand now feeds Signals).

source_listing_id is added for clean reversibility. WANTED listings WITHOUT a
production_id are left untouched (demand_records.production_id is NOT NULL — a
demand record must name a crop); these are expected to be ~zero in prod.

Additive + reversible. Apply as owner (Strike #123).

Revision ID: 185_demand_consolidation
Revises: 184_payment_security
"""
from alembic import op

revision = "185_demand_consolidation"
down_revision = "184_payment_security"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE community.demand_records ADD COLUMN IF NOT EXISTS source_listing_id TEXT")
    op.execute("""
        INSERT INTO community.demand_records
            (tenant_id, farm_id, created_by, production_id, quantity_kg, frequency, is_recurring,
             buyer_name, island, price_offered_fjd, status, contact_whatsapp, notes, country,
             source_listing_id, created_at)
        SELECT cl.tenant_id, cl.farm_id, cl.created_by, cl.production_id,
               GREATEST(COALESCE(cl.quantity_available_kg, 1), 1), 'ONE_OFF', false,
               u.full_name, cl.island, cl.price_per_kg_fjd, 'OPEN', cl.contact_whatsapp,
               COALESCE(NULLIF(cl.listing_description, ''), cl.listing_title),
               t.country, cl.listing_id, cl.created_at
        FROM community.listings cl
        LEFT JOIN tenant.users u   ON u.user_id   = cl.created_by
        LEFT JOIN tenant.tenants t ON t.tenant_id = cl.tenant_id
        WHERE cl.category = 'WANTED' AND cl.listing_status = 'ACTIVE'
          AND cl.production_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM community.demand_records d WHERE d.source_listing_id = cl.listing_id)
    """)
    op.execute("""
        UPDATE community.listings SET listing_status = 'ARCHIVED', updated_at = now()
        WHERE category = 'WANTED' AND listing_status = 'ACTIVE'
          AND listing_id IN (SELECT source_listing_id FROM community.demand_records WHERE source_listing_id IS NOT NULL)
    """)


def downgrade():
    op.execute("""
        UPDATE community.listings SET listing_status = 'ACTIVE', updated_at = now()
        WHERE listing_id IN (SELECT source_listing_id FROM community.demand_records WHERE source_listing_id IS NOT NULL)
    """)
    op.execute("DELETE FROM community.demand_records WHERE source_listing_id IS NOT NULL")
    op.execute("ALTER TABLE community.demand_records DROP COLUMN IF EXISTS source_listing_id")
