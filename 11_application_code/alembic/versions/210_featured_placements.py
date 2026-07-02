"""210 — community.featured_placements (WH4 — Boost your listing)

A member with earned trust can FEATURE one of their own postings (a job listing or a
service job) for a fixed window; featured items sort to the top of the relevant
"available" list, clearly labelled. No payment is faked — boost is trust-gated + capped
at alpha (paid boost rides this same table once the payment rail lands). Polymorphic
(target_type/target_id) so Marketplace listings can plug in later.

Cross-tenant community.* (no RLS). Apply as owner (Strike #123);
one statement per op.execute (Strike #72); reversible.
"""
from alembic import op

revision = "210_featured_placements"
down_revision = "209_marketplace_reviews"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS community.featured_placements (
            placement_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            target_type    TEXT NOT NULL,   -- 'JOB_LISTING' | 'SERVICE_JOB'
            target_id      TEXT NOT NULL,
            user_id        UUID NOT NULL,
            featured_until TIMESTAMPTZ NOT NULL,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (target_type, target_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_featured_user ON community.featured_placements (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_featured_lookup ON community.featured_placements (target_type, target_id, featured_until)")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON community.featured_placements TO teivaka_app")


def downgrade():
    op.execute("DROP TABLE IF EXISTS community.featured_placements")
