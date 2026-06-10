-- 094 community interactions: comments toggle, per-viewer hide, mute, block, photo reactions
-- Apply-as-owner (Strike #123 — alembic runs as teivaka_app, but these objects are
-- owned by teivaka, so ALTER/CREATE must run as the owner). Then stamp:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/094_community_interactions_apply_as_owner.sql
--   docker exec teivaka_api alembic stamp 094_community_interactions
--   docker exec teivaka_api alembic current   -- -> 094_community_interactions (head)

ALTER TABLE community.feed_posts ADD COLUMN IF NOT EXISTS comments_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS community.feed_hidden (
    user_id    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    post_id    TEXT NOT NULL REFERENCES community.feed_posts(post_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS community.user_mutes (
    user_id       UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    muted_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, muted_user_id)
);

CREATE TABLE IF NOT EXISTS community.user_blocks (
    user_id         UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    blocked_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, blocked_user_id)
);

ALTER TABLE community.feed_reactions DROP CONSTRAINT IF EXISTS feed_reactions_target_type_check;
ALTER TABLE community.feed_reactions ADD CONSTRAINT feed_reactions_target_type_check
  CHECK (target_type IN ('post','reply','photo'));

GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_hidden TO teivaka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.user_mutes  TO teivaka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.user_blocks TO teivaka_app;
