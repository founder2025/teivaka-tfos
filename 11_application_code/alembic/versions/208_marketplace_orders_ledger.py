"""208 — community.marketplace_orders: cross-tenant order/enquiry ledger (Marketplace M2)

Orders today live only in the SELLER's tenant CRM (tenant.orders, RLS-scoped), so
the BUYER can't see them and there's no shared status. This adds a community-owned
ledger (no RLS, cross-tenant — same pattern as feed/suspensions/trust) that both
parties read for the loop: Requested → Accepted → Done (+ Cancelled/Disputed).
Produce/Inputs orders (which auto-confirm + decrement stock) land as ACCEPTED;
Livestock/Tools/WANTED enquiries land as REQUESTED (intent, no stock hold).

Cross-tenant community.* (no RLS). Apply as owner (Strike #123);
one statement per op.execute (Strike #72); reversible.
"""
from alembic import op

revision = "208_marketplace_orders_ledger"
down_revision = "207_user_trust_cache"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS community.marketplace_orders (
            order_id        TEXT PRIMARY KEY,
            listing_id      TEXT,
            buyer_user_id   UUID NOT NULL,
            seller_user_id  UUID NOT NULL,
            buyer_name      TEXT,
            listing_title   TEXT,
            category        TEXT,
            quantity        NUMERIC,
            unit            TEXT,
            total_fjd       NUMERIC,
            status          TEXT NOT NULL DEFAULT 'REQUESTED'
                              CHECK (status IN ('REQUESTED','ACCEPTED','DONE','CANCELLED','DISPUTED')),
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_mkt_orders_buyer  ON community.marketplace_orders (buyer_user_id, created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_mkt_orders_seller ON community.marketplace_orders (seller_user_id, created_at DESC)")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON community.marketplace_orders TO teivaka_app")


def downgrade():
    op.execute("DROP TABLE IF EXISTS community.marketplace_orders")
