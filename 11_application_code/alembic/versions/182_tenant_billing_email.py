"""182 — per-account billing email override

Invoices currently email the account's owner/founder user. Add an explicit
tenant.tenants.billing_email so an account can nominate a dedicated billing
inbox (e.g. accounts@…) without changing the owner login. Falls back to the
owner-user email when unset.

Additive/idempotent; reversible. Apply as owner (Strike #123).

Revision ID: 182_tenant_billing_email
Revises: 181_platform_invoices
"""
from alembic import op
import sqlalchemy as sa

revision = "182_tenant_billing_email"
down_revision = "181_platform_invoices"
branch_labels = None
depends_on = None


def upgrade():
    op.get_bind().execute(sa.text(
        "ALTER TABLE tenant.tenants ADD COLUMN IF NOT EXISTS billing_email TEXT"))


def downgrade():
    op.get_bind().execute(sa.text(
        "ALTER TABLE tenant.tenants DROP COLUMN IF EXISTS billing_email"))
