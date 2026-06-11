"""107 - Admin Command Center: intelligence snapshots + feature flags

intel_snapshots: pre-computed intelligence per Inviolable #3's spirit —
admin dashboards read cached snapshots (refreshed on demand / cron), never
hammering live aggregation. feature_flags: per-pillar kill switches with an
audit trail of who flipped what.
"""
from alembic import op

revision = "107_admin_command"
down_revision = "106_team_affiliate"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS community.intel_snapshots (
        kind        TEXT PRIMARY KEY,
        payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
        computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS community.feature_flags (
        flag       TEXT PRIMARY KEY,
        enabled    BOOLEAN NOT NULL DEFAULT true,
        note       TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by UUID
    )
    """,
    """
    INSERT INTO community.feature_flags (flag, note) VALUES
        ('home_feed',   'Home pillar: Feed, Stories, Following'),
        ('marketplace', 'Home pillar: Marketplace + Market prices'),
        ('groups',      'Home pillar: Groups'),
        ('classroom',   'Classroom pillar (learner + builder)'),
        ('tis',         'TIS chat (in-app)')
    ON CONFLICT (flag) DO NOTHING
    """,
    "GRANT SELECT, INSERT, UPDATE, DELETE ON community.intel_snapshots, community.feature_flags TO teivaka_app",
]


def upgrade():
    _exec_each(STATEMENTS)


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS community.feature_flags",
        "DROP TABLE IF EXISTS community.intel_snapshots",
    ])
