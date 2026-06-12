"""116 - business_entities + Individual/Company onboarding fields

Adds the Master-Child backing for the multi-sided gateway (decision: keep the
12-tier account_type column from 115, ADD a business_entities child table for
Company/Agribusiness Entity accounts):

  - tenant.users.is_company  (BOOLEAN) — account-type switcher: Individual vs Company
  - tenant.users.region_id   (FK shared.geo_regions) — home/HQ region for the cascade
  - tenant.business_entities — one row per Company account (business name + the human
    authorized operator + the entity's ecosystem account_type + region), per-tenant RLS.

business_entities carries FORCE RLS like every sibling tenant.* table; the register
path sets app.tenant_id before inserting so the WITH CHECK passes.
"""
from alembic import op

revision = "116_business_entities"
down_revision = "115_account_type_taxonomy"
branch_labels = None
depends_on = None


def upgrade():
    # Account-type switcher + home/HQ region on the user.
    op.execute("ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS is_company BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS region_id TEXT REFERENCES shared.geo_regions(region_id)")

    # Child table for Company / Agribusiness Entity accounts.
    op.execute("""
        CREATE TABLE IF NOT EXISTS tenant.business_entities (
            entity_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id     UUID NOT NULL,
            user_id       UUID,
            business_name TEXT NOT NULL,
            operator_name TEXT,
            account_type  TEXT NOT NULL,
            region_id     TEXT REFERENCES shared.geo_regions(region_id),
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_business_entities_tenant ON tenant.business_entities (tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_business_entities_user ON tenant.business_entities (user_id)")

    # RLS — canonical app.tenant_id policy, mirror sibling tenant.* tables.
    op.execute("ALTER TABLE tenant.business_entities ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tenant.business_entities FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY business_entities_tenant_isolation
            ON tenant.business_entities
            USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    """)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
                GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.business_entities TO teivaka_app;
            END IF;
        END $$
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS tenant.business_entities")
    op.execute("ALTER TABLE tenant.users DROP COLUMN IF EXISTS region_id")
    op.execute("ALTER TABLE tenant.users DROP COLUMN IF EXISTS is_company")
