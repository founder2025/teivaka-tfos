"""101 - Classroom v2: author requests, entitlements, ratings, settings

Operator-ratified 2026-06-11: builder visible only to Admin + approved
authors ("Teach on Teivaka" request flow, KYC-gated); free courses + paid
masterclasses via course_entitlements (payment-rail-agnostic — admin grant
today, Stripe/M-PAiSA plug in later with no schema change); ratings gated
behind real progress; single-row classroom_settings for admin controls.
"""
from alembic import op

revision = "101_classroom_v2"
down_revision = "100_classroom"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


STATEMENTS = [
    "ALTER TABLE community.courses ADD COLUMN IF NOT EXISTS pricing TEXT NOT NULL DEFAULT 'FREE' CHECK (pricing IN ('FREE','SUBSCRIPTION','ONE_TIME'))",
    "ALTER TABLE community.courses ADD COLUMN IF NOT EXISTS price_fjd NUMERIC(8,2)",
    "ALTER TABLE community.courses ADD COLUMN IF NOT EXISTS required_tier TEXT NOT NULL DEFAULT 'BASIC'",
    """
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
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS community.course_entitlements (
        user_id    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        course_id  TEXT NOT NULL REFERENCES community.courses(course_id) ON DELETE CASCADE,
        source     TEXT NOT NULL DEFAULT 'ADMIN_GRANT',
        granted_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, course_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS community.course_ratings (
        user_id    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        course_id  TEXT NOT NULL REFERENCES community.courses(course_id) ON DELETE CASCADE,
        stars      INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
        review     TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, course_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS community.classroom_settings (
        id                   INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        applications_open    BOOLEAN NOT NULL DEFAULT true,
        monetization_enabled BOOLEAN NOT NULL DEFAULT true,
        payment_instructions TEXT NOT NULL DEFAULT 'To unlock this masterclass, pay via M-PAiSA to Teivaka PTE LTD and message us your receipt — access is granted within 24 hours.'
    )
    """,
    "INSERT INTO community.classroom_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING",
    "CREATE INDEX IF NOT EXISTS idx_author_requests_status ON community.author_requests(status, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_course_ratings_course ON community.course_ratings(course_id)",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON community.author_requests, community.course_entitlements, community.course_ratings, community.classroom_settings TO teivaka_app",
]


def upgrade():
    _exec_each(STATEMENTS)


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS community.classroom_settings",
        "DROP TABLE IF EXISTS community.course_ratings",
        "DROP TABLE IF EXISTS community.course_entitlements",
        "DROP TABLE IF EXISTS community.author_requests",
        "ALTER TABLE community.courses DROP COLUMN IF EXISTS required_tier",
        "ALTER TABLE community.courses DROP COLUMN IF EXISTS price_fjd",
        "ALTER TABLE community.courses DROP COLUMN IF EXISTS pricing",
    ])
