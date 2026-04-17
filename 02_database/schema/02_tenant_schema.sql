-- =============================================================
-- 02_tenant_schema.sql
-- Teivaka Agri-TOS — Tenant-scoped operational tables
-- PostgreSQL 16 + TimescaleDB 2.15.3
-- Run after 01_shared_schema.sql
-- =============================================================

SET search_path TO tenant, shared, public;

-- =============================================================
-- SCHEMA CREATION
-- =============================================================

CREATE SCHEMA IF NOT EXISTS tenant;

-- Enable required extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "timescaledb" CASCADE;

-- =============================================================
-- 1. TENANTS (root table — no RLS, accessed by service account)
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.tenants (
    tenant_id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name           TEXT         NOT NULL,
    company_reg_no         TEXT         UNIQUE,
    subscription_tier      TEXT         NOT NULL DEFAULT 'FREE'
                                        CHECK (subscription_tier IN ('FREE','BASIC','PROFESSIONAL','ENTERPRISE')),
    subscription_status    TEXT         NOT NULL DEFAULT 'ACTIVE'
                                        CHECK (subscription_status IN ('ACTIVE','SUSPENDED','CANCELLED','TRIAL')),
    subscription_start     DATE,
    subscription_end       DATE,
    tis_calls_today        INTEGER      NOT NULL DEFAULT 0,
    tis_calls_reset_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    tis_daily_limit        INTEGER      NOT NULL DEFAULT 5,
    primary_contact_name   TEXT,
    primary_contact_email  TEXT,
    primary_contact_phone  TEXT,
    country                TEXT         NOT NULL DEFAULT 'FJ',
    timezone               TEXT         NOT NULL DEFAULT 'Pacific/Fiji',
    stripe_customer_id     TEXT,
    stripe_subscription_id TEXT,
    is_active              BOOLEAN      NOT NULL DEFAULT true,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- NO RLS on tenants (accessed by service account directly)
CREATE INDEX IF NOT EXISTS idx_tenants_stripe
    ON tenant.tenants(stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL;

-- =============================================================
-- 2. USERS
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.users (
    -- Core identity
    user_id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                  UUID        NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    email                      TEXT        NOT NULL,
    password_hash              TEXT        NOT NULL DEFAULT '',

    -- Name (full_name kept for backward compat; first/last for display + search)
    full_name                  TEXT        NOT NULL,
    first_name                 TEXT,
    last_name                  TEXT,

    -- Role + account classification
    role                       TEXT        NOT NULL DEFAULT 'VIEWER'
                                           CHECK (role IN ('FOUNDER','MANAGER','WORKER','VIEWER','FARMER','ADMIN')),
    account_type               TEXT        NOT NULL DEFAULT 'FARMER'
                                           CHECK (account_type IN ('FARMER','SUPPLIER','BUYER','OTHER')),

    -- Contact
    phone_number               TEXT,                        -- primary contact, E.164 format
    whatsapp_number            TEXT,                        -- may differ from phone_number
    preferred_language         TEXT        NOT NULL DEFAULT 'en',

    -- Profile
    date_of_birth              DATE,                        -- age verification (18+)
    country                    TEXT        NOT NULL DEFAULT 'FJ',  -- ISO 3166-1 alpha-2

    -- Compliance & privacy
    privacy_accepted_at        TIMESTAMPTZ,                 -- exact timestamp of policy acceptance
    privacy_policy_version     TEXT        NOT NULL DEFAULT '1.0',

    -- Registration metadata (fraud / audit)
    registration_ip            TEXT,
    registration_user_agent    TEXT,

    -- Email verification
    email_verified             BOOLEAN     NOT NULL DEFAULT false,
    email_verification_token   TEXT,
    email_verification_expires TIMESTAMPTZ,

    -- Status & timestamps
    is_active                  BOOLEAN     NOT NULL DEFAULT true,
    last_login                 TIMESTAMPTZ,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(tenant_id, email)
);

ALTER TABLE tenant.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_tenant_isolation ON tenant.users
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_users_tenant          ON tenant.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email_active    ON tenant.users(email) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
    ON tenant.users(phone_number) WHERE phone_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_verification_token
    ON tenant.users(email_verification_token) WHERE email_verification_token IS NOT NULL;

-- =============================================================
-- 3. FARMS
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.farms (
    farm_id               TEXT         PRIMARY KEY,  -- format: F001, F002
    tenant_id             UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    farm_name             TEXT         NOT NULL,
    location_name         TEXT         NOT NULL,
    location_province     TEXT,
    location_island       TEXT,
    land_area_ha          NUMERIC(10,2),
    operational_start     DATE,
    farm_type             TEXT         NOT NULL DEFAULT 'OWNED'
                                       CHECK (farm_type IN ('OWNED','LEASED','PARTNERSHIP')),
    profit_share_enabled  BOOLEAN      NOT NULL DEFAULT false,
    profit_share_rate_pct NUMERIC(5,2),
    profit_share_party    TEXT,
    island_logistics      BOOLEAN      NOT NULL DEFAULT false,
    ferry_supplier_id     TEXT,
    ferry_frequency_days  INTEGER      DEFAULT 7,
    ferry_buffer_days     INTEGER      DEFAULT 3,
    gps_lat               NUMERIC(9,6),
    gps_lng               NUMERIC(9,6),
    timezone              TEXT         NOT NULL DEFAULT 'Pacific/Fiji',
    is_active             BOOLEAN      NOT NULL DEFAULT true,
    notes                 TEXT,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.farms ENABLE ROW LEVEL SECURITY;

CREATE POLICY farms_tenant_isolation ON tenant.farms
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_farms_tenant ON tenant.farms(tenant_id);

-- =============================================================
-- 4. ZONES
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.zones (
    zone_id             TEXT         PRIMARY KEY,  -- format: F001-Z01
    tenant_id           UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    farm_id             TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    zone_name           TEXT         NOT NULL,
    zone_type           TEXT         NOT NULL
                                     CHECK (zone_type IN ('CROP','LIVESTOCK','APICULTURE','NURSERY','STORAGE','MIXED')),
    area_ha             NUMERIC(8,3),
    soil_type           TEXT,
    irrigation_type     TEXT         CHECK (irrigation_type IN ('DRIP','SPRINKLER','FLOOD','RAIN_FED','MANUAL')),
    sun_exposure        TEXT         CHECK (sun_exposure IN ('FULL','PARTIAL','SHADE')),
    current_crop_family TEXT,
    last_rest_start     DATE,
    last_rest_end       DATE,
    gps_lat             NUMERIC(9,6),
    gps_lng             NUMERIC(9,6),
    is_active           BOOLEAN      NOT NULL DEFAULT true,
    notes               TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY zones_tenant_isolation ON tenant.zones
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_zones_farm   ON tenant.zones(farm_id);
CREATE INDEX IF NOT EXISTS idx_zones_tenant ON tenant.zones(tenant_id);

-- =============================================================
-- 5. PRODUCTION UNITS
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.production_units (
    pu_id                  TEXT         PRIMARY KEY,  -- format: F001-Z01-PU01
    tenant_id              UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    zone_id                TEXT         NOT NULL REFERENCES tenant.zones(zone_id),
    farm_id                TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    pu_name                TEXT         NOT NULL,
    pu_type                TEXT         NOT NULL
                                        CHECK (pu_type IN ('BED','PLOT','GREENHOUSE','POND','PADDOCK','HIVE_STAND')),
    area_sqm               NUMERIC(10,2),
    current_production_id  TEXT         REFERENCES shared.productions(production_id),
    current_cycle_id       TEXT,
    soil_ph                NUMERIC(4,2),
    last_soil_test_date    DATE,
    bed_number             INTEGER,
    is_active              BOOLEAN      NOT NULL DEFAULT true,
    notes                  TEXT,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.production_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY production_units_tenant_isolation ON tenant.production_units
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_pu_zone   ON tenant.production_units(zone_id);
CREATE INDEX IF NOT EXISTS idx_pu_farm   ON tenant.production_units(farm_id);
CREATE INDEX IF NOT EXISTS idx_pu_tenant ON tenant.production_units(tenant_id);

-- =============================================================
-- 6. WORKERS
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.workers (
    worker_id         TEXT         PRIMARY KEY,  -- format: W-001
    tenant_id         UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    farm_id           TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    full_name         TEXT         NOT NULL,
    worker_type       TEXT         NOT NULL
                                   CHECK (worker_type IN ('PERMANENT','CASUAL','CONTRACT','FAMILY')),
    daily_rate_fjd    NUMERIC(8,2),
    phone             TEXT,
    whatsapp_number   TEXT,
    emergency_contact TEXT,
    skills            TEXT[],
    is_active         BOOLEAN      NOT NULL DEFAULT true,
    start_date        DATE,
    end_date          DATE,
    notes             TEXT,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY workers_tenant_isolation ON tenant.workers
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_workers_farm   ON tenant.workers(farm_id);
CREATE INDEX IF NOT EXISTS idx_workers_tenant ON tenant.workers(tenant_id);

-- =============================================================
-- 7. SUPPLIERS
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.suppliers (
    supplier_id        TEXT         PRIMARY KEY,  -- format: SUP-001
    tenant_id          UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    supplier_name      TEXT         NOT NULL,
    supplier_type      TEXT         NOT NULL
                                    CHECK (supplier_type IN ('INPUT','EQUIPMENT','SHIPPING','SERVICE','MIXED')),
    contact_name       TEXT,
    phone              TEXT,
    whatsapp_number    TEXT,
    email              TEXT,
    address            TEXT,
    island             TEXT,
    payment_terms_days INTEGER      DEFAULT 30,
    credit_limit_fjd   NUMERIC(12,2),
    is_preferred       BOOLEAN      NOT NULL DEFAULT false,
    is_active          BOOLEAN      NOT NULL DEFAULT true,
    notes              TEXT,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY suppliers_tenant_isolation ON tenant.suppliers
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON tenant.suppliers(tenant_id);

-- =============================================================
-- 8. CUSTOMERS
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.customers (
    customer_id          TEXT         PRIMARY KEY,  -- format: CUS-001
    tenant_id            UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    customer_name        TEXT         NOT NULL,
    customer_type        TEXT         NOT NULL
                                      CHECK (customer_type IN ('DIRECT','WHOLESALE','RESTAURANT','SUPERMARKET','EXPORT','RELATED_PARTY')),
    contact_name         TEXT,
    phone                TEXT,
    whatsapp_number      TEXT,
    email                TEXT,
    address              TEXT,
    island               TEXT,
    payment_terms_days   INTEGER      DEFAULT 7,
    credit_limit_fjd     NUMERIC(12,2) DEFAULT 0,
    is_related_party     BOOLEAN      NOT NULL DEFAULT false,
    related_party_notes  TEXT,
    is_active            BOOLEAN      NOT NULL DEFAULT true,
    notes                TEXT,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY customers_tenant_isolation ON tenant.customers
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_customers_tenant ON tenant.customers(tenant_id);

-- =============================================================
-- 9. EQUIPMENT
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.equipment (
    equipment_id       TEXT         PRIMARY KEY,  -- format: EQP-001
    tenant_id          UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    farm_id            TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    equipment_name     TEXT         NOT NULL,
    equipment_type     TEXT         NOT NULL
                                    CHECK (equipment_type IN ('TRACTOR','IRRIGATION','TOOL','VEHICLE','PROCESSING','STORAGE','OTHER')),
    brand              TEXT,
    model              TEXT,
    serial_number      TEXT,
    purchase_date      DATE,
    purchase_cost_fjd  NUMERIC(12,2),
    current_value_fjd  NUMERIC(12,2),
    condition          TEXT         CHECK (condition IN ('EXCELLENT','GOOD','FAIR','POOR','DECOMMISSIONED')),
    last_service_date  DATE,
    next_service_date  DATE,
    is_active          BOOLEAN      NOT NULL DEFAULT true,
    notes              TEXT,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY equipment_tenant_isolation ON tenant.equipment
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_equipment_farm   ON tenant.equipment(farm_id);
CREATE INDEX IF NOT EXISTS idx_equipment_tenant ON tenant.equipment(tenant_id);

-- =============================================================
-- 10. INPUTS (inventory master)
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.inputs (
    input_id               TEXT         PRIMARY KEY,  -- format: INP-001
    tenant_id              UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    input_name             TEXT         NOT NULL,
    input_category         TEXT         NOT NULL
                                        CHECK (input_category IN ('FERTILIZER','PESTICIDE','HERBICIDE','FUNGICIDE','SEED','SEEDLING','TOOL','PACKAGING','FUEL','OTHER')),
    unit_of_measure        TEXT         NOT NULL,  -- kg, L, pkt, unit
    current_stock_qty      NUMERIC(12,3) NOT NULL DEFAULT 0,
    reorder_point_qty      NUMERIC(12,3),
    reorder_qty            NUMERIC(12,3),
    unit_cost_fjd          NUMERIC(10,4),
    preferred_supplier_id  TEXT         REFERENCES tenant.suppliers(supplier_id),
    is_chemical            BOOLEAN      NOT NULL DEFAULT false,
    chemical_id            TEXT         REFERENCES shared.chemical_library(chemical_id),
    storage_location       TEXT,
    expiry_date            DATE,
    is_active              BOOLEAN      NOT NULL DEFAULT true,
    notes                  TEXT,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY inputs_tenant_isolation ON tenant.inputs
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_inputs_tenant   ON tenant.inputs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inputs_chemical ON tenant.inputs(chemical_id)
    WHERE chemical_id IS NOT NULL;

-- =============================================================
-- 11. PRODUCTION CYCLES (core operational table)
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.production_cycles (
    cycle_id                  TEXT         PRIMARY KEY,  -- format: CYC-F001-Z01-PU01-2026-001
    tenant_id                 UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    pu_id                     TEXT         NOT NULL REFERENCES tenant.production_units(pu_id),
    zone_id                   TEXT         NOT NULL REFERENCES tenant.zones(zone_id),
    farm_id                   TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    production_id             TEXT         NOT NULL REFERENCES shared.productions(production_id),
    cycle_status              TEXT         NOT NULL DEFAULT 'PLANNED'
                                           CHECK (cycle_status IN ('PLANNED','ACTIVE','HARVESTING','CLOSING','CLOSED','FAILED')),
    planting_date             DATE         NOT NULL,
    expected_harvest_date     DATE,
    actual_harvest_start      DATE,
    actual_harvest_end        DATE,
    planned_area_sqm          NUMERIC(10,2),
    planned_yield_kg          NUMERIC(10,2),
    actual_yield_kg           NUMERIC(10,2),
    total_labor_cost_fjd      NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_input_cost_fjd      NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_other_cost_fjd      NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_revenue_fjd         NUMERIC(12,2) NOT NULL DEFAULT 0,
    cogk_fjd_per_kg           NUMERIC(10,4),  -- cost of goods per kg
    harvest_reconciliation_pct NUMERIC(6,2),  -- (actual-planned)/planned * 100
    cycle_notes               TEXT,
    closed_by                 UUID         REFERENCES tenant.users(user_id),
    closed_at                 TIMESTAMPTZ,
    created_by                UUID         REFERENCES tenant.users(user_id),
    created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.production_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY cycles_tenant_isolation ON tenant.production_cycles
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_cycles_pu ON tenant.production_cycles(pu_id);
CREATE INDEX IF NOT EXISTS idx_cycles_farm ON tenant.production_cycles(farm_id);
CREATE INDEX IF NOT EXISTS idx_cycles_status ON tenant.production_cycles(cycle_status)
    WHERE cycle_status NOT IN ('CLOSED','FAILED');
CREATE INDEX IF NOT EXISTS idx_cycles_production ON tenant.production_cycles(production_id);
CREATE INDEX IF NOT EXISTS idx_cycles_tenant ON tenant.production_cycles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cycles_planting ON tenant.production_cycles(planting_date DESC);

-- =============================================================
-- 12. FIELD EVENTS (TimescaleDB hypertable — 7-day chunks)
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.field_events (
    event_id                TEXT         NOT NULL,  -- format: EVT-F001-20260315-001
    tenant_id               UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    cycle_id                TEXT         NOT NULL REFERENCES tenant.production_cycles(cycle_id),
    pu_id                   TEXT         NOT NULL REFERENCES tenant.production_units(pu_id),
    farm_id                 TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    event_type              TEXT         NOT NULL
                                         CHECK (event_type IN ('PLANTING','TRANSPLANT','FERTILIZE','IRRIGATE','SPRAY','PRUNE','PEST_OBSERVE','DISEASE_OBSERVE','HARVEST_PARTIAL','HARVEST_FINAL','INSPECTION','SOIL_TEST','PHOTO','OTHER')),
    event_date              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    performed_by_worker_id  TEXT         REFERENCES tenant.workers(worker_id),
    input_id                TEXT         REFERENCES tenant.inputs(input_id),
    input_qty_used          NUMERIC(10,3),
    input_cost_fjd          NUMERIC(10,2),
    labor_hours             NUMERIC(6,2),
    labor_cost_fjd          NUMERIC(10,2),
    quantity_harvested_kg   NUMERIC(10,3),
    observation_text        TEXT,
    photo_url               TEXT,
    gps_lat                 NUMERIC(9,6),
    gps_lng                 NUMERIC(9,6),
    chemical_application    BOOLEAN      NOT NULL DEFAULT false,
    chemical_id             TEXT         REFERENCES shared.chemical_library(chemical_id),
    chemical_dose_per_liter NUMERIC(10,4),
    tank_volume_liters      NUMERIC(10,2),
    whd_clearance_date      DATE,  -- computed: event_date + WHD
    created_by              UUID         REFERENCES tenant.users(user_id),
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, event_date)  -- composite PK required for TimescaleDB
);

ALTER TABLE tenant.field_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY field_events_tenant_isolation ON tenant.field_events
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

SELECT create_hypertable(
    'tenant.field_events',
    'event_date',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_field_events_cycle    ON tenant.field_events(cycle_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_field_events_farm     ON tenant.field_events(farm_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_field_events_chemical ON tenant.field_events(chemical_id, event_date DESC)
    WHERE chemical_application = true;
CREATE INDEX IF NOT EXISTS idx_field_events_tenant   ON tenant.field_events(tenant_id, event_date DESC);

-- =============================================================
-- 13. HARVEST LOG (TimescaleDB hypertable — 7-day chunks)
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.harvest_log (
    harvest_id                  TEXT         NOT NULL,
    tenant_id                   UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    cycle_id                    TEXT         NOT NULL REFERENCES tenant.production_cycles(cycle_id),
    pu_id                       TEXT         NOT NULL REFERENCES tenant.production_units(pu_id),
    farm_id                     TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    production_id               TEXT         NOT NULL REFERENCES shared.productions(production_id),
    harvest_date                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    gross_yield_kg              NUMERIC(10,3) NOT NULL,
    marketable_yield_kg         NUMERIC(10,3) NOT NULL,
    waste_kg                    NUMERIC(10,3) NOT NULL DEFAULT 0,
    grade_A_kg                  NUMERIC(10,3) DEFAULT 0,
    grade_B_kg                  NUMERIC(10,3) DEFAULT 0,
    grade_C_kg                  NUMERIC(10,3) DEFAULT 0,
    harvested_by_worker_id      TEXT         REFERENCES tenant.workers(worker_id),
    harvest_method              TEXT         CHECK (harvest_method IN ('MANUAL','MECHANICAL','SELECTIVE','STRIP')),
    quality_notes               TEXT,
    photo_url                   TEXT,
    chemical_compliance_cleared BOOLEAN      NOT NULL DEFAULT false,
    last_chemical_date          DATE,
    whd_clearance_date          DATE,
    compliance_override         BOOLEAN      NOT NULL DEFAULT false,
    compliance_override_by      UUID         REFERENCES tenant.users(user_id),
    compliance_override_reason  TEXT,
    created_by                  UUID         REFERENCES tenant.users(user_id),
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (harvest_id, harvest_date)
);

ALTER TABLE tenant.harvest_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY harvest_log_tenant_isolation ON tenant.harvest_log
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

SELECT create_hypertable(
    'tenant.harvest_log',
    'harvest_date',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_harvest_cycle      ON tenant.harvest_log(cycle_id, harvest_date DESC);
CREATE INDEX IF NOT EXISTS idx_harvest_farm       ON tenant.harvest_log(farm_id, harvest_date DESC);
CREATE INDEX IF NOT EXISTS idx_harvest_compliance ON tenant.harvest_log(chemical_compliance_cleared, harvest_date DESC);

-- =============================================================
-- 14. INCOME LOG (TimescaleDB hypertable — 7-day chunks)
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.income_log (
    income_id             TEXT         NOT NULL,
    tenant_id             UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    cycle_id              TEXT         REFERENCES tenant.production_cycles(cycle_id),
    farm_id               TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    customer_id           TEXT         REFERENCES tenant.customers(customer_id),
    production_id         TEXT         REFERENCES shared.productions(production_id),
    transaction_date      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    income_type           TEXT         NOT NULL
                                       CHECK (income_type IN ('HARVEST_SALE','LIVESTOCK_SALE','HONEY_SALE','SERVICE','GRANT','OTHER')),
    quantity_kg           NUMERIC(10,3),
    unit_price_fjd        NUMERIC(10,4),
    gross_amount_fjd      NUMERIC(12,2) NOT NULL,
    discount_fjd          NUMERIC(10,2) DEFAULT 0,
    net_amount_fjd        NUMERIC(12,2) NOT NULL,
    payment_method        TEXT         CHECK (payment_method IN ('CASH','BANK_TRANSFER','MOBILE_MONEY','CREDIT','OTHER')),
    payment_status        TEXT         NOT NULL DEFAULT 'PENDING'
                                       CHECK (payment_status IN ('PENDING','PARTIAL','PAID','OVERDUE','WRITTEN_OFF')),
    payment_received_date DATE,
    invoice_number        TEXT,
    is_related_party      BOOLEAN      NOT NULL DEFAULT false,
    delivery_address      TEXT,
    notes                 TEXT,
    created_by            UUID         REFERENCES tenant.users(user_id),
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (income_id, transaction_date)
);

ALTER TABLE tenant.income_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY income_log_tenant_isolation ON tenant.income_log
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

SELECT create_hypertable(
    'tenant.income_log',
    'transaction_date',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_income_farm     ON tenant.income_log(farm_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_income_cycle    ON tenant.income_log(cycle_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_income_customer ON tenant.income_log(customer_id, transaction_date DESC);

-- =============================================================
-- 15. LABOR ATTENDANCE (TimescaleDB hypertable — 7-day chunks)
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.labor_attendance (
    attendance_id    TEXT         NOT NULL,
    tenant_id        UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    worker_id        TEXT         NOT NULL REFERENCES tenant.workers(worker_id),
    farm_id          TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    cycle_id         TEXT         REFERENCES tenant.production_cycles(cycle_id),
    work_date        TIMESTAMPTZ  NOT NULL,
    hours_worked     NUMERIC(5,2) NOT NULL DEFAULT 8,
    daily_rate_fjd   NUMERIC(8,2) NOT NULL,
    total_pay_fjd    NUMERIC(10,2) NOT NULL,
    task_description TEXT,
    pu_id            TEXT         REFERENCES tenant.production_units(pu_id),
    overtime_hours   NUMERIC(5,2) DEFAULT 0,
    overtime_rate_fjd NUMERIC(8,2),
    overtime_pay_fjd NUMERIC(10,2) DEFAULT 0,
    payment_status   TEXT         NOT NULL DEFAULT 'PENDING'
                                  CHECK (payment_status IN ('PENDING','PAID')),
    payment_date     DATE,
    approved_by      UUID         REFERENCES tenant.users(user_id),
    notes            TEXT,
    created_by       UUID         REFERENCES tenant.users(user_id),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (attendance_id, work_date)
);

ALTER TABLE tenant.labor_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY labor_attendance_tenant_isolation ON tenant.labor_attendance
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

SELECT create_hypertable(
    'tenant.labor_attendance',
    'work_date',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_labor_worker ON tenant.labor_attendance(worker_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_labor_farm   ON tenant.labor_attendance(farm_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_labor_cycle  ON tenant.labor_attendance(cycle_id, work_date DESC);

-- =============================================================
-- 16. WEATHER LOG (TimescaleDB hypertable — 7-day chunks)
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.weather_log (
    log_id             TEXT         NOT NULL,
    tenant_id          UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    farm_id            TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    logged_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    rainfall_mm        NUMERIC(7,2),
    temp_max_c         NUMERIC(5,2),
    temp_min_c         NUMERIC(5,2),
    humidity_pct       NUMERIC(5,2),
    wind_speed_kmh     NUMERIC(6,2),
    wind_direction     TEXT,
    weather_condition  TEXT         CHECK (weather_condition IN ('SUNNY','PARTLY_CLOUDY','OVERCAST','RAIN_LIGHT','RAIN_HEAVY','STORM','CYCLONE_WATCH','CYCLONE_WARNING')),
    cyclone_alert      BOOLEAN      NOT NULL DEFAULT false,
    cyclone_name       TEXT,
    source             TEXT         NOT NULL DEFAULT 'MANUAL'
                                    CHECK (source IN ('MANUAL','SENSOR','API_FMS','API_BOM')),
    notes              TEXT,
    created_by         UUID         REFERENCES tenant.users(user_id),
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (log_id, logged_at)
);

ALTER TABLE tenant.weather_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY weather_log_tenant_isolation ON tenant.weather_log
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

SELECT create_hypertable(
    'tenant.weather_log',
    'logged_at',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_weather_farm    ON tenant.weather_log(farm_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_weather_cyclone ON tenant.weather_log(farm_id, logged_at DESC)
    WHERE cyclone_alert = true;

-- =============================================================
-- 17. INPUT TRANSACTIONS
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.input_transactions (
    txn_id            TEXT         PRIMARY KEY,
    tenant_id         UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    input_id          TEXT         NOT NULL REFERENCES tenant.inputs(input_id),
    farm_id           TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    txn_type          TEXT         NOT NULL
                                   CHECK (txn_type IN ('PURCHASE','USAGE','ADJUSTMENT','RETURN','TRANSFER','WASTE')),
    txn_date          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    qty_change        NUMERIC(12,3) NOT NULL,  -- negative for usage/waste
    qty_before        NUMERIC(12,3) NOT NULL,
    qty_after         NUMERIC(12,3) NOT NULL,
    unit_cost_fjd     NUMERIC(10,4),
    total_cost_fjd    NUMERIC(12,2),
    cycle_id          TEXT         REFERENCES tenant.production_cycles(cycle_id),
    pu_id             TEXT         REFERENCES tenant.production_units(pu_id),
    supplier_id       TEXT         REFERENCES tenant.suppliers(supplier_id),
    purchase_order_no TEXT,
    delivery_note_no  TEXT,
    performed_by      UUID         REFERENCES tenant.users(user_id),
    notes             TEXT,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.input_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY input_transactions_tenant_isolation ON tenant.input_transactions
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_input_txn_input ON tenant.input_transactions(input_id, txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_input_txn_farm  ON tenant.input_transactions(farm_id, txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_input_txn_cycle ON tenant.input_transactions(cycle_id)
    WHERE cycle_id IS NOT NULL;

-- =============================================================
-- 18. DELIVERY LOG
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.delivery_log (
    delivery_id           TEXT         PRIMARY KEY,
    tenant_id             UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    farm_id               TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    delivery_type         TEXT         NOT NULL
                                       CHECK (delivery_type IN ('INBOUND','OUTBOUND')),
    delivery_date         DATE         NOT NULL,
    supplier_id           TEXT         REFERENCES tenant.suppliers(supplier_id),
    customer_id           TEXT         REFERENCES tenant.customers(customer_id),
    transport_method      TEXT         CHECK (transport_method IN ('TRUCK','FERRY','BOAT','FOOT','OTHER')),
    ferry_vessel          TEXT,
    ferry_departure_port  TEXT,
    ferry_arrival_port    TEXT,
    items_description     TEXT         NOT NULL,
    total_weight_kg       NUMERIC(10,3),
    freight_cost_fjd      NUMERIC(10,2),
    delivery_status       TEXT         NOT NULL DEFAULT 'PENDING'
                                       CHECK (delivery_status IN ('PENDING','IN_TRANSIT','DELIVERED','FAILED','PARTIAL')),
    estimated_arrival     DATE,
    actual_arrival        DATE,
    delay_reason          TEXT,
    driver_contact        TEXT,
    notes                 TEXT,
    created_by            UUID         REFERENCES tenant.users(user_id),
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_log_tenant_isolation ON tenant.delivery_log
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_delivery_farm     ON tenant.delivery_log(farm_id, delivery_date DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_supplier ON tenant.delivery_log(supplier_id)
    WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_ferry    ON tenant.delivery_log(ferry_vessel, delivery_date DESC)
    WHERE transport_method = 'FERRY';

-- =============================================================
-- 19. NURSERY LOG
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.nursery_log (
    nursery_id              TEXT         PRIMARY KEY,
    tenant_id               UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    farm_id                 TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    production_id           TEXT         NOT NULL REFERENCES shared.productions(production_id),
    batch_date              DATE         NOT NULL,
    seed_source             TEXT,
    seed_qty_planted        INTEGER      NOT NULL,
    germination_count       INTEGER,
    germination_rate_pct    NUMERIC(5,2),
    transplant_ready_date   DATE,
    transplant_count        INTEGER,
    mortality_count         INTEGER,
    notes                   TEXT,
    created_by              UUID         REFERENCES tenant.users(user_id),
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.nursery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY nursery_log_tenant_isolation ON tenant.nursery_log
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_nursery_farm ON tenant.nursery_log(farm_id, batch_date DESC);

-- =============================================================
-- 20. HARVEST LOSS
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.harvest_loss (
    loss_id              TEXT         PRIMARY KEY,
    tenant_id            UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    cycle_id             TEXT         NOT NULL REFERENCES tenant.production_cycles(cycle_id),
    farm_id              TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    loss_date            DATE         NOT NULL,
    loss_type            TEXT         NOT NULL
                                      CHECK (loss_type IN ('PEST','DISEASE','WEATHER','THEFT','SPOILAGE','MECHANICAL','OTHER')),
    estimated_loss_kg    NUMERIC(10,3) NOT NULL,
    estimated_value_fjd  NUMERIC(12,2),
    description          TEXT         NOT NULL,
    corrective_action    TEXT,
    photo_url            TEXT,
    reported_by          UUID         REFERENCES tenant.users(user_id),
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.harvest_loss ENABLE ROW LEVEL SECURITY;

CREATE POLICY harvest_loss_tenant_isolation ON tenant.harvest_loss
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_harvest_loss_cycle ON tenant.harvest_loss(cycle_id);
CREATE INDEX IF NOT EXISTS idx_harvest_loss_farm  ON tenant.harvest_loss(farm_id, loss_date DESC);

-- =============================================================
-- 21. CASH LEDGER
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.cash_ledger (
    ledger_id           TEXT         PRIMARY KEY,
    tenant_id           UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    farm_id             TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    transaction_date    DATE         NOT NULL,
    transaction_type    TEXT         NOT NULL
                                     CHECK (transaction_type IN ('INCOME','EXPENSE','TRANSFER','LOAN','REPAYMENT','GRANT')),
    category            TEXT         NOT NULL,
    description         TEXT         NOT NULL,
    amount_fjd          NUMERIC(12,2) NOT NULL,
    running_balance_fjd NUMERIC(14,2),
    reference_id        TEXT,  -- links to income_id, input_txn_id, etc.
    reference_type      TEXT,
    payment_method      TEXT         CHECK (payment_method IN ('CASH','BANK_TRANSFER','MOBILE_MONEY','CREDIT','OTHER')),
    bank_account        TEXT,
    created_by          UUID         REFERENCES tenant.users(user_id),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.cash_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY cash_ledger_tenant_isolation ON tenant.cash_ledger
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_cash_ledger_farm ON tenant.cash_ledger(farm_id, transaction_date DESC);

-- =============================================================
-- 22. ORDERS (purchase orders and sales orders)
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.orders (
    order_id               TEXT         PRIMARY KEY,
    tenant_id              UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    farm_id                TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    order_type             TEXT         NOT NULL
                                        CHECK (order_type IN ('PURCHASE','SALES')),
    order_date             DATE         NOT NULL DEFAULT CURRENT_DATE,
    supplier_id            TEXT         REFERENCES tenant.suppliers(supplier_id),
    customer_id            TEXT         REFERENCES tenant.customers(customer_id),
    order_status           TEXT         NOT NULL DEFAULT 'DRAFT'
                                        CHECK (order_status IN ('DRAFT','SUBMITTED','CONFIRMED','DISPATCHED','DELIVERED','INVOICED','PAID','CANCELLED')),
    expected_delivery_date DATE,
    actual_delivery_date   DATE,
    total_amount_fjd       NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_fjd           NUMERIC(10,2) DEFAULT 0,
    freight_cost_fjd       NUMERIC(10,2) DEFAULT 0,
    net_amount_fjd         NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes                  TEXT,
    created_by             UUID         REFERENCES tenant.users(user_id),
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_tenant_isolation ON tenant.orders
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_orders_farm     ON tenant.orders(farm_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_supplier ON tenant.orders(supplier_id)
    WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_status   ON tenant.orders(order_status)
    WHERE order_status NOT IN ('PAID','CANCELLED');

-- =============================================================
-- 23. ORDER LINE ITEMS
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.order_line_items (
    line_id          TEXT         PRIMARY KEY,
    tenant_id        UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    order_id         TEXT         NOT NULL REFERENCES tenant.orders(order_id) ON DELETE CASCADE,
    input_id         TEXT         REFERENCES tenant.inputs(input_id),
    production_id    TEXT         REFERENCES shared.productions(production_id),
    description      TEXT         NOT NULL,
    quantity         NUMERIC(12,3) NOT NULL,
    unit_of_measure  TEXT         NOT NULL,
    unit_price_fjd   NUMERIC(10,4) NOT NULL,
    total_fjd        NUMERIC(12,2) NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.order_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_line_items_tenant_isolation ON tenant.order_line_items
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_order_lines_order ON tenant.order_line_items(order_id);

-- =============================================================
-- 24. CYCLE FINANCIALS (summary per cycle — updated by triggers)
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.cycle_financials (
    financial_id         TEXT         PRIMARY KEY,
    tenant_id            UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    cycle_id             TEXT         NOT NULL UNIQUE REFERENCES tenant.production_cycles(cycle_id),
    farm_id              TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    total_labor_cost_fjd NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_input_cost_fjd NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_other_cost_fjd NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_cost_fjd       NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_revenue_fjd    NUMERIC(12,2) NOT NULL DEFAULT 0,
    gross_profit_fjd     NUMERIC(12,2),
    gross_margin_pct     NUMERIC(6,2),
    total_harvest_kg     NUMERIC(10,3) NOT NULL DEFAULT 0,
    cogk_fjd_per_kg      NUMERIC(10,4),  -- NULL if total_harvest_kg = 0
    labor_cost_ratio_pct NUMERIC(6,2),
    harvest_variance_pct NUMERIC(6,2),
    last_computed_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.cycle_financials ENABLE ROW LEVEL SECURITY;

CREATE POLICY cycle_financials_tenant_isolation ON tenant.cycle_financials
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_cycle_financials_farm ON tenant.cycle_financials(farm_id);

-- =============================================================
-- 25. PROFIT SHARE (per cycle, when profit_share_enabled)
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.profit_share (
    share_id           TEXT         PRIMARY KEY,
    tenant_id          UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    cycle_id           TEXT         NOT NULL REFERENCES tenant.production_cycles(cycle_id),
    farm_id            TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    calculation_date   DATE         NOT NULL DEFAULT CURRENT_DATE,
    gross_revenue_fjd  NUMERIC(12,2) NOT NULL,
    total_cost_fjd     NUMERIC(12,2) NOT NULL,
    net_profit_fjd     NUMERIC(12,2) NOT NULL,
    share_rate_pct     NUMERIC(5,2)  NOT NULL,
    landowner_share_fjd NUMERIC(12,2) NOT NULL,
    operator_share_fjd NUMERIC(12,2) NOT NULL,
    landowner_name     TEXT         NOT NULL,
    payment_status     TEXT         NOT NULL DEFAULT 'PENDING'
                                    CHECK (payment_status IN ('PENDING','PAID','DISPUTED')),
    payment_date       DATE,
    notes              TEXT,
    calculated_by      UUID         REFERENCES tenant.users(user_id),
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.profit_share ENABLE ROW LEVEL SECURITY;

CREATE POLICY profit_share_tenant_isolation ON tenant.profit_share
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_profit_share_farm ON tenant.profit_share(farm_id, calculation_date DESC);

-- =============================================================
-- 26. ACCOUNTS RECEIVABLE
-- NOTE: income_log FK references income_id only (not the composite PK)
-- because TimescaleDB hypertables cannot be referenced with composite FK.
-- Join via income_id + transaction_date when querying.
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.accounts_receivable (
    ar_id               TEXT         PRIMARY KEY,
    tenant_id           UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    farm_id             TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    customer_id         TEXT         NOT NULL REFERENCES tenant.customers(customer_id),
    income_id           TEXT,  -- soft reference to income_log.income_id (no FK due to TimescaleDB composite PK)
    invoice_date        DATE         NOT NULL,
    due_date            DATE         NOT NULL,
    invoice_amount_fjd  NUMERIC(12,2) NOT NULL,
    amount_received_fjd NUMERIC(12,2) NOT NULL DEFAULT 0,
    outstanding_fjd     NUMERIC(12,2) NOT NULL,
    ar_status           TEXT         NOT NULL DEFAULT 'OPEN'
                                     CHECK (ar_status IN ('OPEN','PARTIAL','PAID','OVERDUE','WRITTEN_OFF')),
    days_overdue        INTEGER,
    collection_notes    TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.accounts_receivable ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounts_receivable_tenant_isolation ON tenant.accounts_receivable
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_ar_customer ON tenant.accounts_receivable(customer_id);
CREATE INDEX IF NOT EXISTS idx_ar_overdue  ON tenant.accounts_receivable(due_date)
    WHERE ar_status NOT IN ('PAID','WRITTEN_OFF');

-- =============================================================
-- 27. PRICE MASTER
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.price_master (
    price_id         TEXT         PRIMARY KEY,
    tenant_id        UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    farm_id          TEXT         REFERENCES tenant.farms(farm_id),  -- NULL = applies to all farms
    production_id    TEXT         NOT NULL REFERENCES shared.productions(production_id),
    customer_id      TEXT         REFERENCES tenant.customers(customer_id),  -- NULL = default price
    price_type       TEXT         NOT NULL DEFAULT 'DEFAULT'
                                  CHECK (price_type IN ('DEFAULT','WHOLESALE','RETAIL','CONTRACT','RELATED_PARTY')),
    price_fjd_per_kg NUMERIC(10,4) NOT NULL,
    effective_from   DATE         NOT NULL DEFAULT CURRENT_DATE,
    effective_to     DATE,
    is_active        BOOLEAN      NOT NULL DEFAULT true,
    created_by       UUID         REFERENCES tenant.users(user_id),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.price_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY price_master_tenant_isolation ON tenant.price_master
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_price_master_production ON tenant.price_master(production_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_price_master_active     ON tenant.price_master(production_id)
    WHERE is_active = true;

-- =============================================================
-- 28. LIVESTOCK REGISTER
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.livestock_register (
    livestock_id       TEXT         PRIMARY KEY,  -- format: LSK-F001-001
    tenant_id          UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    farm_id            TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    zone_id            TEXT         REFERENCES tenant.zones(zone_id),
    species            TEXT         NOT NULL
                                    CHECK (species IN ('GOAT','PIG','CATTLE','CHICKEN','DUCK','RABBIT','OTHER')),
    breed              TEXT,
    tag_number         TEXT,
    sex                TEXT         CHECK (sex IN ('MALE','FEMALE','UNKNOWN')),
    birth_date         DATE,
    acquisition_date   DATE         NOT NULL DEFAULT CURRENT_DATE,
    acquisition_source TEXT,
    acquisition_cost_fjd NUMERIC(10,2),
    current_weight_kg  NUMERIC(8,2),
    status             TEXT         NOT NULL DEFAULT 'ACTIVE'
                                    CHECK (status IN ('ACTIVE','PREGNANT','SOLD','DECEASED','SLAUGHTERED')),
    status_date        DATE,
    notes              TEXT,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.livestock_register ENABLE ROW LEVEL SECURITY;

CREATE POLICY livestock_register_tenant_isolation ON tenant.livestock_register
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_livestock_farm    ON tenant.livestock_register(farm_id);
CREATE INDEX IF NOT EXISTS idx_livestock_species ON tenant.livestock_register(species, status);

-- =============================================================
-- 29. HIVE REGISTER
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.hive_register (
    hive_id                  TEXT         PRIMARY KEY,  -- format: HIV-F001-001
    tenant_id                UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    farm_id                  TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    zone_id                  TEXT         REFERENCES tenant.zones(zone_id),
    hive_type                TEXT         NOT NULL DEFAULT 'LANGSTROTH'
                                          CHECK (hive_type IN ('LANGSTROTH','TOP_BAR','WARRE','TRADITIONAL')),
    installation_date        DATE,
    colony_strength          TEXT         CHECK (colony_strength IN ('STRONG','MEDIUM','WEAK','QUEENLESS','EMPTY')),
    last_inspection_date     DATE,
    last_harvest_date        DATE,
    honey_yield_kg_last      NUMERIC(8,3),
    varroa_treatment_date    DATE,
    varroa_treatment_product TEXT,
    status                   TEXT         NOT NULL DEFAULT 'ACTIVE'
                                          CHECK (status IN ('ACTIVE','INACTIVE','DEAD','RELOCATED')),
    notes                    TEXT,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.hive_register ENABLE ROW LEVEL SECURITY;

CREATE POLICY hive_register_tenant_isolation ON tenant.hive_register
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_hive_farm ON tenant.hive_register(farm_id);

-- =============================================================
-- 30. AUTOMATION RULES
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.automation_rules (
    rule_id                  TEXT         PRIMARY KEY,  -- format: RULE-001 to RULE-043
    tenant_id                UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    rule_name                TEXT         NOT NULL,
    trigger_category         TEXT         NOT NULL,
    trigger_condition        TEXT         NOT NULL,
    trigger_threshold_value  NUMERIC,
    trigger_threshold_unit   TEXT,
    action_type              TEXT         NOT NULL
                                          CHECK (action_type IN ('ALERT','TASK','AUTO_ORDER','AUTO_CLOSE','ESCALATE','BLOCK','LOG')),
    action_description       TEXT         NOT NULL,
    alert_severity           TEXT         CHECK (alert_severity IN ('CRITICAL','HIGH','MEDIUM','LOW','INFO')),
    whatsapp_template        TEXT,
    notify_roles             TEXT[]       NOT NULL DEFAULT ARRAY['FOUNDER'],
    auto_resolve             BOOLEAN      NOT NULL DEFAULT false,
    auto_resolve_condition   TEXT,
    farm_specific            BOOLEAN      NOT NULL DEFAULT false,
    farm_id                  TEXT         REFERENCES tenant.farms(farm_id),
    is_active                BOOLEAN      NOT NULL DEFAULT true,
    last_triggered_at        TIMESTAMPTZ,
    trigger_count            INTEGER      NOT NULL DEFAULT 0,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY automation_rules_tenant_isolation ON tenant.automation_rules
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_automation_rules_active ON tenant.automation_rules(is_active, trigger_category);

-- =============================================================
-- 31. TASK QUEUE
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.task_queue (
    task_id               TEXT         PRIMARY KEY,
    tenant_id             UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    farm_id               TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    rule_id               TEXT         REFERENCES tenant.automation_rules(rule_id),
    task_type             TEXT         NOT NULL
                                       CHECK (task_type IN ('ALERT','FIELD_TASK','ORDER','REMINDER','INSPECTION','OTHER')),
    title                 TEXT         NOT NULL,
    description           TEXT,
    assigned_to_worker_id TEXT         REFERENCES tenant.workers(worker_id),
    assigned_to_user_id   UUID         REFERENCES tenant.users(user_id),
    priority              TEXT         NOT NULL DEFAULT 'MEDIUM'
                                       CHECK (priority IN ('CRITICAL','HIGH','MEDIUM','LOW')),
    due_date              DATE,
    due_time              TIME,
    status                TEXT         NOT NULL DEFAULT 'OPEN'
                                       CHECK (status IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED','ESCALATED')),
    completed_at          TIMESTAMPTZ,
    completed_by          UUID         REFERENCES tenant.users(user_id),
    cycle_id              TEXT         REFERENCES tenant.production_cycles(cycle_id),
    pu_id                 TEXT         REFERENCES tenant.production_units(pu_id),
    notes                 TEXT,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.task_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_queue_tenant_isolation ON tenant.task_queue
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_task_queue_farm ON tenant.task_queue(farm_id, due_date);
CREATE INDEX IF NOT EXISTS idx_task_queue_open ON tenant.task_queue(farm_id, priority)
    WHERE status IN ('OPEN','IN_PROGRESS');

-- =============================================================
-- 32. ALERTS
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.alerts (
    alert_id           TEXT         PRIMARY KEY,
    tenant_id          UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    farm_id            TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    rule_id            TEXT         REFERENCES tenant.automation_rules(rule_id),
    alert_key          TEXT         NOT NULL,  -- deduplication key: rule_id + farm_id + entity_id + YYYYMMDD
    severity           TEXT         NOT NULL
                                    CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW','INFO')),
    title              TEXT         NOT NULL,
    message            TEXT         NOT NULL,
    alert_status       TEXT         NOT NULL DEFAULT 'ACTIVE'
                                    CHECK (alert_status IN ('ACTIVE','ACKNOWLEDGED','RESOLVED','SUPPRESSED')),
    triggered_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    acknowledged_at    TIMESTAMPTZ,
    acknowledged_by    UUID         REFERENCES tenant.users(user_id),
    resolved_at        TIMESTAMPTZ,
    resolved_by        UUID         REFERENCES tenant.users(user_id),
    resolution_notes   TEXT,
    whatsapp_sent      BOOLEAN      NOT NULL DEFAULT false,
    whatsapp_sent_at   TIMESTAMPTZ,
    whatsapp_message_sid TEXT,
    entity_type        TEXT,  -- 'cycle', 'input', 'worker', etc.
    entity_id          TEXT,
    metadata           JSONB,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(alert_key)  -- prevent duplicate alerts for same event
);

ALTER TABLE tenant.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY alerts_tenant_isolation ON tenant.alerts
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_alerts_farm   ON tenant.alerts(farm_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON tenant.alerts(farm_id, severity)
    WHERE alert_status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_alerts_key    ON tenant.alerts(alert_key);

-- =============================================================
-- 33. DECISION SIGNALS (config + snapshots)
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.decision_signal_config (
    signal_id           TEXT         PRIMARY KEY,  -- DS-001 to DS-010
    tenant_id           UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    signal_name         TEXT         NOT NULL,
    signal_category     TEXT         NOT NULL,
    green_threshold     NUMERIC,
    amber_threshold     NUMERIC,
    red_threshold       NUMERIC,
    threshold_direction TEXT         NOT NULL DEFAULT 'LOWER_IS_BETTER'
                                     CHECK (threshold_direction IN ('LOWER_IS_BETTER','HIGHER_IS_BETTER')),
    is_active           BOOLEAN      NOT NULL DEFAULT true,
    custom_formula      TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.decision_signal_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY dsc_tenant_isolation ON tenant.decision_signal_config
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE TABLE IF NOT EXISTS tenant.decision_signal_snapshots (
    snapshot_id     TEXT         NOT NULL,
    tenant_id       UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    farm_id         TEXT         NOT NULL REFERENCES tenant.farms(farm_id),
    snapshot_date   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    signal_id       TEXT         NOT NULL REFERENCES tenant.decision_signal_config(signal_id),
    computed_value  NUMERIC,
    signal_status   TEXT         NOT NULL CHECK (signal_status IN ('GREEN','AMBER','RED','NULL')),
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (snapshot_id, snapshot_date)
);

ALTER TABLE tenant.decision_signal_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY dss_tenant_isolation ON tenant.decision_signal_snapshots
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

SELECT create_hypertable(
    'tenant.decision_signal_snapshots',
    'snapshot_date',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_dss_farm_signal ON tenant.decision_signal_snapshots(farm_id, signal_id, snapshot_date DESC);

-- =============================================================
-- 34. TIS TABLES (ai_commands, tis_conversations, tis_voice_logs)
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.ai_commands (
    command_id        TEXT         NOT NULL,
    tenant_id         UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    user_id           UUID         NOT NULL REFERENCES tenant.users(user_id),
    farm_id           TEXT         REFERENCES tenant.farms(farm_id),
    command_type      TEXT         NOT NULL,  -- LOG_HARVEST, CHECK_TASKS, etc.
    command_date      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    raw_input         TEXT         NOT NULL,
    parsed_intent     JSONB,
    execution_status  TEXT         NOT NULL DEFAULT 'PENDING'
                                   CHECK (execution_status IN ('PENDING','SUCCESS','FAILED','REQUIRES_CONFIRM')),
    result_summary    TEXT,
    error_message     TEXT,
    tis_module        TEXT         NOT NULL
                                   CHECK (tis_module IN ('KNOWLEDGE_BROKER','OPERATIONAL_INTERPRETER','COMMAND_EXECUTOR')),
    tokens_used       INTEGER,
    latency_ms        INTEGER,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (command_id, command_date)
);

ALTER TABLE tenant.ai_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_commands_tenant_isolation ON tenant.ai_commands
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

SELECT create_hypertable(
    'tenant.ai_commands',
    'command_date',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_ai_commands_user ON tenant.ai_commands(user_id, command_date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_commands_type ON tenant.ai_commands(command_type, command_date DESC);

-- -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tenant.tis_conversations (
    conversation_id       TEXT         PRIMARY KEY,
    tenant_id             UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    user_id               UUID         NOT NULL REFERENCES tenant.users(user_id),
    farm_id               TEXT         REFERENCES tenant.farms(farm_id),
    started_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_message_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    message_count         INTEGER      NOT NULL DEFAULT 0,
    tis_module            TEXT         NOT NULL
                                       CHECK (tis_module IN ('KNOWLEDGE_BROKER','OPERATIONAL_INTERPRETER','COMMAND_EXECUTOR')),
    conversation_history  JSONB        NOT NULL DEFAULT '[]'::JSONB,
    total_tokens_used     INTEGER      NOT NULL DEFAULT 0,
    is_active             BOOLEAN      NOT NULL DEFAULT true,
    ended_at              TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.tis_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tis_conversations_tenant_isolation ON tenant.tis_conversations
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_tis_conv_user ON tenant.tis_conversations(user_id, started_at DESC);

-- -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tenant.tis_voice_logs (
    voice_log_id       TEXT         NOT NULL,
    tenant_id          UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    user_id            UUID         NOT NULL REFERENCES tenant.users(user_id),
    log_date           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    audio_duration_sec NUMERIC(8,2),
    audio_size_bytes   INTEGER,
    whisper_transcript TEXT,
    whisper_latency_ms INTEGER,
    tis_latency_ms     INTEGER,
    total_latency_ms   INTEGER,
    detected_language  TEXT         DEFAULT 'en',
    tis_module         TEXT         CHECK (tis_module IN ('KNOWLEDGE_BROKER','OPERATIONAL_INTERPRETER','COMMAND_EXECUTOR')),
    command_id         TEXT,
    success            BOOLEAN      NOT NULL DEFAULT false,
    error_type         TEXT,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (voice_log_id, log_date)
);

ALTER TABLE tenant.tis_voice_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tis_voice_logs_tenant_isolation ON tenant.tis_voice_logs
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

SELECT create_hypertable(
    'tenant.tis_voice_logs',
    'log_date',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_tis_voice_user ON tenant.tis_voice_logs(user_id, log_date DESC);

-- =============================================================
-- 35. ROTATION OVERRIDE LOG (insert-only audit trail via RLS)
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.rotation_override_log (
    override_id                   TEXT         PRIMARY KEY,
    tenant_id                     UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    pu_id                         TEXT         NOT NULL REFERENCES tenant.production_units(pu_id),
    requested_production_id       TEXT         NOT NULL REFERENCES shared.productions(production_id),
    rotation_status               TEXT         NOT NULL,
    override_reason               TEXT         NOT NULL,
    agronomic_risk_acknowledged   BOOLEAN      NOT NULL DEFAULT false,
    approved_by                   UUID         NOT NULL REFERENCES tenant.users(user_id),
    approved_at                   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    cycle_id                      TEXT         REFERENCES tenant.production_cycles(cycle_id),
    created_at                    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.rotation_override_log ENABLE ROW LEVEL SECURITY;

-- Read-only for all (no UPDATE/DELETE allowed via RLS — insert-only audit trail)
CREATE POLICY rotation_override_select ON tenant.rotation_override_log
    FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE POLICY rotation_override_insert ON tenant.rotation_override_log
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_rotation_override_pu ON tenant.rotation_override_log(pu_id, approved_at DESC);

-- =============================================================
-- 36. KB EMBEDDINGS (tenant-specific KB chunks with pgvector)
-- =============================================================

CREATE TABLE IF NOT EXISTS tenant.kb_embeddings (
    embedding_id  TEXT         PRIMARY KEY,
    tenant_id     UUID         NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
    kb_entry_id   TEXT,  -- links to shared.kb_entries if from shared KB
    source_type   TEXT         NOT NULL
                               CHECK (source_type IN ('SHARED_KB','TENANT_DOCUMENT','AGRONOMIC_NOTE','REGULATION')),
    title         TEXT         NOT NULL,
    content_chunk TEXT         NOT NULL,
    chunk_index   INTEGER      NOT NULL DEFAULT 0,
    embedding     vector(1536),  -- OpenAI text-embedding-3-small
    rag_status    TEXT         NOT NULL DEFAULT 'VALIDATED'
                               CHECK (rag_status IN ('VALIDATED','DRAFT','REJECTED')),
    validated_by  UUID         REFERENCES tenant.users(user_id),
    validated_at  TIMESTAMPTZ,
    language      TEXT         NOT NULL DEFAULT 'en',
    tags          TEXT[],
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.kb_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY kb_embeddings_tenant_isolation ON tenant.kb_embeddings
    USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE INDEX IF NOT EXISTS idx_kb_embeddings_ivfflat ON tenant.kb_embeddings
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_kb_embeddings_status ON tenant.kb_embeddings(tenant_id, rag_status);

-- =============================================================
-- TRIGGER FUNCTIONS
-- =============================================================

-- ------------------------------------------------------------------
-- Auto-update updated_at timestamp
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tenant.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables that have an updated_at column
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'tenants',
        'users',
        'farms',
        'zones',
        'production_units',
        'workers',
        'suppliers',
        'customers',
        'equipment',
        'inputs',
        'production_cycles',
        'cycle_financials',
        'profit_share',
        'accounts_receivable',
        'price_master',
        'livestock_register',
        'hive_register',
        'automation_rules',
        'task_queue',
        'orders'
    ]) LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS update_%s_updated_at ON tenant.%s',
            t, t
        );
        EXECUTE format(
            'CREATE TRIGGER update_%s_updated_at
             BEFORE UPDATE ON tenant.%s
             FOR EACH ROW EXECUTE FUNCTION tenant.update_updated_at_column()',
            t, t
        );
    END LOOP;
END;
$$;

-- ------------------------------------------------------------------
-- Chemical compliance trigger: blocks harvest if WHD not cleared
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tenant.check_harvest_chemical_compliance()
RETURNS TRIGGER AS $$
DECLARE
    v_last_chemical_date  DATE;
    v_max_whd             INTEGER := 0;
    v_clearance_date      DATE;
    v_planting_date       DATE;
BEGIN
    -- Retrieve the planting date for this cycle
    SELECT planting_date
    INTO   v_planting_date
    FROM   tenant.production_cycles
    WHERE  cycle_id = NEW.cycle_id;

    -- Find most recent chemical application for this PU within the active cycle
    SELECT
        MAX(fe.event_date::DATE),
        MAX(COALESCE(cl.withholding_days_harvest, 0))
    INTO v_last_chemical_date, v_max_whd
    FROM   tenant.field_events  fe
    JOIN   shared.chemical_library cl ON cl.chemical_id = fe.chemical_id
    WHERE  fe.pu_id              = NEW.pu_id
      AND  fe.chemical_application = true
      AND  fe.event_date          >= v_planting_date;

    IF v_last_chemical_date IS NOT NULL THEN
        v_clearance_date       := v_last_chemical_date + v_max_whd;
        NEW.last_chemical_date := v_last_chemical_date;
        NEW.whd_clearance_date := v_clearance_date;

        IF CURRENT_DATE < v_clearance_date AND NOT NEW.compliance_override THEN
            RAISE EXCEPTION
                'CHEMICAL_COMPLIANCE_VIOLATION: Cannot harvest. '
                'Last chemical application: %. '
                'WHD clearance date: %. '
                'Days remaining: %.',
                v_last_chemical_date,
                v_clearance_date,
                (v_clearance_date - CURRENT_DATE);
        END IF;

        NEW.chemical_compliance_cleared :=
            (CURRENT_DATE >= v_clearance_date OR NEW.compliance_override);
    ELSE
        -- No chemical applications on record — compliance automatically met
        NEW.chemical_compliance_cleared := true;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER harvest_compliance_check
    BEFORE INSERT ON tenant.harvest_log
    FOR EACH ROW EXECUTE FUNCTION tenant.check_harvest_chemical_compliance();

-- ------------------------------------------------------------------
-- Update production cycle totals when a harvest row is inserted
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tenant.update_cycle_on_harvest()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE tenant.production_cycles
    SET
        actual_yield_kg   = COALESCE(actual_yield_kg, 0) + NEW.marketable_yield_kg,
        total_revenue_fjd = (
            SELECT COALESCE(SUM(net_amount_fjd), 0)
            FROM   tenant.income_log
            WHERE  cycle_id = NEW.cycle_id
        ),
        updated_at        = NOW()
    WHERE cycle_id = NEW.cycle_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cycle_on_harvest_insert
    AFTER INSERT ON tenant.harvest_log
    FOR EACH ROW EXECUTE FUNCTION tenant.update_cycle_on_harvest();

-- ------------------------------------------------------------------
-- Update input stock quantity on every input_transaction insert
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tenant.update_input_stock()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE tenant.inputs
    SET
        current_stock_qty = current_stock_qty + NEW.qty_change,
        updated_at        = NOW()
    WHERE input_id  = NEW.input_id
      AND tenant_id = NEW.tenant_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_input_stock_on_txn
    AFTER INSERT ON tenant.input_transactions
    FOR EACH ROW EXECUTE FUNCTION tenant.update_input_stock();

-- ------------------------------------------------------------------
-- Recompute cycle_financials summary after any income_log insert
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tenant.recompute_cycle_financials()
RETURNS TRIGGER AS $$
DECLARE
    v_total_labor   NUMERIC(12,2);
    v_total_input   NUMERIC(12,2);
    v_total_revenue NUMERIC(12,2);
    v_total_harvest NUMERIC(10,3);
    v_farm_id       TEXT;
    v_tenant_id     UUID;
BEGIN
    IF NEW.cycle_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Pull aggregates from child tables
    SELECT COALESCE(SUM(total_pay_fjd + COALESCE(overtime_pay_fjd, 0)), 0)
    INTO   v_total_labor
    FROM   tenant.labor_attendance
    WHERE  cycle_id = NEW.cycle_id;

    SELECT COALESCE(SUM(total_cost_fjd), 0)
    INTO   v_total_input
    FROM   tenant.input_transactions
    WHERE  cycle_id = NEW.cycle_id
      AND  txn_type IN ('PURCHASE','USAGE');

    SELECT COALESCE(SUM(net_amount_fjd), 0)
    INTO   v_total_revenue
    FROM   tenant.income_log
    WHERE  cycle_id = NEW.cycle_id;

    SELECT COALESCE(SUM(marketable_yield_kg), 0)
    INTO   v_total_harvest
    FROM   tenant.harvest_log
    WHERE  cycle_id = NEW.cycle_id;

    SELECT farm_id, tenant_id
    INTO   v_farm_id, v_tenant_id
    FROM   tenant.production_cycles
    WHERE  cycle_id = NEW.cycle_id;

    INSERT INTO tenant.cycle_financials (
        financial_id,
        tenant_id,
        cycle_id,
        farm_id,
        total_labor_cost_fjd,
        total_input_cost_fjd,
        total_other_cost_fjd,
        total_cost_fjd,
        total_revenue_fjd,
        gross_profit_fjd,
        gross_margin_pct,
        total_harvest_kg,
        cogk_fjd_per_kg,
        labor_cost_ratio_pct,
        last_computed_at,
        created_at,
        updated_at
    )
    VALUES (
        'FIN-' || NEW.cycle_id,
        v_tenant_id,
        NEW.cycle_id,
        v_farm_id,
        v_total_labor,
        v_total_input,
        0,
        v_total_labor + v_total_input,
        v_total_revenue,
        v_total_revenue - (v_total_labor + v_total_input),
        CASE
            WHEN v_total_revenue > 0
            THEN ROUND(((v_total_revenue - (v_total_labor + v_total_input)) / v_total_revenue) * 100, 2)
            ELSE NULL
        END,
        v_total_harvest,
        CASE
            WHEN v_total_harvest > 0
            THEN ROUND((v_total_labor + v_total_input) / v_total_harvest, 4)
            ELSE NULL
        END,
        CASE
            WHEN (v_total_labor + v_total_input) > 0
            THEN ROUND((v_total_labor / (v_total_labor + v_total_input)) * 100, 2)
            ELSE NULL
        END,
        NOW(),
        NOW(),
        NOW()
    )
    ON CONFLICT (cycle_id) DO UPDATE
    SET
        total_labor_cost_fjd = EXCLUDED.total_labor_cost_fjd,
        total_input_cost_fjd = EXCLUDED.total_input_cost_fjd,
        total_cost_fjd       = EXCLUDED.total_cost_fjd,
        total_revenue_fjd    = EXCLUDED.total_revenue_fjd,
        gross_profit_fjd     = EXCLUDED.gross_profit_fjd,
        gross_margin_pct     = EXCLUDED.gross_margin_pct,
        total_harvest_kg     = EXCLUDED.total_harvest_kg,
        cogk_fjd_per_kg      = EXCLUDED.cogk_fjd_per_kg,
        labor_cost_ratio_pct = EXCLUDED.labor_cost_ratio_pct,
        last_computed_at     = NOW(),
        updated_at           = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recompute_financials_on_income
    AFTER INSERT ON tenant.income_log
    FOR EACH ROW EXECUTE FUNCTION tenant.recompute_cycle_financials();

-- ------------------------------------------------------------------
-- Auto-populate whd_clearance_date on field_events (chemical sprays)
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tenant.set_whd_clearance_date()
RETURNS TRIGGER AS $$
DECLARE
    v_whd INTEGER := 0;
BEGIN
    IF NEW.chemical_application = true AND NEW.chemical_id IS NOT NULL THEN
        SELECT COALESCE(withholding_days_harvest, 0)
        INTO   v_whd
        FROM   shared.chemical_library
        WHERE  chemical_id = NEW.chemical_id;

        NEW.whd_clearance_date := NEW.event_date::DATE + v_whd;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_field_event_whd
    BEFORE INSERT ON tenant.field_events
    FOR EACH ROW EXECUTE FUNCTION tenant.set_whd_clearance_date();

-- ------------------------------------------------------------------
-- Guard: prevent stock from going negative on USAGE/WASTE transactions
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tenant.check_stock_not_negative()
RETURNS TRIGGER AS $$
DECLARE
    v_current_stock NUMERIC(12,3);
BEGIN
    IF NEW.txn_type IN ('USAGE','WASTE','TRANSFER') AND NEW.qty_change < 0 THEN
        SELECT current_stock_qty
        INTO   v_current_stock
        FROM   tenant.inputs
        WHERE  input_id  = NEW.input_id
          AND  tenant_id = NEW.tenant_id;

        IF (v_current_stock + NEW.qty_change) < 0 THEN
            RAISE EXCEPTION
                'INSUFFICIENT_STOCK: Input % has %.3f units in stock. '
                'Requested usage: %.3f. Would result in negative stock.',
                NEW.input_id,
                v_current_stock,
                ABS(NEW.qty_change);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_stock_before_txn
    BEFORE INSERT ON tenant.input_transactions
    FOR EACH ROW EXECUTE FUNCTION tenant.check_stock_not_negative();

-- ------------------------------------------------------------------
-- Increment automation_rules.trigger_count when an alert fires
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tenant.increment_rule_trigger_count()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.rule_id IS NOT NULL THEN
        UPDATE tenant.automation_rules
        SET
            trigger_count     = trigger_count + 1,
            last_triggered_at = NOW(),
            updated_at        = NOW()
        WHERE rule_id  = NEW.rule_id
          AND tenant_id = NEW.tenant_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER increment_rule_count_on_alert
    AFTER INSERT ON tenant.alerts
    FOR EACH ROW EXECUTE FUNCTION tenant.increment_rule_trigger_count();

-- ------------------------------------------------------------------
-- TIS rate-limit guard: blocks ai_commands if daily limit exceeded
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tenant.check_tis_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_calls_today   INTEGER;
    v_daily_limit   INTEGER;
    v_reset_at      TIMESTAMPTZ;
BEGIN
    SELECT tis_calls_today, tis_daily_limit, tis_calls_reset_at
    INTO   v_calls_today, v_daily_limit, v_reset_at
    FROM   tenant.tenants
    WHERE  tenant_id = NEW.tenant_id;

    -- Reset counter if it's a new calendar day (Pacific/Fiji)
    IF v_reset_at::DATE < NOW()::DATE THEN
        UPDATE tenant.tenants
        SET
            tis_calls_today  = 1,
            tis_calls_reset_at = NOW()
        WHERE tenant_id = NEW.tenant_id;
        RETURN NEW;
    END IF;

    IF v_calls_today >= v_daily_limit THEN
        RAISE EXCEPTION
            'TIS_RATE_LIMIT_EXCEEDED: Tenant % has used %/% TIS calls today. '
            'Limit resets tomorrow.',
            NEW.tenant_id,
            v_calls_today,
            v_daily_limit;
    END IF;

    UPDATE tenant.tenants
    SET    tis_calls_today = tis_calls_today + 1
    WHERE  tenant_id = NEW.tenant_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tis_rate_limit_check
    BEFORE INSERT ON tenant.ai_commands
    FOR EACH ROW EXECUTE FUNCTION tenant.check_tis_rate_limit();

-- =============================================================
-- END 02_tenant_schema.sql
-- Total tables: 36 (including TimescaleDB hypertables)
-- TimescaleDB hypertables (8):
--   field_events, harvest_log, income_log, labor_attendance,
--   weather_log, decision_signal_snapshots, ai_commands, tis_voice_logs
-- RLS enabled on all 36 tables
-- Trigger functions (8):
--   update_updated_at_column, check_harvest_chemical_compliance,
--   update_cycle_on_harvest, update_input_stock,
--   recompute_cycle_financials, set_whd_clearance_date,
--   check_stock_not_negative, increment_rule_trigger_count,
--   check_tis_rate_limit
-- Run 03_materialized_views.sql next
-- =============================================================
