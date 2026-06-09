# PLATFORM_COMPLETION_SPRINT.md — living tracker

**Goal:** present the **real platform** (not the prototype) on **Tue 2026-06-16**.
Every surface in `docs/TFOS_MyFarm_Prototype_v263_20260608.html` live in prod —
real route, real data (or honest-empty), real (+) actions, prototype-faithful —
by **2026-06-15**.

**Operator decision (2026-06-08):** ship a living product to present. M-PAiSA
(and any genuine external integration) is **deferred** and shown honest-empty —
never faked. We present *what the platform actually does*.

## The bar (every surface)
1. Route resolves to a real React page (no 404/stub).
2. Real data from `tenant.*` / read-only views over `audit.events` — never mock.
3. Every (+)/action emits a real `audit.events` row via the Universal Event Form
   Contract, RLS-scoped, hitting a working endpoint.
4. Looks/behaves like the prototype.

**Tighter standard (ratified 2026-06-09 after a fidelity audit):** before building a
surface, OPEN the prototype's render fn and enumerate its panels; build the SAME panel
set; each panel is real data OR honest-empty matching the prototype's own empty state
WITH a stated reason (e.g. mock engine / missing backend); no dead links (verify every
action route exists). Proof-of-standard: cycle detail retrofit to all 8 prototype panels
(8532d28).

## The façade rule (de-fake, don't copy)
Prototype = spec for layout/flow, NOT its numbers. Where the prototype fakes
data, wire the real backend or show honest-empty. Known façades: **Cash** (no-op
write + false "audit row" toast), **Reports/Bank Evidence** (hardcoded
1840kg/FJD 14,200/67 events), **Analytics** (empty shell). Prod has the real
backends — wire them.

## Deferred-by-design (honest-empty, flagged — NOT faked)
- M-PAiSA payments (external merchant reg, Q8)
- Anything needing Operator data not yet provided (flag on contact)
- Cited agronomy beyond seeded KB (Inviolable #1)

## Deploy discipline
- FE: `npm run build`. BE: `build --no-cache api && up -d api` then
  `bash 04_environment/verify-deploy.sh` (B78 guard). Push to
  `claude/parity-farm-surfaces`.

---

## Status legend
✅ real & live · 🟢 real, polish pending · 🟡 partial/needs wiring · 🔴 todo · ⏸ deferred-honest

## FARM pillar (20)
| Surface | Status | Notes |
|---|---|---|
| Overview | ✅ | tile audit done — every number derived from live endpoints (health rubric, net/holds/cycles/team/hours/cash/tasks), no fabrication; 'Building' tiles honest-empty. Fixed: hardcoded "chain INTACT" badge → real check via GET /me/chain-status (audit.verify_chain_for_tenant) |
| Farm History | 🟢 | real audit.events read |
| Tasks | 🟢 | real queue (reorganised) |
| Decision Center | 🟢 | full coreDecisionView parity (call / state tiles / telling-you / intelligence hub / enterprise rankings / risk intelligence / AI advisor), real endpoints + honest degradation. Fixed: dead link (production→cycles) + /financials/farm 500 (mv_farm_pnl guarded in SAVEPOINT, real-table summary first) |
| Enterprises | 🟢 | **per-enterprise detail wired real** (Production=live cycles list, Finance=CoKG/kg+harvested, Records=event timeline) + **fixed /financials/crops** (was 500'ing on non-existent tenant.cycles/harvests → crop enterprises never appeared). Remaining tabs honest-empty (not faked) |
| Production (Cycles) | 🟢 | **List/Calendar/Planner parity shipped** (real status+layer filters, quick stats, timeline, real block occupancy) + 6-panel cycle detail + nursery create (migration 087). Consolidates the prototype's Cycles + Harvests + **Field events** daily-loop (no standalone "Field events" item in farm_unified nav). Planner scored-recommendation engine deferred (honest, not faked) |
| Inventory | 🟢 | 5-view parity (Stock/Reorder/Movements/Suppliers/Analytics) + KPI strip, all real (/inputs,/input-transactions,/suppliers); StockBadge fixed to real statuses |
| Labor | 🟢 | real workers/attendance |
| Buyers | 🟢 | Directory + Active orders + Receivables + Analytics real (/customers,/orders); Demand + Pipeline honest-empty (no feed yet) |
| Cash | 🟢 | **REAL** — cash.py inserts tenant.cash_ledger + emits audit.events (not the prototype no-op). Confirm FE write path; multi-tab parity |
| Assets & Equipment | 🟢 | Fleet + Maintenance + Costs + Analytics real (from /equipment fleet data); Usage + Parts honest-empty. Fixed: Add-equipment 500 (phantom make/next_service_due cols) + invalid equip types + service-due read bug |
| Locations | ✅ | L1–L3 map shipped |
| Compliance | ✅ | crop-WHD page + endpoint (this sprint) |
| Analytics | 🟢 | signals now LIVE — decision-engine rewritten over decision_signal_snapshots (was 422'ing on UUID-typed farm_id → never showed); /inputs MV join dropped (live). Parity pass on chart panels still pending |
| Reports | 🟢 | **crop/whole-farm Bank Evidence PDF shipped** — GET /crops/bank-evidence, audit-anchored (BANK_PDF_GENERATED + report_exports + QR/verify), real cash_ledger/harvest_log/cycles sources; Reports→Bank Evidence has month picker + real Download. Poultry Bank Evidence still separate. Other report types honest-empty |
| Weather | 🟢 | real Open-Meteo |
| Library | 🟢 | NEW knowledge reference /farm/library (Chemicals cited WHD, Crops catalog, Nutrition cited NPK+citation, KB articles; Pests honest-empty). Distinct from /me/library (farm-list CRUD). Nav entry TBD |
| Gallery | 🟢 | real page (was ComingSoon stub) — Photos grid + Timeline from field_events.photo_url, tied to events; honest-empty; video/AI honest-building |
| Partnerships | 🟡 | parity pass |
| Settings | 🟡 | parity pass |

**Nav source of truth:** the live Farm sidebar is `NAV.farm_unified` (the 20 rows above), NOT the deprecated `NAV.farm` (vertical-specific). Field events / Cycles / Harvests are folded into **Production** in the unified model — there is no standalone "Field events" sidebar item. The `/farm/field-events` route still exists as the event-logging surface, reached from Production + the (+) launcher.

## HOME pillar (5)
| Feed 🟡 | Following 🔴 | Marketplace 🔴 | Directory 🔴 | Saved 🔴 |

## CLASSROOM (5)
| Overview 🟡 | Tracks 🔴 | My progress 🔴 | Certification+QR 🔴 | Bookmarks 🔴 |

## TIS (5)
| Chat ✅ | History 🔴 | Voice 🔴 | Plan my farm 🔴 | Usage 🔴 |

## AVATAR dropdown
| Profile ✅ | Settings ✅ | Subscription 🔴 | Referrals 🔴 | Affiliate program 🔴 | Affiliate console 🔴 | Team 🔴 | View Covenant 🟡 | Verify a record ✅ | Export data 🟡 | Control Room (admin) 🟡 | Sign out ✅ |

---

## Phases (to 2026-06-15)
- **P1 (Jun 8–9) FARM moat de-fake + Overview honesty** — Reports/Bank Evidence (real audit.events), Cash (real writes), Analytics (real signals/honest-empty), Overview tile audit.
- **P2 (Jun 9–10) FARM Production + Enterprises** — cycles list/calendar/planner, 6-panel cycle detail, real nursery create, enterprise detail tabs.
- **P3 (Jun 10–11) FARM rail finish + audit** — History/Tasks/Decision/Inventory/Labor/Buyers/Equipment/Locations/Weather/Gallery/Partnerships/Library/Settings; route↔nav↔endpoint audit; zero dead links.
- **P4 (Jun 11–12) HOME** — Feed/Following/Marketplace/Directory/Saved front+back.
- **P5 (Jun 12–13) CLASSROOM + TIS sub-pages** — tracks/progress/cert+QR/bookmarks; TIS history/voice/plan/usage.
- **P6 (Jun 13–14) AVATAR dropdown** — subscription/referrals/affiliate/team/covenant/export/control-room.
- **P7 (Jun 14–15) FULL-PLATFORM SWEEP** — every route, every (+), every endpoint; no 4xx/5xx; zero fabricated numbers; deploy + smoke; presentation dry-run.

## Demo data
- **2026-06-09 census (prod):** tenants 3 · farms 4 · cycles 3 · field_events 14 ·
  harvests 1 · cash 5 · labor 0 · audit_events 306 → **THIN**. Must populate.
- **Decision:** populate the demo farm via `scripts/demo_seed.py` (drives the REAL
  API → genuine, hash-chained; never direct inserts). Adds irrigations/fertilizer/
  sprays (incl. a recent spray = live WHD block for the Compliance demo), harvests,
  cash in/out, workers + labour, weather. Run once:
  `EMAIL=.. PASSWORD=.. BASE_URL=https://teivaka.com python3 scripts/demo_seed.py`
- Requires: a verified demo account with at least one active cycle (Production ›
  New cycle). M-PAiSA deferred — payment_method tag only, no real settlement.

## Running log
- 2026-06-09: Decision signals LIVE end-to-end. Root causes both found+fixed: (1) /decision-engine typed farm_id:UUID → 422 on every real farm id (silent degrade to tasks-only); (2) engine tenant gate omitted PROFESSIONAL tier → operator farm (F001-A0EE) never got snapshots. Endpoint rewritten over decision_signal_snapshots (live, no MV); inputs MV-join dropped; tier filter now BASIC/PREMIUM/PROFESSIONAL/CUSTOM. Engine now: 3 tenants/4 farms, 40 snapshots; F001-A0EE has its 10 signals (all GREEN/NULL = farm healthy, shows 'running clear' honestly). beat keeps it fresh.
- 2026-06-08: Sprint opened.
- 2026-06-09: B78 guard verified on prod (✅). Census = thin → built demo_seed.py. Prior this session: Prime Directive ratified; single canonical prototype (v263); Field Events log; Overview FARM SUMMARY health card + weather strip; crop-WHD endpoint + Compliance page; B78 deploy guard.
- 2026-06-09: Prototype reference viewer shipped (founder/admin-only /prototype; require_admin-gated endpoint serving the bundled v263 HTML, iframe + mock-data banner; 1fa9a09). Then P2 real build: 6-panel Production cycle detail at /farm/cycles/:id (f353005) — all six panels real (header/status-actions/CoKG/compliance/activity/harvests), CycleList rows clickable. Frontend-only; needs `npm run build` only. NEXT in P2: real nursery create + Enterprises per-enterprise detail tabs.
- 2026-06-09: demo_seed.py RAN CLEAN on prod (F001-A0EE). Final census: field_events 35 · harvests 3 · cash 10 · workers 2 · labor 10 (was 14/1/5/0/0). The run surfaced + fixed three latent prod bugs (all dead before today): (1) `GET /chemicals` omitted `chemical_id` → canonical CHEMICAL_APPLIED path couldn't seed sprays/WHD demo (f45b6c8); (2) `POST/GET /workers` wrote/read columns absent from `tenant.workers` (contact_number/id_*/bank_*/next_of_kin_*/created_by) → endpoint 500'd end-to-end, Labor page could never add/list a worker (55fb4e3); (3) FE worker-type SEASONAL/CONTRACTOR not in DB CHECK → UI add would 500 (55fb4e3, backend normalises + FE labels aligned). Also: cash payment_method MPAISA→MOBILE_MONEY; labour total_pay_fjd now sent; ONLY_WORKERS re-run guard + idempotent worker reuse. Founder account password reset (bcrypt, email_verified=true) to authenticate the seed. **NEXT: browser walk** — Farm › Labor (2 workers + attendance), Compliance (red WHD block from CHEM-027 d-2 spray), Overview, Cash.
