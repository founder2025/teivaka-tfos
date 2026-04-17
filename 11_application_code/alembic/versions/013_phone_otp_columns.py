"""013 - Add phone OTP verification columns to tenant.users

Revision ID: 013_phone_otp
Revises: 012_farm_worker_limits
Create Date: 2026-04-14

Adds three nullable columns used by the phone OTP verification flow:
  * phone_otp_hash     — sha256 hex of the 6-digit code (raw never persisted)
  * phone_otp_expires  — TIMESTAMPTZ, 5-minute expiry window
  * phone_otp_attempts — INTEGER, counts wrong submissions (lock after 3)
"""
from alembic import op
import sqlalchemy as sa

revision = "013_phone_otp"
down_revision = "012_farm_worker_limits"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("phone_otp_hash", sa.String(64), nullable=True),
        schema="tenant",
    )
    op.add_column(
        "users",
        sa.Column("phone_otp_expires", sa.DateTime(timezone=True), nullable=True),
        schema="tenant",
    )
    op.add_column(
        "users",
        sa.Column(
            "phone_otp_attempts",
            sa.Integer(),
            server_default="0",
            nullable=True,
        ),
        schema="tenant",
    )


def downgrade():
    op.drop_column("users", "phone_otp_attempts", schema="tenant")
    op.drop_column("users", "phone_otp_expires", schema="tenant")
    op.drop_column("users", "phone_otp_hash", schema="tenant")
