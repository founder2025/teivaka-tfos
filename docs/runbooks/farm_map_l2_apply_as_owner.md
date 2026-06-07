# Runbook — Migration 082 (farm map features) apply-as-owner

**Why this exists:** Migration `082_farm_map_features` `CREATE`s `tenant.map_features`,
but the alembic connection authenticates as `teivaka_app`, which lacks `CREATE`
on schema `tenant`. `alembic upgrade head` fails with:

```
asyncpg.exceptions.InsufficientPrivilegeError: permission denied for schema tenant
```

This is Strike #123 (alembic-owner-mismatch). Fix = apply the DDL as the
`teivaka` superuser, then `alembic stamp`. The migration file stays the source
of truth and must still chain correctly; the manual apply only substitutes the
privileged execution. Backlog B81 (MIGRATION_DATABASE_URL = owner) removes this
manual step long-term.

## Steps (run from /opt/teivaka)

```bash
docker exec -i teivaka_db psql -U teivaka -d teivaka_db <<'SQL'
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
);
CREATE INDEX IF NOT EXISTS ix_map_features_farm   ON tenant.map_features (tenant_id, farm_id, feature_kind);
CREATE INDEX IF NOT EXISTS ix_map_features_tenant ON tenant.map_features (tenant_id);

ALTER TABLE tenant.map_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.map_features FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS map_features_tenant_isolation ON tenant.map_features;
CREATE POLICY map_features_tenant_isolation
    ON tenant.map_features
    USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.map_features TO teivaka_app;
    END IF;
END $$;
SQL

docker exec teivaka_api alembic stamp 082_farm_map_features
docker exec teivaka_api alembic current        # -> 082_farm_map_features (head)
```

## Verify

```bash
# FORCE RLS must be t | t (tenant isolation enforced like sibling tenant.* tables)
docker exec -i teivaka_db psql -U teivaka -d teivaka_db -c \
"SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='map_features';"

# Endpoint exists (401 without a token is the correct response):
curl -s -H "Authorization: Bearer $TOK" https://teivaka.com/api/v1/farm-map/F001-A0EE
# -> {"type":"FeatureCollection","farm_id":"F001-A0EE","features":[]}
```

## Applied

- 2026-06-07 — production. `082_farm_map_features (head)`; FORCE RLS `t | t`
  confirmed; new objects owned by `teivaka` (consistent with base schema),
  `teivaka_app` granted runtime DML.
