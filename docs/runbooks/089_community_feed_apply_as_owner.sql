-- 089 community_feed — apply-as-owner DDL (Strike #123)
-- Clean community.feed_* schema (no RLS; app-layer access like community.posts).
-- Run as owner, then stamp:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/089_community_feed_apply_as_owner.sql
--   docker exec teivaka_api alembic stamp 089_community_feed
--   docker exec teivaka_api alembic current   -- -> 089_community_feed (head)
-- Mirrors 11_application_code/alembic/versions/089_community_feed.py upgrade().

CREATE SCHEMA IF NOT EXISTS community;

CREATE TABLE IF NOT EXISTS community.feed_posts (
    post_id            TEXT PRIMARY KEY,
    tenant_id          UUID REFERENCES tenant.tenants(tenant_id),
    author_user_id     UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    author_profession  TEXT NOT NULL DEFAULT 'farmer',
    body               TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
    post_type          TEXT NOT NULL DEFAULT 'UPDATE' CHECK (post_type IN ('UPDATE','QUESTION','PHOTO','MILESTONE')),
    is_question        BOOLEAN NOT NULL DEFAULT FALSE,
    audience           TEXT NOT NULL DEFAULT 'everyone' CHECK (audience IN ('everyone','followers','farmer','buyer','banker','business','service_provider')),
    location           TEXT,
    vertical           TEXT,
    photos             TEXT[] NOT NULL DEFAULT '{}',
    mentions           TEXT[] NOT NULL DEFAULT '{}',
    link_audit_hash    TEXT,
    is_repost          BOOLEAN NOT NULL DEFAULT FALSE,
    repost_of_id       TEXT REFERENCES community.feed_posts(post_id) ON DELETE SET NULL,
    pinned             BOOLEAN NOT NULL DEFAULT FALSE,
    best_answer_reply_id TEXT,
    status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted','hidden')),
    audit_hash         TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at          TIMESTAMPTZ,
    deleted_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_feed_posts_created ON community.feed_posts(created_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_feed_posts_author ON community.feed_posts(author_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_posts_repost ON community.feed_posts(repost_of_id) WHERE is_repost = TRUE;

CREATE TABLE IF NOT EXISTS community.feed_likes (
    post_id     TEXT NOT NULL REFERENCES community.feed_posts(post_id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS community.feed_reactions (
    user_id      UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    target_type  TEXT NOT NULL CHECK (target_type IN ('post','reply')),
    target_id    TEXT NOT NULL,
    reaction     TEXT NOT NULL CHECK (reaction IN ('strong_crop','good_harvest','vinaka','hoping_rain','learning')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_feed_reactions_target ON community.feed_reactions(target_type, target_id);

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
);
CREATE INDEX IF NOT EXISTS idx_feed_replies_post ON community.feed_replies(post_id, created_at) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS community.feed_reply_likes (
    reply_id    TEXT NOT NULL REFERENCES community.feed_replies(reply_id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (reply_id, user_id)
);

CREATE TABLE IF NOT EXISTS community.feed_saves (
    post_id     TEXT NOT NULL REFERENCES community.feed_posts(post_id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS community.feed_shares (
    share_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id       TEXT NOT NULL REFERENCES community.feed_posts(post_id) ON DELETE CASCADE,
    from_user_id  UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    to_user_id    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    note          TEXT,
    seen_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feed_shares_to ON community.feed_shares(to_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS community.topic_follows (
    user_id     UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    topic       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, topic)
);

-- Runtime GRANTs — api connects as teivaka_app (B73).
GRANT USAGE ON SCHEMA community TO teivaka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_posts TO teivaka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_likes TO teivaka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_reactions TO teivaka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_replies TO teivaka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_reply_likes TO teivaka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_saves TO teivaka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_shares TO teivaka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.topic_follows TO teivaka_app;
