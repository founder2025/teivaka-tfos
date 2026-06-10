-- 092 web push subscriptions — apply-as-owner (Strike #123)
-- Run as owner, then stamp:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/092_push_subscriptions_apply_as_owner.sql
--   docker exec teivaka_api alembic stamp 092_push_subscriptions
--   docker exec teivaka_api alembic current   -- -> 092_push_subscriptions (head)

CREATE TABLE IF NOT EXISTS community.push_subscriptions (
    subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    endpoint        TEXT NOT NULL UNIQUE,
    p256dh          TEXT NOT NULL,
    auth            TEXT NOT NULL,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON community.push_subscriptions(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON community.push_subscriptions TO teivaka_app;
