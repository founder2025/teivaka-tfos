# TFOS Production Page — Redesign Wireframe & Spec (2026-06-26)

Redesign of `/farm/cycles` (CycleList) + `/farm/cycles/:id` (CycleDetail) after the
approved audit (P1–P8, PD-A–PD-H). Safety-first, honest, live.

## Headline decision — PD-A: the WHD check FAILS CLOSED
The harvest-withholding hold-dot must NEVER show green when the compliance data didn't
load. Three states: **red = on hold**, **green = verified clear**, **grey "?" = couldn't
verify** (compliance query errored) — with a banner. Same in CycleDetail's compliance
panel: a load failure shows "Couldn't verify withholding — do not harvest," not "Clear."

## Visual wireframe — CycleList
```
┌────────────────────────────────────────────────────────────────────────┐
│ Production                                [🌱 Farm ▾]      [＋ New cycle] │
│ What you're growing right now                                            │
│ ⟦ NurseryRegister (live) ⟧                                              │
│ ⟦ amber note if harvest-safety check couldn't load (PD-A) ⟧             │
│ [Active 6] [Expected 1,200kg] [Harvested 300kg] [Value FJD 4.1k] [Crops 4]│ ← responsive (auto-fit), not forced 5-col (PD-C); active-scoped (PD-E)
│ ── By type (active) ─────────────────────────────────────────────────── │
│ Tomato  2 units · 400kg expected …                                      │
│ ── Status: [Active 6] [Closed 12] [Failed 1] [All 19] ────────────────── │ ← PD-B: closed/failed now reachable
│ ── Production units ──────────────────────────────────────────────────── │
│ ┌Block A · Tomato  🟢┐ ┌Block B · Cassava 🔴┐ ┌Block C · Bok choy ⚪?┐  │ ← 🟢 verified clear · 🔴 on hold · ⚪? can't verify (fail-closed)
│ │ active · 60% through │ │ on hold — WHD     │ │ active                │  │   cards keyboard-operable (P2)
│ └─────────────────────┘ └───────────────────┘ └──────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

## Visual wireframe — CycleDetail
```
Crops › Cycles › Tomato · Block A          (single breadcrumb, no dupe — PD-H)
Tomato · Block A          [STATUS] [Layer]
[← Back] [+ Log event] [View tasks] [✨ Ask AI] [Mark active/Start harvest/…]
Cycle progress (real lifecycle)
┌ Financial (FJD via formatMoney — P3) ┐ ┌ Chemical compliance ┐
│ earned · CoKG · yield bar            │ │ red hold / green clear / "Couldn't verify" (PD-A) │
┌ Buyer commitments (honest-empty)     ┐ ┌ Rotation context (real)            ┐
┌ Activity feed (real)                 ┐ ┌ Tasks: Pending = real count (P1 fix) ┐
```

## Fixes
- **PD-A** WHD fails closed (red/green/grey-? + banner) in list & detail.
- **P1** CycleDetail reads `data.tasks` (not `data`) → "Pending (open)" shows the real count.
- **P2** unit cards: role=button + tabIndex + Enter/Space.
- **P3** CycleDetail money via `formatMoney` (FJD), not `$`.
- **P-T1** both surfaces route through `utils/api` (token refresh + honest errors).
- **P5/PD-E** KPIs active-scoped & honestly labelled ("to date"); expected & harvested both from active cycles.
- **PD-B** status filter (Active / Closed / Failed / All) — closed/failed reachable.
- **PD-C** KPI strip responsive (`auto-fit minmax`), not forced 5-col.
- **PD-F** "Day -N" → "Not yet planted"; ">100%" → "Past expected harvest".
- **P4** no-op `||"Crop"||"Crop"` removed. **PD-H** single breadcrumb.
- **P6** CycleList → react-query (caching + `refetchOnReconnect`); CycleDetail routed through api.js.
- **AI** "Ask AI about this cycle" (`/tis?q=`). a11y: reduced-motion, aria.

## Filed (backend / cross-page — honest)
- Tasks page to honor `?cycle=` (P7); per-cycle buyer commitments (order↔cycle link);
  agronomic BBCH stage; rotation disease-risk warning; CycleDetail → react-query;
  composite/shared QueryClient; certifications; weather/GDD-aware progress.
- **Not changed (already correct):** create-flow enforces layer-at-creation (Strike #104a);
  NurseryRegister is live + honest.
