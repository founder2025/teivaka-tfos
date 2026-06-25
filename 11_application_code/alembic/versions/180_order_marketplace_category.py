"""180 — carry the marketplace category on the order

The order PAID path hardcoded category='PRODUCE' when accruing the platform fee,
so every marketplace sale was charged at the produce rate regardless of what was
sold. Add tenant.orders.marketplace_category so an INPUTS sale accrues at the
INPUTS rate (and the produce rate stays correct for produce).

Additive/idempotent; reversible. Apply as owner (Strike #123).

Revision ID: 180_order_marketplace_category
Revises: 179_customer_buyer_user_id
"""
from alembic import op
import sqlalchemy as sa

revision = "180_order_marketplace_category"
down_revision = "179_customer_buyer_user_id"
branch_labels = None
depends_on = None


def upgrade():
    op.get_bind().execute(sa.text(
        "ALTER TABLE tenant.orders ADD COLUMN IF NOT EXISTS marketplace_category TEXT"))


def downgrade():
    op.get_bind().execute(sa.text(
        "ALTER TABLE tenant.orders DROP COLUMN IF EXISTS marketplace_category"))
