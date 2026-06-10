-- 098 marketplace v2 — apply-as-owner (Strike #123), then stamp:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/098_marketplace_v2_apply_as_owner.sql
--   docker exec teivaka_api alembic stamp 098_marketplace_v2
--
-- Forensic finding 2026-06-11: community.listings was NEVER created by any
-- migration — its DDL lived only in 01_architecture/COMMUNITY_PLATFORM.md.
-- Prod lacked the table entirely, so every ALTER below failed (silently,
-- pre-ON_ERROR_STOP). Create the canonical base shape first.
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
);
CREATE INDEX IF NOT EXISTS idx_community_listings_production ON community.listings(production_id);
CREATE INDEX IF NOT EXISTS idx_community_listings_island ON community.listings(island);
CREATE INDEX IF NOT EXISTS idx_community_listings_status ON community.listings(listing_status);
CREATE INDEX IF NOT EXISTS idx_community_listings_created ON community.listings(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON community.listings TO teivaka_app;
ALTER TABLE community.listings ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'PRODUCE';
ALTER TABLE community.listings ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;
ALTER TABLE community.listings ADD COLUMN IF NOT EXISTS link_audit_hash TEXT;
CREATE TABLE IF NOT EXISTS community.listing_saves (
    user_id    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    listing_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, listing_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON community.listing_saves TO teivaka_app;
-- verify
SELECT to_regclass('community.listings') AS listings,
       to_regclass('community.listing_saves') AS listing_saves,
       (SELECT count(*) FROM information_schema.columns WHERE table_schema='community' AND table_name='listings' AND column_name IN ('category','sold_at','link_audit_hash')) AS new_cols;
