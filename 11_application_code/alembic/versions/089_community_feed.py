"""089 - Community Feed: clean feed schema (posts/likes/reactions/replies/saves/reposts/shares/topics)

Revision ID: 089_community_feed
Revises: 088_market_intelligence
Create Date: 2026-06-09

Operator-directed: make Home -> Feed fully functional end-to-end (compose, like,
emoji-react, reply thread, repost, share-to-user, save, follow, topics, filters).

DRIFT NOTE (gap-list finding): the existing community.posts (migration 017) and the
community.py create_post writer disagree on columns/PK type, and community.listings has
no creating migration on disk at all — the deployed community.* shape is unverifiable
from the repo. Rather than guess against a drifted table, the Feed is built on a NEW,
fully-owned community.feed_* schema so migration + router are guaranteed consistent.
community.posts/listings are left untouched. community.follows (017) is reused as-is.

Pattern: cross-tenant community.* with NO RLS (app-layer access; reads public via
get_db, writes authenticated via get_rls_db for provenance). Counts (likes/replies/
reposts/reactions) are computed on read — no denormalised counters, no triggers, so
they can never drift. FKs to tenant.users/tenant.tenants (deployment source of truth).

asyncpg: one statement per op.execute via _exec_each (Strike #72). Explicit GRANTs to
teivaka_app (B73).
"""
from alembic import op

revision = "089_community_feed"
down_revision = "088_market_intelligence"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        "CREATE SCHEMA IF NOT EXISTS community",

        # ---------------------------------------------------------------- posts
        """
        CREATE TABLE IF NOT EXISTS community.feed_posts (
            post_id            TEXT PRIMARY KEY,
            tenant_id          UUID REFERENCES tenant.tenants(tenant_id),
            author_user_id     UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            author_profession  TEXT NOT NULL DEFAULT 'farmer',
            body               TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
            post_type          TEXT NOT NULL DEFAULT 'UPDATE'
                                 CHECK (post_type IN ('UPDATE','QUESTION','PHOTO','MILESTONE')),
            is_question        BOOLEAN NOT NULL DEFAULT FALSE,
            audience           TEXT NOT NULL DEFAULT 'everyone'
                                 CHECK (audience IN ('everyone','followers','farmer','buyer','banker','business','service_provider')),
            location           TEXT,
            vertical           TEXT,
            photos             TEXT[] NOT NULL DEFAULT '{}',
            mentions           TEXT[] NOT NULL DEFAULT '{}',
            link_audit_hash    TEXT,
            is_repost          BOOLEAN NOT NULL DEFAULT FALSE,
            repost_of_id       TEXT REFERENCES community.feed_posts(post_id) ON DELETE SET NULL,
            pinned             BOOLEAN NOT NULL DEFAULT FALSE,
            best_answer_reply_id TEXT,
            status             TEXT NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active','deleted','hidden')),
            audit_hash         TEXT,
            created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            edited_at          TIMESTAMPTZ,
            deleted_at         TIMESTAMPTZ
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_feed_posts_created ON community.feed_posts(created_at DESC) WHERE status = 'active'",
        "CREATE INDEX IF NOT EXISTS idx_feed_posts_author ON community.feed_posts(author_user_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_feed_posts_repost ON community.feed_posts(repost_of_id) WHERE is_repost = TRUE",

        # ---------------------------------------------------------------- likes
        """
        CREATE TABLE IF NOT EXISTS community.feed_likes (
            post_id     TEXT NOT NULL REFERENCES community.feed_posts(post_id) ON DELETE CASCADE,
            user_id     UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (post_id, user_id)
        )
        """,

        # ------------------------------------------------------------ reactions
        # Separate farmer-native emoji system (distinct from like). One reaction
        # per user per target. target_type post|reply.
        """
        CREATE TABLE IF NOT EXISTS community.feed_reactions (
            user_id      UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            target_type  TEXT NOT NULL CHECK (target_type IN ('post','reply')),
            target_id    TEXT NOT NULL,
            reaction     TEXT NOT NULL
                           CHECK (reaction IN ('strong_crop','good_harvest','vinaka','hoping_rain','learning')),
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, target_type, target_id)
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_feed_reactions_target ON community.feed_reactions(target_type, target_id)",

        # -------------------------------------------------------------- replies
        """
        CREATE TABLE IF NOT EXISTS community.feed_replies (
            reply_id          TEXT PRIMARY KEY,
            post_id           TEXT NOT NULL REFERENCES community.feed_posts(post_id) ON DELETE CASCADE,
            parent_reply_id   TEXT REFERENCES community.feed_replies(reply_id) ON DELETE CASCADE,
            tenant_id         UUID REFERENCES tenant.tenants(tenant_id),
            author_user_id    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            author_profession TEXT NOT NULL DEFAULT 'farmer',
            body              TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
            photos            TEXT[] NOT NULL DEFAULT '{}',
            status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at        TIMESTAMPTZ
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_feed_replies_post ON community.feed_replies(post_id, created_at) WHERE status = 'active'",

        # ---------------------------------------------------------- reply likes
        """
        CREATE TABLE IF NOT EXISTS community.feed_reply_likes (
            reply_id    TEXT NOT NULL REFERENCES community.feed_replies(reply_id) ON DELETE CASCADE,
            user_id     UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (reply_id, user_id)
        )
        """,

        # --------------------------------------------------------------- saves
        """
        CREATE TABLE IF NOT EXISTS community.feed_saves (
            post_id     TEXT NOT NULL REFERENCES community.feed_posts(post_id) ON DELETE CASCADE,
            user_id     UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (post_id, user_id)
        )
        """,

        # -------------------------------------------------------------- shares
        # Share = send a post to another TFOS user (in-app). Recipient sees it in
        # their "Shared with you" lane (GET /community/feed/shared).
        """
        CREATE TABLE IF NOT EXISTS community.feed_shares (
            share_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            post_id       TEXT NOT NULL REFERENCES community.feed_posts(post_id) ON DELETE CASCADE,
            from_user_id  UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            to_user_id    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            note          TEXT,
            seen_at       TIMESTAMPTZ,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_feed_shares_to ON community.feed_shares(to_user_id, created_at DESC)",

        # --------------------------------------------------------- topic follows
        """
        CREATE TABLE IF NOT EXISTS community.topic_follows (
            user_id     UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            topic       TEXT NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, topic)
        )
        """,

        # --------------------------------------------------------------- GRANTs
        "GRANT USAGE ON SCHEMA community TO teivaka_app",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_posts TO teivaka_app",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_likes TO teivaka_app",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_reactions TO teivaka_app",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_replies TO teivaka_app",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_reply_likes TO teivaka_app",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_saves TO teivaka_app",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_shares TO teivaka_app",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.topic_follows TO teivaka_app",
    ])


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS community.topic_follows",
        "DROP TABLE IF EXISTS community.feed_shares",
        "DROP TABLE IF EXISTS community.feed_saves",
        "DROP TABLE IF EXISTS community.feed_reply_likes",
        "DROP TABLE IF EXISTS community.feed_replies",
        "DROP TABLE IF EXISTS community.feed_reactions",
        "DROP TABLE IF EXISTS community.feed_likes",
        "DROP TABLE IF EXISTS community.feed_posts",
    ])
