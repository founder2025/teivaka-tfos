-- 096 stories — apply-as-owner (Strike #123), then stamp:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/096_stories_apply_as_owner.sql
--   docker exec teivaka_api alembic stamp 096_stories
--   docker exec teivaka_api alembic current   -- -> 096_stories (head)

CREATE TABLE IF NOT EXISTS community.stories (
    story_id       TEXT PRIMARY KEY,
    tenant_id      UUID,
    author_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    media_url      TEXT NOT NULL,
    media_type     TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video')),
    caption        TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMPTZ NOT NULL DEFAULT NOW() + interval '24 hours'
);
CREATE INDEX IF NOT EXISTS idx_stories_active ON community.stories(expires_at DESC, author_user_id);
CREATE TABLE IF NOT EXISTS community.story_views (
    story_id       TEXT NOT NULL REFERENCES community.stories(story_id) ON DELETE CASCADE,
    viewer_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    viewed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (story_id, viewer_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON community.stories TO teivaka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.story_views TO teivaka_app;

-- verify
SELECT to_regclass('community.stories') AS stories, to_regclass('community.story_views') AS story_views;
