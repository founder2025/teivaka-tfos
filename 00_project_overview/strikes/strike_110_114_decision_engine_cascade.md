# Strike Cluster #110–114: Decision Engine Restoration Cascade

**Date:** 2026-05-07
**Branch:** feature/option-3-plus-nav-v2-1
**Commits:** f216075, ba14e2b, 66f1136, a22e4b1, 656e5ec
**Cluster duration:** ~4 hours of execution
**Cadence:** five sequential strikes following Six-Step Cadence; each strike's recon surfaced the next bug

## Trigger

`teivaka_beat` was unhealthy for 52+ hours when the cluster opened. Operator
flagged the Celery silent outage as the highest-severity infra debt during
post-Strike-#105 next-phase decision. What started as "diagnose beat" cascaded
through five layers of pre-existing Decision Engine bugs that had been hidden
because no consumer was running the relevant queues.

## Bug discovery cascade

| Bug | Surfaced by | Fixed by | Severity |
|-----|-------------|----------|----------|
| Beat scheduler silent thread death | Recon | Strike #110 | Critical (52h dark) |
| Decision + maintenance queues had no consumer | Recon | Strike #110 | Critical (15 days dark) |
| Bug A: decision_engine_worker missing RLS context | Strike #110's first manual trigger | Strike #111 | Critical (engine never ran successfully) |
| Bug B: refresh_all_materialized_views() function doesn't exist | Strike #110 | Strike #111 (B-guard) | High (retry loop noise) |
| Bug C / B73: automation_worker per-farm silent traceback | Logged from Strike #110 | Deferred (Strike #118) | Medium |
| Bug D.1: DS-002 nested aggregate | Strike #111 manual trigger | Strike #112 | High (DS-002 broken) |
| Bug D.2: decision_signal_config FK anchor empty | Strike #112 recon | Strike #112 | Critical (zero snapshots possible) |
| Bug E: tenant.inputs.farm_id missing | Strike #112 manual trigger | Strike #113 (resilience) + Strike #114 (real fix) | Critical (DS-004 broken) |

## Strike-by-strike summary

### Strike #110 — Celery Scheduler Restoration + Decision Queue Wiring
- Restarted teivaka_beat (PersistentScheduler resumed cleanly)
- Added `--max-interval=60` to beat command (narrows future silent-death detection from ~5min to ~60s)
- Extended `worker-ai --queues=ai,decision`
- Extended `worker-automation --queues=automation,maintenance`
- Purged 15-day backlog from decision + maintenance queues (15 stale tasks each)
- **Key recon find:** decision + maintenance queues had no consumer configured since 2026-04-20 deploy. Decision Engine had **never** successfully fired in production.

### Strike #111 — Decision Engine RLS Fix + Maintenance Worker Guard
- Bug A: applied Strike #95 two-stage scan pattern to decision_engine_worker (Stage 1 enumerates tenants without RLS; Stage 2a lists farms under `with_rls`; Stage 2b runs per-farm compute + INSERT under same RLS context)
- Bug B: B-guard pattern on maintenance_worker — try/except `psycopg2.errors.UndefinedFunction` returns no-op success with warning log
- Return shape widened: `tenants_processed + farms_processed + snapshots_stored`
- First successful end-to-end task execution

### Strike #112 — DS-002 Nested-Aggregate Fix + decision_signal_config Seed
- Bug D.1: CTE rewrite on DS-002 query — per-cycle inactivity in inner CTE, farm-level MAX + Kava-180-day exclusion in outer query (no nested aggregates)
- Bug D.2: Migration 073 seeds 10 canonical signal config rows (DS-001..DS-010) anchored to F001-A0EE Save-A-Lot Farm tenant
- Schema reality acknowledged: `decision_signal_config.signal_id` PK is alone, not composite (Strike #115 backlog item)
- Required `docker cp` of migration file into teivaka_api container (Strike #96 pattern recurred)
- Required explicit revision target `alembic upgrade 073_signal_config_seed` (orphan `100_classroom_foundation.py` would create Multiple-Heads condition)
- Threshold values lossless-copied from Python `SIGNAL_THRESHOLDS` dict; threshold-source-of-truth dedup deferred (Strike #116)

### Strike #113 — Per-Signal SAVEPOINT Isolation (Path B)
- Wrapped each of 10 signal computes in PostgreSQL SAVEPOINT/RELEASE/ROLLBACK pattern
- Helper function `_try_signal(signal_id, fn, default)` provides per-signal isolation
- catch-class: `psycopg2.Error` (broadest sane class — catches UndefinedColumn, GroupingError, etc. without swallowing Python interrupts)
- Return shape further widened: `signals_failed: [(farm_id, signal_id), ...]` for observability
- **First non-zero Decision Engine snapshots in production history:** 20 fresh rows, 2 farms, 2 tenants, DS-004 logged as warning + recorded in signals_failed

#### Strike #91 fail-loud caught three potential disasters during Strike #113
1. AST-light regex rewrite broke DS-009 + DS-010 (conditional logic) → file didn't parse → restored from backup, redone with Edit-tool-per-block
2. Architect-inferred old_str blocks for DS-003 through DS-008 didn't match actual file → caught at verbatim mismatch → corrected from operator-pasted source
3. Truncated commit message in earlier doc-sync (Strike #105 cluster) → halted before commit → re-issued cleanly

### Strike #114 — Migration 074 farm_id Schema Fix (Bug E real fix)
- Migration 074: `ALTER TABLE tenant.inputs ADD COLUMN farm_id text NOT NULL REFERENCES tenant.farms(farm_id) ON DELETE CASCADE` + btree index
- ORM model `app/models/inventory.py` Input class: farm_id Mapped[str] declaration added
- Greenfield column on empty table — no backfill required (recon confirmed 0 rows)
- 4-anchor model doctrine honored: NOT NULL immediately, CASCADE matches existing tenant_id FK pattern
- Strike #113 SAVEPOINT scaffolding intentionally preserved as defensive insurance for future Bug-E-pattern discoveries
- Manual trigger result: signals_failed list empty — DS-004 query no longer errors; computes NULL today (table still empty) but clean

## Doctrine compliance across cluster

- **Strike #88 doctrine** honored: separate doc-sync commit (this archive entry + Section 14 update) deferred from build commits, landing now as own commit
- **Strike #91 fail-loud** prevented every potential disaster pre-deploy (3 catches in cluster)
- **Strike #95 RLS pattern** reused verbatim in Strike #111 (canonical reference impl)
- **Strike #96/#112 docker cp pattern** required again in Strike #114 (host always has 1 more file than image after migration write)
- **Part 4c Migration Procedure** applied via teivaka superuser for Migrations 073 + 074
- **Part 37 Six-Step Cadence** observed for every strike: Recon → Build → Verify → Commit+Push → Platform Check (deferred to natural fire) → Next Phase

## Outcomes

- Decision Engine ran successfully end-to-end for the first time in production
- 20 snapshot rows landed in `tenant.decision_signal_snapshots` per fire
- 4 signals (DS-002/003/006/009) computing real GREEN values
- 6 signals returning NULL (data sparsity on test farms or schema-gap-graceful fallback)
- 0 retry storms; 0 queue backlog; 0 worker crashes
- All 8 containers healthy throughout cluster

## Strike #115+ backlog accumulated by this cluster

- **#115:** decision_signal_config composite PK + snapshots FK rewire (Bug D.2 schema cleanup)
- **#116:** Threshold source-of-truth dedup (Python dict vs DB columns)
- **#117:** Orphan migration `100_classroom_foundation.py` investigation
- **#118 / B73:** automation_worker per-farm `_evaluate_all_rules` silent traceback (Bug C)
- **#119:** order_line_items.farm_id schema parity (cousin of Bug E)
- **#120:** Migration 004 mv_input_balance real implementation (now unblocked by Strike #114)

## Platform check

Tomorrow 2026-05-08 06:05 Fiji (18:05 UTC): `decision-engine-daily` fires natural for first real time. Expected: ~20 fresh snapshots, signals_failed empty, no DS-004 errors, no retry storm.

```bash
docker exec teivaka_db psql -U teivaka -d teivaka_db -c "
  SELECT signal_id, signal_status, COUNT(*) AS rows, COUNT(DISTINCT farm_id) AS farms
  FROM tenant.decision_signal_snapshots
  WHERE snapshot_date > NOW() - INTERVAL '24 hours'
  GROUP BY signal_id, signal_status
  ORDER BY signal_id;"
```

If non-empty signals_failed: that's Strike #115+ scope. If retry storm or beat death: cluster reopens.
