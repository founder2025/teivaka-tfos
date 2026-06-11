"""104 - Home pillar: Groups (the connection engine)

community.groups + group_members, and feed_posts.group_id so group posts ride
the ENTIRE existing feed infrastructure (reactions, replies, photos, mentions)
instead of a parallel system. Groups are public-read, join-to-post; verified
members create them; admin can feature or close.
"""
from alembic import op

revision = "104_groups"
down_revision = "103_library_submissions"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


STATEMENTS = [
    """
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
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS community.group_members (
        group_id  TEXT NOT NULL REFERENCES community.groups(group_id) ON DELETE CASCADE,
        user_id   UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        role      TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('MEMBER','OWNER')),
        joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (group_id, user_id)
    )
    """,
    "ALTER TABLE community.feed_posts ADD COLUMN IF NOT EXISTS group_id TEXT",
    "CREATE INDEX IF NOT EXISTS idx_feed_posts_group ON community.feed_posts(group_id) WHERE group_id IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_group_members_user ON community.group_members(user_id)",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON community.groups, community.group_members TO teivaka_app",
]


def upgrade():
    _exec_each(STATEMENTS)


def downgrade():
    _exec_each([
        "ALTER TABLE community.feed_posts DROP COLUMN IF EXISTS group_id",
        "DROP TABLE IF EXISTS community.group_members",
        "DROP TABLE IF EXISTS community.groups",
    ])
