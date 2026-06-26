# TFOS Farm Overview — Redesign Wireframe & Spec (2026-06-26)

Redesign of `/farm` (FarmDashboard.jsx) after the approved F1–F9 + M1–M28 audit.
Goal: **reduce cognitive load, improve decisions, stay honest, kill the plumbing leaks.**
Real data or honest-empty only. Flat icons (lucide) + theme tokens. No fabrication.

## Design principles
1. **One decision first.** The page opens by answering "what needs me right now?" in a
   single band — not a wall of 11 KPIs. Depth lives below the fold (progressive disclosure).
2. **Glance, then drill.** 4 glance tiles a farmer actually checks; everything else is
   owner/manager depth further down.
3. **Honest framing.** Real fetch time, single source of truth for money, health score
   that reflects reality (incl. flock survival + holds), alerts that don't cry wolf.
4. **Decision support, surfaced.** Approaching WHD clearances (already fetched, was
   discarded) now drive the "needs you" band and an agronomy hint.

## Visual wireframe (desktop ≥1024 / mobile reflow)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Good morning, Cody                              [🌱 Riverside ▾] [✨Ask AI] [＋Log]│
│ Updated 2:14 pm · 3 enterprises                                               │   ← real updatedAt (dataUpdatedAt), not render time (M1)
├────────────────────────────────────────────────────────────────────────────┤
│ ⟦ LayerBackfillBanner — only if cycles need a layer (Strike #104a) ⟧          │
├────────────────────────────────────────────────────────────────────────────┤
│ ┌── NEEDS YOU NOW ───────────────────────────────────────────────────────┐  │   ← THE one thing (cognitive load → 1 decision)
│ │ (ShieldAlert)  1 harvest on hold — chemical withholding not cleared      │  │   ← priority: holds > overdue task > today task
│ │                Clear it before you sell.            [ Review compliance ]│  │     > upcoming WHD clearance > all-clear
│ │                                                     +2 more need you →   │  │
│ └─────────────────────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────────────────┤
│ [ Cash on hand ]   [ Net · season ]   [ Tasks today ]   [ Things to watch ]   │   ← 4 glance tiles (was 11). Single net source = finSummary
│   FJ$ 4,120          +FJ$ 1,840          3 · 1 high        1 hold              │     (M4). Tap-through each.
├────────────────────────────────────────────────────────────────────────────┤
│ ┌── Farm health ────────────┐  ┌── Decide: best vs watch ──────────────────┐ │   ← health honest (flock survival + holds, M6),
│ │   ◍ 82  Strong            │  │ Best: Cassava   +FJ$ 2,300 net            │ │     copy reflects grade (F2). Decision pair.
│ │   "Keep it up — nothing   │  │ Watch: Eggplant  −FJ$ 410 (sold at a loss)│ │
│ │    on hold"               │  │ [ Open Decision Center → ]                │ │
│ └───────────────────────────┘  └───────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────┤
│ ┌── Enterprise portfolio ─────────────────────────────────[ Manage ]──────┐  │   ← tabs (All/Crops/Livestock/Poultry/…), disabled
│ │ [All 3][Crops 2][Poultry 1] ……                                           │  │     when empty (honest). Poultry card → /farm/poultry
│ │ ┌Cassava ──┐ ┌Eggplant ─┐ ┌Layers ───┐                                   │  │     (M5 fix). Flock cards show head/survival, not fake $.
│ │ │+2,300 net│ │ −410 net │ │420 birds │                                   │  │
│ │ └──────────┘ └──────────┘ └──────────┘                                   │  │
│ └─────────────────────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────────────────┤
│ ┌── Money snapshot ─────────┐  ┌── Recent field activity ──────[ History ]─┐ │   ← money from ONE source (finSummary). Activity
│ │ Rev 9,400 · Exp 7,560     │  │ ✓ Spray · Block A · 24 Jun                │ │     HONESTLY labelled "field activity" (crops-only
│ │ Net +1,840 · margin 19%   │  │ ✓ Planting · Block B · 23 Jun             │ │     today, M20) — no UUID author (M21).
│ │ Top rev Cassava·Top exp In│  │ …                                         │ │
│ └───────────────────────────┘  └───────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────┤
│ ⟦ OWNER DEPTH (only render if it has data) ⟧                                  │
│ [ Harvested kg ] [ Workforce ] [ Cost / kg ] [ Farms ]                        │   ← operations row (owner). Bounded queries.
│ ┌── Your farms (only if >1) ───────────────────────────────────────────────┐ │   ← multi-farm operational compare
│ └───────────────────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────┤
│ ┌── Active cycles (ACTIVE + HARVESTING) ────────────────[ ＋ New cycle ]───┐  │   ← inline from page data (kills dup /cycles fetch
│ │ Cycle 1 · Cassava · Block A · day 142 · ACTIVE                           │  │     M18); includes HARVESTING (M23); no "Crop||—"
│ │ …                                                                        │  │     no-op bug (M22).
│ └─────────────────────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────────────────┤
│ 🛡 Verification chain · INTACT — 1,204 records hash-chained   [Farm History] │   ← REAL /me/chain-status (never hardcoded)
└────────────────────────────────────────────────────────────────────────────┘

EMPTY (zero farms):   ┌ Welcome — create your first farm to begin [ Create farm ] ┐   (M2/M28)
LOADING:              skeleton blocks (no flash of "0/100 At risk", M3)
```

## "Needs you now" decision logic (priority order)
1. **WHD holds** (`compliance.blocked_count > 0`) — safety + can't sell. → Review compliance.
2. **Overdue high task** (`task.due_date < today`, lowest task_rank). → Open tasks.
3. **Due today** task. → Open tasks.
4. **Upcoming WHD clearance** (`compliance.upcoming_clearances[0]`) — "X clears in N days, then harvest". → Compliance. (agronomy/extension decision value, was discarded)
5. **All clear** → positive state + "Log activity" (opens the (+) launcher).

## Data / query plan (dedupe + bound)
| Resource | Key | Source of truth | Fix |
|---|---|---|---|
| farms | `["farms"]` | array | **shared key with FarmSelector → 1 fetch** (M18) |
| farm | `["farm",id]` | object | — |
| financials/farm | `["fin",id]` | `.summary` → **the only net/rev/exp source** | M4 |
| financials/crops | `["crops",id]` | array | per-enterprise nets only |
| flocks | `["flocks",id]` | `.items` | survival feeds health (M6) |
| cycles (ALL) | `["farm-cycles",id]` | `.cycles` | **inline active table → kills dup fetch** (M18/M23/M22) |
| tasks (OPEN) | `["tasks-open"]` | `.tasks` | tenant-wide — **farm-scope FILED** (M25) |
| cash balance | `["cash-bal",id]` | `.cash_balance_fjd` | — |
| compliance | `["compliance",id]` | `{blocked_count,active_blocks,upcoming_clearances}` | surface clearances |
| chain | `["chain-status"]` | object | real footer |
| me | `["me"]` | `.full_name` | greeting |
| labor | `["labor",id]` | array | owner ops; bound FILED |

Children still self-fetch: RecentLoggedStrip (`/field-events`), LayerBackfillBanner
(`/cycles/needing-classification`). Net ≈ 14 calls, **2 literal duplicates removed**.

## Fixed in this redesign
F1 dead code (−~340 lines) · F2 honest health copy · F4 alerts only when sold-at-loss ·
F5 drop in-page nav (sidebar owns it) · M1 real updatedAt · M2/M28 first-run hero ·
M3 loading skeleton · M4 single net source · M5 poultry routing · M6 flock-survival
health · M18 dedupe /cycles+/farms · M21 no UUID author · M22 no-op fallback ·
M23 include HARVESTING · M9 aria-labels on score rings · surface upcoming WHD clearances.

## Filed (backend / cross-page — NOT this slice, honest gaps)
- **Composite `GET /farm/overview/{id}`** read model (reads pre-computed signals — honours
  Inviolable #3 / M27; collapses ~14 calls → ~3). Keystone next slice.
- **`farm_id` on `GET /tasks`** (M25) — per-farm tasks/alerts; today tenant-wide (labelled).
- **Whole-farm activity feed** over `audit.events` (M20) — today crops-only, labelled.
- **Lift `CurrentFarmProvider` to FarmerShell** (M24/M25/B31) — cross-page selection + cache.
- Bound `cycles/crops/flocks/labor` server-side (M26).
