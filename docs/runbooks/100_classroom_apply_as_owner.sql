-- 100 classroom — apply-as-owner (Strike #123). Idempotent.
-- GENERATED from alembic/versions/100_classroom.py STATEMENTS — keep in sync.

CREATE TABLE IF NOT EXISTS community.courses (
        course_id           TEXT PRIMARY KEY,
        title               TEXT NOT NULL,
        description         TEXT NOT NULL DEFAULT '',
        cover_url           TEXT,
        level               TEXT NOT NULL DEFAULT 'BEGINNER',
        language            TEXT NOT NULL DEFAULT 'en',
        status              TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED')),
        attribution         TEXT NOT NULL DEFAULT '',
        verification_status TEXT NOT NULL DEFAULT 'PARTNER_REVIEWED',
        author_user_id      UUID NOT NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
CREATE TABLE IF NOT EXISTS community.course_modules (
        module_id     TEXT PRIMARY KEY,
        course_id     TEXT NOT NULL REFERENCES community.courses(course_id) ON DELETE CASCADE,
        title         TEXT NOT NULL,
        position      INT NOT NULL DEFAULT 0,
        quiz_pass_pct INT
    );
CREATE TABLE IF NOT EXISTS community.course_lessons (
        lesson_id   TEXT PRIMARY KEY,
        module_id   TEXT NOT NULL REFERENCES community.course_modules(module_id) ON DELETE CASCADE,
        course_id   TEXT NOT NULL REFERENCES community.courses(course_id) ON DELETE CASCADE,
        title       TEXT NOT NULL DEFAULT 'New lesson',
        video_kind  TEXT,
        video_url   TEXT,
        body_html   TEXT NOT NULL DEFAULT '',
        transcript  TEXT NOT NULL DEFAULT '',
        resources   JSONB NOT NULL DEFAULT '[]'::jsonb,
        action_step TEXT NOT NULL DEFAULT '',
        status      TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED')),
        drip        BOOLEAN NOT NULL DEFAULT false,
        position    INT NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
CREATE TABLE IF NOT EXISTS community.quiz_questions (
        question_id   TEXT PRIMARY KEY,
        module_id     TEXT NOT NULL REFERENCES community.course_modules(module_id) ON DELETE CASCADE,
        course_id     TEXT NOT NULL,
        question      TEXT NOT NULL,
        options       JSONB NOT NULL,
        correct_index INT NOT NULL,
        position      INT NOT NULL DEFAULT 0
    );
CREATE TABLE IF NOT EXISTS community.lesson_progress (
        user_id      UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        lesson_id    TEXT NOT NULL REFERENCES community.course_lessons(lesson_id) ON DELETE CASCADE,
        course_id    TEXT NOT NULL,
        completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, lesson_id)
    );
CREATE TABLE IF NOT EXISTS community.quiz_attempts (
        attempt_id TEXT PRIMARY KEY,
        user_id    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        module_id  TEXT NOT NULL REFERENCES community.course_modules(module_id) ON DELETE CASCADE,
        course_id  TEXT NOT NULL,
        score_pct  INT NOT NULL,
        passed     BOOLEAN NOT NULL,
        answers    JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
CREATE TABLE IF NOT EXISTS community.course_certificates (
        cert_id      TEXT PRIMARY KEY,
        user_id      UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        course_id    TEXT NOT NULL REFERENCES community.courses(course_id) ON DELETE CASCADE,
        course_title TEXT NOT NULL,
        learner_name TEXT NOT NULL,
        audit_hash   TEXT,
        issued_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, course_id)
    );
CREATE INDEX IF NOT EXISTS idx_course_modules_course ON community.course_modules(course_id, position);
CREATE INDEX IF NOT EXISTS idx_course_lessons_module ON community.course_lessons(module_id, position);
CREATE INDEX IF NOT EXISTS idx_course_lessons_course ON community.course_lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_course ON community.lesson_progress(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON community.quiz_attempts(user_id, module_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON community.courses, community.course_modules, community.course_lessons, community.quiz_questions, community.lesson_progress, community.quiz_attempts, community.course_certificates TO teivaka_app;
ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS course_author BOOLEAN NOT NULL DEFAULT false;

-- verify
SELECT (to_regclass('community.courses') IS NOT NULL)::int + (to_regclass('community.course_modules') IS NOT NULL)::int + (to_regclass('community.course_lessons') IS NOT NULL)::int + (to_regclass('community.quiz_questions') IS NOT NULL)::int + (to_regclass('community.lesson_progress') IS NOT NULL)::int + (to_regclass('community.quiz_attempts') IS NOT NULL)::int + (to_regclass('community.course_certificates') IS NOT NULL)::int + (SELECT count(*) FROM information_schema.columns WHERE table_schema='tenant' AND table_name='users' AND column_name='course_author')::int AS classroom_objects_8;
