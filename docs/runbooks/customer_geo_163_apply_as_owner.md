# Runbook — Migration 163 (buyer geo coords) apply-as-owner

**Why this exists:** `163_customer_geo` runs `ALTER TABLE tenant.customers ADD COLUMN
gps_lat/gps_lng`, but the alembic connection authenticates as `teivaka_app`, which is
not the owner of `tenant.customers`. `alembic upgrade head` fails with:

```
asyncpg.exceptions.InsufficientPrivilegeError: must be owner of table customers
```

This is Strike #123 (alembic-owner-mismatch). Fix = apply the DDL as the `teivaka`
owner, then `alembic stamp` so the version table advances without re-running the DDL.
The migration file stays the source of truth; the manual apply only substitutes the
privileged execution. New columns inherit `tenant.customers`'s existing table-level
grants to `teivaka_app`, so no extra GRANT is needed. (Backlog B81 — a dedicated
MIGRATION_DATABASE_URL pointed at the owner — removes this manual step long-term;
`deploy.sh` already automates it via `compose run --rm -e DATABASE_URL=<owner>`.)

## Steps (run from /opt/teivaka)

```bash
docker exec -i teivaka_db psql -U teivaka -d teivaka_db <<'SQL'
ALTER TABLE tenant.customers ADD COLUMN IF NOT EXISTS gps_lat NUMERIC(9,6);
ALTER TABLE tenant.customers ADD COLUMN IF NOT EXISTS gps_lng NUMERIC(9,6);
SQL

docker exec teivaka_api alembic stamp 163_customer_geo
docker exec teivaka_api alembic current        # -> 163_customer_geo (head)
```

## Verify

```bash
# columns exist
docker exec -i teivaka_db psql -U teivaka -d teivaka_db -c \
  "SELECT column_name, data_type FROM information_schema.columns \
   WHERE table_schema='tenant' AND table_name='customers' \
   AND column_name IN ('gps_lat','gps_lng');"
# add-buyer works again (in the browser): Buyers -> Add new buyer -> Save
```
