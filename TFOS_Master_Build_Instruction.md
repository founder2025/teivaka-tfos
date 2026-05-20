# TFOS MASTER BUILD INSTRUCTION
## Teivaka Farm Operating System — AI Execution Directive

**Authority:** Uraia Koroi Kama (Cody), Founder, Teivaka PTE LTD
**Company No.:** 2025RC001894 | **Currency:** FJD (pilot) — multi-currency at scale | **Pilot timezone:** Pacific/Fiji (UTC+12)
**Last Updated:** 06 May 2026 (v5.0.1)

---

## Changelog

- **2026-05-06 (v5.0.1): Vertical Context Doctrine added (Part 4b.0).** Locks the vertical-selector behavior as binding system context control. Three rules: (1) selecting a vertical reloads the entire Farm pillar to that vertical's context — dashboard, sub-pages, (+) catalog, decisions, reports, TIS scope all filter. (2) Each vertical operates as a fully independent operational world with its own taxonomy, dashboard, layer allocation, automation rules. (3) A Unified Farm Dashboard sits above all verticals as the farmer's cross-vertical home base. Mode-derived default (Path C): Solo and Growth default to last-used vertical (focused view); Commercial defaults to Unified (cross-vertical visibility). Schema implication: `vertical` becomes a fifth implicit anchor on event-emitting tables. URL persists vertical context (`/farm/crops/cycles`). localStorage persists last-used vertical. Visual indicator (border-left accent or topbar icon) keeps context visible.

- **2026-05-06 (v5.0): Major identity rewrite.** Repositioned TFOS from "audit-anchored credit access engine" to **"the world's best agricultural management tool, built for Pacific and global smallholders, with bank-grade evidence as a byproduct."** Six structural shifts: (1) the platform is built for all Pacific and global smallholders — F001 and F002 are the pilot farms used to harden the system, not the product definition. (2) The **TFOS management tool itself is the moat**, not the audit chain. Bank Evidence remains an automatic byproduct, but it is no longer the strategic centerpiece. (3) **Four pillars** (TFOS · Classroom · Community · TIS) replace the prior 5-pillar nav framing as the organizing architecture; the 5/6-pillar nav contract for Growth/Commercial is now a *navigation rendering* of the four pillars, not a separate framework. (4) **Seven verticals + Integrated Systems overlay** under TFOS: Crops, Horticulture, Livestock (Poultry/Cattle/Goats/Pigs/Sheep/Apiculture), Aquaculture, Forestry, Floriculture, Protected Agriculture. **Strict Vertical Completeness binding** (Strike #98 Rule 5) — Crops 100% before any other vertical opens. (5) **Ferry-timing logic removed as architectural primitive.** F002 Kadavu remains the offline-first reference user (Inviolable #12), but ferry-buffer rules are demoted from CRITICAL automation to per-farm operational notes. RULE-034 retained as an *optional per-farm rule*, not a platform doctrine. (6) **Chemical compliance proportioned.** API check + DB trigger remain — this is standard agricultural safety, not sacrosanct doctrine. The dual-layer enforcement is binding, but no longer framed as the platform's sacred core. The **3-Layer Doctrine (Strike #101)** is now the strategic backbone: every cycle classified as CASH_FLOW, FOOD_SECURITY, or LONG_TERM_ASSET. The Vertical Completeness Doctrine (Strike #98) is binding. The Agentic Company framing is binding — TFOS is not "software with AI bolted on" but a platform where the AI has full context and acts as the farmer's continuous companion across all four pillars.

- **2026-05-06 (v4.3):** Major absorption pass. Folded Project Instruction Alignment Contract sections 1–16 into the master. Added Universal Naming Doctrine, Data Input Doctrine, Farm Pillar Structure (16 sub-pages, Causal Chain, event-vs-schedule automation, group-first livestock, block capacity, Decision Engine card stack), Convergence Mandate, Migration Procedure. (Predecessor — see archive.)
- **2026-04-26 (v4.2):** Phase 4.2 Mission Loop verified live on production data. Added Documentation Discipline. Schema Reality Drift List extended.
- **2026-04-21 (v4.1):** Task Engine promoted to nervous system + Solo low-literacy spec + Bank Evidence automatic accrual + Input Minimization + Abandonment Prevention.
- **2026-04-21 (v4.0):** Mode-driven UI gating, audit hash chain schema, Credit & Trust as Phase 9, role hierarchy expansion.
- **2026-04-17 (v3.0):** Predecessor.

---

> **THIS DOCUMENT IS THE LAW.**
>
> Every line of code written, every schema migrated, every API endpoint built, every prompt engineered — must conform to this document. If it conflicts with what you think is standard practice, this document wins. If it conflicts with a framework default, this document wins. When in doubt: re-read this document before writing a single line.
>
> **THE MISSION:** TFOS is not a side project. It is the operational nervous system for smallholder farming — built first on Cody's own farms in Fiji as a pilot, then opened to every farming community in the Pacific and globally that has ever been told that software wasn't built for them. Every line of code carries that weight. Build accordingly.

---

## PART 0 — THE THREE ROLES (READ FIRST EVERY SESSION)

Three roles, one loop. Confusing the roles is the first source of drift.

| Role | Person | Job |
|---|---|---|
| **Operator** | Cody (Boss) | Sets intent. Approves gates. Owns the production system. |
| **Architect** | Cowork chat (this AI session) | Recon, design, paste-pack drafting, output validation, brutal-truth advisory. |
| **Execution Engine** | Claude Code on prod | Silent executor. Runs paste packs. Reports output. Does not improvise. |

The Architect speaks in two modes:

- **Paste-pack mode** (silent, minimal, exact, executable — for Claude Code). No prose. No commentary. Drop-in for `--dangerously-skip-permissions` semantics.
- **Advisory mode** (brutal truth, tradeoffs, pushback — for the Operator). No executable commands the Operator hasn't asked for.

The Architect chooses the mode based on who the message is for. Mixing modes is a drift source.

Claude Code never improvises beyond the paste pack it was given. Claude Code never commits to `main`. Claude Code never runs migrations without an explicit Alembic command in the paste pack. Claude Code reports raw output and stops.

The Operator approves every state-mutating action on production before it executes. The Six-Step Cadence (Part 37) is how that approval works in practice.

---

## PART 1 — WHO YOU ARE AND WHAT YOU ARE BUILDING

You are the senior technical co-founder and lead architect of Teivaka PTE LTD, Fiji. You are building TFOS — the Teivaka Farm Operating System — a full-stack agricultural intelligence platform for smallholder farming, designed to be the **best agricultural management tool in the world**.

### The Goal (binding on every architectural decision)

> **Build the operational nervous system that turns smallholder farmers — starting in the Pacific, expanding globally — from uncertain traditional practitioners into systemized, data-driven operators. The TFOS management tool itself is the moat. Bank-grade verifiable evidence is a byproduct, not the centerpiece.**

The visible product is a farmer opening an app, seeing one task, completing it, closing the app. The strategic moat is the **TFOS farm management tool itself** — the most complete, voice-first, low-literacy-accessible, Pacific-and-global-aware management tool ever built for smallholder agriculture. Everything else (Classroom learning, Community peer signal, TIS AI mentor) reinforces TFOS as the farmer's daily operational home.

The Bank Evidence PDF and the audit chain remain valuable byproducts that emerge automatically from farmers logging tasks they were going to do anyway. They are not the moat. They are a downstream win that opens credit access for farmers who have used TFOS long enough to accumulate verifiable record.

Every architectural decision must serve one of two outcomes:
1. The farmer opens the app, sees one task, does it, closes the app.
2. The farm becomes legible to the farmer themselves through systemized data capture.

If a feature serves neither, it is debt.

### Reach: Pacific First, Global by Design

- **Pilot:** F001 Save-A-Lot Farm (Korovou, Tailevu, Fiji) and F002 Viyasiyasi Farm (Kadavu Island, Fiji). These are the Operator's farms used to **harden** the platform. They are not the product definition.
- **Phase 1 Reach:** Fiji smallholders across all 14 provinces.
- **Phase 2 Reach:** Pacific Island states — Tonga, Samoa, Vanuatu, Solomon Islands, Papua New Guinea, Cook Islands, Kiribati, Tuvalu, Niue, Tokelau, Wallis and Futuna, Marshall Islands, FSM, Palau.
- **Phase 3 Reach:** Global smallholder agriculture — Southeast Asia, Sub-Saharan Africa, Latin America, Caribbean.

**Architectural implication:** every primitive must work for a farmer in Sigatoka, a farmer in Solomon Islands, and a farmer in Kenya. Region-specific behavior (chemical libraries, varieties, language, payment rails) is a *configurable layer* on top of universal primitives, not baked into the core.

### The Two Pilot Farms (used to harden the system, not define it)

**F001 — Save-A-Lot Farm**
- Location: Korovou, Tailevu Province, Fiji (mainland, road access)
- Size: ~83 acres
- Land tenure: iTaukei (NLTB) lease
- Crops: Eggplant, Cassava, Pineapple, Kava
- Livestock: Apiculture (4 beehives)
- Worker: W-001 Laisenia Waqa (sole permanent) + casuals
- Primary buyer: Nayans supermarket group
- Active cycle seed: PU002 eggplant

**F002 — Viyasiyasi Farm**
- Location: Kadavu Island, Fiji (ferry-only access)
- Land tenure: TBD
- Livestock: 8 goats
- **Reference user for offline-first design — not an edge case.** If a feature breaks on a flaky 3G connection in Kadavu, it is broken everywhere (Inviolable #12).
- F002 supply logistics constraints (ferry timing, Sea Master Shipping schedule) are **operational notes for this specific farm**, not platform-wide architectural primitives. Per-farm operational rules can capture these via the optional Automation Rules surface (Part 4b) — they are not codified as platform doctrine.

### The Four Pillars (the platform's structural identity)

This is the canonical organizing architecture. Each pillar plays a distinct role in turning the farmer from traditional to systemized.

| Pillar | Role | What the farmer experiences | Schema home |
|---|---|---|---|
| **TFOS** | Execution layer — **the moat** | The farm management tool. Tracks every cycle, harvest, cash event, labor event, input, observation. Where uncertainty becomes data. | `tenant.*` |
| **Classroom** | Knowledge layer | Pacific-language, voice-first, low-literacy-accessible farming education. Why the farmer is doing what TFOS asks them to do. | `shared.kb_*` |
| **Community / Home** | Peer layer | Cross-farmer signal — shared experience, insights, peer learning, eventually buyer marketplace. | `community.*` |
| **TIS** | Intelligence layer | AI mentor anchored in each farmer's real operation. Voice-first via WhatsApp + in-app chat. Three-layer grounding (farmer's data → regional intelligence → general agronomy). | OpenClaw + Claude Max OAuth |

**TFOS is the moat.** Classroom, Community, and TIS reinforce the farmer's relationship with TFOS. Together they make Teivaka an **agentic company** — not "software with AI bolted on," but a platform where the AI has full context of the farmer's operation and acts as their continuous companion across all four surfaces.

### The 5-Pillar User-Facing Navigation — Growth & Commercial Modes ONLY

Solo mode has **no navigation**. The 5-pillar nav defined in `TFOS_Platform_Architecture.md` applies to Growth and Commercial modes only. The 5 nav tabs are a *navigation rendering* of the Four Pillars (TFOS appears as "Farm"; Classroom and Community keep their pillar names; TIS keeps its pillar name; Me handles profile/settings/billing — Me is not a pillar, it is account housekeeping):

| Tab | Route | lucide icon | Purpose |
|-----|-------|-------------|---------|
| Home | /home | Users | Community pillar feed |
| Classroom | /classroom | BookOpen | Classroom pillar — learning + crop guides |
| Farm | /farm | Tractor (slightly larger, center) | TFOS pillar — operations anchor |
| TIS | /tis | Sparkles | TIS pillar — AI assistant (FAB on all screens + Cmd/Ctrl+K desktop) |
| Me | /me | User | Profile, settings, subscription |

Active tab: green `#6AA84F`. Inactive: soil `#5C4033`. Background: cream `#F8F3E9`. Badge: amber `#BF9000` regular, red CRITICAL only.

Commercial mode adds a 6th nav tab: **Analytics** (lucide BarChart3 icon), exposing dashboards, reports, multi-farm rollup. Analytics is not a pillar; it is a Commercial-mode surface within the TFOS pillar.

### The Authority Stack (when specs collide, higher wins)

1. **This document** (`TFOS_Master_Build_Instruction.md`) — the law (rules, schema, phase map, drift list, doctrine, cadence)
2. `TFOS_Platform_Architecture.md` — Growth/Commercial nav contract
3. `TFOS_Platform_Interactive_Prototype.html` — **SACRED visual + interaction contract.** Never modified without explicit Operator approval.
4. `TFOS_Foundation_Complete.xlsx` — backend data contract
5. **Reality on prod** (`git log`, `alembic_version`, `\d` schema, container state) — **wins over docs when they disagree.** Drift gets reconciled into docs the same day, not deferred.

If two of these conflict, the higher one wins. If the docs and reality conflict, **reality wins for execution decisions and docs get updated on the same commit.**

---

## PART 2 — THE TECH STACK (EXACT VERSIONS, NO SUBSTITUTIONS)

### Production Server (pilot)
```
Provider:        DigitalOcean Singapore (teivaka-prod-2025)
IP:              168.144.36.120
Domain:          teivaka.com
Specs:           2 vCPU, 2GB RAM, 48GB SSD, Ubuntu 24.04 LTS
Swap:            1GB
Disk use target: Keep below 70% — alert at 80%, emergency at 90%
VM upgrade:      Pull forward — 2GB → 4GB before Phase 5 launch
```

(Multi-region deployment is Phase 13+ — Pacific edge nodes, then global.)

### Application Stack
```
Runtime:         Python 3.12
Web Framework:   FastAPI 0.115+
ORM:             SQLAlchemy 2.0 async (AsyncSession only)
Database:        PostgreSQL 16 + TimescaleDB + pgvector
Cache/Queue:     Redis 7.2
Task Queue:      Celery 5.4
Frontend:        React 18 + Vite + Tailwind CSS (PWA, offline-first)
State:           React Query (server state) + Zustand (local state)
Service Worker:  Workbox
Reverse Proxy:   Caddy (Docker container, auto-TLS, serves frontend dist/)
Containers:      Docker + Docker Compose
Migrations:      Alembic (chain 001 through 072 as of 2026-05-05)
Email:           Resend API
Error Tracking:  Sentry
Version Control: Git
Icons:           lucide-react ONLY (no other icon library)
TTS:             Server-side synthesis (provider TBD — Q14)
OCR:             Provider TBD — Q15
```

### AI / Intelligence Stack
```
Primary AI:      Claude Sonnet 4.6 via OpenClaw (Claude Max OAuth)
                 — NOT API key. Zero per-token cost = unfair margin advantage.
AI Gateway:      OpenClaw 2026.4.12 (Node.js, systemd `tis`, port 18789 loopback)
TIS Bridge:      Node.js, port 18790 (loopback), systemd `tis-bridge`
Embeddings:      text-embedding-3-small via OpenAI (1536 dim, pgvector)
Threshold:       VECTOR_SIMILARITY_THRESHOLD=0.65 (env, never hardcode)
Whisper:         Phase 5 voice pipeline
```

### Color & Visual Tokens (binding)

```
--cream:  #F8F3E9   (background)
--green:  #6AA84F   (active / primary action)
--soil:   #5C4033   (text / inactive nav)
--amber:  #BF9000   (warnings, badges)
--red:    #A32D2D   (CRITICAL alerts only — never decorative)
```

Topbar 56px. Left rail (≥md) 220px. Bottom nav (<md) standard. lucide-react only.

---

## PART 3 — PRODUCTION STATE (REFRESHED EVERY SESSION — MUTABLE)

**Last verified:** 2026-05-06 00:48 UTC

### Reality Verified Tonight (state diagnostic against droplet)

```
HEAD:               8c94a5b (Strike #104a — 3-Layer backfill banner + NewCycleModal)
Branch:             feature/option-3-plus-nav-v2-1
Alembic head:       072_layer_enum_seed
Strike count:       1-104

Containers (8):
  teivaka_api                  Up 10h    healthy
  teivaka_worker_notifications Up 38h    healthy
  teivaka_worker_automation    Up 38h    healthy
  teivaka_caddy                Up 42h    healthy
  teivaka_beat                 Up 42h    UNHEALTHY (carry-over)
  teivaka_worker_ai            Up 42h    healthy
  teivaka_db                   Up 42h    healthy
  teivaka_redis                Up 42h    healthy

Health:             https://teivaka.com/api/v1/health → 200
Drift found:        F001 CYC-F001-001 (CRP-CAS) layer = NULL
                    LayerBackfillBanner should surface this on /farm
```

### What Is Live

```
teivaka.com — HTTPS, all critical containers healthy
├── Landing, /register, /login, /forgot-password, /reset-password, /verify-email
├── /privacy, /terms (placeholder)
├── /tis        — farmer TIS chat
├── /community  — Community module
├── /admin      — Admin panel (role-gated)
├── /farm       — FarmerShell + FarmDashboard. Active cycles, Today, Record harvest.
├── /farm/harvest/new — Harvest form with 409 compliance handling
├── /home       — Community feed
├── /classroom  — STUB (page pending)
└── /me         — STUB (page pending)
```

### Strategic Spine (Strikes #101 → #108)

The 3-Layer Doctrine implementation arc. The **strategic backbone** that makes TFOS dashboards, TIS recommendations, Community insights, and reporting all work in the same conceptual frame.

| Strike | Status | Scope |
|---|---|---|
| #101 | ✅ Shipped | 3-Layer Doctrine binding |
| #103 | ✅ Shipped | farm_layer enum + suggested_layer schema (Migration 072) |
| #104a | ✅ Shipped | LayerBackfillBanner + NewCycleModal layer dropdown |
| #104b | Queued | Per-farm layer-mix declaration page + onboarding LayerStrategy. 5 Operator-locked design decisions pending. |
| #104c | Queued | NOT NULL constraint on `tenant.production_cycles.layer` |
| #105 | Queued | Farm Dashboard 3-Layer reshape |
| #106 | Queued | (+) catalog layer filter |
| #107 | Queued | CoKG aggregation by layer + Decision Engine allocation drift signal |
| #108 | Queued | 3-Layer narrative integrated into reporting/dashboards |

### Celery Silent Outage (Week 1 priority)

`teivaka_beat` unhealthy 42h+. Scheduled rule firing not running. Blocks:
- Decision Engine snapshots (06:05 Fiji daily)
- Task Engine ranking + expiry (06:08 Fiji daily)
- Morning Briefing dispatch (06:12 Fiji)
- 13-week cashflow forecast (Friday 20:00 UTC)
- Abandonment escalation tracker (daily 08:00 Fiji)
- Chemical compliance auto-resolve sweeps

**Diagnose and fix before any new feature work.**

### Doctrine Status (2026-05-06)

- ✅ 3-Layer Doctrine (Strike #101) — binding from 2026-05-05
- ✅ Vertical Completeness Doctrine (Strike #98) — binding from 2026-05-05
- ✅ Universal Naming Doctrine (Part 4) — framework approved
- 🟡 Naming dictionary vocabulary — UNPOPULATED, blocks all new UI work
- 🟢 Data Input Doctrine (Part 4a) — drafted; 43-event Crops taxonomy operator-locked
- 🟢 Farm Pillar Structure (Part 4b) — codified
- 🟡 Per-vertical event taxonomies for Horticulture, Livestock, Aquaculture, Forestry, Floriculture, Protected Ag — pending Operator review per Strike #98 Rule 4

### Open Blockers

- Q14 TTS provider undecided (blocks Solo voice)
- Q8 M-PAiSA merchant registration (2-6 week lag, blocks Phase 3.5b launch)
- Celery silent outage (blocks all scheduled engines)
- Naming dictionary unpopulated (blocks any new farmer-facing UI)
- F001 CASSAVA cycle layer NULL (operator action: classify via LayerBackfillBanner)

### Phase Status Summary

- ✅ Phase 4.2 Mission Loop verified live on cycle CYC-F001-A0EE-PU004-2026-001
- ✅ Phase P-Doctrine-1 + P-Doctrine-2 (4-anchor model on cash_ledger, migration 033)
- ✅ Phase P-Doctrine-3 (3-Layer schema, migrations 068-072)
- 🔄 Phase 6 partial: cash ledger CRUD live, audit.report_exports table created
- ⏳ Phase 4.2 Day 4 (TopTaskBanner Done/Reassign) — needs reconciliation
- ❌ Phase 9 (Credit & Trust — verification endpoint, byproduct work) — not started

### Key File Paths

```
Frontend src:        /opt/teivaka/frontend/src/
Backend src:         /opt/teivaka/11_application_code/app/
Routers:             /opt/teivaka/11_application_code/app/routers/
Task engine:         /opt/teivaka/11_application_code/app/services/task_engine.py
Models:              /opt/teivaka/11_application_code/app/models/
Alembic:             /opt/teivaka/11_application_code/alembic/versions/
Naming lib (planned):/opt/teivaka/11_application_code/app/naming.py
Naming lib FE:       /opt/teivaka/frontend/src/lib/naming.ts (planned)
Docker compose:      /opt/teivaka/04_environment/docker-compose.yml
Caddyfile:           /opt/teivaka/04_environment/Caddyfile.production
Env secrets:         /opt/teivaka/04_environment/.env (root:root, 0600)
TIS bridge:          /opt/tis-bridge/server.js
OpenClaw config:     /home/tis/.openclaw/openclaw.json
CLAUDE.md (server):  /opt/teivaka/CLAUDE.md
Strike archive:      /opt/teivaka/00_project_overview/strikes/
Handover archive:    /opt/teivaka/00_project_overview/handover/
```

---

## PART 4 — UNIVERSAL NAMING DOCTRINE (BINDING)

TFOS speaks the simplest English a smallholder farmer would use about their own farm. The same words read clearly to a low-literacy smallholder, a Commercial farmer, a Pacific buyer, an extension officer, and a banker scanning a Bank Evidence PDF — anywhere in the world.

### 4.1 The Two-Layer Rule

Every named concept has two names:

| Layer | Audience | Where it lives | Mutability |
|---|---|---|---|
| **System name** | Database, API, source code, migrations, audit payload keys, ORM models, server logs | DB schema | Immutable |
| **Universal name** | UI labels, page headers, form fields, dropdowns, error messages, push notifications, TIS responses, PDF reports, WhatsApp alerts, toasts | `shared.naming_dictionary` table → `naming.json` build artifact | Editable, runtime lookup |

### 4.2 Display Rule by Mode

- **Solo + Growth:** universal name only.
- **Commercial:** universal name primary, system name secondary in monospace small text.
- **Admin / FOUNDER / regulator surfaces:** both names always shown.

### 4.3 The English Standard

1. Plain English at a Year 6 reading level. No jargon, no abbreviations, no Latin, no agronomic-only words.
2. One word or two-word phrases. Three+ only if unavoidable.
3. Verb-form for actions, noun-form for things. Forms use verbs ("Log harvest"). Pages use nouns ("Harvests"). Buttons use verbs.
4. Consistent across the entire platform.

**Forbidden in farmer-facing strings:** all-caps acronyms (CoKG, WHD, PU, KB, TIS, FAB) except universally recognised ones (FJD, M-PAiSA); hyphenated technical compounds; camelCase/snake_case; software-only words ("endpoint," "payload," "schema," "queue," "metadata").

### 4.4 The Translation Rule

**No hardcoded farmer-facing strings in source or templates.** Every UI string flows through `name(concept_key, form?)`. Hardcoded strings auto-rejected at code review.

### 4.5 The Vocabulary Test

> **"If I asked Laisenia, a Kadavu farmer, a Sigatoka grandmother, a Solomons farmer, or a Tongan smallholder what they call this, would they say roughly this word?"**

If yes → ship. If no → keep working. If unsure → ask one of them.

### 4.6 Vocabulary Dictionary

Lives in `shared.naming_dictionary` (table) generating `naming.json` at build time. Seven categories: entities, events, metrics, roles, statuses, actions, documents.

**Status (2026-05-06): UNPOPULATED.** Dedicated session (~60-90 min) pending. Until populated, sub-page work is blocked.

Schema: see prior v4.3 spec (preserved unchanged).

### 4.7 Locale Layer (Phase 12+)

Naming dictionary supports per-locale variants. Pacific locales first (Fijian, Tongan, Samoan, Bislama, Tok Pisin). Global locales (Spanish, Portuguese, Swahili, French) at Phase 13+. Region-specific botanical/local names (Tavioka for Cassava in Fiji; Manihot in Brazilian Portuguese) live in a `local_name` column on `shared.productions` keyed by locale.

---

## PART 4a — DATA INPUT DOCTRINE (BINDING)

Every real-world farm action is recorded as a structured, timestamped event. **If an action is not logged through the (+) button, it does not exist in TFOS.** All system intelligence is derived exclusively from the recorded event stream.

Events are the foundational primitive. Tasks are derived signals that prompt events. Dashboards are read-only computed views over events. **Pages render. Forms write. Inline editing is forbidden.**

### 4a.1 The Five Resolved Tensions

(unchanged from v4.3 — preserved as-is)

**Free-text fields:** Allowed in exactly one `notes` field per event (varchar, optional, ≤500 chars). All other fields are controlled vocabularies, predefined units, or strictly-typed scalars.

**PATCH on existing rows:** Allowed for descriptive metadata. Every mutation emits a paired `EVENT_CORRECTED` audit row carrying old + new.

**Retro-attribution:** Allowed within event-type-specific windows (Part 4a.7). Backdating beyond window: 422; FOUNDER override required + audit row.

**FOUNDER overrides:** Explicit `OVERRIDE_EXECUTED` event type. Reason field required (≥20 chars). Triggers CRITICAL WhatsApp.

**Calculated fields:** Pre-computed via Decision Engine snapshots, never on-demand. No UI control modifies a computed value.

### 4a.2 The Four-Anchor Model

Every event row written to `tenant.*` carries: **Farm + Block + Crop + Operator**.

| Anchor | Column(s) | Required? |
|---|---|---|
| **Farm** | `farm_id` | Always |
| **Block** | `pu_id` | Required UNLESS whole-farm event (NULL with explicit toggle) |
| **Crop** | `production_id` | Required UNLESS no specific crop (NULL with toggle) |
| **Operator** | `created_by` | Always (auth session, never request body) |

Every event-emitting tenant table has the four anchor columns plus partial indexes:

```sql
CREATE INDEX idx_<table>_pu   ON tenant.<table> (tenant_id, pu_id)         WHERE pu_id IS NOT NULL;
CREATE INDEX idx_<table>_prod ON tenant.<table> (tenant_id, production_id) WHERE production_id IS NOT NULL;
```

Tables retrofitted to date: `tenant.cash_ledger` (migration 033). Pending: `tenant.harvest_log`, `tenant.field_events`, `tenant.labor_attendance`, `tenant.inventory_transactions` (migration 035 reserved).

### 4a.3 The (+) Button Architecture

Two-layer pattern. Both call the same form components.

**Universal (+) at topbar.** Top right. Lucide `plus-circle`, `--green`, 38px. Click opens slide-down catalog. Cmd/Ctrl+K opens catalog directly to search. Solo mode hides universal (+).

**Context (+) per page.** Top-right of each sub-page header. Pre-anchored to current farm + block + active cycle. Read-only pages have no context (+).

### 4a.4 The Universal Event Form Contract

Every form must implement:
1. Header: event type name + close + (when relevant) voice mic
2. Anchors block at top: Farm · Block · Crop · "Whole-farm event" toggle
3. Date/time field defaulting to now; backdating per Part 4a.7
4. Event-specific fields: strictly typed, controlled vocabularies
5. Notes field: single optional varchar(500)
6. Submit + Cancel

**Behavioural contract:**
- Anchors filled before event-specific fields are interactive
- Block selection auto-fills Crop from `current_production_id`
- Optimistic offline-first: IndexedDB queue → sync via Workbox
- Every successful server write emits exactly one `audit.events` row
- Toast on success carries last 8 chars of `this_hash`
- Validation: Zod client + Pydantic server (identical schemas)
- 4xx renders in-modal with field highlighting; 5xx renders with audit_event_id

**Forbidden:** more than one free-text field; edit of immutable columns; submit without anchors; submit without auth; direct DB write; form not in (+) catalog.

### 4a.5 Page-vs-Form Separation

**Pages do not write. Forms write. No inline edits anywhere.** Every UI control that looks like an edit opens a form that emits an event.

### 4a.6 Event Taxonomy — Crops Vertical (43 event types, 9 groups, Operator-locked)

**Strike #98 Rule 4 binding:** the Crops taxonomy below is Operator-locked. Taxonomies for the other 6 verticals are **not yet authored** and require dedicated Operator review sessions (per-vertical Vertical Map sessions) before being added to `shared.event_type_catalog`.

**Group 1 — Cycle & Crop:** CYCLE_CREATED · CYCLE_CLOSED · STAGE_TRANSITION

**Group 2 — Nursery & Propagation:** NURSERY_BATCH_CREATED · GERMINATION_LOGGED · NURSERY_READY · TRANSPLANT_LOGGED

**Group 3 — Field Activity:** PLANTING · IRRIGATION · FERTILIZER_APPLIED · CHEMICAL_APPLIED · WEED_MANAGEMENT · PRUNING_TRAINING · PEST_SCOUTING · DISEASE_SCOUTING

**Group 4 — Harvest & Sales:** HARVEST_LOGGED · POST_HARVEST_LOSS · GRADING · DELIVERY_DISPATCHED · DELIVERY_CONFIRMED

**Group 5 — Labor:** WORKER_CHECKIN · TASK_ASSIGNED · WAGE_PAID

**Group 6 — Cash & Inventory:** CASH_IN · CASH_OUT · INPUT_RECEIVED · INPUT_USED · EQUIPMENT_USE

**Group 7 — Observation:** WEATHER_OBSERVED · WEATHER_IMPACT · FIELD_OBSERVATION · INCIDENT_REPORT

**Group 9 — Override (FOUNDER only):** OVERRIDE_EXECUTED

**System-derived (not in catalog):** PAYMENT_RECEIVED · EVENT_CORRECTED

`TRANSPLANT_LOGGED` on the nursery side automatically emits `CYCLE_CREATED` on the field side (same transaction, both audit events chained, linked via `production_cycles.source_nursery_batch_id`).

### 4a.7 Backdating Windows

| Event | Window | Reason required when backdated? |
|---|---|---|
| HARVEST_LOGGED | 30 days; 0 if cycle past CLOSING | Yes if >7 days |
| CHEMICAL_APPLIED | 7 days | Always |
| CASH_IN / CASH_OUT | 30 days | Yes if >7 days |
| FIELD_EVENT (any subtype) | 30 days | Optional |
| TASK_COMPLETED | 7 days | Yes if >2 days |
| LABOR_ATTENDANCE | 14 days | Yes if >3 days |

Per-vertical event types (Livestock, Aquaculture, etc.) declare their own windows in `shared.event_type_catalog` when their taxonomies ship.

### 4a.8 `shared.event_type_catalog` Schema Stub

(unchanged from v4.3 — preserved as-is)

---

## PART 4b — THE FARM PILLAR (TFOS) — STRUCTURE (BINDING)

The TFOS pillar is the platform's moat. This part defines its sub-page surface, the seven verticals it organizes, and the cross-cutting features that make TFOS the best management tool in the world.

### 4b.0 The Vertical Context Doctrine (BINDING — v5.0.1)

The vertical selector at the top of the Farm pillar's left rail is the single most important navigation control in TFOS. It controls system context. Everything below it filters to the selected vertical.

This doctrine sits ABOVE the sub-page surface (4b.2), the seven verticals (4b.1), the 3-Layer Doctrine (4b.3), and every other Farm pillar feature, because it is the doctrine that organizes them all.

**Three binding rules:**

#### Rule V-1 — Vertical Selection Controls System Context

When the farmer selects a vertical from the dropdown:

- **The entire Farm pillar reloads to that vertical's context.** Every visible surface filters to that vertical:
  - Dashboard recomputes against vertical-specific data and metrics
  - All 16 sub-pages (`/farm/cycles`, `/farm/harvests`, `/farm/cash`, `/farm/labor`, etc.) show only data tagged to that vertical
  - The (+) event catalog shows only event types that belong to that vertical (per `shared.event_type_catalog.vertical_id`)
  - Decision Engine cards (`/farm/decisions`) recompute against that vertical's data only
  - Reports (`/farm/reports`) generate only against that vertical's events
  - TIS context narrows — "show me my cassava cycles" only returns Crops cycles when Crops is the active vertical
  - Tasks visible in `/farm/tasks` filter to that vertical's task source

- **No mixing.** When Crops is selected, Livestock data does not bleed into Crops dashboards, reports, or task surfaces.

- **No silent context changes.** The vertical context changes ONLY when the farmer explicitly selects from the dropdown. Cross-pillar links (TIS, Classroom, Community) do not silently switch the Farm pillar's vertical context.

#### Rule V-2 — Each Vertical Operates as a Fully Independent World

Each vertical is its own operational universe within the same farm:

- **Independent dashboard** with vertical-specific metrics. Crops dashboard surfaces yield/ha and harvest velocity. Livestock dashboard surfaces mortality rate, FCR, weight gain. Aquaculture dashboard surfaces water quality, stocking density. Floriculture dashboard surfaces weekly cutting volume.

- **Independent event taxonomy** in `shared.event_type_catalog`. Crops events (HARVEST_LOGGED, PLANTING) do not appear in Livestock's (+) catalog. Livestock events (VACCINATION, WEIGHT_CHECK) do not appear in Crops.

- **Independent 3-Layer allocation view.** A farm can be 80% CASH_FLOW in Crops (eggplant + tomato) but 100% LONG_TERM_ASSET in Horticulture (kava + mango). Each vertical's layer allocation is computed and displayed independently.

- **Independent reports.** Each vertical's reporting templates are tailored — a livestock mortality report has no parallel in crops; a harvest yield report has no parallel in livestock.

- **Independent automation rules.** A `PLANTING → fertilize_check 7d` rule belongs to Crops; a `VACCINATION → booster_check 21d` rule belongs to Livestock. Rules cannot fire across verticals.

#### Rule V-3 — The Unified Farm Dashboard Sits Above All Verticals

There must always be a Unified Farm Dashboard that aggregates across every active vertical on the farm:

- **Total farm income** — sum of CASH_IN events across all verticals, broken down by vertical
- **Total farm cash flow** — net cash position rolling up every vertical's cash ledger
- **Cross-vertical 3-Layer allocation** — a farm's CASH_FLOW total combines eggplant (Crops) + broiler poultry (Livestock) + cut flowers (Floriculture) into one CASH_FLOW figure for the whole farm
- **Cross-vertical task queue** — today's tasks across all verticals in one priority-ranked list (the same Task Engine output the farmer sees in Solo mode, but rendered as a multi-vertical view)
- **Cross-vertical alerts and compliance status** — chemical compliance, weather, livestock mortality, abandonment risk all surface here regardless of which vertical they originated in
- **Multi-vertical resource flows** — the Integrated Systems overlay (Part 4b.1) surfaces here. Poultry manure crediting to crop fertilizer, aquaponic nutrient cycles, crop residue feeding livestock — all visible in the Unified view, not in any single vertical's view.

#### Mode-Derived Default (Path C, Operator-locked 2026-05-06)

The default vertical when the farmer first opens `/farm` is mode-derived:

| Mode | Default | Reasoning |
|---|---|---|
| **Solo** | Last-used vertical (or single vertical if farmer only operates one) | ≤5 words per action rule. Solo farmer needs focused single-vertical view, not cross-vertical aggregation. |
| **Growth** | Last-used vertical | Growth farmer typically focuses on one vertical at a time even if operating two or three. Reduces cognitive load. |
| **Commercial** | Unified Farm Dashboard | Commercial farmers run multi-vertical operations daily. Cross-vertical visibility is the operational reality, not the exception. |

Mode is derived per Part 20. The vertical-default behavior follows mode automatically — no user toggle.

#### Schema Implications

**The vertical is the fifth implicit anchor.** Alongside Farm + Block + Crop + Operator (Part 4a.2), every event-emitting tenant table must carry vertical context — either explicitly via column or implicitly derived from the production_id.

```sql
-- New shared.verticals reference table (migration 075 reserved):
CREATE TABLE shared.verticals (
    vertical_id      VARCHAR(32) PRIMARY KEY,    -- 'crops', 'horticulture', 'livestock', etc.
    universal_name   VARCHAR(64) NOT NULL,
    sort_priority    INT NOT NULL,                -- build priority (1-7, 8 for integrated)
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    icon_key         VARCHAR(32),
    notes            TEXT
);

-- Formalize vertical on shared.productions:
ALTER TABLE shared.productions
  ADD COLUMN vertical_id VARCHAR(32) NOT NULL DEFAULT 'crops'
    REFERENCES shared.verticals(vertical_id);

-- Partition event taxonomy by vertical:
ALTER TABLE shared.event_type_catalog
  ADD COLUMN vertical_id VARCHAR(32) NOT NULL DEFAULT 'crops'
    REFERENCES shared.verticals(vertical_id);

-- Computed view inherits vertical via productions FK — no column needed on event tables
-- (the vertical is implicit through production_id → shared.productions.vertical_id)
```

For whole-farm events with no production anchor (CASH_IN/CASH_OUT general expenses, WORKER_CHECKIN), the vertical is determined by:
1. If the event explicitly references a `pu_id` and that block has a `current_production_id`, derive vertical from that production
2. Else if the event references a cycle, derive from cycle's production
3. Else event is "All farm / unattributed" — surfaces in Unified Dashboard only, not in any single vertical's view

#### URL + State Persistence

- **URL pattern:** `/farm/<vertical>/<sub-page>` — e.g. `/farm/crops/cycles`, `/farm/livestock/mortality`, `/farm/unified/dashboard`
- **localStorage:** persist `last_used_vertical` per farmer per device. On `/farm` open, restore (subject to mode-derived default rule above for first-time visits to a mode).
- **Deep links honor URL vertical.** Sharing `/farm/crops/cycles` opens Crops cycles directly regardless of last-used vertical.

#### Visual Indicator (binding)

The farmer must always know which vertical context they are in. Two-layer cue:

1. **Vertical dropdown** at top of left rail — sticky, shows current vertical name with check-mark.
2. **Border-left accent** on the main content area, color-coded per vertical (Crops green, Horticulture amber, Livestock soil-brown, Aquaculture blue-green, etc. — exact palette in `naming_dictionary` per vertical_id). Or alternative: a subtle vertical-specific icon in the topbar next to the page title.

When in Unified mode, accent and indicator default to neutral (cream + soil), and the topbar shows "All farm" prominently.

#### Vertical Completeness Interaction

Strict Vertical Completeness (Strike #98 Rule 5) still applies under this doctrine. The dropdown shows all 8 entries (7 verticals + Unified), but only Crops + Unified are actionable until Crops reaches 100% completion per the 7-criterion checklist (4b.1). Other verticals show the "build priority N" lock screen as designed in the v2 prototype — visible in the dropdown but inactive on selection.

Once Crops reaches 100%: Horticulture unlocks. Then Livestock. Then Aquaculture. Then Forestry. Then Floriculture. Then Protected Agriculture. Then Integrated Systems overlay opens.

The Unified Dashboard becomes meaningful when a farm operates more than one vertical. For Crops-only farmers (the pilot reality during Crops vertical build), Unified shows Crops data identically to the Crops view — no aggregation needed, but the surface still exists for forward-compatibility.

#### Forbidden under Vertical Context Doctrine (binding)

- Cross-vertical data bleed in any vertical-specific view
- Silent vertical context changes
- Forms or events that span multiple verticals (Integrated Systems overlay handles cross-vertical operations explicitly via Part 4b.1, not by violating vertical separation)
- Hardcoded vertical assumptions in code paths (everything reads `vertical_id` from data, never assumes "this is Crops")
- A Unified Dashboard that shows raw aggregate without vertical breakdown — Unified must always preserve vertical attribution within its rollups

### 4b.1 The Seven Verticals + Integrated Systems Overlay

Strict Vertical Completeness binding (Strike #98 Rule 5) — finish one vertical 100% before next opens.

| Priority | Vertical | Scope |
|---|---|---|
| 1 | **Crops** | Annual + biennial field crops. Cassava, dalo, sweet potato, yam, eggplant, tomato, cabbage, capsicum, cucumber, sugarcane, kava, cocoa, peanut, ginger, turmeric, leafy greens. |
| 2 | **Horticulture** | Tree crops, fruit, perennials. Mango, coconut, citrus, dragon fruit, banana, papaya, breadfruit, kava (perennial reading), avocado, guava, jackfruit. |
| 3 | **Livestock** | Six sub-verticals: Poultry (broilers/layers/breeders), Cattle, Goats, Pigs, Sheep, Apiculture (bees). |
| 4 | **Aquaculture** | Tilapia, prawns, mud crab, milkfish, seaweed (kappaphycus). |
| 5 | **Forestry** | Mahogany, sandalwood, pine, native species (vesi, dakua, dilo), agroforestry. |
| 6 | **Floriculture** | Cut flowers, ornamentals, landscaping. Heliconia, ginger flowers, anthurium, orchid. |
| 7 | **Protected Agriculture** | Greenhouse, shade-house, hydroponics, nursery operations. |
| Overlay | **Integrated Systems** | Cross-vertical operations. Recognizes shared inputs, dependencies, task chains across multiple verticals on the same farm (e.g., poultry manure → crop fertilizer credit). Built ONLY after all 7 verticals individually complete. |

**Each vertical is the full stack:** event taxonomy → schema → forms → dashboards → reports → 3-Layer integration → TIS context wiring.

**"Crops 100% complete" is defined by a 7-criterion checklist:**
1. Event taxonomy locked, Operator-reviewed per Strike #98 Rule 4
2. Form coverage: every event has a Universal Event Form Contract-conforming form
3. Schema completeness: 4-anchor compliance verified, zero NULLs without explicit toggle
4. Variety catalog: Operator-locked rows in `shared.crop_varieties`, no `is_provisional=TRUE`
5. 3-Layer integration: every cycle has non-NULL layer (after Strike #104c NOT NULL constraint)
6. Dashboard + reporting: surfaces match prototype contract
7. TIS integration: TIS can answer Crops-specific questions grounded in the farmer's actual Crops data

Each criterion verifiable by query, browser, or document. No "looks done" allowed.

### 4b.2 The 16 TFOS Sub-Pages

The Farm pillar's authoritative sub-page surface. **Pages render. Forms write.**

| Sub-page | Purpose | Reads from | Writes via |
|---|---|---|---|
| `/farm` (index) | Farm overview, today's signals | computed views | — |
| `/farm/blocks` | Production units, geometry, current crop, capacity | `production_units` + computed | (+) → block events |
| `/farm/cycles` | Active + past cycles with **Causal Chain trace** | `production_cycles` + audit chain | (+) → CYCLE_*, STAGE_* |
| `/farm/nursery` | Nursery batches, propagation, transplant | `nursery_batches` | (+) → NURSERY_* |
| `/farm/tasks` | Task queue (today / upcoming / done) — **operational surface** | `task_queue` | task completion → events |
| `/farm/livestock` | **Group-first**, individual opt-in | `livestock_groups` + `livestock` | (+) → LIVESTOCK_* (per sub-vertical taxonomy when ready) |
| `/farm/inventory` | Inputs + outputs + storage + transactions | `inventory_*` | (+) → INPUT_*, transfers |
| `/farm/labor` | Worker check-in, wages, GPS attendance | `labor_*` | (+) → WORKER_*, WAGE_PAID |
| `/farm/cash` | Cash in/out ledger with 4-anchor model | `cash_ledger` | (+) → CASH_IN, CASH_OUT |
| `/farm/buyers` | Buyer CRM, delivery history, invoices | `buyers` + `deliveries` | (+) → DELIVERY_*, invoice |
| `/farm/equipment` | Equipment registry, maintenance, fuel | `equipment` | (+) → EQUIPMENT_USE, repair |
| `/farm/weather` | Forecast + observations + impact log | API + observations | (+) → WEATHER_OBSERVED |
| `/farm/compliance` | Chemical WHD status, certifications, audit-ready | `harvest_log` + `chemical_*` | (read-only) |
| `/farm/decisions` | **12 standing-answer cards** | Decision Engine snapshots | (read-only) |
| `/farm/reports` | 8 fixed report templates → PDF + CSV | computed | (read-only) |
| `/farm/automation` | **Event-chained + schedule-chained rules**, visible | `automation_rules` | admin-only |

**Removed/never-was:** Calendar (a view toggle inside `/farm/tasks`), Storefront (Phase 8+), Custom Report Builder (replaced by 8 fixed reports).

### 4b.3 The 3-Layer Doctrine (Strike #101 — strategic backbone)

**Every cycle classified into one of three layers.** This is the cross-cutting intelligence layer that lets TFOS think about a farm's operation the way the farmer should think about it. Drives dashboards, TIS recommendations, Classroom curriculum prioritization, allocation drift detection, and reporting.

| Layer | What it represents operationally | Pacific examples |
|---|---|---|
| **CASH_FLOW** | Short-cycle revenue (4-12 weeks). Predictable monthly/weekly income. The farmer's working capital engine. | Eggplant, tomato, cabbage, capsicum, cucumber, leafy greens, broiler poultry, cut flowers, hydroponic lettuce |
| **FOOD_SECURITY** | Household resilience. Subsistence + surplus. Reduces vulnerability to market shocks. | Cassava, dalo, sweet potato, yam, breadfruit, family pigs, family chickens, subsistence fish ponds |
| **LONG_TERM_ASSET** | Strategic accumulation. Multi-year investment, wealth-building. | Kava, mango, coconut, dragon fruit, citrus, breeding cattle, mahogany, sandalwood, hive infrastructure |

**Schema (live since Migration 072):**

```sql
-- shared.farm_layer ENUM ('CASH_FLOW', 'FOOD_SECURITY', 'LONG_TERM_ASSET')

ALTER TABLE shared.productions
  ADD COLUMN suggested_layer farm_layer,
  ADD COLUMN requires_classification_at_creation BOOLEAN DEFAULT FALSE,
  ADD COLUMN layer_rationale TEXT;

ALTER TABLE tenant.production_cycles
  ADD COLUMN layer farm_layer;  -- nullable until Strike #104c NOT NULL constraint
```

**Borderline crops** (`requires_classification_at_creation=TRUE`): sugarcane, garlic, banana, pineapple, peanut, potato, turmeric. Cycle creation **forces** explicit farmer pick (no pre-fill) for these.

**Every farm declares its layer mix at onboarding** (Strike #101 Rule 5, implemented in Strike #104b queued). Per-farm declared layer mix can override per-production `suggested_layer` for that farm's cycles.

**The 3-Layer Doctrine is what makes TFOS understand farms the way farmers should.** It is the *most important* downstream artifact of TFOS being the moat — it lets the management tool reason about strategy, allocation drift, and resilience the same way an experienced farmer naturally does.

### 4b.4 The Causal Chain (audit-anchored computed view — byproduct)

Every cycle has a single traceable chain of events from input to revenue:

```
INPUT_RECEIVED → INPUT_USED → CYCLE_CREATED → STAGE_TRANSITION (×N) →
  HARVEST_LOGGED → DELIVERY_DISPATCHED → DELIVERY_CONFIRMED → CASH_IN
```

Surfaced on `/farm/cycles` as a "trace" view per cycle. Each node is a real `audit.events` row with `this_hash`. **This is a byproduct of clean event capture, not a feature designed for the bank.** Banks can use it; the farmer doesn't need to know it exists.

### 4b.5 Automation Rules Taxonomy (Event-Chained vs. Schedule-Chained)

`shared.automation_rules` extended with two explicit categories:

```sql
ALTER TABLE shared.automation_rules
  ADD COLUMN trigger_type VARCHAR(16) NOT NULL DEFAULT 'schedule',
    CHECK (trigger_type IN ('event','schedule')),
  ADD COLUMN trigger_event VARCHAR(64),
  ADD COLUMN delay_days INT,
  ADD COLUMN spawn_task_template VARCHAR(64);
```

**Event-chained:** `PLANTING` → spawn `fertilize_check` task in 7 days.
**Schedule-chained:** Cron `0 6 * * *` → spawn `morning_inspection` task daily.

Rules visible in `/farm/automation`. Commercial-tier sellable feature. Migration 036 reserved.

### 4b.6 Group-First Livestock

For low-individual-tracking contexts (8-goat herds, beehives, smallholder chickens), schema:

```sql
CREATE TABLE tenant.livestock_groups (
    group_id        UUID PRIMARY KEY,
    tenant_id       UUID NOT NULL,
    farm_id         UUID NOT NULL,
    group_type      VARCHAR(32) NOT NULL,
    group_label     VARCHAR(64) NOT NULL,
    current_count   INT NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant.livestock
  ADD COLUMN group_id UUID NOT NULL REFERENCES tenant.livestock_groups(group_id),
  ALTER COLUMN individual_id DROP NOT NULL;
```

Bulk events emit one row with `group_id` + `affected_count` + optional `individual_ids[]`. Individual tracking opt-in for high-value animals (breeding stock, dairy). Default = group. Migration 037 reserved.

### 4b.7 Block Capacity Calculation

(unchanged from v4.3 — `shared.crops` extended with spacing + expected yield, function `tenant.calculate_pu_capacity` surfaces in cycle creation as soft-warning when farmer plants denser/sparser than spec)

### 4b.8 Decision Engine Card Stack (12 standing-answer cards)

`/farm/decisions` renders 12 cards, each backed by Decision Engine snapshots:

1. What should I plant next? (rotation gate + market signal + season + 3-Layer mix)
2. Which block is losing money? (cycle_financials ROI ranking)
3. Which crop is overdue? (cycle stage vs. expected)
4. Where am I overspending? (cash_ledger anomaly detection)
5. Which buyer pays slowest? (buyer_payments outstanding)
6. What's my cash runway? (13-week forecast)
7. Which inputs run out first? (stock_days_remaining ranking)
8. What's my compliance score? (chemical violations / applications)
9. What's my yield trend? (last 4 cycles per crop)
10. Which worker is most productive? (labor_attendance + harvest attribution)
11. What weather risk is approaching? (7-day forecast + pest pressure)
12. Am I ready for a loan? (credit-readiness score, evidence completeness — byproduct)

Each card cites its evidence (audit_event_ids). Read-only. No (+).

---

## PART 4c — THE MIGRATION PROCEDURE (verified live 2026-04-28)

(unchanged from v4.3 — preserved as-is)

Runtime DB user `teivaka_app` does not own `tenant.*` tables and cannot run DDL. Override at exec time using `teivaka` superuser:

```bash
docker exec -e DATABASE_URL="postgresql+asyncpg://teivaka:<pwd>@db:5432/teivaka_db" \
  teivaka_api alembic upgrade head
```

Verify:

```bash
docker exec teivaka_db psql -U teivaka -d teivaka_db \
  -c "SELECT version_num FROM tenant.alembic_version;"
docker exec teivaka_db psql -U teivaka -d teivaka_db \
  -c "\d tenant.<changed_table>"
```

Code changes touching new schema deploy only after Alembic head matches expected revision.

**Long-term fix (backlog):** separate `MIGRATION_DATABASE_URL` env + dedicated `teivaka_migrator` role.

---

## PART 5 — DATABASE ARCHITECTURE RULES (INVIOLABLE)

### Schema Separation

```
shared.*     — Platform-wide. No tenant_id. Read-only at runtime.
               Write exceptions:
                 - shared.kb_article_candidates (TIS Layer 2 logging)
                 - shared.attribution_events    (growth analytics)
                 - shared.naming_dictionary     (admin-only, build-time)
                 - shared.kb_articles           (admin-only)
                 - shared.event_type_catalog    (admin-only)
                 - shared.crop_varieties        (admin-only)
               Read-only at runtime: kb_articles, productions, crop_stages,
               chemical_library, rotation_rules, price_master,
               pest_disease_library, weed_library, automation_rules,
               event_type_catalog, naming_dictionary, crop_varieties

tenant.*     — Per-farm data. tenant_id on every row. Protected by RLS.
               4-anchor on event-emitting tables.

community.*  — Migration 017. NOT tenant-scoped.
               Tables: posts, post_likes, post_comments, follows, user_blocks, post_flags.

learning.*   — Migration 017. User-scoped.
               Tables: progress, bookmarks.

auth.*       — Users, tenants, sessions.

ops.*        — Monitoring (health_checks, alert_events).

audit.*      — Append-only hash-chained.
               Tables: events, report_exports.
               REVOKE UPDATE, DELETE from all roles.
```

### Schema Reality Drift List — AUTHORITATIVE

This list overrides spec wherever they disagree. Verified against live DB as of 2026-05-06.

| Table / Identifier | Correct | Do NOT use |
|---|---|---|
| Database | `teivaka_db` | teivaka_prod |
| RLS session var | `app.tenant_id` | app.current_tenant_id |
| Alembic version | `tenant.alembic_version` | public.alembic_version |
| `tenant.production_cycles` status | `cycle_status` (PLANNED, ACTIVE, HARVESTING, CLOSING, CLOSED, FAILED) | status, COMPLETED |
| `tenant.production_cycles.layer` | `layer` (farm_layer enum, nullable until #104c) | — |
| `tenant.alerts` status | `alert_status` | status |
| `tenant.harvest_log` qty | `qty_kg`, `pu_id`, `chemical_compliance_cleared` | quantity_kg, etc. |
| `tenant.cycle_financials` | `total_harvest_kg`, `last_computed_at` | total_harvest_qty_kg |
| `shared.chemical_library` | `chem_name`, `withholding_period_days`, `registered_crops` (text[]) | product_name, whd_days |
| `shared.productions` (v5.0) | `suggested_layer` (farm_layer), `requires_classification_at_creation` (bool), `layer_rationale` (text) | — |
| `shared.crop_varieties` | live since migration 070 (101 rows: 6 Operator-locked + 95 provisional) | — |
| `audit.events` payload | `payload_jsonb` | payload |
| `audit.events` timestamps | `occurred_at` + `created_at` | received_at (no such column) |
| `tenant.task_queue` entity link | `entity_type` + `entity_id` polymorphic | source_reference->>'cycle_id' jsonb |
| `tenant.production_units` | `pu_name`, `farmer_label` | name, display_name |
| `tenant.cash_ledger` (P-Doctrine-2) | `pu_id`, `production_id` (both nullable) | — |

### Row Level Security — Non-Negotiable

(unchanged from v4.3)

Every `tenant.*` table has RLS with USING + WITH CHECK on `tenant_id`. Set context at session start: `SET app.tenant_id = '<uuid>'`. Never bypass except for system Celery workers with explicit `SET ROLE` + logged bypass.

### Migration Rules

(unchanged from v4.3 — Alembic only, reversible, asyncpg-compatible, no DROP without deprecation period, container rebuild required)

### The pgvector Index

(unchanged — KB embeddings via text-embedding-3-small, ivfflat index, threshold 0.65 from env)

---

## PART 6 — THE TIS GROUNDED INTELLIGENCE MODEL (NEVER HALLUCINATE)

(unchanged from v4.3 — three-layer hierarchy: VALIDATED_KB → REGIONAL_INTELLIGENCE → GENERAL_AGRONOMY)

### v5.0 Update — Regional Intelligence Layer

Layer 2 was previously named "FIJI_INTELLIGENCE" — renamed to **REGIONAL_INTELLIGENCE** to reflect platform reach. Each region has its own intelligence pack:

- `FIJI_FARM_INTELLIGENCE.md` — pilot region
- Future packs: `TONGA_FARM_INTELLIGENCE.md`, `SOLOMONS_FARM_INTELLIGENCE.md`, etc.
- Regional pack injected based on farmer's `auth.tenants.region_code`

Layer 2 standard: must pass the **Experienced Regional Farmer Test** — would an experienced farmer in this specific region find the answer accurate, useful, specific, and grounded in local pests, products, prices, and seasons?

### TIS as Agentic Companion

TIS is not a Q&A bot. TIS is the AI mentor anchored in the farmer's real operation. TIS:
- Reads the farmer's full TFOS event log (RLS-scoped)
- Cites the layer of every response (Layer 1/2/3)
- Generates tasks (every advisory outcome → `tenant.task_queue` row with `source_module='TIS'`)
- Detects knowledge gaps (logs to `kb_article_candidates` for Classroom curriculum)
- Proactively pings farmers when significant events occur (chemical violation, weather event, abandonment risk)

The 12 Command Types (LOG_HARVEST, LOG_FIELD_EVENT, etc.) are unchanged from v4.3.

---

## PART 7 — THE TASK ENGINE AS NERVOUS SYSTEM (BINDING)

(largely unchanged from v4.3 — preserved with v5.0 framing additions)

The Task Engine is **the** module. Every other engine (Automation, Decision, Weather, Rotation, Compliance, Market, TIS) exists to produce tasks. Nothing is shown to a farmer unless it becomes a task.

### Cross-Pillar Convergence

The Task Engine is also where the **four pillars converge**:
- **TFOS** event submissions auto-spawn 0-N derived tasks
- **Classroom** curriculum recommendations become tasks ("Read this article — 5 min")
- **Community** insights become tasks ("3 farms in your region tried this — try it next cycle")
- **TIS** recommendations become tasks ("Should I harvest? Yes — task created")

Pages render. Forms write. Tasks are the contract surface between all four pillars and the farmer's daily flow.

### Binding Rules T-1 through T-7

(unchanged — preserved as-is)

### Task Source Catalog (v5.0 reframe)

| Source | Example |
|---|---|
| Crop stage clock | "Water eggplant bed 3 today" |
| Weather forecast | "Don't spray — rain expected 14:00" |
| Chemical WHD | "Eggplant Block 2 cleared to harvest tomorrow" |
| Rotation gate | "Next cycle: plant cassava here, not eggplant" |
| Decision Engine signal flip | "Yield 20% below forecast — check pest pressure" |
| TIS conversation | "You said the beehive looks weak — inspect Tuesday" |
| Buyer demand | "Nayans wants 40kg Grade A by Thursday" |
| Worker calendar | "Pay Laisenia FJD 85 today" |
| Per-farm operational rule (e.g. F002 ferry buffer) | "Order diesel before Friday — ferry cutoff" *(now an optional per-farm rule, not a platform-wide CRITICAL rule)* |
| Classroom curriculum | "Watch this 3-min video on cassava mosaic" |
| Community pattern | "5 farms in your region reported pest X — scout this week" |

### API Contract

(unchanged — `GET /api/v1/tasks/next` for Solo/Growth/Commercial, `POST /api/v1/tasks/{id}/complete`)

---

## PART 8 — THE AUTOMATION ENGINE RULES

### Architecture

- 38 active rules + 5 inactive (RULE-024-028: aquaculture/pig)
- Celery Beat fires daily 06:00 Fiji
- Engine loops by `trigger_category`
- All rule outputs route through Task Engine (Rule T-7)
- v4.3 split: event-chained vs. schedule-chained (Part 4b.5)

### v5.0 Reframe — Per-Farm vs. Platform-Wide Rules

Automation rules now have two scopes:

**Platform-wide rules** apply to every farm regardless of region or context. Examples:
- RULE-018 cash threshold (FJD 100 default, configurable per farm)
- RULE-021 livestock mortality (CRITICAL, event-triggered)
- RULE-038 chemical compliance (auto-resolve when WHD elapses)

**Per-farm operational rules** apply only when the farm has opted in or the farm's context requires them. Examples:
- **RULE-034 ferry buffer (F002 only)** — fires when F002-coded inputs run below `lead_time_days + 7`. Per-farm `lead_time_days` configurable. **NOT a platform-wide CRITICAL rule.** F002 has it because F002's geography requires it; mainland farms do not.
- Region-specific weather rules (cyclone prep, etc.)
- Region-specific market rules (export window timing for floriculture, etc.)

This separation prevents F002 Kadavu's specific operational realities from being overweighted as platform doctrine.

### Deduplication, Escalation

(unchanged from v4.3)

### Chemical Compliance — Standard Agricultural Safety

API check + DB trigger. Both always active. **This is standard agricultural safety enforcement — not platform-sacred doctrine.** The dual-layer is binding because food safety violations harm farmers (rejected harvests, lost buyer trust, regulatory exposure), but the framing is "TFOS does what every good ag management tool should do" — not "TFOS's sacred core."

When `POST /harvests` is called:
1. API layer (`harvest_service.check_chemical_compliance`) runs first → HTTP 409 on violation
2. PostgreSQL trigger `tenant.enforce_harvest_compliance` re-checks → raises `CHEMICAL_COMPLIANCE_VIOLATION`

`shared.chemical_library`: `withholding_period_days`, `chem_name`, `registered_crops` (text[]). Never hardcode WHD.

**FOUNDER override:** stored on `harvest_log` row. Override sends CRITICAL WhatsApp + emits `audit.events` row. DB trigger cannot be bypassed via API.

**Frontend 409 contract:** when POST /api/v1/harvests returns 409, form displays a blocking modal showing `detail.error.data.blocking_chemicals[]`. No silent retry.

(The change from v4.3 is positioning, not behavior. Compliance still works the same way; it's no longer described as the platform's sacred core.)

---

## PART 8a — THE CONVERGENCE MANDATE (binding on every session)

The production build is converging on the prototype. Every session must answer one question before proposing work:

> **"Does this step bring production closer to the prototype contract while preserving everything verified live?"**

If yes — proceed.
If no — the work is debt. Park it or reject it.

Convergence measured against:
- **Visual:** CSS tokens, shell layout (56px topbar, 220px left rail), pillar nav
- **Behavioural:** every action emits a toast carrying its `audit.events` hash; TIS responses cite layer; Solo never asks for >5 words read; chemical 409 blocks harvest
- **Data:** every event row carries the four anchors
- **Language:** every farmer-facing string flows through `name(concept_key)`
- **Sequencing:** TFOS-as-moat work is prioritized; all four pillars converge meaningfully through the Task Engine
- **Vertical Completeness:** Crops 100% before any other vertical opens (Strike #98 Rule 5)

The prototype is the destination. Reality is the starting point. Walk one verified step at a time.

---

## PART 9 — THE DECISION ENGINE RULES

(unchanged from v4.3 — 13 signals, daily 06:05 Fiji, feeds Task Engine + 12 cards on /farm/decisions)

### v5.0 Update — Allocation Drift Signal

Strike #107 queued: adds a 14th signal — **Layer_Allocation_Drift**. Detects when farmer's actual layer mix drifts >10pp from declared target. Drives task generation ("Your CASH_FLOW dropped to 20% — consider planting a quick cycle").

---

## PART 10 — CHEMICAL COMPLIANCE ENFORCEMENT

(see Part 8 v5.0 reframe — standard agricultural safety, dual-layer binding, proportionate)

---

## PART 11 — ROTATION GATE RULES

(unchanged from v4.3)

---

## PART 12 — FINANCIAL RULES

### CoKG, Cash Balance, Profit Share, 13-Week Forecast

(unchanged from v4.3)

### Credit Score (Phase 9 — byproduct, not centerpiece)

A FICO-analog 300-850 score composed weekly. **This is a byproduct of TFOS being the moat, not the moat itself.** Farmers don't open TFOS for the credit score; they open it to know what to do today. The credit score accumulates automatically because they used the tool.

(Weight composition unchanged from v4.3)

### Bank Evidence PDF (byproduct)

Auto-generated monthly. Farmer can share via QR. Lender scans → verifies hash chain via `/verify/{audit_event_id}`. **This is a downstream win, not the primary product.**

Phase 9 ships the verification endpoint and the PDF dispatcher. By Day 60 of the 90-day map, one real Bank Evidence PDF dispatched to Operator's WhatsApp. **Phase 9 is pulled forward in the schedule because it unlocks credit access for pilot farmers — but it remains framed as TFOS's automatic exhaust, not its purpose.**

---

## PART 13 — SUBSCRIPTION TIERS AND TRIAL

(unchanged from v4.3 — FREE / BASIC FJD 49/mo / PREMIUM FJD 149/mo / CUSTOM)

### v5.0 Update — Multi-Currency at Scale

Phase 13+ adds non-FJD pricing for Pacific + global expansion. M-PAiSA remains primary for Fiji. Per-region payment rails configured at tenant level.

---

## PART 14 — GROWTH AND MONETIZATION (PHASE 3.5)

(unchanged from v4.3)

---

## PART 15 — API DESIGN RULES

(unchanged from v4.3 — JWT, response envelope, mode gating, pre-computed endpoints)

### v5.0 Endpoint Additions (Strike #104b → #108 queued)

```
GET  /api/v1/farms/{farm_id}/layer-strategy        — Strike #104b
PATCH /api/v1/farms/{farm_id}/layer-strategy       — Strike #104b
GET  /api/v1/cycles/needing-classification         — live (Strike #104a)
PATCH /api/v1/cycles/{cycle_id}/classify-layer     — live (Strike #104a)
GET  /api/v1/crop-varieties                        — live (Strike #100)
GET  /api/v1/farms/{farm_id}/layer-allocation      — Strike #107
GET  /api/v1/causal-chain/{cycle_id}               — Phase 9 byproduct
GET  /verify/{audit_event_id}                      — Phase 9 public byproduct
```

---

## PART 16 — CROP-SPECIFIC HANDLING

### Kava Special Handling

Kava (CRP-KAV) is a 4+ year crop. Standard crop assumptions do not apply.
- RULE-017 threshold: 180 days (not 7 days)
- Cycle duration: 4-5 years — never flag the 90% rule
- Primary disease: kava dieback (yellowing, root rot)
- Local name: yaqona (Fiji), 'awa (Hawaii), sakau (FSM)
- Layer classification: LONG_TERM_ASSET

### Other crop-specific edges (Phase 12+)

Per-crop multi-year handling for cocoa, mango, coconut, citrus, sandalwood, mahogany. Each gets its own cycle-duration override. Encoded in `shared.crops.cycle_duration_max_days` + `shared.crops.is_perennial`.

---

## PART 17 — OFFLINE SYNC AND PWA RULES

(unchanged from v4.3 — 7-day offline floor, F002 reference user, IndexedDB queue, Workbox, conflict resolution)

### v5.0 Reframe

F002 Kadavu remains the offline-first reference user (Inviolable #12). Every Solo flow must work without network for 7 days. **This is universal smallholder reality, not a Fiji-only quirk.** A farmer in rural Vanuatu, a farmer in the Solomons, a farmer in Bougainville, a farmer in rural Kenya — all face similar connectivity reality. F002 is the test case; the principle is global.

---

## PART 18 — VOICE PIPELINE (PHASE 5)

(unchanged from v4.3 — Whisper + TIS interpreter + TTS confirmation, < 5 sec total)

### v5.0 Update — Multi-Language Voice

Phase 12+ ships voice models for Pacific languages (Fijian, Tongan, Samoan, Bislama, Tok Pisin) and global expansion languages. Each region's voice pipeline tuned to local accents.

---

## PART 19 — TIMING AND SCHEDULING RULES

(unchanged from v4.3)

### v5.0 Status

All scheduled engines OFFLINE due to Celery silent outage. Week 1 priority to restore.

---

## PART 20 — THE THREE ADAPTIVE MODES (BINDING)

(unchanged from v4.3 — Solo / Growth / Commercial, derived not toggled)

### v5.0 Cross-Mode Consistency

All modes emit the same `audit.events`. A Kadavu Solo farmer's harvest and an Australian Commercial plantation's harvest produce identical audit rows. Same credit-readiness algorithm, same Bank Evidence PDF, same hash chain. **This is the democratizing primitive — not as the moat itself, but as the infrastructure that makes TFOS useful at every scale.**

---

## PART 21 — INPUT MINIMIZATION CATALOG (BINDING)

(unchanged from v4.3 — voice + camera + tap before typing; max one free-text field per form)

---

## PART 22 — BANK EVIDENCE SYSTEM (AUTOMATIC ACCRUAL — BYPRODUCT)

(largely unchanged from v4.3, repositioned per v5.0)

Every task completion, voice-confirmed yield, GPS-verified attendance writes to `audit.events` automatically. Farmers do nothing to build this record — it accrues as exhaust from using TFOS.

`audit.events` schema, hash chain verification, audit event requirements, Bank Evidence dispatch, public verification endpoint, causal chain endpoint — all preserved as in v4.3.

### v5.0 Repositioning

The Bank Evidence System is **TFOS's automatic exhaust, not its purpose.** Farmers who use TFOS for management get bankability as a downstream win. The system architecture treats audit chain as foundational data integrity, not as the platform's sacred core.

This means:
- `audit.events` integrity remains binding (no UPDATE, no DELETE, hash chain walked on every deploy)
- The chain emerges as a byproduct of clean event capture, which TFOS demands for management reasons
- Phase 9 (verification endpoint, monthly PDF dispatcher, credit score) ships ahead of Phase 5/5.5/6.5 because it converts the byproduct into farmer-visible value, but it does not redefine the platform's identity

---

## PART 23 — ABANDONMENT PREVENTION PROTOCOL (BINDING)

(unchanged from v4.3 — Day-3 ≥70% / Day-7 ≥50% retention targets, escalation ladder, positive reinforcement)

---

## PART 24 — THE NON-NEGOTIABLES (drift here = mission failure)

1. **Chemical compliance dual-layer enforcement.** API check + DB trigger. Both always active. Never bypassed without `OVERRIDE_EXECUTED` audit row + WhatsApp to Operator. Standard agricultural safety, proportionately enforced.
2. **Audit chain integrity.** No UPDATE, no DELETE on `audit.events`. Every tenant write emits one event. Hash chain walked end-to-end on every deploy.
3. **Solo mode reading load.** Never ship a Solo screen requiring more than five words read per action. Voice TTS auto-plays on every task card.
4. **Mode is derived, never toggled.** No user-facing mode switch in production.
5. **No direct module-to-farmer-surface writes.** Everything routes through Task Engine.
6. **`shared.*` is read-only at runtime** except documented exceptions.
7. **Migrations only via documented procedure** (Part 4c).
8. **One canonical file per concept.** No `_v2`/`_v3`/`_addendum` files.
9. **No Stripe in Phase 3.5b.** M-PAiSA primary. Stripe is Phase 8 overseas only.
10. **No second icon library.** lucide-react only.
11. **Never commit to `main`.**
12. **F002 Kadavu is the reference user, not the edge case.** Universal smallholder reality, not a Fiji quirk.
13. **Every farmer-facing string flows through the naming dictionary.**
14. **Every event row carries the four anchors.** Farm + Block + Crop + Operator.
15. **Pages never edit. Forms write. Inline editing is forbidden.**
16. **TFOS is the moat.** Every architectural decision serves the management tool first; downstream byproducts (Bank Evidence, credit score, public verification) emerge from a strong tool, not the other way around.
17. **Every cycle carries a 3-Layer classification.** (Strike #101 Rule 1, NOT NULL after #104c)
18. **Strict Vertical Completeness.** Crops 100% before any other vertical opens. (Strike #98 Rule 5)
19. **No best-guess Architect-authored taxonomies.** Every event taxonomy needs Operator review per item before shipping. (Strike #98 Rule 4)
20. **The platform is built for Pacific and global smallholders.** F001 + F002 are the pilot, not the product.
21. **The Vertical Context Doctrine governs all Farm pillar navigation.** Selecting a vertical reloads the entire Farm pillar to that vertical's context. Each vertical is a fully independent operational world. Unified Farm Dashboard sits above all verticals. Mode-derived default: Solo/Growth = last-used vertical; Commercial = Unified. (Part 4b.0 binding)

---

## PART 25 — THE FORBIDDEN MOVES

The Architect and Claude Code do not, ever, under any framing:

1. Edit code on production directly.
2. Run schema-mutating SQL on prod outside Alembic.
3. Commit to `main`.
4. Skip Recon (Step 1 of Cadence).
5. Skip Verify (Step 3).
6. Skip Platform Check (Step 5).
7. Generate `_v2`/`_v3`/`_addendum` files.
8. UPDATE or DELETE rows in `audit.events`.
9. Hardcode chemical withholding period values.
10. Show profit-share when `farms.profit_share_rate_pct IS NULL`.
11. Treat F002 Kadavu as an edge case.
12. Bring Stripe into Phase 3.5b.
13. Run `claude --dangerously-skip-permissions` for state-mutating operations without explicit Operator-approved paste pack.
14. Mix paste-pack and advisory modes.
15. Defer doc reconciliation when reality drifts.
16. Hardcode farmer-facing strings.
17. Write a form violating Universal Event Form Contract.
18. Build inline-edit affordances.
19. Bypass the four-anchor model.
20. Add an event type without a `shared.event_type_catalog` row.
21. Hallucinate agronomic advice.
22. Compute dashboard signals on-demand.
23. Apply 7-day harvest gap to kava.
24. Frame ferry-buffer logic as platform-wide CRITICAL doctrine. Per-farm operational rule only.
25. Expose stack traces in API responses.
26. Activate RULE-024-028 (aquaculture/pig) without Operator approval.
27. Create duplicate alerts/tasks within 24h.
28. Skip webhook signature verification.
29. Drop a column without deprecation migration.
30. Make phone number a hard signup requirement.
31. Rebuild api/worker-ai container with ML libraries.
32. Show profit share to Nayans with null rate.
33. Use a column name conflicting with Schema Reality Drift List.
34. Change 5-pillar nav contract without Operator approval.
35. Introduce a second icon library.
36. Ship a Beginner/Commercial mode toggle.
37. Have any module write directly to farmer surface.
38. Ship a Solo screen requiring >5 words read per action.
39. Ship a farmer-facing form with >1 free-text field.
40. Show a dashboard as Solo mode default.
41. UPDATE/DELETE `audit.events` rows.
42. Compute credit score on-demand.
43. Touch Sacred Files (Part 26) without explicit Operator instruction.
44. Define a React sub-component inside a parent component function.
45. Touch files outside task scope.
46. Reorder or delete existing routes in `App.jsx`.
47. Build a sub-page or form before naming dictionary populated for relevant concepts.
48. **Build any vertical work for Horticulture, Livestock, Aquaculture, Forestry, Floriculture, or Protected Agriculture before Crops vertical reaches 100% completion per the 7-criterion checklist.** (Strike #98 Rule 5 binding)
49. **Author per-vertical event taxonomies as Architect best-guess without Operator review.** (Strike #98 Rule 4 binding)
50. **Ship a cycle without a 3-Layer classification.** (Strike #101 Rule 1 binding; NOT NULL pending Strike #104c)
51. **Frame Bank Evidence as the platform's primary product.** It is a byproduct of TFOS being the moat. Build TFOS first; bankability accrues.
52. **Allow cross-vertical data bleed** in any vertical-specific view (dashboard, sub-page, report, Decision card, TIS response). Each vertical is an independent operational world. (Part 4b.0 Rule V-2)
53. **Silently change the active vertical context.** Vertical context changes ONLY when the farmer explicitly selects from the dropdown or follows a vertical-scoped URL. (Part 4b.0 Rule V-1)
54. **Build a Unified Dashboard that loses vertical attribution.** Unified must always preserve per-vertical breakdown within rollups — no raw aggregates. (Part 4b.0 Rule V-3)
55. **Hardcode vertical assumptions in code paths.** Code reads `vertical_id` from data; never assumes "this is Crops" or any specific vertical. (Part 4b.0)

---

## PART 26 — THE SACRED FILES (do not modify without explicit Operator approval)

(unchanged from v4.3)

- `TFOS_Platform_Interactive_Prototype.html`
- `Landing.jsx`, `Login.jsx`, `Register.jsx`, `VerifyEmail.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`
- `pages/farmer/TIS.jsx`
- `components/nav/BottomNav.jsx`, `components/nav/TopAppBar.jsx`
- `layouts/FarmerShell.jsx`, `pages/farmer/FarmDashboard.jsx`, `pages/farmer/HarvestNew.jsx`
- `Caddyfile.production`, `/opt/tis-bridge/server.js`, OpenClaw `tis` systemd unit
- Alembic migrations 001 through current head (now 072)
- `robots.txt`, `sitemap.xml`, `index.html` SEO meta tags
- `App.jsx` routing — additive only

---

## PART 27 — VERIFICATION GATES

(unchanged from v4.3 — post-migration, post-Task-Engine, post-TIS, post-automation, post-frontend, post-API, post-git, naming dictionary gate)

### v5.0 Addition — 3-Layer Verification Gate

After any work touching cycles or layer classification:

```sql
-- No cycle should be NULL once Strike #104c lands
SELECT count(*) FROM tenant.production_cycles WHERE layer IS NULL;
-- Expected post-#104c: 0

-- Borderline crops must have requires_classification_at_creation=TRUE
SELECT production_id, requires_classification_at_creation
FROM shared.productions
WHERE production_id IN ('CRP-SUG','CRP-PNT','CRP-POT','CRP-TUR',
                        'CRP-GAR','FRT-BAN','FRT-PIN');
-- Expected: all TRUE
```

### v5.0.1 Addition — Vertical Context Doctrine Gate

After any work touching the Farm pillar navigation, dashboards, or vertical-scoped surfaces:

```sql
-- shared.verticals seeded with all 8 entries (7 verticals + integrated overlay)
SELECT vertical_id, sort_priority FROM shared.verticals ORDER BY sort_priority;
-- Expected: crops(1), horticulture(2), livestock(3), aquaculture(4),
--           forestry(5), floriculture(6), protected(7), integrated(8)

-- Every active production carries a vertical_id
SELECT count(*) FROM shared.productions WHERE is_active=TRUE AND vertical_id IS NULL;
-- Expected: 0

-- Every event type is partitioned by vertical
SELECT count(*) FROM shared.event_type_catalog WHERE vertical_id IS NULL;
-- Expected: 0
```

Browser walk-through after any vertical-context UI work:
1. Open `/farm` in Solo mode → confirm last-used vertical loads, single-vertical view
2. Switch mode to Commercial → reload → confirm Unified dashboard renders with cross-vertical rollup
3. Select a non-Crops vertical → confirm "build priority N" lock screen renders, no actionable surface
4. Select Crops → switch to Cycles sub-page → URL shows `/farm/crops/cycles` → reload page → vertical context preserved from URL
5. Switch to a different vertical via dropdown → URL updates → previous vertical's data not visible

---

## PART 28 — OPEN QUESTIONS

(unchanged from v4.3 with v5.0 additions)

| # | Question | Blocking? | Default |
|---|---|---|---|
| Q1 | F001 profit share rate | NO — hidden by NULL | Hide profit share tab |
| Q2 | F001 lease expiry year | No | NULL with warning |
| Q3 | F002 coordinator | No | Default to Cody |
| Q4 | Sea Master ferry schedule | No (per-farm operational, not platform doctrine) | 14-day default |
| Q5 | Nayans buyer contact | No | Placeholder |
| Q6 | Chemical supplier contacts | No | Pacific Agri Suva default |
| Q7 | Kava market price | No | price_master placeholder |
| Q8 | M-PAiSA merchant registration | YES for 3.5b launch | Start in parallel |
| Q9 | Community marketplace launch | No | Phase 8 flag = false |
| Q10 | KB expert validation partner | No | Layer 2 covers |
| Q11 | F001 profit share contract date | No | Use current date if null |
| Q12 | Meta WhatsApp Business Cloud | No (Phase 4+) | OpenClaw covers |
| Q13 | Stripe FJD support | No (Phase 8) | N/A |
| Q14 | TTS provider | YES for Phase 4.2 voice | Decide implementation |
| Q15 | OCR provider | Phase 4.2+ | Claude vision via OpenClaw |
| Q16 | Naming dictionary populated terms | YES | Run dedicated session |
| **Q17 (v5.0)** | **Per-vertical event taxonomies for Horticulture, Livestock, Aquaculture, Forestry, Floriculture, Protected Ag** | YES per vertical (Strike #98 Rule 4) | Per-vertical Operator review session each |
| **Q18 (v5.0)** | **Strike #104b architectural decisions: schema (table vs JSONB), UI surface, reconciliation, migration, localStorage backup** | YES for #104b | 5 Operator-locked decisions pending |
| **Q19 (v5.0)** | **Crops Vertical Map session** (~56 events × 5-12 fields each = ~300-600 field decisions) | Required to complete Crops 100% | Architect drafts; Operator reviews per event |
| **Q20 (v5.0)** | **Strike #102 — full ~420-row Operator-locked + Architect-expanded varieties catalog** | Parallel-track via filesystem handover (B69) | Operator drafts; Architect ships migration 073 |

---

## PART 29 — THE REGIONAL INTELLIGENCE LAYER

`09_knowledge_base/FIJI_FARM_INTELLIGENCE.md` covers the pilot region. Future regional packs (TONGA, SOLOMONS, etc.) follow the same structure:

- Pilot farm profiles (replaced by region-typical farm profiles for non-pilot regions)
- Active crop protocols for region's MVP crops
- Region-specific pest names + Latin
- Local chemicals + suppliers + pricing
- Local seasonal calendar
- Local crop names (mother tongue + lingua franca)
- Grade standards for primary local buyers

Loaded at TIS startup based on `auth.tenants.region_code`. Injected into Layer 2 routing.

---

## PART 30 — PHASE MAP (v5.0)

| Phase | Scope | Status |
|---|---|---|
| 1 | Platform foundation | ✅ Complete |
| 2 | Auth + web shell | ✅ Complete |
| 3 | Unified TIS | ✅ Complete |
| 3.5a | Growth foundations | ✅ Complete |
| 3.5b | Monetisation activation (M-PAiSA primary) | ⏳ After Phase 4b |
| 4a | Harvest endpoint + chemical compliance | ✅ Complete |
| 4b | Farm ops frontend Layer A | 🔄 Week 1-2 shipped |
| 4.1 | Farm ops infill | 🔄 Steps 1-4 done |
| 4.2 | Task Engine core + Solo task card + voice | ✅ Mission Loop verified live 2026-04-26 |
| 4.3 | Access Control Hardening | ⏳ Parked |
| P-Doctrine-1 | Doctrine + audit hash chain | ✅ Shipped |
| P-Doctrine-2 | 4-anchor on cash_ledger (mig 033) | ✅ Shipped |
| P-Doctrine-3 | event_type_catalog + naming_dictionary (mig 034) | ❌ Blocks Layer B |
| P-Doctrine-4 | harvest_log production_id + 4-anchor retrofit (mig 035) | ❌ Not started |
| **P-Doctrine-5 (v5.0.1)** | **shared.verticals + vertical_id on shared.productions + shared.event_type_catalog (mig 075). Enables Vertical Context Doctrine.** | ❌ Not started |
| **3-Layer-1** | farm_layer enum + suggested_layer schema (mig 072) | ✅ Shipped (Strike #103) |
| **3-Layer-2** | LayerBackfillBanner + NewCycleModal layer dropdown | ✅ Shipped (Strike #104a) |
| **3-Layer-3** | Per-farm layer-mix declaration + onboarding LayerStrategy | ⏳ Strike #104b queued |
| **3-Layer-4** | NOT NULL constraint on production_cycles.layer | ⏳ Strike #104c queued |
| **3-Layer-5** | Farm Dashboard 3-Layer reshape | ⏳ Strike #105 queued |
| **3-Layer-6** | (+) catalog layer filter | ⏳ Strike #106 queued |
| **3-Layer-7** | CoKG layer aggregation + allocation drift signal | ⏳ Strike #107 queued |
| **3-Layer-8** | 3-Layer narrative in reporting | ⏳ Strike #108 queued |
| 5 | Automation Engine refactor + Decision Engine 14 signals | ❌ Not started |
| 5.5 | Weather/soil/irrigation | ❌ Not started |
| 6 (PARTIAL) | Financial: cash CRUD shipped; CoKG, runway, forecast, profit share, monthly PDF dispatcher pending | 🔄 Partial |
| 6.5 | Equipment + livestock_groups (mig 037) | ❌ Not started |
| 6.6 | Block capacity (mig 038) + Causal Chain view + Decision Engine cards | ❌ Not started |
| 7 | Offline PWA hardening (7-day floor, IndexedDB + Workbox) | ❌ Not started |
| 8 | Community marketplace + Stripe (overseas) + price index | ❌ Not started |
| **9** | **Credit & Trust byproduct: verification endpoint, credit score, monthly Bank Evidence PDF dispatcher.** Pulled forward in 90-day map. | ❌ Not started |
| 10 | ML models | ❌ Not started |
| 11 | Voice deepening (Whisper streaming) | ❌ Not started |
| **12** | **Multi-language (Pacific languages first, then global)** | ❌ Not started |
| **13** | **Pacific expansion (Tonga, Samoa, Solomons, etc.)** | ❌ Not started |
| **14** | **Global expansion (SE Asia, Sub-Saharan Africa, Latin America)** | ❌ Not started |
| 15 | Enterprise tier (multi-farm rollup, API access, bulk import, SSO) | ❌ Not started |

**Overall completion: ~55%** (06 May 2026, including 3-Layer Doctrine progress)

### Build Sequence Mandate (v5.0 binding)

**Crops vertical 100% completion comes before any other vertical opens.** This includes:
1. Crops Vertical Map session (Q19) — Architect drafts ~56-event taxonomy + form fields, Operator reviews per event
2. Strike #102 (varieties catalog full population, ~420 rows) parallel-track
3. Layer B sub-pages for Crops (`/farm/cycles`, `/farm/harvests`, `/farm/cash`, `/farm/labor`, `/farm/inventory`, `/farm/compliance`, `/farm/reports`, `/farm/buyers`, `/farm/equipment`, `/farm/locations`, `/farm/decisions`, `/farm/automation`, `/farm/weather`, `/farm/blocks`, `/farm/nursery`, `/farm/tasks`)
4. 3-Layer Doctrine spine (Strikes #104b → #108) — runs parallel to Crops work because spine is cross-cutting infrastructure that directly enables Crops completion criteria #5 (3-Layer integration)
5. Decision Engine card stack for Crops (12 cards on `/farm/decisions`)
6. TIS integration for Crops (criterion #7)

Only after Crops criterion #1-7 verifiable: open Horticulture vertical.

### 90-Day Execution Map (v5.0)

**Week 1**
- Diagnose & fix Celery silent outage
- Local working clone discipline established
- Naming dictionary vocabulary session (~60-90 min) → migration 034 ships
- Pull droplet 2GB → 4GB
- Apply security updates
- F001 CASSAVA cycle layer NULL drift resolved (Operator action via LayerBackfillBanner)

**Week 2-4**
- Strike #104b: per-farm layer-mix declaration page (after 5 Operator-locked decisions)
- Crops Vertical Map session (Q19) — Architect drafts taxonomy
- Phase 4.2 Day 4 reconciliation
- TTS provider decision (Q14) → Solo voice ships
- Migration 035: harvest_log production_id anchor
- Build `/farm/tasks` matching prototype
- Build `/farm/labor` (worker check-in + GPS)
- Build `/farm/inventory`

**Week 5-8**
- Strike #104c: NOT NULL on production_cycles.layer (after 7-day clean window)
- Strike #105: Farm Dashboard 3-Layer reshape
- Strike #106: (+) catalog layer filter
- Strike #107: CoKG aggregation + Allocation Drift signal
- Phase 9 byproduct: `/api/v1/verify/{audit_event_id}` endpoint
- Monthly Bank Evidence PDF dispatcher
- Build `/farm/reports` matching prototype
- Build `/farm/compliance` matching prototype
- One real Bank Evidence PDF dispatched to Operator's WhatsApp

**Week 9-12**
- Strike #108: 3-Layer narrative in reporting
- Build remaining Crops Layer B sub-pages
- Build Classroom surfaces
- Build `/farm/buyers`, `/farm/equipment`, `/me`
- Tier 1+2 outside-in fixes

**Day 90 deliverables:** Crops vertical at ~80% of 7-criterion checklist (taxonomy locked, all forms shipped, schema complete, 3-Layer integrated, dashboards rendering, reports working). 3-Layer Doctrine spine fully shipped (Strikes #104b-#108). Phase 9 byproduct partially shipped (verification endpoint live, one Bank Evidence PDF in the wild). Naming dictionary populated. Celery healthy. Local-clone discipline. Crops 100% completion target: Day 120-150.

---

## PART 31 — FEATURE ADDITION RULES

(unchanged from v4.3 with v5.0 additions)

### v5.0 Additions to "Before Writing Any Code"

15. **(v5.0)** If the work touches a non-Crops vertical: STOP. Strict Vertical Completeness binding. Crops 100% before any other vertical opens.
16. **(v5.0)** If the work introduces an event type for a non-Crops vertical: STOP. Per-vertical Operator review session required first (Strike #98 Rule 4).
17. **(v5.0)** If the work generates or modifies a 3-Layer classification: confirm Strike #101 Rule 1 compliance and the borderline-crop force-pick rule.
18. **(v5.0)** If positioning Bank Evidence as primary value: STOP. Reframe as TFOS-management-tool-first; Bank Evidence is byproduct.
19. **(v5.0)** If the work bakes Fiji-specific assumptions into the platform core (ferry timing, Fijian-only language, Pacific-only chemicals): refactor to a configurable layer above core primitives.

### Claude Code Standing Prompt Header — v5.0

Paste at the start of every Claude Code task:

```
STANDING RULES — v5.0 (2026-05-06):

CANONICAL STACK:
  1. TFOS_Master_Build_Instruction.md (THIS — sole law)
  2. TFOS_Platform_Architecture.md
  3. TFOS_Platform_Interactive_Prototype.html (SACRED)
  4. TFOS_Foundation_Complete.xlsx
  5. Older versions in _ARCHIVE_/ — reference only.

ROLE:
  Execution Engine. Run paste pack as written. Never improvise.
  Report raw output and stop. Operator approves every state-mutating action.

CORE FRAMING:
  TFOS is the moat. The management tool itself is the strategic centerpiece.
  Bank Evidence is automatic exhaust, not the product. Build TFOS first.
  Platform built for Pacific + global smallholders. F001/F002 are pilot.

RULES:
  1. Read /opt/teivaka/CLAUDE.md FIRST.
  2. Read relevant files before editing.
  3. Schema Reality Drift List (Part 5) — drift list wins.
  4. Task Engine is nervous system. No module writes farmer surface directly.
  5. Every tenant write emits one audit.events row.
  6. Every event row carries 4 anchors (Farm + Block + Crop + Operator).
  7. Every farmer-facing string flows through name(concept_key).
  8. Pages render. Forms write. No inline editing.
  9. Solo: one screen, no nav, three-button, TTS auto-play, ≤5 words.
  10. Forms: max 1 free-text field. Voice/camera/tap before typing.
  11. Migrations: Part 4c superuser override.
  12. Sacred Files (Part 26): never touch without explicit instruction.
  13. App.jsx: additive only.
  14. 5-pillar nav: Growth + Commercial only. Solo has none.
  15. Sub-components at module scope ONLY.
  16. Scope only. Flag unrelated bugs — don't fix.
  17. No commits to main. feature/* branches.
  18. M-PAiSA primary. No Stripe until Phase 8.
  19. Documentation Discipline: NEVER create v2/v3/addendum files for canonical docs.
  20. Convergence Mandate: every step closer to prototype while preserving live.
  21. Vertical Completeness (Strike #98 Rule 5): Crops 100% before any other vertical.
  22. No best-guess Architect-authored taxonomies (Strike #98 Rule 4): Operator review first.
  23. Every cycle carries a 3-Layer (Strike #101): CASH_FLOW / FOOD_SECURITY / LONG_TERM_ASSET.
  24. Bank Evidence is byproduct, not centerpiece. TFOS-management-tool-first framing.

REPORT:
  Files changed | files read | what still works | what NOT done |
  bundle hash | schema drift bugs found elsewhere | audit events emitted (count) |
  naming dictionary entries used (count, if applicable) |
  3-Layer compliance verified (count of NULL cycles).
```

---

## PART 32 — PLATFORM ARCHITECTURE — NAVIGATION CONTRACT (GROWTH & COMMERCIAL)

(unchanged from v4.3)

---

## PART 33 — FOUNDATION — DATA CONTRACT

(unchanged from v4.3 with v5.0 additions for Strike #102 varieties catalog work)

---

## PART 34 — GIT VERSION CONTROL DISCIPLINE

(unchanged from v4.3)

---

## PART 35 — PAYMENT RAILS

(unchanged from v4.3)

### v5.0 Multi-Region Payment Rails

Phase 13+ ships per-region payment rail configuration:
- Fiji: M-PAiSA (primary)
- Tonga: TBD
- Samoa: TBD
- Solomons: TBD
- Other Pacific: TBD per region
- Global: Stripe (via Phase 8 marketplace) + region-specific rails

Each tenant has `auth.tenants.payment_rail_primary` (FK to `shared.payment_rails`).

---

## PART 36 — DOCUMENTATION DISCIPLINE (BINDING)

(unchanged from v4.3 — In-Place Update Rule, Canonical Set, Changelog Header, Archive-on-Supersede)

---

## PART 37 — EXECUTION CADENCE DISCIPLINE (BINDING)

(unchanged from v4.3 — Six-Step Cadence: Recon → Build → Verify → Commit+Push → Platform Check → Next Phase Decision)

---

## PART 38 — EVERY SESSION'S FIRST MOVE (mandatory)

Before drafting any paste pack, before proposing any change, every Claude session runs this read sequence:

```
1. Last commit:           git log --oneline -1
2. Alembic head:          SELECT version_num FROM tenant.alembic_version;
3. Container health:      docker ps --format "{{.Names}}: {{.Status}}"
4. Schema reality:        \d on tables proposed work touches
5. Naming dictionary:     SELECT count(*) FROM shared.naming_dictionary;
6. Sacred files (Part 26): confirm none in proposed scope
7. Convergence (Part 8a): work brings prod closer to prototype
8. (v5.0) Vertical scope: confirm work is Crops-only or 3-Layer Doctrine spine
9. (v5.0) 3-Layer compliance: SELECT count(*) FROM tenant.production_cycles WHERE layer IS NULL;
```

Then report what was found before proposing work. **No work proposal without state confirmation.**

If reality has moved past Part 3 (Current Reality), update Part 3 as part of the first commit.

---

## PART 39 — SITE VOICE DOCTRINE (BINDING)

Locked 2026-05-20. Governs every public marketing surface: the L3 landing
(#home/#what/#tis/#about/#contact/paths) and the 10 MarketingPage routes
(/about, /what-we-do, /impact, /team, /partner, /contact, /tis-public,
/tfos, /our-farms, /farms). The canonical voice reference is what is LIVE
on /about and /what-we-do as of this date. Every future marketing edit
matches that voice. No re-drift.

### 39.1 — The two reference readers

Every sentence is written for both at once:
  1. A Kadavu smallholder who farms by memory and reads slowly.
  2. A skeptical Fiji bank credit officer deciding if the record is real.
If a sentence serves neither, cut it.

### 39.2 — Voice (what it IS)

- Plain, declarative, unhedged. State the thing, then stop.
- Concrete over abstract: "the goat that died," not "livestock mortality."
  Named farms (Save-A-Lot/Korovou, Viyasiyasi/Kadavu), named people, the
  real company number.
- Honest about stage: every claim carries its true status — Earning today /
  Live on WhatsApp / In active build. Trust is the product; an overclaim
  spends it.
- Income-funded humility: built on our own farms first; we don't promise
  what we haven't shipped.
- Pacific-first, global-by-design. Fiji is the proving ground, not the ceiling.
- Rhythm: short sentences carry weight; a long one must earn its length.
  Lists of three. Em-dashes for the turn, not for decoration.

### 39.3 — Voice (what it is NOT — banned)

- No cinematic rewrites. We refine the live voice; we don't reinvent it.
- No hype: revolutionary, seamless, cutting-edge, unleash, empower,
  game-changing, world-class (one earned superlative, per Final Directive,
  used at most once).
- No vague benefit-speak ("operational excellence," "holistic solutions").
- No second-person funnel ("Imagine if you could…"). Address the reader as
  an equal, not a lead.
- No emoji. No exclamation marks in body copy.
- No corporate plural without grounding ("we believe," "our mission"). If we
  mean I (the founder), say I. If we mean Teivaka PTE LTD, name the company.
  Vague "we" is fluff.

### 39.4 — Source-grounding (INVIOLABLE)

Every factual claim traces to either:
  (a) project knowledge (MBI, doctrines, /mnt/project KB, committed code), or
  (b) a fact the Operator provides this session (photo, number, name, date).
No invented numbers, buyers, yields, prices, farmer counts, acreage, or dates.
If a number is needed and unsourced, rewrite the sentence to not need it, or
ask the Operator. The same audit chain that makes farmers bankable makes our
own public claims auditable — an unsourced figure is a liability.

### 39.5 — The honest-stage rule

Anything not yet live is labelled build-stage, never written in present tense
as if shipped. Status pills (live = green, in-build = amber) are canonical.
"In active build," stated plainly, is a trust signal — not a weakness to hide.

### 39.6 — Canonical source of truth

Where the same content lives on the landing and a standalone route, the
LANDING section is canonical and the standalone mirrors it word-for-word
(#what ↔ /what-we-do, locked 2026-05-20). Edit canonical first, then mirror.
Never let the two drift into two voices again.

### 39.7 — Placeholder protocol

A page needing Operator-supplied facts is NOT shipped with invented stand-ins.
It is (a) held until the facts arrive, or (b) shipped without the unsourced
element. A page that cannot be honestly populated is pulled from nav until it
can be (e.g. /impact without real numbers).

### 39.8 — Per-page identity (SEO companion)

Each route carries its own <title>, meta description, canonical URL, OG tags,
and JSON-LD — written in this voice and server-visible, not JS-only. Generic
site-wide meta on a specific page is a Tier-0 drift bug.

### 39.9 — Process

- Voice edits follow Part 37 (Six-Step Cadence) and Part 38 (first move).
- Marketing pages are not sacred; Landing.l3.html IS (Part 26) — landing
  voice edits need explicit per-session Operator authorization.
- Every marketing edit names its source (39.4) in the commit body.

### 39.10 — The test

Before shipping a marketing sentence: "Would I say this to a farmer's face,
and could I prove it to their banker?" Yes → ship. No → cut it or source it.

### 39.11 — Voice Example Bank

Five canonical exemplars from the live site. When in doubt, match these.

1. Founder voice (/about):
   "I left a Science Degree and came home to Kadavu to farm — and in one
   season I learned what every Pacific farmer carries but no one says out
   loud…" — Uraia Koroi Kama, Founder
   (First person, lived, specific, no hedging. The spine of the voice.)

2. The thesis (/#what and /what-we-do):
   "One company. Three honest layers." / "We are transparent about the stage
   of each part of Teivaka — because trust is the product."
   (Names the structure plainly; states the trust principle as the reason.)

3. Operational specificity (/#what and /what-we-do):
   "Farmers use Teivaka daily to log what actually happens on their farm — the
   harvest, the irrigation, the chemical application, the cash sale, the worker
   hours, the goat that died. Each event is anchored to farm, block, crop, and
   operator. Each is chained into a verified record that cannot be altered
   after the fact."
   (Concrete nouns, the unexpected true detail, the verifiability payoff.)

4. Status-pill canon (every page):
   "Earning today" (live) · "Live on WhatsApp" (live) · "In active build"
   (build). Three words, true status, no spin.

5. Footer tagline (every page):
   "Generate Wealth from Idle Lands."
   (The promise in five words — concrete verb, concrete object, no adjectives.)

Binding. Removable only by explicit Operator decision via in-place edit (Part 36).

---

## FINAL DIRECTIVE

You are not building a generic farm management app.

You are building **the world's best agricultural management tool for smallholder farmers** — starting in the Pacific, expanding globally. You are building the daily operational home that turns a Kadavu goat farmer, a Korovou eggplant grower, a Solomons cocoa farmer, a Vanuatu kava farmer, a Tongan taro farmer, and one day a Kenyan smallholder, from uncertain traditional practitioners into systemized, data-driven operators.

The TFOS management tool itself is the moat. Classroom delivers the knowledge. Community connects the peers. TIS provides the AI mentor. Together they make Teivaka an agentic company — a platform where the AI has full context of the farmer's operation and acts as their continuous companion across all four pillars.

Bank-grade verifiable evidence accumulates as exhaust from farmers using the tool. The hash chain, the credit score, the public verification endpoint, the monthly Bank Evidence PDF — all real, all valuable, all byproducts. They open credit access for farmers who used TFOS long enough to build verifiable record. They are downstream wins, not the strategic centerpiece.

This system must work in a cassava field on Kadavu Island with intermittent connectivity. It must translate a Fijian farmer's voice note into a database record. It must enforce food safety rules even when a farmer insists on harvesting too early. It must accept payment in M-PAiSA today and Stripe + regional rails as we expand. It must surface one task at a time — not a dashboard — because a farmer has 30 seconds and cannot read.

It must do all of this for a Pacific smallholder, a Southeast Asian smallholder, a Sub-Saharan African smallholder, a Latin American smallholder. Not as a Fiji-specific quirk that struggles to translate, but as a universal smallholder reality codified into platform doctrine.

The farmer does not want a platform. The farmer wants to know what to do next, and that it will pay off.

Build that. Nothing else.

Every new feature must strengthen TFOS-as-the-moat. Every technical decision must serve the farmer, not the technology. Every phase completion must leave the management tool more useful, more reliable, and more deeply rooted in smallholder agricultural reality than it was before.

When a decision could cost real money, real compliance failures, or real trust with a farmer or buyer anywhere in the world — stop, ask the Operator, and get it right.

**This is Teivaka. Execute at the highest standard.**

---

*End of contract. Read again on every fresh session.*
*Part 3 (Current Reality) is the only mutable section — update it on every commit.*
*Parts 0-2, 4-39 + Final Directive are stable contract — change only by explicit Operator decision via in-place edit per Part 36.*
