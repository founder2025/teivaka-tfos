# TFOS GODLIKE BUILD BLUEPRINT
## Teivaka Farm Operating System — Master Execution Plan
**Version:** 1.0 | **Authority:** Uraia Koroi Kama (Cody), Founder, Teivaka PTE LTD
**Company No.:** 2025RC001894 | **Last Updated:** April 2026

---

> **HOW TO USE THIS DOCUMENT**
> This is the sequenced execution order for building TFOS from zero to deployed production system. Each Phase has a clear objective, ordered task list, dependency chain, verification gate, and go/no-go criteria. Do not start Phase N+1 until Phase N passes its verification gate. Every task maps to a specific file in the resource pack. Nothing is vague.

---

## PHASE MAP OVERVIEW

```
PHASE 0: Environment & Infrastructure Setup        (Foundation — Day 1-2)
PHASE 1: Database Foundation                       (Schema + Seed — Day 2-5)
PHASE 2: Authentication & Multi-Tenancy            (Security Layer — Day 5-7)
PHASE 3: Farm Core API                             (TFOS Operations — Day 7-14)
PHASE 4: Automation Engine                         (43 Rules Live — Day 14-18)
PHASE 5: Decision Engine + Dashboard               (Intelligence Layer — Day 18-21)
PHASE 6: TIS — Grounded Intelligence               (AI Layer — Day 21-28)
PHASE 7: Voice Pipeline                            (WhatsApp + Whisper — Day 28-32)
PHASE 8: React PWA + Offline Sync                  (Frontend — Day 32-42)
PHASE 9: Production Hardening                      (Security + Performance — Day 42-46)
PHASE 10: MVP Acceptance Testing                   (Go/No-Go for F001 + F002 — Day 46-50)
```

---

## PHASE 0 — ENVIRONMENT & INFRASTRUCTURE SETUP
**Objective:** A running server with all services containerized, connected, and verified.
**Reference Files:** `04_environment/.env.example`, `08_deployment/DEPLOYMENT_GUIDE.md`
**Duration:** Day 1–2

### Tasks (in order)

**0.1 — Provision Hetzner CAX21**
- Create server in Hetzner Cloud Console: Ubuntu 24.04 LTS, ARM64, CAX21 (4 vCPU, 8GB RAM, 80GB SSD)
- Location: Nuremberg (nbg1)
- Enable IPv4 + IPv6
- Add SSH key at provisioning time
- Note the public IP
- Set hostname: `teivaka-prod-01`
- Create non-root user `teivaka`, add to sudo group

**0.2 — Install Docker + Docker Compose**
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker teivaka
sudo apt install docker-compose-plugin -y
docker --version  # Verify
docker compose version  # Verify
```

**0.3 — Create Docker Compose Stack**
Services to define: `db` (PostgreSQL 16 + TimescaleDB + pgvector), `redis` (Redis 7.2), `api` (FastAPI), `worker` (Celery), `beat` (Celery Beat), `frontend` (React Vite build served by Caddy), `caddy` (reverse proxy)

Critical volumes: `postgres_data`, `redis_data`, `caddy_data`
Network: single internal bridge network `teivaka_net`

**0.4 — Configure Caddy**
Create `Caddyfile`:
```
api.teivaka.com {
    reverse_proxy api:8000
}
app.teivaka.com {
    reverse_proxy frontend:3000
}
```
Caddy handles TLS automatically. Server timezone MUST remain UTC.

**0.5 — Create .env from .env.example**
Fill in all required values. At minimum for Phase 0:
- `DATABASE_URL`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `REDIS_URL`, `CELERY_BROKER_URL`
- `SECRET_KEY` (generate with `openssl rand -base64 64`)
- `ANTHROPIC_API_KEY` (claude-sonnet-4-20250514)
- `OPENAI_API_KEY` (Whisper API)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`
- `FIJI_INTELLIGENCE_PATH=09_knowledge_base/FIJI_FARM_INTELLIGENCE.md`

**0.6 — Install Python Environment**
```bash
python3.12 -m venv venv
pip install fastapi==0.115.0 sqlalchemy==2.0.36 asyncpg alembic \
  celery[redis]==5.4.0 pydantic pydantic-settings \
  anthropic openai twilio python-multipart \
  sentry-sdk passlib[bcrypt] python-jose[cryptography] \
  pgvector structlog --break-system-packages
```

**0.7 — Initialize Alembic**
```bash
alembic init alembic
```
Configure `alembic.ini` and `env.py` for async SQLAlchemy with schema awareness.

### Verification Gate — Phase 0

```bash
docker compose up -d
docker compose ps  # All services show 'Up'
docker compose exec db psql -U teivaka teivaka_db -c "SELECT version();"  # PostgreSQL 16+
docker compose exec db psql -U teivaka teivaka_db -c "SELECT extname FROM pg_extension;"  # Must show timescaledb, vector
docker compose exec redis redis-cli ping  # PONG
curl https://api.teivaka.com/health  # HTTP 200 {"status": "ok"}
```

**Go/No-Go:** All 5 verification commands pass. No service shows 'Exit'. TLS certificate issued by Caddy.

---

## PHASE 1 — DATABASE FOUNDATION
**Objective:** Complete schema deployed, seeded with F001/F002 farm data and 6 MVP crop protocols.
**Reference Files:** `02_database/schema/01_shared_schema.sql` through `05_functions.sql`, `02_database/seeds/`
**Duration:** Day 2–5

### Tasks (in order)

**1.1 — Deploy Shared Schema**
Execute in order:
1. `01_shared_schema.sql` — Creates `shared.*` schema: productions, kb_articles, chemical_library, rotation_rules, pest_disease_library, price_master, kb_article_candidates
2. Enable `pgvector` extension: `CREATE EXTENSION IF NOT EXISTS vector;`
3. Enable `timescaledb` extension: `SELECT create_hypertable('weather_logs', 'log_time');`

**1.2 — Deploy Tenant Schema**
Execute `02_tenant_schema.sql` — Creates `tenant.*` schema: farms, zones, production_units, production_cycles, field_events, harvest_log, labor_attendance, inputs, cash_ledger, task_queue, alerts, automation_rules, decision_signals, tis_conversations, tis_voice_logs

**1.3 — Deploy Auth Schema**
Execute `03_auth_schema.sql` — Creates `auth.*` schema: users, tenants, refresh_tokens

**1.4 — Deploy Functions**
Execute `05_functions.sql` — Includes:
- `check_harvest_compliance()` PostgreSQL trigger function (CRITICAL — chemical WHD enforcement)
- `validate_rotation()` function
- `set_tenant_context()` helper
- `harvest_compliance_check` trigger on `harvest_log` INSERT

**1.5 — Enable Row Level Security**
For every table in `tenant.*`:
```sql
ALTER TABLE tenant.{table_name} ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant.{table_name}
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```
Verify RLS is active: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'tenant';`

**1.6 — Create Alembic Baseline Migration**
```bash
alembic revision --autogenerate -m "initial_schema"
alembic upgrade head
```
This is migration `001_initial_schema.py`.

**1.7 — Seed: Create Teivaka Tenant**
Insert tenant record: `{tenant_id: uuid, tenant_name: "Teivaka PTE LTD", subscription_tier: "PREMIUM", company_no: "2025RC001894"}`

**1.8 — Seed: Create Cody User**
Insert user: `{email: "founder@teivaka.com", full_name: "Uraia Koroi Kama", role: "FOUNDER", tenant_id: <teivaka_uuid>}`
Hash password with bcrypt. Store hash only — never the plaintext.

**1.9 — Seed: F001 and F002 Farm Records**
```sql
INSERT INTO tenant.farms VALUES
  ('F001', <tenant_id>, 'Save-A-Lot Farm', 'Korovou, Serua Province', 83.0, 
   'iTaukei (NLTB)', NULL, NULL, true, 14, false, ...),  -- profit_share_rate_pct = NULL (open question)
  ('F002', <tenant_id>, 'Viyasiyasi Farm', 'Kadavu Island', NULL,
   'TBD', NULL, NULL, false, 14, true, ...);  -- has_ferry_dependency = true
```

**1.10 — Seed: 6 MVP Productions**
Seed `shared.productions` for MVP crops:
- `CRP-EGG` — Eggplant (Long Purple variety)
- `CRP-CAS` — Cassava (local variety)
- `CRP-KAV` — Kava (Yaqona)
- `FRT-PIN` — Pineapple (Mauritius)
- `LIV-GOA` — Goats
- `LIV-API` — Apiculture (4 hives)

Each production has stage protocols from `09_knowledge_base/KB_PROTOCOLS.md`.

**1.11 — Seed: Production Units (F001 + F002)**
```
F001: PU001 (cassava, Zone A), PU002 (eggplant), PU003 (eggplant), 
      PU004 (pineapple), PU006 (kava), PU007 (kava)
      Apiculture: HIV-F001-001 through HIV-F001-004
F002: LIV-F002-001 through LIV-F002-008 (8 goats)
```

**1.12 — Seed: Chemical Library (6 Fiji-Available Chemicals)**
```
Karate Zeon 5CS — lambda-cyhalothrin, WHD: 7 days, registered for eggplant
Dimethoate 400EC — dimethoate, WHD: 21 days, registered for eggplant
Vertimec 18EC — abamectin, WHD: 3 days, registered for eggplant
Confidor 200SL — imidacloprid, WHD: 14 days, registered for eggplant
Mancozeb 80WP — mancozeb, WHD: 7 days, fungicide
Ridomil Gold MZ 68WG — metalaxyl+mancozeb, WHD: 14 days, fungicide
```
Supplier: Pacific Agri Suva (SUP-001). Include FJD prices from FIJI_FARM_INTELLIGENCE.md.

**1.13 — Seed: 43 Automation Rules**
Insert all 43 `AutomationRule` records into `automation_rules` table.
Set `is_active = false` for RULE-024, RULE-025, RULE-026, RULE-027, RULE-028.
Set `is_active = true` for all others.

**1.14 — Seed: Price Master**
Insert current FJD market prices for 6 MVP crops. Reference FIJI_FARM_INTELLIGENCE.md for Q1 2026 prices.

**1.15 — Seed: Sea Master Shipping Supplier**
```sql
INSERT INTO shared.suppliers VALUES
  ('SUP-012', 'Sea Master Shipping', 'Suva Wharf', 
   '+679-XXX-XXXX', 'seamaster@fiji.com', 14, 'F002');
```
(Update contact from OPEN_QUESTIONS.md Q4 when answered)

### Verification Gate — Phase 1

```sql
-- Schema structure
SELECT schemaname, count(*) FROM pg_tables 
WHERE schemaname IN ('shared','tenant','auth') 
GROUP BY schemaname;
-- Must show: shared (15+ tables), tenant (25+ tables), auth (3 tables)

-- RLS enabled
SELECT count(*) FROM pg_tables 
WHERE schemaname = 'tenant' AND rowsecurity = false;
-- Must return: 0 (all tenant tables have RLS)

-- Chemical trigger active
SELECT trigger_name FROM information_schema.triggers 
WHERE event_object_table = 'harvest_log';
-- Must show: harvest_compliance_check

-- Automation rules
SELECT count(*), is_active FROM automation_rules GROUP BY is_active;
-- Must show: 38 true, 5 false

-- Automation rule mapping verification (v7.0 migration fix)
SELECT rule_id, trigger_category FROM automation_rules 
WHERE rule_id IN ('RULE-031','RULE-032','RULE-042','RULE-043');
-- RULE-031: delivery, RULE-032: incident, RULE-042: procurement, RULE-043: worker

-- Farm seed data
SELECT farm_id, farm_name, has_ferry_dependency FROM tenant.farms;
-- F001: false, F002: true
```

**Go/No-Go:** All verification queries return expected values. Both farm records exist. All 43 automation rules seeded with correct `is_active` values.

---

## PHASE 2 — AUTHENTICATION & MULTI-TENANCY
**Objective:** JWT auth working, RLS enforced in API, all endpoints protected.
**Reference Files:** `03_backend/TIS_SPECIFICATION.md` (auth section), `01_architecture/MULTI_TENANCY.md`
**Duration:** Day 5–7

### Tasks (in order)

**2.1 — FastAPI Application Bootstrap**
Project structure:
```
app/
  main.py              # FastAPI app instance, middleware, router registration
  config.py            # Pydantic Settings from .env
  database.py          # AsyncSession factory, get_db dependency
  models/              # SQLAlchemy models (one file per domain)
  schemas/             # Pydantic request/response schemas
  routers/             # FastAPI routers (one file per domain)
  services/            # Business logic (one file per service)
  workers/             # Celery tasks
  middleware/          # Auth, rate limit, tenant context
```

**2.2 — JWT Authentication**
Implement:
- `POST /api/v1/auth/login` → validates credentials, returns `{access_token, token_type, user}`
- `GET /api/v1/auth/me` → returns current user profile
- `POST /api/v1/auth/refresh` → refresh access token using HttpOnly cookie
- `POST /api/v1/auth/logout` → invalidate refresh token

JWT payload: `{sub: user_id, tenant_id, role, exp}`
Secret: `SECRET_KEY` from env. Algorithm: HS256. Expiry: 24 hours.
Never expose whether email exists on login failure.

**2.3 — Tenant Context Middleware**
```python
@app.middleware("http")
async def tenant_context_middleware(request: Request, call_next):
    token = extract_jwt(request.headers.get("Authorization"))
    if token:
        tenant_id = token.get("tenant_id")
        request.state.tenant_id = tenant_id
        # Set in DB session via get_db dependency
    response = await call_next(request)
    return response
```

**2.4 — Database Dependency with Tenant Context**
```python
async def get_db(request: Request) -> AsyncSession:
    async with AsyncSessionFactory() as session:
        if hasattr(request.state, 'tenant_id'):
            await session.execute(
                text(f"SET app.current_tenant_id = '{request.state.tenant_id}'")
            )
        yield session
```

**2.5 — Role-Based Access Control (RBAC)**
Create `require_role(*roles)` dependency:
```python
def require_role(*roles: str):
    def check(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(403, "Insufficient permissions")
        return current_user
    return check
```
Role hierarchy: FOUNDER > ADMIN > MANAGER > WORKER > COMMUNITY

**2.6 — Subscription Tier Middleware**
Create `require_tier(min_tier)` dependency:
```python
def require_tier(min_tier: str):
    def check(current_user: User = Depends(get_current_user), db = Depends(get_db)):
        tenant = get_tenant(current_user.tenant_id, db)
        if tier_rank(tenant.subscription_tier) < tier_rank(min_tier):
            raise HTTPException(403, {
                "error": "FEATURE_REQUIRES_UPGRADE",
                "current_tier": tenant.subscription_tier,
                "required_tier": min_tier
            })
        return current_user
    return check
```

**2.7 — Twilio Webhook Signature Verification**
```python
@app.middleware("http")
async def twilio_webhook_verification(request: Request, call_next):
    if request.url.path.startswith("/api/v1/webhooks/"):
        verify_twilio_signature(request)  # Raise 403 if invalid
    return await call_next(request)
```

**2.8 — Health Check Endpoint**
`GET /health` → `{"status": "ok", "db": "connected", "redis": "connected", "version": "1.0.0"}`
No auth required. Used by Caddy health checks.

### Verification Gate — Phase 2

```bash
# Login works
curl -X POST https://api.teivaka.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"founder@teivaka.com","password":"<password>"}' \
  | jq .access_token  # Non-null JWT

# Auth/me returns FOUNDER role
ACCESS_TOKEN=$(curl -s -X POST .../auth/login -d '...' | jq -r .access_token)
curl https://api.teivaka.com/api/v1/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  | jq .role  # "FOUNDER"

# Protected endpoint returns 401 without token
curl https://api.teivaka.com/api/v1/farms -I  # HTTP 401

# Invalid login returns 401 (no stack trace, no email enumeration)
curl -X POST .../auth/login -d '{"email":"wrong@test.com","password":"wrong"}' \
  | jq .detail  # "Incorrect email or password" (not "user not found")
```

**Go/No-Go:** All 4 curl tests pass. No stack traces exposed. JWT decodes with correct role.

---

## PHASE 3 — FARM CORE API
**Objective:** Full TFOS operational API live — all write operations, production cycle management, field events, harvest logging with compliance enforcement.
**Reference Files:** `03_backend/BUSINESS_LOGIC.md`, `06_api_reference/API_DESIGN.md`, `02_database/schema/05_functions.sql`
**Duration:** Day 7–14

### Tasks (in order)

**3.1 — Farm & Zone Endpoints**
```
GET  /api/v1/farms                           # List tenant's farms
GET  /api/v1/farms/{farm_id}                 # Farm detail + metadata
PATCH /api/v1/farms/{farm_id}                # Update farm config (FOUNDER only)
GET  /api/v1/farms/{farm_id}/zones           # List zones
POST /api/v1/farms/{farm_id}/zones           # Create zone
```

**3.2 — Production Unit Endpoints**
```
GET  /api/v1/farms/{farm_id}/production-units      # List all PUs
POST /api/v1/farms/{farm_id}/production-units      # Create PU
GET  /api/v1/production-units/{pu_id}              # PU detail + current cycle
PATCH /api/v1/production-units/{pu_id}             # Update PU (status, metadata)
```

**3.3 — Production Cycle Endpoints (with Rotation Gate)**
```
POST /api/v1/production-units/{pu_id}/cycles       # Create new cycle
  → MUST call validate_rotation() before INSERT
  → Return rotation_status in response
  → If BLOCK: return HTTP 409 with rotation explanation
  → If AVOID/COND: allow but flag prominently

GET  /api/v1/production-cycles/{cycle_id}          # Cycle detail
PATCH /api/v1/production-cycles/{cycle_id}         # Update stage, estimated dates
DELETE /api/v1/production-cycles/{cycle_id}        # Close cycle (MANAGER+)
```

**3.4 — Field Events Endpoint**
```
POST /api/v1/production-cycles/{cycle_id}/events   # Log field event
  → event_type: pest_scouting | chemical_application | fertilizer | irrigation | 
                weeding | pruning | observation | incident
  → For chemical_application: validate chemical_id exists in shared.chemical_library
  → For chemical_application: compute and store (application_date + whd_days) as safe_harvest_date

GET  /api/v1/production-cycles/{cycle_id}/events   # List events for cycle
```

**3.5 — Harvest Logging Endpoint (Chemical Compliance Enforcement)**
```
POST /api/v1/harvests                              # Log harvest
  → STEP 1: call check_chemical_compliance(pu_id, harvest_date, db)
  → If NOT compliant: return HTTP 409 {
      "error": "CHEMICAL_COMPLIANCE_VIOLATION",
      "chemical": blocking_chemical,
      "applied_date": application_date,
      "safe_harvest_date": safe_harvest_date,
      "days_remaining": days_remaining
    }
  → STEP 2: INSERT to harvest_log (DB trigger will re-check)
  → STEP 3: Compute CoKG and update cycle_financial_summary
  → If loss_qty_kg / total_qty_kg > 10%: trigger RULE-036 evaluation

GET  /api/v1/production-cycles/{cycle_id}/harvests # Harvest history
GET  /api/v1/harvests/{harvest_id}                 # Individual harvest detail
```

**3.6 — Labor & Attendance Endpoints**
```
POST /api/v1/farms/{farm_id}/attendance            # Log worker attendance
GET  /api/v1/farms/{farm_id}/attendance            # List attendance records
GET  /api/v1/workers                               # List workers for tenant
POST /api/v1/workers                               # Add worker
PATCH /api/v1/workers/{worker_id}                  # Update worker record
```
Seed W-001 Laisenia Waqa (PERMANENT, F001) and W-002 through W-009 (CASUAL).

**3.7 — Inventory Management Endpoints**
```
GET  /api/v1/farms/{farm_id}/inventory             # List all inputs
POST /api/v1/farms/{farm_id}/inventory             # Add new input
PATCH /api/v1/inventory/{input_id}                 # Update stock levels
POST /api/v1/inventory/{input_id}/receive          # Receive stock (add to current_stock)
POST /api/v1/inventory/{input_id}/use              # Log usage (deduct from current_stock)
```
For F002 inputs: store `lead_time_days` per input. Default 14. This feeds RULE-034.

**3.8 — Cash Ledger Endpoints**
```
POST /api/v1/farms/{farm_id}/cash/income           # Log income
POST /api/v1/farms/{farm_id}/cash/expense          # Log expense
GET  /api/v1/farms/{farm_id}/cash/balance          # Current balance (computed from ledger)
GET  /api/v1/farms/{farm_id}/cash/ledger           # Transaction history
GET  /api/v1/farms/{farm_id}/cash/cogk/{cycle_id}  # CoKG for a cycle
```
Balance MUST be computed from SUM(cash_ledger) — never from a cached field.

**3.9 — Alerts Endpoints**
```
GET  /api/v1/farms/{farm_id}/alerts                # List alerts (sorted: CRITICAL > HIGH > MEDIUM > LOW)
PATCH /api/v1/alerts/{alert_id}/resolve            # Manually resolve alert
PATCH /api/v1/alerts/{alert_id}/dismiss            # Dismiss alert (not available for CRITICAL)
```

**3.10 — Task Queue Endpoints**
```
GET  /api/v1/farms/{farm_id}/tasks                 # List tasks (filter by status, assignee)
PATCH /api/v1/tasks/{task_id}/complete             # Mark task complete
PATCH /api/v1/tasks/{task_id}/assign               # Assign task to worker
POST /api/v1/tasks                                 # Create manual task
```

**3.11 — Offline Batch Sync Endpoint**
```
POST /api/v1/sync/batch                            # Process queued offline operations
  → Body: [{operation, endpoint, payload, created_at, client_id}]
  → Process in created_at order
  → Each operation: attempt execution, capture result (success/failure/conflict)
  → Return: [{client_id, status: "success"|"rejected"|"conflict", detail}]
  → NEVER let one failure block the rest
```

**3.12 — CoKG Pre-Computation**
After every harvest INSERT: recompute `cycle_financial_summary` for the affected cycle:
```sql
UPDATE tenant.cycle_financial_summary SET
  total_harvest_kg = (SELECT SUM(quantity_kg) FROM harvest_log WHERE cycle_id = $1),
  total_labor_cost = (SELECT SUM(cost_fjd) FROM labor_attendance WHERE cycle_id = $1),
  total_input_cost = (SELECT SUM(total_cost_fjd) FROM input_usage WHERE cycle_id = $1),
  cogk = (total_labor_cost + total_input_cost + total_other_cost) / NULLIF(total_harvest_kg, 0),
  updated_at = NOW()
WHERE cycle_id = $1;
```

### Verification Gate — Phase 3

Test the chemical compliance enforcement specifically — this is the highest-risk feature:
```bash
# 1. Create a production cycle
# 2. Log a chemical application (Karate Zeon, WHD = 7 days) today
# 3. Attempt harvest in 3 days (within WHD)

curl -X POST /api/v1/harvests \
  -d '{"pu_id":"PU002","harvest_date":"<3 days from now>","quantity_kg":50}' \
  -H "Authorization: Bearer $TOKEN"
# MUST return HTTP 409 with CHEMICAL_COMPLIANCE_VIOLATION

# 4. Attempt harvest in 8 days (after WHD)
curl -X POST /api/v1/harvests \
  -d '{"pu_id":"PU002","harvest_date":"<8 days from now>","quantity_kg":50}' \
  -H "Authorization: Bearer $TOKEN"
# MUST return HTTP 201

# 5. Verify rotation gate blocks bad rotations
# Create a cycle with a BLOCK-status rotation sequence
# MUST return HTTP 409 with rotation explanation
```

Also verify: CoKG appears in FJD format after harvest is logged. Cash balance updates after every ledger INSERT.

**Go/No-Go:** Chemical compliance blocks harvest within WHD at both API and DB trigger levels. Rotation gate blocks prohibited sequences. CoKG computes correctly.

---

## PHASE 4 — AUTOMATION ENGINE
**Objective:** All 38 active automation rules evaluating, deduplicating, escalating, and delivering WhatsApp alerts.
**Reference Files:** `03_backend/AUTOMATION_ENGINE.md`, `09_knowledge_base/AUTOMATION_RULES_REFERENCE.md`
**Duration:** Day 14–18

### Tasks (in order)

**4.1 — AutomationRule Data Model**
Implement the `AutomationRule` dataclass exactly as specified in AUTOMATION_ENGINE.md Section 1. Every field is mandatory — no Optional fields except those explicitly marked Optional in the spec.

**4.2 — maybe_create_alert_and_task() Core Function**
```python
async def maybe_create_alert_and_task(
    rule: AutomationRule,
    context: dict,
    db: AsyncSession,
    force: bool = False  # Only True for RULE-021 mortality
) -> EvalResult:
    # 1. Deduplication check (skip if same rule+entity alert exists < 24h ago)
    if not force:
        existing = await get_recent_alert(rule.rule_id, context['entity_id'], db)
        if existing:
            return EvalResult(skipped=True, reason="deduplication")
    
    # 2. Create alert record
    alert = await create_alert(rule, context, db)
    
    # 3. Create task if rule specifies task_type
    if rule.task_type:
        task = await create_task(rule, context, alert.id, db)
    
    # 4. WhatsApp dispatch for CRITICAL and HIGH
    if rule.severity in ("Critical", "High"):
        await dispatch_whatsapp(alert, context)
    
    return EvalResult(alert_id=alert.id, task_id=task.id if task else None)
```

**4.3 — 27 Category Evaluators**
Implement each evaluator function as specified in AUTOMATION_ENGINE.md Section 3. Start with the highest-risk categories:

Priority order:
1. F002FerryBuffer (RULE-034) — operationally CRITICAL
2. ChemicalCompliance (RULE-038) — food safety CRITICAL
3. Livestock MortalityResponse (RULE-021) — life event CRITICAL
4. CashAlert (RULE-018) — financial CRITICAL
5. ProductionStageProtocol (RULE-001 to 011) — 11 rules, core operations
6. All remaining categories

**4.4 — RULE-034 Special Implementation**
```python
async def evaluate_f002_ferry_buffer(rule, tenant_id, db):
    # Confirm farm has has_ferry_dependency = True
    farm = await get_farm("F002", db)
    if not farm.has_ferry_dependency:
        return EvalResult(skipped=True)
    
    inputs = await get_f002_inputs(db)
    low_inputs = []
    
    for input_item in inputs:
        # Use per-input lead_time_days, fall back to F002_FERRY_BUFFER_DAYS env var
        lead_time = input_item.lead_time_days or settings.F002_FERRY_BUFFER_DAYS
        buffer_threshold = lead_time + 7
        stock_days = compute_stock_days_remaining(input_item, db)
        
        if stock_days < buffer_threshold:
            low_inputs.append({
                "input_name": input_item.input_name,
                "stock_days": stock_days,
                "lead_time_days": lead_time
            })
    
    if low_inputs:
        # Only fire for NEW items (deduplication logic)
        new_items = filter_new_threshold_crossings(low_inputs, rule.rule_id, db)
        if new_items:
            await maybe_create_alert_and_task(rule, {"items": new_items, "farm_id": "F002"}, db)
```

**4.5 — Auto-Resolution Pass**
```python
async def run_auto_resolution(tenant_id, db):
    open_alerts = await get_open_alerts(tenant_id, db)
    resolved_count = 0
    for alert in open_alerts:
        resolver = RESOLUTION_CHECKERS.get(alert.rule_id)
        if resolver and await resolver(alert, db):
            await resolve_alert(alert.id, db)
            resolved_count += 1
    return resolved_count
```

**4.6 — Escalation Pass**
```python
async def run_escalation_check(tenant_id, db):
    alerts_for_escalation = await get_alerts_pending_escalation(tenant_id, db)
    escalated_count = 0
    for alert in alerts_for_escalation:
        days_open = (datetime.utcnow() - alert.created_at).days
        if alert.severity == "Medium" and days_open >= 3:
            await escalate_alert(alert.id, "High", db)
            escalated_count += 1
        elif alert.severity == "High" and days_open >= 7:
            await escalate_alert(alert.id, "Critical", db)
            escalated_count += 1
    return escalated_count
```

**4.7 — Celery Beat Schedule**
```python
CELERY_BEAT_SCHEDULE = {
    "automation-engine-daily": {
        "task": "workers.automation_worker.run_automation_engine",
        "schedule": crontab(hour=18, minute=0),  # 6:00am Fiji = 18:00 UTC
    },
    "f002-ferry-buffer-weekly": {
        "task": "workers.automation_worker.run_rule_034",
        "schedule": crontab(hour=20, minute=0, day_of_week=1),  # Monday 20:00 UTC
    },
    "cashflow-forecast-weekly": {
        "task": "workers.automation_worker.run_rule_041",
        "schedule": crontab(hour=20, minute=0, day_of_week=5),  # Friday 20:00 UTC
    },
}
```

**4.8 — WhatsApp Dispatch**
```python
async def dispatch_whatsapp(alert: Alert, context: dict):
    message_body = render_whatsapp_template(alert.rule_id, context)
    recipient = get_recipient_number(alert.farm_id, alert.severity)
    
    client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    message = client.messages.create(
        from_=f"whatsapp:{settings.TWILIO_WHATSAPP_NUMBER}",
        to=f"whatsapp:{recipient}",
        body=message_body
    )
    
    await log_whatsapp_dispatch(alert.id, message.sid, db)
```

**4.9 — Completion Signal for Decision Engine**
After `run_automation_engine` completes: write a Redis key `automation_engine:last_completed:{tenant_id}` with timestamp. Decision Engine reads this key and waits if it's more than 5 minutes old.

### Verification Gate — Phase 4

```bash
# Manually trigger automation engine
celery -A app.workers.automation_worker call run_automation_engine --args='["<tenant_id>"]'

# Verify it ran
SELECT * FROM tenant.celery_task_log ORDER BY started_at DESC LIMIT 5;
# Most recent should show run_automation_engine with status 'SUCCESS'

# Verify rule counts
SELECT count(*) FROM tenant.alerts WHERE created_at > NOW() - INTERVAL '1 hour';
# Should show some alerts created (dependent on seeded data state)

# Force RULE-018 test
INSERT INTO tenant.cash_ledger (farm_id, tenant_id, direction, amount_fjd, description, transaction_date)
VALUES ('F001', '<tenant_id>', 'out', 9999999, 'TEST DRAIN', NOW());
# Wait for next engine run OR trigger manually
# Check: WhatsApp message received on Cody's number
# Check: alert created with severity 'High'
# Cleanup: DELETE the test ledger entry
```

**Go/No-Go:** Automation engine runs without errors. RULE-018 test produces WhatsApp message on Cody's phone. RULE-034 evaluator only runs for F002. Deduplication prevents duplicate alerts.

---

## PHASE 5 — DECISION ENGINE + DASHBOARD
**Objective:** 10 decision signals computed daily, dashboard returning in < 2 seconds, CoKG visible.
**Reference Files:** `03_backend/BUSINESS_LOGIC.md` (Decision Engine section), `06_api_reference/API_DESIGN.md`
**Duration:** Day 18–21

### Tasks (in order)

**5.1 — decision_signals Table**
Schema:
```sql
CREATE TABLE tenant.decision_signals (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    farm_id         VARCHAR(10),
    tenant_id       UUID,
    signal_name     VARCHAR(50),
    signal_value    FLOAT,
    signal_status   VARCHAR(10) CHECK (signal_status IN ('GREEN','AMBER','RED')),
    score           FLOAT CHECK (score BETWEEN 0 AND 10),
    trend           VARCHAR(12) CHECK (trend IN ('IMPROVING','STABLE','DECLINING')),
    computed_at     TIMESTAMPTZ DEFAULT NOW(),
    snapshot_date   DATE DEFAULT CURRENT_DATE
);
```

**5.2 — 10 Signal Computation Functions**
Implement one function per signal. All read from pre-existing operational data — never trigger further computations:

| Signal | Green Condition | Amber Condition | Red Condition |
|--------|----------------|-----------------|---------------|
| CoKG_Trend | CoKG decreasing YoY | Flat | Increasing |
| Harvest_Velocity | On-schedule per protocol | ≤10% behind | >10% behind |
| Input_Stock_Risk | All inputs above reorder | Some at reorder | Any at 0 |
| Cash_Runway | >90 days runway | 30–90 days | <30 days |
| Labor_Efficiency | Tasks completed on time | ≤20% overdue | >20% overdue |
| Pest_Pressure | No moderate/high scoutings | ≤2 recent | >2 recent |
| Compliance_Score | No open compliance alerts | 1–2 open | 3+ open |
| Rotation_Health | All PUs PREF/OK status | Some AVOID | Any BLOCK |
| Revenue_Per_PU | Above FJD target/PU | At target | Below target |
| Overall_Farm_Health | Average of all 9 scores ≥7 | 5–7 | <5 |

**5.3 — Decision Engine Celery Task**
```python
# Runs at 18:05 UTC (6:05am Fiji) — AFTER automation engine
@celery_app.task
async def run_decision_engine(tenant_id: str):
    # Wait for automation engine completion signal
    last_run = redis_client.get(f"automation_engine:last_completed:{tenant_id}")
    if not last_run or (datetime.utcnow() - last_run) > timedelta(minutes=10):
        # Automation engine hasn't run yet today — wait and retry
        raise self.retry(countdown=60, max_retries=5)
    
    farms = await get_tenant_farms(tenant_id, db)
    for farm in farms:
        for signal_fn in SIGNAL_FUNCTIONS:
            result = await signal_fn(farm.farm_id, db)
            await upsert_decision_signal(farm.farm_id, tenant_id, result, db)
    
    redis_client.set(f"decision_engine:last_completed:{tenant_id}", datetime.utcnow().isoformat())
```

**5.4 — Dashboard Endpoint**
```python
@router.get("/farms/{farm_id}/dashboard")
async def get_farm_dashboard(
    farm_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # ALL reads from pre-computed tables — no live computation
    signals = await get_latest_signals(farm_id, db)       # decision_signals
    alerts = await get_open_alerts_sorted(farm_id, db)     # alerts table, sorted by severity
    cycles = await get_active_cycles_with_cogk(farm_id, db) # cycle_financial_summary join

    return {
        "farm_id": farm_id,
        "signals": signals,          # 10 entries with status, score, trend
        "alerts": alerts,            # sorted CRITICAL > HIGH > MEDIUM > LOW
        "active_cycles": cycles,     # with CoKG in FJD X.XX/kg format
        "snapshot_date": signals[0].snapshot_date if signals else None,
        "generated_at": datetime.utcnow().isoformat()
    }
```

**5.5 — Morning Briefing Generation (6:10am)**
```python
@celery_app.task
async def generate_morning_briefing(tenant_id: str):
    # Reads from decision_signals and alerts — no computation
    farm_data = await compile_briefing_data(tenant_id, db)
    
    briefing = await claude_client.messages.create(
        model="claude-sonnet-4-20250514",
        system=MORNING_BRIEFING_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": json.dumps(farm_data)}]
    )
    
    await store_briefing_snapshot(tenant_id, briefing.content[0].text, db)
    await send_whatsapp(cody_number, briefing.content[0].text)
```

### Verification Gate — Phase 5

```bash
# Run Decision Engine manually
celery call run_decision_engine --args='["<tenant_id>"]'

# Check all 10 signals created
SELECT signal_name, signal_status, score FROM tenant.decision_signals
WHERE farm_id = 'F001' AND snapshot_date = CURRENT_DATE
ORDER BY signal_name;
# Must return 10 rows with status GREEN/AMBER/RED and score 0-10

# Dashboard response time
time curl -s https://api.teivaka.com/api/v1/farms/F001/dashboard \
  -H "Authorization: Bearer $TOKEN" | jq .signals | wc -l
# Response time < 2 seconds (time command output)
# signals count = 10

# CoKG format
curl .../dashboard | jq '.active_cycles[0].cogk'
# "FJD X.XX/kg" format
```

**Go/No-Go:** Dashboard returns in < 2 seconds. All 10 signals present. CoKG in correct format. Signals read from snapshot, not computed live.

---

## PHASE 6 — TIS GROUNDED INTELLIGENCE
**Objective:** Knowledge Broker answering Fiji-grounded questions, Operational Interpreter parsing 12 command types, Command Executor writing to TFOS API.
**Reference Files:** `03_backend/TIS_SPECIFICATION.md`, `03_backend/TIS_GROUNDED_INTELLIGENCE.md`, `09_knowledge_base/FIJI_FARM_INTELLIGENCE.md`
**Duration:** Day 21–28

### Tasks (in order)

**6.1 — Load Fiji Intelligence into Memory**
```python
# app/tis/fiji_intelligence.py
import os
from functools import lru_cache

@lru_cache(maxsize=1)
def load_fiji_intelligence() -> str:
    path = os.environ["FIJI_INTELLIGENCE_PATH"]
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

# Call at startup — crash if file not found
FIJI_INTELLIGENCE = load_fiji_intelligence()
```

**6.2 — KB Vector Store (pgvector RAG)**
```python
async def search_kb_articles(query_text: str, db: AsyncSession) -> list[KBArticle]:
    # Generate embedding
    embedding_response = await openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=query_text
    )
    query_embedding = embedding_response.data[0].embedding
    
    # Cosine similarity search
    results = await db.execute(
        text("""
            SELECT article_id, title, content, production_id,
                   1 - (embedding <=> :embedding) AS similarity
            FROM shared.kb_articles
            WHERE status = 'published'
            ORDER BY embedding <=> :embedding
            LIMIT 5
        """),
        {"embedding": query_embedding}
    )
    return results.fetchall()
```

**6.3 — Knowledge Layer Routing (Three-Layer Model)**
```python
async def determine_knowledge_layer(
    query_text: str,
    farm_id: str,
    db: AsyncSession
) -> tuple[str, list]:
    articles = await search_kb_articles(query_text, db)
    
    if articles and articles[0].similarity >= settings.VECTOR_SIMILARITY_THRESHOLD:
        return "VALIDATED_KB", articles[:3]
    else:
        # Log to kb_article_candidates
        await log_kb_candidate(query_text, farm_id, articles[0] if articles else None, db)
        return "FIJI_INTELLIGENCE", articles[:3]  # Pass near-misses as context
```

**6.4 — Knowledge Broker System Prompt Builder**
```python
def build_knowledge_broker_system_prompt(
    knowledge_layer: str,
    kb_articles: list,
    fiji_intelligence: str
) -> str:
    base = f"""You are TIS — the Teivaka Intelligence System.
You provide agronomic advice to farmers in Fiji.
You NEVER hallucinate protocols. You NEVER guess chemical rates or withholding periods.

The current farm is in Fiji. The farmer may use Fijian crop names:
- baigan = eggplant, tavioka = cassava, yaqona = kava, vaivai = pineapple

All prices are in FJD. All seasons refer to Fiji's wet season (Nov–Apr) and dry season (May–Oct).
"""

    if knowledge_layer == "VALIDATED_KB":
        articles_text = "\n\n".join([
            f"## {a.title}\n{a.content}" for a in kb_articles
        ])
        return base + f"\n\n## VALIDATED PROTOCOLS\n{articles_text}\n\nCite article names as 'According to our [ArticleName] protocol...'"
    
    else:  # FIJI_INTELLIGENCE
        return base + f"\n\n## FIJI AGRICULTURAL INTELLIGENCE\n{fiji_intelligence}\n\nRespond as 'Based on Fiji agricultural practice...'"
```

**6.5 — TIS Knowledge Broker Endpoint**
```python
@router.post("/api/v1/tis/query")
async def tis_query(
    request: TISQueryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # 1. Rate limit check
    await check_tis_rate_limit(current_user, db)
    
    # 2. Determine knowledge layer
    knowledge_layer, articles = await determine_knowledge_layer(
        request.query, request.farm_id, db
    )
    
    # 3. Build system prompt
    system_prompt = build_knowledge_broker_system_prompt(
        knowledge_layer, articles, FIJI_INTELLIGENCE
    )
    
    # 4. Call Claude API
    response = await anthropic_client.messages.create(
        model="claude-sonnet-4-20250514",
        system=system_prompt,
        messages=[{"role": "user", "content": request.query}],
        max_tokens=1024
    )
    
    # 5. Return with layer metadata
    return TISResponse(
        answer=response.content[0].text,
        knowledge_layer=knowledge_layer,
        sources=[a.title for a in articles] if knowledge_layer == "VALIDATED_KB" else [],
        farm_id=request.farm_id
    )
```

**6.6 — Operational Interpreter**
Parse natural language into one of 12 command types. Use Claude with structured output:
```python
OPERATIONAL_INTERPRETER_PROMPT = """
You are the TFOS Operational Interpreter.
Parse the farmer's message into a structured TFOS command.
Return ONLY valid JSON with no other text.

Valid command types: LOG_HARVEST, LOG_FIELD_EVENT, LOG_ATTENDANCE, CREATE_CYCLE,
CHECK_CHEMICAL, GET_STATUS, REPORT_INCIDENT, UPDATE_INVENTORY, LOG_EXPENSE,
LOG_INCOME, REQUEST_ROTATION_CHECK, LOG_PEST_SCOUTING

Return format:
{
  "command_type": "LOG_HARVEST",
  "confidence": 0.95,
  "entities": {
    "pu_id": "PU002",
    "quantity_kg": 45,
    "crop_name": "eggplant",
    "harvest_date": "2026-04-12"
  },
  "ambiguities": []  // list any unclear elements
}

If confidence < 0.7 or you cannot determine the command type: return UNKNOWN.
"""
```

**6.7 — Command Executor**
Map parsed commands to TFOS API calls. Implement a `CommandExecutor` class with one method per command type. Each method:
1. Validates required entities are present
2. Calls the appropriate TFOS API endpoint (internally, not via HTTP)
3. Returns a confirmation message in natural language (Fijian-English mixed OK)

Example:
```python
async def execute_log_harvest(self, entities: dict) -> CommandResult:
    # Validate entities
    required = ["pu_id", "quantity_kg"]
    if missing := [r for r in required if r not in entities]:
        return CommandResult(
            success=False,
            message=f"I need: {', '.join(missing)} to log a harvest. Please provide these details."
        )
    
    # Call harvest service directly (internal call)
    result = await harvest_service.create_harvest(
        pu_id=entities["pu_id"],
        quantity_kg=entities["quantity_kg"],
        harvest_date=entities.get("harvest_date", date.today()),
        tenant_id=self.tenant_id,
        db=self.db
    )
    
    if result.compliance_violation:
        return CommandResult(
            success=False,
            message=f"Oilei! Cannot harvest yet. {result.blocking_chemical} was applied on {result.application_date}. Safe to harvest after {result.safe_harvest_date}. Vinaka!"
        )
    
    return CommandResult(
        success=True,
        message=f"Sa rawa! ✓ Logged {entities['quantity_kg']}kg harvest from {entities['pu_id']}. CoKG updated. Vinaka!"
    )
```

**6.8 — KB Candidates Monitoring Endpoint**
```python
@router.get("/api/v1/knowledge/candidates")  # FOUNDER/ADMIN only
async def get_kb_candidates():
    # Return kb_article_candidates sorted by query_count DESC
    # This is the KB team's priority queue for new articles
```

### Verification Gate — Phase 6

Run the Experienced Fiji Farmer Test manually:
```
Query 1: "What do I spray for fruit borer on my eggplant?"
→ Must mention: Karate Zeon or Dimethoate
→ Must include FJD price or reference Pacific Agri
→ Must NOT say "pyrethrin" generically without local context
→ knowledge_layer must be populated in response

Query 2: "My kava leaves are yellowing. What is wrong?"
→ Must mention kava dieback disease
→ Must reference Fiji growing conditions
→ Must suggest local response actions

Query 3: "I harvested 50 kilos of baigan from PU003"
→ Command type: LOG_HARVEST
→ Entities: {pu_id: "PU003", quantity_kg: 50, crop_name: "eggplant"}
→ Confirmation message in Fijian-English (Sa rawa! etc.)
→ Harvest logged to database

Query 4: Voice note test (after Phase 7) — not applicable here
```

**Go/No-Go:** All 3 queries produce Fiji-grounded responses. LOG_HARVEST command writes to database. Chemical compliance check fires during harvest command if WHD not met.

---

## PHASE 7 — VOICE PIPELINE
**Objective:** WhatsApp voice messages transcribed and processed end-to-end in < 5 seconds.
**Reference Files:** `03_backend/TIS_SPECIFICATION.md` (voice section), `11_application_code/app/routers/`
**Duration:** Day 28–32

### Tasks (in order)

**7.1 — Twilio WhatsApp Webhook**
```python
@router.post("/api/v1/webhooks/whatsapp")
async def whatsapp_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    # Verify Twilio signature
    twilio_signature = request.headers.get("X-Twilio-Signature")
    verify_twilio_signature(twilio_signature, request.url, await request.form())
    
    form_data = await request.form()
    from_number = form_data.get("From")
    message_type = form_data.get("MediaContentType0", "text/plain")
    
    if "audio" in message_type:
        # Voice message
        audio_url = form_data.get("MediaUrl0")
        await process_voice_message(from_number, audio_url, db)
    else:
        # Text message
        message_body = form_data.get("Body", "")
        await process_text_message(from_number, message_body, db)
    
    return Response(content="<?xml version='1.0' encoding='UTF-8'?><Response></Response>",
                   media_type="text/xml")
```

**7.2 — Whisper Transcription**
```python
async def transcribe_voice_message(audio_url: str) -> TranscriptionResult:
    # Download audio from Twilio (requires auth)
    audio_data = await download_twilio_media(audio_url)
    
    # Send to Whisper
    transcript = await openai_client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_data,
        language="en",  # Whisper handles Fijian-accented English well
        response_format="verbose_json"  # Includes confidence scores
    )
    
    return TranscriptionResult(
        text=transcript.text,
        confidence=transcript.segments[0].avg_logprob if transcript.segments else 0.0,
        language=transcript.language,
        duration_seconds=transcript.duration
    )
```

**7.3 — Low-Confidence Confirmation Flow**
If confidence < 0.7:
```python
await send_whatsapp(
    from_number,
    f"I heard: '{transcription.text}'\n\nIs that correct? Reply YES to confirm or send your message again."
)
# Store pending confirmation in Redis with 5-minute TTL
redis_client.setex(f"pending_confirmation:{from_number}", 300, transcription.text)
```

**7.4 — End-to-End Voice Pipeline**
```python
async def process_voice_message(from_number: str, audio_url: str, db: AsyncSession):
    start_time = time.time()
    
    # 1. Identify user from phone number
    user = await get_user_by_phone(from_number, db)
    if not user:
        await send_whatsapp(from_number, "Your number is not registered in TFOS. Contact your farm manager.")
        return
    
    # 2. Transcribe (target: < 1 second)
    transcription = await transcribe_voice_message(audio_url)
    
    # 3. Low-confidence check
    if transcription.confidence < 0.7:
        await handle_low_confidence_transcription(from_number, transcription)
        return
    
    # 4. Parse command (TIS Operational Interpreter)
    command = await tis_interpret(transcription.text, user, db)
    
    # 5. Execute command (TIS Command Executor)
    result = await tis_execute(command, user, db)
    
    # 6. Send confirmation
    await send_whatsapp(from_number, result.message)
    
    # 7. Log voice interaction
    processing_ms = int((time.time() - start_time) * 1000)
    await log_voice_interaction(user.user_id, transcription, command, result, processing_ms, db)
    
    # Performance check
    if processing_ms > 5000:
        logger.warning("voice_pipeline_slow", processing_ms=processing_ms, user_id=user.user_id)
```

**7.5 — Outbound Alert Dispatch via WhatsApp**
Already partially implemented in Phase 4. Ensure:
- CRITICAL alerts dispatch immediately (no queue delay)
- HIGH alerts dispatch within 1 minute
- MEDIUM alerts dispatch in daily batch (end of day)
- LOW alerts dispatch weekly or on-demand only

### Verification Gate — Phase 7

```bash
# Send a test WhatsApp voice message to the Twilio number
# Message: "I harvested 30 kilos of eggplant from PU002"
# Expected within 5 seconds:
# - WhatsApp confirmation: "Sa rawa! ✓ Logged 30kg harvest from PU002..."
# - harvest_log record created in database
# - CoKG updated in cycle_financial_summary

# Verify pipeline timing
SELECT processing_ms FROM tenant.tis_voice_logs ORDER BY created_at DESC LIMIT 1;
# Must be < 5000ms

# Test chemical compliance via voice
# Send: "I harvested 50 kilos from PU002" (while PU002 is in WHD)
# Expected: "Oilei! Cannot harvest yet. [Chemical] WHD not met..."
# Verify: NO harvest_log record created
```

**Go/No-Go:** Voice-to-harvest pipeline completes in < 5 seconds. Chemical compliance fires correctly via voice command. Low-confidence flow asks for confirmation before executing.

---

## PHASE 8 — REACT PWA + OFFLINE SYNC
**Objective:** Mobile-first PWA installable on Android, offline-capable, all MVP features accessible.
**Reference Files:** `01_architecture/OFFLINE_SYNC.md`, `10_handoff/MVP_CHECKLIST.md`
**Duration:** Day 32–42

### Tasks (in order)

**8.1 — Vite + React 18 Project Setup**
```bash
npm create vite@latest teivaka-pwa -- --template react
cd teivaka-pwa
npm install react-query zustand workbox-window axios tailwindcss
npm install -D vite-plugin-pwa
```

PWA manifest: name "TFOS", short_name "Teivaka", theme_color "#2D6A4F" (deep green), background_color "#FFFFFF", display "standalone"

**8.2 — Service Worker (Workbox)**
Cache strategies:
- Static assets: CacheFirst, 1-year TTL
- API GET requests: NetworkFirst, 5-minute TTL, fallback to cache
- `/api/v1/sync/batch`: NetworkOnly (offline writes queue to IndexedDB)

**8.3 — IndexedDB Offline Queue**
```javascript
const PENDING_OPS_STORE = "pendingOperations";

async function queueOperation(operation) {
    const db = await openDB("tfos_offline", 1, {
        upgrade(db) {
            db.createObjectStore(PENDING_OPS_STORE, { keyPath: "id" });
        }
    });
    await db.add(PENDING_OPS_STORE, {
        id: crypto.randomUUID(),
        operation: operation.method,
        endpoint: operation.endpoint,
        payload: operation.data,
        created_at: new Date().toISOString(),
        status: "pending",
        retry_count: 0
    });
}
```

**8.4 — Background Sync on Reconnection**
```javascript
self.addEventListener("sync", async (event) => {
    if (event.tag === "sync-pending-ops") {
        event.waitUntil(syncPendingOperations());
    }
});

async function syncPendingOperations() {
    const pending = await getAllPendingOps();
    if (pending.length === 0) return;
    
    const response = await fetch("/api/v1/sync/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operations: pending })
    });
    
    const result = await response.json();
    
    for (const opResult of result.results) {
        if (opResult.status === "success") {
            await markOpComplete(opResult.client_id);
        } else if (opResult.status === "rejected") {
            await showSyncConflictNotification(opResult);
        }
    }
}
```

**8.5 — Dashboard Screen**
Components:
- `SignalGrid` — 10 signals with GREEN/AMBER/RED indicators, score, trend arrow
- `AlertList` — sorted alerts, severity badges, dismiss/resolve buttons
- `CycleList` — active cycles with CoKG prominent, stage indicator, days remaining
- `QuickActions` — 4 buttons: Log Harvest, Log Event, Ask TIS, View Tasks

All data fetched from `GET /api/v1/farms/{farm_id}/dashboard` with React Query (5-minute stale time).

**8.6 — TIS Chat Interface**
- Chat bubble UI
- Voice record button (Web Audio API, max 60 seconds)
- Voice uploads as `multipart/form-data` to `POST /api/v1/tis/voice`
- Text input also available
- Shows `knowledge_layer` badge on responses (Layer 1 = verified badge, Layer 2 = Fiji intelligence badge)
- Displays "CoKG updated" indicator after LOG_HARVEST commands

**8.7 — Harvest Logging Form**
- PU selector (dropdown from active cycles)
- Quantity input (kg)
- Grade selector (A/B/C/Reject)
- Date picker (defaults to today)
- Destination selector (Nayans/Market/Self/Other)
- Loss quantity input (auto-computes loss percentage, shows warning if > 10%)
- Submit triggers compliance check in real-time before form submission

**8.8 — MVP Screens (Required for Acceptance)**
1. Login / Auth screen
2. Farm Dashboard (10 signals + alerts + cycles)
3. Production Unit detail + event log
4. Log harvest form
5. Log field event form
6. TIS chat interface (text + voice)
7. Inventory list + reorder alerts
8. Task list + mark complete
9. Cash ledger + balance
10. Settings (farm profile, WhatsApp number, notification preferences)

**8.9 — Mobile Responsiveness**
All screens must be fully functional at 375px viewport (iPhone SE) without horizontal scrolling. Test at: 375px, 414px, 768px breakpoints.

### Verification Gate — Phase 8

Run against Cody's phone (real device test):
```
✓ Login works on mobile browser
✓ Dashboard loads in < 4 seconds on simulated 3G
✓ All 10 signals visible without scrolling on 375px
✓ CoKG shows in FJD format, larger font than other metrics
✓ Log Harvest form works with chemical compliance inline warning
✓ TIS voice recording works (hold to record, release to send)
✓ Received TIS response in < 5 seconds
✓ Turn off WiFi → try to log harvest → goes to IndexedDB queue
✓ Turn WiFi back on → harvest syncs to server automatically
✓ Push notification received for CRITICAL alert
```

**Go/No-Go:** Cody can complete a full day's farm operations from his phone: log harvest, ask TIS a question, view tasks, check cash balance. Offline mode stores operations and syncs on reconnection.

---

## PHASE 9 — PRODUCTION HARDENING
**Objective:** Security audit, performance optimization, monitoring active, backup strategy in place.
**Reference Files:** `08_deployment/DEPLOYMENT_GUIDE.md`, `08_deployment/SCALING_PLAN.md`
**Duration:** Day 42–46

### Tasks (in order)

**9.1 — Security Hardening**
```bash
# UFW firewall: only ports 22, 80, 443
ufw default deny incoming
ufw allow ssh
ufw allow 'Nginx Full'
ufw enable

# Fail2ban for SSH brute-force protection
apt install fail2ban -y

# Postgres: disable remote access (only localhost + Docker network)
# In postgresql.conf: listen_addresses = 'localhost'

# Rotate all secrets from .env.example defaults
# Regenerate SECRET_KEY, POSTGRES_PASSWORD, Redis auth password
```

**9.2 — API Rate Limiting**
Apply to all endpoints:
```python
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)

@router.post("/api/v1/tis/query")
@limiter.limit("20/minute")  # TIS has its own tier-based limit; this is the hard ceiling
async def tis_query(...):
```

**9.3 — Sentry Integration**
```python
sentry_sdk.init(
    dsn=settings.SENTRY_DSN,
    traces_sample_rate=0.1,  # 10% of transactions
    profiles_sample_rate=0.1,
    environment="production"
)
```

All unhandled exceptions logged to Sentry. RULE-021 (animal mortality) explicitly logs `sentry_sdk.capture_message("Animal mortality event", level="warning")`.

**9.4 — PostgreSQL Backup Strategy**
Daily automated pg_dump at 02:00 UTC (4am Fiji):
```bash
# /etc/cron.d/postgres-backup
0 2 * * * teivaka pg_dump -U teivaka teivaka_db | gzip > /backups/teivaka_$(date +\%Y\%m\%d).sql.gz
# Retain 30 days of backups
find /backups -name "*.sql.gz" -mtime +30 -delete
```

**9.5 — Structlog for Structured Logging**
All application logs in JSON format:
```python
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
    ]
)
logger = structlog.get_logger()

# Usage
logger.info("harvest_logged", pu_id="PU002", quantity_kg=45, tenant_id=tenant_id)
```

**9.6 — Performance Benchmarks**
```bash
# Dashboard endpoint
ab -n 100 -c 10 -H "Authorization: Bearer $TOKEN" \
  https://api.teivaka.com/api/v1/farms/F001/dashboard
# p95 response time must be < 2000ms

# TIS query endpoint
ab -n 50 -c 5 -p tis_query.json -T application/json \
  -H "Authorization: Bearer $TOKEN" \
  https://api.teivaka.com/api/v1/tis/query
# p95 response time must be < 8000ms (includes Claude API call)
```

**9.7 — pgvector Index Optimization**
```sql
-- Ensure ivfflat index is correctly configured
SELECT indexname, indexdef FROM pg_indexes 
WHERE tablename = 'kb_articles';
-- Must show ivfflat index with vector_cosine_ops

-- Analyze and vacuum after seeding
ANALYZE shared.kb_articles;
VACUUM ANALYZE shared.kb_articles;
```

**9.8 — TimescaleDB Retention Policy**
```sql
-- weather_logs: retain 2 years
SELECT add_retention_policy('weather_logs', INTERVAL '2 years');

-- tis_voice_logs: retain 1 year
SELECT add_retention_policy('tis_voice_logs', INTERVAL '1 year');
```

### Verification Gate — Phase 9

```bash
# Security
nmap -p- teivaka.com  # Only ports 22, 80, 443 open

# Backups exist
ls -la /backups/  # Today's backup file present

# Sentry receiving events
# Trigger a test exception → verify it appears in Sentry dashboard

# Performance
# Run Apache Bench on dashboard endpoint → p95 < 2 seconds
# Run load test on TIS endpoint → p95 < 8 seconds

# Logs are structured JSON
docker compose logs api | head -20 | python3 -c "import sys,json; [json.loads(l) for l in sys.stdin]"
# Must not throw parse errors (all lines are valid JSON)
```

**Go/No-Go:** No exposed ports except 22/80/443. Backups running. Sentry active. Performance benchmarks pass.

---

## PHASE 10 — MVP ACCEPTANCE TESTING
**Objective:** Cody tests all 10 MVP features on his phone against production server. Every acceptance criterion in `MVP_CHECKLIST.md` passes.
**Reference Files:** `10_handoff/MVP_CHECKLIST.md`
**Duration:** Day 46–50

### The 10 MVP Features (All Must Pass)

| # | Feature | Critical Test |
|---|---------|--------------|
| 1 | Login from mobile browser | JWT with FOUNDER role in < 4s on 3G |
| 2 | Dashboard with 10 signals + CoKG | All 10 signals, < 2 second response |
| 3 | Log harvest with compliance enforcement | Blocked during WHD, allowed after |
| 4 | Log field event via text | Parsed correctly, written to DB |
| 5 | Voice command → harvest logged | End-to-end in < 5 seconds |
| 6 | TIS agronomy question (Fiji-grounded) | Passes Experienced Fiji Farmer Test |
| 7 | Inventory reorder alert | WhatsApp received when stock below threshold |
| 8 | TIS Grounded Intelligence | Layer routing correct, kb_candidates logged |
| 9 | Offline mode → sync | Queue → reconnect → successful sync |
| 10 | F002 ferry buffer alert | CRITICAL WhatsApp when supply < buffer |

### Acceptance Testing Protocol

For each MVP feature:
1. Read the User Story — execute it as Cody (real phone, real farm data)
2. Check every Acceptance Criterion in the checklist against actual observed behavior
3. Mark each criterion PASS or FAIL
4. Any FAIL = feature fails, must be fixed and re-tested
5. MVP complete only when ALL criteria across ALL 10 features show PASS

### Post-MVP Handoff Checklist

Before declaring MVP live:
```
□ All 10 open questions answered or defaults confirmed with Cody
□ Profit share rate entered (or module disabled with Cody's sign-off)
□ F002 coordinator WhatsApp number registered (or Cody's number confirmed as default)
□ Sea Master ferry schedule confirmed and entered in SUP-012 record
□ Nayans buyer contact record populated
□ Chemical WHD enforcement tested with real chemicals from Pacific Agri
□ RULE-034 ferry buffer tested with F002 supply data
□ Morning briefing confirmed received by Cody at 6:12am Fiji time
□ Celery Beat schedule confirmed running (all 5 scheduled tasks)
□ PostgreSQL backup confirmed running (manual test of restore)
□ Sentry error tracking confirmed with Cody's email on alert list
□ DNS pointed to production server (api.teivaka.com, app.teivaka.com)
```

**Go/No-Go for MVP Launch:** All 10 MVP features pass all acceptance criteria. All post-MVP checklist items checked. Cody has used the system for a full real farming day and confirmed it works for F001 and F002.

---

## BUILD EXECUTION RULES

### Before Starting Any Phase

1. Confirm the previous phase's Verification Gate passed completely
2. Pull the latest resource pack files (they may have been updated)
3. Re-read the relevant sections of `TFOS_MASTER_BUILD_INSTRUCTION.md`
4. Resolve any OPEN_QUESTIONS that affect the phase before writing code

### While Building Each Phase

- Run the verification queries regularly — not just at phase end
- When you write a service function: also write its pytest test immediately
- Chemical compliance code: test both the API layer and DB trigger independently
- Any CRITICAL rule implementation: have a second pair of eyes review before deploying

### Never Ship Without Testing

- `pytest -x` must pass before any `git push`
- `pytest tests/test_automation_engine.py` specifically after any automation change
- `pytest tests/test_compliance.py` specifically after any harvest or chemical change
- Load test the dashboard endpoint after any Decision Engine change

### The Migration Verification Block

Run this block after EVERY database migration:
```sql
SELECT rule_id, trigger_category, trigger_table, is_active
FROM automation_rules WHERE rule_id IN ('RULE-031','RULE-032','RULE-042','RULE-043');
-- Confirm all 4 rows have correct column mappings
-- This check exists because v7.0 had silent column mapping errors
-- Silent errors in automation rules = undetected failures in production
```

---

## BUILD STATUS TRACKER

| Phase | Status | Start Date | End Date | Verified By |
|-------|--------|------------|----------|-------------|
| 0: Infrastructure | ☐ Not Started | | | |
| 1: Database Foundation | ☐ Not Started | | | |
| 2: Authentication | ☐ Not Started | | | |
| 3: Farm Core API | ☐ Not Started | | | |
| 4: Automation Engine | ☐ Not Started | | | |
| 5: Decision Engine + Dashboard | ☐ Not Started | | | |
| 6: TIS Grounded Intelligence | ☐ Not Started | | | |
| 7: Voice Pipeline | ☐ Not Started | | | |
| 8: React PWA + Offline | ☐ Not Started | | | |
| 9: Production Hardening | ☐ Not Started | | | |
| 10: MVP Acceptance | ☐ Not Started | | | |

Update this table as phases complete. Mark with:
- ☐ Not Started
- 🔄 In Progress
- ✅ Verified
- ❌ Failed — needs fix

---

**TFOS MVP TARGET: Day 50 from Phase 0 start.**
**The farm is waiting. Execute.**
