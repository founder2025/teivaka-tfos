# Onboarding Gateway — Operator Runbook

The multi-sided registration gateway for the **Teivaka Agriculture Ecosystem**.
Everything here is built **open-by-default and gating-ready**: it ships without
regressing the live platform, and each guardrail turns on with a one-line change.
This runbook is the single index of those switches and the external actions only an
operator can complete.

Branch: `claude/beautiful-fermi-F0dLX`. All paths are repo-relative.

---

## 1. What shipped (Sections 1–4)

| # | Capability | Where |
|---|---|---|
| 1 | Individual/Company switcher + 3×3 ecosystem grid (9 cards) + Stage-2 dropdowns | `frontend/src/pages/Register.jsx` |
| 2 | Conditional identity fields + Province→District→Tikina cascade + lightweight 18+ (year picker) | `Register.jsx`, `app/routers/geo.py`, migration `116` |
| 3 | Omnichannel verification channel + CFO cost-routing (verify-later, password kept) | `app/core/verification_routing.py`, migration `117`, `Register.jsx` |
| 4 | Progressive verification watcher (ID-capture on high-value actions) | `app/core/capabilities.py`, `components/IdentityGate.jsx` |
| — | Free trials removed + open-by-default capability layer | migration `114`, `app/core/capabilities.py`, `utils/capabilities.js` |
| — | 12-tier `account_type` taxonomy | migration `115`, `app/core/account_types.py` |
| — | Rebrand → "Teivaka Agriculture Ecosystem" / TAE | index.html, manifest, MarketingPage, Privacy, Terms, verify templates |

## 2. Deploy

Order matters — **migrations before the API rebuild** (a new value like
`BANKER_COMMERCIAL` is rejected by the old `CHECK` until 115 lands).

```bash
cd /opt/teivaka
git fetch origin claude/beautiful-fermi-F0dLX
git reset --hard origin/claude/beautiful-fermi-F0dLX

# 1) Migrations 114 → 117, apply-as-owner (Strike #123)
docker compose -f 04_environment/docker-compose.yml exec api alembic upgrade head
docker compose -f 04_environment/docker-compose.yml exec db \
  psql -U teivaka -d teivaka_db -c "SELECT version_num FROM tenant.alembic_version;"
#   -> expect: 117_verify_channel

# 2) Clean API rebuild (B78 — new app/core modules + auth.py changed)
docker compose -f 04_environment/docker-compose.yml build --no-cache api
docker compose -f 04_environment/docker-compose.yml up -d api
bash 04_environment/verify-deploy.sh

# 3) Frontend
cd /opt/teivaka/frontend && npm run build
```

Migrations in this set: `114_remove_trials`, `115_account_type_taxonomy`,
`116_business_entities`, `117_verify_channel`. (`kyc_verified` already exists from
`097` — Section 4 needs no migration.)

## 3. The flip-switches (all default OPEN / safe)

### 3a. Feature gating (subscription / email-verification)
Single source of truth: `app/core/capabilities.py` → `CAPABILITIES`.
Every member capability is `Gate.OPEN`. To gate one:

```python
"CREATE_POST": CapSpec(gate=Gate.SUBSCRIPTION, min_tier="PREMIUM"),  # was Gate.OPEN
# or
"POST_STORY":  CapSpec(gate=Gate.VERIFICATION),                       # requires email_verified
```
`/auth/me` returns the computed `capabilities` map; the frontend `useCan()` hook
(`utils/capabilities.js`) reads it. No endpoint/component change needed to enforce.

### 3b. Progressive verification watcher (identity / KYC)
The high-value capabilities are wired but `OPEN`:

```python
"EXTRACT_BANK_EVIDENCE": CapSpec(gate=Gate.HIGH_TRUST),  # was Gate.OPEN  <-- flip to enforce
"EXECUTE_SETTLEMENT":    CapSpec(gate=Gate.HIGH_TRUST),
"FINANCIAL_MATCHING":    CapSpec(gate=Gate.HIGH_TRUST),
```
`Gate.HIGH_TRUST` ⇒ requires `users.kyc_verified`. When flipped, the Bank-Evidence
endpoints (`crop_bank_evidence.py`, `poultry_bank_evidence.py`, already wired with
`require_identity("EXTRACT_BANK_EVIDENCE")`) return `403 IDENTITY_VERIFICATION_REQUIRED`
for unverified users; the frontend pops `IdentityGate.jsx` → real KYC flow
(`/me/verification/upload` → `/me/verification` → admin review → green tick).

> ⚠️ Flipping this **locks existing unverified users out of Bank-Evidence**, a live
> feature. Only flip once the KYC review queue is staffed and users are warned.

To wire the watcher onto a NEW high-value endpoint:
```python
from app.core.capabilities import require_identity
async def settle(..., _=Depends(require_identity("EXECUTE_SETTLEMENT"))): ...
```

### 3c. Verification channel routing (omnichannel OTP)
`app/core/verification_routing.py`:
- CFO rule (already encoded): corporate/banking/regulatory → email (free SMTP);
  producer/field → WhatsApp; SMS = explicit fallback only, never a default.
- Today only **email actually delivers** — `_LIVE_CHANNELS = {"email"}`. WhatsApp/SMS
  resolve and are selectable but **fall back to email** so no account is stranded.

To turn on a real channel once provisioned:
```python
_LIVE_CHANNELS = {"email", "whatsapp"}        # add the channel
# and implement its real sender in dispatch_verification()
```
No caller changes — `auth.py` already routes through `dispatch_verification()`.

## 4. Operator actions (external — cannot be done from code)

| Action | Why | Status |
|---|---|---|
| Confirm prod **SMTP / Resend** is set in the API `.env` | `email.py:101` silently no-ops if `smtp_host` is empty — verification emails vanish | **🔴 verify first** |
| Provision **WhatsApp Business API** token | Q8 — only then can the WhatsApp channel deliver (3c) | blocked (Q8) |
| Replace the dead **+679 SMS** route | known-broken (CLAUDE.md) — keep SMS a labeled fallback until fixed | open |
| Decide **when** to flip 3a / 3b gates | locking live features is a product/ops call | operator |
| Load **District/Tikina** geo dataset into `shared.geo_regions` | the region cascade auto-extends past Province once present | data load |

## 5. Account model reference

- `account_type` (12 values, `app/core/account_types.py`) = ecosystem **profession**,
  not RBAC role. `derive_role()` maps it to a non-admin role within the migration-010
  `CHECK` set. Admin is never assigned at signup and is guarded separately
  (`require_admin` / `has_role("ADMIN")`).
- Company accounts also write a `tenant.business_entities` child row (FORCE RLS).
- `users.is_company`, `users.region_id`, `users.preferred_verify_channel` capture the
  switcher / cascade / channel choices.

---

_Last updated alongside the Section 1–4 gateway build on `claude/beautiful-fermi-F0dLX`._
