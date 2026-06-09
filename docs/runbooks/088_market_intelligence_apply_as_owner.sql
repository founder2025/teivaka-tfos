-- 088 market_intelligence — apply-as-owner DDL (Strike #123)
-- Cross-tenant community.* schema (no RLS; access enforced at app layer like
-- community.posts/listings). Run as the owner role, then alembic stamp:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/088_market_intelligence_apply_as_owner.sql
--   docker exec teivaka_api alembic stamp 088_market_intelligence
--   docker exec teivaka_api alembic current   -- -> 088_market_intelligence (head)
-- Mirrors 11_application_code/alembic/versions/088_market_intelligence.py upgrade().

CREATE SCHEMA IF NOT EXISTS community;

CREATE TABLE IF NOT EXISTS community.price_records (
    price_record_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID REFERENCES tenant.tenants(tenant_id),
    farm_id           TEXT,
    created_by        UUID REFERENCES tenant.users(user_id),
    production_id     TEXT NOT NULL,
    variety_id        TEXT,
    grade             TEXT,
    location_region   TEXT,
    island            TEXT,
    quantity_kg       NUMERIC(14,2),
    price_per_kg_fjd  NUMERIC(12,2) NOT NULL CHECK (price_per_kg_fjd >= 0),
    buyer_type        TEXT,
    seller_type       TEXT,
    source            TEXT NOT NULL DEFAULT 'USER_SUBMITTED'
                        CHECK (source IN ('TRANSACTION','USER_SUBMITTED','ADMIN_REFERENCE','MUNICIPAL_MARKET','EXPORTER')),
    is_actual_sale    BOOLEAN NOT NULL DEFAULT FALSE,
    transaction_id    TEXT,
    confidence_hint   TEXT CHECK (confidence_hint IN ('LOW','MEDIUM','HIGH')),
    observed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes             TEXT
);
CREATE INDEX IF NOT EXISTS idx_price_records_prod ON community.price_records(production_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_records_sale ON community.price_records(production_id, observed_at DESC) WHERE is_actual_sale = TRUE;
CREATE INDEX IF NOT EXISTS idx_price_records_loc ON community.price_records(island, location_region);

CREATE TABLE IF NOT EXISTS community.demand_records (
    demand_record_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID REFERENCES tenant.tenants(tenant_id),
    farm_id           TEXT,
    created_by        UUID REFERENCES tenant.users(user_id),
    production_id     TEXT NOT NULL,
    variety_id        TEXT,
    grade             TEXT,
    quantity_kg       NUMERIC(14,2) NOT NULL CHECK (quantity_kg > 0),
    frequency         TEXT NOT NULL DEFAULT 'ONE_OFF'
                        CHECK (frequency IN ('ONE_OFF','WEEKLY','MONTHLY','QUARTERLY','RECURRING')),
    is_recurring      BOOLEAN NOT NULL DEFAULT FALSE,
    buyer_name        TEXT,
    buyer_type        TEXT,
    location_region   TEXT,
    island            TEXT,
    required_by       DATE,
    price_offered_fjd NUMERIC(12,2),
    status            TEXT NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN ('OPEN','PARTIAL','FULFILLED','CLOSED','EXPIRED')),
    contact_whatsapp  TEXT,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_demand_prod ON community.demand_records(production_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demand_open ON community.demand_records(status, created_at DESC) WHERE status = 'OPEN';

CREATE TABLE IF NOT EXISTS community.supply_forecasts (
    supply_forecast_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 UUID REFERENCES tenant.tenants(tenant_id),
    farm_id                   TEXT,
    created_by                UUID REFERENCES tenant.users(user_id),
    production_id             TEXT NOT NULL,
    variety_id                TEXT,
    grade                     TEXT,
    area_ha                   NUMERIC(12,3),
    plants                    INTEGER,
    expected_yield_per_unit_kg NUMERIC(12,3),
    yield_basis               TEXT NOT NULL DEFAULT 'PER_PLANT'
                                CHECK (yield_basis IN ('PER_PLANT','PER_HA')),
    success_probability       NUMERIC(4,3) NOT NULL DEFAULT 0.85
                                CHECK (success_probability >= 0 AND success_probability <= 1),
    projected_supply_kg       NUMERIC(14,2),
    harvest_date              DATE,
    location_region           TEXT,
    island                    TEXT,
    cycle_id                  TEXT,
    status                    TEXT NOT NULL DEFAULT 'PLANNED'
                                CHECK (status IN ('PLANNED','GROWING','HARVESTED','CANCELLED')),
    notes                     TEXT,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supply_prod ON community.supply_forecasts(production_id, harvest_date);
CREATE INDEX IF NOT EXISTS idx_supply_active ON community.supply_forecasts(status, harvest_date) WHERE status IN ('PLANNED','GROWING');

CREATE TABLE IF NOT EXISTS community.market_analytics (
    analytics_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_id             TEXT NOT NULL,
    variety_id                TEXT,
    grade                     TEXT,
    location_region           TEXT,
    island                    TEXT,
    period_start              DATE,
    period_end                DATE,
    weighted_market_price_fjd NUMERIC(12,2),
    price_low_fjd             NUMERIC(12,2),
    price_high_fjd            NUMERIC(12,2),
    price_avg_fjd             NUMERIC(12,2),
    price_trend               TEXT CHECK (price_trend IN ('UP','DOWN','STABLE')),
    supply_index_kg           NUMERIC(16,2),
    demand_index_kg           NUMERIC(16,2),
    market_balance            NUMERIC(10,4),
    balance_status            TEXT CHECK (balance_status IN ('SHORTAGE','BALANCED','OVERSUPPLY')),
    opportunity_score         INTEGER CHECK (opportunity_score BETWEEN 0 AND 100),
    opportunity_band          TEXT CHECK (opportunity_band IN ('EXCELLENT','GOOD','MODERATE','HIGH_RISK')),
    confidence_level          TEXT CHECK (confidence_level IN ('LOW','MEDIUM','HIGH','VERY_HIGH')),
    transaction_count         INTEGER NOT NULL DEFAULT 0,
    unique_buyers             INTEGER NOT NULL DEFAULT 0,
    unique_farmers            INTEGER NOT NULL DEFAULT 0,
    computed_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_market_analytics_dim ON community.market_analytics(production_id, COALESCE(variety_id,''), COALESCE(grade,''), COALESCE(island,''), COALESCE(location_region,''), COALESCE(period_start,'1900-01-01'));
CREATE INDEX IF NOT EXISTS idx_market_analytics_prod ON community.market_analytics(production_id, computed_at DESC);

-- Runtime GRANTs — api connects as teivaka_app (B73).
GRANT USAGE ON SCHEMA community TO teivaka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.price_records TO teivaka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.demand_records TO teivaka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.supply_forecasts TO teivaka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.market_analytics TO teivaka_app;
