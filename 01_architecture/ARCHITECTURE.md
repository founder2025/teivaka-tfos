# FILE: 01_architecture/ARCHITECTURE.md

# Teivaka TFOS — System Architecture

**Platform:** Teivaka Agricultural TOS
**Company:** Teivaka PTE LTD, Fiji
**Founder:** Uraia Koroi Kama (Cody)
**Last Updated:** 2026-04-07
**Version:** 1.0

---

## 1. Platform Overview — Four Pillars

Teivaka Agricultural TOS is built around four interconnected pillars that together form a complete farm intelligence and operations platform:

### Pillar 1 — KB (Knowledge Base)
The Knowledge Base is the shared agronomic intelligence layer. It contains validated, expert-reviewed content covering all 49 supported crop productions, growth stage protocols, input recommendations, pest and disease identification, chemical library with withholding periods, weed management, and crop rotation rules. The KB lives in the `shared.*` schema — it has no `tenant_id` and is read-only at runtime. All tenants read from the same KB. When Teivaka's agronomy team updates KB content, the change is immediately available to every tenant without migration. The KB is the ground truth that the TIS Knowledge Broker RAG pipeline queries when farmers ask agronomic questions.

### Pillar 2 — TFOS (Farm OS)
TFOS is the core operational layer — the Farm Operating System. It tracks the full crop lifecycle from production unit setup through planting cycles, field events, harvests, and financial analysis. TFOS manages labor attendance, inventory and input tracking, equipment, nursery batches, cash flow, deliveries, and alerts. Every operational record lives in the `tenant.*` schema, partitioned by `tenant_id` and protected by Row Level Security at the PostgreSQL level. TFOS is the system of record for everything that happens on a farm. It exposes the bulk of the REST API surface area. The Automation Engine (43 rules, 6:00am daily) and Decision Engine (10 signals, 6:05am daily) run against TFOS data to generate proactive alerts and farm intelligence.

### Pillar 3 — TIS (Teivaka Intelligence System)
TIS is the AI assistant layer. It has three modules: (1) Knowledge Broker — RAG over validated KB articles using semantic search, answers constrained strictly to KB content, never hallucinated; (2) Operational Interpreter — reads live TFOS data (active cycles, financials, alerts, signals) and explains the farm's current situation in plain language; (3) Command Executor — parses voice and text commands into 12 command types and executes TFOS API calls on the farmer's behalf. TIS is accessible via PWA chat and voice recording. Voice input is transcribed by Whisper API before being passed to TIS. All TIS interactions are stored in `tis_conversations` and `tis_voice_logs`.

### Pillar 4 — Community
The Community pillar connects Teivaka farmers to each other and to the broader agricultural market. Features include a marketplace for listing produce and inputs, a price index for key commodities, a supplier directory, a buyer directory, and a community forum/posts feed. In Phase 1, Community features are view-only for tenants; full posting and listing is available in Phase 2. The Community platform shares the same FastAPI backend (separate router group: `/api/v1/community/*`) and PostgreSQL database (Domain 15 tables), enabling direct data joins between community data and TFOS data — for example, harvest log projections feeding community supply forecasts, and community price index feeding back into the TFOS price master.

### How the Four Pillars Interconnect

```
KB (shared.*) ─────────────────────────────────────────────────────┐
  49 crops, stages, protocols,                                       │
  thresholds, rotation rules,                                        │  READ
  pest/disease/weed/chemical libraries,                              │  ONLY
  KB articles                                                        │
                                                                     ▼
TFOS (tenant.*) ────────────────────────────────────────────────────┤
  Farms, Zones, PUs, Cycles,                                         │
  Events, Harvests, Labor,                                           │  LIVE
  Inventory, Financial, Alerts,                                      │  DATA
  Automation Engine, Decision Engine                                 │
                                                                     ▼
TIS (AI layer) ──────────────────────────────────────────────────────┤
  Knowledge Broker (KB → Claude)                                     │  AI
  Operational Interpreter (TFOS → Claude)                            │  LAYER
  Command Executor (voice/text → TFOS API)                           │
                                                                     ▼
Community (shared marketplace) ─────────────────────────────────────┘
  Listings, Price Index,                                             MARKET
  Suppliers, Buyers, Posts                                           LAYER
  (joins harvest_log projections)
```

---

## 2. Seven-Layer Stack

### Layer 1 — Client

The client layer consists of three interface surfaces:

**React 18 PWA (Primary Interface)**
The main user interface is a Progressive Web App built with React 18. It is designed offline-first: a Service Worker intercepts all API calls and caches responses. When connectivity is lost, all new logging operations (field events, harvest records, labor attendance, cash transactions) are written to IndexedDB with a `status: 'pending'` flag. When connectivity is restored, the Service Worker fires a background sync event, and the PWA sends all pending operations to the `/api/v1/sync/batch` endpoint in a single batch. The PWA is installable on Android and iOS home screens. It uses React Query for server state management, Zustand for local state, and Workbox for Service Worker management.

Key PWA capabilities:
- Offline field logging via IndexedDB queue
- Voice recording via Web Audio API (max 60 seconds, sent as multipart/form-data)
- Photo capture and compression (max 1200px, max 10MB before upload)
- Real-time alerts via WebSocket connection to TIS
- Push notifications for CRITICAL alerts (via Service Worker push)

**WhatsApp Business (Secondary Interface)**
Farmers and field workers who prefer WhatsApp can interact with TIS directly via WhatsApp messaging. Incoming messages arrive at the Twilio WhatsApp Business webhook (`POST /api/v1/webhooks/whatsapp`). The FastAPI backend routes the message content through the TIS router — the same Knowledge Broker, Operational Interpreter, and Command Executor that serve the PWA. Responses are sent back via the Twilio API. Twilio webhook signature verification is enforced on every incoming request. WhatsApp is also the primary channel for outbound alerts — the Automation Engine sends CRITICAL and HIGH alerts as WhatsApp messages to the relevant farmer's registered phone number.

**Mobile Browser**
All PWA functionality is accessible via mobile browser without installation. The UI is fully responsive and touch-optimized. Field workers with low-end Android devices can use the browser version without installing the PWA.

---

### Layer 2 — API Gateway

**Caddy Reverse Proxy**
Caddy serves as the single entry point for all HTTP and WebSocket traffic. It handles:
- Automatic HTTPS certificate issuance and renewal via Let's Encrypt (zero-configuration TLS)
- Reverse proxying to the FastAPI application running on the Hetzner VPS (CAX21)
- Rate limiting response headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`)
- WebSocket proxying for TIS real-time connections (`/api/v1/tis/ws`)
- Static file serving for the React PWA build artifacts
- GZIP compression for all text responses
- Security headers: `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`

Caddy configuration routes:
- `/*.` → React PWA static files (HTML, JS, CSS, Service Worker)
- `/api/*` → FastAPI application (Uvicorn, port 8000)
- `/api/v1/tis/ws` → FastAPI WebSocket endpoint (Uvicorn)
- `/webhooks/*` → FastAPI webhook handlers

**Rate Limiting**
Rate limiting is enforced at the FastAPI middleware layer (not Caddy), using Redis counters with sliding window. Caddy forwards headers but enforcement logic lives in the application.

---

### Layer 3 — Service Modules (FastAPI Application)

The FastAPI 0.115+ application is the core of the system. It is structured as a collection of routers, each responsible for a logical domain, plus a shared middleware stack that every request passes through.

**Router Groups:**
- `auth` — Login, logout, token refresh, change password
- `farms` — Farm CRUD, dashboard, stats, expansion readiness
- `zones` — Zone management within farms
- `production_units` — PU CRUD, status, current cycle
- `productions` — Shared crop catalog (read-only from shared schema)
- `cycles` — Production cycle lifecycle (create with rotation validation, close, fail, financials)
- `events` — Field event logging (observations, tasks, pest/disease sightings)
- `harvests` — Harvest logging with automatic chemical compliance check
- `income` — Income record management
- `labor` — Labor attendance logging
- `weather` — Weather observation logging per zone
- `delivery` — Delivery tracking and confirmation
- `nursery` — Nursery batch tracking
- `cash` — Cash ledger entries and balance
- `inputs` — Input inventory management
- `orders` — Purchase order workflow
- `workers` — Worker profiles and performance
- `equipment` — Equipment and maintenance tracking
- `suppliers` — Supplier directory (shared)
- `customers` — Customer management
- `livestock` — Livestock tracking and events
- `hives` — Beehive management and honey harvest
- `financial` — CoKG, P&L, budget vs actual, profit share, crop ranking
- `tasks` — Task queue management
- `alerts` — Alert management and resolution
- `decision_engine` — Read decision signal snapshots
- `automation` — Automation rule management
- `rotation` — Rotation validation and override
- `knowledge` — KB article and library access (shared schema)
- `tis` — TIS chat, voice command, conversations, insights
- `dashboard` — Single-call dashboard aggregation
- `reports` — Weekly KPI, monthly P&L, cycle reports
- `community` — Marketplace, price index, posts
- `subscriptions` — Subscription management
- `admin` — Admin-only system management
- `webhooks` — Twilio WhatsApp webhook handler

**Middleware Stack (applied to every request in order):**

1. **CORS Middleware** — Allows configured origins (PWA domain, admin panel domain)
2. **Request ID Middleware** — Injects `X-Request-ID` header for tracing
3. **Logging Middleware** — Structured JSON request/response logging (method, path, status, duration, tenant_id)
4. **JWT Auth Middleware** — Validates Bearer JWT on all protected routes; extracts `user_id`, `tenant_id`, `farm_ids`, `role`; rejects expired or invalid tokens with 401
5. **RLS Middleware** — After JWT validation, executes `SET LOCAL app.tenant_id = '{tenant_id}'` on the database connection before any query; ensures all queries in that request are filtered to the tenant's data by PostgreSQL RLS policies
6. **Subscription Tier Gate** — Checks the requesting tenant's subscription tier against the minimum required tier for the endpoint being accessed; returns 403 with `TIER_INSUFFICIENT` error code if below minimum
7. **Rate Limit Middleware** — Checks Redis counter for the rate limit key (`{endpoint_group}:{tenant_id}:{window}`); returns 429 if exceeded; increments counter on success

---

### Layer 4 — Task Queue (Celery)

Celery 5.4 workers run alongside the FastAPI application, consuming tasks from Redis as the message broker. Tasks are used for all operations that should not block the API response.

**Celery Beat Scheduled Tasks:**

| Task | Cron (UTC) | Fiji Local Time | Description |
|------|------------|-----------------|-------------|
| `run_automation_engine` | `0 18 * * *` | 6:00am daily | Evaluates all 43 automation rules against live DB data |
| `run_decision_engine` | `5 18 * * *` | 6:05am daily | Scores all 10 decision signals, writes snapshot to `decision_signals` |
| `run_weekly_kpi_snapshot` | `20 18 * * 1` | 6:10am Monday | Generates weekly KPI summary for all active tenants |
| `refresh_materialized_views` | `0 * * * *` | Every hour | Refreshes PostgreSQL materialized views |

**Event-Triggered Tasks (queued by API):**

| Task | Trigger | Description |
|------|---------|-------------|
| `send_whatsapp_alert` | Alert record created | Fetches alert, formats WhatsApp message, calls Twilio API; SMS fallback on failure |
| `process_voice_command` | POST /tis/command received | Sends audio to Whisper API, transcribes, routes through TIS, returns confirmation |
| `sync_offline_entries` | POST /sync/batch received | Processes batch of offline-queued operations: validate, deduplicate, insert |
| `refresh_farm_dashboard` | Post-harvest or post-event | Invalidates and refreshes Redis cache for affected farm's dashboard |

**Celery Configuration:**
- Broker: Redis (db 1)
- Result backend: Redis (db 2)
- Worker concurrency: 4 workers per Celery process
- Task acknowledgment: `acks_late=True` (task not acknowledged until completion, prevents loss on worker crash)
- Task serializer: JSON
- Time zone: UTC
- Beat schedule stored in Redis (not database)

**Worker Queues:**
- `default` — General tasks (sync, cache refresh)
- `alerts` — WhatsApp and SMS alert delivery (high priority)
- `ai` — Voice processing and TIS operations (separate, higher timeout)
- `scheduled` — Automation engine, decision engine, KPI snapshots

---

### Layer 5 — Database

**PostgreSQL 16 with TimescaleDB Extension**

PostgreSQL is the primary data store. TimescaleDB is installed as a PostgreSQL extension and converts high-frequency time-series tables into hypertables, enabling efficient time-based querying and automatic data retention policies.

**TimescaleDB Hypertables** (time-series data, partitioned by time):
- `tenant.field_events` — Partitioned by `logged_at`, 7-day chunks
- `tenant.harvest_log` — Partitioned by `harvest_date`, 7-day chunks
- `tenant.cash_ledger` — Partitioned by `transaction_date`, 30-day chunks
- `tenant.weather_log` — Partitioned by `recorded_at`, 1-day chunks
- `tenant.labor_attendance` — Partitioned by `work_date`, 7-day chunks

**Materialized Views** (refreshed hourly by Celery):
- `tenant.mv_cycle_financials` — Pre-aggregated CoKG and cost breakdowns per cycle
- `tenant.mv_farm_weekly_kpi` — Rolling 13-week KPI summaries per farm
- `tenant.mv_customer_revenue` — Customer revenue totals for ranking
- `tenant.mv_pu_health` — Production unit health scores aggregating multiple signals

**Redis 7.2 Cache (TTLs):**

| Cache Key Pattern | TTL | Contents |
|-------------------|-----|----------|
| `farm:dashboard:{farm_id}` | 60s | Full dashboard payload |
| `decision:signals:{farm_id}` | 300s | Decision engine signal snapshot |
| `rotation:rules:{family_id}` | 3600s | Rotation rules for crop family |
| `kb:article:{article_id}` | 86400s | KB article content |
| `tenant:subscription:{tenant_id}` | 300s | Subscription tier |
| `rate:ai:{tenant_id}:{user_id}:{date}` | 86400s | AI endpoint rate limit counter |

**Database Connection Pooling:**
- SQLAlchemy 2.0 async engine with asyncpg driver
- Connection pool: min 5, max 20 connections per worker
- Connections use `AUTOBEGIN=True` — each request is wrapped in a transaction
- RLS `SET LOCAL` is scoped to the transaction, released on commit/rollback

---

### Layer 6 — Storage and External Services

**Supabase Storage**
All binary files (field photos, documents, voice recordings) are stored in Supabase Storage, not in PostgreSQL. The FastAPI service handles upload by:
1. Receiving the file via multipart/form-data
2. Validating file type (MIME type allowlist: `image/jpeg`, `image/png`, `image/webp`, `audio/webm`, `audio/ogg`, `audio/mp4`, `application/pdf`)
3. Validating file size (max 10MB photos, max 25MB audio)
4. For images: stripping GPS/EXIF metadata using Pillow before upload
5. For photos: resizing to max 1200px on longest dimension
6. Uploading to Supabase Storage bucket `farm-photos/{tenant_id}/{pu_id}/{filename}`
7. Storing the returned public URL in the relevant DB column (e.g., `field_events.photo_url`)

Storage bucket structure:
```
farm-photos/
  {tenant_id}/
    {pu_id}/
      {event_id}_{timestamp}.jpg
voice-recordings/
  {tenant_id}/
    {voice_log_id}.webm
documents/
  {tenant_id}/
    {document_type}/
      {filename}.pdf
```

**Twilio (WhatsApp Business API + SMS Fallback)**
Twilio handles all outbound and inbound WhatsApp and SMS communications:
- Outbound alerts: Celery worker calls Twilio API with pre-approved WhatsApp Business message templates
- Inbound commands: Twilio sends incoming WhatsApp messages to `POST /api/v1/webhooks/whatsapp` (signature verified)
- SMS fallback: If WhatsApp delivery fails after 2 retries, Celery task queues SMS via Twilio SMS API
- Delivery status webhooks: Twilio calls back with delivery status for each outbound message
- Language: All WhatsApp templates support Fijian-English code-switching

Primary channel: WhatsApp (preferred by Fijian farming community)
Fallback channel: SMS (works on basic phones, no internet required)

**Claude API (Anthropic)**
The TIS layer uses Claude API (`claude-sonnet-4-20250514`) for:
- Knowledge Broker: RAG-constrained responses using KB article context (hard constraint: only answer from KB content, never hallucinate)
- Operational Interpreter: farm context synthesis and explanation
- Command confirmation messages: natural language confirmation in Fijian-English

Claude API calls are made synchronously within Celery worker processes (not in the FastAPI request context) to avoid blocking. Temperature is set to 0.2 for Knowledge Broker (factual, deterministic) and 0.7 for Operational Interpreter (explanatory, natural).

**Whisper API (OpenAI)**
Voice-to-text transcription for the voice command pipeline:
- Model: `whisper-1`
- Language hint: `en` (English, with Fijian code-switching awareness)
- Input: WebM audio blob from PWA Web Audio API
- Output: Transcript text passed to TIS router for classification
- Timeout: 30 seconds maximum per transcription request

**Stripe (Subscription Billing)**
Stripe manages subscription billing for tenant accounts:
- Subscription tier upgrades are initiated via `POST /api/v1/subscriptions/upgrade`
- Stripe webhook (`POST /api/v1/webhooks/stripe`) updates `tenant_subscriptions` on payment success/failure
- Redis cache for subscription tier is invalidated on Stripe webhook receipt

---

### Layer 7 — Multi-Tenancy

Multi-tenancy is implemented at the PostgreSQL level using dual schemas and Row Level Security. This is the foundational architectural decision that provides data isolation between tenants without requiring separate database instances.

**Schema Separation:**

`shared.*` schema (no `tenant_id`, read-only at runtime):
- Contains all agronomic knowledge and configuration shared across all tenants
- Updated only by Teivaka admin operations (not by tenant API calls)
- Tables: `shared.productions`, `shared.production_stages`, `shared.stage_protocols`, `shared.production_thresholds`, `shared.rotation_rules`, `shared.actionable_rules`, `shared.pest_library`, `shared.disease_library`, `shared.weed_library`, `shared.chemical_library`, `shared.kb_articles`, `shared.kb_stage_links`, `shared.family_policies`

`tenant.*` schema (always has `tenant_id`, RLS enforced):
- All operational data — every table has a non-nullable `tenant_id UUID` column
- RLS policies restrict every `SELECT`, `INSERT`, `UPDATE`, `DELETE` to the current tenant
- No cross-tenant data leakage is possible even if application code has a bug

**RLS Enforcement Flow:**
1. JWT decoded in FastAPI middleware → `tenant_id` extracted
2. `SET LOCAL app.tenant_id = '{tenant_id}'` executed on database connection
3. RLS policy on each table reads `current_setting('app.tenant_id', true)::UUID`
4. All queries on that connection return only rows where `tenant_id = current_setting('app.tenant_id')`
5. `SET LOCAL` is scoped to the current transaction — released on `COMMIT` or `ROLLBACK`
6. No configuration persists between requests

---

## 3. Request Lifecycle — Field Worker Logs Harvest

**Scenario:** A field worker at Farm F001 (Save-A-Lot, Korovou Serua) logs a harvest of 40kg Eggplant Grade A on production unit PU002.

**Step-by-step:**

**Step 1.** Field worker opens the React PWA on their mobile browser while standing in the field.

**Step 2.** Worker navigates to the PU002 detail screen and taps the "Log Harvest" button. The PWA presents the harvest logging form: crop, quantity, grade, harvest_date (defaults to today), notes.

**Step 3.** Worker fills in: qty_kg=40, grade=A, crop confirmed as Eggplant from the active cycle. Worker taps "Submit."

**Step 4.** PWA checks `navigator.onLine`:
- **ONLINE path:** `POST /api/v1/production-units/{pu_id}/harvests` with JSON payload
- **OFFLINE path:** Write to IndexedDB queue: `{operation_type: 'harvest', payload: {...}, timestamp: ISO8601, status: 'pending', retry_count: 0}`. Worker sees "Saved offline — will sync when connected" banner. Processing continues when connectivity is restored.

**Step 5.** FastAPI receives the POST request. The JWT middleware validates the Bearer token: decodes JWT, checks signature and expiry, extracts `{user_id, tenant_id, farm_ids, role}`.

**Step 6.** RLS middleware executes: `SET LOCAL app.tenant_id = 'teivaka-f001-uuid'` on the current database connection. From this point, all DB queries are filtered to F001's data only.

**Step 7.** Subscription tier check: harvest logging requires `BASIC` tier or above. Middleware reads `tenant_subscriptions` (cached in Redis, TTL 300s). If tenant is on FREE tier, returns `403 TIER_INSUFFICIENT`.

**Step 8.** Chemical compliance check (`check_chemical_compliance(pu_id, harvest_date)`):
- Queries `field_events` for any chemical applications on PU002 within the past 90 days
- Joins with `shared.chemical_library` to retrieve the withholding period for each chemical applied
- If any applied chemical: `harvest_date - application_date < withholding_period_days` → **compliance violation**
- On violation: return `409 Conflict` with error body `{code: 'CHEMICAL_WITHHOLDING_VIOLATION', message: 'Harvest blocked: [Chemical Name] applied [N] days ago, withholding period is [W] days. Safe harvest date: [date]', details: {chemical_id, applied_date, withholding_days, safe_harvest_date}}`
- Simultaneously queue Celery task `send_whatsapp_alert` with a CRITICAL alert to the farm manager
- Processing stops — harvest is NOT logged

**Step 9.** If chemically compliant: `INSERT INTO tenant.harvest_log (tenant_id, pu_id, cycle_id, harvest_date, qty_kg, grade, notes, logged_by) VALUES (...)`. The DB trigger fires simultaneously as the second enforcement layer:
- DB trigger `trg_harvest_compliance_check` re-validates withholding periods at the database level (independent of application code)
- If trigger finds a violation it did not catch at the API level, it raises an exception and rolls back the insert

**Step 10.** The `harvest_log` INSERT fires additional triggers:
- `trg_harvest_generate_hrv_id`: auto-generates `hrv_id` in format `HRV-YYYYMMDD-###` (e.g., `HRV-20260407-001`), where `###` is a daily sequence number per tenant
- `trg_harvest_update_cycle_financials`: updates `production_cycles` aggregate columns: `total_harvest_kg`, `actual_revenue_estimate`
- `trg_harvest_flag_view_refresh`: sets a Redis flag `views:refresh:{farm_id}` that the hourly materialized view refresh picks up

**Step 11.** Post-insert business logic:
- Check if there was an open alert of type `HARVEST_GAP` for this PU. If yes: auto-resolve the alert (update `alerts` status to `resolved`), queue Celery task `send_whatsapp_alert` with alert-resolved notification.
- Queue Celery task `refresh_farm_dashboard` to invalidate Redis cache for `farm:dashboard:{farm_id}` (TTL 60s)

**Step 12.** Response returned to PWA:
```json
{
  "success": true,
  "data": {
    "harvest_id": "uuid-...",
    "hrv_id": "HRV-20260407-001",
    "pu_id": "pu002-uuid",
    "cycle_id": "cycle-uuid",
    "qty_kg": 40,
    "grade": "A",
    "harvest_date": "2026-04-07",
    "compliance_status": "COMPLIANT",
    "logged_by": "user-uuid"
  }
}
```

**Step 13.** PWA updates local React Query cache with the new harvest record. The PU detail screen refreshes to show the latest harvest. If the operation originated from an IndexedDB offline queue entry, the PWA marks that entry as `status: 'synced'`.

---

## 4. Request Lifecycle — Voice Command Pipeline

**Scenario:** Field worker at Farm F002 (Viyasiyasi, Kadavu Island) says: "Log harvest PU three, forty kilograms eggplant grade A."

**Target latency: Under 5 seconds end-to-end.**

**Step 1.** Field worker taps the microphone button in the React PWA. The PWA activates the Web Audio API and begins recording. A visual waveform indicator shows recording is active. Maximum recording duration: 60 seconds.

**Step 2.** Worker speaks the command. Taps the microphone button again to stop recording. The PWA finalizes the audio blob (format: WebM/Opus via MediaRecorder API).

**Step 3.** PWA sends: `POST /api/v1/tis/command` with `Content-Type: multipart/form-data`. Body contains: `audio` (the WebM blob), `farm_id` (current farm context), `context` (optional: current PU ID if worker was viewing a PU screen).

**Step 4.** FastAPI receives the request. JWT middleware validates token, extracts `{user_id, tenant_id, role}`. Rate limit check: Redis counter key `tis:{tenant_id}:{user_id}:{date}`. AI endpoints allow 10 requests/minute. If rate limit exceeded: `429 Too Many Requests` with `Retry-After` header.

**Step 5.** FastAPI creates a `tis_voice_logs` record with `status: 'processing'`, stores the audio file reference (uploaded to Supabase Storage: `voice-recordings/{tenant_id}/{voice_log_id}.webm`). Returns immediate `202 Accepted` response with `{voice_log_id, poll_url: '/api/v1/tis/voice-logs/{voice_log_id}'}`. The PWA switches to polling mode (or uses WebSocket if available).

**Step 6.** Celery task `process_voice_command(voice_log_id)` is queued to the `ai` queue.

**Step 7.** Celery worker picks up task. Fetches audio file from Supabase Storage. Calls **Whisper API**:
```
POST https://api.openai.com/v1/audio/transcriptions
model: whisper-1
language: en
file: [audio blob]
```
Whisper returns transcript: `"Log harvest PU three forty kilograms eggplant grade A"`

**Step 8.** Transcript logged to `tis_voice_logs.transcript`. Timestamp logged.

**Step 9.** TIS Router classifies the transcript:
- Not a KB question (no agronomic query keywords)
- Not an explanation request (no "tell me about my farm" pattern)
- **Command detected** (contains "log", "harvest", and numeric quantities) → **Command Executor module**

**Step 10.** Command Executor activates. Intent parsing:
- Command type: `LOG_HARVEST` (1 of 12 command types)
- Entity extraction via regex + NLP:
  - `pu_reference`: "PU three" → resolve to `pu_id` for PU003 in the farm context
  - `qty_kg`: 40
  - `crop_mention`: "eggplant" → validated against active cycle on PU003
  - `grade`: "A"
  - `harvest_date`: today (implied, no date specified)

**Step 11.** Command Executor validates entities:
- Confirms PU003 exists in tenant's farm and has an active cycle
- Confirms active cycle crop matches "eggplant"
- Proceeds to call the harvest logging function internally (same business logic as the REST endpoint: chemical compliance check, DB insert, trigger fires)

**Step 12.** `harvest_log` record created. `hrv_id` generated: `HRV-20260407-002`.

**Step 13.** Confirmation response assembled in Fijian-English:
`"Sa vakacaucautaki. Harvest record HRV-20260407-002 created: 40kg Eggplant Grade A on PU003, 7 April 2026."`

**Step 14.** `tis_voice_logs` record updated: `status: 'completed'`, `response_text: '...'`, `processing_time_ms: 3840`.

**Step 15.** Response delivered to PWA:
- If PWA is polling: `GET /api/v1/tis/voice-logs/{voice_log_id}` returns completed status with response text
- If WebSocket active: server pushes response immediately via WebSocket
- PWA displays confirmation message, plays text-to-speech (if enabled)

**Total pipeline time: ~3.8–4.5 seconds** (Whisper: ~1.5s, entity parsing: ~0.2s, DB insert: ~0.3s, Claude API if needed: ~1.5s, network: ~0.3s)

---

## 5. Request Lifecycle — Automation Engine Daily Run (6:00am Fiji)

**Scenario:** The nightly Celery Beat task fires at 6:00am Fiji time (18:00 UTC previous day).

**Step 1.** Celery Beat scheduler evaluates cron `0 18 * * *` UTC. It is 18:00:00 UTC (06:00:00 Fiji time). Beat enqueues `run_automation_engine` task to the `scheduled` Celery queue.

**Step 2.** A Celery worker picks up the task. The worker opens a database connection and iterates over all active tenants (from `tenants` table where `status = 'active'`).

**Step 3.** For each tenant, the worker sets `SET LOCAL app.tenant_id = '{tenant_id}'` on its DB connection, then loads all active automation rules: `SELECT * FROM tenant.automation_rules WHERE status = 'Active' ORDER BY priority DESC`. The 43 rules cover categories including:
- Harvest gap detection (PU expected harvest date passed without harvest record)
- Input stock alerts (inventory below reorder threshold)
- Labor shortfall warnings (insufficient workers assigned vs cycle requirement)
- Chemical withholding warnings (upcoming harvest within withholding window)
- Weather anomaly alerts (extreme temperature or rainfall events)
- Ferry supply buffer check (F002-specific: RULE-034, weekly check for Kadavu island supply shipment via Sea Master Shipping SUP-012)
- Decision signal degradation alerts (signal score drops below threshold)
- Cycle overdue closure (cycle exceeded expected end date by >7 days)
- Cash balance warnings (cash forecast going negative within 2 weeks)
- Customer overdue payment alerts (invoice outstanding >30 days)

**Step 4.** For each rule, evaluate its trigger condition:
- Rules have a `condition_sql` field: a parameterized SQL expression evaluated against live DB data
- The worker executes the condition SQL with `tenant_id` scoped
- Example rule (RULE-034, F002 Ferry Buffer): checks if this is Monday, checks if a supply order for SUP-012 (Sea Master Shipping) has been approved for delivery this week, and checks if F002 inputs stock is above minimum ferry-dependent threshold for the coming week. If not, alert fires.

**Step 5.** Deduplication check before creating an alert:
- `alert_key = '{rule_id}:{target_id}:{week_start}'`
- Query: `SELECT id FROM tenant.alerts WHERE alert_key = $1 AND status IN ('open', 'in_progress')`
- If an open alert with this key already exists: **skip** — do not create a duplicate. Move to next rule.

**Step 6.** If condition is met and no duplicate open alert exists:
- Insert into `tenant.alerts`: `{tenant_id, rule_id, alert_type, severity, title, body, target_type, target_id, alert_key, status: 'open'}`
- If rule has `auto_create_task = true`: insert into `tenant.task_queue`: `{tenant_id, alert_id, task_type, description, assigned_to, due_date}`

**Step 7.** Auto-resolution pass:
- For each currently open alert: re-evaluate its rule condition against current DB data
- If condition is now `false` (situation resolved): update `alerts.status = 'resolved'`, set `resolved_at = NOW()`, set `resolution_method = 'auto'`

**Step 8.** WhatsApp notification dispatch:
- For all newly created alerts where `severity IN ('CRITICAL', 'HIGH')`: queue Celery task `send_whatsapp_alert(alert_id)` to the `alerts` queue
- Workers in the `alerts` queue process these concurrently, hitting Twilio API
- MEDIUM and LOW severity alerts appear in the dashboard but do not trigger WhatsApp

**Step 9.** Automation engine completes. Logs run summary: `{tenant_id, rules_evaluated: 43, alerts_created: N, alerts_resolved: M, tasks_created: K, duration_ms: X}` to `automation_run_log`.

**Step 10.** Five minutes later (6:05am Fiji, 18:05 UTC), Celery Beat fires `run_decision_engine`:
- Evaluates all 10 decision signals from live data for each tenant
- Signals include: crop health score, labor adequacy, financial trajectory, input availability, weather risk, pest/disease pressure, harvest timing, market price alignment, rotation compliance, cash flow health
- Writes signal scores as a snapshot to `decision_signals` table (never computed on-demand — always from latest snapshot)
- Redis cache `decision:signals:{farm_id}` invalidated and repopulated (TTL 300s)

---

## 6. Offline Sync Flow

The offline sync system ensures that field workers can continue logging operations even without internet connectivity — critical for remote locations like Farm F002 on Kadavu Island.

**Step 1.** PWA detects connectivity loss. `navigator.onLine` becomes `false`. Service Worker intercepts all outbound API calls and redirects them to the offline queue handler.

**Step 2.** Every new logging operation is written to IndexedDB store `pending_operations`:
```javascript
{
  id: crypto.randomUUID(),
  operation_type: 'harvest' | 'field_event' | 'labor' | 'cash' | 'weather',
  payload: { ...full request body },
  endpoint: '/api/v1/production-units/{pu_id}/harvests',
  method: 'POST',
  timestamp: '2026-04-07T06:30:00+12:00',
  status: 'pending',
  retry_count: 0,
  farm_id: 'f002-uuid',
  user_id: 'user-uuid'
}
```

**Step 3.** The PWA displays a persistent banner: "Offline — changes will sync when connected." Each pending operation shows a sync status badge in the UI:
- Orange badge: `pending` (queued, not yet synced)
- Green badge: `synced` (successfully processed)
- Red badge: `failed` (sync attempted, error received)

Workers can continue logging. Operations accumulate in IndexedDB.

**Step 4.** `navigator.onLine` becomes `true`. The Service Worker detects the connectivity change and fires a background sync event (`self.registration.sync.register('pending-operations')`).

**Step 5.** PWA reads all IndexedDB entries where `status = 'pending'`, sorted by `timestamp` ascending (oldest first).

**Step 6.** PWA constructs the batch payload and sends: `POST /api/v1/sync/batch`:
```json
{
  "operations": [
    {
      "client_id": "uuid-...",
      "operation_type": "harvest",
      "endpoint": "/api/v1/production-units/{pu_id}/harvests",
      "payload": { ... },
      "client_timestamp": "2026-04-07T06:30:00+12:00"
    },
    ...
  ]
}
```

**Step 7.** FastAPI `/sync/batch` handler validates JWT and queues a Celery task: `sync_offline_entries(sync_batch_id)`. Returns `202 Accepted` with `{sync_batch_id}`.

**Step 8.** Celery worker processes each operation in sequence:
- For each operation: validate the payload (same validation as the direct endpoint)
- **Deduplication check:** before inserting, check if a record with matching `(tenant_id, pu_id, timestamp, operation_type)` already exists — this handles the case where the worker sent the request, got a network error, and assumed it failed when it actually succeeded
- If duplicate found: mark operation as `duplicate`, skip insert
- If valid and not duplicate: execute the same business logic as the direct endpoint (chemical compliance check for harvests, trigger fires, etc.)

**Step 9.** Conflict resolution:
- Strategy: **last-write-wins per record** using `client_timestamp`
- If two offline entries modify the same record (e.g., two edits to the same field event), the entry with the later `client_timestamp` wins

**Step 10.** Celery task updates sync batch result in Redis (TTL 5 minutes): `{synced: [client_ids], failed: [{client_id, error}], duplicates: [client_ids]}`.

**Step 11.** PWA polls for sync result: `GET /api/v1/sync/batch/{sync_batch_id}/status`. When complete, updates IndexedDB entries:
- Synced: `status = 'synced'`
- Failed: `status = 'failed'`, stores `error_reason`
- Duplicates: `status = 'synced'` (the record exists, which is what matters)

**Step 12.** Failed entries are flagged in the UI with red badges and a human-readable error reason. The farm manager can review failed entries and either retry or dismiss them. Common failure reasons: chemical compliance violation caught during sync, invalid pu_id (PU may have been archived), cycle closed before sync completed.

---

## 7. Multi-Tenancy Architecture

### Shared Schema Table List

The following tables live in `shared.*` and contain no `tenant_id`. They are read-only during normal operation and updated only by Teivaka admin processes:

| Table | Description |
|-------|-------------|
| `shared.productions` | 49 supported crop types with metadata |
| `shared.production_stages` | Growth stages for each crop (e.g., Germination, Vegetative, Flowering, Fruiting, Harvest) |
| `shared.stage_protocols` | Recommended tasks and inputs per stage |
| `shared.production_thresholds` | Min/max thresholds for weather, soil, nutrient levels per crop |
| `shared.rotation_rules` | Rotation compatibility matrix between crop families |
| `shared.actionable_rules` | Automation rule templates (base rules that tenants can enable) |
| `shared.pest_library` | Pest catalog with identification, lifecycle, treatment recommendations |
| `shared.disease_library` | Disease catalog with symptoms, causes, management protocols |
| `shared.weed_library` | Weed catalog with identification and control methods |
| `shared.chemical_library` | Chemical catalog with withholding periods, application rates, safety data |
| `shared.kb_articles` | Validated Knowledge Base articles (RAG source for TIS Knowledge Broker) |
| `shared.kb_stage_links` | Links KB articles to specific production stages |
| `shared.family_policies` | Crop family rotation policies (hard constraints) |

### Tenant Schema Table List

All operational tables are in `tenant.*` with a `tenant_id` column and RLS enforcement:

**Farm Structure:** `farms`, `zones`, `production_units`

**Crop Lifecycle:** `production_cycles`, `nursery_batches`

**Field Operations:** `field_events`, `harvest_log`, `labor_attendance`, `weather_log`

**Financial:** `income_log`, `cash_ledger`, `cycle_financials`, `budgets`, `purchase_orders`, `order_line_items`

**Inventory:** `inputs`, `input_transactions`

**People & Assets:** `workers`, `equipment`, `customers`, `suppliers_tenant` (tenant-specific supplier overrides)

**Logistics:** `deliveries`, `delivery_line_items`

**Livestock & Apiary:** `livestock`, `livestock_events`, `hives`, `hive_inspections`, `honey_harvests`

**Intelligence:** `alerts`, `task_queue`, `automation_rules`, `decision_signals`

**TIS:** `tis_conversations`, `tis_voice_logs`, `ai_commands`, `ai_insights`

**Community:** `community_profiles`, `marketplace_listings`, `community_posts`, `post_reactions`

**Administration:** `tenant_subscriptions`, `sync_batches`, `automation_run_log`

### RLS in Practice

When a user from Farm F001 makes an API call, the following guarantee chain operates:

1. JWT decoded → `tenant_id = 'teivaka-f001-uuid'`
2. `SET LOCAL app.tenant_id = 'teivaka-f001-uuid'`
3. Application code queries `SELECT * FROM tenant.harvest_log WHERE pu_id = $1`
4. PostgreSQL RLS policy intercepts: appends `AND tenant_id = current_setting('app.tenant_id')::UUID`
5. Effective query: `SELECT * FROM tenant.harvest_log WHERE pu_id = $1 AND tenant_id = 'teivaka-f001-uuid'`
6. Even if application code omits the tenant filter entirely: returns only F001 data, or empty set

This means application-layer bugs cannot cause cross-tenant data leakage. The database itself is the last line of defense.

### New Tenant Onboarding Flow

1. **Create tenant record:** `INSERT INTO public.tenants (id, name, subscription_tier, status, contact_phone, timezone) VALUES (gen_random_uuid(), 'Farm Name', 'FREE', 'active', '+679XXXXXXXX', 'Pacific/Fiji')`

2. **Generate tenant UUID:** The `id` from step 1 becomes the `tenant_id` used in all subsequent records.

3. **Create admin user:** `INSERT INTO public.users (id, tenant_id, email, phone, role, password_hash) VALUES (...)` with `role = 'FOUNDER'`.

4. **Seed initial farm:** `INSERT INTO tenant.farms (tenant_id, farm_code, name, location, total_area_acres, ...)` — using Teivaka default structure.

5. **Apply RLS policies:** RLS policies are defined at the table level (not per-tenant) — they automatically apply to the new tenant's data because they reference `current_setting('app.tenant_id')`.

6. **Send welcome WhatsApp:** Celery task `send_whatsapp_alert` sends onboarding welcome message to admin's phone via Twilio.

7. **Enable automation rules:** Copy base rules from `shared.actionable_rules` into `tenant.automation_rules` for the new tenant with `status = 'Active'`.

---

## 8. TIS Request Flow (Full Detail)

The Teivaka Intelligence System processes every user message — whether text from the PWA chat or transcribed voice — through a consistent routing and response pipeline.

**Step 1.** User message arrives. Two entry points:
- Text: `POST /api/v1/tis/chat` with `{message: "...", conversation_id: optional, farm_id: "..."}`
- Voice: Via the voice command pipeline described in Section 4 (audio → Whisper → transcript → TIS router)

**Step 2.** TIS Router classifies the message:
- **Knowledge Broker triggers:** agronomic questions ("How do I treat powdery mildew on eggplant?", "What is the withholding period for Dithane?", "When should I top-dress my taro?")
- **Operational Interpreter triggers:** farm context questions ("Why is my CoKG high this cycle?", "Which PU is performing best?", "What does my decision engine say?")
- **Command Executor triggers:** action imperatives ("Log harvest PU3 40kg grade A", "Add 5 workers for tomorrow", "Record spray event PU1 Dithane 200g")

Classification uses a combination of:
- Keyword matching (fast, first pass)
- Intent classification via Claude API (second pass for ambiguous messages)
- Context from previous messages in the conversation thread

**Step 3a — Knowledge Broker Path:**
1. Extract the agronomic query from the message
2. Generate embedding for the query (using Claude API's embedding capability or a local embedding model)
3. Semantic search over `shared.kb_articles` embeddings → retrieve top 3 matching articles by cosine similarity
4. Check confidence score of top match. If `score < 0.75`: respond "I don't have specific guidance on this in the Knowledge Base — please consult your Teivaka agronomist."
5. If `score >= 0.75`: build Claude API prompt:
   ```
   System: You are an agricultural advisor for Teivaka farms in Fiji.
   Answer ONLY using the provided Knowledge Base content.
   Do not add information not present in the KB.

   KB Content:
   [Article 1 content]
   [Article 2 content]
   [Article 3 content]

   Farmer Question: [query]
   ```
6. Claude API call with `temperature: 0.2`, `model: claude-sonnet-4-20250514`
7. Response returned to user, constrained to KB content

**Step 3b — Operational Interpreter Path:**
1. Pull farm context snapshot from DB (and Redis cache):
   - Active production cycles with current stage
   - Recent alerts (last 7 days, CRITICAL and HIGH)
   - Latest decision engine signals
   - Current financial summary (CoKG, revenue, costs)
   - Labor schedule for coming week
2. Build Claude API prompt with full context:
   ```
   System: You are a farm advisor for [Farm Name] in Fiji.
   Explain the farm's current situation clearly and practically.

   Current Farm Status:
   [Active cycles, stages, days remaining]
   [Recent alerts]
   [Decision signals and scores]
   [Financial summary]

   Farmer Question: [question]
   ```
3. Claude API call with `temperature: 0.7`, `model: claude-sonnet-4-20250514`
4. Response explains farm situation in plain language

**Step 3c — Command Executor Path:**
1. Parse intent using regex patterns and entity extraction:
   - Command type identified (1 of 12: LOG_HARVEST, LOG_EVENT, LOG_LABOR, LOG_CASH, LOG_WEATHER, ADD_WORKER, CREATE_ORDER, SCHEDULE_TASK, LOG_SPRAY, LOG_NURSERY, LOG_DELIVERY, QUERY_STATUS)
   - Entities extracted: `pu_id`, `qty_kg`, `grade`, `worker_count`, `crop_name`, `chemical_name`, `amount`, etc.
   - PU references resolved: "PU three" → PU003 from tenant's farm context
2. Entity validation: confirm all required entities are present and valid; if missing, ask clarifying question
3. Internal API call: Command Executor calls the appropriate TFOS endpoint function directly (not via HTTP — direct function call within the same FastAPI process)
4. DB record created with all associated business logic (compliance checks, triggers, etc.)
5. Confirmation message assembled: natural language, Fijian-English, includes the generated record ID

**Step 4 — All Paths: Response Storage and Return:**
- Response stored in `tis_conversations` (conversation_id links messages to threads)
- Rate limit counter incremented in Redis
- Response returned to user

---

## 9. File Upload Flow

1. Field worker captures photo with mobile camera (via PWA `<input type="file" accept="image/*" capture="environment">` or drag-and-drop)
2. PWA compresses image client-side: max 1200px on longest dimension, JPEG quality 85, max 10MB output
3. PWA sends `POST /api/v1/uploads` with `Content-Type: multipart/form-data`:
   - `file`: compressed image
   - `context_type`: `field_event` | `harvest` | `pest_sighting` | `nursery` | `equipment`
   - `context_id`: the ID of the related record (event_id, harvest_id, etc.)
4. FastAPI validates:
   - MIME type must be in allowlist (`image/jpeg`, `image/png`, `image/webp`)
   - File size ≤ 10MB
   - File header bytes match declared MIME type (not just extension check)
5. Pillow library strips all EXIF metadata including GPS coordinates (privacy protection for farm location)
6. File uploaded to Supabase Storage: `farm-photos/{tenant_id}/{context_type}/{context_id}_{timestamp}.jpg`
7. Supabase returns public URL
8. URL stored in relevant DB column: `field_events.photo_url`, `harvest_log.photo_url`, etc.
9. Response: `{success: true, data: {photo_url: "https://...", file_size_bytes: N}}`

---

## 10. WhatsApp Alert Flow

Alerts generated by the Automation Engine and other system events are delivered to farmers via WhatsApp as the primary channel.

1. Alert record created in `tenant.alerts` (by Automation Engine, chemical compliance check, or direct API call)
2. If `severity IN ('CRITICAL', 'HIGH')`: Celery task `send_whatsapp_alert(alert_id)` queued immediately to `alerts` queue
3. Celery worker fetches alert details and the relevant farmer/manager phone number from `tenant.workers` (where `role IN ('FOUNDER', 'MANAGER')` for the affected farm)
4. Format WhatsApp message using pre-approved Twilio template. Example for CRITICAL alert:
   ```
   🚨 TEIVAKA ALERT — CRITICAL
   Farm: Save-A-Lot (F001)
   Alert: Chemical Withholding Violation
   PU002 — Harvest blocked. Dithane applied 3 days ago.
   Withholding period: 7 days. Safe date: 10 Apr 2026.

   Reply HELP for assistance.
   ```
5. Twilio API call: `POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json` with WhatsApp Business template
6. Delivery status logged in `alerts.whatsapp_status` (sent/delivered/read/failed)
7. Twilio delivery status webhook updates the log asynchronously
8. **SMS Fallback:** If WhatsApp delivery fails after 2 retry attempts (5-minute intervals): Celery task `send_sms_fallback(alert_id)` queued. SMS sent via Twilio SMS API to the same phone number. SMS format is condensed (160 char limit).

---

## 11. Community Platform Architecture

**Recommendation: Integrated into the same FastAPI backend, separate router group.**

The Community platform (`/api/v1/community/*`) is implemented as an additional router group within the same FastAPI application and PostgreSQL database, rather than as a separate microservice.

**Justification for integrated architecture:**

1. **Data joins with TFOS:** Community supply forecasts require joins with `tenant.harvest_log` (projected harvest quantities from active cycles). Community price index updates feed back into `tenant.price_master` for TFOS financial calculations. These joins are trivial with shared PostgreSQL but would require expensive API calls across service boundaries.

2. **Operational simplicity:** A single Docker Compose deployment on the Hetzner CAX21 VPS is the correct scale for the current phase. Adding a separate microservice adds operational overhead (separate deployment, separate monitoring, inter-service auth) without benefit at this scale.

3. **Logical separation via schema:** Community data lives in Domain 15 tables (prefixed `community_*`) within the `tenant.*` schema. The separation is logical and well-defined without requiring physical service separation.

4. **Future migration path:** If Community grows to require independent scaling in Phase 3, it can be extracted to a separate microservice without breaking API contracts — the `/api/v1/community/*` URL path maps cleanly to a separate service behind the Caddy reverse proxy by simply adding a new proxy route.

**Community data flow:**
- `GET /community/listings` → reads `community_listings` + joins `tenant.harvest_log` for supply availability
- `GET /community/price-index` → reads `community_price_index` + feeds into `tenant.price_master`
- `POST /community/posts` → writes to `community_posts` (Phase 2 only; Phase 1 returns 403 with `PHASE_1_READONLY`)

---

## 12. Deployment Overview

**Infrastructure:**
- Single server: Hetzner VPS CAX21 (4 ARM vCPUs, 8GB RAM, 80GB NVMe SSD)
- Location: Europe (Hetzner EU), accessed from Fiji over Pacific internet
- Operating System: Ubuntu 22.04 LTS

**Docker Compose Services:**
```
caddy          — Reverse proxy + HTTPS
fastapi        — FastAPI application (Uvicorn, 4 workers)
celery-worker  — Celery workers (4 concurrent, split across queues)
celery-beat    — Celery Beat scheduler
postgres       — PostgreSQL 16 + TimescaleDB
redis          — Redis 7.2
```

**Network topology:**
```
Internet → Caddy (443/80) → FastAPI (8000)
                          → WebSocket (8000/ws)
FastAPI  → PostgreSQL (5432)
         → Redis (6379)
         → Celery [via Redis]
Celery   → PostgreSQL (5432)
         → Supabase Storage API
         → Twilio API
         → Claude API
         → Whisper API
```

**Auth:**
- JWT tokens: signed with `HS256`, `python-jose` library, 15-minute access token expiry
- Refresh tokens: 7-day expiry, stored as httpOnly secure cookies
- Passwords: hashed with `bcrypt` via `passlib`, work factor 12
- Refresh token rotation: new refresh token issued on every `/auth/refresh` call, old token invalidated in Redis blacklist

---

*End of ARCHITECTURE.md*
