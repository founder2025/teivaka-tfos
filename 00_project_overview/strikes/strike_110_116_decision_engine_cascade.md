# Strike Cluster #110–116: Decision Engine Restoration Cascade (full arc)

**Date:** 2026-05-07
**Branch:** feature/option-3-plus-nav-v2-1
**Commits:** f216075, ba14e2b, 66f1136, a22e4b1, 656e5ec, b7da6ca, f42626b
**Cluster duration:** ~6 hours of execution
**Cadence:** seven sequential strikes following Six-Step Cadence; each strike's recon surfaced the next bug or unlocked the next layer

> **Replaces** the original `strike_110_114_decision_engine_cascade.md` archive.
> Strikes #115 + #116 closed the same architectural arc; one unified entry
> replaces the partial original for narrative coherence.

## Trigger

`teivaka_beat` was unhealthy for 52+ hours when the cluster opened. Operator
flagged the Celery silent outage as the highest-severity infra debt during
post-Strike-#105 next-phase decision. What started as "diagnose beat" cascaded
through five layers of pre-existing Decision Engine bugs, then continued into
two schema-cleanup strikes that closed the deferred work.

## Architectural arc — seven strikes, one outcome

```
#110  Scheduler resurrected (52h dark + 15-day queue gap closed)
#111  RLS context fixed (engine could finally execute)
#112  DS-002 SQL + config seeded (engine could finally store)
#113  Per-signal isolation (engine became resilient)
#114  Schema gap closed (Bug E real fix — tenant.inputs.farm_id)
#115  Composite PK rewire (per-tenant customization structurally enabled)
#116  Threshold dedup (per-tenant customization functionally honored)
```

End state: Decision Engine produces real per-tenant snapshots with thresholds
read from DB. Operator can change thresholds for any tenant via psql or future
admin UI; engine honors them on next fire.

## Bug discovery cascade

| Bug | Surfaced by | Fixed by | Severity |
|-----|-------------|----------|----------|
| Beat scheduler silent thread death | Strike #110 recon | Strike #110 | Critical (52h dark) |
| Decision + maintenance queues had no consumer | Strike #110 recon | Strike #110 | Critical (15 days dark) |
| Bug A: decision_engine_worker missing RLS context | Strike #110's first manual trigger | Strike #111 | Critical |
| Bug B: refresh_all_materialized_views() function doesn't exist | Strike #110 | Strike #111 (B-guard) | High |
| Bug C / B73: automation_worker per-farm silent traceback | Strike #110 logs | Deferred (Strike #118) | Medium |
| Bug D.1: DS-002 nested aggregate | Strike #111 manual trigger | Strike #112 | High |
| Bug D.2: decision_signal_config FK anchor empty | Strike #112 recon | Strike #112 + #115 | Critical |
| Bug E: tenant.inputs.farm_id missing | Strike #112 manual trigger | Strike #113 (resilience) + Strike #114 (schema fix) | Critical |
| Schema contradiction: PK (signal_id) alone vs per-tenant design | Strike #112 recon | Strike #115 | Architectural |
| Threshold duplication: Python dict vs DB columns | Strike #112 recon | Strike #116 | Tech debt |

## Strike-by-strike summary

### Strike #110 — Celery Scheduler Restoration + Decision Queue Wiring
- Restarted teivaka_beat (PersistentScheduler resumed cleanly)
- Added `--max-interval=60` (narrows future silent-death detection ~5min → ~60s)
- Extended `worker-ai --queues=ai,decision`
- Extended `worker-automation --queues=automation,maintenance`
- Purged 15-day backlog from decision + maintenance queues
- Key recon find: queues had no consumer since 2026-04-20 deploy. Decision Engine had never successfully fired in production.

### Strike #111 — Decision Engine RLS Fix + Maintenance Worker Guard
- Bug A: applied Strike #95 two-stage scan pattern to decision_engine_worker
- Bug B: B-guard pattern on maintenance_worker — try/except `psycopg2.errors.UndefinedFunction`
- Return shape: `tenants_processed + farms_processed + snapshots_stored`
- First successful end-to-end task execution

### Strike #112 — DS-002 Nested-Aggregate Fix + decision_signal_config Seed
- Bug D.1: CTE rewrite on DS-002 query (no nested aggregates)
- Bug D.2: Migration 073 seeds 10 canonical signal config rows anchored to F001-A0EE
- Schema reality acknowledged: `decision_signal_config.signal_id` PK alone (Strike #115 backlog)
- docker cp pattern recurred; explicit revision target (orphan 100_* avoided)

### Strike #113 — Per-Signal SAVEPOINT Isolation (Path B)
- Wrapped each of 10 signal computes in PostgreSQL SAVEPOINT/RELEASE/ROLLBACK pattern
- Helper `_try_signal(signal_id, fn, default)` provides per-signal isolation
- catch-class: `psycopg2.Error` (broadest sane class)
- Return shape further widened: `signals_failed: [(farm_id, signal_id), ...]`
- First non-zero Decision Engine snapshots in production history: 20 fresh rows

#### Strike #91 fail-loud caught three potential disasters during Strike #113
1. AST-light regex rewrite broke DS-009 + DS-010 → restored from backup, redone with Edit-tool-per-block
2. Architect-inferred old_str blocks for DS-003 through DS-008 didn't match → caught at verbatim mismatch → corrected from operator-pasted source
3. Truncated commit message in Strike #105 doc-sync → halted before commit → re-issued cleanly

### Strike #114 — Migration 074 farm_id Schema Fix (Bug E real fix)
- Migration 074: ALTER TABLE tenant.inputs ADD COLUMN farm_id text NOT NULL REFERENCES tenant.farms(farm_id) ON DELETE CASCADE + btree index
- ORM model app/models/inventory.py Input class updated
- Greenfield column on empty table — no backfill required
- 4-anchor model doctrine honored: NOT NULL immediately, CASCADE matches existing tenant_id FK pattern
- Strike #113 SAVEPOINT scaffolding intentionally preserved as defensive insurance

### Strike #115 — decision_signal_config Composite PK + Snapshots FK Rewire
- Migration 075: drop snapshots FK → drop config PK → cross-product seed (10 × 3 = 30 rows) → add composite PK → add composite FK
- ORM models updated: DecisionSignalConfig.tenant_id `primary_key=True`, DecisionSignalSnapshot relationship rewired to composite foreign_keys
- TimescaleDB hypertable chunk inheritance worked automatically (verify gate confirmed)
- All 40 existing snapshots satisfied new composite FK

#### Strike #91 fail-loud caught migration ordering bug during Strike #115
- First attempt ordered: seed → drop FK → drop PK → add new PK → add new FK
- Failed at Step 1 with UniqueViolationError — couldn't add second DS-001 row while single-column PK still in place
- Alembic transactional DDL rolled back cleanly
- Reordered to: drop FK → drop old PK → seed → add new PK → add new FK
- Second attempt succeeded end-to-end
- Architect doctrine logged: DROP constraints → mutate data → ADD constraints. Always.

### Strike #116 — Threshold Source-of-Truth Dedup
- SIGNAL_THRESHOLDS Python dict (10 entries) deleted from decision_engine_worker.py
- value_to_status(signal_id, value) renamed to _threshold_to_status(value, green, amber, lower_is_better)
- Stage 2a outer loop now fetches threshold config alongside farms under per-tenant RLS
- Stage 2b INSERT loop uses thresholds.get(signal_id, (None, None, None)) — missing config row produces NULL status
- Fallback semantics: NULL on missing thresholds (loud-but-safe; was Python's silent default fallback)
- Status distribution unchanged from Strike #115 trigger — refactor verified neutral

## Doctrine compliance across cluster

- Strike #88 doctrine honored: separate doc-sync commits deferred from build commits
- Strike #91 fail-loud prevented every potential disaster pre-deploy (4 catches in cluster)
- Strike #95 RLS pattern reused verbatim in Strike #111
- Strike #96/#112/#114/#115 docker cp pattern required every migration
- Part 4c Migration Procedure applied via teivaka superuser for Migrations 073, 074, 075
- Part 37 Six-Step Cadence observed for every strike

## Outcomes

- Decision Engine ran successfully end-to-end for the first time in production
- 80 snapshot rows accumulated across manual triggers
- 4 signals (DS-002/003/006/009) computing real GREEN values
- 6 signals returning NULL (data sparsity on test farms; not bugs)
- 0 retry storms; 0 queue backlog; 0 worker crashes
- All 8 containers healthy throughout cluster
- Per-tenant threshold customization is structurally enabled (Strike #115) AND functionally honored (Strike #116) end-to-end

## Strike #117+ backlog accumulated

- #117: Orphan migration `100_classroom_foundation.py` investigation
- #118 / B73: automation_worker per-farm `_evaluate_all_rules` silent traceback
- #119: order_line_items.farm_id schema parity (cousin of Bug E)
- #120: Migration 004 mv_input_balance real implementation (now unblocked by Strike #114)

## Platform check

Tomorrow 2026-05-08 06:05 Fiji (18:05 UTC): `decision-engine-daily` fires natural for first real time after cluster close. Expected: ~20 fresh snapshots × current accumulated 80 = ~100 total, signals_failed empty, no DS-004 errors, no retry storm, status distribution stable.

```
docker exec teivaka_db psql -U teivaka -d teivaka_db -c "
  SELECT signal_id, signal_status, COUNT(*) AS rows, COUNT(DISTINCT farm_id) AS farms
  FROM tenant.decision_signal_snapshots
  WHERE snapshot_date > NOW() - INTERVAL '24 hours'
  GROUP BY signal_id, signal_status
  ORDER BY signal_id;"
```
