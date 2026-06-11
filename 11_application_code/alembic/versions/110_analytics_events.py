"""110 - Analytics event spine (Intelligence Engine Phase I1)

analytics.events: high-volume, append-only behavioural telemetry — SEPARATE
from audit.events (which stays the sacred, hash-chained Bank-Evidence record).
Nothing here is chained; this is the firehose every dashboard/model queries.

PRIVACY BY CONSTRUCTION: the track() helper whitelists props per event_type
and NEVER writes post bodies, message text, or personal fields. Data
minimization is enforced in code, not policy.
"""
from alembic import op

revision = "110_analytics_events"
down_revision = "109_platform_settings"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


STATEMENTS = [
    "CREATE SCHEMA IF NOT EXISTS analytics",
    "GRANT USAGE ON SCHEMA analytics TO teivaka_app",
    """
    CREATE TABLE IF NOT EXISTS analytics.events (
        event_id      BIGSERIAL PRIMARY KEY,
        ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
        actor_user_id UUID,
        tenant_id     UUID,
        region        TEXT,                 -- free-text island today; geo_regions FK in I4
        pillar        TEXT NOT NULL,        -- home|classroom|tis|farm|market|admin|auth
        event_type    TEXT NOT NULL,        -- 'post_created','tis_query',...
        entity_type   TEXT,
        entity_id     TEXT,
        props         JSONB NOT NULL DEFAULT '{}'::jsonb,
        session_id    TEXT
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_analytics_events_ts ON analytics.events(ts DESC)",
    "CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics.events(pillar, event_type, ts DESC)",
    "CREATE INDEX IF NOT EXISTS idx_analytics_events_actor ON analytics.events(actor_user_id, ts DESC)",
    "GRANT SELECT, INSERT ON analytics.events TO teivaka_app",
    "GRANT USAGE, SELECT ON SEQUENCE analytics.events_event_id_seq TO teivaka_app",
]


def upgrade():
    _exec_each(STATEMENTS)


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS analytics.events",
        "DROP SCHEMA IF EXISTS analytics",
    ])
