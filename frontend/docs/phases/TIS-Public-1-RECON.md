# Phase TIS-Public-1 RECON Report

**Branch:** feature/tis-public-1-recon (created from `74e42eb` on feature/landing-l3)
**Run (UTC):** 2026-05-21
**Mode:** Read-only survey. Only mutations = this report + recon branch + empty dirs (`docs/phases`, `site_corpus/sources`). No installs, no corpus files, no migration.
**Per:** MBI Section 9 step 1

## 0. RECON FLAGS — findings that contradict the script's assumptions
1. **`TFOS_Platform_Architecture.md` does NOT exist** anywhere on the box. The stub lists it as a BASE corpus source — it isn't available. Corpus must rely on the prototype + MBI public-safe parts + live marketing copy.
2. **Embedding model is OpenAI `text-embedding-3-small` (1536-dim), NOT Claude Max.** The existing `tis_service.py:351` already embeds via OpenAI; Claude has no embeddings API. This resolves the stub's open question #6 and confirms the `vector(1536)` column. TIS-Public should reuse the same OpenAI embedding path; Claude Max (via the bridge) is generation-only.
3. **MBI header format is `## PART N —`, not `## N.`** (e.g. `## PART 39 — SITE VOICE DOCTRINE` @ line 1624). The script's `^## 39\.` / `^## 1\.` greps returned nothing. Sections referenced below use the real format.
4. **Part 39.8 mandates per-route SEO meta** ("each route carries its own title/meta/canonical/OG/JSON-LD … server-visible, not JS-only; generic site-wide meta on a specific page is a Tier-0 drift bug"). The per-route canonical/og work deferred in the SEO Commit A is **doctrine-required**, not optional.
5. **Backend has no `app/api/v1/` dir** — routers live in `app/routers/` (FastAPI prefix applied in `app/main.py`). The new endpoint follows that pattern, not a literal `api/v1/` path.
6. **Alembic head `078_c1c_naming_backfill` is an untracked migration file** (also flagged in the 2026-05-20 state-verify). DB is migrated to an uncommitted revision.

## 1. Production state snapshot
- Parent branch / commit: feature/landing-l3 @ `74e42eb` (SEO Commit A)
- Containers: all healthy — api, db, redis, caddy, worker_ai, worker_automation, worker_notifications, beat, diag (worker_ai/beat **healthy**, contradicting the older "Celery outage" handover note)
- Alembic head: `078_c1c_naming_backfill` (file untracked — see flag 6)
- pgvector: **installed, v0.7.2** (ivfflat + hnsw); timescaledb 2.15.3 also present

## 2. Corpus source inventory

### Existing public-safe sources (BASE corpus)
- `TFOS_Platform_Interactive_Prototype.html` — **/opt/teivaka/docs/**, 1691 lines. Farmer-app UI mockup (Notifications, Farm overview, Active cycles, Log harvest…). Public-safe portions need careful extraction (it's a UI prototype, not narrative copy).
- `TFOS_Platform_Architecture.md` — **NOT FOUND** (flag 1).
- Live marketing copy: `MarketingPage.jsx` (940 lines), `Landing.l3.html` (985 lines) — primary tone reference (Part 39.1 says /about + /what-we-do are the canonical voice).
- MBI `## PART 1 — WHO YOU ARE AND WHAT YOU ARE BUILDING` (line 55; "The Goal" subsection @59) — public-safe thesis material.
- MBI `## PART 2 — TECH STACK` (@142; "AI / Intelligence Stack" @179) — internal; stack facts only, not public copy.

### Fresh banker primitives REQUIRED (write in BUILD) — unchanged from stub
- [ ] Audit chain explainer (no ship date) · [ ] Verification endpoint narrative (no ship date) · [ ] Credit primitive thesis (FICO-analog) · [ ] Founder credibility (Uraia Koroi Kama, Teivaka PTE LTD — confirmed in MarketingPage.jsx:441/500/502 + Landing.l3.html:663) · [ ] Traction language (no inflated numbers — Part 39.4) · [ ] ~15 refusal scripts (Part 39 tone)

### EXCLUDED from corpus (sensitive / internal) — unchanged from stub
MBI Part 3 (Production State), Part 11 (migration), Part 12 (schema drift), Part 14 (current reality); Foundation_Complete.xlsx; commit messages/SHAs/internal phase numbers; pricing; ship dates for unshipped features.

## 3. Harness architecture (proposed) — ARCHITECT'S PROPOSAL, preserved for review
**Stack confirmed available:** FastAPI + pgvector (0.7.2 ✓) + OpenClaw/Claude Max (bridge live ✓) for generation + **OpenAI `text-embedding-3-small` for embeddings** (corrected from stub).

**Components:**
1. `site_corpus/sources/*.md` — versioned, public-safe corpus files
2. `app/services/tis_public/indexer.py` — chunks corpus, embeds via OpenAI text-embedding-3-small, stores in `shared.tis_public_corpus`
3. `app/services/tis_public/retriever.py` — pgvector similarity search, top-k + confidence
4. `app/services/tis_public/harness.py` — citation-or-refuse: confidence < threshold → hard refusal; else Claude Max (via bridge) with strict system prompt + retrieved chunks
5. `app/routers/tis_public.py` — POST `/api/v1/tis-public/ask` (Phase 2; routers live in `app/routers/`, prefix in `main.py`)
6. `shared.tis_public_telemetry` — every Q&A, refusal, WhatsApp handoff

**New tables (Phase 2 migration, NOT now):**
- `shared.tis_public_corpus` (chunk_id, source_file, section, content, embedding vector(1536), version, created_at)
- `shared.tis_public_telemetry` (turn_id, session_id, question, answer_or_refusal_reason, cited_chunks[], confidence_score, handoff_to_whatsapp bool, created_at)

*Reference (learn from, do not reuse): farmer-side `app/services/tis_service.py` (719 lines; anthropic+openai+redis; embeds @351, similarity vs `tenant.kb_embeddings`).*

## 4. Refusal allowlist (NOT blocklist) — ARCHITECT'S PROPOSAL, preserved
CAN answer: (1) What is Teivaka/TFOS · (2) Who it's for · (3) High-level how it works · (4) Founder/company background · (5) Audit chain + bankability (no ship dates) · (6) How to book a demo (→ Cal.com, Phase 3) · (7) Contact (→ WhatsApp Business).
REFUSE (hard → WhatsApp handoff): pricing specifics · ship/launch dates · crop-specific agronomy · compliance/legal/medical/veterinary · other farmers' data · anything below confidence threshold.

## 5. OpenClaw / Claude Max integration
- TIS bridge present: **YES** — `/opt/tis-bridge/server.js` (2580 B) + `.bak.prebump`
- systemd `tis` unit: **active**
- Reusable for TIS-Public? **Yes** — reuse the live bridge/OAuth for *generation*; build a *separate* TIS-Public harness with its own strict system prompt + corpus. Embeddings via OpenAI (not the bridge).

## 6. Frontend widget mount point
- App.jsx routes: marketing routes confirmed; `/tis-public` → `<MarketingPage pageKey="tis" />` (App.jsx:182). `/` → `<Landing />`.
- MarketingLayout / PublicLayout: **none exist** (only `AdminLayout`, `FarmerLayout`). Marketing routes are individual `MarketingPage` instances.
- Existing widgets to learn from (not reuse): `src/components/TISWidget.jsx`, `src/components/tis/TisChatPanel.jsx` (farmer-side).
- Proposed mount: new public widget, bottom-right, lazy-loaded on click, mounted either inside MarketingPage or globally in App.jsx (no shared marketing layout to hook).

## 7. Cal.com booking
- Currently absent: **confirmed** (no calcom/calendly refs). Phase 3 adds embed; no code here.

## 8. Site Voice Doctrine (Part 39) summary — MBI @1624, "BINDING, locked 2026-05-20"
- **39.1 Two readers, every sentence:** a Kadavu smallholder who reads slowly, and a skeptical Fiji bank credit officer. Serve both or cut.
- **39.2 Voice IS:** plain, declarative, unhedged; concrete over abstract; honest about stage (status pills: live/in-build); income-funded humility; Pacific-first; short sentences, lists of three.
- **39.3 Banned:** hype words (revolutionary/seamless/cutting-edge/empower/game-changing — one earned superlative max); vague benefit-speak; second-person funnel; emoji; exclamation marks in body; ungrounded "we".
- **39.4 Source-grounding (INVIOLABLE):** every factual claim traces to project knowledge or an Operator-provided fact. No invented numbers/buyers/yields/prices/dates. ← directly governs the corpus + harness refusals.
- **39.5 Honest-stage:** unshipped = labelled build-stage, never present tense.
- **39.6 Canonical mirror:** landing is canonical, standalone routes mirror word-for-word.
- **39.7 Placeholder protocol:** no invented stand-ins; hold or ship-without; pull from nav if not honestly populatable.
- **39.8 Per-page identity:** each route's title/meta/canonical/OG/JSON-LD, server-visible, in this voice — generic meta on a specific page is a **Tier-0 drift bug** (see flag 4).
- **39.9 Process:** Landing.l3.html is sacred (needs per-session Operator auth); every edit names its source in the commit body.

→ **Harness implication:** the citation-or-refuse design is the technical enforcement of 39.4. Refusal scripts must read in this voice (plain, no hype, honest-stage).

## 9. Gaps to close in BUILD phase — unchanged from stub + additions
- [ ] Write 6 banker primitive corpus files · [ ] ~15 refusal scripts (Part 39 tone) · [ ] Confidence threshold (stub proposes 0.78, tune adversarially) · [ ] Corpus versioning rule (edit → re-index → version bump) · [ ] 200-question adversarial set (50 banker / 50 farmer / 50 journalist / 50 troll)
- [x] **Embedding model decision** — RESOLVED: OpenAI text-embedding-3-small (reuse existing path)
- [ ] **NEW:** decide whether to source any prototype content (it's UI, not narrative) or rely on marketing copy + fresh primitives only
- [ ] **NEW:** since `TFOS_Platform_Architecture.md` is missing, decide if its intended content must be written fresh or sourced from MBI Part 1/2

## 10. Surprises / drift / blockers
- Architecture corpus source missing (flag 1) · embedding model differs from stub (flag 2) · MBI header format (flag 3) · alembic head untracked (flag 6) · Part 39.8 makes per-route SEO doctrine-mandated, not optional (flag 4).
- No blockers to the BUILD phase — stack (pgvector, bridge, OpenAI embeddings, FastAPI) is fully present.

## 11. Recommended BUILD scope (Phase TIS-Public-1 step B) — ARCHITECT'S PROPOSAL, preserved
**In scope:** write 6 banker primitive corpus files in `site_corpus/sources/`; write refusal script bank; build indexer + retriever + harness as a **CLI tool** (Python, no API, no UI); run 200-question adversarial test; **gate: zero hallucinations across 200 questions**, iterate until clean.
**Out of scope (Phase 2+):** API endpoint, widget UI, Cal.com embed, telemetry-table population, production deployment.

---
*Recon complete. Nothing installed, no corpus files written, no migration run. Recon branch `feature/tis-public-1-recon` is local-only (no commit, no push).*
