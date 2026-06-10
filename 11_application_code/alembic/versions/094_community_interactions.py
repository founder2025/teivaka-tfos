"""094 - Community interaction: comments toggle, per-viewer hide, mute, block, photo reactions

Slice 1 (three-dot menu) needs:
  - feed_posts.comments_enabled        (own: turn comments on/off)
  - community.feed_hidden              (per-viewer "hide this post")
  - community.user_mutes               (hide an author from my feed, still following)
  - community.user_blocks              (two-way block)
Slice 2 (photo lightbox) groundwork:
  - feed_reactions.target_type now allows 'photo' (target_id = '<post_id>#<index>')

community.* has no RLS by design (social graph is cross-tenant); these mirror the
existing feed_likes/feed_saves/follows pattern — composite PK, FK to tenant.users,
explicit per-user filtering in queries. One statement per op.execute (Strike #72).
"""
from alembic import op

revision = "094_community_interactions"
down_revision = "093_profile_fields"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        # Own-post: turn comments on/off
        "ALTER TABLE community.feed_posts ADD COLUMN IF NOT EXISTS comments_enabled BOOLEAN NOT NULL DEFAULT TRUE",

        # Per-viewer hide ("show fewer like this")
        """
        CREATE TABLE IF NOT EXISTS community.feed_hidden (
            user_id    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            post_id    TEXT NOT NULL REFERENCES community.feed_posts(post_id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, post_id)
        )
        """,

        # Mute an author (stay following, hide their posts from my feed)
        """
        CREATE TABLE IF NOT EXISTS community.user_mutes (
            user_id       UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            muted_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, muted_user_id)
        )
        """,

        # Block an author (two-way: neither sees the other's posts; chat-gated elsewhere)
        """
        CREATE TABLE IF NOT EXISTS community.user_blocks (
            user_id         UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            blocked_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, blocked_user_id)
        )
        """,

        # Slice 2 groundwork: allow per-photo reactions (target_id = '<post_id>#<idx>')
        "ALTER TABLE community.feed_reactions DROP CONSTRAINT IF EXISTS feed_reactions_target_type_check",
        "ALTER TABLE community.feed_reactions ADD CONSTRAINT feed_reactions_target_type_check CHECK (target_type IN ('post','reply','photo'))",

        # Runtime grants for the app role (tables are owned by teivaka per Strike #123)
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_hidden TO teivaka_app",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.user_mutes TO teivaka_app",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.user_blocks TO teivaka_app",
    ])


def downgrade():
    _exec_each([
        "ALTER TABLE community.feed_reactions DROP CONSTRAINT IF EXISTS feed_reactions_target_type_check",
        "ALTER TABLE community.feed_reactions ADD CONSTRAINT feed_reactions_target_type_check CHECK (target_type IN ('post','reply'))",
        "DROP TABLE IF EXISTS community.user_blocks",
        "DROP TABLE IF EXISTS community.user_mutes",
        "DROP TABLE IF EXISTS community.feed_hidden",
        "ALTER TABLE community.feed_posts DROP COLUMN IF EXISTS comments_enabled",
    ])
