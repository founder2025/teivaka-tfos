"""109 - Platform settings: announcement banner (admin-set, renders site-wide)"""
from alembic import op

revision = "109_platform_settings"
down_revision = "108_growth_metrics"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS community.platform_settings (
        id             INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        banner_enabled BOOLEAN NOT NULL DEFAULT false,
        banner_text    TEXT NOT NULL DEFAULT '',
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by     UUID
    )
    """,
    "INSERT INTO community.platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON community.platform_settings TO teivaka_app",
]


def upgrade():
    _exec_each(STATEMENTS)


def downgrade():
    _exec_each(["DROP TABLE IF EXISTS community.platform_settings"])
