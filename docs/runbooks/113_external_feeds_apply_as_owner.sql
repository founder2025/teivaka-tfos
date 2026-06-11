-- 113 external feeds spine — apply-as-owner (Strike #123). Idempotent.
-- GENERATED from alembic/versions/113_external_feeds.py STATEMENTS — keep in sync.
-- Creates the `external` schema + weather_observations + market_prices tables.
-- App role gets SELECT only; feeds are loaded by operator/worker runbooks
-- (see INGEST_*_TEMPLATE.sql) so ingestion is a data load, not a code change.

CREATE SCHEMA IF NOT EXISTS external;

CREATE TABLE IF NOT EXISTS external.weather_observations (
    obs_id        BIGSERIAL PRIMARY KEY,
    region_id     TEXT REFERENCES shared.geo_regions(region_id),
    observed_date DATE NOT NULL,
    rainfall_mm   DOUBLE PRECISION,
    temp_min_c    DOUBLE PRECISION,
    temp_max_c    DOUBLE PRECISION,
    humidity_pct  DOUBLE PRECISION,
    wind_kph      DOUBLE PRECISION,
    event_type    TEXT,
    source        TEXT NOT NULL DEFAULT 'MET_SERVICE',
    ingested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_weather_region_date_source UNIQUE (region_id, observed_date, source)
);
CREATE INDEX IF NOT EXISTS idx_weather_region_date ON external.weather_observations(region_id, observed_date DESC);

CREATE TABLE IF NOT EXISTS external.market_prices (
    price_id       BIGSERIAL PRIMARY KEY,
    commodity_id   TEXT,
    commodity_name TEXT NOT NULL,
    region_id      TEXT REFERENCES shared.geo_regions(region_id),
    price_tier     TEXT NOT NULL CHECK (price_tier IN ('FARMGATE','WHOLESALE','RETAIL','EXPORT')),
    price_fjd      DOUBLE PRECISION NOT NULL,
    unit           TEXT NOT NULL DEFAULT 'kg',
    observed_at    DATE NOT NULL,
    source         TEXT NOT NULL DEFAULT 'MINISTRY',
    ingested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_market_commodity_region_tier_date_source
        UNIQUE (commodity_name, region_id, price_tier, observed_at, source)
);
CREATE INDEX IF NOT EXISTS idx_market_commodity_date ON external.market_prices(commodity_name, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_region ON external.market_prices(region_id);

GRANT USAGE ON SCHEMA external TO teivaka_app;
GRANT SELECT ON external.weather_observations TO teivaka_app;
GRANT SELECT ON external.market_prices TO teivaka_app;

-- verify
SELECT (to_regclass('external.weather_observations') IS NOT NULL)::int
     + (to_regclass('external.market_prices') IS NOT NULL)::int AS objects_2;
