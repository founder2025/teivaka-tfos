# Runbook — Migration 166 (farms RLS permissive-on-empty) apply-as-owner

**Why this exists:** `tenant.farms` kept the STRICT RLS policy
`tenant_id = current_setting('app.tenant_id')::uuid`. `get_db` sets
`app.tenant_id = ''` for cross-tenant/bootstrap reads, so `''::uuid` throws
`invalid input syntax for type uuid: ""` → every cross-tenant farms read 500s
(member map `GET /farm-map/network`, plus latent `global-pins` and
`/admin/analytics/map`). `tenant.users` was already fixed this way (mig 154);
this brings farms in line. Reads permissive-on-empty; writes stay strict
(WITH CHECK). Policy DDL needs the table owner (`teivaka`) — alembic runs as
`teivaka_app` (Strike #123).

## Steps (run from /opt/teivaka)

```bash
# 1) rebuild api so the 166 migration file is baked into the container (B78)
docker compose -f 04_environment/docker-compose.yml build --no-cache api && \
docker compose -f 04_environment/docker-compose.yml up -d api && \
bash 04_environment/verify-deploy.sh

# 2) apply the policy AS OWNER (Strike #123)
docker exec -i teivaka_db psql -U teivaka -d teivaka_db <<'SQL'
DROP POLICY IF EXISTS farms_tenant_isolation ON tenant.farms;
CREATE POLICY farms_tenant_isolation ON tenant.farms
    USING (
        current_setting('app.tenant_id', true) IS NULL
        OR current_setting('app.tenant_id', true) = ''
        OR tenant_id::text = current_setting('app.tenant_id', true)
    )
    WITH CHECK (
        tenant_id::text = current_setting('app.tenant_id', true)
    );
SQL

# 3) record it in alembic
docker exec teivaka_api alembic stamp 166_farms_rls_permissive
docker exec teivaka_api alembic current        # -> 166_farms_rls_permissive (head)
```

## Verify

```bash
docker exec -i teivaka_db psql -U teivaka -d teivaka_db -c \
  "SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr \
   FROM pg_policy WHERE polrelid='tenant.farms'::regclass;"
# using_expr should show the permissive (… IS NULL OR … = '' OR …) form.
# Browser: Members map loads (no 'Couldn't load'); also /admin/map shows pins.
```

## Rollback

```bash
docker exec -i teivaka_db psql -U teivaka -d teivaka_db <<'SQL'
DROP POLICY IF EXISTS farms_tenant_isolation ON tenant.farms;
CREATE POLICY farms_tenant_isolation ON tenant.farms
    USING (tenant_id = current_setting('app.tenant_id')::uuid);
SQL
docker exec teivaka_api alembic stamp 165_user_geo
```
(Re-breaks cross-tenant farms reads — only if the change misbehaves.)

## Safety note

Tenant-scoped requests are unaffected: `get_rls_db` sets a real `app.tenant_id`,
so the third USING branch (`tenant_id::text = <ctx>`) scopes them exactly as
before. The permissive branches only open reads when the context is empty/NULL —
the admin/bootstrap/cross-tenant path. Writes are never cross-tenant: WITH CHECK
requires `tenant_id::text = <ctx>`, which is false under empty context.
