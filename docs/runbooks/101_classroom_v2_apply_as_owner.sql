-- 101 classroom v2 — apply-as-owner (Strike #123). Idempotent.
-- GENERATED from alembic/versions/101_classroom_v2.py STATEMENTS — keep in sync.

ALTER TABLE community.courses ADD COLUMN IF NOT EXISTS pricing TEXT NOT NULL DEFAULT 'FREE' CHECK (pricing IN ('FREE','SUBSCRIPTION','ONE_TIME'));
ALTER TABLE community.courses ADD COLUMN IF NOT EXISTS price_fjd NUMERIC(8,2);
ALTER TABLE community.courses ADD COLUMN IF NOT EXISTS required_tier TEXT NOT NULL DEFAULT 'BASIC';
CREATE TABLE IF NOT EXISTS community.author_requests (
        request_id  TEXT PRIMARY KEY,
        user_id     UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        expertise   TEXT NOT NULL,
        credentials TEXT NOT NULL DEFAULT '',
        topics      TEXT NOT NULL DEFAULT '',
        evidence    JSONB NOT NULL DEFAULT '[]'::jsonb,
        status      TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
        reason      TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        decided_at  TIMESTAMPTZ,
        decided_by  UUID
    );
CREATE TABLE IF NOT EXISTS community.course_entitlements (
        user_id    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        course_id  TEXT NOT NULL REFERENCES community.courses(course_id) ON DELETE CASCADE,
        source     TEXT NOT NULL DEFAULT 'ADMIN_GRANT',
        granted_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, course_id)
    );
CREATE TABLE IF NOT EXISTS community.course_ratings (
        user_id    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        course_id  TEXT NOT NULL REFERENCES community.courses(course_id) ON DELETE CASCADE,
        stars      INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
        review     TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, course_id)
    );
CREATE TABLE IF NOT EXISTS community.classroom_settings (
        id                   INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        applications_open    BOOLEAN NOT NULL DEFAULT true,
        monetization_enabled BOOLEAN NOT NULL DEFAULT true,
        payment_instructions TEXT NOT NULL DEFAULT 'To unlock this masterclass, pay via M-PAiSA to Teivaka PTE LTD and message us your receipt — access is granted within 24 hours.'
    );
INSERT INTO community.classroom_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_author_requests_status ON community.author_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_course_ratings_course ON community.course_ratings(course_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON community.author_requests, community.course_entitlements, community.course_ratings, community.classroom_settings TO teivaka_app;

-- verify
SELECT (to_regclass('community.author_requests') IS NOT NULL)::int + (to_regclass('community.course_entitlements') IS NOT NULL)::int + (to_regclass('community.course_ratings') IS NOT NULL)::int + (to_regclass('community.classroom_settings') IS NOT NULL)::int + (SELECT count(*) FROM information_schema.columns WHERE table_schema='community' AND table_name='courses' AND column_name IN ('pricing','price_fjd','required_tier'))::int AS classroom_v2_objects_7;
