-- 090 feed gating + notifications + flags — apply-as-owner (Strike #123)
-- Run as owner, then stamp:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/090_feed_gating_notifications_apply_as_owner.sql
--   docker exec teivaka_api alembic stamp 090_feed_gating_notifications
--   docker exec teivaka_api alembic current   -- -> 090_feed_gating_notifications (head)
-- Mirrors 11_application_code/alembic/versions/090_feed_gating_notifications.py

ALTER TABLE community.feed_posts ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE community.feed_posts ADD COLUMN IF NOT EXISTS reach TEXT NOT NULL DEFAULT 'LOCAL';
ALTER TABLE community.feed_posts ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'POST';
ALTER TABLE community.feed_posts DROP CONSTRAINT IF EXISTS feed_posts_reach_chk;
ALTER TABLE community.feed_posts ADD CONSTRAINT feed_posts_reach_chk CHECK (reach IN ('LOCAL','GLOBAL'));
ALTER TABLE community.feed_posts DROP CONSTRAINT IF EXISTS feed_posts_kind_chk;
ALTER TABLE community.feed_posts ADD CONSTRAINT feed_posts_kind_chk CHECK (kind IN ('POST','EDU_REEL'));

UPDATE community.feed_posts fp
   SET country = u.country
  FROM tenant.users u
 WHERE u.user_id = fp.author_user_id AND fp.country IS NULL;

CREATE INDEX IF NOT EXISTS idx_feed_posts_country ON community.feed_posts(country, created_at DESC) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS community.feed_notifications (
    notification_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    actor_user_id    UUID REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    type             TEXT NOT NULL CHECK (type IN ('LIKE','REACT','REPLY','REPOST','SHARE','FOLLOW','MENTION')),
    post_id          TEXT,
    reply_id         TEXT,
    body             TEXT,
    read_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feed_notif_user ON community.feed_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_notif_unread ON community.feed_notifications(user_id) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS community.feed_flags (
    flag_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id          TEXT,
    reply_id         TEXT,
    reporter_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    reason           TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REVIEWED','ACTIONED','DISMISSED')),
    reviewed_by      UUID REFERENCES tenant.users(user_id),
    reviewed_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (post_id IS NOT NULL OR reply_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_feed_flags_status ON community.feed_flags(status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_notifications TO teivaka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_flags TO teivaka_app;
