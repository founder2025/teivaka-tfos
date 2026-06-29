"""201 — community.feed_signals (Feed v2 Slice 1: ranking/flywheel foundation)

Append-only engagement log (impressions/clicks/dwell/hide/open) that fuels relevance
ranking, outcome models, and the data moat. Cross-tenant community.* (no RLS), like the
rest of the feed. Purely additive — new table + grant; touches nothing existing. The
denormalized engagement COUNTERS are a separate slice (1b) because they mutate the hot
feed_posts table.

Apply as owner (Strike #123); one statement per op.execute (Strike #72); reversible.
"""
from alembic import op

revision = "201_feed_signals"
down_revision = "200_marketplace_match_audit"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS community.feed_signals (
            signal_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id     UUID NOT NULL,
            post_id     TEXT NOT NULL,
            signal_type TEXT NOT NULL
                          CHECK (signal_type IN ('IMPRESSION','CLICK','DWELL','HIDE','OPEN')),
            value       INTEGER,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_feed_signals_post ON community.feed_signals (post_id, signal_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_feed_signals_user ON community.feed_signals (user_id, created_at DESC)")
    op.execute("GRANT SELECT, INSERT ON community.feed_signals TO teivaka_app")


def downgrade():
    op.execute("DROP TABLE IF EXISTS community.feed_signals")
