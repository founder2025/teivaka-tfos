# Runbook — Migration 165 (per-user geo coords) apply-as-owner

**Why this exists:** `165_user_geo` runs `ALTER TABLE tenant.users ADD COLUMN
gps_lat / gps_lng`, but alembic authenticates as `teivaka_app`, which is not the
owner of `tenant.users` → `must be owner of table users` (Strike #123). Apply the
DDL as the `teivaka` owner, then `alembic stamp`. New columns inherit the table's
existing grants, so no extra GRANT is needed.

## Steps (run from /opt/teivaka)

```bash
docker exec -i teivaka_db psql -U teivaka -d teivaka_db <<'SQL'
ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS gps_lat NUMERIC(9,6);
ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS gps_lng NUMERIC(9,6);
SQL

docker exec teivaka_api alembic stamp 165_user_geo
docker exec teivaka_api alembic current        # -> 165_user_geo (head)
```

## Verify

```bash
docker exec -i teivaka_db psql -U teivaka -d teivaka_db -c \
  "SELECT column_name FROM information_schema.columns WHERE table_schema='tenant' \
   AND table_name='users' AND column_name IN ('gps_lat','gps_lng');"
# Browser: Members -> 'Share my location' (allow location) -> a non-farm account
# gets a pin; farmers still resolve via their farm.
```

Note: the `/farm-map/network` endpoint is migration-tolerant — it probes for these
columns and simply skips the non-farm member source until they exist, so deploying
the code before the ALTER won't 500 (it just won't show non-farm members yet).
