-- 087 nursery_batches — apply-as-owner DDL (Strike #123)
-- Run as the owner role, then alembic stamp:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/087_nursery_batches_apply_as_owner.sql
--   docker exec teivaka_api alembic stamp 087_nursery_batches
--   docker exec teivaka_api alembic current   -- -> 087_nursery_batches (head)
-- Mirrors 11_application_code/alembic/versions/087_nursery_batches.py upgrade().

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
);

CREATE INDEX IF NOT EXISTS ix_nursery_batches_farm
    ON tenant.nursery_batches (tenant_id, farm_id, sowing_date DESC);
CREATE INDEX IF NOT EXISTS ix_nursery_batches_production
    ON tenant.nursery_batches (tenant_id, production_id);

ALTER TABLE tenant.nursery_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.nursery_batches FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nursery_batches_tenant_isolation ON tenant.nursery_batches;
CREATE POLICY nursery_batches_tenant_isolation
    ON tenant.nursery_batches
    USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.nursery_batches TO teivaka_app;
    END IF;
END $$;
