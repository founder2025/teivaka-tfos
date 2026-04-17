# FILE: 10_handoff/DEVELOPER_ONBOARDING.md

# Developer Onboarding — Teivaka TFOS
**Welcome to the Teivaka Agricultural TOS Development Team**
**Last Updated:** 2026-04-07

---

## A Message from Cody (Uraia Koroi Kama, Founder)

Vinaka vakalevu for joining Teivaka.

I built this company to fix a real problem: farmers in Fiji — including my own family and community — are losing crops, losing money, and losing ground because they don't have access to the tools that big commercial operations take for granted. A farm in New Zealand has software telling the farmer when to plant, when to spray, and whether the business is profitable. A farmer in Kadavu has a notebook and a phone with WhatsApp.

Teivaka changes that. We are building a farm operating system for the Pacific — starting with two farms I operate myself, and scaling to every island farmer who needs it.

The product you're building is not a SaaS dashboard for executives. It is a tool that Laisenia Waqa — who works in the field every day at Save-A-Lot Farm — needs to be able to use with a voice message. It is a tool that tells me at 6am Fiji time whether my farms are healthy, what needs my attention, and what my cash position is. It is a tool that will, one day, help a farmer in Vanuatu manage kava the same way a farmer in Serua does.

Build it with care. Build it like it will be used in the mud, in the rain, on a slow 3G connection, by someone who has never used farm software before. Because that's exactly where it will be used.

If you have questions, reach out to me on WhatsApp. I respond fast. I am on the farms most days, so be specific and I'll get back to you.

Vinaka. Let's build something that matters.

— Uraia Koroi Kama (Cody)
Founder, Teivaka PTE LTD | Company No. 2025RC001894 | Fiji

---

## What is Teivaka?

Teivaka PTE LTD is a Fijian agricultural technology company building TFOS — the Teivaka Farm Operating System. TFOS is a mobile-first, voice-enabled, AI-assisted platform that manages crop production cycles, labor, compliance, knowledge, and finances for smallholder farmers across the Pacific. The system currently operates two farms in Fiji — one on the mainland (Serua Province) and one on Kadavu Island — with a roadmap to serve farms across the Pacific Island nations.

The platform is built around four pillars: a structured Knowledge Base (KB) of expert crop protocols, the Farm OS (TFOS) for operational management, the Teivaka Intelligence System (TIS) for AI-assisted decision support, and a Community marketplace for buyers, sellers, and price discovery. It is delivered as a React 18 Progressive Web App backed by a FastAPI/PostgreSQL/Celery backend, hosted on Hetzner ARM64 infrastructure in Nuremberg, and communicating with farmers primarily via WhatsApp.

---

## The Four Pillars

### Pillar 1: Knowledge Base (KB)
The KB is an expert-validated library of agricultural protocols covering all 49 productions in the Teivaka system. Articles are linked to specific farm production stages — so when a crop unit enters the "Fruiting" stage, the relevant fruiting protocol surfaces automatically. The KB powers TIS's Knowledge Broker via RAG (Retrieval-Augmented Generation) using pgvector similarity search. Every KB answer cites its source article and expert validator. No answer is generated from Claude's general training knowledge — only from the KB. This is a hard technical constraint enforced via a cosine similarity threshold (0.65), not just a prompt engineering convention.

### Pillar 2: TFOS (Farm OS)
TFOS is the operational core — the full cycle management system for production planning, scouting, labor, inputs, harvests, and finances. It manages the lifecycle of every crop from seedbed preparation to post-harvest rest, enforces compliance (chemical withholding periods, crop rotation), and computes the primary financial metric: CoKG (Cost per Kilogram). CoKG = (TotalLaborCost + TotalInputCost + TotalOtherCost) / TotalHarvestQty_kg. Every screen that shows financial data should lead with CoKG — it is the single most important number for a smallholder farmer's profitability.

### Pillar 3: TIS (Teivaka Intelligence System)
TIS is the AI layer — a three-module system that (1) answers crop management questions from the KB (Knowledge Broker), (2) executes voice and text commands to log data (Command Executor — 12 commands including LOG_HARVEST, LOG_LABOR, CHECK_FINANCIALS), and (3) interprets the daily Decision Engine signals to generate farm health insights (Analytics Advisor). The voice pipeline runs: Voice recording → Whisper API transcription → TIS intent detection → Command Executor → TFOS API → Database. Target end-to-end latency: under 5 seconds. TIS communicates in mixed Fijian-English — warm, concise, practical.

### Pillar 4: Community (Marketplace)
The Community pillar (Phase 2) is a marketplace and information platform connecting Teivaka farmers with buyers, agricultural suppliers, and each other. It includes a real-time price index (crowdsourced commodity prices), a buyer directory, a farmer forum, and eventually integration with Stripe for digital transactions. Community price data feeds back into TFOS's price_master table, improving the accuracy of financial forecasting and TIS financial advice. This pillar is not built in Phase 1 MVP — it is designed now so the architecture accommodates it cleanly.

---

## The ONE Thing That Must Never Break: Multi-Tenancy Isolation

**F001 (Save-A-Lot Farm, Serua) data must NEVER appear in F002 (Viyasiyasi Farm, Kadavu) context — or in any other tenant's context. Ever.**

This is not just a best practice. It is a commercial and legal requirement. Farm financial data, worker data, and operational data are commercially sensitive. A bug that leaks F001 harvest data to another tenant, or mixes F001 and F002 financials, is a trust-destroying defect that cannot be patched retroactively.

### How Isolation is Enforced

**Layer 1 — PostgreSQL Row Level Security (RLS):**
Every operational table has `tenant_id UUID NOT NULL` and an RLS policy:
```sql
ALTER TABLE production_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON production_cycles
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```
The database itself rejects any query that would return another tenant's rows, even if the application has a bug. This is the backstop.

**Layer 2 — FastAPI Middleware:**
Every request sets `app.current_tenant_id` from the validated JWT:
```python
async def set_tenant_context(request: Request, db: AsyncSession):
    tenant_id = request.state.user.tenant_id
    await db.execute(text(f"SET app.current_tenant_id = '{tenant_id}'"))
```

**Layer 3 — SQLAlchemy Query Filters:**
All repository functions include `tenant_id = :tenant_id` in WHERE clauses as a defence-in-depth measure, even though RLS would catch any omission.

**The shared schema exception:**
`shared.*` tables (shared.productions, shared.actionable_rules, shared.kb_articles, shared.chemical_library) are truly shared and have NO tenant_id. These are reference data, not operational data. This is correct and intentional.

**Testing requirement:**
Before any PR that touches database queries is merged, verify that running a query with Tenant A's session cannot return Tenant B's data. There is a test fixture for this in `tests/test_multi_tenancy.py` — it must pass.

---

## The Five Most Complex Pieces to Build

### 1. Rotation Engine
**What it is:** A pre-computed lookup table of 1,444 rotation rules across 7 status types (PREF/OK/AVOID/BLOCK/COND/OVERLAY/N/A), enforced at cycle creation via `validate_rotation()`.

**Why it's complex:**
- 49 × 49 = 2,401 possible crop pairings; 1,444 are explicitly defined
- 7 distinct status types with different enforcement behaviors (BLOCK is hard enforcement; AVOID is recommendation; COND requires conditional prompt)
- Override flow requires FOUNDER-level auth check + override_log write + audit trail
- The lookup must be O(1) — implemented as a unique index on (from_production_id, to_production_id) in shared.actionable_rules, not a formula computed at runtime
- FOUNDER override is a 3-step flow: request → auth check → confirm reason → create cycle with override_applied flag

**Where to read about it:**
- `09_knowledge_base/ROTATION_RULES_REFERENCE.md` — full 14-family policy reference
- `00_project_overview/BUSINESS_LOGIC.md` — validate_rotation() function contract
- `02_database/SCHEMA_OVERVIEW.md` — shared.actionable_rules table structure

---

### 2. Automation Engine
**What it is:** 43 rules (38 active, 5 inactive) that scan farm data on varying schedules (event-triggered, 15-minute, daily, weekly), create alerts, queue WhatsApp messages, and deduplicate.

**Why it's complex:**
- 27 trigger categories across event-driven and scheduled triggers
- Deduplication: same rule must not fire twice for same entity within 24 hours
- Auto-resolution: most alerts auto-resolve when the underlying condition clears (requires scheduled check or event hook on data change)
- Alert escalation: MEDIUM → HIGH after 3 days open, HIGH → CRITICAL after 7 days — requires a separate escalation scan
- Two rules have CRITICAL override behavior: RULE-038 (ChemicalCompliance) cannot be dismissed; RULE-034 (F002FerryBuffer) is the operationally highest-priority rule for island supply chain
- WhatsApp delivery failures must be retried (Celery retry with exponential backoff) and logged
- RULE-042 and RULE-043 had column mapping errors in v7.0 data — verify fix post-migration

**Where to read about it:**
- `09_knowledge_base/AUTOMATION_RULES_REFERENCE.md` — all 43 rules in full detail
- `03_backend/AUTOMATION_ENGINE.md` — implementation architecture
- `03_backend/CELERY_WORKERS.md` — worker and beat scheduler configuration

---

### 3. Decision Engine
**What it is:** 10 signals computed daily at 6:05 AM Fiji time from live farm data, stored as a snapshot, displayed on the farm dashboard as GREEN/AMBER/RED with 0–10 scores and trend arrows.

**Why it's complex:**
- 10 different data sources, each with different query patterns
- Signal 2 (DaysSinceLastHarvest) has a special threshold override for CRP-KAV cycles (180 days, not 7)
- All 10 signals must compute in < 3 seconds total on the daily run (CAX21 has 4 vCPU — batch queries carefully)
- Trend calculation requires comparing to the 7-day-ago snapshot (a TimescaleDB time-offset query)
- Dashboard reads from snapshot, not live tables — this is why the snapshot architecture exists
- First snapshot must be triggered manually on deployment day (no historical data yet)
- `decision_signal_config` table holds configurable thresholds — never hardcode GREEN/AMBER/RED values

**Where to read about it:**
- `09_knowledge_base/DECISION_ENGINE_REFERENCE.md` — all 10 signals, full computation specs
- `03_backend/TIS_SPECIFICATION.md` — Analytics Advisor module that consumes these signals

---

### 4. TIS Command Executor (Voice Pipeline)
**What it is:** A pipeline that takes voice (or text) input from a farmer, transcribes it via Whisper API, identifies the command intent (12 commands: LOG_HARVEST, LOG_LABOR, LOG_PEST, LOG_EXPENSE, LOG_INCOME, LOG_CHEMICAL, LOG_WEATHER, CHECK_FINANCIALS, CHECK_STOCK, GET_PROTOCOL, CREATE_TASK, GET_ALERTS), executes the command against TFOS API, and returns a confirmation within 5 seconds.

**Why it's complex:**
- Whisper transcription accuracy for Fijian-English mixed speech is imperfect — need intent parsing that handles transcription errors ("forty two" vs "42", "PU two" vs "PU-002")
- Chemical compliance check must run before LOG_HARVEST executes — if blocked, the voice command returns a clear refusal, not a silent failure
- 12 commands must parse natural language inputs into structured DB writes (not just keyword matching)
- Latency target is 5 seconds end-to-end: audio capture (1s) + upload + Whisper (2s) + intent + DB write (1s) + response (0.5s) = ~4.5s
- Offline mode: if device has no connection, voice log must write to IndexedDB with status='pending' and sync when reconnected
- TIS voice_log must be stored for audit: tis_voice_logs table records raw transcript, parsed command, execution_result, latency_ms

**Where to read about it:**
- `03_backend/TIS_SPECIFICATION.md` — all 12 commands, intent parsing, voice pipeline architecture
- `10_handoff/MVP_CHECKLIST.md` — MVP Features 3 and 9 (voice command MVP acceptance criteria)

---

### 5. Offline-First PWA (IndexedDB + Service Worker + Sync Queue)
**What it is:** The React 18 Progressive Web App must function completely offline for core logging tasks (LOG_HARVEST, LOG_LABOR, LOG_PEST, field events). Data written offline is cached in IndexedDB with status='pending' and synced automatically when connectivity returns.

**Why it's complex:**
- Service Worker must intercept POST/PUT API calls and redirect to IndexedDB when offline
- Sync queue must be FIFO and deduplicated — the same record must not be submitted twice on reconnect
- Conflict resolution: if a server-side record was created by another user while offline (e.g., another worker logged the same harvest from a different device), the sync must detect and resolve the conflict
- F002 (Kadavu island) is the primary use case — connectivity regularly drops for 2–24 hours
- IndexedDB schema must mirror the server-side DB schema for the 5 critical log tables
- Cache invalidation: after sync completes, IndexedDB records update to status='synced' and the UI refreshes from server data
- Voice logs must also queue offline (audio blob stored in IndexedDB, uploaded when reconnected)

**Where to read about it:**
- `01_architecture/ARCHITECTURE.md` — PWA architecture section, offline-first design
- `10_handoff/MVP_CHECKLIST.md` — MVP Feature 10 (offline sync acceptance criteria)

---

## First-Day Checklist

Complete these in order. Do not skip steps — each builds on the previous.

```
Reading (do this before writing any code)
  □ Read 00_project_overview/README.md
      Start here. Four pillars explained. Glossary of all Teivaka-specific terms.
      Read the entire file — it is the single source of truth for what the system does.

  □ Read 00_project_overview/BUSINESS_LOGIC.md
      All business rules. CoKG formula. Profit share structure (F001/Nayans).
      Rotation gate logic. Alert escalation. Subscription tiers. Every critical
      business rule is in this file — if code contradicts this file, the code is wrong.

  □ Read 01_architecture/ARCHITECTURE.md
      System design diagram. Request lifecycle for each major feature.
      Multi-tenancy architecture. Offline-first design. Voice pipeline.

  □ Read 02_database/SCHEMA_OVERVIEW.md
      Domain overview. Index strategy. Why TimescaleDB for time-series tables.
      The shared vs tenant schema split. RLS policy design.

  □ Read 03_backend/TIS_SPECIFICATION.md
      TIS three-module architecture. All 12 commands. Knowledge Broker RAG flow.
      Hard cosine threshold rule (0.65). Voice pipeline latency budget.

  □ Read 03_backend/AUTOMATION_ENGINE.md
      All 43 rules. Deduplication logic. Celery task architecture.
      Auto-resolution mechanism. Alert escalation schedule.

  □ Read 09_knowledge_base/ROTATION_RULES_REFERENCE.md (this folder)
      All 14 family policies. The 7 status types. Override flow.

  □ Read 09_knowledge_base/DECISION_ENGINE_REFERENCE.md (this folder)
      All 10 signals. Snapshot architecture. The CRP-KAV 180-day threshold.

  □ Read 10_handoff/OPEN_QUESTIONS.md (this folder)
      15 open questions that affect implementation decisions.
      Review with Cody before building the affected features.

Environment Setup (do this while reading)
  □ Install Docker + Docker Compose (or verify existing installation)
  □ Clone repository: git clone https://github.com/teivaka/teivaka-api.git
  □ Copy .env: cp .env.example .env
  □ Fill .env with development values (use test API keys for Claude, OpenAI, Twilio)
  □ Start database: docker compose up -d db
  □ Wait for health: docker compose ps → db shows "running (healthy)"

Database Validation
  □ Run shared schema: docker compose exec db psql -U teivaka -d teivaka_db -f /migrations/01_shared_schema.sql
  □ Run functions: docker compose exec db psql -U teivaka -d teivaka_db -f /migrations/05_functions.sql
  □ Run seed data: docker compose exec db psql -U teivaka -d teivaka_db -f /migrations/04_seed_data.sql
  □ Run migration script:
      docker compose exec api python migration_scripts/extract_shared_data.py
  □ Verify production count:
      SELECT COUNT(*) FROM shared.productions; → MUST return 49
      If not 49: stop and investigate before proceeding.
  □ Verify CRP-KAV inactivity threshold:
      SELECT inactivity_alert_days FROM shared.production_thresholds
      WHERE production_id = 'CRP-KAV'; → MUST return 180
      If returns 7: the CRP-KAV override is missing — fix before building automation.
  □ Verify automation rules:
      SELECT COUNT(*) FROM automation_rules; → 43
      SELECT COUNT(*) FROM automation_rules WHERE is_active = true; → 38

First Code
  □ Build auth module first: POST /auth/login, GET /auth/me
      Everything else depends on JWT authentication working correctly.
  □ Build farm and PU list endpoints second: GET /farms, GET /farms/{farm_id}
      Dashboard and all operational endpoints depend on farm context.
  □ Verify tenant isolation works before building any data endpoints:
      Run tests/test_multi_tenancy.py — all tests must pass.

Contact
  □ WhatsApp Cody (Uraia Koroi Kama) to introduce yourself
  □ Request access to TFOS v7.0 Google Sheets (VIEW access — needed for migration scripts)
  □ Confirm Hetzner server access if deploying (SSH key to be added by Cody)
```

---

## File Reference Map

| What You're Building | Files to Read |
|---------------------|---------------|
| Authentication + users | 01_architecture/ARCHITECTURE.md, 01_architecture/API_DESIGN.md |
| Farm and PU management | 02_database/SCHEMA_OVERVIEW.md, 03_backend/MODELS.md |
| Production cycle lifecycle | 00_project_overview/BUSINESS_LOGIC.md |
| Rotation engine | 09_knowledge_base/ROTATION_RULES_REFERENCE.md, 02_database/SCHEMA_OVERVIEW.md |
| Automation engine | 09_knowledge_base/AUTOMATION_RULES_REFERENCE.md, 03_backend/AUTOMATION_ENGINE.md, 03_backend/CELERY_WORKERS.md |
| Decision engine signals | 09_knowledge_base/DECISION_ENGINE_REFERENCE.md |
| TIS voice/chat commands | 03_backend/TIS_SPECIFICATION.md |
| Knowledge base + RAG | 09_knowledge_base/TIS_KNOWLEDGE_BASE_ARCHITECTURE.md |
| Chemical compliance | 00_project_overview/BUSINESS_LOGIC.md, 02_database/schema/05_functions.sql |
| Multi-tenancy and RLS | 01_architecture/MULTI_TENANCY.md |
| Offline PWA + IndexedDB | 01_architecture/ARCHITECTURE.md (PWA section) |
| Celery workers + Beat | 03_backend/CELERY_WORKERS.md |
| Deployment | 08_deployment/DEPLOYMENT_GUIDE.md |
| Scaling decisions | 08_deployment/SCALING_PLAN.md |
| Crop agronomic data | 09_knowledge_base/CROP_INTELLIGENCE.md |
| MVP acceptance criteria | 10_handoff/MVP_CHECKLIST.md |
| Open decisions/blockers | 10_handoff/OPEN_QUESTIONS.md |
| Data migration from v7.0 | 05_data_migration/migration_scripts/ |

---

## Contact Information

**Uraia Koroi Kama (Cody)**
Founder, Teivaka PTE LTD
Company No. 2025RC001894 (Fiji)
Preferred communication: WhatsApp (ask for number on first day)
Response time: Usually same day. If urgent, say "URGENT" at the start of the message.
Office hours: None formal — Cody is on the farms most days. Best times: 7–9am Fiji time or after 6pm Fiji time.

---

## Definition of Done — Phase 1 MVP

Phase 1 MVP is complete when Cody (Uraia Koroi Kama) can use the system for F001 and F002 daily farm operations from a mobile browser, with voice commands working for key logging tasks.

The 10 MVP acceptance criteria are defined in `10_handoff/MVP_CHECKLIST.md`. All 10 must pass before MVP is declared complete.

In plain English, MVP is done when:
1. Cody can log in from his phone in the field
2. The dashboard shows all 10 Decision Engine signals in real time
3. Laisenia Waqa (W-001) can log a harvest by speaking into his phone
4. Chemical compliance blocks any harvest that violates a withholding period
5. CoKG is computed and displayed for every active cycle
6. WhatsApp alerts reach Cody's phone for overdue tasks
7. Rotation validation blocks replanting the same crop family too soon
8. TIS answers crop management questions from the KB (not from Claude's general knowledge)
9. Voice commands execute end-to-end in under 5 seconds
10. Offline logging works on F002 Kadavu where connectivity is absent

---

## Cultural Notes — Fiji Context Matters

This is not a disclaimer — it is a core product requirement.

**WhatsApp is the primary communication channel.** Field workers communicate with management via WhatsApp. The system sends alerts via WhatsApp. TIS commands can be sent via WhatsApp. If a feature doesn't work in the context of WhatsApp, it won't be used. Build with this in mind.

**Voice commands are not a nice-to-have.** Many field workers have low literacy or are more comfortable speaking than typing. The voice pipeline is not a premium feature — it is the primary input method for field data. If voice doesn't work well, the system doesn't get used.

**Mobile-first means designed for slow 3G, not just small screens.** The PWA must load on a 3G connection in under 4 seconds. Heavy JavaScript bundles, large images, and excessive API round-trips will make the product unusable in the field. Optimize for load performance from the start.

**Fiji business relationships are built on trust, not contracts.** The profit share arrangement between Teivaka and Nayans (F001 landowner) is a personal arrangement — the system must handle it correctly but should never surface financial details in a way that creates awkwardness. The profit_share module should be FOUNDER-only access by default.

**Language:** TIS responses should be warm and use mixed Fijian-English naturally — "Vinaka, Laisenia!" in confirmations. "Io, done." for quick acknowledgements. This is not tokenism — it is how Fijians actually communicate. It makes the product feel local, not foreign.

**Seasonality matters.** Fiji has a wet season (Nov–Apr) and dry season (May–Oct). Many crop decisions, price expectations, and labor patterns are seasonal. When writing tests or checking business logic, remember that a MEDIUM harvest gap alert in June (dry season eggplant peak) has very different implications than the same alert in January (wet season, prices low).

**Both farms are real and operational right now.** F001 has cassava, eggplant (2 units), and 4 beehives producing. F002 has kava (2 units), pineapple, and 8 goats. Every feature you build will be tested against live farm data. If your code breaks the eggplant harvest logging, there is a real consequence on a real farm. Build with that weight in mind.
