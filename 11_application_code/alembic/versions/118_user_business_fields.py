"""118 - denormalize business_name + operator_name onto tenant.users

tenant.business_entities is FORCE-RLS (not cross-tenant readable), so a public
profile can't read another tenant's business row. Mirror the two display fields
onto tenant.users (the cross-tenant profile source) so Company accounts show their
trading name + authorized operator on their PUBLIC profile too. is_company already
exists (migration 116). Backfill runs apply-as-owner (bypasses RLS).
"""
from alembic import op

revision = "118_user_business_fields"
down_revision = "117_verify_channel"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS business_name TEXT")
    op.execute("ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS operator_name TEXT")
    op.execute("""
        UPDATE tenant.users u
           SET business_name = be.business_name,
               operator_name = be.operator_name
          FROM tenant.business_entities be
         WHERE be.user_id = u.user_id AND u.business_name IS NULL
    """)


def downgrade():
    op.execute("ALTER TABLE tenant.users DROP COLUMN IF EXISTS operator_name")
    op.execute("ALTER TABLE tenant.users DROP COLUMN IF EXISTS business_name")
