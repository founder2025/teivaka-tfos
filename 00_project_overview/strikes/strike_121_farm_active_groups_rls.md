# Strike #121: farm_active_groups tenant_id + RLS — close cross-tenant exposure

**Date:** 2026-05-08
**Branch:** feature/option-3-plus-nav-v2-1
**Build commit:** 2187a49
**Doc-sync commit:** (this commit, post-strike per Strike #88)
**Migration:** 076_farm_groups_tenant_id
**Severity at trigger:** Critical (cross-tenant data exposure)
**Strike duration:** ~45 minutes (recon → build → verify → commit → platform check → doc-sync)

## Trigger

Forensic platform audit Phase 3 (DB schema map) found one tenant.* table
with the bug pattern: no `tenant_id` column AND no RLS policy. Phase 4
(backend code map) confirmed every code-level query on the table filtered
by `farm_id` only. Combined with the `F001-XXXX` farm_id naming
convention (suffix is the first 4 hex of the tenant UUID — guessable
once one tenant's UUID is known via attribution events / public
endpoints), an attacker with a valid BASIC-tier JWT for tenant A could
read tenant B's group activations via:

```
GET /api/v1/farms/F001-26D6/active-groups
```

Pre-strike exploit: returned 11 cross-tenant rows.
Post-strike same exploit: returns 0 rows.

## Recon (audit-driven)

The audit-recon paste pack established the bug-pattern coverage matrix
across all 46 `tenant.*` tables:

| Classification | Count | Notes |
|---|---:|---|
| OK (tenant_id + forced RLS + policy) | 11 | alerts, cash_ledger, farms, field_events, harvest_log, labor_attendance, production_cycles, production_units, task_queue, tis_advisories, users |
| rls-not-forced (tenant_id + RLS + policy, NOT forced) | 32 | Strike #122 candidate (separate concern) |
| tenant_id-no-rls (system internals) | 1 | tenants — tenancy boundary by design |
| **BUG-PATTERN** (no tenant_id, no RLS) | **1** | **farm_active_groups** |

**Strike #121 SCOPE: SINGLE TABLE.** No siblings. The 32 rls-not-forced
tables are a separate concern (Strike #122 candidate) — not in scope
for this strike per Boss directive ("if farm_active_groups is the only
table with the bug, scope #121 to it").

Pre-strike data state:
- 33 rows = 3 farms × 11 catalog groups (locked taxonomy)
- All 33 rows had a valid `tenant.farms.farm_id` parent (clean backfill source)
- No FarmActiveGroup ORM class exists (raw-SQL only across all touch points)

## Build

### Migration 076_farm_groups_tenant_id

Strike #115 ordering doctrine respected (DROP → mutate → ADD), expressed
here as DDL → DML → DDL → RLS:

1. **ADD COLUMN tenant_id uuid** (nullable initially)
2. **Backfill UPDATE** from `tenant.farms` via `farm_id` join (33 rows)
3. **ALTER COLUMN SET NOT NULL** (safe after backfill, 0 NULLs)
4. **ADD FK CASCADE** to `tenant.tenants(tenant_id)` (matches existing pattern)
5. **CREATE INDEX** `idx_farm_active_groups_tenant_id` (supports RLS USING-clause)
6. **ENABLE ROW LEVEL SECURITY**
7. **FORCE ROW LEVEL SECURITY** (matches farms, production_units siblings)
8. **CREATE POLICY** `farm_active_groups_tenant_isolation` — canonical pattern
   matching all 43 sibling tenant.* policies:
   ```sql
   USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
   WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
   ```

### App code changes (4 files)

- `app/services/farm_active_groups_defaults.py` — added `tenant_id` parameter, included in INSERT
- `app/routers/farm_active_groups.py` — added `:tid` to PUT INSERT (tid was already in scope from `user["tenant_id"]`)
- `app/routers/farms.py` — pass `str(user["tenant_id"])` to service helper
- `app/routers/onboarding.py` — pass `tenant_id` local var to service helper

## Strike #91 fail-loud caught three potential disasters during Strike #121

### 1. Migration apply failed: alembic role permissions

First apply attempt: `InsufficientPrivilegeError: must be owner of table farm_active_groups`.

Root cause: container's `DATABASE_URL` connects as `teivaka_app` (low-priv role). Tables are owned by `teivaka` (superuser). The cluster archive note for Migrations 073-075 says "applied via teivaka superuser" — same procedure applies here.

Resolution: `docker exec -e "DATABASE_URL=postgresql+asyncpg://teivaka:${PW}@db:5432/teivaka_db" teivaka_api alembic upgrade ...` — override DATABASE_URL with teivaka superuser credentials.

**Doctrine update:** Migration application procedure should be hardened in CLAUDE.md Part 4c — every migration documented as requiring superuser DATABASE_URL override.

### 2. Migration apply failed: revision ID exceeded varchar(32)

Second apply attempt: `StringDataRightTruncationError: value too long for type character varying(32)`.

Root cause: `tenant.alembic_version.version_num` is `varchar(32)`. The chosen revision ID `076_farm_active_groups_tenant_isolation` was 39 chars. Migration 075 (`075_decision_signal_composite_pk`) was at exactly 32 — no slack for longer names.

Transactional DDL (Migration 075's `Will assume transactional DDL` semantic) rolled back cleanly — schema state preserved.

Resolution: rename to `076_farm_groups_tenant_id` (25 chars). File rename + revision string update in source. Re-applied successfully.

**Doctrine update:** Architect memory persisted — alembic revision IDs MUST be ≤32 chars. Track budget on every new migration.

### 3. RLS verification used superuser, missing the bypass

First V8 verification ran as `teivaka` (the same superuser used for the migration). All 33 rows visible regardless of `app.tenant_id` setting. Initial reaction: "RLS isn't working."

Root cause: PostgreSQL behavior — superusers and roles with `BYPASSRLS=true` always bypass RLS, **even when `FORCE ROW LEVEL SECURITY` is set**. This is documented but easy to forget.

Resolution: re-tested as `teivaka_app` (rolsuper=f, rolbypassrls=f — the actual app role). 7-test suite then confirmed:
- (a) No `app.tenant_id` set → fail-loud error (`unrecognized configuration parameter`)
- (b) Tenant A context → 11 rows, only A's tenant_id visible
- (c) Tenant B context → 11 rows, only B's tenant_id visible
- (d) Bogus UUID → 0 rows visible
- (e) **Cross-tenant exploit** → 11 rows pre-strike → **0 rows post-strike**
- (f) Owner queries own farm → 11 rows
- (g) WITH CHECK INSERT mismatch → ERROR (`new row violates row-level security policy`)

**Doctrine update:** RLS verification MUST be done as the application's actual DB role (`teivaka_app`), never as the migration role (`teivaka` superuser). Phase 9 of the audit will need this consideration when assessing the broader rls-not-forced inventory.

## Verify gates (all green)

| Gate | Result |
|------|--------|
| Schema dump shows tenant_id NOT NULL + FK CASCADE + index | ✓ |
| 33 rows, 33 with tenant_id, 0 NULL | ✓ |
| Backfill matches farms parent: 33 matched / 0 mismatched / 0 orphan | ✓ |
| Per-tenant breakdown: 11 × 3 = 33 | ✓ |
| RLS enabled=t, forced=t | ✓ |
| Policy `farm_active_groups_tenant_isolation` with canonical USING + WITH CHECK | ✓ |
| Bug-pattern coverage matrix empty (was 1) | ✓ |
| 7-test isolation suite as teivaka_app | ✓ all pass |
| Cross-tenant exploit: 11 pre → 0 post | ✓ |

## Platform check (all green)

| Check | State |
|---|---|
| Public health (Caddy) | 200 |
| Internal health (api) | 200 |
| 8 containers all healthy | ✓ |
| Decision Engine snapshots | 100 (preserved from Strike #116) |
| Decision Engine configs | 30 (preserved) |
| Latest snapshot timestamp | 2026-05-08 06:05:00.226+12 (cluster #110-116 fire intact) |
| Audit chain integrity | 299 events, 0 chain breaks, latest Bank PDF hash unchanged |
| alembic head | 076_farm_groups_tenant_id |
| Beat scheduler ticking | ops-run-cheap-checks fired at 20:00 / 20:15 / 20:30 UTC |
| Recent api error scan | clean |

**Bonus PC finding:** PC7 surfaced an 8th beat-schedule entry not visible in Phase 4 recon — `ops-run-expensive-checks` at 20:00 UTC. → Phase 4 finding MMM updated.

## Outcomes

- Cross-tenant exposure surface eliminated at the database layer
- DB-level enforcement (FORCED RLS + canonical policy) — no app-layer
  trust required to enforce isolation
- Pre-strike exploit blocked: cross-tenant farm_id query returns 0
- All existing app paths continue to work (RLS auto-filters SELECTs;
  INSERTs include tenant_id explicitly via 4 code path updates)
- 33-row data state preserved (backfilled cleanly; no data loss)
- All 8 containers stayed healthy across migration + restart
- Audit chain integrity preserved (chain_break_count = 0)

## Backlog at close (unchanged)

- #117: Orphan migration `100_classroom_foundation.py` investigation (deferred)
- #118 / B73: automation_worker per-farm `_evaluate_all_rules` silent traceback (deferred)
- #119: order_line_items.farm_id schema parity (deferred)
- #120: Migration 004 mv_input_balance real implementation (deferred — unblocked by Strike #114)
- #122 (NEW from #121 recon): 32 tenant.* tables with rls-not-forced — superuser/owner can bypass RLS unconditionally; Phase 9 of audit will assess severity and ordering

## Next

- Forensic platform audit resumes at Phase 5 — frontend code map
- Phase 9 (security) will incorporate Strike #121 outcome and weigh
  Strike #122 candidate against the broader RLS-forced inventory
