"""011 - Add password reset columns to tenant.users

Revision ID: 011_password_reset
Revises: 010_admin_role
Create Date: 2026-04-13

Adds three nullable columns used by the forgot-password flow:
  * password_reset_token_hash (sha256 hex of the raw token — never stores raw)
  * password_reset_expires     (TIMESTAMPTZ — 1-hour expiry window)
  * password_reset_requested_at (TIMESTAMPTZ — audit trail)
"""
from alembic import op
import sqlalchemy as sa

revision = "011_password_reset"
down_revision = "010_admin_role"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("password_reset_token_hash", sa.String(128), nullable=True),
        schema="tenant",
    )
    op.add_column(
        "users",
        sa.Column("password_reset_expires", sa.DateTime(timezone=True), nullable=True),
        schema="tenant",
    )
    op.add_column(
        "users",
        sa.Column("password_reset_requested_at", sa.DateTime(timezone=True), nullable=True),
        schema="tenant",
    )


def downgrade():
    op.drop_column("users", "password_reset_requested_at", schema="tenant")
    op.drop_column("users", "password_reset_expires", schema="tenant")
    op.drop_column("users", "password_reset_token_hash", schema="tenant")
