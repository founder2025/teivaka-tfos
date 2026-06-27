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

---

## RATIFIED DECISIONS (Operator, 2026-06-27) — these now bind the design

**D1 — Trust framing = Evidence & Reliability Confidence (NOT creditworthiness).** Teivaka never
decides loan-worthiness; it provides verified evidence + transparent confidence. The Trust Engine
explains *why* each level exists from verified evidence; the lending decision stays with the
institution. (Locks §4's framing; the AI summary gives a confidence band with the "tamper-evident,
farmer-reported, not externally audited" caveat — never a credit verdict.)

**D2 — QR portal = secure + permission-based; NOT public by default.** QR codes mint **share
tokens** with configurable scope, expiry, optional password, revocation, and a full access log
(who viewed, when). Farmers own their data. → Supersedes §5's "public raw-hash can stay" line:
- The **public `/verify/{hash}` stays PROOF-ONLY** (chain status; no blocks/photos).
- All **evidence/passport content is behind a share token** (`passport_shares`), never public-by-hash.
- **Action item:** the mig-187 public evidence projection must be **gated** — either reverted to
  proof-only now, or replaced by share-token access in Phase 3 (Operator to choose interim).

**D3 — Document Vault deferred to Phase 4.** Initial release = Passport · Evidence Engine · Trust
Engine · QR Verification Portal · automatic profile generation. No vault in the core. (Locks roadmap.)

**D4 — Verification = multi-layer, claim-level, accumulating (NOT a single "Verified Farmer" badge).**
This is an architectural elevation. Verify **claims, not just people**. Every major claim carries its
own independent verification status + evidence, and trust **accumulates** as more independent sources
confirm. → Supersedes the single `identity_verifications` table with a general **`claim_verifications`** model:

```
tenant.claim_verifications
  (verification_id, tenant_id,
   claim_type   [IDENTITY | FARM_OWNERSHIP | LAND_BOUNDARY | PRODUCTION | SALE |
                 COMPLIANCE | TRAINING | MEMBERSHIP | ...],
   claim_ref    text,          -- the entity verified (user_id / farm_id / cycle_id / harvest_id / order_id …)
   source       [SELF | PHONE | EMAIL | GOV_ID | EXTENSION_OFFICER | COOPERATIVE |
                 LANDOWNER | BUYER | GOV_PROGRAMME | FINANCIAL_INSTITUTION],
   source_ref   text,          -- who/which institution attested
   status       [PENDING | VERIFIED | REJECTED | EXPIRED],
   confidence_weight int,      -- per-source weight (self lowest; gov/FI/officer highest)
   evidence_audit_hash text,   -- the audit.events row that backs this attestation
   verified_at, expires_at, created_at)
```
- **A claim's verification level = the aggregation of its confirmations** (recency-decayed, capped):
  e.g. FARM_OWNERSHIP self-asserted (weak) → + LANDOWNER confirmation → + EXTENSION_OFFICER →
  "strongly verified." More independent sources = higher confidence, shown transparently.
- **Source weights (starting point, tunable):** SELF 5 · PHONE 10 · EMAIL 10 · BUYER 15 ·
  COOPERATIVE 20 · LANDOWNER 25 · EXTENSION_OFFICER 25 · GOV_PROGRAMME 25 · GOV_ID 30 ·
  FINANCIAL_INSTITUTION 30. A claim never reads "verified" on SELF alone.
- The Trust Engine's Identity / Farm / Production / Market / Compliance dimensions **read
  `claim_verifications`** for the verified-evidence portion of each score.
- Every attestation **emits an `audit.events` row** (the verification is itself tamper-evident).
- Each verification can **expire** → the claim's level decays → prompts re-verification (honest, living).

**Net effect of D1–D4 on the roadmap:** Phase 1 (Passport read-model) unchanged. Phase 2 (Trust v1)
reads `claim_verifications` + auto-claims (PHONE/EMAIL/SELF seeded from existing signup data). Phase 3
delivers the **share-token portal** (D2) + claim-attestation flows (officer/coop/landowner/buyer).
Phase 4 = Document Vault (D3). Phase 5 folds in GOV_ID / FINANCIAL_INSTITUTION sources as partners land.

---

## PHASE 1 BUILD PLAN (Passport read-model) — for go-ahead before code

**Goal:** a living Agricultural Passport that is 100% a *projection* of existing TFOS data — the
farmer adds nothing. Trust shows real headline stats + honest "Building" (Phase 2 fills the engine).

**Backend (`routers/passport.py`, NEW):**
- `GET /api/v1/passport/me` → assembles the read-model from existing sources (no new heavy queries
  invented): identity (`/me` + `passport_profile`), farm (`/farms/{id}` + production_units/Locations),
  production (`/financials/crops`, `harvest_log` counts), financial headline (`/financials/farm`),
  reputation stats (seasons = closed cycles, years-on-Teivaka = tenant created_at, verified
  production/sales counts), timeline (reuse the FarmHistory source merge).
- One small migration (apply-as-owner): `tenant.passport_profile` (preferred_name, bio, languages[],
  professional_photo_url + sha256). Everything else is projected — **Golden Rule honoured**.
- `GET/PUT /api/v1/passport/me/profile` for the *only* manual fields (photo, bio, languages).

**Frontend (`pages/me/Passport.jsx`, NEW; route `/me/passport`):**
- Mobile-first Overview / Farm / Reputation tabs (wireframe §7), TEIVAKA logo, api.js + formatMoney,
  honest empty/Building states, shared Modal, lucide icons, ErrorCard/Retry — the locked fix kit.
- Reuse: Locations map (farm boundaries), Gallery photos, FarmHistory timeline normaliser.
- Trust ring shows **"Building — N seasons of evidence"** (no fake score until Phase 2).
- A "Share my passport" button is present but **disabled with "Coming in the secure-sharing release"**
  (honest — real shares land in Phase 3; no fake public link, honouring D2).

**Verification gates:** `py_compile` + `npm run build`; migration staged apply-as-owner; browser smoke
(passport loads real data for F001; honest Building; no console/network errors). No fabricated numbers.

**Out of Phase 1 (explicit):** Trust math (Phase 2), share tokens/portal upgrade (Phase 3), Document
Vault (Phase 4), GOV_ID/FI verification (Phase 5).

---

## RATIFIED PRINCIPLES — round 2 (Operator, 2026-06-27)

**GOVERNING PRINCIPLE (supreme — every decision must satisfy it):**
> "A farmer manages their farm once inside TFOS, and Teivaka automatically builds their Agricultural
> Passport, Trust Engine, Verification Portal, and institutional reports without asking them to
> duplicate work."
> **If any feature requires duplicate data entry, redesign it until it doesn't.**

**P1 — Public `/verify/{hash}` is PROOF-ONLY (locked, permanent — not a temporary compromise).**
Answers exactly "is this report genuine?" Shows ONLY: report authenticity (Verified/Invalid),
report ID, version, generated date, issued-by-Teivaka, digital-signature status, integrity status,
expiry (if any). **NEVER** exposes: photos, field history, GPS, farm blocks, financials, production
history, documents, timeline, personal information. *(Actioned 2026-06-27: mig-187 evidence
projection removed from the public route + farm identifier dropped from the public page.)*

**P2 — Reports are SHARE SESSIONS, not PDFs-with-QR (new architectural principle).** The QR mints a
secure **Share Session** opening the permissioned Verification Portal. Supersedes the
`passport_shares` sketch with a richer model:
```
tenant.share_sessions
  (session_id, owner_user_id, tenant_id,
   report_version,                      -- which version of the report/passport was shared
   recipient text?,                     -- optional named institution/person
   audience  [LOAN|BUYER|INSURANCE|GOVERNMENT|INVESTOR|RESEARCHER|NGO|OTHER],
   share_reason text,                   -- why it was shared (drives the portal's framing)
   scope jsonb,                         -- which sections/dimensions/claims are visible
   token_hash, password_hash?,          -- secure token; optional password
   view_only bool, allow_download bool, -- permissions
   expires_at, revoked_at, created_at)
tenant.share_session_access            -- append-only: who/when/IP/action per access
```
Portal capabilities (Phase 3): permission scopes · expiry · optional password · revocable · view-only
vs download · institution identity where applicable · full access log the farmer sees. A report is
therefore a *controlled, auditable permission*, not a static file. The Bank Evidence PDF's embedded
QR will carry a Share Session token (not a raw hash) once Phase 3 ships.

**P3 — The Passport is a professional agricultural PORTFOLIO, not a profile page.** It auto-grows from
TFOS activity. The farmer contributes almost nothing beyond initial identity + farm setup (already
captured); everything else is generated. Phase 1's `passport_profile` manual surface is capped at
photo + bio + languages — and even Training is auto-pulled (Classroom completions), Skills/Awards/
Memberships are honest-empty until a real source exists (never a manual-entry wall).

These bind all phases. The Phase-1 plan above already complies (projection-only, honest Building,
no public sharing, no duplicate entry).

---

## PHASE 2 BUILD PLAN — Trust Engine v1 (for go-ahead before code)

**Goal:** turn the Passport's honest "Building" into a real, **explainable, evidence-weighted
reputation** — *Evidence & Reliability Confidence, never a credit score* (D1). Every dimension shows
`score · why · evidence behind it · how to improve`. Computed from data the farmer already logged
(governing principle) + the multi-layer `claim_verifications` model (D4). Precomputed, never
on-demand (Inviolable #3).

### Architecture
1. **Schema — migration 189 (apply-as-owner):**
   - `tenant.claim_verifications` (the D4 model — see "RATIFIED DECISIONS" block). Phase 2 **auto-seeds**
     the cheap claims at compute time: `IDENTITY/SELF`, `IDENTITY/EMAIL` (if email present),
     `IDENTITY/PHONE` (if whatsapp present), `FARM_OWNERSHIP/SELF`, `LAND_BOUNDARY/SELF` (if GPS mapped).
     Third-party attestations (officer/coop/buyer/gov/FI) are written by Phase 3 flows — until then
     Identity/Farm read honestly low ("self-asserted").
   - `tenant.trust_snapshots` (precomputed cache; FORCED RLS):
     `(snapshot_id, tenant_id, subject_type, subject_id, dimension, score, band, evidence_count,
       inputs jsonb, why text, how_to_improve text, computed_at)`. One row per dimension per subject.
2. **Pure compute module — `app/services/trust_engine.py`** (no I/O; takes evidence dicts, returns
   per-dimension results). One function per dimension → `{score, band, why, evidence[], how_to_improve}`.
   Pure = unit-testable; formulas are documented constants, not a black box.
3. **Precompute job — `app/tasks/trust_worker.py`** (Celery, nightly via beat + a manual refresh
   endpoint). **Two-stage tenant scan (Strike #95):** iterate `tenant.tenants`, `SET LOCAL app.tenant_id`
   per tenant, gather evidence counts, call `trust_engine`, upsert `tenant.trust_snapshots`. Reuses the
   worker's cross-tenant pattern (B72). Idempotent (snapshot replaced per run).
4. **API — extend `passport.py`:** `GET /passport/me` reads the latest snapshots (real dimensions +
   overall band) instead of the "Building" stub; falls back to honest "Building" when no snapshot yet.
   New `POST /passport/me/trust/refresh` (rate-limited) recomputes this tenant on demand.
5. **Frontend — Passport "Reputation" tab:** render each dimension as a row (ring + score + `why` +
   expandable `evidence` + `how to improve`), plus the **overall confidence band**. Mirrors the
   Compliance "standing" UI we already ship. New farmers still see honest "Building — N seasons."

### Dimensions v1 (each 0–100, transparent formula, tunable constants)
| Dimension | Reads (existing tables) | v1 formula sketch (documented + tunable) | Anti-gaming |
|---|---|---|---|
| **Production** | `harvest_log`, closed `production_cycles` | seasons (closed cycles) + harvest records + yield **consistency** (lower CV = higher) | only CLOSED cycles count; outliers down-weighted |
| **Operations** | `field_events` | logging **cadence over time** + % events with photo/GPS | rewards sustained cadence, not a one-day burst |
| **Market** | `cash_ledger` INCOME, orders/buyers, `payables` | sales count + **repeat buyers** + buyer-confirmed ratio | buyer-confirmed ≫ self-reported |
| **Compliance** | crop compliance views, `harvest_compliance_overrides` | start 100 − overrides − active holds − off-label/unidentified | overrides + expired/unknown subtract |
| **Evidence completeness** *(meta)* | events vs media/GPS/witness coverage | % of loggable records carrying photo/GPS/witness | the confidence multiplier on the others |
| **Record consistency** | `audit.verify_chain_for_tenant`, edit-window corrections | 100 if 0 chain breaks; − late edits / heavy corrections | chain breaks / backdating subtract |
| **Identity** | `claim_verifications` (IDENTITY/*) | weighted sum of source confidences (SELF 5 … GOV_ID/FI 30), recency-decayed | **never "verified" on SELF alone** |
| **Farm** | `claim_verifications` (FARM_OWNERSHIP, LAND_BOUNDARY) + GPS mapped | boundary mapped + ownership attestations | land claim needs a doc/officer (Phase 3/5) |
| **Verification history** | `claim_verifications` count + recency | breadth (distinct sources) + recency | recency-decayed; stale verifications fade |

**Overall = a confidence BAND, not a number presented as a score** (D1): e.g.
*Building → Developing → Established → Strong*, derived from dimension coverage + independent
verification, labelled **"Evidence & Reliability Confidence — not a lending decision."** The AI
executive summary (Phase 3) narrates it; Phase 2 ships the band + the dimensions.

### Binding rules
- **Explainability contract:** every dimension returns all four fields; the UI shows `why` +
  `how to improve` (no naked numbers). Cold-start = honest "Building" + the exact path, never a fake baseline.
- **Precomputed only** (Inviolable #3): pages read `trust_snapshots`; never compute on load.
- **No credit verdict** (D1): copy everywhere frames it as evidence confidence; the AI summary
  carries the "tamper-evident, farmer-reported, not externally audited" caveat.
- **Tunable, versioned formulas:** weights live in one constants block in `trust_engine.py`; a
  `formula_version` is stamped into each snapshot's `inputs` so scores are reproducible/explainable.

### Sequence
- **2a** — migration 189 + `trust_engine.py` (Production/Operations/Market/Compliance) + Celery
  precompute + passport reads snapshots + Reputation tab renders them. *Ship: real reputation from
  existing data.*
- **2b** — add Evidence-completeness / Record-consistency / Identity / Farm / Verification-history
  dimensions + the overall band + `claim_verifications` auto-seed + manual refresh endpoint.

### Verification gates
`py_compile` + unit tests for `trust_engine` pure functions (deterministic, fixture-driven) +
`npm run build`; migration staged apply-as-owner; Celery task functional-smoke (Strike #95 two-stage
scan completes, snapshots written for F001); browser smoke (Reputation tab shows real dimensions +
honest Building for an empty tenant). No fabricated scores.

### Out of Phase 2 (explicit)
Third-party attestation flows (officer/coop/buyer/gov/FI) + the AI executive summary + Share Sessions
→ Phase 3. Document Vault → Phase 4. GOV_ID/FI sources → Phase 5.

### Decisions needed before build
- **DC-1 Band labels:** Building / Developing / Established / Strong (recommended) — or your preferred names.
- **DC-2 Recompute cadence:** nightly + manual refresh (recommended for alpha) vs event-triggered (more infra).
- **DC-3 Financial dimension in v1?** Include a **record-discipline** dimension (cashflow record length +
  completeness — *not* profitability, per D1) — recommended yes — or defer to Phase 2b/3.
- **DC-4 Subject scope:** per-farmer passport only in v1 (recommended) vs also per-farm trust now
  (cooperatives/multi-farm later).

**DC-1..4 RATIFIED (2026-06-27):** bands Building/Developing/Established/Strong · nightly + manual
refresh · include Financial record-discipline dimension · per-farmer scope. Phase 2 shipped.

---

## PHASE 3 BUILD PLAN — Share Sessions + Attestation + AI Summary (for go-ahead before code)

**Goal:** make the Passport *shareable on the farmer's terms* and *independently verifiable*. Three
pillars: (A) **Share Sessions** — the secure, permissioned, revocable QR portal (D2/P2); (B)
**third-party attestation** — let officers/coops/buyers/landowners confirm claims so trust stops
being self-asserted (D4); (C) **AI Executive Summary** — the 2-minute institutional read. This is
the phase that turns the moat into something a bank actually consumes.

### Pillar A — Share Sessions (the secure portal)
- **Schema (migration 190):** `tenant.share_sessions` + `tenant.share_session_access` (per the P2
  block). Token stored hashed; optional password hashed; scope jsonb; expiry; one-time; revoked_at.
- **API (`shares.py`):** `POST /shares` (mint: audience, reason, scope, expiry, password?, one-time?)
  → returns the URL + QR; `GET /shares` (farmer's grants + access log); `POST /shares/{id}/revoke`.
  Public resolve: `GET /s/{token}` (rate-limited, password-gated, expiry/revoke-checked) → returns
  the **scoped** passport/report view; every resolve appends a `share_session_access` row (who/when/IP)
  and emits an `audit.events` row. The farmer sees "BSP viewed your passport · 14:32."
- **Portal page:** server-rendered (extends the `/verify` infra) OR a `/s/{token}` React view.
  Progressive disclosure (Tier 0 badge → Tier 1 exec summary + trust band → Tier 2 evidence drill).
  **This is where the photo/block evidence returns — now permission-gated** (reuse the dormant
  mig-187 `report_evidence_by_hash`, called only after token+scope check). Public `/verify/{hash}`
  stays proof-only (P1, untouched).
- **Report QR cutover:** Bank Evidence PDF's QR switches from raw hash → a Share Session token the
  farmer controls (with a proof-only fallback so old PDFs still verify).

### Pillar B — Third-party attestation (claims stop being self-asserted)
- **Link-based verifier flow (no account for the alpha):** farmer taps "Request verification" on a
  claim → mints a one-time **attestation link** (reuses the share-token machinery) addressed to an
  officer/coop/landowner/buyer → the verifier opens it, sees the specific claim + evidence, and
  confirms/declines → writes a `claim_verifications` row (source = their role, status VERIFIED,
  `evidence_audit_hash` + `source_ref` = who attested), which **immediately lifts the Trust score**
  (Identity/Farm/Verification dimensions already read this — Phase 2 wired it).
- **Auto-attestation where it's free:** a buyer who confirms a sale/order → auto `BUYER` claim on the
  MARKET/SALE claim; a completed government-programme enrolment → `GOV_PROGRAMME`. No manual entry.
- **Out of Phase 3:** GOV_ID + FINANCIAL_INSTITUTION sources (need real partner integrations → Phase 5).

### Pillar C — AI Executive Summary
- **`GET /passport/me/summary`** (+ in the portal): TIS generates the institutional 2-minute read
  — who the farmer is, what they produce, how long, evidence quality, production/financial
  consistency, strengths, risks, **recommended confidence band** — STRICTLY grounded in the passport
  read-model + trust snapshots (no hallucinated figures; Inviolable #1). Carries the standing caveat
  ("tamper-evident, farmer-reported, not externally audited; not a lending decision" — D1).
- **Cached** against the trust snapshot's `computed_at` (regenerate only when trust changes) — cheap +
  consistent. Honest "building" until there's enough evidence to summarise.

### Verification gates
migration 190 staged apply-as-owner; `py_compile` + `npm run build`; share-token security tests
(expiry, revoke, password, one-time, scope-leak = a scope must NOT return out-of-scope sections);
access-log written per resolve; AI summary grounded-output check (no number not present in the
read-model). Browser smoke: farmer mints a scoped link → opens incognito → sees only the scoped
tiers → farmer revokes → link dies → access log shows both events.

### Decisions needed before build (DD-1..4)
- **DD-1 Portal tech:** server-rendered `/s/{token}` (reuses verify infra, works for non-logged-in
  banks, recommended) vs a React `/s/{token}` route (richer, needs public bundle access).
- **DD-2 Attestation mechanism:** link-based verifier confirm (no account, recommended for alpha) vs
  in-app extension-officer/coop accounts (heavier, Phase 5).
- **DD-3 Default share policy:** expiry default (e.g., 30 days), view-only default ON, password
  optional, one-time optional — confirm defaults.
- **DD-4 AI summary timing:** cache-per-snapshot (recommended) vs always-fresh on open (costlier).

**DD-1..4 RATIFIED (2026-06-27):** server-rendered `/s/{token}` · link-based attestation · 30-day/
view-only defaults · cache-per-snapshot. Phase 3 A+B+C shipped. Evidence share-scope added
(opt-in photo+block in a share). Passport photo reuses `tenant.users.avatar_url`.

---

## PHASE 4 BUILD PLAN — Document Vault (for go-ahead before code)

**Goal:** one place for the documents trust rests on — leases, certificates, IDs, contracts —
each content-hashed, expiry-tracked, and shareable through the SAME Share Session machinery.
Right-sized for the alpha (D3 deferred the *full* vault; this is the lean core).

### Storage decision (grounded — answers "where do docs live?")
Media today = **local disk `/app/uploads`** (`TFOS_MEDIA_DIR`), uploaded via
`POST /api/v1/community/uploads`, served at `/api/v1/community/uploads/{name}` (in the public
path list — fine for field photos). **Decision: reuse that disk mechanism (no new infra)** — BUT
vault documents are more sensitive than field photos, so:
- **Gated retrieval (the nuance):** vault files are served through a NEW permission-checked route
  `GET /documents/{id}/file` (owner JWT, or a valid Share Session that scoped documents) — NOT the
  public `/community/uploads/{name}` path. Store the file on disk under a non-guessable name; the
  DB row is the access-control point.
- Object storage (S3/Spaces) is a Phase-6 hardening swap behind the same endpoint; bytea-in-DB is
  rejected (bad at any scale). Recommended now: **disk + gated route.**

### Schema — migration 192 (apply-as-owner)
```
tenant.documents
  (document_id, tenant_id, owner_user_id, doc_type [LEASE|CERTIFICATE|ID|CONTRACT|INSURANCE|PERMIT|OTHER],
   title, storage_name (disk file), sha256, byte_size, mime,
   issued_date, expiry_date, verification_status [UNVERIFIED|VERIFIED|EXPIRED],
   supersedes_id (version chain), uploaded_at, deleted_at)            -- FORCED RLS
tenant.document_access  (append-only: who/when/how a doc was fetched) -- FORCED RLS
```

### API — `documents.py`
- `POST /documents` (multipart): farmer uploads → hash (sha256) on the server → store on disk →
  row. Emits a `DOCUMENT_ADDED` audit row (the vault is itself tamper-evident).
- `GET /documents` (list, by type, expiry flags) · `GET /documents/{id}/file` (gated stream) ·
  `DELETE /documents/{id}` (soft, 48h window) · `PATCH` (title/dates).
- **Expiry → compliance:** a daily check (reuse the trust/maintenance worker) flags docs within 30
  days of `expiry_date` → surfaces on the Compliance page + an auto-task (closes the loop the
  Certifications stub promised). No fake reminders — only real expiry dates.

### Sharing — reuse Share Sessions
Add a `documents` scope key (opt-in, like `evidence`): a share can include selected document
*metadata + a gated view link* (never a public file URL). Same permission/expiry/revoke/log model.

### Frontend
A **Documents** surface (Passport tab or `/me/documents`): upload (drag/camera, reuses the
existing compress/upload util), list by type with expiry badges, verification status, view/replace.
Honest-empty; no placeholders.

### Verification gates
migration 192 staged apply-as-owner; py_compile + npm build; **security smoke is the gate** — a
vault file must be **unreachable** without the owner JWT or a documents-scoped share; SHA-256 on
upload matches on download; soft-delete honoured; expiry flag fires.

### Decision before build (DV-1)
- **DV-1 storage:** disk + gated retrieval route (recommended) — confirm, or pick S3/Spaces now.

### ⚠️ Strategic timing recommendation
Per D3 and my standing advice: **hold the Phase 4 build until the alpha cohort actually exercises
Phases 1–3.** The Passport/Trust/Share/Attestation loop is the moat; the Vault is additive and the
most storage/security-heavy piece. Building it now risks polishing ahead of real feedback. Plan is
ready; recommend building Phase 4 *after* first alpha use, unless a pilot bank/cert specifically
needs document upload first.
