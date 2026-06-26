# TFOS Payments — Provider Adapter Spec & Merchant Onboarding Checklist (2026-06-26)

How a **real** payment rail (M-PAiSA, MyCash, or a card gateway) plugs into Teivaka so a
farmer can actually pay/get paid *in-app*, not just record an out-of-band payment. Grounded
in the existing contract: `app/services/payment_providers.py` (`PaymentProvider`,
`create_instruction`, `get_provider` MANUAL-fallback) and the `shared.payment_providers`
registry (migration 183 — all rails seeded `enabled=false` except MANUAL).

> **Status legend:** ✅ in code today · 🟡 needs build (I do it) · 🔴 external — you secure it
> (merchant account, API docs, sandbox creds) before any integration starts.

> **Hard rule (non-negotiable, PCI-DSS):** raw card number (PAN) and CVV NEVER touch Teivaka
> servers, logs, or DB — encrypted or not. Card data is entered into the **gateway's hosted
> field/iframe**; we store only a **token + last 4**. This keeps us at PCI **SAQ-A** (the
> easiest tier). The moment we accept a PAN ourselves we jump to SAQ-D / Level 1 — do not.

---

## 0. The principle that does NOT change
Teivaka stays **non-custodial in spirit**: an adapter produces an *instruction* and reports a
*confirmation*; settlement lands in **your own merchant/settlement account**, not a Teivaka
float. Every confirmed payment still writes exactly **one `tenant.cash_ledger` row + one
`CASH_LOGGED` audit event** (the existing `confirm_transaction` path) — so the Bank Evidence
chain is identical whether the money moved manually or through a gateway. The adapter only
changes *how the confirmation arrives*: today a human confirms; with a real rail, a
**signed webhook** confirms automatically.

---

## 1. The adapter contract — what to add (🟡 I build)
Today (`PaymentProvider`): `code`, `capabilities()`, `create_instruction()`. A real rail
implements the same class plus these methods. Each is non-custodial-safe and idempotent.

```python
class PaymentProvider:
    code = "BASE"
    def capabilities(self) -> dict: ...
    def create_instruction(self, *, direction, amount_fjd, method, counterparty_label, obligation_id) -> dict: ...

    # ── added for live rails ──────────────────────────────────────────────
    def register_instrument(self, *, gateway_token, owner_user_id) -> dict:
        """Persist a tokenized instrument (card-on-file / linked wallet). Input is a
        token MINTED BY THE GATEWAY from its hosted field — never a PAN. Returns
        {instrument_ref, last4, brand, exp_month?, exp_year?}."""

    def collect(self, *, txn_id, amount_fjd, instrument_ref=None, payer_msisdn=None) -> dict:
        """Pull money IN (buyer → you). Card: charge token. Mobile money: C2B push /
        STK-style prompt to payer_msisdn. Returns {provider_ref, state: INITIATED|PENDING|
        CONFIRMED|FAILED, redirect_url?} — async rails return PENDING and confirm by webhook."""

    def disburse(self, *, txn_id, amount_fjd, payee_msisdn=None, payee_bank=None) -> dict:
        """Push money OUT (you → worker/supplier). Mobile money B2C / bank transfer.
        Same return shape. Most gateways gate this behind a separate approval."""

    def verify_webhook(self, *, headers, raw_body) -> bool:
        """Validate the gateway signature/HMAC BEFORE trusting any callback. Mirrors
        Inviolable #10 (Twilio signature). Reject on mismatch — no exceptions."""

    def parse_webhook(self, *, raw_body) -> dict:
        """Map a verified callback to {provider_ref, state, confirmation_ref, amount_fjd}."""

    def get_status(self, *, provider_ref) -> dict:
        """Poll fallback for when a webhook is missed (PR.2: verified-loud)."""
```

**Resolution:** `get_provider(code)` already falls back to MANUAL for any rail whose adapter
isn't registered — so turning a rail ON is: (1) register the adapter in `_PROVIDERS`, (2) flip
`shared.payment_providers.enabled=true` via migration. Until both happen, the rail safely
degrades to out-of-band. ✅ this safety net exists today.

---

## 2. New webhook endpoint (🟡 I build, when a rail is live)
`POST /api/v1/payments/webhooks/{provider}` — unauthenticated by JWT (the *gateway* calls it),
authenticated by **signature** (`verify_webhook`). On a verified `CONFIRMED` callback it runs
the **same** `confirm_transaction` logic (idempotent, single-writer guard already in code) →
one `cash_ledger` row + `CASH_LOGGED`. Missed webhooks reconciled by a Celery `get_status`
sweep. Must:
- verify signature first, return 200 only after the row is written (so the gateway doesn't retry forever),
- be idempotent on `provider_ref` (re-delivery is normal),
- never expose internals (Inviolable #6),
- log to audit, redact secrets (B93 redaction filter already live).

---

## 3. DB changes needed (🟡 one migration, apply-as-owner per Strike #123)
- `tenant.payment_instruments` — tokenized cards/wallets: `instrument_ref, tenant_id, owner_user_id,
  provider, gateway_token (opaque), brand, last4, exp_month, exp_year, status`. **FORCED RLS**,
  canonical `app.tenant_id` policy (mirror the 40+ sibling tenant.* tables). **No PAN/CVV columns.**
- `tenant.payment_transactions` — add `gateway_state`, `gateway_ref`, `webhook_received_at`.
- `shared.payment_providers` — flip the chosen rail's capability flags + `enabled=true`.
- Widen `payment_methods.method_type` CHECK only if a rail needs a new bucket (e.g. `MOBILE_MONEY`);
  otherwise keep WALLET/BANK/CARD.
- Secrets (API keys, signing secrets, settlement account) go in **`.env` / container secrets**,
  reloaded via container *recreate* (Strike #69) — **never** in the DB or git.

---

## 4. Frontend (🟡 I build, gateway-hosted only)
- **Cards:** drop in the gateway's **hosted-fields SDK** (Windcave / BSP / ANZ supply a JS lib or
  hosted page). The card form is *theirs*, in an iframe; on submit it returns a token to us →
  `register_instrument`. We render only the saved token as "Visa ···· 4242". No PAN field in our DOM.
- **Mobile money:** the farmer enters/*confirms* their M-PAiSA number; `collect` triggers a push
  prompt to their phone; the UI polls/awaits the webhook → "Paid ✓ verifiable".
- The Settle modal stays the one flow — it just gains a "charge now" path when the obligation's
  method is a live rail, vs the manual "I paid out-of-band, here's the reference" path today.

---

## 5. Security & compliance (binding)
- PCI **SAQ-A** via hosted fields; no PAN/CVV ever (above). ✅ enforced by design.
- **Signature verification on every webhook** (Inviolable #10 pattern). 🟡
- **3-D Secure (3DS2)** on card collects — the gateway handles the challenge; we honor the result.
- Secrets in env, container-recreate to rotate (Strike #69). RLS on every new tenant.* table.
- **Alert-path receipt verification (PR.2):** before declaring a rail "live", a real test
  transaction must be confirmed end-to-end (sandbox → prod smoke) with the receipt archived.
- Audit chain unchanged — every confirmation is hash-chained, `/verify/{hash}` still works.

---

## 6. 🔴 MERCHANT ONBOARDING CHECKLIST — what to ask each provider
You secure these first; integration can't start without items marked **(blocker)**. Ask for the
**sandbox/UAT** set first so I can build + test before go-live.

### A. M-PAiSA — Vodafone Fiji (recommended first; how your market actually pays)
Contact: Vodafone Fiji M-PAiSA Merchant / Business team.
1. **(blocker)** M-PAiSA **merchant account** in Teivaka PTE LTD's name + merchant short code / till number.
2. **(blocker)** API access pack: **C2B** (customer→merchant, "collect") and **B2C** (merchant→customer,
   "disburse") — confirm both are enabled, or which.
3. **(blocker)** **Sandbox/UAT credentials** + base URL: API key/secret, app id, encryption/cert if any.
4. **(blocker)** **Webhook/callback** support: can they POST to our HTTPS URL on payment success?
   What signature/HMAC or shared secret authenticates it? Static source IPs to allowlist?
5. Settlement: which **bank account** receives funds, **settlement frequency**, and any float/escrow rules.
6. **Fees:** per-transaction %/flat for C2B and B2C; monthly/min fees.
7. Limits: per-transaction / daily caps; KYC requirements on payers.
8. The **STK/push** UX: does the payer get a prompt on their phone, or do they push to our code? Timeout?
9. Docs + a named technical contact for integration support.

### B. MyCash — Digicel Fiji (second mobile-money rail; same questions as M-PAiSA)
Mirror A items 1–9 with Digicel's MyCash merchant team. Confirm whether one merchant entity can
hold both M-PAiSA and MyCash.

### C. Card gateway — BSP / ANZ / Windcave (cards, second priority)
> ⚠️ **Verify availability for a Fiji entity before committing.** Stripe is most likely NOT
> available to a Fiji-registered business — do not assume it. Likely real options: **BSP online
> payment gateway**, **ANZ eGate/merchant services**, **Windcave** (Pacific/NZ).
1. **(blocker)** Online **card-acquiring merchant account** (MID) in the company's name; confirm Visa
   **and** Mastercard (and debit cards specifically — you asked) are covered.
2. **(blocker)** A **hosted-fields / hosted-payment-page** product (so we stay PCI SAQ-A). Get the
   **SDK/library + integration docs**. Reject any option that requires us to collect the PAN.
3. **(blocker)** **Tokenization / card-on-file** support (so "save my card" works without storing a PAN).
4. **(blocker)** **Sandbox** merchant + test cards + API keys + signing secret.
5. **(blocker)** **Webhook/notification** mechanism + signature scheme + source IPs.
6. **3-D Secure 2** support (mandatory for liability shift).
7. **Refunds / voids** API (for the correcting-entry / dispute path).
8. **Settlement:** bank account, settlement currency (FJD), payout schedule, rolling reserve if any.
9. **Fees:** % + fixed per card txn, 3DS fee, refund fee, monthly/min, chargeback fee.
10. Chargeback/dispute process + who's liable.
11. PCI: confirm the integration keeps us at **SAQ-A**; get their **AOC** (Attestation of Compliance).
12. Docs + named integration contact + go-live/certification steps.

---

## 7. Integration plan once a merchant account lands (🟡 staged, reversible)
1. **Sandbox adapter** — implement the rail's `PaymentProvider` against UAT creds; unit-test
   `create_instruction`/`collect`/`verify_webhook`/`parse_webhook`. `enabled` stays false.
2. **Migration** — instruments table + txn columns + RLS (apply-as-owner). Secrets to `.env`.
3. **Webhook endpoint** + Celery `get_status` reconciliation sweep.
4. **Frontend** — gateway hosted fields (cards) / push-confirm UX (mobile money) behind a flag.
5. **Smoke in sandbox** end-to-end → real cash_ledger row + audit hash + `/verify`.
6. **Go-live:** flip `shared.payment_providers.enabled=true` (migration) + prod secrets +
   container recreate. **PR.2 receipt check** — one real low-value txn confirmed + archived.
7. **Rollback:** flip `enabled=false` (one migration / one row) → rail instantly degrades to MANUAL
   out-of-band. No data loss; the manual path never went away.

---

## 8. What ships before any of this (✅ no dependency)
The page already records + bank-verifies out-of-band payments today. Optional honesty polish
(say the word): relabel methods as *"the wallet, bank or card you pay from"* so it's clear
Teivaka records the payment now and will charge directly once a rail is switched on.

---

### TL;DR for the Operator
- **You get:** a merchant account + API/sandbox docs from **Vodafone (M-PAiSA)** first, **Digicel
  (MyCash)** next, **BSP/ANZ/Windcave** for cards — per the §6 checklist.
- **I build:** the adapter (§1), webhook (§2), migration (§3), hosted-field frontend (§4), staged
  with sandbox smoke + one-row rollback (§7).
- **Never built:** a card-number/CVV box. Card data only ever lives at the gateway.
