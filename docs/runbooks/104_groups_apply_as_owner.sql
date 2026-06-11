-- 104 groups — apply-as-owner (Strike #123). Idempotent.
-- GENERATED from alembic/versions/104_groups.py STATEMENTS — keep in sync.

CREATE TABLE IF NOT EXISTS community.groups (
        group_id    TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        category    TEXT NOT NULL DEFAULT 'GENERAL',
        cover_url   TEXT,
        created_by  UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLOSED')),
        featured    BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
CREATE TABLE IF NOT EXISTS community.group_members (
        group_id  TEXT NOT NULL REFERENCES community.groups(group_id) ON DELETE CASCADE,
        user_id   UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        role      TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('MEMBER','OWNER')),
        joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (group_id, user_id)
    );
ALTER TABLE community.feed_posts ADD COLUMN IF NOT EXISTS group_id TEXT;
CREATE INDEX IF NOT EXISTS idx_feed_posts_group ON community.feed_posts(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_group_members_user ON community.group_members(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON community.groups, community.group_members TO teivaka_app;

-- verify
SELECT (to_regclass('community.groups') IS NOT NULL)::int + (to_regclass('community.group_members') IS NOT NULL)::int + (SELECT count(*) FROM information_schema.columns WHERE table_schema='community' AND table_name='feed_posts' AND column_name='group_id')::int AS groups_objects_3;
