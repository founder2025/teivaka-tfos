# TFOS Cash Page — Redesign Wireframe & Spec (2026-06-26)

Redesign of the Cash tab (`CashLedger.jsx`) after the audit (CA-BUG, CA1–CA27). Strong audit
bones (whole-ledger balance, hash-chain, server 48h lock); this pass fixes the **breakage +
money correctness** that's safe from the frontend, and files the accrual model.

## Headline decisions
1. **Unbreak the load (CA-BUG):** request `limit=200` (backend cap), not 500 → no more 422 →
   no more false $0.
2. **Money correctness that's frontend-safe:**
   - **NWC double-count fixed (CA17):** the balance already treats credit purchases as cash-out,
     so `NWC = balance + receivables` (adding-back-then-subtracting payables cancels). Payables
     becomes an **informational** "Credit purchases" tile with an honest note. The proper fix —
     credit = a payable, not a cash-out — is **filed** (backend accrual).
   - **Sign by inflow set (CA18):** `isInflow = type ∈ {INCOME,LOAN,GRANT,TRANSFER}` (matches the
     backend balance SQL) so any non-INCOME inflow row renders + signs correctly (was mislabelled "Out").
   - **Rails reconcile (CA19):** rail split now includes an **Other/credit** segment so M-PAiSA +
     cash + bank + other = the page balance.
   - **Honest scope note (CA1):** when the ledger hits the 200 cap, a note says "breakdown covers
     your latest 200 entries; balance is all-time" (server-side aggregates filed).
3. **Platform + safety:** api.js + cached-on-error/Retry (CA2/CA3); `formatMoney` (CA5); Fiji time
   (CA4); shared a11y `<Modal>` (CA8) + arrow-key tabs (CA7); lucide `Lock` not 🔒 (CA6); drop
   redundant `<h1>` (CA9); view-aware **Ask AI** (CA10); **submit-lock on the money write** (CA20).

## Visual wireframe (Cash tab)
```
[no h1]                                   [🌱 Farm ▾] [✨ Ask AI] [＋ Cash in] [＋ Expense]
Live balance across every business · crops + animals
[ Balance ][ This week net ][ Receivables ][ Credit purchases* ][ Net working capital ]
⟦ cash error + no cache → "Couldn't load your cash · Retry" ⟧  ⟦ + cache → degraded banner ⟧
[ Overview | Ledger | Categories | Forecast | Reconcile | Bank Evidence ]  role=tab buttons
── OVERVIEW ──
 ┌ Balance (hero)  FJD … · N entries
 │ M-PAiSA · Cash · Bank · Other/credit   ← rails now sum to balance (CA19)
 └ (if 200-cap) "breakdown covers latest 200; balance is all-time" (CA1)
 Receivables → Buyers · Credit purchases (info) · NWC = balance + receivables (CA17)
 Recent cash events: dir·cat·rail·date · ±amount · hash-chained · Edit/Delete (≤48h) / Lock (>48h)
── LEDGER ── window/dir/category/rail filters + search · in/out/net tiles · cards
── CATEGORIES ── income/expense by category bars
── FORECAST / RECONCILE ── honest "Building"
── BANK EVIDENCE ── → /farm/reports
```

## Fixes shipped (frontend)
- **CA-BUG** limit 200. **CA2/CA3** api.js + error/Retry + degraded. **CA5** formatMoney. **CA4** Fiji.
- **CA17** NWC = balance + receivables (no double-count); payables → info tile + note.
- **CA18** inflow-set sign helper (correct display/sign for all types). **CA19** Other/credit rail.
- **CA1** 200-cap honesty note. **CA6** lucide Lock. **CA7** tab buttons + arrows. **CA8** shared Modal.
- **CA9** drop h1. **CA10** view-aware Ask AI. **CA20** submit-lock. **CA23** balance not triple-shown.

## Filed (backend / product — honest, NOT faked)
- **CA-BUG-server**/CA1: raise list limit or add server-side rail/category/period **aggregates** so
  the breakdown is whole-ledger, not page-bound; real pagination.
- **CA17 (accrual):** credit purchase = a **payable**, not a cash-out — don't reduce the cash
  balance until settled; proper AP with aging.
- **CA18:** expose **TRANSFER** (rail-to-rail / M-PAiSA cash-out, two-rail) + LOAN/GRANT/REPAYMENT
  types in the form (pending category-CHECK verification).
- **CA24:** correcting-entry path (reverse + re-enter, both chained) so the 48h lock can't entrench errors.
- **CA15** statement reconcile · **CA14** ledger export (CSV/PDF) · **CA21** profit/P&L per cycle ·
  **CA22** cost-per-cycle/kg · **CA25** created_by/petty-cash · **CA26** consolidated balance sheet ·
  **CA27** tax/VAT mapping. QueryClient/CurrentFarm lift (CA11).
```
