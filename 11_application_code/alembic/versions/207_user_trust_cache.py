"""207 — community.user_trust: denormalized trust-level cache (Trust Ladder Slice 2)

Slice 1 computes trust live on a single profile view. To show the trust badge cheaply
on high-volume surfaces (listings / directory / feed authors) without an N+1 compute,
we denormalize the level into a community-owned cache (no RLS, cross-tenant) refreshed
by the recompute_trust_levels beat task — the same pattern as feed rank_score.

Deliberately NOT a tenant.users column (that is an RLS-scoped identity table); the
cache is a community fact keyed by user_id, joined at read time.

Cross-tenant community.* (no RLS). Apply as owner (Strike #123);
one statement per op.execute (Strike #72); reversible.
"""
from alembic import op

revision = "207_user_trust_cache"
down_revision = "206_user_suspensions"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS community.user_trust (
            user_id          UUID PRIMARY KEY,
            level            TEXT NOT NULL DEFAULT 'NEW',
            score            INTEGER NOT NULL DEFAULT 0,
            kyc              BOOLEAN NOT NULL DEFAULT FALSE,
            verified_records INTEGER NOT NULL DEFAULT 0,
            computed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON community.user_trust TO teivaka_app")


def downgrade():
    op.execute("DROP TABLE IF EXISTS community.user_trust")
