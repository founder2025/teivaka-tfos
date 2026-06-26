# TFOS Farm Pillar — Pre-Alpha Forensic Audit Ledger

Sequential redesign/audit of the Farm pillar before the 50-farmer alpha cohort.
One destination at a time; a page is not PASS until it works end-to-end, builds
clean, has no blank-screen path, scales (breakpoint named), and is honest (real
data or honest-empty). Resumable: each entry records status + findings + decisions.

Order: Overview → Tasks → Enterprise → Production → Field Events → Inventory →
Labour → Buyers → Cash → Assets & Equipment → Locations → Compliance → Analytics →
Reports → Weather → Library → Gallery → Partnerships → Settings.

Legend: 🔒 LOCKED (approved; no redesign without new evidence) · ✅ PASS · 🟡 improved, open items · ▢ not started

---

## 🔒 LOCKED PAGES
- **Overview (/farm)** — LOCKED 2026-06-26 (Operator-approved). Audited → redesigned →
  optimized ×2 → stress-tested ×3 → all page-local findings (F1–F9, M1–M28, S1–S8,
  D1–D14, R1–R6) resolved; remainder are filed backend/cross-page slices. Do NOT
  redesign again unless new evidence requires it. Deploy: frontend-only (Tier 1).
- **Tasks (/farm/tasks)** — LOCKED 2026-06-26 (Operator-approved). Audited → redesigned →
  optimized → stress-tested ×2 → all page-local findings (T1–T8, N1–N8 [N1 retracted as a
  false alarm], TS1–TS9, U1–U5) resolved; remainder filed (T4 farm_id on /tasks, worker
  assignment, voice/i18n, compliance tag, photo upload, QueryClient lift). TS4 decided:
  single prioritized list (no kanban/toggle). Do NOT redesign again unless new evidence
  requires it. Deploy: frontend-only.
- **Weather (/farm/weather)** — LOCKED 2026-06-26 (Operator-approved). Audited → redesigned →
  optimized → stress-tested ×2 → all page-local findings (W1–W9, WX1–WX10, WXS1–WXS6,
  WS2-1–WS2-6) resolved; remainder filed (feed↔observations reconcile, push alerts, GDD/ET +
  crop-specific disease, per-block microclimate, insurance export, regional aggregate,
  thresholds→config, composite endpoint, voice/i18n). Verify-item: `tenant.weather_forecast`
  migration in prod. Do NOT redesign again unless new evidence requires it. Deploy: frontend-only.
- **Enterprise (/farm/enterprises)** — LOCKED 2026-06-26 (Operator-approved). Audited → redesigned →
  optimized → stress-tested ×1 → all page-local findings (E1–E10, EX1–EX10, ES1–ES7) resolved;
  remainder filed (real enterprise entity for Pause/Close/Worth/roles, animal financials,
  per-enterprise task count, per-block P&L grain, layer for animals/verticals, composite endpoint,
  grounded standing, certifications, ES3 200-cycle layer cap). 3-Layer doctrine surfaced. Do NOT
  redesign again unless new evidence requires it. Deploy: frontend-only.

---

## 1. Overview (/farm) — REDESIGNED (2026-06-26) — ✅ shipped to branch, awaiting deploy

Audit approved → full redesign of `FarmDashboard.jsx` executed per
`docs/TFOS_Overview_Redesign_Wireframe.md`. Build clean (`npm run build` ✓,
i18n guard ✓). Frontend-only; no backend changed (safe slice).

**New structure (cognitive-load first):** Header (real updated-time) → Needs-you-now
band (the ONE decision) → 4 glance tiles (Cash · Net · Tasks today · Watch) →
Farm health + Decide pair → Enterprise portfolio → Money snapshot + Recent field
activity → owner depth (Ops row, Enterprise/Multi-farm compare, conditional) →
Active cycles (ACTIVE+HARVESTING) → real audit-chain footer. + Skeleton loading +
first-run "create your first farm" state.

**Fixed (verified in new code):** F1 dead code removed (881→~470 lines, 13 dead
components + dead imports gone) · F2 health copy reflects grade · F4 "watch" only
when an enterprise sold at a loss (income>0 && net<0) · F5 in-page nav dropped
(sidebar owns it) · M1 real `dataUpdatedAt` not render time · M2/M3/M28 first-run +
skeleton states · M4 single net source (financials/farm summary) · M5 poultry cards
→ /farm/poultry · M6 health uses flock survival + holds (no more always-100) ·
M9 aria-labels on score rings · M18 dedupe — `["farms"]` shared with FarmSelector +
active cycles inlined from page data (no second /cycles or /farms fetch) ·
M21 no UUID author in activity feed · M22 no-op `||"Crop"||"—"` fallback gone ·
M23 HARVESTING cycles shown · upcoming WHD clearances now drive Needs-you-now +
decisions. Internal links point at merged routes (F9).

**Filed (labelled honestly in-page, NOT faked):** composite `GET /farm/overview/{id}`
reading pre-computed signals (Inviolable #3 / M27, keystone next slice); `farm_id`
on `/tasks` (M25 — page labels tasks "across all farms"); whole-farm activity feed
(M20 — page labels the strip "Recent field activity · crop field events"); lift
CurrentFarmProvider to FarmerShell (M24/B31); bound list queries server-side (M26).

**Note:** bundle barely shrank (53→51 KB) — Rollup already tree-shook the unused
components; the real win is correctness + maintainability, not size (honest).

**DEPLOY:** frontend-only → `cd /opt/teivaka/frontend && npm run build` (Caddy serves
dist). No migration, no API rebuild. Verify: open teivaka.com/farm — skeleton then
Needs-you-now band; tap a flock card → poultry dashboard; "Updated HH:MM" is real.

**Status:** ✅ redesign shipped to `claude/beautiful-fermi-F0dLX`. Backend keystone
(composite endpoint) is the next slice when you want the query fan-out collapsed.

---

## 1-opt2. Overview (/farm) + sidebar — OPTIMIZATION PASS 2 (2026-06-26) — ✅ shipped

Third stress test surfaced two regressions I caused chasing pass-1 speed, plus
quick wins. All fixed. Build ✓.

- **R1 (regression) FIXED** — pass-1 dropped `/auth/me` and read the name from the
  JWT, but the access token has no name claim (`auth.py:106`) → greeting was always
  nameless. Re-added the `["me"]` query (staleTime 5m); greeting personalised again.
- **R2 (regression) FIXED — AI now real** — `/tis?q=…` was cosmetic (TIS.jsx never read
  it). Wired TIS to consume `?q=` once on mount and auto-send (guarded ref, no double-
  send; the click-event guard in `send(textArg)` keeps button/Enter callers safe).
  "Ask AI" from Overview now actually asks the contextual question. (DO-NOT-TOUCH TIS.jsx
  override — surgical: one effect + one signature change.)
- **R5 FIXED — safer one-tap Done** — optimistic hide on tap (can't double-complete),
  reverts on failure with a toast; `aria-live="polite"` on the Needs-you-now region so
  screen readers announce the current priority.
- **R6 FIXED** — EnterpriseCompare capped to 8 + "+N more" (consistent with the farms cap).
- a11y: reduced-motion on the sidebar chevron.

**Sidebar updated (fewer clicks + simplicity):** promoted the two daily-use destinations
**Tasks** and **Weather** to one-click top-level items (Tasks badge now always visible)
and dropped the 2-item "Plan" group. Farm rail order: Overview · Tasks · Weather ·
Grow · Sell · Prove · Insights · Account · Quick Add. LeftRail passes the open-task
badge to the top-level Tasks item.

**Still open (carry-over, backend/cross-page — honestly NOT fixed):** low-literacy
voice/i18n (S6); government/enterprise role-based view + P&L gating (S5); tasks
tenant-wide + cap 50 (S7); FarmSelector search at 500 farms; whole-farm activity feed
(M20). R3 (hard-logout on flaky refresh) + R4 (reconnect refetch herd) left as
correctness-vs-resilience trade-offs to tune deliberately, not patch.

**DEPLOY:** frontend-only → `cd /opt/teivaka/frontend && npm run build`. Verify: greeting
shows your name; Overview "Ask AI" opens TIS and auto-asks; tap Done → task vanishes
once, reverts if offline; sidebar shows Tasks (with badge) + Weather as top-level.

---

## 1-opt. Overview (/farm) — OPTIMIZATION PASS (2026-06-26) — ✅ shipped to branch

Stress-tested across 11 personas (two rounds) → optimized for speed / automation /
AI / simplicity / accessibility, folding in the critical stress-test fixes. Build ✓.

**Speed.** All derivations moved into one `useMemo` (D6) — no recompute on tab/modal
re-render. Dropped the unused `/farms/{id}` and `/auth/me` queries (name now from the
JWT via getCurrentUser) → **12→10 calls**. `refetchOnReconnect` + `retry:1` so a flaky
link self-heals instead of sticking on error.

**Honesty under failure (was the worst weakness).** Routed every call through
`utils/api` (token auto-refresh + humanised errors, B88) → an **expired session no
longer renders "FJ$ 0 / All clear"** (D14). farms-*error* now shows a Retry card, not
"create your first farm" (S2). Errored money shows "—" not 0 (S1). A `degraded` banner
("showing last saved values · Retry") replaces silent false data; the all-clear line
only shows when tasks+compliance actually loaded.

**Automation / fewer clicks.** Complete the top task **one-tap from "Needs you now"**
(no navigate). Auto-refetch on reconnect + after cycle-create.

**AI.** "Ask AI" (header removed, now in Decide) **deep-links TIS pre-seeded with the
live situation** (`/tis?q=…` — the hold, or the losing enterprise, or a general ask).
Honest: TIS still answers from the KB; we only frame the question.

**Simplicity.** One header action (Log); "Ask AI" lives where the decision is. Owner
depth (Ops, Enterprise/Multi-farm compare) only renders when it has data. Stale
docstring fixed.

**Accessibility.** `prefers-reduced-motion` honoured (`motion-reduce:` on every pulse/
transition); Active-cycle rows keyboard-operable (role=button, tabIndex, Enter/Space);
aria-labels on rings + `aria-hidden` on decorative icons; tab row uses role=tab.

**Correctness.** "Today" computed in **Pacific/Fiji** to match the backend day-boundary
(D2). MultiFarmCompare capped to 6 + "view all" (S4/500-farm). pu_name (not raw pu_id)
+ author dropped in the activity strip (D4/M21).

**D1 🔴 shared-device cache — CLOSED (2026-06-26).** Root cause: both user-initiated
sign-outs (`FarmerLayout.handleLogout`, `MeMenu.handleSignOut`) did a SOFT router
navigate + only cleared the two token keys — leaving `tfos_current_farm_id` behind and
the SPA's in-memory caches (module-level React Query clients, context) alive, so the
next user on a shared device briefly saw the previous user's data. Fix: new
`utils/auth.logout()` clears ALL auth localStorage (tokens + onboarding +
`tfos_current_farm_id`) then HARD-navigates (`window.location.assign("/login")`) — a
full reload guarantees every in-memory cache is wiped (mirrors the 401 path). Both
sign-out handlers now call it. `clearAllAuth()` also drops `tfos_current_farm_id`.
FarmerLayout edit = explicit DO-NOT-TOUCH override (2-line security fix to the logout
handler only, not the protected trial-chip/`/auth/me` logic). Removed the now-dead
`useNavigate` in both files. Build ✓.

**STILL OPEN (backend / cross-page, filed — not page-local):**
- Backend keystones unchanged: composite `/farm/overview` (Inviolable #3), `farm_id`
  on /tasks (D-tasks tenant-wide), whole-farm activity feed, role-based view (S5),
  voice/i18n for low-literacy (S6).

**DEPLOY:** frontend-only → `cd /opt/teivaka/frontend && npm run build`. No API/migration.
Verify: expire your token (wait or clear access) → page refreshes via refresh-token,
no false zeros; pull network → "showing saved data" banner; tap Done on the top task →
it completes without leaving Overview.

**Status:** ✅ optimization shipped. Next 🔴 to clear is D1 (logout cache) — auth-path,
staged for your review.

---

## 1-audit. Overview (/farm) — FORMAL FRAMEWORK AUDIT (2026-06-26) — audit record (superseded by redesign above)

Forensic audit of `frontend/src/pages/farmer/FarmDashboard.jsx` (881 lines) under the
ratified TFOS Review Framework. Backend contracts for all 12 live queries verified
against the routers (not assumed). **Audit only — no code changed; redesign awaits approval.**

**What actually renders (live path, return @811-868):** OvHeader · LayerBackfillBanner ·
HealthKpis (health hero + 5 KPIs) · AttentionAdvisor · OpsRow · EnterprisePortfolio ·
EnterpriseCompare + MultiFarmCompare · FinancialSnapshot + Recent Activity · Active cycles
(ActiveCyclesTable) · FarmSectionsNav · audit-chain footer · NewCycleModal.

**Data contracts (VERIFIED in routers).** No array-crash risk on the live path:
`financials/crops` (financials.py:135) + `labor` (labor.py:95) + `farms` (farms.py:108)
always return arrays; object endpoints (farm summary, flocks{items}, cycles{cycles},
tasks{tasks}, cash-ledger{cash_balance_fjd}, compliance{blocked_count}, chain-status)
are correctly unwrapped. Frontend extraction (716-722) matches. Theme tokens valid
(`--cream-2` index.css:41/60). All live nav targets resolve (several via the merge
redirects added in App.jsx:385-397).

**FINDINGS (ranked).**
- **F1 · SEV-1 · DEAD CODE (~40% of file).** 13 components are defined and NEVER
  rendered: HeaderRow, PillarCards, BankabilityPath, Priorities, WeatherStrip,
  FarmSummary, HeadlineMetrics, Intelligence, CyclePipeline, FarmComparison,
  QuickActions, + atoms Section & Tile, + dead helpers fjd/roiTxt/gradeColor/
  wmoWx/wx1/wxDay, + dead imports useFormModal & ModeDropdown (B90 residue lives
  here). ≈ lines 50-389. Ships in the 53 KB chunk, and the file's own header
  docstring describes components that don't render — actively misleads any auditor.
  WeatherStrip being dead means the page does NOT fetch weather (good for query
  count, but the section a farmer might expect is simply absent).
- **F2 · SEV-1 · HONESTY DEFECT.** Health-hero subtext is hardcoded optimistic —
  `"Your farm is performing — tap to view full health"` (line 453) shows regardless
  of score. A struggling farm (score 20 / "At risk") still reads "performing". This
  is a banker-facing surface; copy must reflect the real grade.
- **F3 · SEV-2 · OVER-CONFIDENT SCORE.** Farm-health `/100` (742-750) is a naive
  heuristic: crops scored 100 or 75 (only signal = net≥0), flocks ALWAYS 100
  (ignores mortality/survival), holds the only real deduction. Presented as a precise
  graded score ("Very Good"). Conflates "has activity" with "healthy". Honest-ish
  (rubric is commented, holds are real) but the precision + grade label oversell what
  the math supports.
- **F4 · SEV-2 · NOISY ALERTS.** `alerts = holds + (#crops with net<0)` (line 780).
  Every new planting (costs logged before harvest income) counts as an alert → the
  Alerts KPI + AttentionAdvisor cry wolf for normal early-cycle economics.
- **F5 · SEV-2 · DUPLICATE NAV.** In-page `FarmSectionsNav` (line 842) now duplicates
  the persistent LeftRail sidebar shipped this session. Two farm navigations on one
  screen.
- **F6 · SEV-3 · SCALE.** 12 parallel queries per open (farm, fin, crops, flocks,
  cycles, tasks, cash, farms, labor, compliance, chain, me). Fine at alpha; filed
  composite `GET /farm/overview/{id}` for scale.
- **F7 · SEV-3 · HOOKS FRAGILITY.** `q = (key,fn,enabled)=>useQuery(...)` (702) calls
  a hook inside a helper. Works (stable call order) but violates rules-of-hooks lint
  and breaks the moment any q() is wrapped in a condition.
- **F8 · SEV-3.** Nested `QueryClientProvider` local to this page (874) — cache not
  shared with the shell (B31: lift to FarmerShell).
- **F9 · SEV-3.** Internal links point at OLD routes (/farm/cash, /farm/analytics,
  /farm/reports, /farm/history, /farm/locations, /farm/labor) that now redirect —
  works but adds a navigation hop; should target merged routes directly.

**Strengths (PASS).** Real RLS data on every live tile; honest "—"/"Building" gaps
(worth, credit, FRCS, demand, margin); array-guarded live path (verified, won't
white-screen); `formatMoney()` (i18n-safe) on the live path; strike-mandated pieces
preserved (LayerBackfillBanner #104a, real audit-chain footer via /me/chain-status);
security clean (auth + farm-scoped + server-side RLS, no secrets in URLs).

**Verdict:** functionally honest and non-crashing, but carrying a large dead-code
mass (F1), one real honesty defect (F2), and two trust-eroding heuristics (F3/F4).
Redesign scope = delete F1, fix F2 copy, ground/soften F3+F4, drop F5, point links
at merged routes (F9). F6-F8 are backend/infra slices. **Awaiting approval to redesign.**

---

## 1-prev. Overview (/farm) — 🟡 improved (earlier pass, superseded by formal audit above)

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

### Persistent grouped sidebar BUILT — ✅
The farm rail (`LeftRail` desktop + `PillarSubNavStrip` mobile/tablet) now renders
the consolidated nav from a single source of truth (`pillarSubNavMap.js`). Both
`FARM_NAV_GROUPS` (desktop collapsible) and `PILLAR_SUB_NAV["/farm"]` (mobile flat
strip) rewritten to the **merged destinations in natural farming order**:
- **Overview** (item, /farm)
- **Plan** — Tasks · Weather
- **Grow** — Enterprises · Production · Field log · Resources
- **Sell** — Market · Money
- **Prove** — Compliance · Records
- **Insights** (item, /farm/insights)
- **Account** — Library · Partnerships · Settings
- Quick Add (+) launcher
Every link points at a LIVE merged route (verified against App.jsx :379-397 — the 5
merged pages exist + 13 old routes redirect into them). No dead links. Task-count
badge preserved on the Plan group (collapsed-state surfaces open-task count). Desktop
collapsible group memory + active-group force-expand intact. Build clean.
22 flat routes → 15 destinations in 5 workflow groups + 2 standalone items.

---
(remaining destinations pending — appended as each is audited)

---

## 2. Tasks (/farm/tasks) — REDESIGNED (2026-06-26, audit-approved) — ✅ shipped to branch

Full rebuild of `FarmTasks.jsx` per the approved audit + `docs/TFOS_Tasks_Redesign_Wireframe.md`.
Build ✓ (chunk 53→19 KB). Frontend-only.

**CORRECTION ON RECORD (integrity):** the audit's **N1 "completion loop broken
end-to-end" was WRONG** — I grepped `completeTaskFromUrl` (a comment phrase) not the
real export `completeLinkedTask`, which HarvestNew (:279), CycleNew (:239) and poultry
HealthObservationNew (:78) all call. Routed tasks DO close. Retracted. The real gap was
only **T2** (input-required, non-routed tasks posting `""` → 422). Score corrected 4.5 → 6.

**New structure (cognitive-load-first):** header → **Do this next hero (FIRST, T6)** →
one honest progress bar (replaces 5 KPIs incl. the duplicate "Today's Focus"/"Todo
Today", T5/N3) → **Today & overdue** list with always-visible complete (no 2-tap menu) →
**Coming up** collapsible (Tomorrow/This week/Later — replaces the 5-col kanban) →
crop-plan demoted to a labelled secondary section (N2) → quick-add.

**Fixed (verified):** T1 (`utils/api` token-refresh + real error banner, no false "all
caught up"); **T2 completion always works** (routed→form; input-required→inline typed
field w/ validation; else one-tap — no blind `""`); T3 (Fiji time); T5/T7 (session
progress, dropped 200-row COMPLETED fetch); N3 (dup KPIs gone; **orphan Tasks.jsx
deleted**); N5 (icon from `icon_key`); N7 (refetch on reconnect/focus); a11y (aria-live,
progressbar, reduced-motion, keyboard, menu Esc/outside-click); AI ("Ask AI" per task
via `/tis?q=`); optimistic complete/skip with revert-on-failure.

**Filed (backend/cross-page):** `farm_id` on `/tasks` (T4 tenant-wide); worker
assignment/roles; recurring tasks; surfaced AI-suggest.

**DEPLOY:** frontend-only → `cd /opt/teivaka/frontend && npm run build`. Verify: hero
first; one-tap no-input task; input task shows inline field (no error); routed task opens
form + closes on submit; kill network → error banner not "all caught up".

---

## 2-audit. Tasks (/farm/tasks) — FORMAL FRAMEWORK AUDIT (2026-06-26) — audit record (superseded by redesign above)

Forensic audit of `FarmTasks.jsx` (383 lines). Backend contracts verified
(`/tasks`, `/crop-plan/farm-steps`, `taskBridge`, `/tasks/{id}/complete`). The page
got the "Do this next" hero earlier but never a full audit — it predates the Overview
fixes, so it carries the same class of defects + one verified functional bug.

**FINDINGS (ranked).**
- **T1 · 🔴 False "all caught up" on API error.** Raw fetch + local getJSON, retry:0,
  no error state → token expiry / 500 / offline → `openTasks=[]` → renders
  "Nothing to do — you're on top of it" (`:299-304`). Bypasses the refreshing api.js
  client (D14/S1 — the exact defect fixed on Overview).
- **T2 · 🔴 One-tap "Done" broken for input-requiring tasks.** `onDone` sends
  `input_value: ""` when `input_hint !== "none"` (`:250`), but the backend 422s unless
  the value matches the hint (`tasks.py:124-137`). The hero "Mark done" + card "Done"
  FAIL for any weight/text/photo task lacking a taskTarget route → "Couldn't complete
  (needs input?)" with no way to supply it.
- **T3 · 🟠 UTC not Fiji** — `todayISO`/`whenOf` (`:37-49`) bucket Today/Overdue/
  Tomorrow in UTC (D2). Mis-classifies near local midnight.
- **T4 · 🟠 Tasks tenant-wide, not farm-scoped** — `/tasks?status=OPEN` has no farm_id
  (`:221`, backend confirmed) yet the page is farm-selected; switching farms shows the
  same tasks (S7/M25).
- **T5 · 🟠 "Done" KPI mislabeled "Completed this session"** — actually lifetime
  completed, capped 200 (`:222/232`). Inflated/misleading.
- **T6 · 🟡 "Do this next" hero buried** — CropPlan renders above Board (`:367-368`),
  so the single most important action sits below the crop-plan list.
- **T7 · 🟡 200 COMPLETED tasks fetched just for a count** (`:222`). Needs a count.
- **T8 · 🟡 No loading skeleton / no error state** (inconsistent with locked Overview).
- **T9 · 🟡 nextTask ignores crop-plan "Do now" steps** (hero = task_queue only).
- **T10 · 🟡 No worker assignment / "whose task"** (enterprise). T13 🟢 skip reason
  hardcoded; icons lack aria-hidden.

**Strengths.** Real task_queue + audit on complete/skip; honest no-fake-AI; the hero
pattern; taskTarget routes actionable tasks to prefilled forms; crop-plan integration;
quick-add; bounded 200; flat icons + theme.

**Overall: 6/10** — good tool + right hero, dragged down by 2 🔴 (false-empty T1,
broken Done T2) + tenant-wide (T4) + mislabeled KPI (T5) + buried hero (T6).

**Proposed redesign scope (awaiting approval):** T2 (Done routes input tasks to an
inline input/form, never submits ""), T1 (api.js + real error state), T3 (Fiji time),
T5 (honest label), T6 (hero first), T7/T8 (count + skeleton); T4 farm-scope filed
(backend). Mirrors the locked-Overview standard. **Redesign NOT started.**

---

## 2-prev. Tasks (/farm/tasks) — 🟡 redesigned (earlier "Do this next" pass, superseded by formal audit above)

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

---

## 3. Weather (/farm/weather) — REDESIGNED (2026-06-26, audit-approved) — ✅ shipped to branch

Full rebuild of `WeatherPage.jsx` per the approved audit + `docs/TFOS_Weather_Redesign_Wireframe.md`.
Build ✓ (chunk → 26 KB). Frontend-only. The forecast feed IS live (weather_worker, Open-Meteo
+ GDACS, 3-hourly per celery_app.py:120-128) — the old docstring "feed not connected" was stale.

**Structure (feed-primary, decision-first):** header (Ask AI + Log) → cyclone RED card at TOP
when active (+ "Add prep task" weather→task bridge) → NOW hero (live feed; staleness note;
one-tap "Log a ground reading" prefilled from the reading) → THIS WEEK (consolidated: outlook
headline + 7-day strip + spray/harvest/plant windows + disease line) → What this weather means
(one shared crop card + per-animal) → compact GREEN cyclone line → collapsible "Your logged
history" (summary + observations, deferred until opened).

**Fixed (verified):** W1 (api.js token-refresh; error→Retry vs empty→"updates every 3h / set
location" + Locations link — no false "set your location" on error). W2 (Fiji time). W3 (one
shared crop card, not faux per-crop). W4 (3 advisories → 1 "this week" block). W5 (ModeDropdown
removed). W6/W8 (refetchOnReconnect; summary+obs deferred until history opened → 8→6 initial
calls). WX1 (guidance now from the LIVE feed not just manual log; manual log demoted to optional
ground-reading; one-tap log prefilled from the now-reading). **WX2 (spray window gated on WIND
≥25, not just rain — agronomic correctness fix).** WX4 (staleness surfaced when fetched_at >4h).
WX5 (cyclone leads when active + "Add prep task" creates a real /tasks/manual task). W7
(progressive disclosure). a11y (aria-hidden icons, reduced-motion, role=alert on cyclone). More
AI (Ask AI → /tis?q= weather brief). Centered max-w-4xl column.

**Filed (backend/cross-page, honest — not faked):** reconcile feed↔observations data layer
(auto-populate summary/observations from weather_forecast so "last 30 days" works for feed-only
farmers — WX1 data layer); cyclone/heavy-rain PUSH alerts (WX5 proactive); GDD/evapotranspiration
+ crop-specific disease via KB (WX3); per-block microclimate (WX6); weather-as-insurance/loss-
evidence export (WX7); regional aggregate for extension (WX10); thresholds→config (WX8);
composite weather endpoint + shared QueryClient (W9); voice/i18n.

**DEPLOY:** frontend-only → `cd /opt/teivaka/frontend && npm run build`. Verify: active cyclone
shows red at top with "Add prep task"; Now hero shows live temp + "Log a ground reading"
prefilled; spray shows HOLD on a windy-but-dry day; history collapsed (opens → loads summary).
Verify-item: confirm `tenant.weather_forecast` migration exists in prod (else forecast 500s).

**Status:** ✅ redesign shipped. Awaiting stress pass / approval to lock.

---

## 4. Enterprise (/farm/enterprises) — AUDITED + REDESIGNED (2026-06-26, approved) — ✅ shipped

Audit findings E1–E10 + EX1–EX10 (chat); approved → full rebuild of `Enterprises.jsx` per
`docs/TFOS_Enterprise_Redesign_Wireframe.md`. Build ✓ (chunk 47.7→39.6 KB). Frontend-only.

**Headline fixes:** EX1 — **3-Layer doctrine surfaced** (Strike #101): a "By layer" 3-axis
summary strip + a layer badge on every card + a layer filter; layer read per crop from
`/cycles` (production_id→layer). EX3 — enterprise has no entity → **removed the dead
Pause/Close/Worth actions** (filed a real entity). EX2 — **dropped the hardcoded "Open
tasks: 0"** (replaced with the Layer KPI). E2/EX4/EX5 — **no black-box /100**: honest
standing labels (Profitable / Building / Losing for crops; "{n}% survival" for animals);
removed the invalid mixed-unit portfolio average. E4 — **13-tab detail → 4 real tabs**
(Dashboard · Production/Herd · Finance · Records) + one honest "more coming" line.
E9/EX8 — **5 view tabs → 3** (Portfolio · Money · Outlook; Rankings+Cash+Investor merged
into Money); dropped the redundant EnterpriseStrip. E1 — routed via `utils/api`
(token-refresh) + de-jargoned ErrorState. E6 — fixed the `||"Block"||"—"` no-op. E7 —
"to date" not "this season". EX6 — alerts/"loss" flag only enterprises that **sold at a
loss** (income>0 && net<0), never mid-cycle crops. B90 — ModeDropdown removed. retry:1 +
refetchOnReconnect (E8); role=tablist/tab on tabs (a11y). Watermarked "Example" preview kept.

**Filed (backend/cross-page, honest):** real enterprise entity (working Pause/Close/Worth/
valuation + per-enterprise roles); animal financials (income/net/ROI); per-enterprise
open-task count; per-block P&L grain; layer for animals/verticals; composite endpoint +
shared QueryClient; grounded standing via decision signals/KB; certifications.

**DEPLOY:** frontend-only → `cd /opt/teivaka/frontend && npm run build`. Verify: "By layer"
strip shows Cash flow/Food security/Long-term with net; cards carry a layer badge; no
Pause/Close buttons; open an enterprise → 4 tabs only, Layer KPI (no fake "0 open tasks");
a mid-cycle crop is NOT flagged as losing money; empty farm → watermarked Example preview.

**Status:** ✅ redesign shipped. Awaiting stress pass / approval to lock.
