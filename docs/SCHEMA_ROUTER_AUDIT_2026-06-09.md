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

**RESOLVED (2026-06-09) — rewrote over base tables, no MV / no refresh job:**
- **decision-engine** `/{farm_id}`, `/summary`, `/refresh`: the endpoint read a
  *phantom* `mv_decision_signals_current` shape (zone_id/severity/signal_message)
  that never existed AND typed `farm_id: UUID` — so it **422'd on every real
  farm id** (`F001-A0EE`), which is why Decision Center signals never showed
  (silent degrade to tasks-only). Now reads live from `decision_signal_snapshots`
  (latest per signal) + `decision_signal_config`, status→severity
  (RED=CRITICAL/AMBER=HIGH), AMBER/RED only; `farm_id: str`; `/refresh` is a
  no-op success.
- **inputs** `/`: dropped the `mv_input_balance` LEFT JOIN (an unbuilt MV that
  500'd the whole list); `stock_status`/`expiring_soon` computed inline over
  `tenant.inputs`. Unblocks Analytics inputs panel + Decision Center inventory
  + Inventory page.
- `mv_farm_pnl` already guarded (real-table summary; monthly degrades to []).

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

## Fix-batch progress (2026-06-09)

**Key finding while fixing:** the Crops-path UI (Reports, Analytics, Enterprises,
Decision Center, cycle detail) is driven by `/financials/crops`,
`/financials/farm`, `/cycles`, `/decision-engine`, `/field-events`, `/harvests`,
`/tasks`, `/crops/compliance`, `/inputs`, `/workers`, `/labor`. The `/reports/*`,
`/financials/cokg`, and `/exports/*` endpoints are **not wired to any frontend
page yet** — they are dormant API landmines, not live demo breakage. The two
that the demo UI actually depends on (`/financials/crops`, `/financials/farm`)
were already fixed in earlier turns.

**Fixed (correct + hardened, even though dormant):**
- `financials.py /cokg` — production_cycles/harvest_log, CTE pre-agg, real cols.
- `reports.py /cogk` — same; `reports.py /harvest` — harvest_log + gross_yield_kg/waste_kg.
- `exports.py /cycles.csv` — production_cycles/harvest_log, planned_area_sqm, CTE pre-agg.

**Deferred — `farms.py /dashboard`:** references an entire phantom schema
(`tenant.harvests`, `cycle_cost_summary`, `production_unit_id`, `planted_date`,
`quantity_kg`, `is_compliant`, `sold_to_customer_id`). **No frontend caller** —
legacy/unused. Do NOT speculatively rewrite; guard to honest-empty or delete in
a dedicated cleanup, or rewrite only if a farm-dashboard endpoint is wired.

**Still open (off Crops path, unchanged):** delivery, livestock, apiculture,
profit_share, price_master, rotation, subscriptions, community/admin (Section B),
plus the MVs (Section C: mv_decision_signals_current, mv_input_balance).
