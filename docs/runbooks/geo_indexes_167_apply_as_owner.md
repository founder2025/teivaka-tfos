# Runbook — Migration 167 (geo indexes) apply-as-owner

**Why:** the member-network query now does distance + ORDER BY + LIMIT in SQL with
an index-backed bounding box for radius. These composite btree indexes back the
bbox range scans so "members within N km" stays fast as membership grows. CREATE
INDEX needs the table owner (`teivaka`) — alembic runs as `teivaka_app` (Strike #123).

## Steps (run from /opt/teivaka)

```bash
# 1) rebuild api so the 167 file is baked in (B78)
docker compose -f 04_environment/docker-compose.yml build --no-cache api && \
docker compose -f 04_environment/docker-compose.yml up -d api && \
bash 04_environment/verify-deploy.sh

# 2) create the indexes AS OWNER (Strike #123)
docker exec -i teivaka_db psql -U teivaka -d teivaka_db <<'SQL'
CREATE INDEX IF NOT EXISTS ix_farms_gps ON tenant.farms (gps_lat, gps_lng);
CREATE INDEX IF NOT EXISTS ix_users_gps ON tenant.users (gps_lat, gps_lng);
SQL

# 3) record it
docker exec teivaka_api alembic stamp 167_geo_indexes
docker exec teivaka_api alembic current     # -> 167_geo_indexes (head)
```

## Verify

```bash
docker exec -i teivaka_db psql -U teivaka -d teivaka_db -c \
  "SELECT indexname FROM pg_indexes WHERE schemaname='tenant' AND indexname IN ('ix_farms_gps','ix_users_gps');"
# Optional: confirm the bbox uses the index once there's data —
# EXPLAIN a radius query and look for an Index/Bitmap scan on ix_*_gps.
```

## Large-table note

The plain CREATE INDEX above takes a brief write lock — fine while the tables are
small. Once farms/users are large, build CONCURRENTLY instead (cannot run inside a
txn, so do it directly, then stamp):

```bash
docker exec -i teivaka_db psql -U teivaka -d teivaka_db -c \
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_farms_gps ON tenant.farms (gps_lat, gps_lng);"
docker exec -i teivaka_db psql -U teivaka -d teivaka_db -c \
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_users_gps ON tenant.users (gps_lat, gps_lng);"
docker exec teivaka_api alembic stamp 167_geo_indexes
```

## Next scale step (not in this migration)

PostGIS (geography column + GiST + KNN `<->`) for true global nearest-N + map
clustering at low zoom — an extension install (infra decision) + a follow-up
migration. The btree bbox here covers tens/hundreds of thousands first.
