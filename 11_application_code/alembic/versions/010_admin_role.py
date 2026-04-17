"""010 - Add ADMIN role to tenant.users + admin route protection

Revision ID: 010_admin_role
Revises: 009_enhanced_registration
Create Date: 2026-04-12

Changes:
    tenant.users.role CHECK constraint:
        BEFORE: ('FOUNDER','MANAGER','WORKER','VIEWER','FARMER')
        AFTER:  ('FOUNDER','MANAGER','WORKER','VIEWER','FARMER','ADMIN')

    Admin accounts are NEVER self-registered.
    They are inserted directly into the DB by the platform operator.
    The registration endpoint explicitly rejects account_type=ADMIN.
"""
from alembic import op

revision = '010_admin_role'
down_revision = '009_enhanced_registration'
branch_labels = None
depends_on = None


def upgrade():
    # Drop existing role check constraint and replace with one that includes ADMIN
    op.execute("""
        ALTER TABLE tenant.users
        DROP CONSTRAINT IF EXISTS users_role_check
    """)
    op.execute("""
        ALTER TABLE tenant.users
        ADD CONSTRAINT users_role_check
        CHECK (role IN ('FOUNDER','MANAGER','WORKER','VIEWER','FARMER','ADMIN'))
    """)

    # Index to support fast admin user lookup (admin queries across all tenants)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_users_admin_role
        ON tenant.users(role)
        WHERE role = 'ADMIN'
    """)


def downgrade():
    op.execute("DROP INDEX IF EXISTS tenant.idx_users_admin_role")
    op.execute("""
        ALTER TABLE tenant.users
        DROP CONSTRAINT IF EXISTS users_role_check
    """)
    op.execute("""
        ALTER TABLE tenant.users
        ADD CONSTRAINT users_role_check
        CHECK (role IN ('FOUNDER','MANAGER','WORKER','VIEWER','FARMER'))
    """)
