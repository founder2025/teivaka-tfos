"""081 weather forecast — farm lat/lon, island centroids, tenant.weather_forecast

Phase 1 of live weather. Adds coordinates to farms, a shared island-centroid
fallback, and an RLS-protected forecast cache filled by weather_worker.

revision: 081_weather_forecast
down_revision: 080_tis_public_grants
"""
from alembic import op

revision = "081_weather_forecast"
down_revision = "080_tis_public_grants"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Farm coordinates (multiple ADD COLUMN = one statement, asyncpg-safe).
    op.execute("""
        ALTER TABLE tenant.farms
            ADD COLUMN IF NOT EXISTS latitude  NUMERIC(9,6),
            ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6)
    """)

    # 2. Shared island-centroid fallback (read-only at runtime; migrations only).
    op.execute("""
        CREATE TABLE IF NOT EXISTS shared.island_centroids (
            name       TEXT PRIMARY KEY,
            latitude   NUMERIC(9,6) NOT NULL,
            longitude  NUMERIC(9,6) NOT NULL
        )
    """)
    op.execute("""
        INSERT INTO shared.island_centroids (name, latitude, longitude) VALUES
            ('Viti Levu', -17.800000, 178.000000),
            ('Vanua Levu', -16.600000, 179.300000),
            ('Kadavu', -19.050000, 178.200000),
            ('Taveuni', -16.850000, 179.970000),
            ('Ovalau', -17.680000, 178.840000),
            ('Gau', -18.020000, 179.300000),
            ('Koro', -17.320000, 179.420000),
            ('Rotuma', -12.500000, 177.070000),
            ('Serua', -18.180000, 178.050000),
            ('Suva', -18.140000, 178.440000),
            ('Nadi', -17.800000, 177.420000),
            ('Sigatoka', -18.140000, 177.510000),
            ('Labasa', -16.430000, 179.370000),
            ('Savusavu', -16.780000, 179.330000),
            ('Tavuki', -19.050000, 178.200000)
        ON CONFLICT (name) DO NOTHING
    """)

    # 3. Best-effort backfill: match farm.location_island against a centroid.
    op.execute("""
        UPDATE tenant.farms f
           SET latitude  = c.latitude,
               longitude = c.longitude
          FROM shared.island_centroids c
         WHERE f.latitude IS NULL
           AND f.location_island IS NOT NULL
           AND f.location_island ILIKE '%' || c.name || '%'
    """)

    # 4. Forecast cache (CURRENT / HOURLY / DAILY rows).
    op.execute("""
        CREATE TABLE IF NOT EXISTS tenant.weather_forecast (
            forecast_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id        UUID NOT NULL,
            farm_id          TEXT NOT NULL,
            kind             TEXT NOT NULL CHECK (kind IN ('CURRENT','HOURLY','DAILY')),
            valid_at         TIMESTAMPTZ NOT NULL,
            temp_c           NUMERIC(5,2),
            temp_min_c       NUMERIC(5,2),
            temp_max_c       NUMERIC(5,2),
            precip_mm        NUMERIC(6,2),
            precip_prob_pct  INTEGER,
            humidity_pct     NUMERIC(5,2),
            wind_kmh         NUMERIC(6,2),
            wind_dir         TEXT,
            weather_code     INTEGER,
            source           TEXT NOT NULL DEFAULT 'open-meteo',
            fetched_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_weather_forecast_lookup
            ON tenant.weather_forecast (tenant_id, farm_id, kind, valid_at)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_weather_forecast_tenant
            ON tenant.weather_forecast (tenant_id)
    """)

    # 5. RLS — canonical app.tenant_id policy, mirror sibling tenant.* tables.
    op.execute("ALTER TABLE tenant.weather_forecast ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tenant.weather_forecast FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY weather_forecast_tenant_isolation
            ON tenant.weather_forecast
            USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    """)

    # 6. Grant to the app role (guarded so it no-ops if the role is named differently).
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
                GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.weather_forecast TO teivaka_app;
                GRANT SELECT ON shared.island_centroids TO teivaka_app;
            END IF;
        END $$
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tenant.weather_forecast")
    op.execute("DROP TABLE IF EXISTS shared.island_centroids")
    op.execute("ALTER TABLE tenant.farms DROP COLUMN IF EXISTS latitude")
    op.execute("ALTER TABLE tenant.farms DROP COLUMN IF EXISTS longitude")
