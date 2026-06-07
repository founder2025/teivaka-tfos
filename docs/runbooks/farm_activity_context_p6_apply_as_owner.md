# Runbook — Migration 084 (farm activity context / TIS memory) apply-as-owner

`084_farm_activity_context` CREATEs `tenant.farm_activity_context`; the alembic
connection authenticates as `teivaka_app`, which lacks `CREATE` on schema
`tenant` (Strike #123). Apply the DDL as `teivaka`, then `alembic stamp`. Same
pattern as 081/082/083.

## Steps (from /opt/teivaka)

```bash
docker exec -i teivaka_db psql -U teivaka -d teivaka_db <<'SQL'
CREATE TABLE IF NOT EXISTS tenant.farm_activity_context (
    activity_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    farm_id       TEXT NOT NULL,
    pu_id         TEXT,
    cycle_id      TEXT,
    kind          TEXT NOT NULL,
    summary       TEXT NOT NULL,
    payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
    source        TEXT NOT NULL DEFAULT 'app',
    created_by    UUID,
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_farm_activity_lookup ON tenant.farm_activity_context (tenant_id, farm_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_farm_activity_pu     ON tenant.farm_activity_context (tenant_id, pu_id);
CREATE INDEX IF NOT EXISTS ix_farm_activity_tenant ON tenant.farm_activity_context (tenant_id);

ALTER TABLE tenant.farm_activity_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.farm_activity_context FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS farm_activity_context_tenant_isolation ON tenant.farm_activity_context;
CREATE POLICY farm_activity_context_tenant_isolation
    ON tenant.farm_activity_context
    USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
        GRANT SELECT, INSERT ON tenant.farm_activity_context TO teivaka_app;  -- append-only
    END IF;
END $$;
SQL

docker exec teivaka_api alembic stamp 084_farm_activity_context
docker exec teivaka_api alembic current        # -> 084_farm_activity_context (head)
```

## Verify

```bash
docker exec -i teivaka_db psql -U teivaka -d teivaka_db -c \
"SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='farm_activity_context';"  # t | t

# teach + read back (real token):
curl -s -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"farm_id":"F001-A0EE","summary":"Test note","kind":"NOTE"}' \
  https://teivaka.com/api/v1/tis-context/teach
curl -s -H "Authorization: Bearer $TOK" "https://teivaka.com/api/v1/tis-context?farm_id=F001-A0EE"
```

Then rebuild the API so the new router + TIS grounding are live:
`docker compose -f 04_environment/docker-compose.yml up -d --build api`

## PRE-CHECK before relying on TIS grounding (Strike #75)
After rebuild, confirm the TIS chat still round-trips end-to-end (ask any
question in the floating widget). The grounding is best-effort (try/except) so a
context-read failure cannot break chat — but verify the Anthropic SDK call still
succeeds before declaring Phase 6 done.

## Applied
- (pending) production.
