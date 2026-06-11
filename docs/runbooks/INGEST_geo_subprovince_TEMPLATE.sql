-- INGEST TEMPLATE — Bureau of Statistics / iTaukei Lands sub-province geo (I4b)
-- ===========================================================================
-- geo_regions ALREADY supports DISTRICT / TIKINA / VILLAGE (migration 112 CHECK)
-- and centroid_lat/lng columns. Loading the dataset is data-only — no schema
-- change. Run as owner:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < INGEST_geo_<date>.sql
-- The recursive roll-up CTE + Geographic dome pick up the new levels with zero
-- code change. Idempotent (ON CONFLICT on region_id).
--
-- parent_region_id MUST reference an existing row, so load top-down:
--   DISTRICT (parent = a PROVINCE like FJI-BA) -> TIKINA -> VILLAGE.
-- Use stable region_id codes from the source (or synthesise FJI-<PROV>-<n>).

INSERT INTO shared.geo_regions (region_id, level, name, parent_region_id, centroid_lat, centroid_lng, code) VALUES
    -- ('FJI-BA-D01', 'DISTRICT', 'Tavua',    'FJI-BA',     -17.44, 177.86, 'TAV'),
    -- ('FJI-BA-T01', 'TIKINA',   'Nadarivatu','FJI-BA-D01', -17.55, 177.98, 'NAD'),
    -- ('FJI-BA-V01', 'VILLAGE',  'Navai',    'FJI-BA-T01', -17.61, 177.99, 'NAV'),
    (NULL, 'DISTRICT', NULL, NULL, NULL, NULL, NULL)  -- replace with real data
ON CONFLICT (region_id) DO UPDATE SET
    name             = EXCLUDED.name,
    parent_region_id = EXCLUDED.parent_region_id,
    centroid_lat     = EXCLUDED.centroid_lat,
    centroid_lng     = EXCLUDED.centroid_lng,
    code             = EXCLUDED.code;

-- Then (optionally) re-point farms to their precise region with a backfill that
-- matches farms.location_island / address text to the new tikina/village names
-- (exact-contains only — never guess; unmatched farms stay at province level):
--   UPDATE tenant.farms f SET region_id = g.region_id
--   FROM shared.geo_regions g
--   WHERE g.level IN ('TIKINA','VILLAGE')
--     AND f.location_island ILIKE '%' || g.name || '%';

SELECT level, count(*) FROM shared.geo_regions GROUP BY 1 ORDER BY 1;
