"""098 - Marketplace v2: categories, sold state, saves, record-link

Listings serve every profession: category (PRODUCE / INPUTS / TOOLS /
LIVESTOCK / SERVICES / WANTED), sold_at lifecycle, optional link to a
verifiable audit record, and per-user saved listings. Tier paywall on posting
is dropped in code (Operator-approved: open marketplace; verified email still
gates posting). Apply-as-owner (Strike #123); one statement per op.execute.
"""
from alembic import op

revision = "098_marketplace_v2"
down_revision = "097_kyc_verification"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        "ALTER TABLE community.listings ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'PRODUCE'",
        "ALTER TABLE community.listings ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ",
        "ALTER TABLE community.listings ADD COLUMN IF NOT EXISTS link_audit_hash TEXT",
        """
        CREATE TABLE IF NOT EXISTS community.listing_saves (
            user_id    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            listing_id TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, listing_id)
        )
        """,
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.listing_saves TO teivaka_app",
    ])


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS community.listing_saves",
        "ALTER TABLE community.listings DROP COLUMN IF EXISTS link_audit_hash",
        "ALTER TABLE community.listings DROP COLUMN IF EXISTS sold_at",
        "ALTER TABLE community.listings DROP COLUMN IF EXISTS category",
    ])
