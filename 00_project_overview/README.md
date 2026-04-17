# FILE: 00_project_overview/README.md

# Teivaka TFOS Developer Resource Pack

> **Version:** 1.0.0 | **Last Updated:** April 2026 | **Status:** Active Development
>
> **Company:** Teivaka PTE LTD, Fiji | **Company No.:** 2025RC001894
> **Founder:** Uraia Koroi Kama (Cody)
> **Currency:** FJD | **Timezone:** Pacific/Fiji (UTC+12)
> **Primary Communication Channel:** WhatsApp

---

## Table of Contents

1. [What is Teivaka?](#what-is-teivaka)
2. [The Founding Story](#the-founding-story)
3. [The Four Pillars](#the-four-pillars)
4. [Subscription Model](#subscription-model)
5. [Technology Stack](#technology-stack)
6. [Folder Structure](#folder-structure)
7. [Developer Reading Order](#developer-reading-order)
8. [Fiji-Specific Context](#fiji-specific-context)
9. [Fijian Crop Name Glossary](#fijian-crop-name-glossary)
10. [Full Glossary](#full-glossary)

---

## What is Teivaka?

Teivaka is a Fijian agricultural technology company building a comprehensive digital operating system for Pacific Island farms. The product is called **TFOS** — the Teivaka Farm Operating System. It is not a simple farm diary or crop tracker. It is a full-stack agri-business intelligence platform designed specifically for the realities of Fijian and Pacific Island farming: unreliable connectivity, subsistence-to-commercial transitions, iTaukei land tenure complexity, island ferry logistics, and multilingual workers using voice as their primary interface.

Teivaka operates two farms directly and builds software to power its own operations first, then licenses that software to other farmers across Fiji and the Pacific region. This "eat your own cooking" approach means every feature built into TFOS is battle-tested against real cassava fields, eggplant cycles, kava plantations, and beehive inspections before it is offered to paying customers.

The platform is built around four interlocking pillars that together form a complete agri-business stack.

---

## The Founding Story

Uraia Koroi Kama — known as Cody — left university in Fiji having seen firsthand what ails Pacific Island agriculture: farmers with knowledge but no systems, land but no capital, produce but no market access, and no digital tools built for their reality. Most agricultural software is designed for large commercial farms in North America or Europe. None of it works offline in a village on Kadavu Island. None of it understands that "Dalo ni Tana" is a specific variety of taro. None of it knows that the ferry to Kadavu runs twice a week and you need to order fertilizer 14 days in advance.

Cody founded Teivaka PTE LTD in 2025 (Company No. 2025RC001894) with a mission to transform subsistence farming into profitable agribusiness — using software built for the Pacific, by the Pacific. Rather than theory, he started with real farms. Farm 1 is Save-A-Lot Farm in Korovou, Serua Province (F001) — a commercial operation on 83 acres with a focus on vegetables, root crops, and apiculture. Farm 2 is Viyasiyasi Farm on Kadavu Island (F002) — an island farm requiring ferry logistics for all supplies and workers.

The TFOS system is what Teivaka built to run those farms. It is now being productized to serve other farmers across Fiji and the Pacific.

---

## The Four Pillars

### Pillar 1: Knowledge Base (KB)

The Knowledge Base is the agronomic brain of TFOS. It contains validated, structured protocols for every production type Teivaka supports — 49 productions across vegetables, root crops, indigenous crops, fruits, livestock, apiculture, aquaculture, support crops, and forestry.

Each KB entry is a Stage Protocol: a precise, validated, sequenced set of instructions that tells a farmer exactly what to do at each growth stage of a crop — from land prep to nursery to transplanting to vegetative growth to pre-harvest to harvest to post-harvest. Protocols contain planting densities, fertilizer types and rates, pest scouting intervals, chemical withholding periods, expected yield ranges, and market price guidance.

The KB is stored in a shared schema (`shared.*`) with no `tenant_id` — it is platform-wide, not farm-specific. KB content is written by Teivaka's agronomists and reviewed before publication. It is the ONLY source from which TIS is permitted to generate agronomy advice. This is a hard constraint — no hallucinated protocols, no internet-sourced advice.

KB content is also surfaced in the Community pillar as educational resources for free-tier users.

### Pillar 2: TFOS (Farm Operating System)

TFOS is the operational core. It is the set of modules, databases, API endpoints, and automated rules that run a farm day-to-day. TFOS encompasses:

- **Production Unit (PU) Management:** Every plot of land under cultivation is tracked as a Production Unit. Each PU has a zone, a current production cycle, a stage, a task queue, and a financial ledger.
- **Stage Engine:** Drives each production cycle through its defined stages (based on the KB protocol for that crop). At each stage, the Stage Engine generates tasks, fires alerts, and checks compliance.
- **Task Queue:** A structured queue of agronomic tasks for each PU — scheduled automatically by the Stage Engine and assigned to workers. Tasks have due dates, assignees, and completion confirmation.
- **Harvest Logging and Reconciliation:** Records every harvest event with quantity, quality grade, destination, and transport details. Reconciles harvested vs. delivered vs. sold quantities. Flags loss gaps above 10%.
- **Inventory Management:** Tracks agricultural inputs (chemicals, seeds, fertilizers, tools) with reorder thresholds, expiry dates, and chemical withholding period enforcement.
- **Labor Management:** Tracks worker attendance, task assignment, hours worked, and pay rates. Supports permanent workers (W-001) and casual workers (W-002 through W-009) with different pay structures.
- **Financial Ledger:** Tracks all cash in/out per farm, per cycle. Computes CoKG (Cost of Goods per Kilogram) as the primary profitability metric.
- **Automation Engine:** 43 rules that fire alerts, tasks, notifications, and escalations automatically based on events, schedules, and thresholds.
- **Decision Engine:** Runs daily at 6:05am Fiji time. Computes 10 signals that give a RAG (Red/Amber/Green) health score for each farm. Never computed on-demand — always pre-computed and stored in `decision_signals` table.
- **Alert System:** Structured alerts with severity (CRITICAL/HIGH/MEDIUM/LOW), status (open/resolved/dismissed), escalation rules, and WhatsApp delivery.
- **Rotation Gate:** Validates crop rotation before any new cycle is created. Enforces agronomic rotation rules to prevent soil depletion and disease buildup.

TFOS is subscription-gated. The Stage Engine, Risk Engine, and Economic Engine are PREMIUM features. Basic logging is available on BASIC tier.

### Pillar 3: TIS (Teivaka Intelligence System)

TIS is the AI layer of TFOS. It consists of three modules that work together to make TFOS accessible via natural language — primarily voice input via WhatsApp.

**Module 1: Knowledge Broker**
The Knowledge Broker answers agronomic questions. A farmer can ask "What do I spray for leaf curl on my tomatoes?" and the Knowledge Broker searches the Teivaka KB, finds the relevant protocol, and returns a validated answer. It uses RAG (Retrieval-Augmented Generation) against the KB vector store, powered by Claude API (`claude-sonnet-4-20250514`). Hard constraint: if the answer is not in the KB, the Knowledge Broker must say so and cite the nearest protocol. It never generates advice from general LLM knowledge.

**Module 2: Operational Interpreter**
The Operational Interpreter parses natural language (text or voice-transcribed) into structured TFOS commands. A worker says "I harvested 45 kilos of eggplant from PU002 today" — the Operational Interpreter extracts intent (LOG_HARVEST), entities (45kg, eggplant, PU002, today), and passes a structured command to the Command Executor. Intent types are fixed and enumerated (12 total — see BUSINESS_LOGIC.md Section 15).

**Module 3: Command Executor**
The Command Executor takes a structured command from the Operational Interpreter and executes it against the TFOS API. It handles the full pipeline: API call → validation → database write → confirmation message. Chemical compliance checks fire automatically during LOG_HARVEST commands. Rotation validation fires automatically during CREATE_CYCLE commands.

**Voice Pipeline:** The primary data entry method for field workers is voice. The pipeline is:
1. Worker records a voice message on WhatsApp
2. Twilio delivers audio to TFOS backend
3. Whisper API (OpenAI) transcribes audio to text (<1 second for a 30-second clip)
4. TIS Operational Interpreter parses the transcription into a structured command
5. TIS Command Executor calls the TFOS API
6. Confirmation message sent back to worker via WhatsApp

Total pipeline latency target: <5 seconds from recording to confirmation. Processing target (steps 3–6): <3 seconds.

TIS query limits are enforced per subscription tier: FREE = 5 queries/day, BASIC = 20 queries/day, PREMIUM = unlimited.

### Pillar 4: Community

The Community pillar is the marketplace and knowledge-sharing layer. It connects Teivaka farmers with buyers, suppliers, and other farmers. In Phase 1, Community is read-only (farmers can view resources and prices). In Phase 2, full features include:

- **Marketplace:** Farmers list produce for sale. Buyers browse and place orders. Pricing guided by price_master table (manual entry, no automated market feeds in Phase 1).
- **Knowledge Sharing:** Farmers share field observations, seasonal tips, and local variety performance data. Community posts are moderated against KB protocols.
- **Buyer Pipeline:** Hotels, restaurants, and supermarkets (including the Nayans group) can browse available produce and place advance orders.
- **Supplier Directory:** Input suppliers listed with contact info, lead times, and delivery coverage areas.

Community is scoped by tenant in Phase 2 but has a shared marketplace layer visible to all users.

---

## Subscription Model

Teivaka offers four subscription tiers. All tiers are per-farm (tenant-level billing). The currency is FJD.

### FREE Tier

The entry-level tier designed to prove value before commitment.

- **Production Units:** 1–2 PUs maximum
- **Knowledge Base:** Core principles only (crop profiles, basic stage guides)
- **Logging:** Basic field event logging (text only, no voice pipeline)
- **TIS:** 5 queries per day (Knowledge Broker only, no Command Executor)
- **Community:** View-only access (no marketplace posting or interaction)
- **Reporting:** No financial reporting, no CoKG computation
- **Alerts:** Basic overdue task alerts only
- **Multi-farm:** Not supported

Target user: Small-holder farmer evaluating TFOS before committing.

### BASIC Tier

The working-farm tier for active commercial operations.

- **Production Units:** Unlimited PUs
- **Knowledge Base:** Full KB access (all 49 productions, all stage protocols)
- **Logging:** Full field logging including voice pipeline via WhatsApp
- **TIS:** 20 queries per day (all three TIS modules active)
- **Stage Engine:** Active (automated task generation per stage)
- **Task Queue:** Active (worker task assignment and confirmation)
- **Community:** Full interaction (post, comment, browse marketplace)
- **Reporting:** Standard reports (harvest summary, labor cost, input usage)
- **Alerts:** Full alert system (all 43 rules active)
- **Multi-farm:** Not supported (single farm only)

Target user: Commercial farm operator like Teivaka's own F001 and F002 operations.

### PREMIUM Tier

The full-platform tier for serious agri-business operations.

- **Everything in BASIC, plus:**
- **Risk Engine:** Automated risk scoring per cycle, weather stress signals, pest pattern detection
- **Economic Engine:** Full CoKG computation, gross margin analysis, cycle-level P&L, profit share calculation
- **Inventory Management:** Full input tracking with reorder alerts and withholding period enforcement
- **Advanced Dashboard:** Decision Engine signals dashboard, RAG status indicators, expansion readiness scoring
- **Multi-farm:** Supports multiple farms under one account (cross-farm reporting)
- **TIS:** Unlimited queries per day
- **Reporting:** Premium reports (full financial, Decision Engine history, yield trend analysis)
- **Data Export:** CSV/PDF export of all reports
- **Community Marketplace:** Premium listing features, buyer pipeline access

Target user: Farm networks, agricultural cooperatives, multi-farm operators.

### CUSTOM Tier

Enterprise-level engagement for large farms, government programs, or development organizations.

- **Everything in PREMIUM, plus:**
- **Bespoke Implementation:** Custom onboarding, data migration, and configuration
- **API Integration:** Direct API access for third-party system integration
- **Consulting:** Teivaka agronomic consulting services included
- **Performance-Linked Revenue Tracking:** Teivaka takes a percentage of farm profit (rate negotiated), tracked via the `profit_share` table. This is the "skin in the game" model where Teivaka's revenue is linked to farm performance.
- **SLA:** Dedicated support, uptime guarantees, custom alert routing

Target user: Government agricultural programs, NGO-supported farms, large commercial operations.

---

## Technology Stack

All versions are locked. Do not use newer or older versions without explicit sign-off from the project lead.

### Backend

| Component | Technology | Version |
|-----------|-----------|---------|
| Language | Python | 3.12 |
| Web Framework | FastAPI | 0.115+ |
| ORM | SQLAlchemy (async) | 2.0 |
| DB Migrations | Alembic | latest compatible |
| Task Queue | Celery | 5.4 |
| Cache / Broker | Redis | 7.2 |
| WSGI/ASGI | Uvicorn + Caddy | latest stable |

### Database

| Component | Technology | Version |
|-----------|-----------|---------|
| Primary Database | PostgreSQL | 16 |
| Time-Series Extension | TimescaleDB | latest for PG16 |
| Connection Pooler | PgBouncer | latest stable |
| Search Extension | pgvector | latest (for TIS RAG) |

### AI / ML

| Component | Technology | Notes |
|-----------|-----------|-------|
| LLM | Claude API | `claude-sonnet-4-20250514` |
| Speech-to-Text | Whisper API (OpenAI) | Max 25MB per audio file |
| Vector Store | pgvector on PostgreSQL | KB embeddings |
| RAG Framework | Custom FastAPI service | No external RAG framework |

### Frontend

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | React | 18+ |
| App Type | Progressive Web App (PWA) | Offline-first |
| Service Worker | Workbox | latest |
| Local Storage | IndexedDB | Browser native |
| State Management | Zustand or React Query | TBD |

### Infrastructure

| Component | Technology | Notes |
|-----------|-----------|-------|
| VPS | Hetzner CAX21 | 4 vCPU ARM64, 8GB RAM, 80GB NVMe |
| OS | Ubuntu | 24.04 LTS |
| Reverse Proxy / TLS | Caddy | Auto Let's Encrypt certs |
| File Storage | Supabase Storage | All photos and documents |
| WhatsApp | Twilio WhatsApp Business API | Primary communication |
| Email | TBD | Secondary communication only |

### Third-Party Services

| Service | Purpose |
|---------|---------|
| Supabase Storage | Farm photos, delivery documents, lab reports |
| Twilio WhatsApp | Worker alerts, voice message intake, customer notifications |
| Claude API (Anthropic) | TIS Knowledge Broker, Operational Interpreter, Command Executor |
| Whisper API (OpenAI) | Voice transcription for field workers |

---

## Folder Structure

The resource pack is organized into 10 folders. Each folder corresponds to a development domain.

```
Teivaka TFOS Development Resource Pack/
│
├── 00_project_overview/                  ← START HERE
│   ├── README.md                         ← This file. Project overview, glossary, reading order
│   ├── BUSINESS_LOGIC.md                 ← Every business rule encoded precisely
│   └── SYSTEM_CONSTRAINTS.md            ← Infrastructure limits, connectivity reality, security
│
├── 01_architecture/                      ← System design
│   ├── ARCHITECTURE_OVERVIEW.md          ← High-level system diagram and component map
│   ├── DATA_FLOW.md                      ← How data moves through TFOS (voice → DB → alert)
│   └── MULTI_TENANCY.md                 ← Tenant isolation model, schema design
│
├── 02_database/                          ← PostgreSQL schema
│   ├── SCHEMA_OVERVIEW.md               ← All tables, relationships, indexes
│   ├── MIGRATIONS.md                    ← Alembic migration strategy
│   ├── TIMESCALE_SETUP.md              ← TimescaleDB hypertable configuration
│   └── RLS_POLICIES.md                 ← Row-Level Security policies per table
│
├── 03_backend/                           ← FastAPI application
│   ├── API_ENDPOINTS.md                 ← All endpoints, request/response schemas
│   ├── CELERY_TASKS.md                  ← Background tasks: Decision Engine, alert dispatch
│   ├── AUTOMATION_RULES.md             ← All 43 rules: trigger, condition, action
│   └── TIS_INTEGRATION.md              ← TIS module implementations, prompt templates
│
├── 04_environment/                       ← Setup and configuration
│   ├── LOCAL_SETUP.md                   ← Dev environment setup (Docker Compose)
│   ├── ENV_VARIABLES.md                 ← All required environment variables
│   └── SECRETS_MANAGEMENT.md           ← How secrets are handled (never in git)
│
├── 05_data_migration/                    ← Legacy TFOS v7.0 migration
│   ├── MIGRATION_STRATEGY.md            ← Google Sheets → PostgreSQL migration plan
│   ├── COLUMN_MAPPING.md               ← TFOS v7.0 column mappings (including known errors)
│   └── VALIDATION_CHECKLIST.md         ← 90-day parallel run validation criteria
│
├── 06_api_reference/                     ← API documentation
│   ├── PRODUCTION_API.md               ← Production cycle and PU endpoints
│   ├── HARVEST_API.md                  ← Harvest logging and reconciliation endpoints
│   ├── FINANCIAL_API.md                ← Cash ledger, CoKG, profit share endpoints
│   └── TIS_API.md                      ← TIS query, voice, and command endpoints
│
├── 07_testing/                           ← Test strategy
│   ├── TEST_STRATEGY.md                 ← Unit, integration, E2E test approach
│   ├── SEED_DATA.md                     ← Test data: all 49 productions, 16 customers, etc.
│   └── VOICE_PIPELINE_TESTS.md         ← Voice intent parsing test cases
│
├── 08_deployment/                        ← Production deployment
│   ├── DEPLOYMENT_GUIDE.md             ← Step-by-step Hetzner CAX21 deployment
│   ├── CADDY_CONFIG.md                 ← Reverse proxy configuration
│   └── BACKUP_RESTORE.md              ← pg_dump schedule, restore procedures
│
├── 09_knowledge_base/                    ← KB content and structure
│   ├── KB_STRUCTURE.md                 ← How KB articles are structured
│   ├── STAGE_PROTOCOLS.md              ← All 49 production stage protocols (reference)
│   └── ROTATION_MATRIX.md             ← Crop rotation compatibility matrix
│
└── 10_handoff/                           ← Developer handoff
    ├── OPEN_ISSUES.md                   ← Known bugs, TODOs, v7.0 column mapping errors
    ├── DECISION_LOG.md                  ← Why key architectural decisions were made
    └── NEXT_PHASE.md                    ← Phase 2 roadmap: GIS, Stripe, Community marketplace
```

---

## Developer Reading Order

Follow this order to build a complete mental model before writing any code.

**Day 1: Context and Business**
1. `00_project_overview/README.md` (this file) — understand what you are building and why
2. `00_project_overview/BUSINESS_LOGIC.md` — internalize every business rule; this governs all implementation decisions
3. `00_project_overview/SYSTEM_CONSTRAINTS.md` — know the infrastructure limits, connectivity realities, and security requirements

**Day 2: Architecture**
4. `01_architecture/ARCHITECTURE_OVERVIEW.md` — understand how all components connect
5. `01_architecture/DATA_FLOW.md` — trace how a voice command becomes a database record and then an alert
6. `01_architecture/MULTI_TENANCY.md` — understand tenant isolation before touching any table design

**Day 3: Database**
7. `02_database/SCHEMA_OVERVIEW.md` — learn every table and relationship
8. `02_database/RLS_POLICIES.md` — security is implemented at the DB layer, not just the API
9. `02_database/TIMESCALE_SETUP.md` — time-series tables are hypertables; understand why

**Day 4: Backend and AI**
10. `03_backend/AUTOMATION_RULES.md` — all 43 rules drive the system; know them before implementing endpoints
11. `03_backend/API_ENDPOINTS.md` — the full API surface
12. `03_backend/TIS_INTEGRATION.md` — AI integration patterns, prompt templates, cost controls

**Day 5: Legacy Migration**
13. `05_data_migration/MIGRATION_STRATEGY.md` — Google Sheets TFOS v7.0 data must be migrated carefully
14. `05_data_migration/COLUMN_MAPPING.md` — note the known column mapping errors in RULE-042 and RULE-043

**Ongoing Reference:**
- `06_api_reference/` — when implementing or consuming any endpoint
- `07_testing/SEED_DATA.md` — when writing tests (use real IDs and real data)
- `09_knowledge_base/ROTATION_MATRIX.md` — when implementing the Rotation Gate
- `10_handoff/OPEN_ISSUES.md` — check before implementing anything; it may already be a known issue

---

## Fiji-Specific Context

Understanding the Fijian context is not optional — it shapes every design decision in TFOS.

### Currency: FJD

All financial values in TFOS are in Fijian Dollars (FJD). There is no currency conversion layer. CoKG is in FJD/kg. Worker wages are in FJD/hour (standard field rate: FJD 6.00/hour). Market prices in `price_master` are in FJD. Do not use USD or any other currency anywhere in the system.

### Timezone: Pacific/Fiji (UTC+12)

All times are stored in UTC in the database. All display times are converted to Pacific/Fiji (UTC+12). The Decision Engine runs at 6:05am Fiji time — which is 6:05pm UTC the previous calendar day. Backup jobs (pg_dump) run at 2:00am Fiji time = 2:00pm UTC previous day. All cron expressions must account for this offset.

### iTaukei Land Tenure

Fiji has a complex land tenure system. A significant portion of land is classified as iTaukei (indigenous Fijian communal land), held in trust by the iTaukei Land Trust Board (ILTB, formerly NLTB). Farmers who operate on iTaukei land must have ILTB leases. F001 (Save-A-Lot Farm, Korovou, Serua Province) is on an ILTB lease held by the Nayans family. This creates a profit-share arrangement: Nayans owns the land, Teivaka operates it, and net profit is split at a configurable `ProfitShareRate_%` (to be determined, never hardcoded). TFOS must track this profit share per cycle in the `profit_share` table. The related-party nature of sales to Nayans supermarkets (CUS-003 through CUS-007) must be flagged in transaction records.

### Ferry Logistics for Kadavu (F002)

Viyasiyasi Farm (F002) is on Kadavu Island, roughly 100km south of Suva. Kadavu is accessible only by boat or light aircraft. All agricultural inputs — seeds, fertilizers, chemicals, tools, equipment — must be shipped to Kadavu via ferry. The primary shipping provider is Sea Master Shipping (SUP-012). Ferry runs are not daily. Typical lead time from Suva to Kadavu: 2–5 days (weather dependent). RULE-034 (F002FerryBuffer) is a CRITICAL automation rule that checks stock levels weekly and fires a CRITICAL alert when any F002 input falls below (LeadTime_Days + 7) days of remaining stock. Missing a ferry shipment can mean 1–2 weeks without essential inputs. This is not a theoretical constraint — it is the single biggest operational risk for F002.

F002 also has no permanent workers. Casual workers for island operations are managed via the WorkerBookingQueue — a scheduling system that coordinates ferry transport of workers from the mainland.

### WhatsApp as Primary Communication

WhatsApp is the primary communication channel for Teivaka's operations. Reasons:
- WhatsApp is the dominant messaging platform in Fiji (higher penetration than email)
- Field workers may not have email access but virtually all have WhatsApp on basic smartphones
- WhatsApp supports voice messages, which is the primary data entry method for field workers
- Customers (supermarkets, markets, restaurants) communicate delivery requirements via WhatsApp
- Suppliers confirm orders via WhatsApp

TFOS uses Twilio WhatsApp Business API to:
1. Receive voice messages from field workers for TIS processing
2. Send task alerts and reminders to workers
3. Send harvest alerts and delivery confirmations to customers
4. Send CRITICAL alerts (chemical compliance violations, livestock mortality, ferry buffer warnings) to farm managers

All CRITICAL alerts are delivered via WhatsApp regardless of user opt-out preferences. Medium and Low alerts can be suppressed by user preference.

### Connectivity Reality

Fiji's telecommunications infrastructure is concentrated in urban centers (Suva, Nadi, Lautoka). Rural and island areas have inconsistent or no data connectivity.

**F001 (Korovou, Serua Province):** Rural but accessible. Moderate 3G/4G connectivity. Workers can typically submit logs during the working day, but connectivity may drop in low-lying areas near the river.

**F002 (Kadavu Island):** Island connectivity. Kadavu has limited mobile tower coverage. In many parts of the island, there is no reliable data connection. Workers on F002 must be able to operate TFOS entirely offline during a working day and sync when connectivity returns (typically at the end of the day when they are near the main village or jetty).

This makes offline-first capability **non-negotiable for F002 operations**. The PWA must:
- Cache the full application shell and static assets via Service Worker
- Store all pending field logs, harvest records, cash entries, and labor records in IndexedDB
- Display a clear offline/online status indicator at all times
- Sync automatically when connectivity is restored
- Handle sync conflicts (last-write-wins per record)
- Limit the offline queue to 500 records before forcing sync (to prevent data loss from extended offline periods)

---

## Fijian Crop Name Glossary

Many crops in TFOS use Fijian names. These are official names in the system, not colloquialisms.

| TFOS ID | Fijian Name | English Name | Notes |
|---------|------------|--------------|-------|
| CRP-DAL | Dalo | Taro | Common variety, staple crop |
| CRP-DTN | Dalo ni Tana | Taro (Giant Swamp) | Larger variety, different growing conditions |
| CRP-ROU | Rourou / Bele | Leafy Greens (Taro leaves) | Rourou = taro leaf tops; Bele = tree spinach (Abelmoschus manihot) |
| CRP-OTA | Ota | Fern Fronds | Edible fern, local delicacy |
| CRP-DUR | Duruka | Sugarcane Shoot | Edible sugarcane inflorescence, seasonal delicacy |
| CRP-KAV | Kava | Kava / Yaqona | Traditional ceremonial plant, 4-year growth cycle |
| CRP-GIN | Ginger | Ginger | Known locally as ginger |
| CRP-TUR | Turmeric | Turmeric | Known locally as cago |
| CRP-CAS | Cassava | Cassava / Tapioca | Known locally as tavioka |
| CRP-YAM | Yam | Yam | Known locally as uvi |

---

## Full Glossary

**Agri-TOS**
Teivaka's Terms of Service for agricultural data. Governs what Teivaka can and cannot do with farm data collected through TFOS. Farmers retain ownership of their farm data. Teivaka may use anonymized, aggregated data for KB improvement.

**Alert Severity**
Four levels: CRITICAL (immediate action required, never suppressed), HIGH (action required within 24 hours), MEDIUM (action required within 72 hours), LOW (informational). Alerts escalate automatically if unresolved (MEDIUM → HIGH after 3 days, HIGH → CRITICAL after 7 days).

**Automation Rule**
One of 43 pre-configured rules in TFOS that fire alerts, tasks, or notifications automatically. Each rule has: an ID (RULE-001 to RULE-043), a status (Active/INACTIVE), a category, a trigger type, a trigger interval, and a severity. Rules drive the autonomous operation of farms.

**CoKG (Cost of Goods per Kilogram)**
The primary financial metric in TFOS. Formula: `(TotalLaborCost + TotalInputCost + TotalOtherCost) / TotalHarvestQty_kg`. Computed per production cycle. If CoKG exceeds market price, the cycle is loss-making. Every farmer must understand their CoKG before selling.

**Community**
The fourth pillar of TFOS. A marketplace and knowledge-sharing platform connecting farmers, buyers, and suppliers. Phase 1: read-only. Phase 2: full marketplace functionality.

**Cycle**
A production cycle is one complete grow-to-harvest sequence of a single production type on a single Production Unit. ID format: `CY-FFFF-YY-NNN` (e.g., `CY-F001-26-001`). States: PLANNED → ACTIVE → HARVESTING → CLOSING → CLOSED / FAILED.

**Decision Engine**
A daily automated process that runs at 6:05am Fiji time (UTC+12). Computes 10 diagnostic signals for each active farm and writes results to the `decision_signals` table. Signals are RAG-rated (Red/Amber/Green). The Decision Engine never runs on-demand — it is always a scheduled job. The pre-computed results are what the dashboard reads.

**F002FerryBuffer**
The automation rule (RULE-034) specific to Viyasiyasi Farm (F002) on Kadavu Island. Runs weekly. Checks whether any F002 input stock level is below (LeadTime_Days + 7) days of remaining supply. Fires a CRITICAL alert with instruction to contact Sea Master Shipping (SUP-012) to book a ferry shipment. Missing this alert can leave the island farm without inputs for weeks.

**FarmID**
The unique identifier for a farm in TFOS. Format: `F` followed by three digits. Currently: F001 (Save-A-Lot Farm), F002 (Viyasiyasi Farm). This is also the top-level tenant discriminator in multi-farm accounts.

**iTaukei**
Fijian indigenous people and their cultural heritage. Used in the context of iTaukei land tenure — land owned communally by indigenous Fijian clans, administered by the iTaukei Land Trust Board (ILTB). Much of Fiji's agricultural land is iTaukei land. Operating on iTaukei land requires an ILTB lease.

**KB (Knowledge Base)**
The first pillar of TFOS. A structured repository of validated agronomic protocols for all 49 production types supported by TFOS. Stored in the `shared.*` schema with no tenant isolation. The ONLY source from which TIS is permitted to generate agronomy answers.

**Offline Sync**
The mechanism by which field logs created when there is no internet connectivity are held in IndexedDB (browser-side storage) and automatically uploaded to the TFOS API when connectivity is restored. The field logging UI must work identically online and offline, with a sync status indicator.

**Profit Share**
The financial arrangement between Teivaka and Nayans for F001 (Save-A-Lot Farm). Nayans owns the land. Teivaka operates the farm. Net profit per cycle is split at a configurable `ProfitShareRate_%` (value TBD, never hardcoded). `NayansShare_FJD = CycleNetProfit × ProfitShareRate`. `TeivakaCut_FJD = CycleNetProfit - NayansShare_FJD`. Tracked in the `profit_share` table.

**PU (Production Unit)**
A Production Unit is a discrete, tracked parcel of land under active cultivation. It belongs to a farm, a zone within that farm, and has one active cycle at a time. ID format: `FFFF-PUYYY` (e.g., `F001-PU001`). PUs are the fundamental unit of TFOS farm management.

**RAG (Red/Amber/Green)**
A three-state status system used throughout TFOS for at-a-glance health indicators. Green = healthy/on-track. Amber = warning/monitor. Red = critical/action required. Applied to Decision Engine signals, alert counts, financial metrics, and harvest frequency.

**RGN**
Shorthand for Red/Green/Amber status. Used interchangeably with RAG in internal documentation.

**Rotation Gate**
The validation system that runs before any new production cycle is created. `validate_rotation()` checks the previous crop(s) on a PU against a rotation compatibility matrix and returns one of seven decision statuses: PREF, OK, AVOID, BLOCK, COND, OVERLAY, N/A. BLOCK prevents cycle creation entirely. AVOID allows with a user override. PREF is the recommended sequence.

**Stage Engine**
The TFOS module that drives a production cycle through its agronomic stages as defined in the KB protocol for that crop. At each stage transition, the Stage Engine generates tasks, updates the task queue, checks for compliance, and may fire alerts. The Stage Engine is a BASIC-tier and above feature.

**Task Queue**
The ordered list of pending agronomic tasks for a Production Unit, generated by the Stage Engine. Workers see their assigned tasks sorted by due date. Tasks are marked complete by workers via WhatsApp voice or the PWA interface.

**Tenant**
In TFOS multi-tenancy, a Tenant is a farm account. Each tenant has a `tenant_id` that is present on all operational tables. The `shared.*` schema (KB, agronomic data) has no `tenant_id`. Row-Level Security (RLS) at the PostgreSQL level enforces tenant isolation — a tenant cannot read or write another tenant's data.

**TFOS (Teivaka Farm Operating System)**
The second pillar of Teivaka's product stack. The operational core that manages production cycles, tasks, harvest records, labor, inventory, financial ledgers, alerts, and automation rules. TFOS is what makes a farm run systematically rather than by memory and habit.

**TIS (Teivaka Intelligence System)**
The third pillar. The AI layer of TFOS, comprising three modules: Knowledge Broker (agronomic Q&A from KB), Operational Interpreter (natural language to structured command), and Command Executor (structured command to TFOS API call). Powered by Claude API and Whisper API.

**Voice Pipeline**
The end-to-end pipeline for voice-based data entry: WhatsApp voice message → Twilio webhook → Whisper transcription → TIS Operational Interpreter → TIS Command Executor → TFOS API → database write → WhatsApp confirmation. The primary data entry method for field workers who may not be comfortable typing.

**WithholdingPeriod**
The mandatory waiting period after applying a chemical (pesticide, herbicide, fungicide) before a crop can be legally harvested. TFOS enforces this at two levels: a PostgreSQL trigger that blocks harvest record insertion, and an API-level validation in the harvest logging endpoint. Violations trigger a CRITICAL alert and WhatsApp notification to the farm manager.

**WorkerBookingQueue**
A scheduling system specific to F002 (Kadavu Island). Since F002 has no permanent workers, casual workers must be booked from the mainland and transported by ferry. The WorkerBookingQueue manages: worker availability, ferry schedule alignment, task requirements per visit, and pay confirmation. This is essential for island farm operations where ad-hoc worker dispatch is impossible.

---

*This document is the authoritative starting point for all TFOS development. Every developer working on the Teivaka platform should be able to recite the four pillars, name the two farms, explain CoKG, and understand why the ferry buffer alert is CRITICAL before writing a single line of code.*

---

**Document maintained by:** Teivaka Development Team
**Company:** Teivaka PTE LTD, Fiji | Company No. 2025RC001894
**Founder:** Uraia Koroi Kama (Cody)
