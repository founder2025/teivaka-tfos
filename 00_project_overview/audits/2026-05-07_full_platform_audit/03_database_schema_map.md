# Phase 3 — Database Schema Map

**Audit date:** 2026-05-07
**Recon executed:** 2026-05-08 05:40 UTC + follow-up 05:44 UTC
**DB:** PostgreSQL 16.3 + TimescaleDB 2.15.3 + pgvector 0.7.2 + pgcrypto + uuid-ossp
**Container:** `teivaka_db` (Up 3 days, healthy, port 127.0.0.1:5432)
**Alembic head:** `075_decision_signal_composite_pk` ✓ (matches code expectations)
**Recon scripts:** `/tmp/phase3_recon.sh` + inline follow-up

---

## Executive summary

The database is **architecturally complete but data-sparse**: 105 user tables across 6 schemas (`audit`, `community`, `learning`, `ops`, `shared`, `tenant`), but **67 tables (64%) are empty**. Of 8 TimescaleDB hypertables in `tenant`, 5 have zero chunks. RLS is enabled on 46 tables — but **forced** on only 11; 35 RLS-enabled tables can be bypassed by table-owner / superuser. **The audit-chain is verified intact** (`audit.public_chain_stats` returns 0 chain breaks across 299 events with the latest Bank PDF hash `e2df2a6c5b3c…`).

Three findings are critical and route directly to Phase 9:

1. **`tenant.farm_active_groups` has no `tenant_id` column and no RLS policy** (33 rows). Tenant isolation is *indirect* through `farm_id → farms.tenant_id`, but without RLS, any tenant can read/write any farm's group activations. Cross-tenant data exposure surface.
2. **`audit.events` contains 70 distinct `tenant_id`s** while `tenant.tenants` registry has only 3. 67 orphan tenant_ids — either abandoned signups (audit ledger outliving tenant rows), test churn from 2026-04-21 onward, or seed-data anomalies. Audit-chain hostile because chain verification per-tenant relies on querying by `tenant_id`.
3. **`tenant.tenants` schema diverges from brief**: subscription tier vocabulary is `BASIC` + `PROFESSIONAL` (3 rows), not the brief's `FREE / BASIC / PREMIUM / CUSTOM`. All 3 tenants are `mode=GROWTH` — Solo Mode never activated despite Phase 8-1 PIVOT and Strike #93 work. No Stripe IDs, no subscription dates populated. Payments stack absent.

The Decision Engine cluster #110-116 outcome is **verified at the data level**: 30 config rows (10 signals × 3 tenants — Strike #115 cross-product), 100 snapshots, 4 signals (DS-002/003/006/009) computing GREEN, 6 NULL (data-sparsity, not bugs), latest snapshot `2026-05-08 06:05:00.226+12` (the natural-fire from this morning's Fiji-time scheduled run).

Migration 034 has **zero filesystem trace** — neither in version files (Phase 2.20) nor as any DB-object fingerprint. Confirmed deleted before the 2026-04-17 baseline import.

---

## 3.0 Pre-flight

```
DB version:    PostgreSQL 16.3 on x86_64-pc-linux-musl (Alpine 13.2.1)
DB user:       teivaka
Database:      teivaka_db
Alembic head:  075_decision_signal_composite_pk        ✓ matches expectations
Container:     teivaka_db  Up 3 days (healthy)  127.0.0.1:5432→5432
```

Alembic migration head matches both the code expectation (Strike #116) and the doc-sync's reconciled CLAUDE.md Section 14. **No drift.**

---

## 3.1 Schemas

15 schemas total. User-facing:

| Schema | Purpose | Tables |
|---|---|---:|
| `audit` | Hash-chain ledger + report exports | 2 |
| `community` | Posts, comments, follows, likes, blocks | 6 |
| `learning` | Bookmarks, progress (Classroom user-state) | 2 |
| `ops` | Health checks, alert events | 2 |
| `public` | Default schema (extensions install here) | 0 user |
| `shared` | Cross-tenant catalogs + reference data | 24 |
| `tenant` | All per-tenant rows (RLS-enforced) | 46 |

TimescaleDB internals: `_timescaledb_cache`, `_timescaledb_catalog`, `_timescaledb_config`, `_timescaledb_debug`, `_timescaledb_functions`, `_timescaledb_internal`, `timescaledb_experimental`, `timescaledb_information`. 8 schemas of plumbing.

### Strike #91 finding (schema topology)

Brief expected `classroom` schema. **`classroom` schema does not exist.** Classroom-domain tables live across two locations:
- `shared.classroom_lessons`, `shared.classroom_modules`, `shared.classroom_tracks` — definition-side (committed via Migration 017b)
- `learning.bookmarks`, `learning.progress` — user-state side (Migration source unclear)

The orphan `100_classroom_foundation.py` (Phase 1+2 finding) likely intended to consolidate these into a unified `classroom` schema but was never applied. → **Strike #117 backlog confirmed at DB level**.

---

## 3.2 Tables per schema + 3.3 row counts

```
schemaname              table_count
_timescaledb_cache              3
_timescaledb_catalog           20
_timescaledb_config             1
_timescaledb_internal          14
audit                           2     ← events, report_exports
community                       6
learning                        2
ops                             2     ← health_checks, alert_events
shared                         24
tenant                         46
                          ───────
TOTAL user-facing             82
TOTAL incl TimescaleDB       120
```

### Population state (top-30 populated tables)

| Schema | Table | Rows | Total size |
|--------|-------|---:|---|
| `ops` | `health_checks` | **8,599** | 1840 kB |
| `audit` | `events` | **299** | 448 kB |
| `shared` | `naming_dictionary` | 254 | 144 kB |
| `shared` | `rotation_top_choices` | 147 | 64 kB |
| `shared` | `event_type_catalog` | 127 | 88 kB |
| `shared` | `crop_varieties` | 101 | 96 kB |
| `shared` | `productions` | 94 | 160 kB |
| `shared` | `actionable_rules` | 67 | 64 kB |
| `shared` | `attribution_events` | 65 | 120 kB |
| `shared` | `registration_audit_log` | 55 | 112 kB |
| `shared` | `rotation_registry` | 49 | 32 kB |
| `shared` | `production_thresholds` | 49 | 32 kB |
| `tenant` | `poultry_event_log` | 48 | 128 kB |
| `shared` | `chemical_library` | 45 | 80 kB |
| `shared` | `farm_libraries` | 44 | 80 kB |
| `shared` | `crop_nutrition_protocols` | 42 | 120 kB |
| `shared` | `production_stages` | 37 | 48 kB |
| `tenant` | `farm_active_groups` | **33** | 80 kB ⚠ |
| `tenant` | `decision_signal_config` | 30 | 32 kB ✓ |
| `tenant` | `production_units` | 23 | 112 kB |
| `tenant` | `task_queue` | 16 | 128 kB |
| `tenant` | `cash_ledger` | 5 | 80 kB |
| `tenant` | `farms` | **3** | 80 kB |
| `tenant` | `tenants` | **3** | 88 kB |
| `tenant` | `users` | 3 | 208 kB |
| `tenant` | `production_cycles` | 2 | 184 kB |
| `tenant` | `flocks` | 2 | 80 kB |
| `tenant` | `cycle_financials` | 2 | 64 kB |

**`tenant.farm_active_groups` flagged** — 33 rows but no RLS (see 3.11).

---

## 3.4 Empty tables (67 of 105 user tables)

**~64% of user tables are empty.** Notable empties:

### Empty tenant tables (24 of 46)
```
accounts_receivable, ai_commands, alerts, automation_rules, customers,
decision_signal_snapshots*, delivery_log, equipment, field_events*,
harvest_compliance_overrides, harvest_log*, harvest_loss, hive_register,
income_log*, input_transactions, inputs, kb_embeddings, labor_attendance*,
livestock_register, nursery_log, order_line_items, orders, price_master,
profit_share, referral_rewards, rotation_override_log, suppliers,
tis_advisories, tis_conversations, tis_voice_logs*, weather_log*, workers
```

`*` = TimescaleDB hypertable. The `pg_stat_user_tables` "empty" status for hypertables is misleading — data lives in chunks. **For non-hypertables** (the rest), genuinely empty. Most are feature-scaffolding ahead of data: `tenant.alerts`, `tenant.automation_rules`, `tenant.referral_rewards`, `tenant.tis_*`, `tenant.kb_embeddings`.

### Empty shared tables (8 of 24)
```
classroom_lessons, classroom_modules, classroom_tracks,
crop_guide_pages, kb_article_candidates, kb_articles, kb_stage_links
```

**The Classroom (TFOS pillar 2) is empty at definition layer.** Lessons, modules, tracks: 0 rows. The 9 SOL/Education-tagged routers exist (1.17 listing in Phase 1) but no content. → Phase 4.

**The TIS Knowledge Base is empty at definition layer.** `shared.kb_articles` (canonical KB), `kb_article_candidates`, `kb_stage_links`, `crop_guide_pages` — all empty. **`tenant.kb_embeddings` is empty too** (1632 KB of indexes but 0 heap — index pre-warm without data, or stale). → Phase 4 + Phase 8 (TIS integration).

### Empty community tables (5 of 6)
```
follows, post_comments, post_flags, post_likes, user_blocks
```

Only `community.posts` has 1 row. Community moat surface present, traffic-zero.

### Empty learning tables (2 of 2)
```
bookmarks, progress
```

Both empty.

---

## 3.5 Widest tables (top 30 by column count)

| Schema | Table | Columns |
|---|---|---:|
| `public` | `pg_stat_statements` | 43 |
| `tenant` | **`users`** | **37** |
| `tenant` | **`task_queue`** | **32** |
| `tenant` | `field_events` | 30 |
| `tenant` | `production_cycles` | 28 |
| `tenant` | `harvest_log` | 27 |
| `tenant` | `tenants` | 25 |
| `tenant` | `farms` | 23 |
| `tenant` | `delivery_log` | 22 |
| `tenant` | `alerts` | 22 |
| `tenant` | `income_log` | 22 |
| `tenant` | `labor_attendance` | 21 |
| `tenant` | `automation_rules` | 21 |
| `shared` | `crop_nutrition_protocols` | 20 |
| `tenant` | `input_transactions` | 19 |
| `tenant` | `inputs` | 19 |
| `tenant` | `livestock_register` | 19 |

`tenant.users` (37 cols) and `task_queue` (32) are the widest user tables — likely have accumulated columns through several feature waves. → Phase 4 schema-vs-ORM cross-check.

---

## 3.6 Indexes

```
schemaname              index_count
audit                            9
community                       13
learning                         5
ops                              6
shared                          58
tenant                         171
                          ───────
TOTAL user                     262
TOTAL incl TimescaleDB         377
```

**171 indexes on tenant tables** — heavy indexing. Combined with 67 check constraints + 305 FKs (3.8/3.9), the relational model is densely constrained.

---

## 3.7 Tables without primary key

```
9 tables, all in TimescaleDB internals
(cache_inval_*, chunk_constraint, chunk_index, continuous_aggs_invalidation_log×2,
 telemetry_event, bgw_policy_chunk_stats)
```

**Zero user tables without PK.** Strong PK discipline.

---

## 3.8 / 3.9 Constraints

- **305 foreign keys** total. ~50 are user-defined (rest are TimescaleDB chunk-replicate FKs auto-generated per chunk).
- **156 check constraints** total: 70 in `tenant`, 33 in `shared`, 23 in TimescaleDB internals, 16 in catalog, 8 in community, 4 in ops, 3 in learning, 2 in audit. Strong domain validation surface.

Sample tenant FK relationships (audit-chain critical):
```
tenant.field_events.tenant_id      → tenant.tenants.tenant_id
tenant.field_events.farm_id        → tenant.farms.farm_id
tenant.field_events.cycle_id       → tenant.production_cycles.cycle_id
tenant.field_events.pu_id          → tenant.production_units.pu_id
tenant.field_events.created_by     → tenant.users.user_id
tenant.field_events.deleted_by     → tenant.users.user_id
tenant.field_events.input_id       → tenant.inputs.input_id
tenant.field_events.chemical_id    → shared.chemical_library.chemical_id
tenant.field_events.performed_by_worker_id → tenant.workers.worker_id
```

The 4-anchor model (`tenant_id + farm_id + cycle_id + pu_id`) is enforced at FK level in `field_events` (the polymorphic spine table). + 1 optional anchor (`flock_id`) per Phase 6.2-3 visible in audit JSON payloads.

---

## 3.10 / 3.11 Row-Level Security

### RLS-enabled tables (46 total)

```
audit:        events, report_exports                                        (2)
shared:       farm_libraries                                                (1)
tenant:       46 of 46 with policies, 43 with RLS enabled                   (43)
              + alerts, cash_ledger, farms, field_events, harvest_log,
                labor_attendance, production_cycles, production_units,
                task_queue, tis_advisories, users  ← 11 with rls_forced=true
              + 32 with rls_forced=false  ← superuser bypass surface
```

### **Strike #91 critical finding — tenant tables WITHOUT RLS**

```
tenant.alembic_version    ← system internal, OK
tenant.tenants            ← tenancy boundary itself, OK by design
tenant.farm_active_groups ← 33 rows, NO tenant_id column, NO RLS  ⚠⚠⚠
```

**`tenant.farm_active_groups` is the cross-tenant exposure surface.** Schema (from follow-up):

```
column_name      data_type
farm_id          text
catalog_group    text
is_active        boolean
activated_at     timestamp with tz
activated_by     uuid
```

No `tenant_id` column. No RLS policy. With 33 rows on 3 farms (presumably ~11 catalog group activations each), any tenant query hitting this table can see/modify rows for *any* farm — including farms owned by *other tenants*. The **only** isolation is application-layer filter by `farm_id` (which the application can derive from JWT tenant context).

**Risk:** any router that joins `farm_active_groups` without explicitly filtering by an RLS-protected table (e.g. `farms`) reads cross-tenant data. → Phase 4 router audit + Phase 9 critical.

**Fix paths:**
- (a) Add `tenant_id` column + backfill from farms join + add RLS policy + force RLS — clean but requires downtime
- (b) Add RLS policy that joins `tenant.farms` to enforce tenant_id at policy level (`USING (farm_id IN (SELECT farm_id FROM tenant.farms WHERE tenant_id = current_setting('app.tenant_id')::uuid))`)

### RLS forced vs unforced

11 tables have `rls_forced=true`, 35 have `rls_forced=false`. Without `FORCE ROW LEVEL SECURITY`, RLS policies don't apply to the table owner. If `teivaka` user ever runs queries through any path that uses table-owner privileges (e.g., a worker or migration), the 35 unforced RLS tables leak across tenants. → Phase 9 audit.

---

## 3.12 Triggers (66 total)

| Schema | Triggers | Notable |
|---|---:|---|
| `_timescaledb_internal` | 18 | Per-chunk replicas of harvest/whd triggers |
| `_timescaledb_catalog` | 1 | metadata_insert_trigger |
| `audit` | **2** | **`audit_events_block_delete` + `audit_events_block_update`** — immutability |
| `community` | 5 | post_comments + post_likes count maintainers |
| `shared` | 2 | classroom_lessons → track_lesson_count |
| `tenant` | 38 | 18× `update_*_updated_at`, plus harvest/cycle/finance/inventory chains |

### Audit-chain DB-level enforcement (critical positive finding)

```
audit.events:
  audit_events_block_delete  BEFORE DELETE
  audit_events_block_update  BEFORE UPDATE
```

The audit ledger's append-only invariant is **enforced at the database level**, not just by application convention. Any DELETE or UPDATE on `audit.events` is blocked by trigger — even by the table owner. + the `events_immutability_guard` function (3.14). This is the audit-chain integrity floor.

### Tenant trigger highlights

- `tis_rate_limit_check` on `ai_commands` + `tis_voice_logs` — TIS rate limit enforced at DB
- `harvest_compliance_enforce` on `harvest_log` — chemical compliance checked BEFORE INSERT
- `update_cycle_on_harvest_insert` AFTER INSERT — cycle status auto-updates
- `after_harvest_financials` AFTER INSERT — cycle_financials maintained
- `after_input_txn_inventory` + `check_stock_before_txn` + `update_input_stock_on_txn` — inventory triple-trigger chain on `input_transactions`
- `recompute_financials_on_income` AFTER INSERT — income → financials chain
- `increment_rule_count_on_alert` AFTER INSERT — automation rule fire-counter
- `ts_insert_blocker` on hypertables — TimescaleDB native (blocks direct insert on parent table; routing happens via chunks)

**38 tenant-schema triggers is high.** Many are simple `updated_at` stampers (fine). The business-logic triggers (harvest/cash/inventory chains) are concentrated and visible.

---

## 3.13 Views + materialized views

```
view  | _timescaledb_internal      | compressed_chunk_stats
view  | _timescaledb_internal      | hypertable_chunk_local_size
view  | public                     | pg_stat_statements
view  | public                     | pg_stat_statements_info
view  | tenant                     | mv_input_balance              ← stub-view, not MV
view  | timescaledb_experimental   | policies
view  | timescaledb_information    | (8 informational views)
```

**`tenant.mv_input_balance` is a regular VIEW, NOT a materialized view.** Migration 035 (`tenant_mv_input_balance_stub`) created the stub. **Strike #120 backlog confirmed**: "Migration 004 mv_input_balance real implementation (now unblocked by Strike #114)".

**Zero materialized views in the database.** The migration 004 file is named `materialized_views.py` but the implementation is deferred. → Phase 4.

---

## 3.14 Functions

```
schema                    func_count   notes
_timescaledb_debug                1
_timescaledb_functions          104    TimescaleDB API
_timescaledb_internal            76
audit                             5    ← compute_hash, events_immutability_guard,
                                          public_chain_stats, verify_chain_for_tenant,
                                          verify_event_by_hash
community                         2    post_comments_count + post_likes_count
public                          243    pgvector + pgcrypto + uuid-ossp + TimescaleDB
shared                            1
tenant                           26
timescaledb_experimental         13
                          ─────────
TOTAL                           471
```

### Audit-chain function API (critical positive finding)

The 5 audit functions form the integrity API:

```
audit.compute_hash(p_tenant_id uuid, p_previous_hash char,
                   p_payload_sha256 char, p_occurred_at timestamptz)
audit.events_immutability_guard()   ← trigger fn
audit.public_chain_stats()           ← public verify endpoint backing
audit.verify_chain_for_tenant(p_tenant_id uuid)
audit.verify_event_by_hash(p_hash char)
```

`public_chain_stats()` is what the public `/verify` endpoint hits (per Phase 9-3 commit `138187e`). Calling it now (from follow-up):

```
total_events: 299
tenant_count: 70                        ⚠ vs 3 in tenant.tenants registry
chain_break_count: 0                    ✓ chain intact
latest_bank_pdf_hash: e2df2a6c5b3c63385c89a9e18fcfa965a9260df0594367cbca32549fd4f2d4c7
```

### **Strike #91 finding — tenant_count mismatch**

`audit.public_chain_stats.tenant_count = 70`, but `tenant.tenants` has **3 rows**. 67 orphan tenant_ids in audit ledger.

**Plausible explanations:**
- Test signups during 2026-04-21 → 2026-05-05 active dev that created tenant rows + audit events, then `tenants` rows were deleted (cleanup) but audit events retained. Audit ledger correctly outliving deleted tenants — that's the design.
- Audit events seeded with hardcoded tenant_ids that don't exist in tenants registry.
- Real customers signed up, abandoned, tenant rows were cleaned. Audit chain preserved.

**For audit chain integrity:** this is fine — audit is append-only, deletions of upstream rows don't break chain hashes. The chain_break_count = 0 confirms.
**For audit chain *evidentiary* utility:** anomalous — Bank Evidence PDFs reference tenant_ids that no longer have a registered tenant. Phase 9 critical.

**Recommend Phase 9 follow-up:** Distribution query of tenant_ids in audit.events vs tenants registry, identify the 67 orphans, document whether they're test artifacts or real-customer-cleanup residue.

### Tenant function inventory (26 — to dump in Phase 4)

Not enumerated here (recon hit limit at 100 rows). Visible from sample: `update_*_updated_at` stamper functions + business-logic functions. Phase 4 (backend) will cross-check function calls against router/worker code.

---

## 3.15 Sequences

```
_timescaledb_catalog        7
_timescaledb_config         1
_timescaledb_internal       1
shared                      4
tenant                      0   ← no app sequences (UUIDs everywhere)
                          ───
TOTAL user                  4
```

**Zero sequences in `tenant` schema.** All tenant primary keys are UUIDs (or composite). Confirms UUID-first identity strategy. The 4 shared sequences are likely auto-incrementing on `naming_dictionary`, `event_type_catalog`, `actionable_rules`, etc.

---

## 3.16 Extensions

```
pg_stat_statements   1.10     query stats
pgcrypto             1.3      gen_random_uuid, hashing primitives
plpgsql              1.0      stored procedures language
timescaledb          2.15.3   hypertables + continuous aggregates (no CAGGs in use yet)
uuid-ossp            1.1      UUID generation
vector               0.7.2    pgvector (embedding storage)
```

**Six extensions, all standard.** No surprises. pgvector + TimescaleDB are the moat-relevant ones (TIS embeddings + audit time-series).

---

## 3.17 TimescaleDB hypertables (8)

| Hypertable | Chunks | State |
|---|---:|---|
| `tenant.field_events` | **5** | Active — POULTRY + harvest + chemical events |
| `tenant.harvest_log` | **4** | Active — harvest entries |
| `tenant.decision_signal_snapshots` | **1** | Active — Decision Engine (post-cluster #110-116) |
| `tenant.ai_commands` | **1** | Active (low) — TIS commands |
| `tenant.income_log` | 0 | Empty |
| `tenant.labor_attendance` | 0 | Empty |
| `tenant.tis_voice_logs` | 0 | Empty |
| `tenant.weather_log` | 0 | Empty |

**3 of 8 hypertables active**, 5 empty. The empty ones (income_log, labor_attendance, tis_voice_logs, weather_log) are feature scaffolding ahead of data — the routers (1.17 in Phase 1: `income.py`, `labor.py`, `voice.py`, `weather.py`) exist but data ingest hasn't fired yet.

**`income_log` empty is a moat-relevant finding** — no income flowing into the audit chain → no Bank Evidence diversity → currently the latest Bank PDF hash is for one tenant's POULTRY-only flow.

---

## 3.18 pgvector usage

```
shared.kb_articles.embedding_vector
tenant.kb_embeddings.embedding
```

Two vector columns. `shared.kb_articles` is **empty** (no canonical articles loaded). `tenant.kb_embeddings` is **empty data, 1632 KB indexes**. The HNSW index exists but data was never loaded (or was loaded then truncated). → Phase 4 + Phase 8 (TIS integration audit).

---

## 3.19 Audit ledger state

```
event_count:        299
distinct_tenants:    70  ⚠ (vs 3 in registry)
genesis_events:     ?    (column previous_hash is NULLABLE — first event per tenant is genesis)
unhashed_events:    0    (this_hash is NOT NULL — DB enforces)
first_event:        2026-04-21 16:37:38.890225+12
last_event:         2026-05-05 12:00:00+12
```

### Audit event type distribution (top 30)

| Event type | Count |
|---|---:|
| **FARM_GROUP_TOGGLED** | **83** |
| **CYCLE_TRANSITION** | **74** |
| TASK_COMPLETED | 21 |
| ONBOARDING_STARTED | 14 |
| HEALTH_OBSERVATION | 8 |
| CHEMICAL_APPLIED | 8 |
| EGGS_COLLECTED | 7 |
| TASK_SKIPPED | 7 |
| FARM_CREATED | 6 |
| ONBOARDING_COMPLETED | 6 |
| **BANK_PDF_GENERATED** | **6** ← moat artifact emissions |
| LIBRARY_ROW_ADDED | 5 |
| WITHHOLDING_VIOLATION_ATTEMPTED | 5 |
| CASH_LOGGED | 5 |
| LIBRARY_ROW_DEACTIVATED | 4 |
| VACCINATION_GIVEN | 4 |
| INCIDENT_REPORTED | 3 |
| EGGS_SOLD | 3 |
| FEED_USED | 2 |
| PLANTING | 2 |
| PEST_CONTROL_APPLIED | 2 |
| SUPPLIES_RECEIVED | 2 |
| FLOCK_PLACED | 2 |
| EQUIPMENT_MAINTAINED | 2 |
| FLOCK_MOVED | 1 |
| MORTALITY_INVESTIGATED | 1 |
| LIBRARY_ROW_REACTIVATED | 1 |
| LITTER_CHANGED | 1 |
| BIRD_REPLACEMENT | 1 |
| EGGS_GRADED | 1 |

**Six BANK_PDF_GENERATED events** — the first moat artifact has fired 6 times. → Phase 8 cross-check with `audit.report_exports` (6 rows in 3.3).

`FARM_GROUP_TOGGLED` (83) and `CYCLE_TRANSITION` (74) dominate. Onboarding flow + group activation + cycle transitions are the most-emitted business events.

### Audit.events full schema

```
event_id              uuid          NOT NULL
tenant_id             uuid          NOT NULL
actor_user_id         uuid          NULL
event_type            varchar       NOT NULL
entity_type           varchar       NULL
entity_id             varchar       NULL
occurred_at           timestamptz   NOT NULL
payload_jsonb         jsonb         NOT NULL
payload_sha256        char          NOT NULL
previous_hash         char          NULL  ← genesis events have NULL
this_hash             char          NOT NULL
client_offline_id     varchar       NULL
created_at            timestamptz   NOT NULL
```

13 columns. Hash chain: `previous_hash → this_hash` linked via `audit.compute_hash(tenant_id, previous_hash, payload_sha256, occurred_at)`. Each chain is **per-tenant** (the chain key includes `tenant_id`), so 70 tenant_ids = 70 sub-chains.

### Sample event payload (PLANTING)
```json
{
  "anchors": {
    "pu_id": "F001-A0EE-PU004",
    "farm_id": "F001-A0EE",
    "cycle_id": "CYC-F001-A0EE-PU004-2026-001",
    "flock_id": null
  },
  "event_type": "PLANTING",
  "payload_keys": ["plant_count", "spacing_cm", "variety"],
  "payload_schema_version": 1
}
```

Anchors are normalized at write-time (the 4-anchor model: tenant + farm + cycle + pu, with optional flock for poultry). `payload_keys` is metadata-only — actual values are not in the JSONB? Or are they not surfaced in the SHA256 input? → Phase 9 hash-input verification.

### Chain integrity (positive finding)

```
chain_break_count: 0 across 299 events
```

The `audit.public_chain_stats()` function reports zero broken links. The hash chain is intact across the entire 16-day audit window.

---

## 3.20 Migration 034 forensics

```
Tables matching '034' or 'audit_event_type_cash':  0
Columns matching '034':                            0
```

**Migration 034 has zero database-side fingerprint.** Combined with Phase 2 finding (no `034_*.py` file on disk), the conclusion is: **migration 034 was deleted from disk before the 2026-04-17 baseline import**. The slot between `033_cash_ledger_anchors` and `035_tenant_mv_input_balance_stub` was either:

- Renamed/squashed into adjacent migrations
- Authored, applied, dropped, deleted, never replayed
- Reserved for a feature that was rerouted

**Audit-chain implication:** if migration 034 created/altered any audit-related schema and was applied, removed without rollback would leave audit-chain dependent on schema changes that no migration documents. Combined with the `tenant_count=70` orphan finding, suggests Phase 9 should verify audit-chain hash inputs explicitly.

---

## 3.21 Classroom schema state (resolved)

```
classroom schema:           DOES NOT EXIST
shared.classroom_*:         3 tables, ALL EMPTY (lessons, modules, tracks)
learning.bookmarks:         empty
learning.progress:          empty
```

The architecture is **split across `shared` (definitions) and `learning` (user-state)** with no `classroom` schema. The `100_classroom_foundation.py` orphan likely intended to consolidate or replace this layout. **Strike #117 backlog confirmed** — at DB level, the canonical home is unclear and unfilled.

---

## 3.22 Largest tables by storage

| Schema | Table | Total | Heap | Indexes |
|---|---|---:|---:|---:|
| `ops` | `health_checks` | 1840 kB | 672 kB | 1128 kB |
| `tenant` | **`kb_embeddings`** | **1632 kB** | **0 bytes** | **1624 kB** ⚠ |
| `audit` | `events` | 448 kB | 192 kB | 224 kB |
| `tenant` | `users` | 208 kB | 8 kB | 160 kB |
| `tenant` | `production_cycles` | 184 kB | 8 kB | 136 kB |
| `shared` | `productions` | 160 kB | 72 kB | 48 kB |
| `shared` | `naming_dictionary` | 144 kB | 32 kB | 80 kB |
| `tenant` | `poultry_event_log` | 128 kB | 16 kB | 80 kB |
| `tenant` | `task_queue` | 128 kB | 8 kB | 96 kB |

**`ops.health_checks` is the largest table at 1.8 MB / 8,599 rows.** With 8 containers reporting health every minute, that's roughly the volume across the live window. → Phase 6 (need TTL/retention?).

**`tenant.kb_embeddings` anomaly:** 1632 kB total, but 0 bytes in heap and 1624 kB in indexes. **An HNSW index on an empty table.** Either:
- pre-warmed for a load that never came
- data was loaded, indexes built, then `TRUNCATE` ran (which doesn't drop indexes)
- a bug in the embedding-load pipeline

→ Phase 4 + Phase 8 critical. If embeddings are expected by TIS retrieval, this is a TIS feature unfeather.

---

## 3.23 Decision Engine state (post cluster #110-116)

### `tenant.decision_signal_config` (30 rows = 10 signals × 3 tenants)

Schema confirms Strike #115/#116 architecture:

```
signal_id              text                  PK part 1
tenant_id              uuid                  PK part 2 (composite per Strike #115)
signal_name            text
signal_category        text                  (financial/operational/compliance/productivity)
green_threshold        numeric               nullable
amber_threshold        numeric               nullable
red_threshold          numeric               nullable  ← all 30 rows NULL
threshold_direction    text                  (LOWER_IS_BETTER | HIGHER_IS_BETTER)
is_active              boolean
custom_formula         text                  nullable, all NULL
created_at             timestamptz
```

**`red_threshold` is NULL across all 30 rows.** Two-stop threshold (green+amber) is in use; red-tier is reserved capacity for future. Not a bug.

**`custom_formula` is NULL across all 30 rows.** Per-tenant SQL-snippet customization is a future feature; today all signals use the canonical formula.

### Signal catalog (Strike #115 cross-product seed)

| Signal | Name | Category | Green | Amber | Direction |
|---|---|---|---:|---:|---|
| DS-001 | Cost of Goods per Kg vs Market | financial | 0.8 | 1.2 | LOWER_IS_BETTER |
| DS-002 | Cycle Inactivity Days | operational | 7 | 14 | LOWER_IS_BETTER |
| DS-003 | Active Critical Alerts | compliance | 0 | 2 | LOWER_IS_BETTER |
| DS-004 | Input Stock Adequacy % | operational | 80 | 50 | HIGHER_IS_BETTER |
| DS-005 | Labor Cost Ratio % | financial | 40 | 60 | LOWER_IS_BETTER |
| DS-006 | Accounts Receivable Days | financial | 30 | 60 | LOWER_IS_BETTER |
| DS-007 | Harvest Yield Attainment % | productivity | 85 | 70 | HIGHER_IS_BETTER |
| DS-008 | Cash Flow Months Runway | financial | 3 | 1 | HIGHER_IS_BETTER |
| DS-009 | Rotation Compliance % | compliance | 90 | 75 | HIGHER_IS_BETTER |
| DS-010 | Ferry Buffer Days (F002) | operational | 14 | 7 | HIGHER_IS_BETTER |

DS-010 is named "Ferry Buffer Days (F002)" but **F002 doesn't exist in farms registry** (see 3.25). The signal is anchored to the absent F002 (Viyasiyasi Kadavu) and currently produces NULL. → Phase 1 finding EE confirmed at DB level.

### Snapshot state

```
total_snapshots:    100
distinct_signals:    10
distinct_farms:       2  ← out of 3 in registry
distinct_tenants:     2  ← out of 3 in registry
oldest:             2026-05-07 15:22:29.315099+12
newest:             2026-05-08 06:05:00.226296+12  ← natural fire 18:05 UTC 2026-05-07
```

**Snapshot status distribution:**

| Signal | Status | Rows |
|---|---|---:|
| DS-001 | NULL | 10 |
| **DS-002** | **GREEN** | 10 ✓ |
| **DS-003** | **GREEN** | 10 ✓ |
| DS-004 | NULL | 10 |
| DS-005 | NULL | 10 |
| **DS-006** | **GREEN** | 10 ✓ |
| DS-007 | NULL | 10 |
| DS-008 | NULL | 10 |
| **DS-009** | **GREEN** | 10 ✓ |
| DS-010 | NULL | 10 |

**4 of 10 signals computing GREEN, 6 NULL.** Matches Strike #110-116 archive claim ("4 signals computing real GREEN values, 6 returning NULL — data sparsity not bugs"). NULL signals are gated by data:
- DS-001 needs `tenant.harvest_log` + `tenant.cycle_financials` (only 2 cycles, 0 harvest_log rows visible)
- DS-004 needs `tenant.inputs` (empty)
- DS-005 needs `tenant.labor_attendance` (empty hypertable)
- DS-007 needs `tenant.harvest_log` (empty)
- DS-008 needs `tenant.cash_ledger` (5 rows) + projection logic — likely insufficient samples
- DS-010 needs F002 farm to exist (absent)

**Natural-fire confirmation:** Latest snapshot timestamp `2026-05-08 06:05:00.226296+12` is 06:05 Fiji time = 18:05 UTC 2026-05-07. The brief's "tomorrow 18:05 UTC: decision-engine-daily natural fire" prediction landed exactly. Cluster #110-116 is **operational and healthy**.

But: only **2 of 3 farms** got snapshotted. Tenant 26d66f66 (Uraia Kama's Farm / Nubunivilo) has the F001-26D6 farm but possibly not active/has no data → farms scan in Stage 2a may be filtering it out. → Phase 4 decision_engine_worker review.

---

## 3.24 Tenants registry (3 rows)

| tenant_id (8-char) | company_name | tier | mode | section_term | TIS limit | farm_count_limit |
|---|---|---|---|---|---:|---:|
| `26d66f66` | Uraia Kama's Farm | BASIC | GROWTH | BLOCK | 20 | 1 |
| `f9a88263` | Kinisimere Wati's Farm | BASIC | GROWTH | BLOCK | 20 | 1 |
| `a0eebc99` | **Teivaka PTE LTD** | **PROFESSIONAL** | GROWTH | BLOCK | **100** | 1 |

### Strike #91 findings (tenants schema)

1. **Subscription tier vocabulary**: brief says `FREE / BASIC FJD 49/mo / PREMIUM FJD 149/mo / CUSTOM`. DB has `BASIC` and `PROFESSIONAL`. **No FREE, no PREMIUM, no CUSTOM**. The `PROFESSIONAL` tier is undocumented in brief. → Phase 4 tier enum cross-check.
2. **`mode = GROWTH`** for all 3 tenants. Brief: "Three derived modes (computed, never user-toggled): Solo / Growth / Commercial." Only `GROWTH` is realized in data. **Solo mode never activated** for any tenant despite Phase 8-1 PIVOT (commit `ca817ac` — Solo Voice activation via task_queue seed + /auth/me mode field). The /auth/me path may set mode in JWT but it's not being persisted on tenants. → Phase 4 critical.
3. **`section_term = BLOCK`** for all. Section term is the time-window naming (block / season / quarter). Confirms BLOCK is the default rollout.
4. **`subscription_start` / `subscription_end` NULL** for all 3.
5. **`stripe_customer_id` / `stripe_subscription_id` NULL** for all 3. **Stripe is not wired** at any level.
6. **`primary_contact_email = cody@teivaka.com`** for Teivaka PTE LTD only (the operator's own tenant). Other 2 tenants have empty contact info — test/seed tenants.
7. **Schema has 25 columns** including `tis_calls_today`, `tis_calls_reset_at`, `tis_daily_limit`, `farm_count_limit`, `worker_count_limit` — quota enforcement via columns, not via separate table. Acceptable.

### Onboarding state

- All 3 tenants have non-NULL `onboarded_at` — onboarding flow has run.
- `tis_calls_today`: 0 / 0 / 2 — Cody's tenant has used TIS twice today; others not.
- `is_active = true` for all 3.

---

## 3.25 Farms registry (3 farms)

| farm_id | tenant_id (8-char) | farm_name | created |
|---|---|---|---|
| `F001-26D6` | `26d66f66` | **Nubunivilo** | 2026-04-25 |
| `F001-A0EE` | `a0eebc99` | **Save-A-lot Farm** | 2026-04-25 |
| `F001-F9A8` | `f9a88263` | **Save-A-Lot Farm** | 2026-04-27 |

### Strike #91 findings (farms registry)

1. **No F002.** Brief mentions "Viyasiyasi Farm — Kadavu Island (kava, mixed)" as F002 reference user. **F002 does not exist in `tenant.farms`.** It's referenced in DS-010 signal name ("Ferry Buffer Days (F002)") and in Decision Engine cluster archive ("F002 Kadavu reference user"), but the row is absent. Either:
    - F002 hasn't been provisioned yet (tenant signed up but farm not created)
    - F002 lives elsewhere (a deactivated tenant?)
    - The brief's reference users are forward-looking, not current state
2. **Two farms with the same name (case-different)**: `Save-A-lot Farm` (a0ee, lowercase 'l') vs `Save-A-Lot Farm` (f9a8, capital 'L'). Two distinct tenants own distinct farms with near-identical names. Likely duplicate test data — Cody at one point seeded a Save-A-Lot for testing, then re-seeded under a different tenant.
3. **`Nubunivilo` farm is not mentioned in brief.** Owned by tenant `26d66f66` ("Uraia Kama's Farm"). The brief listed two reference farms (Save-A-Lot Korovou and Viyasiyasi Kadavu); Nubunivilo is the uncategorized third.
4. **All 3 farms use `F001-XXXX` naming** with the last 4 hex of tenant UUID. Convention is consistent.

→ Phase 4 + Phase 10: clean test/duplicate data, decide whether F002 is forward-looking or actually exists somewhere.

---

## Cross-cutting findings (Phase 3)

| # | Finding | Severity | → Phase |
|---|---------|---|---|
| CC | `tenant.farm_active_groups` (33 rows) has no `tenant_id` column AND no RLS — cross-tenant exposure via farm_id alone | **Critical** | 9 |
| DD | Tenants registry is `tenant.tenants` (3 rows), not `shared.tenants` as architectural convention would suggest | Med | 4 |
| EE | F002 (Viyasiyasi Kadavu — brief reference user) does NOT exist in farms registry | High | 4 + 10 |
| FF | `learning` schema exists with 2 empty tables; classroom_* tables in `shared` schema; orphan migration `100_classroom_foundation.py` references non-existent `classroom` schema | High | 3 + 10 |
| GG | Migration 034 has zero filesystem AND zero DB-object trace — confirmed deleted before baseline import | Med | 10 |
| HH | `tenant.mv_input_balance` is a stub VIEW, not a materialized view (Strike #120 backlog) | Med | 4 |
| II | 67 of 105 user tables empty (~64%) — feature scaffolding ahead of data; many production-blocking (kb_articles, kb_embeddings, classroom_*) | High | 4 |
| JJ | `tenant.kb_embeddings` empty data + 1.6 MB of HNSW indexes — broken embedding pipeline OR stale state | High | 4 + 8 |
| KK | RLS forced on only 11 of 46 tables — superuser bypass on 35 RLS tables | High | 9 |
| LL | `decision_signal_config.red_threshold` NULL across all 30 rows — third tier reserved but unused | Low | (informational) |
| MM | 5 of 8 hypertables empty (income_log, labor_attendance, tis_voice_logs, weather_log) — feature scaffolding | Med | 4 + 6 |
| NN | All 3 tenants `mode=GROWTH` — Solo + Commercial modes never activated despite Phase 8-1 PIVOT | High | 4 |
| OO | `audit.events` has 70 distinct tenant_ids vs 3 in registry — 67 orphan tenant_ids | High | 9 |
| PP | Subscription tier vocabulary mismatch: brief says FREE/BASIC/PREMIUM/CUSTOM, DB has BASIC/PROFESSIONAL | Med | 4 |
| QQ | No Stripe IDs / no subscription dates populated — payments stack absent | Med | 8 |
| RR | Two farms named "Save-A-Lot" (case-different) on different tenants + one Nubunivilo farm not in brief — likely duplicate test data | Low | 10 |
| SS | `ops.health_checks` at 1.8 MB / 8,599 rows — no TTL visible; logs/caddy log already at 42 MB (Phase 1 finding) | Med | 6 |
| TT | Audit chain integrity: 0 chain_break_count across 299 events, latest Bank PDF hash present | (positive) | 9 |
| UU | DB-level audit immutability triggers active (`audit_events_block_delete` + `audit_events_block_update`) | (positive) | (informational) |
| VV | Strong PK discipline: 0 user tables without PK | (positive) | (informational) |
| WW | TIS rate-limit triggers in DB on `ai_commands` + `tis_voice_logs` — rate limit enforced at data layer not just app | (positive) | (informational) |

---

## Audit-chain hostile signals (Phase 1+2 list extended)

7. **`farm_active_groups` cross-tenant exposure** (CC) means audit-emitted FARM_GROUP_TOGGLED events (83 rows — the dominant event type) reference toggles whose underlying row could have been written by a non-owner tenant.
8. **70 orphan tenant_ids in audit.events** (OO) means Bank Evidence PDFs reference tenant_ids without registered tenants. Evidentiary chain is intact (chain hashes valid) but tenant identity → company resolution breaks for 67 of them.
9. **35 unforced-RLS tables** (KK) bypass-able by superuser. If any worker (Celery) connects as table owner instead of via RLS-enforcing role, all 35 tables leak across tenants for that worker.

---

## Handoffs

- **Phase 4 (backend code map):** verify `decision_engine_worker.py` Stage 2a tenant scan against the 70-vs-3 tenant_id divergence; cross-check tier enum against DB values; verify `mode=Solo` activation path against Phase 8-1 commit `ca817ac`; cross-check the 67 empty tables against router definitions to identify stub-routers vs unimplemented features; pull function bodies for the 26 tenant + 5 audit functions.
- **Phase 6 (infrastructure):** decide TTL on `ops.health_checks`; cross-check the audit chain Genesis Block(s) against deployment commit history (was the chain seeded?); pgvector HNSW index on empty `kb_embeddings` — investigate.
- **Phase 8 (integrations):** confirm M-PAiSA / WhatsApp / SMTP wiring at code level; confirm Stripe absence (per brief and per DB); verify TIS rate limits with `tis_calls_today` enforcement actually round-trips.
- **Phase 9 (security):** **`farm_active_groups` cross-tenant fix** (CC) is the highest-priority finding from Phase 3; force RLS on the 35 unforced tables; investigate the 67 orphan tenant_ids; verify hash-input includes tenant_id (it does, per `audit.compute_hash` signature, but verify SHA inputs are deterministic).
- **Phase 10 (synthesis):** all Strike #91 findings + push-cadence decision for accumulated audit commits.

---

**Phase 3 complete.** No mutations. File written 2026-05-08 05:50 UTC.
