# TFOS Labour Page — Redesign Wireframe & Spec (2026-06-26)

Redesign of `/farm/labor` (Labor.jsx, rendered as the Resources "Labour" tab) after the
approved audit (L1–L32, L-BUG1).

## Headline decisions
1. **Kill the landmine + the fake.** Remove undefined `onSiteIds` (L-BUG1) and the fabricated
   "Next payday: Fri" tile (L2). Nothing on this surface implies data we don't have.
2. **Honest pay numbers.** "Wages (season)" was actually all-time (L16) → relabel to **"Wages
   (logged)"** and make the *actionable* number **"this week"**. Pay-wages now defaults to
   **this week's logged wages**, not the all-time total — removing the overpay anchor (L24).
   True owed-vs-paid settlement needs a payroll-period model → **filed** (L3/L21/L22 keystone).
3. **One primary verb per card** (L20). Today cards lead with **Check in/out (GPS)**; Pay is
   secondary; the dead-context "Assign task" button is **removed** (L18) until Tasks accepts a
   worker. Worker name/avatar opens the detail drawer.
4. **Min-wage guard** (L30). Effective hourly = day-rate ÷ 8; a soft amber warning fires under
   the rate input wherever a paid rate is set (Add/Edit/Mark) when it falls below FJD 4.00/hr.
   Warn, don't block (contracts/piece-rates vary; family = N/A).
5. **Platform parity.** Route through `utils/api` (token refresh + humanized errors, L4); Fiji
   "today" (L5); lucide-only, no emoji in toasts (L8); tabs + name are real buttons (L9);
   page-level **Ask AI** (L10); cached-on-error never shows a false "no workers" (L1).

## Visual wireframe (Resources › Labour tab)
```
[no second "Labor" h1 — the tab labels it]        [🌱 Farm ▾][✨ Ask AI][＋ Mark][＋ Add worker]  ← L7,L10
Who works the farm · hours, attendance, wages
[ Today | People | Timesheets | Payroll | Tasks | Costing | Training | Productivity ]  ← role=tab buttons (L9)
⟦ workersQ error + no cache → "Couldn't load your team · Retry" (not false-empty, L1) ⟧
⟦ workersQ error + cache    → amber "couldn't refresh — showing saved" banner ⟧

── TODAY ───────────────────────────────────────────────────────────────────
[ On-site now ][ Hours today ][ Wages this week ][ Team (n family) ]   ← 4 honest tiles (payday tile gone, L2)
TEAM
 ┌ Avatar  Name (→detail)   [Permanent]            ● On-site ┐
 │ Checked in 7:42a · on the farm (GPS)                       │   ← GPS = proof of attendance (L25 copy)
 │ Hours this week 18h · Day rate $30/d · Wages this week $X  │
 │ [ Check out ]                       [ Pay wages ]          │   ← 1 primary + (paid only) pay; no Assign (L18,L20)
 └────────────────────────────────────────────────────────────┘
 Family helpers · n tracked, unpaid          [□ Show family]

── PAYROLL ─────────────────────────────────────────────────────────────────
 ⓘ Wages logged from attendance. "Pay wages" records a labour expense in Cash (Bank Evidence).
   Suggested amount = this week's logged wages. Owed-vs-paid settlement is on the roadmap.   ← honest (L3)
 Name · 18h this week · $30/d                    $X this week   [ Pay wages ]
 (amount defaults to THIS WEEK, not all-time — L24)

── COSTING · TRAINING · PRODUCTIVITY ── honest "Building" cards (unchanged; need attribution)
```

## Fixes shipped (frontend)
- **L-BUG1** remove undefined `onSiteIds`; `onSiteNow = on_site_count ?? 0`.
- **L1** cached-on-error: error card + Retry when no cache, degraded banner when cache exists.
- **L2** delete fabricated "Next payday" tile.
- **L4** all GETs via `getJSON`, all writes via `send` (token refresh + `e.userMessage`).
- **L5** `todayISO()` in `Pacific/Fiji`.
- **L7** drop redundant `<h1>`; spelling unified to **"Labour"**.
- **L8** toasts use words, not `✓`/`⚠`.
- **L9** view tabs + worker name are `<button>` (keyboard/a11y).
- **L10** page-level **Ask AI** (`/tis?q=`).
- **L16** "Wages (season)" → "Wages (logged)"; weekly number is the actionable one.
- **L18/L20** one primary action per card; remove dead "Assign task"; Pay demoted.
- **L24** Pay defaults to **this week's logged wages**.
- **L25** GPS framed as worker-protective proof of attendance.
- **L30** min-wage soft warning (day-rate ÷ 8 < FJD 4.00/hr) on Add/Edit/Mark.

## Filed (backend / cross-page — honest, NOT faked)
- **Payroll-period + settlement model** (owed-vs-paid), with `worker_id` FK on wage payments —
  the keystone for L3/L16/L21/L22/L26. Until then Payroll shows *logged* wages, labelled honestly.
- **Single labour-cost source of truth** — reconcile `labor.total_pay_fjd` accrual vs `cash-ledger`
  LABOR expense so Analytics and Bank Evidence agree (L29 / double-count).
- **Piece-rate / task-rate pay** model (L17) — dominant commercial harvest model.
- **Worker re-entry-interval (REI) safety gate** on clock-in to a recently-sprayed block (L19).
- **Statutory fields**: DOB (under-age flag), FNPF tracking, contract terms, leave (L31); GPS
  consent/notice (L32); worker deactivate UI + backend (L11).
- `/labor` server `limit` + pagination (L14); manual presence feeding on-site for GPS-less farms
  (L28); Tasks accepting a worker context so "Assign" can return (L18); QueryClient lift (L15/B31).
```
