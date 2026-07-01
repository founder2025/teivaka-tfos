"""209 — community.marketplace_reviews + seller rating on user_trust (Marketplace M3)

Reputation you can't fake (Gate-7 locked): a review is only creatable by the BUYER
of a FULFILLED order, one per order — anchored to a real ORD-/ENQ- id, never
anonymous, never buyable. Aggregates (avg_rating / review_count) live on the
existing community.user_trust cache so the ★ rating rides the same join already
wired into listings / directory / feed (no new N+1).

Cross-tenant community.* (no RLS). Apply as owner (Strike #123);
one statement per op.execute (Strike #72); reversible.
"""
from alembic import op

revision = "209_marketplace_reviews"
down_revision = "208_marketplace_orders_ledger"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS community.marketplace_reviews (
            review_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            order_id         TEXT NOT NULL UNIQUE,
            listing_id       TEXT,
            seller_user_id   UUID NOT NULL,
            reviewer_user_id UUID NOT NULL,
            rating           INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
            comment          TEXT,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_mkt_reviews_seller ON community.marketplace_reviews (seller_user_id, created_at DESC)")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON community.marketplace_reviews TO teivaka_app")
    op.execute("ALTER TABLE community.user_trust "
               "ADD COLUMN IF NOT EXISTS avg_rating NUMERIC, "
               "ADD COLUMN IF NOT EXISTS review_count INTEGER NOT NULL DEFAULT 0")


def downgrade():
    op.execute("ALTER TABLE community.user_trust DROP COLUMN IF EXISTS review_count, DROP COLUMN IF EXISTS avg_rating")
    op.execute("DROP TABLE IF EXISTS community.marketplace_reviews")
