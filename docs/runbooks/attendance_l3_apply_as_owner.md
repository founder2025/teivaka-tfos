# Runbook — Migration 083 (worker attendance) apply-as-owner

`083_worker_attendance` CREATEs `tenant.worker_attendance`; the alembic
connection authenticates as `teivaka_app`, which lacks `CREATE` on schema
`tenant` (Strike #123). Apply the DDL as the `teivaka` superuser, then
`alembic stamp`. Same pattern as migrations 081/082.

## Steps (run from /opt/teivaka)

```bash
docker exec -i teivaka_db psql -U teivaka -d teivaka_db <<'SQL'
CREATE TABLE IF NOT EXISTS tenant.worker_attendance (
    attendance_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL,
    farm_id          TEXT NOT NULL,
    worker_id        UUID,
    worker_name      TEXT,
    kind             TEXT NOT NULL CHECK (kind IN ('CLOCK_IN','CLOCK_OUT')),
    occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    lat              NUMERIC(9,6),
    lng              NUMERIC(9,6),
    accuracy_m       NUMERIC(8,2),
    inside_boundary  BOOLEAN,
    distance_m       NUMERIC(10,2),
    note             TEXT,
    created_by       UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_worker_attendance_lookup ON tenant.worker_attendance (tenant_id, farm_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_worker_attendance_tenant ON tenant.worker_attendance (tenant_id);

ALTER TABLE tenant.worker_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.worker_attendance FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS worker_attendance_tenant_isolation ON tenant.worker_attendance;
CREATE POLICY worker_attendance_tenant_isolation
    ON tenant.worker_attendance
    USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.worker_attendance TO teivaka_app;
    END IF;
END $$;
SQL

docker exec teivaka_api alembic stamp 083_worker_attendance
docker exec teivaka_api alembic current        # -> 083_worker_attendance (head)
```

## Verify

```bash
docker exec -i teivaka_db psql -U teivaka -d teivaka_db -c \
"SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='worker_attendance';"  # t | t

curl -s -H "Authorization: Bearer $TOK" "https://teivaka.com/api/v1/attendance?farm_id=F001-A0EE"
# -> {"data":[],"count":0}
```

Then rebuild the API so the new router is live:
`docker compose -f 04_environment/docker-compose.yml up -d --build api`
