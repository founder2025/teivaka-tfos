-- INGEST TEMPLATE — Fiji Met Service weather feed -> external.weather_observations (I7)
-- ===========================================================================
-- When the Met Service feed arrives, ingestion is THIS file, run as owner:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < INGEST_weather_<date>.sql
-- No code change, no migration, no redeploy — the table + read endpoint + dome
-- are already live (migration 113). Re-running is safe (UPSERT on the unique key).
--
-- region_id must be a real shared.geo_regions row. Province-level codes exist
-- today (FJI-BA, FJI-KAD, …); sub-province codes appear once the Bureau geo
-- dataset is loaded. NULL region_id is allowed for national observations.
--
-- Bulk path: stage the provider CSV into a temp table then INSERT ... SELECT.
-- Inline path (small batches) shown below.

INSERT INTO external.weather_observations
    (region_id, observed_date, rainfall_mm, temp_min_c, temp_max_c, humidity_pct, wind_kph, event_type, source)
VALUES
    -- ('FJI-BA',  '2026-06-10', 12.4, 22.1, 29.8, 81, 14, 'NORMAL', 'MET_SERVICE'),
    -- ('FJI-KAD', '2026-06-10', 48.0, 23.0, 28.5, 90, 31, 'HEAVY_RAIN', 'MET_SERVICE'),
    (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)  -- replace this row with real data
ON CONFLICT (region_id, observed_date, source) DO UPDATE SET
    rainfall_mm  = EXCLUDED.rainfall_mm,
    temp_min_c   = EXCLUDED.temp_min_c,
    temp_max_c   = EXCLUDED.temp_max_c,
    humidity_pct = EXCLUDED.humidity_pct,
    wind_kph     = EXCLUDED.wind_kph,
    event_type   = EXCLUDED.event_type,
    ingested_at  = now();

-- CSV bulk pattern (preferred for large historical loads):
--   CREATE TEMP TABLE _w (region_id text, observed_date date, rainfall_mm float, temp_min_c float,
--                         temp_max_c float, humidity_pct float, wind_kph float, event_type text);
--   \copy _w FROM 'met_service_export.csv' WITH (FORMAT csv, HEADER true);
--   INSERT INTO external.weather_observations
--     (region_id, observed_date, rainfall_mm, temp_min_c, temp_max_c, humidity_pct, wind_kph, event_type, source)
--   SELECT region_id, observed_date, rainfall_mm, temp_min_c, temp_max_c, humidity_pct, wind_kph, event_type, 'MET_SERVICE'
--   FROM _w
--   ON CONFLICT (region_id, observed_date, source) DO UPDATE SET rainfall_mm = EXCLUDED.rainfall_mm;

SELECT count(*) AS weather_rows, min(observed_date) AS earliest, max(observed_date) AS latest
FROM external.weather_observations;
