# TEIVAKA Agricultural Trust Infrastructure (TATI) — Design (2026-06-27)

**Status: DESIGN FOR APPROVAL. No code until ratified.** This is the architecture for the
Agricultural Passport / Evidence / Trust / Verification stack. It is deliberately a *thin assembly
layer over primitives TFOS already has in production* — not a parallel system.

---

## 0. Strategic frame (read first)

**Reuse-first reality — what already exists in prod (do NOT rebuild):**
| TATI layer | Already shipped in TFOS | Status |
|---|---|---|
| Evidence Engine spine | `audit.events` SHA-256 hash chain (`this_hash`/`previous_hash`), `verify_chain_for_tenant`, `verify_event_by_hash`, `public_chain_stats` | ✅ live |
| Evidence capture | Universal Event Form Contract — every (+) → one `audit.events` row; Evidence v2 (photo+GPS+voice+witness, SHA-256-bound) on `field_events`/`cash_ledger` | ✅ live |
| Verification Portal | public `/verify/{hash}` (server-rendered) + now the report-evidence projection (mig 187) | ✅ live |
| Report output | Bank Evidence PDF (hash-anchored, QR, chain-verified, `report_exports`), `/crops/bank-evidence/sources` (blocks+photos provenance) | ✅ live |
| Farm identity data | `tenant.farms` (GPS/area), `production_units` (blocks/boundaries), `production_cycles`, `harvest_log`, `field_events`, `flocks`, `inputs`, `workers` | ✅ live |
| Financial identity | `cash_ledger`, `payables`, orders/buyers, analytics/financials endpoints | ✅ live |
| Compliance identity | WHD holds, `harvest_compliance_overrides`, crop compliance views | ✅ live |
| Identity (thin) | `tenant.users` (name/phone/email + email-verify) | 🟡 partial |
| Gallery / photos | `field_events.photo_url` + `photo_sha256` + `audit_hash` | ✅ live |

**Genuinely net-new (the real build):**
1. **Agricultural Passport** surface (assembles the above into a living identity — read-mostly).
2. **Trust Engine** (transparent, evidence-weighted scoring + explainability) — *does not exist*.
3. **Document Vault** (lease/cert/ID storage with versioning + hashing) — *does not exist*.
4. **Configurable Sharing** (scoped, expiring, revocable grants) — *does not exist* (today the only "share" is the public verify hash).
5. **Identity / KYC verification** (farmer + farm + landowner) — *does not exist*.
6. **AI Executive Summary** (TIS over the passport) — *not wired*.

**Three-lens verdict:**
- *Operator:* the Golden Rule (never ask for what TFOS can infer) is already 80% satisfied because capture is event-driven — the Passport is mostly a *projection*, which is why it's cheap to build and why the farmer "never fills in reports."
- *Investor:* the moat isn't the dashboard — it's the **hash-chained evidence + the verification portal**, which are done. TATI monetises that moat (bank/exporter/insurer access). Build the Trust Engine next because it's the saleable artifact.
- *Systems architect:* the risk isn't scale of reads (projections cache cheaply) — it's (a) **trust-score gaming**, (b) **privacy of a public portal**, (c) **document-vault storage cost/security**, and (d) **KYC honesty** (you cannot fake "verified"). Each is addressed below.

**Honesty guardrails binding this design:** no fabricated trust scores; "verified" means an actual verification happened; the Trust Engine must be explainable per-dimension; nothing on a public portal beyond what the farmer's share-grant authorises.

---

## 1. System Architecture

Four layers, mapped to **reuse (R)** vs **new (N)**:

```
┌──────────────────────────────────────────────────────────────────┐
│ L1  AGRICULTURAL PASSPORT  (N: surface)                            │
│   Identity · Farm Identity · Reputation — a read-mostly PROJECTION │
│   assembled from L2. Farmer almost never edits.                    │
├──────────────────────────────────────────────────────────────────┤
│ L2  EVIDENCE ENGINE  (R: audit.events spine + Evidence v2)        │
│   Every (+) action → 1 hash-chained audit row + linked media/GPS.  │
│   TATI adds: evidence INDEX (typed views) + Document Vault (N).    │
├──────────────────────────────────────────────────────────────────┤
│ L3  TRUST ENGINE  (N)                                              │
│   Pure function over L2 → per-dimension scores + explanations.     │
│   Precomputed + cached (Inviolable #3). Never self-reportable.     │
├──────────────────────────────────────────────────────────────────┤
│ L4  VERIFICATION PORTAL  (R: /verify + N: passport shares)        │
│   QR → portal. Progressive disclosure. Permission-scoped.          │
└──────────────────────────────────────────────────────────────────┘
            ▲ all four sit on RLS + SECURITY DEFINER projections
```

**Service decomposition (FastAPI routers):**
- `passport.py` (N) — assembles the passport read-model (calls existing endpoints + new views).
- `trust.py` (N) — computes/serves trust dimensions; a Celery job precomputes nightly + on material events.
- `documents.py` (N) — vault CRUD, hashing, versioning.
- `shares.py` (N) — grant/revoke/scope share tokens; access logging.
- `verify.py` (R, extend) — portal already exists; add share-token resolution + passport view.
- Bank Evidence / sources / compliance / cash — reused as evidence providers.

---

## 2. Information Architecture

**Passport (farmer-facing), mobile-first, 3 primary tabs + drill-downs:**
```
PASSPORT  (/me/passport)
├─ Overview        ← photo · name · Farmer ID · trust ring · "verified" chips · 1-line bio
│                    + 4 headline reputation stats (seasons, verified production, sales, years on Teivaka)
├─ Farm            ← map (GPS boundaries) · size/area · enterprises · infrastructure · soil/water · farm photos · timeline
├─ Reputation      ← Trust dimensions (expandable, each explains itself) · achievements · history
└─ (drill) Evidence · Timeline · Financial · Compliance · Documents · Shares
```
**Institution-facing (via QR/share) = Verification Portal** (separate, permission-scoped, §5).

**Progressive disclosure (mandatory):**
- Tier 0 (2 sec): trust ring + verified/not + "report authentic" badge.
- Tier 1 (2 min, executive): AI summary + headline stats + dimension scores.
- Tier 2 (auditor): drill any claim → the underlying hash-chained evidence rows.

---

## 3. Database Model

**Reuse everything in `tenant.*` + `audit.*`. Add a small new set. Most of the Passport is VIEWS, not tables.**

New tables (all `tenant.*`, FORCED RLS, `app.tenant_id` policy):
```
tenant.passport_profile        -- the FEW genuinely-manual fields only
  (user_id PK, preferred_name, bio, languages[], professional_photo_url,
   photo_sha256, updated_at)   -- everything else is projected, never stored here

tenant.identity_verifications  -- KYC events (honest "verified" provenance)
  (verification_id, subject_type[USER|FARM|LAND], subject_id, method
   [GOV_ID|EXTENSION_OFFICER|COOP|DEED|FIELD_VISIT], status[PENDING|VERIFIED|REJECTED],
   verified_by, evidence_doc_id, verified_at, expires_at)

tenant.documents               -- Document Vault
  (document_id, owner_user_id, farm_id?, doc_type, title, storage_url,
   sha256, byte_size, version, supersedes_id?, issued_date, expiry_date,
   verification_status, uploaded_at, deleted_at)   -- content-hashed; expiry feeds compliance

tenant.document_versions       -- immutable version chain (or supersedes_id self-ref above)

tenant.passport_shares         -- configurable sharing
  (share_id, owner_user_id, audience[BANK|BUYER|GOV|INSURER|INVESTOR|RESEARCHER|NGO],
   scope jsonb (which sections/dimensions), token_hash, password_hash?,
   one_time bool, expires_at, revoked_at, created_at)

tenant.passport_share_access   -- access log (who/when/IP) — append-only

trust.trust_snapshots          -- precomputed scores (Inviolable #3: never on-demand)
  (snapshot_id, tenant_id, subject_id, dimension, score, max_score,
   evidence_count, inputs jsonb (what fed it), computed_at)
```
Audit emission: every new write (document upload, verification, share create/revoke) emits a
real `audit.events` row via the Universal Event Form Contract — the vault + shares are
themselves tamper-evident.

**Passport read-model = VIEWS over existing data** (no duplication, honouring the Golden Rule):
`v_passport_identity`, `v_passport_farm`, `v_passport_production`, `v_passport_financial`,
`v_passport_timeline` (UNION over field_events/harvest_log/cash_ledger/flocks/compliance —
the FarmHistory normaliser already proves this shape), `v_passport_compliance`.

---

## 4. Trust Engine Design

**Principle: a pure, explainable function over evidence. No arbitrary numbers. Not self-reportable. Verification-gated.**

Dimensions (each 0–100, each *explains itself*):
| Dimension | Evidence it reads | Anti-gaming gate |
|---|---|---|
| Identity | identity_verifications (gov ID / officer / coop) | score capped low until a **third-party** verification exists |
| Farm | GPS boundary mapped, area, land doc in vault, farm verification | boundary must exist; land claim needs a doc or officer sign-off |
| Production | harvest_log volume + consistency across seasons | only **closed/verified** cycles count; outliers down-weighted |
| Operations | field_events cadence, completeness, photo/GPS coverage | rewards *consistency over time*, not burst logging |
| Market | sales (orders/cash_ledger INCOME), repeat buyers, buyer confirmations | buyer-confirmed sales weighted ≫ self-reported |
| Financial | cashflow record length, completeness, reconciliation | record *length + completeness*, NOT profitability (no credit claim) |
| Compliance | WHD honoured, overrides (each a ding), certs valid | overrides and expired certs subtract |
| Evidence completeness | % of claims with photo/GPS/witness backing | the meta-score; drives the others' confidence |
| Record consistency | gaps, backdating attempts (chain), edit-window corrections | chain breaks or heavy late-editing subtract |
| Verification history | count + recency of external verifications | recency-decayed |

**Rules (binding):**
- **Explainability contract:** every score returns `{score, why, contributing_evidence[], how_to_improve}`. The UI shows all three. (Mirrors the Compliance "standing" we already ship.)
- **Evidence-weighted, time-decayed:** recent + verified evidence > old + self-reported.
- **Confidence, not a credit score:** the headline is "evidence completeness / reliability," explicitly **not** a lending recommendation, to avoid liability. The AI summary gives a *recommended confidence band* with the caveat that figures are farmer-reported + tamper-evident, not independently audited (same language as the Bank Evidence footer).
- **Precomputed** nightly + on material events (Celery), stored in `trust.trust_snapshots`; UI reads the snapshot (Inviolable #3). Never computed on page load.
- **Cold-start honesty:** a new farmer shows **"Building — N seasons of evidence needed"** with the exact path to raise each dimension. No fake baseline (consistent with the Bank-readiness "building" we already show).

---

## 5. QR Verification Flow

Extends the existing portal. **QR never opens a PDF — it opens the portal** (already true).

```
Report/Passport generated → mints:
  report_id (human: TVK-F001-2026-06-001) · audit anchor hash · digital signature ·
  version · issue date · expiry (optional)
QR encodes →  https://teivaka.com/v/{share_token}      (NEW: share token, not raw hash)
                         │
        ┌────────────────┴───────────────────────────┐
        ▼ unauthenticated landing (Tier 0, 2 sec)     │
   "✓ Authentic · issued by Teivaka · chain tamper-free · last updated …"
        ▼ Tier 1 (executive, 2 min)                   │
   AI summary · trust ring · identity/farm verified · record completeness · available evidence
        ▼ Tier 2 (auditor, if scope allows)           │
   drill into each claim → hash-chained evidence rows → /verify/{hash} per item
```
- **Two token types:** (a) raw audit-hash verify (today's `/verify/{hash}`, proof-only, public) stays; (b) **share token** (`passport_shares`) for richer passport/report access — scoped, expiring, revocable, logged. The QR on a *shared* report uses the share token; the QR on a *public* Bank Evidence PDF can stay the raw hash (proof + the mig-187 evidence projection).
- Integrity: signature = the audit anchor; expiry honoured; revoked token → "this link was revoked by the farmer."

---

## 6. Permission Model

- **Owner = farmer** (RLS by `app.tenant_id`; per-user within tenant for personal docs).
- **Internal roles** (existing): FOUNDER/OWNER, MANAGER, WORKER — RBAC on edit/verify/share actions (workers can't mint shares; managers can per owner config).
- **External access = share grants only** (`passport_shares`), never a login. Each grant carries: audience type, **scope** (which sections/dimensions/documents), expiry, optional password, one-time, revocation, full access log.
- **Default deny:** an institution sees *only* the scoped sections of *that* grant. No share = nothing beyond the public proof.
- **Audit:** every grant create/use/revoke + every document view emits an `audit.events` row + `passport_share_access` log entry (the farmer sees "BSP viewed your passport, 14:32").

---

## 7. UI/UX Wireframes

**Passport — Overview (mobile-first):**
```
┌─────────────────────────────┐
│ [photo]  Save-A-Lot Farm     │   ← TEIVAKA logo top-right
│  Cody K. · Farmer #F001-A0EE │
│  ◔ Trust 72 · Building       │   ← ring; tap → Reputation
│  ✓ Identity ✓ Farm ◷ Records │   ← verified chips (honest states)
│  ┄ "Cassava + eggplant, Kadavu, 6 seasons on Teivaka" (auto bio)
├─────────────────────────────┤
│ 6 seasons · 12.4 t verified  │   ← headline reputation (projected)
│ FJD 41k sales · 2 yrs        │
├─────────────────────────────┤
│ [ Overview | Farm | Reputation ]
│ ▸ Share my passport          │   ← creates a scoped grant
│ ▸ Download Bank Evidence     │   ← existing PDF
└─────────────────────────────┘
```
**Reputation tab:** each dimension a row with ring + "why" + "to improve" (expand → evidence list).
**Farm tab:** map with GPS boundaries (existing Locations data) + enterprises + photos + timeline.
**Verification Portal (institution):** Tier-0 badge → Tier-1 exec card → Tier-2 evidence drill (§5).

**Honesty in UI:** every "verified" chip has 3 honest states — Verified / Building / Not yet — never a fake green.

---

## 8. Mobile Experience

- PWA (existing). Passport is the farmer's "business card" — installable, shareable.
- One-thumb: trust ring + share button reachable; progressive disclosure avoids walls of text.
- Low-literacy: icons + the AI summary read aloud (Web Speech API, already used in SoloTaskCard); verified states are colour + icon + word.
- Share = generate QR/link in 2 taps (audience → expiry → done).

---

## 9. Offline Synchronization Strategy

- **Passport is read-mostly** → cache the last-built passport read-model + trust snapshot in IndexedDB; show with a "last synced" stamp offline (never a fake live number).
- **Capture is already offline-tolerant** at the TFOS layer; TATI doesn't add new offline writes except the Document Vault, which **queues uploads** (photo/doc) and reconciles on reconnect (mirror the Evidence v2 media pattern).
- **Verification Portal is online-only** (it's an integrity check — must hit the chain). Honest offline message.
- Conflict policy: passport is a projection, so no merge conflicts; documents are append/version, so last-write = new version, never overwrite.

---

## 10. Security Architecture

- **Tamper-evidence:** everything rides `audit.events` (immutable, hash-chained, mig 153 revokes UPDATE/DELETE). Documents + verifications + shares are hashed + audit-logged.
- **RLS everywhere** (`tenant.*` FORCED, `app.tenant_id`); cross-boundary reads ONLY via **SECURITY DEFINER projections** with locked field whitelists (the pattern from `verify_event_by_hash` / mig 187) — never raw public queries.
- **Public-portal privacy (the live risk we just touched):** the public verify shows only what the *share scope* (or the report's evidence projection) authorises — money/notes/PII never leak. Share tokens are single-purpose, expiring, revocable, rate-limited (verify already rate-limits 10/min/IP).
- **Document Vault:** content-hash on upload; private storage with signed, expiring URLs (NOT public static); virus/type checks; CSV/PDF export injection-safe (pattern already applied).
- **KYC honesty:** "verified" requires a real `identity_verifications` row from a real method; no self-verification. Trust-score Identity dimension is capped until third-party verification exists.
- **Secrets/keys** in env, container-recreate to rotate (Strike #69). Signatures use the existing audit anchor, not a new key store (reuse the moat).
- **Liability guard:** the AI summary + trust score are framed as *tamper-evident, farmer-reported confidence*, not an externally-audited account or a credit decision.

---

## 11. Implementation Roadmap (income-funded, reuse-first, alpha-right-sized)

**Do NOT build all of this at once. Each phase ships standalone value.**

- **Phase 0 — Foundations already done** ✅ (audit chain, verify portal, Bank Evidence, evidence projection mig 187, Evidence v2). *Nothing to build.*
- **Phase 1 — Passport read-model (2–3 wk).** `passport.py` + the `v_passport_*` views + `passport_profile` (the few manual fields). Mobile Overview/Farm/Reputation tabs as **projections** of existing data. **No new trust math yet** — show real stats + honest "Building." *Ship: the living passport, zero new capture.*
- **Phase 2 — Trust Engine v1 (2–3 wk).** `trust.trust_snapshots` + Celery precompute + `trust.py` with the explainability contract. Start with 4 dimensions that need no new data (Production, Operations, Market, Compliance — all from existing tables). *Ship: an explainable reputation, the saleable artifact.*
- **Phase 3 — Sharing + Verification Portal upgrade (2 wk).** `shares.py` + `passport_shares`/access log + share-token portal + progressive disclosure tiers + AI exec summary (TIS). *Ship: the farmer can hand a banker a scoped, expiring link — the monetisable moment.*
- **Phase 4 — Document Vault (2–3 wk).** `documents.py` + vault UI + expiry→compliance hooks. Private storage + signed URLs. *Ship: leases/certs/IDs in one verifiable place.*
- **Phase 5 — Identity/KYC verification (partner-gated).** `identity_verifications` + extension-officer / coop / gov-ID flows. *External dependency — sequence when a verification partner exists; until then Identity stays honestly "Building".*
- **Phase 6 — Hardening for scale.** Caching, portal CDN, offline polish, multi-farm/cooperative passports, researcher/anonymised access.

**Sequencing rule:** Phases 1→2→3 are the value core and reuse 100% existing data — that's the alpha. 4–6 follow on income. Don't build 4–6 infra for 50 farmers.

---

## Forks needing Operator decision before build
1. **Trust score framing** — "evidence/reliability confidence" (recommended, low liability) vs an explicit "creditworthiness score" (high value, high liability — needs validation + disclaimers + likely a lender partner). *Recommend the former for alpha.*
2. **Public portal default** — keep institution access **share-token-gated** (recommended) vs broaden the public verify to show passport summaries by hash (more viral, more privacy exposure).
3. **Document Vault storage** — minimal private object storage now vs defer to Phase 4 (recommended: defer; it's the most cost/security-heavy piece and not alpha-critical).
4. **KYC partner** — who verifies identity (extension officers? coops? gov ID?) — gates Phase 5; not buildable honestly without it.

**Recommended first build on approval: Phase 1 (Passport read-model)** — highest visible value, zero new capture burden on the farmer, 100% reuse of the evidence spine you already trust.
