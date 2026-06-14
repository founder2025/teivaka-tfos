"""146 - Sponsored ads: audience-by-role targeting

Revision ID: 146_ad_role_targeting
Revises: 145_chat_reply_to
Create Date: 2026-06-14

Adds community.sponsor_placements.target_account_type — a general-category key
(PRIMARY_PRODUCER/COMMERCIAL_BUYER/...) so an advertiser can target who sees the
ad (Farmers, Buyers, Suppliers, …). NULL = everyone. Matched at serve time
against the viewer's primary category OR their 'I also do' tags (multi-role).

community.* is cross-tenant, no RLS. asyncpg: one statement per op.execute
(Strike #72).
"""
from alembic import op

revision = "146_ad_role_targeting"
down_revision = "145_chat_reply_to"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        "ALTER TABLE community.sponsor_placements ADD COLUMN IF NOT EXISTS target_account_type TEXT",
        "CREATE INDEX IF NOT EXISTS idx_sponsor_target_role ON community.sponsor_placements(target_account_type) WHERE target_account_type IS NOT NULL",
    ])


def downgrade():
    _exec_each([
        "ALTER TABLE community.sponsor_placements DROP COLUMN IF EXISTS target_account_type",
    ])
