"""087 nursery batches — tenant.nursery_batches (propagation register)

The nursery router (list/get/create + transplant-block suggestion + transplant
task) has shipped against tenant.nursery_batches, but the table was never
defined in schema or migrations — it does not exist in prod, so every nursery
call 500'd silently (the read-only NurseryRegister swallowed the error as
"honest empty", masking it). This creates the table to match the router's
INSERT/SELECT exactly, so the Production › nursery surface works end-to-end.

Columns mirror NurseryBatchCreate (POST /api/v1/nursery) plus batch_status
(SOWN→GERMINATING→READY→TRANSPLANTED, read by NurseryRegister) and the standard
tenant.* audit columns. Per-tenant FORCE RLS, canonical app.tenant_id policy,
mirroring sibling tenant.* tables.

revision: 087_nursery_batches
down_revision: 086_task_notifications
"""
from alembic import op

revision = "087_nursery_batches"
down_revision = "086_task_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS tenant.nursery_batches (
            batch_id                 TEXT PRIMARY KEY,
            tenant_id                UUID NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
            farm_id                  TEXT NOT NULL REFERENCES tenant.farms(farm_id),
            production_id            TEXT NOT NULL REFERENCES shared.productions(production_id),
            batch_code               TEXT,
            variety                  TEXT,
            seed_source              TEXT,
            sowing_date              TIMESTAMPTZ NOT NULL,
            germination_medium       TEXT,
            tray_count               INTEGER,
            seeds_per_tray           INTEGER,
            total_seeds_sown         INTEGER NOT NULL,
            germination_rate_pct     NUMERIC(5,2),
            seedlings_ready          INTEGER,
            expected_transplant_date TIMESTAMPTZ,
            actual_transplant_date   TIMESTAMPTZ,
            seed_cost_fjd            NUMERIC(10,2),
            other_cost_fjd           NUMERIC(10,2),
            notes                    TEXT,
            batch_status             TEXT NOT NULL DEFAULT 'SOWN'
                                       CHECK (batch_status IN ('SOWN','GERMINATING','READY','TRANSPLANTED')),
            created_by               UUID REFERENCES tenant.users(user_id),
            created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_nursery_batches_farm
            ON tenant.nursery_batches (tenant_id, farm_id, sowing_date DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_nursery_batches_production
            ON tenant.nursery_batches (tenant_id, production_id)
    """)

    # RLS — canonical app.tenant_id policy, mirror sibling tenant.* tables.
    op.execute("ALTER TABLE tenant.nursery_batches ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tenant.nursery_batches FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY nursery_batches_tenant_isolation
            ON tenant.nursery_batches
            USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    """)

    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
                GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.nursery_batches TO teivaka_app;
            END IF;
        END $$
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tenant.nursery_batches")
