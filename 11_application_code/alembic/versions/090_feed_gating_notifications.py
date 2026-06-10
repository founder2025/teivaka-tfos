"""090 - Feed gating + notifications + moderation flags

Revision ID: 090_feed_gating_notifications
Revises: 089_community_feed
Create Date: 2026-06-10

Makes the community feed behave like real social media end-to-end:
  - community.feed_posts gains country (visibility wall) + reach (LOCAL/GLOBAL,
    exporter/importer global trade) + kind (POST/EDU_REEL global learning).
    Existing rows backfilled with the author's country.
  - community.feed_notifications — like/react/reply/repost/share/follow/mention.
  - community.feed_flags — user reports for moderation.

Cross-tenant community.* pattern (no RLS, app-layer access). asyncpg: one statement
per op.execute (Strike #72). Explicit GRANTs to teivaka_app (B73).
"""
from alembic import op

revision = "090_feed_gating_notifications"
down_revision = "089_community_feed"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        # ---- feed_posts: visibility wall + reach + kind -------------------
        "ALTER TABLE community.feed_posts ADD COLUMN IF NOT EXISTS country TEXT",
        "ALTER TABLE community.feed_posts ADD COLUMN IF NOT EXISTS reach TEXT NOT NULL DEFAULT 'LOCAL'",
        "ALTER TABLE community.feed_posts ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'POST'",
        "ALTER TABLE community.feed_posts DROP CONSTRAINT IF EXISTS feed_posts_reach_chk",
        "ALTER TABLE community.feed_posts ADD CONSTRAINT feed_posts_reach_chk CHECK (reach IN ('LOCAL','GLOBAL'))",
        "ALTER TABLE community.feed_posts DROP CONSTRAINT IF EXISTS feed_posts_kind_chk",
        "ALTER TABLE community.feed_posts ADD CONSTRAINT feed_posts_kind_chk CHECK (kind IN ('POST','EDU_REEL'))",
        # backfill country from the author's profile
        """
        UPDATE community.feed_posts fp
           SET country = u.country
          FROM tenant.users u
         WHERE u.user_id = fp.author_user_id AND fp.country IS NULL
        """,
        "CREATE INDEX IF NOT EXISTS idx_feed_posts_country ON community.feed_posts(country, created_at DESC) WHERE status = 'active'",

        # ---- notifications ----------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS community.feed_notifications (
            notification_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id          UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            actor_user_id    UUID REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            type             TEXT NOT NULL
                               CHECK (type IN ('LIKE','REACT','REPLY','REPOST','SHARE','FOLLOW','MENTION')),
            post_id          TEXT,
            reply_id         TEXT,
            body             TEXT,
            read_at          TIMESTAMPTZ,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_feed_notif_user ON community.feed_notifications(user_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_feed_notif_unread ON community.feed_notifications(user_id) WHERE read_at IS NULL",

        # ---- moderation flags -------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS community.feed_flags (
            flag_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            post_id          TEXT,
            reply_id         TEXT,
            reporter_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            reason           TEXT NOT NULL,
            status           TEXT NOT NULL DEFAULT 'OPEN'
                               CHECK (status IN ('OPEN','REVIEWED','ACTIONED','DISMISSED')),
            reviewed_by      UUID REFERENCES tenant.users(user_id),
            reviewed_at      TIMESTAMPTZ,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CHECK (post_id IS NOT NULL OR reply_id IS NOT NULL)
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_feed_flags_status ON community.feed_flags(status, created_at DESC)",

        # ---- GRANTs ------------------------------------------------------
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_notifications TO teivaka_app",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_flags TO teivaka_app",
    ])


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS community.feed_flags",
        "DROP TABLE IF EXISTS community.feed_notifications",
        "ALTER TABLE community.feed_posts DROP COLUMN IF EXISTS kind",
        "ALTER TABLE community.feed_posts DROP COLUMN IF EXISTS reach",
        "ALTER TABLE community.feed_posts DROP COLUMN IF EXISTS country",
    ])
