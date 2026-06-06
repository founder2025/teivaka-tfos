"""082 farm map features — tenant.map_features (GeoJSON zones/blocks/boundary)

L2 of Locations. RLS-protected per-feature GeoJSON store so a farmer can draw
their own zones, blocks, boundary and facility points on a satellite map. One
row per feature (not a blob) so L3 can query geometry for geofenced attendance,
per-zone area, and facility points. PUT replaces a farm's whole feature set in
one transaction; GET assembles a FeatureCollection.

revision: 082_farm_map_features
down_revision: 081_weather_forecast
"""
from alembic import op

revision = "082_farm_map_features"
down_revision = "081_weather_forecast"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Per-feature GeoJSON store (one row per drawn shape/point).
    op.execute("""
        CREATE TABLE IF NOT EXISTS tenant.map_features (
            feature_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id     UUID NOT NULL,
            farm_id       TEXT NOT NULL,
            feature_kind  TEXT NOT NULL
                          CHECK (feature_kind IN ('BOUNDARY','ZONE','BLOCK','FACILITY','POINT')),
            ref_id        TEXT,
            label         TEXT,
            geometry      JSONB NOT NULL,
            properties    JSONB NOT NULL DEFAULT '{}'::jsonb,
            area_ha       NUMERIC(12,4),
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by    UUID
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_map_features_farm
            ON tenant.map_features (tenant_id, farm_id, feature_kind)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_map_features_tenant
            ON tenant.map_features (tenant_id)
    """)

    # 2. RLS — canonical app.tenant_id policy, mirror sibling tenant.* tables.
    op.execute("ALTER TABLE tenant.map_features ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tenant.map_features FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY map_features_tenant_isolation
            ON tenant.map_features
            USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    """)

    # 3. Grant to the app role (guarded so it no-ops if the role is named differently).
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
                GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.map_features TO teivaka_app;
            END IF;
        END $$
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tenant.map_features")
