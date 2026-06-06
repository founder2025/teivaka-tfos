# Runbook — Weather Phase 1 (live forecast) deploy, apply-as-owner

Reproducible steps to bring up the live Open-Meteo forecast feed on a fresh
environment. Migration `081_weather_forecast` ALTERs `tenant.farms` (a
base-schema, `teivaka`-owned table), which the `teivaka_app` alembic connection
cannot do (see Strike #123). Apply the DDL as the owner, then stamp.

## 0. Pre-checks (halt on failure)
```bash
# Outbound to Open-Meteo from inside the api container (whole feed depends on it)
docker exec teivaka_api python -c "import urllib.request,json;print(json.loads(urllib.request.urlopen('https://api.open-meteo.com/v1/forecast?latitude=-18.18&longitude=178.05&current=temperature_2m&timezone=Pacific%2FFiji',timeout=15).read())['current'])"

# Alembic head should be 080 before this; weather_worker.py + celery_app.py deployed
docker exec teivaka_api alembic current
```

## 1. Apply 081 DDL as the owner (teivaka)
Run the body of `11_application_code/alembic/versions/081_weather_forecast.py`
as `teivaka` (superuser/owner). The canonical SQL:

```sql
ALTER TABLE tenant.farms
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6);

CREATE TABLE IF NOT EXISTS shared.island_centroids (
  name TEXT PRIMARY KEY, latitude NUMERIC(9,6) NOT NULL, longitude NUMERIC(9,6) NOT NULL);
INSERT INTO shared.island_centroids (name, latitude, longitude) VALUES
  ('Viti Levu',-17.800000,178.000000),('Vanua Levu',-16.600000,179.300000),
  ('Kadavu',-19.050000,178.200000),('Taveuni',-16.850000,179.970000),
  ('Ovalau',-17.680000,178.840000),('Gau',-18.020000,179.300000),
  ('Koro',-17.320000,179.420000),('Rotuma',-12.500000,177.070000),
  ('Serua',-18.180000,178.050000),('Suva',-18.140000,178.440000),
  ('Nadi',-17.800000,177.420000),('Sigatoka',-18.140000,177.510000),
  ('Labasa',-16.430000,179.370000),('Savusavu',-16.780000,179.330000),
  ('Tavuki',-19.050000,178.200000)
ON CONFLICT (name) DO NOTHING;

UPDATE tenant.farms f SET latitude=c.latitude, longitude=c.longitude
  FROM shared.island_centroids c
 WHERE f.latitude IS NULL AND f.location_island IS NOT NULL
   AND f.location_island ILIKE '%'||c.name||'%';

CREATE TABLE IF NOT EXISTS tenant.weather_forecast (
  forecast_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL, farm_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('CURRENT','HOURLY','DAILY')),
  valid_at TIMESTAMPTZ NOT NULL,
  temp_c NUMERIC(5,2), temp_min_c NUMERIC(5,2), temp_max_c NUMERIC(5,2),
  precip_mm NUMERIC(6,2), precip_prob_pct INTEGER, humidity_pct NUMERIC(5,2),
  wind_kmh NUMERIC(6,2), wind_dir TEXT, weather_code INTEGER,
  source TEXT NOT NULL DEFAULT 'open-meteo',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS ix_weather_forecast_lookup ON tenant.weather_forecast (tenant_id, farm_id, kind, valid_at);
CREATE INDEX IF NOT EXISTS ix_weather_forecast_tenant ON tenant.weather_forecast (tenant_id);

ALTER TABLE tenant.weather_forecast ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.weather_forecast FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS weather_forecast_tenant_isolation ON tenant.weather_forecast;
CREATE POLICY weather_forecast_tenant_isolation ON tenant.weather_forecast
  USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
  WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.weather_forecast TO teivaka_app;
    GRANT SELECT ON shared.island_centroids TO teivaka_app;
  END IF;
END $$;
```

Pipe it as the owner: `docker exec -i teivaka_db psql -U teivaka -d teivaka_db < body.sql`

## 2. Stamp alembic (DDL already applied)
```bash
docker exec teivaka_api alembic stamp 081_weather_forecast
docker exec teivaka_api alembic current   # -> 081_weather_forecast (head)
```

## 3. Farm coordinates
Backfill only fills farms whose `location_island` matches a centroid name. Set
the rest by hand (town/block centroid is fine to start):
```sql
UPDATE tenant.farms SET latitude=-18.180000, longitude=178.050000
  WHERE farm_id IN ('F001-A0EE','F001-26D6','F001-F9A8');   -- Serua
-- F002 (Kadavu) is filled by the backfill.
```

## 4. Worker + beat + first fetch
```bash
docker compose -f 04_environment/docker-compose.yml up -d --build teivaka_worker_automation teivaka_beat
docker exec teivaka_api python -c "from app.workers.weather_worker import fetch_all_weather as f; print(f())"
docker exec teivaka_db psql -U teivaka -d teivaka_db -c \
  "SELECT farm_id, kind, count(*) FROM tenant.weather_forecast GROUP BY farm_id, kind ORDER BY farm_id, kind;"
```
Expect per farm with coords: `CURRENT 1 · HOURLY 48 · DAILY 7`. Beat re-runs
`fetch-weather-3h` every 3 hours. Coordinate-dedupe: farms sharing rounded
coords cost one API call.

## 5. Verify in the UI
My Farm → Weather → Now / Next 48 hours / 7-day go live (tagged "Open-Meteo").

## Verified
2026-06-06 — F001-A0EE / F001-26D6 / F001-F9A8 (Serua) + F002 (Kadavu): all
`CURRENT 1 · HOURLY 48 · DAILY 7`; `farms_updated: 4, locations_fetched: 2`.
