"""098 - Marketplace v2: categories, sold state, saves, record-link

Listings serve every profession: category (PRODUCE / INPUTS / TOOLS /
LIVESTOCK / SERVICES / WANTED), sold_at lifecycle, optional link to a
verifiable audit record, and per-user saved listings. Tier paywall on posting
is dropped in code (Operator-approved: open marketplace; verified email still
gates posting). Apply-as-owner (Strike #123); one statement per op.execute.
"""
from alembic import op

revision = "098_marketplace_v2"
down_revision = "097_kyc_verification"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        # Forensic finding 2026-06-11: community.listings was never created by any
        # migration — its DDL lived only in 01_architecture/COMMUNITY_PLATFORM.md,
        # so prod (and any fresh deploy) lacked the table and every ALTER below
        # failed. Canonical base shape from that doc; ALTERs then layer 098 cols.
        """
        CREATE TABLE IF NOT EXISTS community.listings (
            listing_id              VARCHAR(20) PRIMARY KEY,
            tenant_id               UUID NOT NULL REFERENCES tenant.tenants(tenant_id),
            farm_id                 VARCHAR(30) NOT NULL,
            production_id           VARCHAR(20) REFERENCES shared.productions(production_id),
            listing_title           VARCHAR(200) NOT NULL,
            listing_description     TEXT,
            quantity_available_kg   NUMERIC(10,2),
            price_per_kg_fjd        NUMERIC(8,2),
            negotiable              BOOLEAN DEFAULT true,
            grade                   VARCHAR(20) DEFAULT 'A' CHECK (grade IN ('A', 'B', 'C', 'ORGANIC', 'MIXED')),
            island                  VARCHAR(50) NOT NULL,
            pickup_location         VARCHAR(200),
            available_from          TIMESTAMPTZ,
            available_until         TIMESTAMPTZ,
            contact_whatsapp        VARCHAR(20),
            photos                  TEXT[],
            notes                   TEXT,
            listing_status          VARCHAR(20) DEFAULT 'ACTIVE' CHECK (listing_status IN ('ACTIVE', 'SOLD', 'CLOSED', 'ARCHIVED', 'EXPIRED')),
            view_count              INTEGER DEFAULT 0,
            inquiry_count           INTEGER DEFAULT 0,
            created_by              UUID NOT NULL,
            created_at              TIMESTAMPTZ DEFAULT now(),
            updated_at              TIMESTAMPTZ DEFAULT now()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_community_listings_production ON community.listings(production_id)",
        "CREATE INDEX IF NOT EXISTS idx_community_listings_island ON community.listings(island)",
        "CREATE INDEX IF NOT EXISTS idx_community_listings_status ON community.listings(listing_status)",
        "CREATE INDEX IF NOT EXISTS idx_community_listings_created ON community.listings(created_at DESC)",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.listings TO teivaka_app",
        "ALTER TABLE community.listings ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'PRODUCE'",
        "ALTER TABLE community.listings ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ",
        "ALTER TABLE community.listings ADD COLUMN IF NOT EXISTS link_audit_hash TEXT",
        """
        CREATE TABLE IF NOT EXISTS community.listing_saves (
            user_id    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            listing_id TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, listing_id)
        )
        """,
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.listing_saves TO teivaka_app",
    ])


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS community.listing_saves",
        "ALTER TABLE community.listings DROP COLUMN IF EXISTS link_audit_hash",
        "ALTER TABLE community.listings DROP COLUMN IF EXISTS sold_at",
        "ALTER TABLE community.listings DROP COLUMN IF EXISTS category",
    ])
