# TFOS Equipment Page — Redesign Wireframe & Spec (2026-06-26)

Redesign of `/farm/equipment` (Equipment.jsx, Resources › Equipment tab) after the approved
audit (EQ1–EQ40, EQ-BUG).

## Headline decisions
1. **Stop printing a UUID** (EQ1) and **stop false-emptying on error** (EQ2): reads via
   `utils/api` (token refresh + humanized errors), error card + Retry, degraded banner on cache.
2. **Honest "depreciation"** (EQ3/EQ25): nothing auto-depreciates — relabel "Total depreciation"
   → **"Value written down (book)"** with a note that it reflects the book value *you set*, and
   cost/hour is labelled **operating cost/hour (fuel + maintenance, excl. depreciation)**. The real
   depreciation schedule + depreciation-in-cost/hour is filed (backend).
3. **Retired ≠ Down** (EQ14): DECOMMISSIONED gets its own `retired` status — excluded from the
   "Down / needs attention" count, from Service-due, and from fleet **book value**; shown as its
   own filter + muted card. A sold/scrapped asset no longer inflates the balance sheet.
4. **Replace `window.prompt`** for parts on-hand with a real adjust modal (EQ11).
5. **Pick condition on resolve** (EQ13): "Mark resolved" no longer force-sets GOOD — a tiny
   modal lets you choose EXCELLENT/GOOD/FAIR.
6. **Platform parity:** shared `<Modal>` (Esc/focus/role, EQ8) across all dialogs; tabs are
   buttons w/ arrow-key nav (EQ7); Fiji time (EQ6); view-aware **Ask AI** (EQ9); `formatMoney`
   for book value (EQ10); submit-locks on writes; cycle dropdown disambiguated (EQ15); the 60-word
   "shared across your farm" wall becomes a **dismissible one-time hint** (EQ31); redundant `<h1>`
   dropped (EQ16); "showing latest 200" note when usage/maint hit the cap (EQ22).

## Visual wireframe (Resources › Equipment tab)
```
[no second h1 — tab labels it]                         [🌱 Farm ▾][✨ Ask AI][＋ Add equipment]
Crops + animals · N assets · X down
[ Fleet | Maintenance | Usage | Costs | Parts ]  ← role=tab buttons, arrow-key nav
⟦ equipQ error + no cache → "Couldn't load your fleet · Retry" ⟧  ⟦ + cache → degraded banner ⟧
── FLEET ───────────────────────────────────────────────────────────────────
 ⓘ (dismissible once) Machines & tools serve every enterprise — log each once, work it across all.
 [ Total assets ][ Book value (formatMoney) ][ Service due ][ Down / at-risk ]   ← no UUID sub (EQ1)
 Type:[All][Tractor]…   Status:[All][OK][Due soon][Overdue][Down][Retired]   🔎 search
 GRID of EquipCard: name · type · status pill · cost/hr (operating) · book value
   · [Maintenance] [Report fault | Mark resolved(→pick condition)]
   · retired → muted "RETIRED" card, action = Maintenance only
── MAINTENANCE ── due/overdue board + log table (latest 200 note) ──────────────
── USAGE ──────── hours/fuel tiles + by-cycle (disambiguated) + table (latest 200 note)
── COSTS ──────── operating cost/hour bars + "Value written down (book)" table (honest header)
── PARTS ──────── spares; on-hand edited via Adjust modal (not window.prompt)
```

## Fixes shipped (frontend)
- **EQ1** drop the `{farmId}` UUID sub. **EQ2/EQ5** api.js + error card/Retry + degraded banner.
- **EQ3/EQ25** honest labels: "operating cost/hour (excl. depreciation)" + "Value written down (book)" + note.
- **EQ14** `retired` status split out (excluded from down/service/book value; own filter + muted card).
- **EQ11** Parts adjust modal. **EQ13** resolve-with-condition modal.
- **EQ6** Fiji `todayISO`/`plusDaysISO`. **EQ7** tab buttons + arrow keys. **EQ8** shared `<Modal>`.
- **EQ9** view-aware Ask AI. **EQ10** book value via `formatMoney`. **EQ15** cycle label disambig.
- **EQ16** drop `<h1>`. **EQ31** dismissible hint. **EQ22** "latest 200" note. Submit-locks on writes.

## Filed (backend / cross-page — honest, NOT faked)
- **EQ4 — post fuel + maintenance spend to `cash_ledger`** so Cash + Bank Evidence see real
  equipment outflow (the keystone; today it leaks out of the ledger).
- **EQ25** real depreciation schedule (useful-life) + depreciation folded into cost/hour.
- **EQ26/EQ19** consume spare parts on repair (deduct on-hand; end the double-count).
- **EQ27** equipment as profit centre — rental income out / hire cost in.
- **EQ28** implements/attachments (parent/child assets). **EQ12** km unit on create + km usage field
  (EquipmentCreate has no `hours_unit`). **EQ29** sprayer calibration log (+ SPRAYER type). **EQ30**
  equipment hygiene/biosecurity log. **EQ33** fixed-asset subledger (disposal gain/loss, accum depr).
- **EQ35** current location/holder. **EQ36** downtime → blocked cycles/tasks. **EQ37** pre-use
  inspection log. **EQ38** utilization / ROA per asset. **EQ39** tax-depreciation export. **EQ40**
  fuel-concession report. **EQ22** real pagination beyond 200. QueryClient/CurrentFarm lift (B31).
```
