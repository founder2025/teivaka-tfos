"""179 — link marketplace customers to the buyer's platform user

Marketplace auto-orders matched the buyer to a seller's customer row by display
name, which can merge two buyers sharing a company name. Add a stable
buyer_user_id link so repeat orders from the same buyer reuse the right customer
and never collide on name.

Additive/idempotent; reversible. Apply as owner (Strike #123).

Revision ID: 179_customer_buyer_user_id
Revises: 178_service_jobs
"""
from alembic import op
import sqlalchemy as sa

revision = "179_customer_buyer_user_id"
down_revision = "178_service_jobs"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE tenant.customers ADD COLUMN IF NOT EXISTS buyer_user_id UUID"))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_customers_buyer_user "
        "ON tenant.customers (tenant_id, buyer_user_id)"))


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DROP INDEX IF EXISTS tenant.ix_customers_buyer_user"))
    conn.execute(sa.text("ALTER TABLE tenant.customers DROP COLUMN IF EXISTS buyer_user_id"))
