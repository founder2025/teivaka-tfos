"""102 - Classroom: saved lessons (the real Saved tab)

community.lesson_saves backs the sidebar's Saved view — a bookmark button on
every lesson, a real list to resume from. Replaces the stub copy card.
"""
from alembic import op

revision = "102_lesson_saves"
down_revision = "101_classroom_v2"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS community.lesson_saves (
        user_id    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        lesson_id  TEXT NOT NULL REFERENCES community.course_lessons(lesson_id) ON DELETE CASCADE,
        course_id  TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, lesson_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_lesson_saves_user ON community.lesson_saves(user_id, created_at DESC)",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON community.lesson_saves TO teivaka_app",
]


def upgrade():
    _exec_each(STATEMENTS)


def downgrade():
    _exec_each(["DROP TABLE IF EXISTS community.lesson_saves"])
