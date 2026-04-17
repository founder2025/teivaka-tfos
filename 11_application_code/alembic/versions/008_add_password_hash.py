"""008 - Add password_hash column to tenant.users for custom JWT auth

Revision ID: 008_password_hash
Revises: 007_idempotency
Create Date: 2026-04-12

Context:
    TFOS uses custom HS256 JWT authentication (not Supabase).
    Passwords are hashed with bcrypt via passlib CryptContext.
    This migration adds the password_hash column that was missing from
    the initial tenant schema, and also aligns subscription_tier CHECK
    constraint to use PROFESSIONAL/ENTERPRISE (not PREMIUM/CUSTOM).
"""
from alembic import op

revision = '008_password_hash'
down_revision = '007_idempotency'
branch_labels = None
depends_on = None


def upgrade():
    # Add password_hash column to tenant.users
    # NOT NULL with empty string default so existing rows don't break.
    # All real users must have a non-empty hash set before login works.
    op.execute("""
        ALTER TABLE tenant.users
        ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT ''
    """)

    # Fix subscription_tier CHECK constraint to match codebase tier names.
    # Old constraint used PREMIUM/CUSTOM; codebase uses PROFESSIONAL/ENTERPRISE.
    op.execute("""
        ALTER TABLE tenant.tenants
        DROP CONSTRAINT IF EXISTS tenants_subscription_tier_check
    """)
    op.execute("""
        ALTER TABLE tenant.tenants
        ADD CONSTRAINT tenants_subscription_tier_check
        CHECK (subscription_tier IN ('FREE', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE'))
    """)

    # Index to support fast tenant lookup by email on login
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_users_email_active
        ON tenant.users(email)
        WHERE is_active = true
    """)


def downgrade():
    op.execute("DROP INDEX IF EXISTS tenant.idx_users_email_active")
    op.execute("""
        ALTER TABLE tenant.tenants
        DROP CONSTRAINT IF EXISTS tenants_subscription_tier_check
    """)
    op.execute("""
        ALTER TABLE tenant.tenants
        ADD CONSTRAINT tenants_subscription_tier_check
        CHECK (subscription_tier IN ('FREE', 'BASIC', 'PREMIUM', 'CUSTOM'))
    """)
    op.execute("ALTER TABLE tenant.users DROP COLUMN IF EXISTS password_hash")
