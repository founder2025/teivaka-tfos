"""108 - Growth metrics: daily activity + platform counters

activity_days: one row per user per active day (frontend pings once per
session) — the honest DAU/WAU/MAU foundation, measured as real app opens.
metric_events: daily counters for anonymous signals (site visits, PWA
installs) — counts only, zero PII, Covenant-clean by construction.
"""
from alembic import op

revision = "108_growth_metrics"
down_revision = "107_admin_command"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS community.activity_days (
        user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        day     DATE NOT NULL DEFAULT CURRENT_DATE,
        PRIMARY KEY (user_id, day)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_activity_days_day ON community.activity_days(day)",
    """
    CREATE TABLE IF NOT EXISTS community.metric_events (
        kind  TEXT NOT NULL,
        day   DATE NOT NULL DEFAULT CURRENT_DATE,
        count INT NOT NULL DEFAULT 0,
        PRIMARY KEY (kind, day)
    )
    """,
    "GRANT SELECT, INSERT, UPDATE, DELETE ON community.activity_days, community.metric_events TO teivaka_app",
]


def upgrade():
    _exec_each(STATEMENTS)


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS community.metric_events",
        "DROP TABLE IF EXISTS community.activity_days",
    ])
