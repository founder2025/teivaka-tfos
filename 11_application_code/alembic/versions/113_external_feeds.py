"""113 - External feeds spine (Intelligence Engine I6/I7 backend, awaiting data)

Wires the durable backend for the two partnership-gated feeds so that when the
data arrives it is a LOAD, not a build:

  - external.weather_observations  (I7 — Fiji Met Service)
  - external.market_prices         (I6 — Ministry of Agriculture / exporters)

Design notes:
- New `external` schema for third-party ingested feeds. This is deliberately
  NOT shared.* — Inviolable #7 forbids the runtime app writing shared.*; keeping
  feeds here lets an operator runbook / ingestion worker load them while the app
  has SELECT-only. Loads happen via apply-as-owner runbooks (the "data load").
- Both carry the AI-ready fact shape: region_id (FK shared.geo_regions, I4) +
  a date + source, so every row joins straight into the geographic roll-up and
  the future feature store (I8). NOT tenant data — no RLS (reference feeds).
- UNIQUE keys make re-ingestion idempotent (UPSERT on (region, date, source)).
- Sub-province geo (DISTRICT/TIKINA/VILLAGE) needs no schema change — geo_regions
  already supports those levels (migration 112); that load is data-only too.
"""
from alembic import op

revision = "113_external_feeds"
down_revision = "112_geo_regions"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


STATEMENTS = [
    "CREATE SCHEMA IF NOT EXISTS external",
    # ---- I7: weather observations (Met Service) ----------------------------
    """
    CREATE TABLE IF NOT EXISTS external.weather_observations (
        obs_id        BIGSERIAL PRIMARY KEY,
        region_id     TEXT REFERENCES shared.geo_regions(region_id),
        observed_date DATE NOT NULL,
        rainfall_mm   DOUBLE PRECISION,
        temp_min_c    DOUBLE PRECISION,
        temp_max_c    DOUBLE PRECISION,
        humidity_pct  DOUBLE PRECISION,
        wind_kph      DOUBLE PRECISION,
        event_type    TEXT,                       -- optional: CYCLONE / DROUGHT / NORMAL / ...
        source        TEXT NOT NULL DEFAULT 'MET_SERVICE',
        ingested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_weather_region_date_source UNIQUE (region_id, observed_date, source)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_weather_region_date ON external.weather_observations(region_id, observed_date DESC)",
    # ---- I6: market prices (Ministry / exporters) --------------------------
    """
    CREATE TABLE IF NOT EXISTS external.market_prices (
        price_id       BIGSERIAL PRIMARY KEY,
        commodity_id   TEXT,                       -- maps to shared.productions.production_id where known
        commodity_name TEXT NOT NULL,
        region_id      TEXT REFERENCES shared.geo_regions(region_id),  -- NULL = national
        price_tier     TEXT NOT NULL CHECK (price_tier IN ('FARMGATE','WHOLESALE','RETAIL','EXPORT')),
        price_fjd      DOUBLE PRECISION NOT NULL,
        unit           TEXT NOT NULL DEFAULT 'kg',
        observed_at    DATE NOT NULL,
        source         TEXT NOT NULL DEFAULT 'MINISTRY',
        ingested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_market_commodity_region_tier_date_source
            UNIQUE (commodity_name, region_id, price_tier, observed_at, source)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_market_commodity_date ON external.market_prices(commodity_name, observed_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_market_region ON external.market_prices(region_id)",
    # ---- grants: app reads only; loads are operator/worker (apply-as-owner) -
    "GRANT USAGE ON SCHEMA external TO teivaka_app",
    "GRANT SELECT ON external.weather_observations TO teivaka_app",
    "GRANT SELECT ON external.market_prices TO teivaka_app",
]


def upgrade():
    _exec_each(STATEMENTS)


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS external.market_prices",
        "DROP TABLE IF EXISTS external.weather_observations",
        "DROP SCHEMA IF EXISTS external",
    ])
