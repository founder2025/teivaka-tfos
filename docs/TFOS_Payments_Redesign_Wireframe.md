# TFOS Payments Page — Redesign Wireframe & Spec (2026-06-26)

Redesign of Money › **Payments** (`Payments.jsx` + `routers/payments.py`) after the audit
(PA1–PA29). Backend money loop is genuinely good (idempotent, hash-chained, real server-enforced
PIN). The weak half is the frontend (raw fetch, native prompts, no submit-locks, instruction lost
in a toast) **plus three real backend correctness bugs** (PA1 wrong-farm, PA18 duplicate instruct,
PA24 UTC date). This pass fixes all frontend issues + bundles the three backend fixes (no migration
— columns already exist) and **files** the genuinely-bigger backend work honestly.

## Headline decisions
1. **Collapse instruct→confirm into ONE "Settle" flow (PA2/PA3/PA18, cognitive load).** The
   two-step "Generate instruction" then "Confirm paid" is gone. A row now has ONE primary action —
   **"Mark paid"** (COLLECT) / **"Mark received"** (RECEIVE) — that opens a **Settle modal**: it
   generates/loads the instruction under the hood, shows the **reference + instruction text
   persistently** (no more disappearing toast), lets you pick the method, capture the confirmation
   reference + note, and confirm. Two taps, instruction always visible.
2. **Fix PA1 wrong-farm booking (correctness):** the create form now **always sends the current
   farm_id** (from `useCurrentFarm`), and the row shows which farm it books to. Backend stops
   blind-guessing the "first farm" — if a payable has no farm and the tenant has >1 farm, confirm
   **refuses** ("link a farm first") instead of silently booking to the oldest. Single-farm
   tenants auto-resolve. No migration (column exists).
3. **Decisions surfaced (PA25):** due dates now drive the page — an **Overdue** total chip,
   overdue rows sorted first + flagged red, "due in N days" on each row.
4. **Platform + safety:** api.js wrapper that **preserves the 423 PIN-lock** AND stops swallowing
   errors (PA4/PA17); cached-on-error → ErrorCard+Retry / DegradedBanner (never false-empty);
   `formatMoney`; **Fiji** dates; shared a11y `<Modal>` replaces every `window.prompt/confirm`
   (PA9/PA12); lucide icons replace 🔒 (PA8); drop redundant `<h1>` (PA10); view-aware **Ask AI**
   (PA11); **submit-lock** on create/instruct/confirm (PA20); idempotent-confirm treated as success
   on retry (PA19); counterparty datalist from the existing master (PA21); per-method **default**
   toggle + method chooser at settle (PA26/PA28).

## Visual wireframe
```
GATE (when a PIN exists + locked) ─ lucide ShieldCheck, not 🔒
 ┌──────────────────────────────┐
 │  ⬡ Enter your PIN            │   • input · Unlock · "Forgot PIN?" → Modal (not window.prompt)
 └──────────────────────────────┘

PAYMENTS (unlocked)
[no h1]                              [🌱 Books to: Riverside ▾]  [✨ Ask AI]  [🔒 Lock]
You pay through your own M-PAiSA / bank / cash — Teivaka records it & makes it verifiable.
⟦ load error + no cache → "Couldn't load Payments · Retry" ⟧  ⟦ + cache → degraded banner ⟧
!! set-a-PIN nudge (only until a PIN exists) — lucide Lock

[ To pay  FJD … ][ Overdue  FJD … (red) ][ To receive  FJD … ]   ← Overdue is new (PA25)

[ Money I owe | Owed to me ]  role=tab buttons        [ Payment methods (n) ]

＋ Add: [amount] [category ▾] [who? (datalist of counterparties)] [due date]  [Add]   submit-locked
Suggested from your activity: FJD … · who · detail   [Add]      ← adopt (unchanged, real)

LIST (overdue first, then open, then settled)
 ┌ FJD 250 · INPUTS                          OPEN · due in 2 days        [ Mark paid ] [⋯]
 │ Joeli Hardware · Riverside Farm
 ├ FJD 400 · LABOUR                          OVERDUE 3 days (red)        [ Mark paid ] [⋯]
 └ FJD 120 · SALE                            SETTLED ✓ verifiable                       [receipt]

SETTLE MODAL (one flow — replaces Generate→Confirm)
 ┌ Mark paid · FJD 250 to Joeli Hardware ───────────────────────┐
 │ Pay from: ( My M-PAiSA ▾ )                                    │   ← method chooser (PA26)
 │ ╭ Instruction ─────────────────────────────────────────────╮ │
 │ │ Send FJD 250 to Joeli Hardware. Reference: PT-260626-AB12 │ │   ← persistent (PA2)
 │ ╰───────────────────────────────────────────────────────────╯ │
 │ Confirmation reference (from M-PAiSA / bank / receipt) [____] │
 │ Note (optional) [______________________________]             │
 │                          [ Cancel ]   [ Confirm paid → cash ] │   submit-locked
 └───────────────────────────────────────────────────────────────┘
   on confirm → one cash_ledger row + CASH_LOGGED audit → "Recorded · verifiable ✓"
```

## Fixes shipped (frontend — `Payments.jsx`)
- **PA2/PA3/PA18** one Settle modal (instruction persistent, no double-instruct, no client guessing).
- **PA4/PA17** api.js wrapper that keeps 423-lock semantics + surfaces errors (no silent empty).
- **PA1** create sends current `farm_id`; row shows the booking farm.
- **PA8** lucide icons (ShieldCheck/Lock/etc), zero emoji. **PA9/PA12** shared Modal for forgot-PIN,
  cancel, settle (no `window.prompt/confirm`). **PA10** drop `<h1>`. **PA11** Ask AI → `/tis?q=`.
- **PA19** confirm 409 "already confirmed" treated as success (retry-safe). **PA20** submit-locks.
- **PA21** counterparty `<datalist>` from `/counterparties`. **PA25** overdue chip + sort + flags.
- **PA26/PA28** method chooser at settle + per-method default toggle. **PA4** Fiji dates.

## Fixes bundled (backend — `routers/payments.py`, NO migration, columns exist) → STAGE
- **PA1:** `confirm_transaction` no longer blind-picks the oldest farm. `farm_id = tx.farm_id`;
  if null → use the tenant's farm only when there is exactly **one**, else **409 "link a farm
  first."** Removes the silent wrong-farm write.
- **PA18:** `instruct` reuses an existing INITIATED transaction for the obligation instead of
  minting a duplicate (idempotent instruct).
- **PA24:** the booked `transaction_date` uses **Fiji** date (UTC+12), not server `date.today()`
  — late-evening Fiji confirmations no longer book to the wrong day.

## Filed (honest — bigger, NOT faked)
- **PA22 partial settlement** — confirm settles the whole payable; installments need an amount at
  settle + a remaining balance on the obligation (schema: `settled_fjd`). Backend.
- **PA23 Evidence v2 on confirmation** — every other capture surface has Photo+GPS+Voice; payments
  confirmation should too (highest-value Bank Evidence row). Needs evidence columns on
  `payment_transactions` (mirror `events.py` `_hash_local_photo`). Backend + migration.
- **PA27 single AR truth** — receivables live in Buyers + Cash + Payments; converge on one
  server-side AR view. Architecture.
- **PA1-hardening** — add a `farm_id` selector to the *adopt* path + backfill historic NULL-farm
  payables; consider `farm_id NOT NULL` on `tenant.payables` after backfill. Migration.
- **FNPF/tax mapping** on LABOUR payments; **payment register export**; **due-date reminders**
  (task generator) — product.
```
