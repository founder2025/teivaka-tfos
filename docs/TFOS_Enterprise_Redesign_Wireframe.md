# TFOS Enterprise Page — Redesign Wireframe & Spec (2026-06-26)

Redesign of `/farm/enterprises` (Enterprises.jsx) after the approved audit (E1–E10, EX1–EX10).
Layer-first, honest, focused. Real data or watermarked-Sample/honest-empty only.

## Headline decisions
- **EX1 — surface the 3-Layer doctrine** (CASH_FLOW / FOOD_SECURITY / LONG_TERM_ASSET): a
  3-axis summary strip + a layer badge on every enterprise + a layer filter. Layer is read
  per crop from `/cycles` (`production_id → layer`). Animals/verticals = "Unclassified" honestly.
- **EX3 — the enterprise has no entity** → REMOVE the dead Pause/Close/Worth actions (don't fake
  entity ops); file "real enterprise entity" as a backend slice.
- **EX2 — kill the hardcoded "Open tasks: 0"** (tasks aren't enterprise-scoped) → drop the tile.
- **E2/EX4/EX5 — drop the black-box "/100"** → honest standing labels (Profitable / Building /
  Losing for crops; "{n}% survival" for animals); no invalid mixed portfolio average.
- **E4 — collapse the 13-tab detail to the 4 real tabs** (Dashboard · Production/Herd · Finance ·
  Records) + one honest "more coming" line.
- **E9/EX8 — 5 view tabs → 3** (Portfolio · Money · Outlook); drop the redundant strip.

## Visual wireframe
```
┌────────────────────────────────────────────────────────────────────────┐
│ Enterprises                              [🌱 Farm ▾]        [＋ Add]      │
│ Your farm as a portfolio of businesses                                   │
│ [ Portfolio ] [ Money ] [ Outlook ]                                      │ ← 5→3 tabs
├── PORTFOLIO ────────────────────────────────────────────────────────────┤
│ [ Enterprises 6 ] [ Net to date +FJD 1.2k ] [ Profitable 3 · Losing 1 ] │ ← honest KPIs (no fake /100)
│ ┌── By layer (the 3-axis credit view) ─────────────────────────────────┐│ ← EX1: the doctrine, surfaced
│ │ Cash flow  3 · +FJD 900 │ Food security 2 · +FJD 200 │ Long-term 1 · — ││
│ └──────────────────────────────────────────────────────────────────────┘│
│ Quick answers: Best ▸ Tomato · Watch ▸ Cucumber (sold at a loss) · Grow ▸…│ ← 4 real answers (no 30/60/90 filler; loss = sold-at-loss only, EX6)
│ [Type ▾] [Layer ▾] [Standing ▾]  🔎 search                                │
│ Plant-based                                                              │
│   Vegetables (2)  ┌Tomato  [Cash flow]┐ ┌Cucumber [Food sec]┐            │ ← layer BADGE per card; no Pause/Close
│   Root crops (1)  ┌Cassava [Long-term]┐                                  │
│ Animal-based                                                             │
│   Poultry (1)     ┌Layer hens · 91 head · 91% survival┐                  │ ← survival stated, not a /100
├── MONEY ────────────────────────────────────────────────────────────────┤
│ [Put in] [Net] [ROI] [Worth —(filed)]                                    │
│ Profitability table (earned/spent/net/ROI) · Resource allocation (cost%) │ ← merge of old Rankings+Cash+Investor
│ Alerts: only enterprises that SOLD at a loss (income>0 && net<0)         │ ← EX6 (no mid-cycle false alarms)
├── OUTLOOK ──────────────────────────────────────────────────────────────┤
│ Honest: forecasts off until a logged season · expansion needs limits ·   │
│ dependencies (manure→crops) · lifecycle                                  │
└──────────────────────────────────────────────────────────────────────────┘

DETAIL (open an enterprise): Dashboard · Production/Herd · Finance · Records
  Dashboard KPIs: Standing(label) · Net/Head · Cycles/Groups · LAYER  (no fake Open-tasks)
  + muted line: "Health, inputs, labour, assets, forecasts & reports are on the way."

EMPTY farm → watermarked "Example" preview (kept — gold-standard honesty).
```

## Data / decisions
- Route via `utils/api` (token refresh + honest errors); ErrorState copy de-jargoned (E1).
- +1 query `/cycles?limit=200` → `production_id → layer` map (EX1); filed: composite/lighter layer source.
- Standing: `cropGrade(income,net)` → Profitable / Losing / Building; animals → survival%.
- "Net to date" (not "this season" — honest, E7).
- Fix no-op `pu_farmer_label || "Block" || "—"` (E6). retry:1 + refetchOnReconnect (E8). Drop ModeDropdown (B90).
- a11y: role=tablist/tab on the view + detail tabs; keyboard cards retained.

## Filed (backend/cross-page — honest, not faked)
- Real **enterprise entity** (enterprise_id table) → working Pause/Close, valuation/Worth, per-
  enterprise roles (EX3/E3).
- **Animal financials** (income/net/ROI for livestock/poultry — EX-E5).
- Per-enterprise **open-task count** (tasks aren't enterprise-scoped yet — EX2).
- **Per-block P&L** grain (enterprise = crop-type today, not field — commercial ask).
- Layer for animals/verticals; composite endpoint + shared QueryClient (E8); cycle-scoping (E10);
  grounded standing via decision signals/KB (replace heuristic); certifications (gov).
