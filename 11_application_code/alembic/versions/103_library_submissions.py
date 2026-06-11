"""103 - Classroom: featured courses + partner library submissions

courses.featured: admin-pinned courses sort first on the Classroom.
community.library_submissions: authors draft field guides; admin reviews;
APPROVED guides appear in the Library labeled as partner guides. shared.*
stays runtime-read-only (Inviolable #7) — the curated shared.kb_articles
core is untouched; partner guides live in the app-owned community schema.
"""
from alembic import op

revision = "103_library_submissions"
down_revision = "102_lesson_saves"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


STATEMENTS = [
    "ALTER TABLE community.courses ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false",
    """
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
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_library_submissions_status ON community.library_submissions(status, created_at)",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON community.library_submissions TO teivaka_app",
]


def upgrade():
    _exec_each(STATEMENTS)


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS community.library_submissions",
        "ALTER TABLE community.courses DROP COLUMN IF EXISTS featured",
    ])
