# TFOS Cash Page — Redesign Wireframe & Spec (v2, 2026-06-27)

Second redesign of the Cash tab (`CashLedger.jsx`). The first pass (2026-06-26, CA-BUG/CA1–CA27)
gave it strong bones (whole-ledger balance, hash-chain, server 48h lock, error states) — but the
re-audit found **CA-A: a missing `.data` unwrap made the page render $0 + an empty ledger for every
farm** (the Overview tile reads it correctly, so the bug hid on the page you'd open to check). This
pass fixes that showstopper and the structural defects the persona round surfaced.

Frontend-only (the API already accepts the anchor; `transaction_date` is intentionally immutable).

```
┌────────────────────────────────────────────────┐
│ Cash                          [Farm▾][Ask AI]    │
│ [+ Cash in] [+ Expense]                          │
├────────────────────────────────────────────────┤
│ Balance · Week net · Receivables · Credit · NWC  │ persistent capital strip (single source)
├────────────────────────────────────────────────┤
│ Overview · Ledger · Categories · Forecast ·      │ 6 tabs
│ Reconcile · Bank Evidence                        │
├────────────────────────────────────────────────┤
│ OVERVIEW   Balance {real} ← CA-A fixed (was $0)  │ balance hero + rail breakdown (UNIQUE)
│  M-PAiSA · Cash · Bank · Other · recent events   │ receivables/NWC NOT repeated here (de-dup)
├────────────────────────────────────────────────┤
│ LEDGER            [Export CSV (N)]               │ cashbook export (accountant/lender, CA14)
├────────────────────────────────────────────────┤
│ FORECAST  "Spend runway · before harvest income" │ honest reframe — projection is COSTS ONLY;
│  "trends below zero wk+N — counts costs only;    │ alarm names that harvest income (listed
│   your harvest income below isn't in it"         │ below) isn't in the line (no false panic)
├────────────────────────────────────────────────┤
│ BANK EVIDENCE  balance + in/out/net (window)     │ real view now (was a 1-button stub):
│  [Export cashbook CSV] [Open Bank Evidence pack] │ period summary + export + pack link
└────────────────────────────────────────────────┘

Entry form (Cash in / Expense / Edit):
  type · date · category · amount · method · description
  + "Attach to a business (optional)" → cycle picker → sends pu_id + production_id
  Edit: date + in/out type shown locked, with the honest "delete & re-add within 48h" note.
```

## Decisions (v2)
1. **CA-A hotfix (showstopper).** `getCash` now unwraps `?.data` → real `entries` + `cash_balance_fjd`. Every derived view comes alive with it. Writes always worked; only the read was broken — so farmers were logging cash and watching it "disappear."
2. **Entry-time enterprise anchor.** Optional cycle picker sends `pu_id`+`production_id` (API already supported it; the form never did) → per-enterprise P&L becomes possible at the data layer.
3. **Honest forecast.** Runway relabelled "Spend runway · before harvest income"; the below-zero alarm states it counts costs only and points at the upcoming-harvest list it excludes — a seasonal pre-harvest farm isn't falsely told it's going broke.
4. **Cashbook CSV export** on Ledger + Bank Evidence (CA14).
5. **Bank Evidence is a real view** (period balance/in/out/net + export + pack link; was one button).
6. **De-dup Overview** — receivables/credit/NWC live once in the capital strip; the duplicate strip is gone.
7. **Date immutability surfaced honestly** — edit explains date/type are locked (backdating protection); fix = delete-&-re-add within 48h.

## Deferred (named, backend/scope — staged, NOT faked)
- **CA-C server-side role gate** on PATCH/DELETE — gate is client-only + fail-open today; any tenant user can edit/delete cash via API within 48h. Staged (fail-closed auth needs the user-role shape verified first, not shipped blind).
- **Server-side aggregates + pagination** (CA1) so rails/categories/"All" reconcile to the all-time balance beyond 200 entries (today: honest cap note; the >200 rail mismatch remains).
- **Credit/payables accrual** (CA-D); **partial-payment-aware receivables** (CA-E); **correcting-entry** for locked rows; **per-cycle P&L report** consuming the new anchor (CA21/22); **tax-category mapping** (CA27); **TRANSFER/loan/grant**; **server category enum** (drift); statement import + saved reconciliation; **receipt-snap → cash** (the parked OCR work lands here); B31 provider lift; voice/i18n.

---

## (v1, 2026-06-26 — superseded by v2 above)
First pass fixed the 200-limit false-$0, switched to api.js getJSON/send, added error/degraded
states, Fiji time, formatMoney, the 48h Lock UI, a11y Modal + arrow tabs, honest caps. It also
introduced CA-A (the getJSON envelope wasn't unwrapped for cash, though orders was) — fixed in v2.
