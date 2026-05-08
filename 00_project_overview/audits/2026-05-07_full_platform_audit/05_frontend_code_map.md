# Phase 5 — Frontend Code Map

**Audit date:** 2026-05-07
**Recon executed:** 2026-05-08 08:47 UTC (post Strike #121 commit `420c265`)
**Scope:** `/opt/teivaka/frontend/` — React 18 + Vite + Tailwind + react-router-dom + @tanstack/react-query
**Recon script:** `/tmp/phase5_recon.sh` (20 sections)

---

## Executive summary

Frontend is **POULTRY-deep but vertical-shallow**: of 70 pages and 32 components, 27+ routes are POULTRY-specific event forms (eggs/flock/feed/vaccination/mortality/pest/temperature/etc — every Sprint 6/7 phase added one or two). Other 6 verticals (CROPS, LIVESTOCK, APICULTURE, AQUACULTURE, FORESTRY, SPECIALTY) have **minimal or no UI surface**. The Decision Engine cluster #110-116 (the audit's most-visible 7-strike cluster) has **zero frontend consumer** — it's a backend-only operational artifact with no UI route. Solo mode's UI surface (SoloShell + SoloTaskCard) exists but is dormant — Phase 3 confirmed all 3 tenants are GROWTH.

State management is clean: **`@tanstack/react-query` for server state + 4 React Context providers** (CurrentFarmContext, LauncherContext, LeftRailContext, OnboardingContext). No Redux usage despite `@reduxjs/toolkit` + `redux` + `react-redux` + `immer` being installed (~7 MB of unused node_modules — Phase 7 finding).

App.jsx implements a **role-separated routing architecture** with React.lazy() chunking — admin code is never downloaded by farmer browsers. The docstring at the top is explicit about this security guarantee. 80+ Route declarations across 4 wrapper guards (AdminRoute / FarmerRoute / OnboardingRoute / PrivateRoute).

Backend↔frontend coverage is **~40%**: Phase 4 inventoried ~165 endpoints across 51 routers; Phase 5 grep finds ~22 endpoint *families* used. **30+ backend routers have no frontend consumer** — the back-end is significantly ahead of the front-end.

The `.bak-pre-*` snapshot tar-pit observed in Phase 1 + Phase 2 + Phase 4 is **densest on the frontend**: 30+ backup files visible, with `App.jsx` alone having **8** snapshots and `LogSheet.jsx` having **10** (9 phase snapshots + `.broken-keep-for-diagnosis`).

---

## 5.0 Topology

```
frontend/src/
├── components/                        32 .jsx/.js files in 12 subdirs
│   ├── admin/                         (1 file: AdminLayout.jsx + .bak)
│   ├── farm/                          (NewCycleModal, ActiveCyclesTable, FarmSelector, ...)
│   ├── farmer/                        (FarmerLayout)
│   ├── inputs/                        (ThemedSelect, ThemedCombobox)
│   ├── launcher/                      (LogSheet — 27-event dispatcher)
│   ├── nav/                           (TopAppBar, BottomNav, LeftRail, RightCluster, MeMenu, ...)
│   ├── onboarding/                    (VoiceInput)
│   ├── settings/                      (GroupCatalogSection)
│   ├── tis/                           (TisFab, TisModal, TisChatPanel)
│   └── ui/                            (Modal, Toast)
├── context/                           4 Context providers
│   ├── CurrentFarmContext.jsx
│   ├── LauncherContext.jsx
│   ├── LeftRailContext.jsx
│   └── OnboardingContext.jsx          (+ 1 .bak)
├── hooks/                             2 custom hooks
│   ├── useTisSse.js
│   └── useEffectiveMode.js
├── layouts/                           2 shells
│   ├── FarmerShell.jsx                (375 lines)
│   └── SoloShell.jsx                  (96 lines, dormant)
├── pages/                             70 pages
│   ├── (root: 11 public/auth pages)
│   ├── admin/                         (6 admin pages)
│   ├── farmer/                        (24 farmer pages)
│   ├── farmer/poultry/                (27 POULTRY event forms)
│   ├── onboarding/                    (1: FarmBasics)
│   └── solo/                          (1: SoloTaskCard)
├── styles/
│   └── palette.js                     (1 file)
└── utils/                             5 utils
    ├── apiClient.js                   (57 lines)
    ├── auth.js                        (115 lines)
    ├── roles.js                       (35 lines)
    ├── speech.js                      (201 lines, voice handling)
    └── useEventMutation.js            (53 lines, mutation hook)

App.jsx + main.jsx + index.css (root)
```

**Total:** 119 source files in `src/`.

---

## 5.1 Entry + router

### `main.jsx` (10 lines)

Trivial entry: imports App, mounts to `#root` in StrictMode. No providers wrapped (providers live inside App.jsx).

### `App.jsx` (17,873 bytes, the routing brain)

Architecture from the file's docstring:

> Role separation is enforced at the routing layer.
>
> Admin routes (`/admin/*`):
>   - Wrapped in `<AdminRoute>` — 403 if not ADMIN
>   - Admin components are NEVER imported into farmer sessions
>
> Farmer routes (`/*`):
>   - Wrapped in `<FarmerRoute>` — redirects admin to /admin
>   - New users (onboarding_complete=false) redirected to /onboarding first
>
> **Security guarantee:**
>   Admin navigation tabs are completely absent from farmer DOM.
>   They are not hidden, not disabled, not rendered at all.
>   `React.lazy()` ensures admin chunk is never downloaded by farmer browsers.

### Route guards (4 wrappers from `components/PrivateRoute.jsx`)

```
AdminRoute       — requires ADMIN/FOUNDER role; 403s otherwise
FarmerRoute      — redirects admin to /admin; redirects unboarded to /onboarding
OnboardingRoute  — only mounts if onboarding_complete=false
PrivateRoute     — generic auth gate (Solo + miscellany)
```

### Bundle splitting

All non-auth pages use `lazy()`:
- 13 farmer pages
- 27 POULTRY event-form pages
- 6 admin pages
- 2 layouts (FarmerShell, SoloShell)
- 1 solo page
- 1 onboarding flow page

**~50 React.lazy chunks.** Admin code never reaches farmer bundle.

---

## 5.2 / 5.12 Route registry (~80 routes)

### Public (no auth)
```
/                     Landing.jsx
/login                Login.jsx
/register             Register.jsx
/403                  Forbidden.jsx
/privacy              Privacy.jsx
/terms                Terms.jsx
/forgot-password      ForgotPassword.jsx
/reset-password       ResetPassword.jsx
/verify-email         VerifyEmail.jsx
/community            Community.jsx
/community/map        CommunityMap.jsx
/kb                   KnowledgeBase.jsx
*                     NotFound.jsx
```

### Onboarding (OnboardingRoute)
```
/onboarding              Onboarding.jsx
/onboarding/farm-basics  FarmBasics.jsx
```

### Admin (AdminRoute, lazy)
```
/admin                       AdminDashboard.jsx
/admin/users                 AdminUsers.jsx
/admin/content               AdminContent.jsx
/admin/analytics             AdminAnalytics.jsx
/admin/settings              AdminSettings.jsx
/admin/dev/inputs-sandbox    InputsSandbox.jsx          ← dev-only sandbox
```

### Farmer (FarmerRoute → FarmerShell, ~50 routes)

Real pages (24):
```
/home                             Home.jsx
/farm                             FarmDashboard.jsx
/farm/harvest/new                 HarvestNew.jsx
/farm/cycles                      CycleList.jsx
/farm/harvests                    HarvestList.jsx
/farm/field-events                FieldEventNew.jsx     ← polymorphic 27-event form
/farm/inventory                   InventoryList.jsx
/farm/cash                        CashLedger.jsx
/farm/compliance                  PoultryCompliance.jsx
/farm/poultry                     PoultryDashboard.jsx
/farm/poultry/bank-evidence       PoultryBankEvidence.jsx
/farm/poultry/eggs/new            EggsNew.jsx
/farm/poultry/flocks/new          FlockPlacedNew.jsx
/farm/poultry/mortality/new       MortalityLoggedNew.jsx
/farm/poultry/vaccination/new     VaccinationGivenNew.jsx
/farm/poultry/feed/new            FeedReceivedNew.jsx
/farm/poultry/weight/new          WeightCheckNew.jsx
/farm/poultry/birds/add           BirdReplacementNew.jsx
/farm/poultry/eggs/sell           EggsSoldNew.jsx
/farm/poultry/birds/sell          BirdsSoldNew.jsx
/farm/poultry/health/new          HealthObservationNew.jsx
/farm/poultry/feed/used           FeedUsedNew.jsx
/farm/poultry/litter/changed      LitterChangedNew.jsx
/farm/poultry/coop/cleaned        CoopCleanedNew.jsx
/farm/poultry/feed/purchased      FeedPurchasedNew.jsx
/farm/poultry/water/consumed      WaterConsumedNew.jsx
/farm/poultry/mortality/investigated  MortalityInvestigatedNew.jsx
/farm/poultry/cull/logged         CullLoggedNew.jsx
/farm/poultry/visitor/logged      VisitorLoggedNew.jsx
/farm/poultry/pest-control/applied  PestControlAppliedNew.jsx
/farm/poultry/temperature/recorded  TemperatureRecordedNew.jsx
/farm/poultry/eggs/graded         EggsGradedNew.jsx
/farm/poultry/flock/moved         FlockMovedNew.jsx
/farm/poultry/equipment/maintained  EquipmentMaintainedNew.jsx
/farm/poultry/incident/reported   IncidentReportedNew.jsx
/farm/poultry/supplies/received   SuppliesReceivedNew.jsx
/classroom                        Classroom.jsx
/me                               Me.jsx
/me/library                       LibrarySettings.jsx
/me/settings                      MeSettings.jsx
/tis                              TIS.jsx
```

ComingSoon stubs (16 — features queued for future phases):
```
/home/following              phase 4.3
/home/marketplace            phase 8
/home/directory              phase 8
/home/saved                  phase 4.3
/classroom/progress          phase 4.3
/classroom/certifications    phase 6
/farm/tasks                  phase 4.2
/farm/labor                  phase 4.2
/farm/buyers                 phase 6
/farm/equipment              phase 6.5
/farm/analytics              phase 4.2
/farm/reports                phase 6
/farm/locations              phase 5.5
/tis/history                 phase 4.3
/tis/voice                   phase 5
/tis/usage                   phase 4.3
/me/settings/mode            phase 4.3
/me/subscription             phase 4.3
/me/referrals                phase 4.3
/me/team                     phase 4.3
/me/data                     phase 4.3
/stub/phase-:phaseNum        dynamic
```

### Solo (PrivateRoute → SoloShell, dormant)
```
/solo    SoloTaskCard.jsx
```

### Standalone farmer (no shell)
```
/harvest      HarvestLog.jsx
/calendar     FarmerCalendar.jsx
/members      Members.jsx
/leaderboard  Leaderboard.jsx
```

### Strike #91 finding (POULTRY dominance)

**27 of 70 pages are POULTRY-specific event forms.** No CROPS event forms (the brief says CROPS is co-equal with POULTRY in the 7-vertical taxonomy). The closest CROPS UI is `/farm/cycles` (CycleList) + `NewCycleModal` component + crop-varieties dropdown — no per-event forms (PLANTING, IRRIGATION, FERTILIZATION, etc. all live behind the polymorphic `/farm/field-events` form which is 38.8 KB).

POULTRY got dedicated forms; CROPS got a polymorphic form. Asymmetric vertical investment.

---

## 5.3 Pages inventory (70 files)

### Largest pages (top 10)

| Size | File | Notes |
|---:|---|---|
| 38,830 | `pages/farmer/FieldEventNew.jsx` | **Polymorphic 27-event dispatcher** — handles every CROPS field event |
| 35,688 | `pages/farmer/CashLedger.jsx` | Cash transactions UI |
| 32,390 | `pages/Register.jsx` | Multi-step registration |
| 21,661 | `pages/Landing.jsx` | Public landing page |
| 20,136 | `pages/farmer/Community.jsx` | Community wall + posts |
| 20,089 | `pages/farmer/Onboarding.jsx` | Multi-step farmer onboarding |
| 17,300 | `pages/farmer/poultry/PestControlAppliedNew.jsx` | Largest single POULTRY form |
| 16,992 | `pages/farmer/CommunityMap.jsx` | Community map view |
| 16,573 | `pages/farmer/HarvestNew.jsx` | Harvest entry |
| 15,910 | `pages/farmer/poultry/PoultryDashboard.jsx` | POULTRY dashboard |

### POULTRY form file-size distribution

The 27 POULTRY forms range from ~10 KB to 17 KB each. Average ~12 KB. Combined: ~325 KB of POULTRY form code in `pages/farmer/poultry/`. This is the bulk of Sprint 6/7 frontend output.

---

## 5.4 Components inventory (32 files)

### Largest components (top 10)

| Size | File | Role |
|---:|---|---|
| 20,099 | `components/launcher/LogSheet.jsx` | **27-event dispatcher** (pairs with FieldEventNew on backend); +10 .bak siblings |
| 18,560 | `components/farm/NewCycleModal.jsx` | 3-dropdown crop cycle creation (Strike #100) |
| 12,105 | `components/onboarding/VoiceInput.jsx` | Voice-first input control |
| 11,679 | `components/farmer/FarmerLayout.jsx` | Pre-FarmerShell legacy layout (likely stale) |
| 10,691 | `components/tis/TisModal.jsx` | TIS modal chat |
| 9,264 | `components/tis/TisChatPanel.jsx` | TIS chat panel |
| 9,198 | `components/farm/LayerBackfillBanner.jsx` | Strike #104a banner |
| 8,990 | `components/settings/GroupCatalogSection.jsx` | Group toggles UI (consumes `farm_active_groups`) |
| 8,490 | `components/TISWidget.jsx` | Standalone TIS widget at root level |
| 7,605 | `components/nav/MeMenu.jsx` | User menu |

### Strike #91 finding (TIS surface duplication)

TIS UI exists in **two locations**:
- `components/tis/{TisFab.jsx, TisModal.jsx, TisChatPanel.jsx}` — 3 files, organized
- `components/TISWidget.jsx` — standalone at root level, 8.5 KB

Either:
- (a) `TISWidget.jsx` is legacy and superseded by `tis/*` (unused but not removed)
- (b) `TISWidget.jsx` is the embed-anywhere widget while `tis/*` is the panel UX
- (c) Transition state — both used in different routes

→ Phase 4/Phase 8 cross-check: read both, confirm whether duplicate or complementary.

### `FarmerLayout.jsx` legacy

Per Phase 1 finding, `frontend/src/components/launcher/LogSheet.jsx.broken-keep-for-diagnosis` exists alongside the live LogSheet. `components/farmer/FarmerLayout.jsx` (11.7 KB) likely predates `layouts/FarmerShell.jsx` (375 lines, the current shell) — both touch farmer rendering. → Phase 5 strike candidate: confirm FarmerLayout is dead code, delete.

---

## 5.5 Hooks (2)

```
hooks/useTisSse.js          — TIS Server-Sent Events stream
hooks/useEffectiveMode.js   — Solo/Growth/Commercial mode resolver (defaults GROWTH)
```

Just **2 custom hooks** in a 119-file project. Most state work is `useQuery`/`useMutation` (tanstack) inline + Context. Lean by design.

---

## 5.6 Context providers (4)

```
context/CurrentFarmContext.jsx     — currently selected farm + multi-farm switcher state
context/LauncherContext.jsx        — universal log button / event launcher state
context/LeftRailContext.jsx        — left rail nav state
context/OnboardingContext.jsx      — multi-step onboarding state (+ 1 .bak)
```

4 Context providers — minimal global state. All scoped to UX concerns (current farm, launcher, nav, onboarding). No global "AppContext" — JWT-derived user state lives in middleware/JWT, accessed via `auth.js` utility.

### Strike #91 finding (no auth context)

There's no `AuthContext` or `UserContext`. User identity is JWT-derived per-request via `apiClient.js` reading from localStorage. Acceptable for a JWT-only app, but means user state isn't reactive — components must re-fetch `/api/v1/auth/me` to see updates.

→ Phase 5 informational, not blocking.

---

## 5.7 State management

### Production deps related to state
```
"@tanstack/react-query": "^5.100.1"
```

**Just one production state library.** Plus React Context (built-in, no install).

### Code references
```
@tanstack/react-query usage in src/:
  components/farm/TopTaskBanner.jsx     useQuery, useQueryClient
  components/farm/ActiveCyclesTable.jsx useQuery
  components/farm/LayerBackfillBanner.jsx useQuery, useQueryClient
  components/farm/NewCycleModal.jsx     useQuery
  components/farm/FarmSelector.jsx      useQuery
  utils/useEventMutation.js             useMutation
  pages/solo/SoloTaskCard.jsx           useQuery + useMutation
  pages/farmer/LibrarySettings.jsx      QueryClient, QueryClientProvider, useMutation
  pages/farmer/CashLedger.jsx           useQuery, useMutation, useQueryClient
  pages/farmer/poultry/EggsNew.jsx      QueryClient, QueryClientProvider
```

10 files import from `@tanstack/react-query`. `LibrarySettings` and `EggsNew` instantiate their own `QueryClientProvider` — a second QueryClient inside one tree. Could be intentional (cache isolation) but more likely cargo-culted.

### Strike #91 finding (Redux installed, never used)

Phase 1.22 noted `node_modules` includes:
- `@reduxjs/toolkit/dist` (5.2 MB)
- `react-redux/dist` (748 KB)
- `redux/dist` (244 KB)
- `redux-thunk/dist` (24 KB)
- `immer/dist` (612 KB) — used by Redux Toolkit
- `reselect/dist` (532 KB)

Combined: **~7 MB of Redux ecosystem on disk**. Zero imports from these in `src/`. → **Phase 7 strike candidate: dependency cleanup.**

---

## 5.8 Layouts (2)

```
layouts/FarmerShell.jsx    375 lines  — TopAppBar + LeftRail + BottomNav + RightCluster + outlet
layouts/SoloShell.jsx       96 lines  — Solo-mode minimal shell (1 task, 3 buttons per brief)
```

`FarmerShell.jsx` at 375 lines is the main UX scaffold. `SoloShell.jsx` is dormant (Phase 3.24: all tenants GROWTH).

`components/farmer/FarmerLayout.jsx` (11.7 KB) is **separate from `layouts/FarmerShell.jsx`** — different files, different paths. Either:
- FarmerLayout = legacy pre-Phase-4.2 structure
- FarmerLayout = mobile-only shell, FarmerShell = desktop

→ Phase 5 informational, confirm in Phase 10 cleanup.

---

## 5.9 Utils (5)

```
utils/apiClient.js          57 lines    — fetch wrapper, sets API_BASE='/api/v1'
utils/auth.js              115 lines    — JWT extract/decode/store/clear from localStorage
utils/roles.js              35 lines    — role check helpers
utils/speech.js            201 lines    — Voice/Web Speech API integration
utils/useEventMutation.js   53 lines    — generic mutation hook for events router
```

**`speech.js` at 201 lines is the voice-first surface code.** Wraps Web Speech API for the brief's "voice-driven" + "Solo mode reads aloud" requirements. Used by `OnboardingContext` and `VoiceInput.jsx`.

---

## 5.10 Styles

```
styles/palette.js     1 file   — Tailwind color palette tokens
src/index.css         2630 B   — global styles + Tailwind directives
```

No `App.css`. Tailwind is the styling system. `palette.js` exports color tokens — likely consumed by Tailwind config and possibly inline-styled components.

---

## 5.11 API client + base URL

### `utils/apiClient.js` (line 14)

```javascript
const API_BASE = '/api/v1';
```

Relative URL — resolved by browser to current origin's `/api/v1/*`. Works on both production (https://teivaka.com/api/v1) and local dev (Vite proxy or same-origin). Clean.

### `frontend/.env.production` content

```
VITE_TIS_ENDPOINT=/tis/chat
VITE_TIS_BRIDGE_TOKEN=511fc887ed723b04b446c68855df8f59cfe609773448f17a
```

### Strike #91 critical finding (frontend secret leak)

**`VITE_TIS_BRIDGE_TOKEN=511fc887...` is baked into the frontend `.env.production`.** This file is committed (Phase 1.7 didn't list it as untracked) and `VITE_*` env vars are inlined into the **public client bundle** at build time. Vite documentation is explicit: "any variable starting with `VITE_` becomes part of the public bundle."

**The TIS bridge token is therefore embedded in every farmer's browser.** An attacker reading the JS bundle can extract it.

Two paths:
- (a) The token is *not* a secret (gateway-side validation, rotated frequently, scoped to TIS chat) — acceptable but the naming "TOKEN" misleads
- (b) The token IS a secret (TIS bridge auth) — **leaking now**

→ **Phase 9 critical finding.** Need to verify what `VITE_TIS_BRIDGE_TOKEN` does on the backend (search `webhooks.py` / `tis_stream.py` for matching consumer logic). If real auth, ship Strike candidate to move it server-side.

### Fetch sites

20 files contain fetch/axios calls — total ~36 calls. Concentrated in:
- `pages/farmer/CashLedger.jsx`, `pages/farmer/Onboarding.jsx`, `pages/farmer/CommunityMap.jsx` (multi-call data screens)
- `components/farm/NewCycleModal.jsx` (4 calls — multi-step crop cycle creation)
- `components/farm/TopTaskBanner.jsx` (3 calls)
- `components/launcher/LogSheet.jsx` (2 calls — event dispatcher)

---

## 5.13 Sacred files

```
grep -i "sacred" /opt/teivaka/CLAUDE.md  → (empty)
```

### Strike #91 finding (brief mismatch)

The audit brief specified "Sacred file inventory per CLAUDE.md" but **CLAUDE.md does not contain the word "sacred"**. The concept may exist under a different name (e.g., "core file", "do not modify", "protected", "load-bearing"). Or the brief was forward-looking — Sacred may be a target inventory not yet captured.

→ Phase 10 follow-up: define and populate the Sacred file list from the audit findings; candidates are likely:
- `app/main.py` (FastAPI factory)
- `app/middleware/auth.py` + `app/middleware/rls.py` (auth + tenant isolation)
- `app/core/audit_chain.py` (hash-chain emission helper)
- `02_database/schema/02_tenant_schema.sql` (tenant schema source-of-truth)
- `App.jsx` (frontend router with security guarantee)

---

## 5.14 Largest frontend files (top 25)

Top 10 reproduced from 5.3 + 5.4. Notable additions outside pages/components:
- **`App.jsx` — 17,873 bytes** (the router)
- **`layouts/FarmerShell.jsx` — 12,239 bytes** (375-line shell)

---

## 5.15 .bak / snapshot tar-pit (frontend)

**30+ .bak-pre-* files in `frontend/`.** Top contributors:

| File | .bak count |
|------|---:|
| `src/App.jsx.bak-pre-*` | **8** (6-3-11, 6-3-13, 6-3-19, 6-3-21, 6-3-23, 6-6-3, 6-10-1, 8-1, logo-deploy) |
| `src/components/launcher/LogSheet.jsx.bak-pre-*` | **10** (6.3-7, 6.3-9, 6-3-11, 6-3-13, 6-3-15, 6-3-17, 6-3-19, 6-3-21, 6-3-23, strike-97) + `.broken-keep-for-diagnosis` |
| `src/context/OnboardingContext.jsx.bak-pre-doctrinal-cleanup` | 1 |
| `src/components/ui/Toast.jsx.bak-pre-6.2-4` | 1 |
| `src/components/nav/pillarSubNavMap.js.bak-pre-6.7-1` | 1 |
| `src/components/nav/TopAppBar.jsx.bak-pre-{plus-button, logo-deploy}` | 2 |
| `src/components/farm/ActiveCyclesTable.jsx.bak-pre-strike-99-v2` | 1 |
| `src/components/settings/GroupCatalogSection.jsx.bak-pre-510f` | 1 |
| `src/components/admin/AdminLayout.jsx.bak-pre-logo-deploy` | 1 |
| `src/components/farmer/FarmerLayout.jsx.bak-pre-logo-deploy` | 1 |
| `package.json.bak-pre-6.2-4` | 1 |

Combined: ~30+ snapshot files. Combined size: ~250 KB. **Same snapshot habit as backend (Phase 1+4)** but concentrated on the two most-edited files (`App.jsx` and `LogSheet.jsx`).

→ Phase 10 cleanup: git rm 30+ .bak files. They live alongside the canonical files; tooling can mistakenly read them. The `.broken-keep-for-diagnosis` deserves explicit decision (keep with comment, or git rm).

---

## 5.16 Component import graph (samples)

The recon's import-graph extraction had a regex limitation (caught only relative imports starting with `./`) so the picture is incomplete. Notable:

- `pillarSubNavMap` — imported 2× (only top match — most files have unique imports)
- All 11 root pages imported once into App.jsx (expected)
- `apiClient` — imported once (likely re-exports from a single utils path)

The full import graph would need an AST-walker. Approximate finding from recon: **flat import topology, no over-imported god components**. Each page imports its own slice of components; very little cross-cutting.

---

## 5.17 Backend endpoint cross-check

### Frontend ↔ Backend endpoint families

Frontend grep found these `/api/v1/*` paths:

```
auth/       (forgot-password, register, me)
chemicals
community/  (posts)
crop-varieties
cycles
events
farm-libraries
farms       (root + multiple subpaths)
flocks
harvests    (+ compliance-check)
onboarding/ (status, farm-basics, production-units, livestock, complete)
production-units
productions
tasks/
tis/        (stream, sessions)
cash-ledger
```

**~22 endpoint families touched.**

### 30+ backend routers WITHOUT visible frontend consumer (Phase 4 cross-check)

Phase 4 inventoried 51 routers / ~165 endpoints. Frontend uses ~22 families.

Backend routers with NO frontend reference (estimated by elimination):
```
admin           (admin pages exist but use auth/me path — most admin endpoints not called)
admin_monitoring
agronomy        (existed for nutrition lookups — TIS-internal?)
alerts
apiculture
attribution     (called from auth pages? confirm)
automation_rules
customers
decision_engine    ← cluster #110-116 has NO frontend consumer
delivery
equipment
exports
field_events    (1 hit possibly via FieldEventNew.jsx, but uses /events — confirm)
financials
income
input_transactions
inputs
kb              (kb_articles router)
labor
livestock
marketplace
me              (router, separate from auth/me path)
nursery
order_line_items
orders
poultry_*       (3 routers — but UI hits /api/v1/poultry/dashboard etc. via different naming)
price_master
profit_share
reports
rotation        (rotation-check called from cycles? confirm)
subscriptions
suppliers
verify          (server-side rendering, not frontend-callable in browser context)
voice
weather
webhooks        (Stripe + WhatsApp callbacks, not browser-callable)
workers
zones
```

→ **Phase 5 finding: ~30 backend routers have zero or ambiguous frontend consumers.** This means either:
- (a) Backend ahead of frontend: features built/tested but UI not yet wired
- (b) Internal-use endpoints (e.g., webhooks, admin-only paths called via different mechanism)
- (c) Dead routes from earlier sprints

**The Decision Engine cluster #110-116 fits category (a).** 7 strikes shipped a working backend, but `/farm/decision-engine` doesn't exist in the route registry. The data is generated, the snapshots are in DB, but no UI surfaces them. Currently visible only via psql or future TIS conversation context (system_prompt.md line: `Farm health: {DECISION_ENGINE_SCORE}/10`).

→ Phase 10 strike candidate (#126?): wire Decision Engine signals to a `/farm/health` or `/farm/signals` route.

---

## 5.18 TIS / Voice surface

### TIS components (5+ files)

```
components/tis/TisFab.jsx           1.6 KB   — Floating Action Button (FAB)
components/tis/TisModal.jsx        10.7 KB   — Modal chat
components/tis/TisChatPanel.jsx     9.3 KB   — Chat panel
components/TISWidget.jsx            8.5 KB   — Standalone widget (duplicate?)
pages/farmer/TIS.jsx                ?        — TIS page
pages/farmer/TIS.jsx.bak.1776147001 ?        — backup with timestamp suffix (different naming pattern)
hooks/useTisSse.js                  ?        — SSE stream hook
```

### Voice components

```
components/onboarding/VoiceInput.jsx  12.1 KB
utils/speech.js                       201 lines
```

The Voice surface is concentrated in onboarding (`VoiceInput`). The promised "Solo Mode reads aloud" UX would presumably use `speech.js` (Web Speech API) — but the Solo route is dormant.

→ Phase 8 (integrations): verify TIS streaming via SSE (not WebSocket); verify Voice TTS pipeline if Solo activates.

---

## 5.19 Solo mode

```
layouts/SoloShell.jsx           96 lines   — minimal shell (one task, three buttons)
pages/solo/SoloTaskCard.jsx     ? lines    — the SoloTaskCard
context/LauncherContext.jsx     ? lines    — likely informs both shells
components/farm/ModeDropdown.jsx 2.7 KB    — manual mode switch (dev tool? — brief says modes computed)
```

**Solo UI surface exists but is unreachable in production.** Phase 3.24: all 3 tenants are mode=GROWTH. Phase 4 finding YY: `tenants.mode` column never updated; `/auth/me` derives mode at request-time defaulting to GROWTH.

→ Phase 4 + Phase 5 cross-cutting: Solo mode is plumbed end-to-end (UI shell + page + context + DB column + middleware) but never activates because the activation criteria don't fire. Brief: "Three derived modes (computed, never user-toggled)" — but `ModeDropdown.jsx` exists, suggesting a manual override existed at one point.

---

## Cross-cutting findings (Phase 5)

| # | Finding | Severity | → Phase |
|---|---------|---|---|
| WWW | ~30 backend routers have NO frontend consumer (60% of endpoints unreached) | High | 4 + 10 |
| XXX | Decision Engine cluster #110-116 has NO frontend consumer — operational artifact only | High | 10 strike candidate (Strike #126?) |
| YYY | 30+ .bak files in frontend; App.jsx alone has 8, LogSheet.jsx has 10+; 250 KB tar-pit | Med (cleanup) | 10 (Strike #124 candidate already covers events_registry; expand to App.jsx + LogSheet.jsx) |
| ZZZ | Sacred file inventory per CLAUDE.md doesn't exist — no "sacred" mention; brief assumes a list that isn't authored | Med | 10 (define + populate) |
| AAAA | `@reduxjs/toolkit` + `redux` + `react-redux` + `immer` + `reselect` installed (~7 MB) but ZERO imports in src/ — unused deps | Med | 7 (dep cleanup strike) |
| BBBB | 27 POULTRY routes (vertical-deep) but 0 CROPS event-form routes; CROPS uses polymorphic FieldEventNew.jsx — asymmetric vertical investment | Informational | 10 |
| CCCC | Solo mode UI plumbed end-to-end but unreachable (Phase 3.24 + Phase 4 YY) | Med | 4 (already routed) |
| DDDD | TIS surface duplicated: `tis/{TisFab, TisModal, TisChatPanel}` + standalone `TISWidget.jsx` | Med | 5 follow-up |
| **EEEE** | **`VITE_TIS_BRIDGE_TOKEN=511fc887...` in frontend `.env.production` — embedded in public bundle if the var name starts with VITE_** | **CRITICAL** | **9 (verify whether actually a secret)** |
| FFFF | Admin chunk via React.lazy never sent to farmer browsers — security positive | (positive) | 9 |
| GGGG | Clean state management — @tanstack/react-query + 4 Context, no Redux usage | (positive) | (informational) |
| HHHH | TIS.jsx.bak.1776147001 — timestamp-suffix .bak naming, different pattern from `.bak-pre-*` | Med | 10 |
| IIII | `components/farmer/FarmerLayout.jsx` (11.7 KB) is separate from `layouts/FarmerShell.jsx` (375 lines) — likely legacy, confirm | Low | 5 follow-up |
| JJJJ | `ModeDropdown.jsx` exists despite brief saying modes are "computed, never user-toggled" — manual override surface for dev/test? | Low | 4 |
| KKKK | 16 ComingSoon stub routes (placeholder UX for phase 4.2/4.3/5.5/6/6.5/8) — clean placeholder pattern | (positive) | 10 (track in roadmap) |

---

## Strike candidates surfaced or extended by Phase 5

- **#124 (already candidate, expand scope):** events_registry.bak cleanup → expand to include 30+ frontend .bak files (App.jsx, LogSheet.jsx, etc.). Single git rm operation, one doc-sync.
- **#126 (NEW from XXX):** Wire Decision Engine signals to a frontend route (`/farm/health` or `/farm/signals`). Cluster #110-116 produced the data; expose it. ~2-3 hour strike (router + page + chart component).
- **#127 (NEW from EEEE):** If `VITE_TIS_BRIDGE_TOKEN` is genuinely a secret, move from frontend `.env.production` to backend env. Otherwise, rename to `VITE_TIS_PUBLIC_KEY` to make non-secret nature explicit. ~30 min if it's already non-secret; ~2 hour rebuild if it needs server-side migration.
- **#128 (NEW from AAAA):** Remove unused Redux ecosystem from frontend deps. ~10 min strike (`npm uninstall @reduxjs/toolkit redux react-redux redux-thunk reselect immer` — but immer is also pulled in by other deps, so confirm transitive needs first).

---

## Handoffs

- **Phase 6 (infrastructure):** verify Caddy serves the frontend bundle; confirm Vite production build is what's served; confirm the `.env.production` is read at build time only (not runtime).
- **Phase 7 (deps):** Redux ecosystem cleanup (#128); confirm `@tanstack/react-query` v5.100.1 vs CVE database; lucide-react at 29 MB is largest single node_module — confirm version + need.
- **Phase 8 (integrations):** TIS surface duplication (DDDD); verify `VITE_TIS_BRIDGE_TOKEN` consumer (#127 hinges on this); confirm SSE stream wiring for `useTisSse.js`.
- **Phase 9 (security):** **frontend `.env.production` token leak (EEEE) is the highest-priority Phase 5 finding** alongside the React.lazy admin-chunk security guarantee (FFFF positive).
- **Phase 10 (synthesis):** strikes #124/#126/#127/#128; Sacred file list authoring; Decision Engine UI binding; vertical investment rebalancing (BBBB) for the 90-day sequence.

---

**Phase 5 complete.** No mutations. File written 2026-05-08 09:00 UTC.
