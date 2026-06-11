-- INGEST TEMPLATE — Ministry / exporter price feed -> external.market_prices (I6)
-- ===========================================================================
-- When authoritative prices arrive, ingestion is THIS file, run as owner:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < INGEST_market_<date>.sql
-- Table + read endpoint + Market dome already live (migration 113). Idempotent.
--
-- price_tier is the whole point of the feed: FARMGATE / WHOLESALE / RETAIL /
-- EXPORT. The farmgate->wholesale spread is the lender/extension signal.
-- commodity_id should match shared.productions.production_id where known (lets
-- the dome line authoritative prices up against farmers' logged harvests).
-- region_id NULL = national price; province codes (FJI-BA, …) for regional.

INSERT INTO external.market_prices
    (commodity_id, commodity_name, region_id, price_tier, price_fjd, unit, observed_at, source)
VALUES
    -- ('CRP-TOM', 'Tomato',   NULL,    'FARMGATE',  1.20, 'kg', '2026-06-10', 'MINISTRY'),
    -- ('CRP-TOM', 'Tomato',   'FJI-C', 'WHOLESALE', 2.10, 'kg', '2026-06-10', 'MINISTRY'),
    -- ('CRP-DAL', 'Dalo',     NULL,    'EXPORT',    3.40, 'kg', '2026-06-10', 'EXPORTER'),
    (NULL, NULL, NULL, 'FARMGATE', 0, 'kg', NULL, NULL)  -- replace this row with real data
ON CONFLICT (commodity_name, region_id, price_tier, observed_at, source) DO UPDATE SET
    price_fjd    = EXCLUDED.price_fjd,
    unit         = EXCLUDED.unit,
    commodity_id = EXCLUDED.commodity_id,
    ingested_at  = now();

-- CSV bulk pattern:
--   CREATE TEMP TABLE _m (commodity_id text, commodity_name text, region_id text, price_tier text,
--                         price_fjd float, unit text, observed_at date);
--   \copy _m FROM 'ministry_prices.csv' WITH (FORMAT csv, HEADER true);
--   INSERT INTO external.market_prices
--     (commodity_id, commodity_name, region_id, price_tier, price_fjd, unit, observed_at, source)
--   SELECT commodity_id, commodity_name, region_id, price_tier, price_fjd, COALESCE(unit,'kg'), observed_at, 'MINISTRY'
--   FROM _m
--   ON CONFLICT (commodity_name, region_id, price_tier, observed_at, source) DO UPDATE SET price_fjd = EXCLUDED.price_fjd;

SELECT count(*) AS price_rows, count(DISTINCT commodity_name) AS commodities,
       count(DISTINCT price_tier) AS tiers, max(observed_at) AS latest
FROM external.market_prices;
