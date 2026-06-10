-- 091 ecosystem: taxonomy + market country + chat — apply-as-owner (Strike #123)
-- Run as owner, then stamp:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/091_ecosystem_taxonomy_chat_apply_as_owner.sql
--   docker exec teivaka_api alembic stamp 091_ecosystem_taxonomy_chat
--   docker exec teivaka_api alembic current   -- -> 091_ecosystem_taxonomy_chat (head)

UPDATE tenant.users SET account_type = 'BUSINESS' WHERE account_type = 'OTHER';
ALTER TABLE tenant.users DROP CONSTRAINT IF EXISTS users_account_type_check;
ALTER TABLE tenant.users ADD CONSTRAINT users_account_type_check
  CHECK (account_type IN ('FARMER','BUYER','SUPPLIER','SERVICE_PROVIDER','BANKER','BUSINESS','EXPORTER','IMPORTER'));

ALTER TABLE community.feed_posts DROP CONSTRAINT IF EXISTS feed_posts_audience_check;
ALTER TABLE community.feed_posts ADD CONSTRAINT feed_posts_audience_check
  CHECK (audience IN ('everyone','followers','farmer','buyer','supplier','service_provider','banker','business','exporter','importer'));

ALTER TABLE community.price_records    ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE community.demand_records   ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE community.supply_forecasts ADD COLUMN IF NOT EXISTS country TEXT;
UPDATE community.price_records pr    SET country = t.country FROM tenant.tenants t WHERE t.tenant_id = pr.tenant_id AND pr.country IS NULL;
UPDATE community.demand_records d     SET country = t.country FROM tenant.tenants t WHERE t.tenant_id = d.tenant_id  AND d.country IS NULL;
UPDATE community.supply_forecasts s   SET country = t.country FROM tenant.tenants t WHERE t.tenant_id = s.tenant_id  AND s.country IS NULL;

CREATE TABLE IF NOT EXISTS community.chat_threads (
    thread_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_lo       UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    user_hi       UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ,
    CHECK (user_lo < user_hi),
    UNIQUE (user_lo, user_hi)
);
CREATE TABLE IF NOT EXISTS community.chat_messages (
    message_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id      UUID NOT NULL REFERENCES community.chat_threads(thread_id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    body           TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_chat_msg_thread ON community.chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_threads_lo ON community.chat_threads(user_lo, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_threads_hi ON community.chat_threads(user_hi, last_message_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON community.chat_threads TO teivaka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.chat_messages TO teivaka_app;
