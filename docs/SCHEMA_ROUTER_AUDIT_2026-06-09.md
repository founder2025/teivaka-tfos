# Schema-vs-Router Audit — 2026-06-09

**Why:** five+ production bugs in this sprint were the same class — a router
querying a `tenant.*/shared.*/audit.*` object that doesn't exist (wrong name,
or a feature table never migrated). This audit enumerates the rest before a
demo (or a lender) trips over them.

**Method:** static diff of every schema-qualified object referenced in
`app/routers/*` + `app/services/*` against the schema-of-record (schema SQL +
all Alembic migrations). Authoritative re-run against the live DB:
`bash scripts/schema_router_audit.sh` (on the prod host).

Already fixed this sprint: `chemicals.chemical_id` (exposed), `tenant.workers`
(create/list rewritten), `tenant.nursery_batches` (migration 087),
`/financials/crops` (`tenant.cycles/harvests` → real tables), `/financials/farm`
(`mv_farm_pnl` guarded in SAVEPOINT).

## A. Wrong-name bugs — table exists under a different name (will 500 when hit)

| Router ref | Real table | Routers | Notes |
|---|---|---|---|
| `tenant.cycles` | `tenant.production_cycles` | exports, financials(`/cokg`), profit_share, reports | also check `cycle_status` values + columns |
| `tenant.harvests` | `tenant.harvest_log` | exports, farms, financials(`/cokg`), reports | **column drift too**: `total_weight_kg` → `gross_yield_kg` |
| `tenant.deliveries` | `tenant.delivery_log` | delivery | |
| `tenant.livestock` | `tenant.livestock_register` | livestock | locked vertical |
| `shared.price_master` | `tenant.price_master` | price_master | wrong **schema** (tenant, not shared) |
| `tenant.profit_share_records` | `tenant.profit_share` | profit_share | hidden unless rate set (Inviolable #9) |
| `shared.rotation_rules` | `shared.rotation_registry` / `_top_choices` | rotation | confirm intended source |
| `tenant.cycle_cost_summary` | likely `tenant.cycle_financials` | farms | confirm |

## B. Genuinely-missing tables (feature not built — endpoint 500s if hit)

`tenant.apiculture_hives`, `tenant.apiculture_inspections` (apiculture — locked
vertical), `tenant.community_posts` (admin), `tenant.upgrade_requests`
(subscriptions), `shared.platform_settings` (admin), `shared.tis_public_corpus`.

→ Either build the table (migration) when the feature is in scope, or have the
endpoint return honest-empty / 501 instead of 500. Not in the Crops critical path.

## C. Materialized views (migration 004 MVs were stubbed — may not exist)

`tenant.mv_farm_pnl` (financials/farm — **fixed**, guarded), `tenant.mv_decision_signals_current`
(decision-engine — degrades to tasks-only, honest), `tenant.mv_input_balance` (inputs).
→ Decide: build the MVs (refreshable) or rewrite endpoints over base tables.

## Recommended fix order (Crops/whole-farm demo path first)

1. `reports.py` (`/cogk`, `/harvest`) + `financials.py /cokg` — wrong-name + column drift; feed Analytics/Reports.
2. `farms.py` — `tenant.harvests` + `cycle_cost_summary` (farm detail/stats).
3. `exports.py` — `tenant.cycles/harvests` ("Export data" avatar item).
4. `delivery.py` — `tenant.deliveries` → `delivery_log`.
5. Decision: MVs (B/C) — build vs rewrite-over-base-tables.
6. Locked-vertical / non-path routers (livestock, apiculture, profit_share,
   price_master, rotation, subscriptions, community) — fix when those surfaces
   come into scope, or guard to honest-empty.

Each fix is per-endpoint (rename **and** reconcile columns, like `/crops` and
`workers`) — never a blind rename.
