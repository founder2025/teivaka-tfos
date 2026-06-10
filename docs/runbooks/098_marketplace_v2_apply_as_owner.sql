-- 098 marketplace v2 — apply-as-owner (Strike #123), then stamp:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/098_marketplace_v2_apply_as_owner.sql
--   docker exec teivaka_api alembic stamp 098_marketplace_v2
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
SELECT to_regclass('community.listing_saves') AS listing_saves,
       (SELECT count(*) FROM information_schema.columns WHERE table_schema='community' AND table_name='listings' AND column_name IN ('category','sold_at','link_audit_hash')) AS new_cols;
