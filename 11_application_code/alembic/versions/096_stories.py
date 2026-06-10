"""096 - Stories: 24-hour ephemeral photo/video stories above the community feed

community.stories + story_views (no RLS — community schema is cross-tenant by
design, mirrors feed_posts). Expiry is data-driven (expires_at), enforced in
queries; no cron needed. Apply-as-owner (Strike #123); the community-schema
DEFAULT PRIVILEGES (grant sweep) auto-grant teivaka_app, grants re-stated for
environments without it. One statement per op.execute (Strike #72).
"""
from alembic import op

revision = "096_stories"
down_revision = "095_profile_prefs"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        """
        CREATE TABLE IF NOT EXISTS community.stories (
            story_id       TEXT PRIMARY KEY,
            tenant_id      UUID,
            author_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            media_url      TEXT NOT NULL,
            media_type     TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video')),
            caption        TEXT,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at     TIMESTAMPTZ NOT NULL DEFAULT NOW() + interval '24 hours'
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_stories_active ON community.stories(expires_at DESC, author_user_id)",
        """
        CREATE TABLE IF NOT EXISTS community.story_views (
            story_id       TEXT NOT NULL REFERENCES community.stories(story_id) ON DELETE CASCADE,
            viewer_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            viewed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (story_id, viewer_user_id)
        )
        """,
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.stories TO teivaka_app",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.story_views TO teivaka_app",
    ])


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS community.story_views",
        "DROP TABLE IF EXISTS community.stories",
    ])
