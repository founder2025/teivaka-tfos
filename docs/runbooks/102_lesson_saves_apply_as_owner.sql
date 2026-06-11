-- 102 lesson saves — apply-as-owner (Strike #123). Idempotent.
-- GENERATED from alembic/versions/102_lesson_saves.py STATEMENTS — keep in sync.

CREATE TABLE IF NOT EXISTS community.lesson_saves (
        user_id    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        lesson_id  TEXT NOT NULL REFERENCES community.course_lessons(lesson_id) ON DELETE CASCADE,
        course_id  TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, lesson_id)
    );
CREATE INDEX IF NOT EXISTS idx_lesson_saves_user ON community.lesson_saves(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON community.lesson_saves TO teivaka_app;

-- verify
SELECT (to_regclass('community.lesson_saves') IS NOT NULL)::int AS lesson_saves_1;
