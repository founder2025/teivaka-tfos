# TFOS Buyers & Sales Page — Redesign Wireframe & Spec (2026-06-26)

Redesign of the "Buyers & sales" tab (`Buyers.jsx`, in `Market.jsx`) after the approved
audit (B1–B32).

## Headline decisions
1. **Fix the money footgun (B1/B30 — the #1 fix).** Marking an order PAID from the status
   dropdown wrote no income. Now **PAID is reachable ONLY via "Log payment"** (which writes the
   cash_ledger income + Bank Evidence). The status control is **forward-workflow only**
   (PENDING→CONFIRMED→PICKING→DISPATCHED→DELIVERED→INVOICED); **PAID/CANCELLED removed from the
   casual select**; Cancel is a separate **confirmed** action. Owed orders lead with a primary
   **Log payment** button.
2. **Surface the daily job (B28):** a "to chase" banner on Directory (overdue total + count →
   Receivables); Receivables gets **AR aging buckets (0–30 / 31–60 / 60+) + avg days outstanding**.
3. **WhatsApp chase (B17):** overdue rows get **"Chase on WhatsApp"** — opens `wa.me` with a
   polite, prefilled reminder (the buyer's number is on file). No backend needed.
4. **Multi-line orders (B22):** New-order supports **multiple crop lines** (add/remove) — the
   backend already accepts `line_items[]`; the UI was capping it at one.
5. **Platform parity:** reads via `utils/api` + cached-on-error (B2/B4); `formatMoney` (B5);
   Fiji time (B6); shared a11y `<Modal>` (B8) + arrow-key tabs (B7); drop redundant `<h1>` (B9);
   view-aware **Ask AI** (B10); emoji→text (B11); responsive capital strips (B12); dispute
   resolve is a **modal** not `window.prompt` (B13); honest partial-payment note (B23); fixed
   the stale "no backend" docstring (B3); submit-locks on writes.

## Visual wireframe
```
[no h1]                                              [🌱 Farm ▾] [✨ Ask AI] [＋ Add buyer]
Crops + animals · who buys from you, what they owe, who to chase
⟦ if overdue: amber "FJD X owed across N orders — chase now →" (→ Receivables) ⟧   (B28)
[ Directory | Active orders | Receivables | Demand | Pipeline | Analytics ]  role=tab buttons
⟦ customers error + no cache → "Couldn't load buyers · Retry" ⟧  ⟦ + cache → degraded banner ⟧

DIRECTORY · [Active buyers][Receivables][Top buyer][Concentration]  → buyer cards (reliability)
ACTIVE ORDERS · row: buyer · date · value · [Log payment*] [status ▸ forward-only] [Cancel]
RECEIVABLES · [0–30][31–60][60+][Total owed · avg Xd]  → owed rows: [Chase on WhatsApp][Log payment]
ANALYTICS · top buyers + concentration risk
BUYER DETAIL · reliability breakdown · orders (Log payment primary; transport/cold-storage) ·
              comms · disputes (resolve modal) · WhatsApp chase
```

## Fixes shipped (frontend)
- **B1/B30** PAID only via Log payment; forward-only status; confirmed Cancel; Log-payment primary.
- **B2/B4** api.js + error card/Retry + degraded banner. **B5** formatMoney. **B6** Fiji time.
- **B7** tab buttons + arrow keys. **B8** shared `<Modal>`. **B9** drop `<h1>`. **B10** view-aware Ask AI.
- **B11** "Pinned" (no emoji). **B12** responsive strips. **B13** dispute-resolve modal.
- **B17** WhatsApp chase (wa.me prefilled). **B22** multi-line new order. **B23** honest partial-pay note.
- **B28** to-chase banner. **B29** AR aging buckets + avg days outstanding. **B3** fix docstring.

## Filed (backend — honest, NOT faked)
- **B1-server** `/status` should refuse PAID (force settlement via `/payment`) — server guard to match the UI.
- **B23** real partial-payment state (paid_amount; receivable = total − paid; status PARTIALLY_PAID).
- **B24** sale → harvest-stock deduction / oversell guard (sell ≤ available; IX1-class).
- **B27** provenance/traceability on sales (order line → harvest batch + WHD clearance) for export/supermarket/food-safety.
- **B16** invoice/receipt document (PDF) for the INVOICED status + FRCS/VAT.
- **B26** per-buyer credit limit (gate selling on terms to low-reliability buyers).
- **B15** animal sales (eggs/birds) through orders; **B31** today's deliveries / pick-list + assign transport;
  **B32** DSO/revenue-trend/repeat-rate; **B20** server pagination; **B21** QueryClient/CurrentFarm lift.
```
