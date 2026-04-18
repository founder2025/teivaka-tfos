"""017 - Community schema: posts, likes, comments, follows, blocks, flags

Revision ID: 017_community_schema
Revises: 014_growth_foundations
Create Date: 2026-04-18

Per TFOS Platform Architecture v1.0 Section 8.2.

SCHEMA DRIFT NOTE: FK targets are tenant.users / tenant.tenants (not auth.*)
because this deployment has NO auth schema. Users live in tenant.users on the
deployed DB. The master instruction Part 4 says users *should* live in auth,
but the reality on the server is tenant. Accept tenant as current source of
truth; flag auth-schema reconciliation as separate migration debt.

RLS: community.* tables have NO RLS — access enforced at application layer via
visibility enum and block filtering. See Section 8.6.

MIGRATION NUMBERING: Skips 015 and 016 per architecture doc's planned number
017 for community module. Alembic chains by down_revision, not numeric order.
"""
from alembic import op

revision = "017_community_schema"
down_revision = "016b_fix_validate_rotation_alts"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        # --------------------------------------------------------------
        # Schema
        # --------------------------------------------------------------
        "CREATE SCHEMA IF NOT EXISTS community",

        # --------------------------------------------------------------
        # community.posts
        # --------------------------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS community.posts (
            post_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            author_user_id    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            author_tenant_id  UUID REFERENCES tenant.tenants(tenant_id),
            post_type         TEXT NOT NULL CHECK (post_type IN ('UPDATE','QUESTION','PHOTO','MILESTONE','MARKETPLACE')),
            body              TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
            media_urls        TEXT[] DEFAULT '{}',
            crop_tag          TEXT,
            location_region   TEXT,
            visibility        TEXT NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC','FOLLOWERS','PRIVATE')),
            is_pinned         BOOLEAN NOT NULL DEFAULT FALSE,
            is_flagged        BOOLEAN NOT NULL DEFAULT FALSE,
            flagged_reason    TEXT,
            like_count        INTEGER NOT NULL DEFAULT 0,
            comment_count     INTEGER NOT NULL DEFAULT 0,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at        TIMESTAMPTZ
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_posts_created ON community.posts(created_at DESC) WHERE deleted_at IS NULL",
        "CREATE INDEX IF NOT EXISTS idx_posts_author ON community.posts(author_user_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_posts_crop ON community.posts(crop_tag, created_at DESC) WHERE deleted_at IS NULL",

        # --------------------------------------------------------------
        # community.post_likes
        # --------------------------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS community.post_likes (
            post_id     UUID NOT NULL REFERENCES community.posts(post_id) ON DELETE CASCADE,
            user_id     UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (post_id, user_id)
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_likes_user ON community.post_likes(user_id, created_at DESC)",

        # --------------------------------------------------------------
        # community.post_comments
        # --------------------------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS community.post_comments (
            comment_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            post_id           UUID NOT NULL REFERENCES community.posts(post_id) ON DELETE CASCADE,
            author_user_id    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            parent_comment_id UUID REFERENCES community.post_comments(comment_id) ON DELETE CASCADE,
            body              TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
            is_flagged        BOOLEAN NOT NULL DEFAULT FALSE,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at        TIMESTAMPTZ
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_comments_post ON community.post_comments(post_id, created_at) WHERE deleted_at IS NULL",

        # --------------------------------------------------------------
        # community.follows
        # --------------------------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS community.follows (
            follower_user_id  UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            followed_user_id  UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (follower_user_id, followed_user_id),
            CHECK (follower_user_id <> followed_user_id)
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_follows_followed ON community.follows(followed_user_id, created_at DESC)",

        # --------------------------------------------------------------
        # community.user_blocks
        # --------------------------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS community.user_blocks (
            blocker_user_id  UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            blocked_user_id  UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            reason           TEXT,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (blocker_user_id, blocked_user_id),
            CHECK (blocker_user_id <> blocked_user_id)
        )
        """,

        # --------------------------------------------------------------
        # community.post_flags  (moderation queue)
        # --------------------------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS community.post_flags (
            flag_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            post_id          UUID REFERENCES community.posts(post_id) ON DELETE CASCADE,
            comment_id       UUID REFERENCES community.post_comments(comment_id) ON DELETE CASCADE,
            reporter_user_id UUID NOT NULL REFERENCES tenant.users(user_id),
            reason           TEXT NOT NULL,
            status           TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REVIEWED','ACTIONED','DISMISSED')),
            reviewed_by      UUID REFERENCES tenant.users(user_id),
            reviewed_at      TIMESTAMPTZ,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CHECK ((post_id IS NOT NULL) OR (comment_id IS NOT NULL))
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_flags_status ON community.post_flags(status, created_at DESC)",

        # --------------------------------------------------------------
        # Triggers: denormalised like_count and comment_count
        # --------------------------------------------------------------
        """
        CREATE OR REPLACE FUNCTION community._fn_post_likes_count() RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'INSERT' THEN
                UPDATE community.posts SET like_count = like_count + 1 WHERE post_id = NEW.post_id;
                RETURN NEW;
            ELSIF TG_OP = 'DELETE' THEN
                UPDATE community.posts SET like_count = GREATEST(like_count - 1, 0) WHERE post_id = OLD.post_id;
                RETURN OLD;
            END IF;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql
        """,
        "DROP TRIGGER IF EXISTS trg_post_likes_count ON community.post_likes",
        """
        CREATE TRIGGER trg_post_likes_count
        AFTER INSERT OR DELETE ON community.post_likes
        FOR EACH ROW EXECUTE FUNCTION community._fn_post_likes_count()
        """,

        """
        CREATE OR REPLACE FUNCTION community._fn_post_comments_count() RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'INSERT' THEN
                UPDATE community.posts SET comment_count = comment_count + 1 WHERE post_id = NEW.post_id;
                RETURN NEW;
            ELSIF TG_OP = 'UPDATE' THEN
                IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
                    UPDATE community.posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE post_id = NEW.post_id;
                ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
                    UPDATE community.posts SET comment_count = comment_count + 1 WHERE post_id = NEW.post_id;
                END IF;
                RETURN NEW;
            ELSIF TG_OP = 'DELETE' THEN
                IF OLD.deleted_at IS NULL THEN
                    UPDATE community.posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE post_id = OLD.post_id;
                END IF;
                RETURN OLD;
            END IF;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql
        """,
        "DROP TRIGGER IF EXISTS trg_post_comments_count ON community.post_comments",
        """
        CREATE TRIGGER trg_post_comments_count
        AFTER INSERT OR UPDATE OR DELETE ON community.post_comments
        FOR EACH ROW EXECUTE FUNCTION community._fn_post_comments_count()
        """,
    ])


def downgrade():
    _exec_each([
        "DROP TRIGGER IF EXISTS trg_post_comments_count ON community.post_comments",
        "DROP TRIGGER IF EXISTS trg_post_likes_count ON community.post_likes",
        "DROP FUNCTION IF EXISTS community._fn_post_comments_count()",
        "DROP FUNCTION IF EXISTS community._fn_post_likes_count()",
        "DROP TABLE IF EXISTS community.post_flags",
        "DROP TABLE IF EXISTS community.user_blocks",
        "DROP TABLE IF EXISTS community.follows",
        "DROP TABLE IF EXISTS community.post_comments",
        "DROP TABLE IF EXISTS community.post_likes",
        "DROP TABLE IF EXISTS community.posts",
        "DROP SCHEMA IF EXISTS community",
    ])
