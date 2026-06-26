# TFOS Farm Pillar — Pre-Alpha Forensic Audit Ledger

Sequential redesign/audit of the Farm pillar before the 50-farmer alpha cohort.
One destination at a time; a page is not PASS until it works end-to-end, builds
clean, has no blank-screen path, scales (breakpoint named), and is honest (real
data or honest-empty). Resumable: each entry records status + findings + decisions.

Order: Overview → Tasks → Enterprise → Production → Field Events → Inventory →
Labour → Buyers → Cash → Assets & Equipment → Locations → Compliance → Analytics →
Reports → Weather → Library → Gallery → Partnerships → Settings.

Legend: ✅ PASS · 🟡 improved, open items · ▢ not started

---

## 1. Overview (/farm) — 🟡 improved (this pass)

**Brutal assessment.** Recently rebuilt to prototype format (real KPIs, Attention,
Advisor, Portfolio, Financial, Recent Activity) — solid and honest, but had two
real defects surfaced on the live screen and one scale risk.

**Strengths.** Real RLS data on every tile; flat icons + theme; Array-guarded (no
blank screen); honest gaps (AI recs "Building", 90-day projection omitted);
strike-mandated pieces preserved (LayerBackfillBanner, audit-chain footer); clear
"what/why" via Attention + Advisor.

**Weaknesses (found).**
- Cash Balance rendered blank — extraction read `data.balance`, but the endpoint
  returns `data.cash_balance_fjd` (cash.py:~352). FIXED → reads cash_balance_fjd,
  numeric, shows FJD 0 not blank.
- Best == Watch when only one enterprise has P&L signal (FarmDashboard derivations).
  FIXED → Watch only shows with ≥2 distinct enterprises; else "All healthy".

**Information architecture / layout.** Header → Health hero + 5 KPIs → Attention +
Advisor → Enterprise Portfolio (tabs) → Financial + Recent Activity → Active Cycles
→ audit-chain footer. Good hierarchy; matches "what next / why".

**UX + mobile.** Tiles tap to the right surface; one-handed grid; flat icons; plain
language. OK.

**AI opportunities (grounded only).** Real Best/Riskiest shown; recommendations +
90-day projection require a decision-engine projection + grounded advisor — flagged
future, not faked.

**Integration.** Links to cash / enterprises / tasks / compliance / reports / tis;
reuses financials, flocks, cycles, tasks, cash-ledger, compliance, chain-status.

**SCALE BREAKPOINT (named).** The page fires ~12 parallel queries per open (farm,
fin, crops, flocks, cycles, tasks, cash, farms, labor, compliance, chain, me).
Fine for alpha; at ~10k+ concurrent dashboard opens this is 12× the round-trips and
will pressure the API/DB pool. RECOMMEND (staged, next backend slice): a single
composite `GET /farm/overview/{farm_id}` that returns the dashboard payload in one
call. Not built this pass (additive backend work; no fabrication).

**Security.** All queries auth + farm-scoped; RLS enforced server-side. OK.

**Owner-completeness pass (what an owner of 1 farm or many, 0 or 100s of workers
wants):** added — all real, no fabrication:
- OPS row tiles: Harvested (total kg this season), Workforce (workers · hours · wages
  this week), Cost/kg (labour+inputs ÷ kg), Farms (count). From financials/crops
  (total_harvest_kg, cokg_fjd_per_kg), labor, /farms.
- ENTERPRISE COMPARISON tile: every enterprise ranked by net, with income / net / kg
  / cost-per-kg + a relative bar. From financials/crops.
- MULTI-FARM COMPARISON tile (shows only when >1 farm): per farm active cycles /
  workers / crop types / open alerts — straight from the single /farms aggregate
  (no extra calls). NOTE: per-farm NET comparison needs per-farm financials → filed
  as a /farms/portfolio aggregate (operational comparison shipped now).
Still-missing for a future pass (flagged, not faked): per-farm net/health in the
multi-farm table; income/ROI trend-over-time mini-chart (MV monthly rows exist);
inventory stock value; receivables/payables split.

**Status:** 🟡 — defects fixed + owner comparison/analytics tiles shipped; per-farm
financial aggregate + trend chart filed for a backend slice.

---

## IA RESTRUCTURE (pillar-wide) — 🟡 nav grouped (this pass)

**Finding:** the pillar had ~22 flat destinations, in no workflow order, and the
farm nav (FarmSectionsNav) had been dropped from the rebuilt Overview — so there was
NO organized in-pillar navigation. FarmerLayout tabs are app-level, not farm
destinations.

**Done:** FarmSectionsNav rewritten into 6 natural-farming-order groups —
PLAN (Overview·Tasks·Weather) · GROW (Enterprises·Production·Inventory·Labour·
Equipment·Locations) · SELL (Buyers·Services·Cash·Payments) · PROVE (Compliance·
History·Reports·Gallery) · IMPROVE (Analytics·Decisions) · ACCOUNT (Library·
Partnerships·Settings). Same 22 real routes (no dead links). Re-surfaced on Overview.

**Page-merge plan (executed per-destination during each audit, with route redirects
so nothing breaks):**
- Cash + Payments → Money (tabs)        · Buyers + Services + Marketplace → Market
- Analytics + Decisions + Insights → Insights  · History + Reports + Gallery → Records
- Inventory + Labour + Equipment + Locations → Resources (group)
- Library → Settings/Help · Partnerships → Business/Settings
Target: 22 → ~12 destinations once merges land.

**Missing (Plan side) — filed:** Calendar/Plan view, Budget-vs-actual,
Notifications inbox, surfaced Verify/traceability entry.

**Status:** 🟡 — nav grouped + workflow-ordered + re-surfaced.

### Page merges EXECUTED (tabbed destinations + redirects) — ✅
New `FarmTabs` shell lazy-loads existing pages as sub-tabs (no rewrite, no lost
function); ?tab syncs so redirects land on the right tab. 22 → ~12 destinations:
- **/farm/money** = Cash · Payments
- **/farm/market** = Buyers & sales · Services
- **/farm/records** = History · Reports · Gallery
- **/farm/insights** = Analytics · Decisions
- **/farm/resources** = Inventory · Labour · Equipment · Locations
Old routes (cash/payments/buyers/services/history/reports/gallery/analytics/
decisions/inventory/labor/equipment/locations) now `<Navigate>`-redirect to their
merged home+tab — every deep link + internal navigate() still works. Nav GROUPS
updated to the merged set. Foundation ready for a persistent grouped sidebar.
KNOWN COSMETIC FOLLOW-UP: each child page still renders its own header/FarmSelector,
so a merged page shows the tab strip + the child's title (mild redundancy). Clean
by adding an `embedded` (hide-header) prop to child pages in a later pass.

---
(remaining destinations pending — appended as each is audited)

---

## 2. Tasks (/farm/tasks) — 🟡 redesigned (Master Framework pass)

**Brutal truth.** Strong manager tool (kanban + KPIs + crop-plan + quick-add + real
complete/skip with audit), but it FAILED the tired-farmer / 5-second / low-literacy
test: it opened to a 5-column board + 5 KPIs to parse, never answering "what do I do
right now?" Great for a farm manager, overwhelming for a smallholder.

**Fix shipped.** A "Do this next" hero at the very top — the single highest-priority
task (due-now first, then rank), with the WHY (body_md / priority / due) and one-tap
"Mark done" (or its log-target route) + Skip. Board/KPIs remain below for managers
(progressive disclosure: one action first, depth after). All-caught-up state too.

**Strengths.** Real task_queue + audit on complete/skip; crop-plan next steps; quick
-add chips → /tasks/manual; due-bucket + priority logic; Array-guarded.

**Weaknesses / missing (filed).** No voice/photo task logging (low literacy); no
worker-assignment or bulk-complete (commercial); no snooze; AI auto-prioritise +
weather/compliance-driven suggestions exist server-side (generator) but no on-page
"AI suggest"; recurring tasks not surfaced.

**AI opportunities.** Auto-rank next action; "you usually do X on Tuesdays"; surface
weather spray-window + compliance auto-tasks inline. (Grounded — needs the generator
wired to a suggest endpoint; not faked.)

**Mobile.** Hero is one-handed + thumb-friendly; board stacks to single column.

**Integration.** Tasks ↔ cycles (crop plan), compliance (auto-tasks), weather (spray
window), labour (assign — future). Done emits audit → Records.

**Scale breakpoint.** 2 list queries (OPEN+COMPLETED, limit 200) — fine; at 10k+
tasks/farm add server-side pagination + filter (filed).

**Status:** 🟡 — "Do this next" redesign shipped; worker-assign / voice-log / AI-suggest
filed for backend slices.
