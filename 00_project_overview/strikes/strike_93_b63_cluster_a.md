# Strike #93 — B63 Cluster A: WORKER_PAID + WORKER_TASK_DONE realignment

**Filed:** 2026-05-04
**Migration:** 066_b63_cluster_a (`066_b63_cluster_a_worker_events.py`)
**Class:** catalog drift (WEIGHT_CHECK / Strike #92 pattern)

## Findings (B63 recon)

- 8 of 12 catalog groups populated; 4 future-scope empty (PERENNIALS, AQUACULTURE, FORESTRY, SPECIALTY)
- WORKER_PAID and WORKER_TASK_DONE incorrectly filed under POULTRY despite being cross-pillar labor concepts
- Cluster B (CYCLE_*, NURSERY_*, GRADING, POST_HARVEST_LOSS in OTHER): deferred — cross-pillar bucket is correct architectural choice; not drift
- Bonus: stale event_type CHECK enum on unidentified tables surfaced (-> B64)

## Fix

- WORKER_PAID: POULTRY (sort_order=34) -> MONEY (sort_order=90)
- WORKER_TASK_DONE: POULTRY (sort_order=35) -> OTHER (sort_order=112)
- POULTRY pillar count: 52 -> 50 (48 visible to a typical farm with 2 hidden system events)
- MONEY pillar count: 8 -> 9
- OTHER pillar count: 12 -> 13

## Verification

Strike #92 binding catalog smoke (authenticated `/api/v1/event-catalog?farm_id=F001-A0EE`):

- POULTRY count in response: 48 (down from 50 — both relocated events correctly absent)
- MONEY count: 9 (+1 WORKER_PAID, end-to-end visible to operator)
- OTHER count in this farm's response: 0
- WORKER_TASK_DONE in OTHER: catalog row correct, but not in this farm's response

The OTHER-group invisibility is **not a bug** and **not regression**: F001-A0EE has `tenant.farm_active_groups.is_active=false` for OTHER (along with AQUACULTURE, FORESTRY, PERENNIALS, SPECIALTY). The catalog endpoint correctly applies the per-farm active_groups filter at `event_catalog.py:144` (`WHERE is_active = true`). WORKER_TASK_DONE will surface in the (+) catalog when the farm activates the OTHER group. Verified by code inspection rather than DB write to test farm.

## Process rule born from this strike

Recon-driven catalog sweeps must distinguish three drift classes:

1. **CLEAR drift** (cross-pillar event in single-pillar bucket): fix via UPDATE migration
2. **JUDGMENT drift** (cross-pillar event in OTHER): leave; OTHER is the deliberate cross-pillar bucket
3. **FALSE POSITIVE** (SYSTEM meta-events flagged by prefix-only heuristic): exclude from sweep

Strike #93 fixed only Class 1 events. Cluster B (Class 2) deferred. Class 3 events excluded entirely.

## Smoke caveat for catalog-realignment commits

When a catalog UPDATE moves an event_type to a target group that the test farm hasn't activated, the Strike #92 binding catalog-fetch smoke will return `false` for that event's user-reachability — but this is per-farm activation state, not a fix regression. Verification path in this case: (a) confirm catalog UPDATE landed via direct SQL, (b) confirm filter logic at `event_catalog.py:144` applies `is_active=true`, (c) note in commit message that visibility for inactive-group events is contingent on operator activating the target group.

## Migration trail

- 066: `UPDATE shared.event_type_catalog SET catalog_group, sort_order WHERE event_type IN ('WORKER_PAID', 'WORKER_TASK_DONE')`. Sort_order computed as `MAX(target_group)+10` for stable append-at-end ordering. Idempotent via `WHERE catalog_group='POULTRY'` guard — re-running a no-op once events are relocated.

## Backlog opened

- B64: stale event_type CHECK constraints on unidentified tables. Probe: `SELECT conrelid::regclass, conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname LIKE '%event_type%' AND contype='c'`. 5 stale verb-style enum values (PLANTING, FERTILIZE, IRRIGATE, SPRAY, PRUNE) surfaced during B63 recon. Don't match current event_type vocabulary. Hypothesis: constraints on partition-children, deprecated tables, or non-audit-events tables. Effort: ~30 min recon + scoped fix migration if needed.
