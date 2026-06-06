# Strike #123 — Alembic runs as a non-owner role; base-schema ALTERs fail

**Filed:** 2026-06-06 · **Context:** Weather Phase 1 (live forecast) deploy.

## What happened
`alembic upgrade head` for migration `081_weather_forecast` failed on its very
first statement:

```
ALTER TABLE tenant.farms ADD COLUMN IF NOT EXISTS latitude ...
asyncpg.exceptions.InsufficientPrivilegeError: must be owner of table farms
```

The migration connection authenticates as the **application role**
(`teivaka_app`), but `tenant.farms` is a **base-schema table** created by
`02_database/schema/02_tenant_schema.sql` at DB init, which runs as the
`teivaka` superuser — so `farms` is **owned by `teivaka`**. Postgres requires
table ownership (or superuser) for `ALTER TABLE`, and `IF NOT EXISTS` does not
bypass the ownership check.

## Why earlier migrations didn't hit this
Every prior migration only `ALTER`ed tables it had itself created (e.g. 074
`tenant.inputs`, 076 `tenant.farm_active_groups`) — those are owned by the
migration role, so `ALTER` succeeded. `081` is the **first migration to ALTER a
base-schema (teivaka-owned) table** (`tenant.farms`), exposing the latent
ownership gap. Creating brand-new tables in `tenant.*`/`shared.*` can also fail
where the app role lacks `CREATE` on the schema (e.g. `shared`).

## The fix used (apply-as-owner, then stamp)
Because the operator has superuser psql (`psql -U teivaka`), the 081 DDL was
applied directly as the owner, then alembic was told it is applied:

```bash
docker exec -i teivaka_db psql -U teivaka -d teivaka_db < 081_body.sql   # owner runs DDL
docker exec teivaka_api alembic stamp 081_weather_forecast               # mark applied
docker exec teivaka_api alembic current                                  # -> 081 (head)
```

New objects end up owned by `teivaka` (consistent with `farms` and the rest of
base schema); the migration's `GRANT`s give `teivaka_app` runtime access. Full
runbook: `docs/runbooks/weather_phase1_apply_as_owner.md`.

**Rejected alternative:** `ALTER TABLE tenant.farms OWNER TO teivaka_app`. If
`farms` is not `FORCE ROW LEVEL SECURITY`, the owner role bypasses RLS →
cross-tenant exposure (the Strike #121 trap). Apply-as-owner + stamp is surgical
and avoids touching ownership of a core table.

## Ratified rule
Any migration that `ALTER`s a base-schema (teivaka-owned) table, or `CREATE`s in
a schema where the app role lacks `CREATE`, **cannot be applied by the
`teivaka_app` alembic connection.** Until migrations are run as the owner, such
migrations must be applied as `teivaka` then `alembic stamp`ed. The migration
file stays the source of truth (it must still exist + chain correctly); the
manual apply only substitutes the privileged execution.

## Proper long-term fix (backlog)
Run alembic migrations under an **owner/superuser connection** (a dedicated
`MIGRATION_DATABASE_URL` = `teivaka`), separate from the app's `teivaka_app`
runtime URL. Then migrations that touch base-schema tables apply cleanly via
`alembic upgrade head` with no manual step. Backlog: **B81 — migration role
separation (MIGRATION_DATABASE_URL = owner).**

## Pre-check to add to future schema paste packs
Before a migration that ALTERs/creates core objects, verify the alembic role can:
```sql
SELECT tableowner FROM pg_tables WHERE schemaname='tenant' AND tablename='<target>';
-- if owner != the alembic role and role is not superuser -> apply-as-owner path
```
