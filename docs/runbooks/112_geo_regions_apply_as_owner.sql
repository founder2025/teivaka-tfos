-- 112 geographic registry — apply-as-owner (Strike #123). Idempotent.
-- GENERATED from alembic/versions/112_geo_regions.py STATEMENTS — keep in sync.
-- Loads Fiji COUNTRY + 4 DIVISIONS + 14 PROVINCES (public-domain admin facts).
-- DISTRICT/TIKINA/VILLAGE deliberately NOT loaded — gated on the Fiji Bureau of
-- Statistics dataset (external). shared.geo_regions is read-only at runtime.

CREATE TABLE IF NOT EXISTS shared.geo_regions (
    region_id        TEXT PRIMARY KEY,
    level            TEXT NOT NULL CHECK (level IN
                        ('COUNTRY','DIVISION','PROVINCE','DISTRICT','TIKINA','VILLAGE')),
    name             TEXT NOT NULL,
    parent_region_id TEXT REFERENCES shared.geo_regions(region_id),
    centroid_lat     DOUBLE PRECISION,
    centroid_lng     DOUBLE PRECISION,
    code             TEXT
);
CREATE INDEX IF NOT EXISTS idx_geo_regions_parent ON shared.geo_regions(parent_region_id);
CREATE INDEX IF NOT EXISTS idx_geo_regions_level ON shared.geo_regions(level);

INSERT INTO shared.geo_regions (region_id, level, name, parent_region_id, code) VALUES
    ('FJI', 'COUNTRY', 'Fiji', NULL, 'FJI'),
    ('FJI-C', 'DIVISION', 'Central', 'FJI', 'C'),
    ('FJI-W', 'DIVISION', 'Western', 'FJI', 'W'),
    ('FJI-N', 'DIVISION', 'Northern', 'FJI', 'N'),
    ('FJI-E', 'DIVISION', 'Eastern', 'FJI', 'E'),
    ('FJI-NAI', 'PROVINCE', 'Naitasiri', 'FJI-C', 'NAI'),
    ('FJI-NAM', 'PROVINCE', 'Namosi', 'FJI-C', 'NAM'),
    ('FJI-REW', 'PROVINCE', 'Rewa', 'FJI-C', 'REW'),
    ('FJI-SER', 'PROVINCE', 'Serua', 'FJI-C', 'SER'),
    ('FJI-TAI', 'PROVINCE', 'Tailevu', 'FJI-C', 'TAI'),
    ('FJI-BA', 'PROVINCE', 'Ba', 'FJI-W', 'BA'),
    ('FJI-NAD', 'PROVINCE', 'Nadroga-Navosa', 'FJI-W', 'NAD'),
    ('FJI-RA', 'PROVINCE', 'Ra', 'FJI-W', 'RA'),
    ('FJI-BUA', 'PROVINCE', 'Bua', 'FJI-N', 'BUA'),
    ('FJI-CAK', 'PROVINCE', 'Cakaudrove', 'FJI-N', 'CAK'),
    ('FJI-MAC', 'PROVINCE', 'Macuata', 'FJI-N', 'MAC'),
    ('FJI-KAD', 'PROVINCE', 'Kadavu', 'FJI-E', 'KAD'),
    ('FJI-LAU', 'PROVINCE', 'Lau', 'FJI-E', 'LAU'),
    ('FJI-LOM', 'PROVINCE', 'Lomaiviti', 'FJI-E', 'LOM')
ON CONFLICT (region_id) DO NOTHING;

GRANT SELECT ON shared.geo_regions TO teivaka_app;

ALTER TABLE tenant.farms ADD COLUMN IF NOT EXISTS region_id TEXT REFERENCES shared.geo_regions(region_id);
CREATE INDEX IF NOT EXISTS idx_farms_region ON tenant.farms(region_id);

UPDATE tenant.farms f SET region_id = g.region_id
FROM shared.geo_regions g
WHERE f.region_id IS NULL AND g.level = 'PROVINCE'
  AND f.location_island IS NOT NULL
  AND f.location_island ILIKE '%' || g.name || '%';

UPDATE tenant.farms f SET region_id = g.region_id
FROM shared.geo_regions g
WHERE f.region_id IS NULL AND g.level = 'DIVISION'
  AND f.location_island IS NOT NULL
  AND f.location_island ILIKE '%' || g.name || '%';

-- verify
SELECT (to_regclass('shared.geo_regions') IS NOT NULL)::int
     + (SELECT count(*) FROM information_schema.columns WHERE table_schema='tenant' AND table_name='farms' AND column_name='region_id')::int AS objects_2;
