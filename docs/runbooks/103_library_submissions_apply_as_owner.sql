-- 103 library submissions + featured — apply-as-owner (Strike #123). Idempotent.
-- GENERATED from alembic/versions/103_library_submissions.py STATEMENTS — keep in sync.

ALTER TABLE community.courses ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS community.library_submissions (
        submission_id  TEXT PRIMARY KEY,
        author_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        title          TEXT NOT NULL,
        category       TEXT NOT NULL DEFAULT 'GENERAL',
        summary        TEXT NOT NULL DEFAULT '',
        content_md     TEXT NOT NULL,
        status         TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
        reason         TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        decided_at     TIMESTAMPTZ,
        decided_by     UUID
    );
CREATE INDEX IF NOT EXISTS idx_library_submissions_status ON community.library_submissions(status, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON community.library_submissions TO teivaka_app;

-- verify
SELECT (to_regclass('community.library_submissions') IS NOT NULL)::int + (SELECT count(*) FROM information_schema.columns WHERE table_schema='community' AND table_name='courses' AND column_name='featured')::int AS objects_2;
