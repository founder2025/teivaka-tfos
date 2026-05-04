# Strike #95 — Silent worker outages: automation engine never ran, notification batcher RLS-broken

**Filed:** 2026-05-04
**Class:** functional outage discovered behind cosmetic healthcheck flag
**Trigger:** Strike #94 close-out left worker_notifications + worker_automation
unhealthy. Recon revealed not one bug but three: two real outages and one
cosmetic healthcheck.

## Findings (recon)
1. **Healthcheck YAML malformed** for both workers (cosmetic, 174 consecutive
   failures). Same shape as Phase 8-2b fixed for beat/worker_ai. These two
   workers were not in 8-2b scope.
2. **automation_worker SQL bug** at run_automation_engine line ~208:
   `ORDER BY t.tenant_id, f.farm_id` violates SELECT DISTINCT rule (column not
   in select). Engine has crashed every cron tick since this code shipped.
   **Automation engine has never completed a successful run in production.**
3. **automation_worker + notification_worker RLS context missing** in raw
   psycopg2 path. Workers bypass FastAPI dependency injection that sets
   `app.tenant_id` via SQLAlchemy events. Every tenant.* query crashed with
   `UndefinedObject: unrecognized configuration parameter "app.tenant_id"`.

## Architectural decision (Option D after Pattern β rejected at runtime)
Initial Pattern β attempt added bypass_rls() that called
`set_config('app.tenant_id', '', true)`. Production runtime exposed this as
broken: teivaka_app role has rolbypassrls=f, and tenant.* RLS policies cast
`app.tenant_id::uuid` (which crashes on empty string with
InvalidTextRepresentation).

Three options surfaced:
- A: modify RLS policies to permit sentinel — rejected, blast radius huge,
  changes moat semantics for every FastAPI request path.
- B: separate WORKER_DATABASE_URL using teivaka superuser (BYPASSRLS) —
  correct eventually, premature tonight (env config, new pool, secrets).
  Filed as B72.
- D: refactor to two-stage scan — adopted. Drop cross-tenant JOIN; iterate
  tenant.tenants (only RLS-free table) and per-tenant query with with_rls().

Doctrinal upgrade: cross-tenant scans must be STRUCTURAL in code, not
bypass-based. Future readers cannot miss that the worker is iterating
across the multi-tenant boundary.

## Fix
1. SQL: `ORDER BY t.tenant_id` → `ORDER BY tenant_id`
2. New helper: `app/workers/rls_helpers.py` with single `with_rls()` context
   manager (bypass_rls() drafted then deleted after Option D adopted)
3. automation_worker.run_automation_engine: two-stage scan — tenants from
   tenant.tenants, per-tenant farms/automation work under with_rls(conn, tid)
4. notification_worker.send_batched_low_alerts: same two-stage shape
5. docker-compose.yml: healthcheck YAML list-form for both workers,
   --hostname=worker-X@localhost (Strike #68 stability over $$HOSTNAME)

## Verification (functional probes, not just healthcheck color)
- `docker compose up -d --build --force-recreate worker-automation worker-notifications`
- Both containers turn `healthy` (healthcheck functional probe passing)
- Manual trigger of run_automation_engine returns
  `{'farms_processed': 3, 'new_alerts': 0}` succeeded — **first successful
  end-to-end run since baseline 189d239 (2026-04-17)**
- Manual trigger of send_batched_low_alerts returns
  `{'batches_sent': 0, 'farms_checked': 0}` succeeded
- All 8 containers healthy (first time ever in production)
- Audit chain unchanged structurally (290 events, no rewrite)
- teivaka.com HTTP 200

## Per-farm bug surfaced during verify (Strike #95-followup)
`_evaluate_all_rules` raises `column "farm_id" does not exist` per-farm.
Caught + logged + per-farm rolled back as designed; engine continues and
returns success. Filed as **B73** for follow-up. Out of Strike #95 scope per
operator instruction: "a deeper bug after Option D refactor → file as
Strike #95-followup, do NOT keep patching in this commit."

## Process rule (the inversion of Strike #94)
**Strike #94: "healthcheck status alone is not evidence of functional outage."**
**Strike #95: "healthcheck status alone is not evidence of functional health
either."** Containers can be `running` while every task they pick up dies on
startup. Queue depth 0 can mean "consuming fast" OR "failing fast." Functional
probes (actual task execution + error log inspection) are the only oracle.

## Process rule (architectural honesty)
When the runtime contradicts the design, the runtime wins. Pattern β's
bypass_rls assumption looked clean; production policies disagreed; Option D
exposed the cross-tenant boundary as structural code instead of hidden behind
a single SQL statement. The corrected design is more honest, not less clean.

## Future-strike implications
- B70: Healthcheck audit across all workers — verify YAML list-form everywhere
  after Phase 8-2b + Strike #95 patterns.
- B71: Verify Phase 8-2b fix has not regressed on beat + worker_ai post-#94
  container recreation.
- B72: WORKER_DATABASE_URL with teivaka superuser BYPASSRLS for genuinely
  cross-tenant aggregation work. Premature tonight; right answer eventually.
- B73: `_evaluate_all_rules` per-farm `column "farm_id" does not exist` —
  rule SQL needs farm_id qualified or added to the local query context.
- Phase 5 Decision Engine + Phase 9 verify endpoint MUST use Option D pattern
  (or B72 once it lands). Do not invent new RLS bootstrap patterns.
