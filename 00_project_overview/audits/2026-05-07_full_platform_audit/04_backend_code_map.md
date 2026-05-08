# Phase 4 — Backend Code Map

**Audit date:** 2026-05-07
**Recon executed:** 2026-05-08 05:49 UTC
**Scope:** `/opt/teivaka/11_application_code/app/` + `openclaw/` + `alembic/`
**Total Python files:** 113 in `app/` (≠ 210 from Phase 1.5 which counts whole tree incl tests/migrations)
**Recon script:** `/tmp/phase4_recon.sh` (24 sections)

---

## Executive summary

The FastAPI surface is large and mature: **51 routers, ~165 endpoints, 49 ORM model classes, 48 Pydantic schemas, 6 Celery workers (12 tasks), 8 beat-schedule entries, 9 service modules, 5 utils, 3 middleware**. The polymorphic events architecture (Sprint 6 Phase 6.2-1) is the spine — `events_registry.py` (32 Pydantic classes, 31 KB, 9 sibling .bak files) routes 30+ event types through a single dispatcher. Audit emission is centralized in `app/core/audit_chain.py:emit_audit_event()` and used by 6 routers consistently.

**Three architectural smells worth flagging now:**

1. **Tier enum drift across 6 vocabularies in code.** `subscriptions.py` defines FREE/BASIC/PROFESSIONAL; `automation_rules.py` requires PREMIUM/CUSTOM; `community.py` allows BASIC/PROFESSIONAL/**ENTERPRISE**; `ai_worker.py` filters by PREMIUM/CUSTOM; `decision_engine_worker.py` by PREMIUM/CUSTOM/BASIC; `webhooks.py` sets FREE on Stripe cancel. The DB has only BASIC + PROFESSIONAL (Phase 3.24). The brief specifies FREE/BASIC FJD-49/PREMIUM FJD-149/CUSTOM. **No single source of truth for subscription tier vocabulary.**

2. **Mode enum is computed-at-request-time, not stored.** `/auth/me` (`auth.py:903-953`) derives Solo/Growth/Commercial from heuristics; defaults to GROWTH if derivation fails. `tenants.mode` column exists but all 3 production rows are GROWTH (Phase 3.24). The DB column is dead weight — the JWT-injected mode is the actual signal. → schema/code coherence finding.

3. **RLS context is set in 6 distinct call sites** — canonical `db/session.py` + `middleware/rls.py` + 3 router-level manual `set_config` calls + 4 worker-level raw `SET LOCAL`. Duplication risk: any new router that forgets to use the canonical session leaks across tenants. Strike #95 added `app/workers/rls_helpers.py` for workers; routers haven't been similarly consolidated.

The Decision Engine cluster #110-116 is **operationally healthy at the code level**: `decision_engine_worker.py` (14.8 KB) has 1 task hooked to the 18:05 UTC beat (matches Phase 3 latest snapshot timestamp). Cluster Strike #91 catches (savepoint isolation, threshold dedup, composite PK) are all visible in the worker code's structure.

---

## 4.0 Backend topology

### `app/` directory structure

```
app/
├── core/                    3 files (config, audit_chain, task_engine)
├── db/                      3 files (base, session, __init__)
├── deps/                    2 files (__init__, tasks)
├── middleware/              3 files (auth, rls, __init__)
├── models/                  9 files (49 ORM classes)
├── routers/                61 files  ← but 51 actual routers (rest are .bak)
├── schemas/                 4 files (incl 11 .bak siblings)  ← snapshot tar-pit
├── services/               10 files
├── tasks/                   2 files (health_monitor)
├── templates/               0 files (empty dir)
├── utils/                   5 files
└── workers/                 8 files (6 workers + celery_app + rls_helpers)

openclaw/                    0 .py files (config/prompt-only — system_prompt.md, agent_config.yaml, tools.yaml)
alembic/                     1 .py file (env.py)

TOTAL .py in app/: 113
```

### Phase 4 finding (immediate)

**`app/templates/` is empty** despite being created. Either reserved for future Jinja2 templates or stub that should be removed. → Phase 10 cleanup.

### Function/class totals

```
Functions (def + async def) across app/:  417
Classes across app/:                      170
```

170 classes / 417 functions = a class-heavy codebase. Most classes are ORM models (49) + Pydantic schemas (48) + a smaller number of service classes / middleware classes / Celery task config dataclasses.

---

## 4.1 Entrypoints

### `app/main.py` (16,151 bytes)

Loads:
- FastAPI + CORSMiddleware + Sentry SDK (FastApiIntegration + SqlalchemyIntegration)
- Auth pipeline: `app.middleware.auth.AuthMiddleware`
- DB: `app.db.session.engine` + `check_db_health`
- Config: `app.config.settings`

Comment in main.py says **"Import all 39 routers"** — actual count is 51 router includes. **Stale comment, off by 12.** → Phase 10 trivial fix.

### Router include surface

51 routers mounted, most under `PREFIX="/api/v1"`. Public/no-auth routes:
- `verify.html_router` mounted at `prefix=""` (no API prefix) — public verify page
- `verify.router` at `/api/v1` — public JSON verify endpoint
- `chemicals.router` at `/api/v1` (no further prefix) — chemicals catalog (likely public for compliance lookups)

All 4 PUBLIC paths defined in `AuthMiddleware.PUBLIC_PATHS`:
```
/health, /api/v1/health, /, /docs, /openapi.json, /redoc,
/api/v1/auth/login, /api/v1/auth/register, /api/v1/auth/refresh, /api/v1/auth/reset-password
```

### Strike #91 finding (entrypoint)

The `verify.html_router` mounted at root `prefix=""` is the **public moat-verification page** (Phase 9-3 commit `138187e`). Combined with `verify.router` at `/api/v1`, it forms the dual-mode verify surface (HTML for public, JSON for programmatic). Cross-reference: `audit.public_chain_stats()` from Phase 3 backs this. **Healthy by design.**

---

## 4.2 / 4.3 / 4.4 Routers

### Router inventory (51 routers)

The 51 routers cover:

| Domain | Routers |
|---|---|
| **Auth + identity** | auth, me, admin, admin_monitoring, attribution |
| **Onboarding** | onboarding |
| **Farm core** | farms, zones, production_units, productions, farm_active_groups, farm_libraries, event_catalog |
| **Events spine** | events, field_events, flocks |
| **Crops** | crop_varieties, cycles, rotation, harvests, agronomy, nursery, productions |
| **POULTRY** | poultry_dashboard, poultry_compliance, poultry_bank_evidence (the moat artifact) |
| **Cash + finance** | cash, income, financials, profit_share, reports |
| **Inventory** | inputs, input_transactions, equipment, suppliers, customers |
| **Labor** | labor, workers |
| **Alerts/automation** | alerts, automation_rules, decision_engine |
| **TIS (AI)** | tis, tis_stream, voice |
| **Other verticals** | livestock, apiculture |
| **Pricing/sales** | price_master, orders, marketplace, delivery |
| **Public verify** | verify (×2: JSON + HTML), chemicals |
| **Subscription** | subscriptions, webhooks |
| **System** | health, exports, kb, kb_articles, weather, community, tasks |

### Endpoint count by router (~165 total, top contributors)

| Router | Endpoints | File size |
|---|---:|---:|
| `admin.py` | 16 | 17.7 KB |
| `auth.py` | 11 | 35.9 KB |
| `cycles.py` | 8 | 13.7 KB |
| `alerts.py` | 6 | 12.4 KB |
| `farms.py` | 5 | 13.8 KB |
| `automation_rules.py` | 5 | 5.5 KB |
| `tasks.py` | 5 | 17.2 KB |
| `onboarding.py` | 5 | 27.0 KB |
| `community.py` | 5 | 8.6 KB |
| `livestock.py` | 4 | 5.1 KB |
| `harvests.py` | 4 | 13.5 KB |
| `farm_libraries.py` | 4 | 15.2 KB |
| `field_events.py` | 4 | 19.7 KB |
| `cash.py` | 4 | 17.6 KB |
| `delivery.py` | 4 | 5.5 KB |
| `apiculture.py` | 4 | 6.9 KB |
| `exports.py` | 4 | 10.4 KB |
| `health.py` | 4 | 3.7 KB |
| `orders.py` | 4 | 6.2 KB |
| `reports.py` | 4 | 8.9 KB |
| `workers.py` | 4 | 5.2 KB |
| (~31 routers with 1-3 endpoints each) | ~75 | (smaller files) |

**`auth.py` at 35.9 KB** is heavy — 11 endpoints including login/register/verify-email/reset-password/phone-OTP/refresh/logout/me. Single-router auth pipeline.

**`events.py` at 55.2 KB** (largest router file) has only 1 endpoint: `POST /events`. The size comes from the polymorphic dispatcher that handles 30+ event types per the events_registry. → Phase 4 hotspot for refactoring.

### Stale/inconsistent prefix patterns

- Most routers register `APIRouter()` with no prefix and rely on `main.py` `include_router(prefix="...")`.
- `admin.py` declares `APIRouter(prefix="/admin", tags=["admin"])` — duplicates the prefix already added in `include_router`. Likely double-prefix `/api/v1/admin/admin/...`. → **Phase 4 bug suspect** (need to confirm by testing). If actually broken, would already be visible — so likely benign duplicate config. Worth verifying.
- `onboarding.py` declares `APIRouter(tags=["Onboarding"])` — clean.
- Most others: `APIRouter()` no args.

### Strike #91 finding (potential bug)

The `admin.py` double-prefix pattern (router-level `prefix="/admin"` + main.py `include_router(prefix="/api/v1/admin")`) would yield `/api/v1/admin/admin/dashboard` URLs. Either:
- (a) the URLs actually work this way (unusual but possible), or
- (b) the router-level prefix is overridden somehow, or
- (c) admin endpoints are 404ing in production but no one tested them.

Curl `https://teivaka.com/api/v1/admin/dashboard` would resolve this — but that's beyond Phase 4 read-only scope. → Phase 8 / Phase 10 verification item.

---

## 4.5 Auth dependencies

```
Routes with explicit Depends(get_current_user / require_role / require_scope / require_tenant_context / set_rls):  155
```

**155 of ~165 endpoints have explicit auth Depends().** The recon's "without Depends" list (~30 functions) is biased by signature line-wrapping (Depends on line 4+ misses the 3-line grep). Most "missing" are admin/agronomy/alerts which DO use `Depends(require_role(ROLE_ADMIN))` — visible in `4.17` cross-grep.

The genuinely-public endpoints are:
- `auth.login`, `auth.register`, `auth.refresh`, `auth.reset-password`, `auth.forgot-password`, `auth.send-phone-otp`, `auth.verify-phone-otp`, `auth.verify-email`, `auth.resend-verification`, `auth.logout` — auth flow
- `attribution.capture` — pre-login attribution capture
- `verify.*` — public moat verification
- `chemicals.list` — public chemical library lookup
- `health.*` — health checks
- `webhooks.whatsapp`, `webhooks.stripe` — third-party callbacks (signature-verified, not user-auth)

→ Phase 9 cross-check: confirm webhook signature verification on stripe/whatsapp.

---

## 4.6 / 4.7 ORM Models (49 classes across 9 files)

### Models by file

| File | Size | Classes |
|---|---:|---:|
| `tenant.py` | 20.5 KB | 10 |
| `operations.py` | 18.1 KB | 6 |
| `inventory.py` | 17.9 KB | 8 |
| `shared.py` | 15.9 KB | 11 |
| `automation.py` | 12.8 KB | 5 |
| `financial.py` | 11.0 KB | 4 |
| `ai_models.py` | 6.2 KB | 5 |
| `livestock.py` | 5.3 KB | 2 |
| `__init__.py` | 2.4 KB | 0 |

### All ORM classes (alphabetical)

```
TenantBase ← DeclarativeBase    ← appears 2× (suspect duplicate definition)
SharedBase ← DeclarativeBase

Tenant-scoped (TenantBase, ~38):
  AICommand, AccountsReceivable, Alert, AutomationRule, CashLedger, Customer,
  CycleFinancials, DecisionSignalConfig, DecisionSignalSnapshot, DeliveryLog,
  Equipment, Farm, FieldEvent, HarvestLog, HarvestLoss, HiveRegister, IncomeLog,
  Input, InputTransaction, KBEmbedding, LaborAttendance, LivestockRegister,
  NurseryLog, Order, OrderLineItem, PriceMaster, ProductionCycle, ProductionUnit,
  ProfitShare, Supplier, TISConversation, TISVoiceLog, TaskQueue, Tenant, User,
  WeatherLog, Worker, Zone

Shared (SharedBase, ~11):
  ActionableRule, ChemicalLibrary, FamilyPolicy, KBArticle, KBStageLink,
  Production, ProductionStage, ProductionThreshold, RotationRegistry,
  RotationTopChoice
```

### Strike #91 finding (duplicate base class)

`grep` saw `class TenantBase(DeclarativeBase):` **twice** — likely defined once in `app/db/base.py` and re-imported/aliased in `app/models/__init__.py` or `app/models/tenant.py`. Common pattern (re-export for convenience), not necessarily a bug. → Phase 4 follow-up to confirm via Read.

### Cross-check vs DB (Phase 3)

- DB has 46 tenant tables. ORM has ~38 TenantBase classes. **Gap: ~8 tables without ORM model.** Likely junction/seed tables managed via raw SQL.
- DB has 24 shared tables. ORM has ~11 SharedBase classes. **Gap: ~13 shared tables without ORM model.** Includes catalogs (`naming_dictionary`, `event_type_catalog`, `crop_varieties` per Phase 3 row counts) — likely accessed via raw SQL queries in routers.

→ Phase 4 follow-up: list tables not covered by ORM and confirm they're raw-SQL-only by intent.

---

## 4.8 Pydantic schemas

```
events_registry.py        32 classes  (31 KB — polymorphic events spine)
tasks.py                  16 classes
__init__.py                0 classes
envelope.py                ? classes  (recon counted 0; confirm)
```

**Total: 48 Pydantic schema classes** across 4 files (5 if envelope is in use).

### Strike #91 finding (snapshot tar-pit)

```
events_registry.py.bak-pre-6-3-11
events_registry.py.bak-pre-6-3-13
events_registry.py.bak-pre-6-3-15
events_registry.py.bak-pre-6-3-17
events_registry.py.bak-pre-6-3-19
events_registry.py.bak-pre-6-3-21
events_registry.py.bak-pre-6-3-23
events_registry.py.bak-pre-6.3-7
events_registry.py.bak-pre-6.3-9
events_registry.py.bak-pre-6.6-1
events_registry.py.bak-pre-6.6-2
events_registry.py.bak-pre-strike-96
```

**12 backup files** for `events_registry.py`. Confirms Phase 2 file-churn finding (17 changes) — every Sprint 7 phase that added an event type touched this file and left a snapshot. Pre-strike-96 is the largest jump (CROPS B2 polymorphic wrapper). → Phase 10 cleanup.

---

## 4.9 / 4.10 Celery workers

### Worker files (8)

| File | Size | Tasks | Last modified |
|---|---:|---:|---|
| `automation_worker.py` | 63.2 KB | 3 | 2026-05-04 (Strike #95) |
| `decision_engine_worker.py` | 14.8 KB | 1 | 2026-05-07 (Strike #116) |
| `notification_worker.py` | 10.6 KB | 3 | 2026-05-04 |
| `ai_worker.py` | 7.3 KB | 2 | 2026-04-08 |
| `maintenance_worker.py` | 3.5 KB | 3 | 2026-05-07 (Strike #111) |
| `celery_app.py` | 4.2 KB | (config) | 2026-04-20 |
| `rls_helpers.py` | 1.7 KB | (helper, Strike #95) | 2026-05-04 |
| `__init__.py` | 0 | — | — |

### `celery_app.py` configuration

```python
broker:    settings.redis_url
backend:   settings.redis_url
serializer: json
accept:    [json]
timezone:  UTC
task_acks_late:           True   ← durable retry
task_reject_on_worker_lost: True ← reject if worker dies
task_track_started:       True   ← STARTED state visible
task_time_limit:          600    (10 min hard)
task_soft_time_limit:     540    (9 min — SoftTimeLimitExceeded handling)
result_expires:           86400  (24h)
```

### Queues (6)

```
automation     ← automation_worker
decision       ← decision_engine_worker  (Strike #110 wired)
notifications  ← notification_worker
ai             ← ai_worker
maintenance    ← maintenance_worker      (Strike #110 wired)
default        ← fallback
```

Routes (`task_routes`) bind worker module patterns to queues. **Strike #110's queue-wiring fix is visible here** — `decision` and `maintenance` queues exist and are properly routed.

### Beat schedule (8 entries)

| Job | Schedule | Queue |
|---|---|---|
| `automation-engine-daily` | 18:00 UTC (06:00 Fiji) | automation |
| **`decision-engine-daily`** | **18:05 UTC (06:05 Fiji)** | **decision** |
| `mv-refresh-daily` | 18:10 UTC (06:10 Fiji) | maintenance |
| `ferry-buffer-weekly` | Sunday 18:00 UTC (Monday 06:00 Fiji) | automation |
| `batch-low-alerts` | every hour at :00 | notifications |
| `ai-insights-weekly` | Saturday 18:00 UTC (Sunday 06:00 Fiji) | ai |
| `ops-run-cheap-checks` | every 15 min (`0,15,30,45`) | ai |
| (8th — partially visible at line 105) | crontab(minute=0, hour="0,4,8,12,16,20") | (queue not visible) |

### Strike #91 finding (positive — Phase 3 cross-confirmation)

Phase 3 reported `tenant.decision_signal_snapshots` newest = `2026-05-08 06:05:00.226+12` (Fiji time, = 18:05 UTC 2026-05-07). Beat schedule confirms: `decision-engine-daily` fires at `crontab(hour=18, minute=5)`. **Cluster #110-116 cron-wiring verified end-to-end.**

### Task decorators per worker (12 total)

```
ai_worker.py                 2 tasks  (embed_kb_article, generate_weekly_insights)
automation_worker.py         3 tasks  (run_automation_engine + ferry + ?)
decision_engine_worker.py    1 task   (run_decision_engine)
maintenance_worker.py        3 tasks  (refresh_materialized_views + 2 others)
notification_worker.py       3 tasks  (send_batched_low_alerts + 2 others)
                          ───────
                            12 tasks
```

`automation_worker.py` at 63 KB is **the single biggest file in app/**. 3 tasks but spread across ~1500-2000 LOC. Strike #95 added the two-stage scan there. The remaining ~50 KB is per-farm rule evaluation logic. → Phase 4 hotspot for future refactoring (as noted in Strike #118 backlog: "automation_worker per-farm `_evaluate_all_rules` silent traceback").

---

## 4.11 Services (10 files)

```
cycle_service.py             24.9 KB   9 funcs   (cycle creation, transitions, financials)
tis_service.py               25.9 KB  10 funcs   (TIS RAG retrieval, conversation handling)
harvest_service.py           13.9 KB   4 funcs   (harvest validation, WHD enforcement)
onboarding_service.py         8.7 KB   9 funcs   (multi-step onboarding flow)
notification_service.py       6.5 KB   0 funcs/1 class  ← class-based (style outlier)
task_generator.py             5.9 KB   5 funcs   (Phase 8-2 automation → task_queue)
rotation_service.py           5.4 KB   3 funcs   (rotation validation)
naming.py                     2.5 KB   2 funcs
farm_active_groups_defaults.py 2.6 KB   1 func   (insert 11 default rows on farm create)
__init__.py                   0.8 KB   0
```

### Strike #91 finding (style inconsistency)

`notification_service.py` is **class-based** (1 class, 0 module-level funcs) while every other service is **function-based**. Phase 4 follow-up: read the file and decide whether to harmonize or leave as-is. Likely a `NotificationService` singleton with provider switches (SMTP / WhatsApp / SMS dispatch).

---

## 4.12 Middleware (3 files)

```
auth.py    6.0 KB   AuthMiddleware (Starlette-compatible)
rls.py     6.2 KB   get_current_user + RLS-aware DB session + role gates + tier gates
__init__.py  21 B   (empty)
```

### `auth.py` — AuthMiddleware

- Skips auth for PUBLIC_PATHS (10 paths visible in 4.1)
- Extracts `Authorization: Bearer <token>` header
- **Verifies JWT using app's own `SECRET_KEY` (HS256)** — NOT Supabase
- Looks up user+tenant by `sub` claim
- Attaches user dict to `request.state.user`
- Rejects suspended accounts with 403

The docstring is explicit: "No Supabase dependency in the auth pipeline." Tokens are issued by `app.routers.auth` (login/register/refresh) and signed with `settings.secret_key`.

### `rls.py` — Role + tier gates

```python
ROLE_ADMIN, ROLE_FOUNDER, ROLE_MANAGER, ROLE_WORKER, ROLE_VIEWER, ROLE_FARMER
```

6 roles defined. `get_current_user` extracts from `request.state`, raises 401 if missing.

`require_tier(min_tier)` — tier-level gating with `TIER_ORDER` dict (FREE=0, ...).
`require_role_and_tier(*roles, min_tier="FREE")` — combined gate.

### Strike #91 finding (RLS context paths — 6 distinct call sites)

```
1. app/db/session.py                  ← canonical async session (set_config)
2. app/middleware/rls.py              ← get_db_with_rls dependency (set_config)
3. app/deps/tasks.py:233              ← set_tenant_context() helper (set_config)
4. app/routers/onboarding.py:115      ← manual set_config (one-shot in flow)
5. app/routers/harvests.py:57/88/125  ← manual set_config (×3 calls in same file)
6. app/routers/tis_stream.py:62       ← manual set_config

7. app/workers/notification_worker.py:135  ← raw psycopg2 SET LOCAL
8. app/workers/ai_worker.py:75/142          ← raw psycopg2 SET LOCAL
9. app/workers/automation_worker.py:1550   ← raw psycopg2 SET LOCAL (Strike #95)
10. app/workers/rls_helpers.py:41           ← Strike #95 wrapper (set_config)
```

**10 RLS context call sites across 6 distinct patterns.** Routers should use the canonical `db/session.py` async session via `Depends(get_db_with_rls)`. The 3 routers (onboarding, harvests, tis_stream) bypassing this and setting RLS manually are **doing extra work the canonical path should cover**, OR the canonical path doesn't cover their use case (long-lived sessions like SSE in tis_stream, multi-step transactions in onboarding/harvests).

→ Phase 4 deep-dive item: read the 3 manual-set routers and decide whether they need their own pattern or can be consolidated.

---

## 4.13 Deps

```
app/deps/tasks.py    7.9 KB, 235 lines, 5 funcs
  - derive_mode(...)              ← Solo/Growth/Commercial derivation
  - get_current_mode(...)
  - get_current_mode_with_derivation(...)
  - load_open_task(...)
  - set_tenant_context(db, tenant_id)
```

The mode-derivation logic lives in `deps/tasks.py`. Confirms Phase 3 finding NN: mode is computed at request time, not stored.

---

## 4.14 Utils (5 files)

```
fraud_guard.py    17.5 KB  444 lines  11 funcs   (fraud detection)
email.py          13.4 KB  311 lines   8 funcs   (SMTP wrapper)
sms.py             2.9 KB   89 lines   3 funcs   (SMS wrapper)
roles.py           1.4 KB   47 lines   2 funcs   (has_role helpers)
referral.py        1.2 KB   42 lines   2 funcs   (referral code generation)
```

`fraud_guard.py` at 17.5 KB is substantial — likely IP throttling, account-creation rate-limiting (Phase 1 mention of `shared.ip_registration_counts` 29 rows + `shared.registration_audit_log` 55 rows).

### Strike #91 finding (utils completeness)

No M-PAiSA wrapper visible in utils. Phase 8 (integrations) needs to confirm M-PAiSA stub state per brief. Likely lives in a router or service rather than utils.

---

## 4.15 Largest .py files (top 20)

| Size | File |
|---:|---|
| 63,237 | `app/workers/automation_worker.py` |
| 55,264 | `app/routers/events.py` |
| 35,869 | `app/routers/auth.py` |
| 31,016 | `app/schemas/events_registry.py` |
| 28,212 | `app/routers/poultry_bank_evidence.py` |
| 27,015 | `app/routers/onboarding.py` |
| 25,861 | `app/services/tis_service.py` |
| 24,876 | `app/services/cycle_service.py` |
| 20,526 | `app/models/tenant.py` |
| 19,748 | `app/routers/field_events.py` |
| 18,125 | `app/models/operations.py` |
| 18,109 | `app/tasks/health_monitor.py` |
| 17,855 | `app/models/inventory.py` |
| 17,734 | `app/routers/admin.py` |
| 17,630 | `app/routers/cash.py` |
| 17,477 | `app/utils/fraud_guard.py` |
| 17,221 | `app/routers/tasks.py` |
| 16,151 | `app/main.py` |
| 15,917 | `app/models/shared.py` |
| 15,208 | `app/routers/farm_libraries.py` |

**`automation_worker.py` (63 KB) is 2× the next largest file** (events.py at 55 KB) and >4× most others. Single-file complexity hotspot. Strike #95 added the two-stage scan (~50 lines), Strike #110 wired the decision queue. The bulk is in per-farm rule evaluation. → Phase 10 refactoring candidate.

---

## 4.16 Cross-module imports — workers from non-worker code

```
app/routers/automation_rules.py:111
  from app.workers.automation_worker import run_automation_engine     ← manual trigger endpoint

app/routers/kb_articles.py:53/92
  from app.workers.ai_worker import embed_kb_article                  ← embedding pipeline trigger

app/routers/health.py:31/94
  from app.workers.celery_app import celery_app                       ← Celery health probe

app/tasks/health_monitor.py:56
  from app.workers.celery_app import app as celery_app                ← health monitor reuses celery
```

**Clean separation overall.** Routers don't import worker logic except for explicit trigger endpoints (`/automation-rules/{id}/trigger` and `/kb-articles/{id}/validate` triggering re-embedding). `health.py` imports `celery_app` for liveness checks — also clean.

---

## 4.17 Tier + mode enum cross-check

### Tier vocabulary drift (6 distinct sets in code)

| Source | Tiers |
|--------|-------|
| **Brief** | FREE, BASIC FJD-49, PREMIUM FJD-149, CUSTOM |
| **DB** (`tenant.tenants.subscription_tier`) | BASIC, PROFESSIONAL (3 rows) |
| `app/routers/subscriptions.py` (TIER_DEFINITIONS) | FREE, BASIC, **PROFESSIONAL** |
| `app/routers/automation_rules.py:105` | PREMIUM, CUSTOM (require_tier) |
| `app/routers/community.py:87,186` | BASIC, PROFESSIONAL, **ENTERPRISE** |
| `app/routers/auth.py:460` | BASIC (set on register) |
| `app/routers/webhooks.py:217` | FREE (set on Stripe cancel) |
| `app/workers/ai_worker.py:133` | PREMIUM, CUSTOM |
| `app/workers/decision_engine_worker.py:270` | PREMIUM, CUSTOM, BASIC |
| `app/middleware/rls.py:135,144,158` | FREE (default in TIER_ORDER) |

**6 distinct tier vocabularies in production code:** {FREE, BASIC, PROFESSIONAL, PREMIUM, CUSTOM, ENTERPRISE}. None of the gates can be uniformly satisfied:
- A tenant set to `BASIC` (auth.py default) cannot access `PREMIUM/CUSTOM`-gated automation
- A tenant set to `PROFESSIONAL` (DB current state for Cody) cannot satisfy `PREMIUM`-gated checks
- `ENTERPRISE` appears only in community.py — no tenant could ever satisfy it

### Strike #91 finding (tier enum drift)

This is a **real architectural gap** — feature gates reference tiers that no tenant ever has, OR tenants have tiers that no feature gate references. Result: features either always-on (because gate value never matches DB) or always-off (because tenant never has the gated tier). 

**Severity:** depends on which features land where. Need router-by-router functional check. → Phase 4 strike candidate. Strike #117+ backlog candidate.

### Mode vocabulary

```
Brief:                     Solo / Growth / Commercial
DB (tenants.mode):         GROWTH (all 3 rows)
app/core/task_engine.py:   Solo / Growth / Commercial (string lookup)
app/routers/event_catalog.py: SOLO / GROWTH / COMMERCIAL (uppercase, NULL→SOLO default)
app/routers/auth.py:903-953:  computed_mode = "GROWTH" (default), "SOLO" / "COMMERCIAL" via heuristics
app/routers/onboarding.py:195: tenant.mode == "SOLO" check
app/routers/onboarding.py:743: next_route = "/solo/task" if mode == "SOLO" else "/farm"
app/routers/tasks.py:4-5:  Solo-mode (single card) vs Growth/Commercial (list)
```

### Strike #91 finding (mode column dead weight)

`/auth/me` (auth.py:903-953) returns `computed_mode` derived from heuristics, NOT the persisted `tenants.mode` column value. Defaults to `GROWTH`. **The DB column is unused as a signal.** Onboarding.py:195 checks `tenant.mode == "SOLO"` — but since the column is never set to SOLO in practice (Phase 3.24 confirms all 3 rows are GROWTH), that branch is dead.

→ Phase 4 strike candidate: either populate `tenants.mode` from the derivation logic on tenant create/update, OR remove the column.

---

## 4.18 Audit emission call sites

Centralized helper: **`app/core/audit_chain.py:emit_audit_event()`**

Call sites in routers:
```
app/routers/farm_active_groups.py:190    ← FARM_GROUP_TOGGLED (83 events in audit.events)
app/routers/field_events.py:332          ← FIELD_EVENT_LOGGED + 30+ event types
app/routers/flocks.py:210                ← FLOCK_PLACED, FLOCK_MOVED
app/routers/tis_stream.py:205            ← TIS conversation events
app/routers/onboarding.py:15-16          ← ONBOARDING_STARTED, ONBOARDING_COMPLETED, FARM_CREATED
```

### Discrepancy with audit.events distribution (Phase 3.19)

The 30 event types in `audit.events` event_type distribution come from a small set of routers. **CASH_LOGGED appears 5 times** in audit.events but `cash.py` doesn't appear in the audit emission grep. Two possibilities:
- Cash emits via different path (raw INSERT into audit.events, bypassing emit_audit_event helper)
- Cash uses an indirect helper (e.g., trigger-emitted from cash_ledger row insert)

→ Phase 4 follow-up: read `app/routers/cash.py` and confirm audit emission path.

Per Phase 3.12 trigger inventory, no trigger on `cash_ledger` emits to audit.events. So cash.py likely uses raw INSERT or imports emit_audit_event under different path.

---

## 4.19 RLS context call sites — 10 distinct (already covered in 4.12)

See Section 4.12 for full breakdown. Summary: routers/db/session canonical path + middleware/rls + deps/tasks + 3 manual-router-set + 4 worker raw `SET LOCAL` + 1 rls_helper wrapper.

---

## 4.20 KB embeddings pipeline (Phase 3 finding JJ confirmed)

### Pipeline at code level

```
shared.kb_articles                 ← canonical articles (EMPTY in DB)
   │
   │ admin validates article via
   │ POST /api/v1/kb-articles/{id}/validate
   ▼
celery_app.send_task('app.workers.ai_worker.embed_kb_article')
   │
   ▼
ai_worker.embed_kb_article()
   ├─ Calls OpenAI text-embedding-3-small (1536 dims)
   ├─ DELETE FROM tenant.kb_embeddings WHERE article_id = ...
   └─ INSERT INTO tenant.kb_embeddings (... embedding ...)
   
tis_service.py:364
   FROM tenant.kb_embeddings  ← read-side for RAG retrieval
```

### Why pipeline is empty in DB (Phase 3 JJ)

- `shared.kb_articles` is EMPTY (Phase 3.4) — nothing to embed
- `tenant.kb_embeddings` has 1.6 MB of HNSW indexes but 0 heap rows
- The HNSW indexes exist because `KBEmbedding` ORM class declared them at table-create time
- No KB articles have been validated, so `embed_kb_article()` has never run

### Implication

**TIS RAG retrieval is structurally empty.** Even though `tis_service.py:364` queries `tenant.kb_embeddings`, the result set is always empty. TIS conversations rely on system prompt + farm context (FARM_NAME, ACTIVE_CYCLES, etc. per `system_prompt.md`) but cannot retrieve from the knowledge base. → Phase 8 (integrations).

→ Phase 4 + Phase 8 strike candidate: the KB → embedding pipeline is wired but empty. Either:
- Add seed articles to `shared.kb_articles` and let admin validation flow trigger embeddings
- Or seed `kb_articles_seeds` SQL (Phase 1.12 mentioned `KB_SEED_ARTICLES.sql` at 63 KB on disk — inspect for content)

---

## 4.21 farm_active_groups usage (Phase 3 finding CC confirmed at code level)

### Touch points

```
app/routers/farm_active_groups.py
  Line 97:    SELECT FROM tenant.farm_active_groups WHERE farm_id = :farm_id
  Line 148:   SELECT FROM tenant.farm_active_groups WHERE farm_id = :farm_id
  Line 171:   INSERT INTO tenant.farm_active_groups (farm_id, catalog_group, ...)
  Line 211:   SELECT FROM tenant.farm_active_groups WHERE farm_id = :farm_id

app/routers/event_catalog.py
  Line 102:   ---- Compute has_livestock from configured farm_active_groups (Strike #92 fix) ----
  Line 111:   SELECT 1 FROM tenant.farm_active_groups fag WHERE ...
  Line 143:   SELECT FROM tenant.farm_active_groups WHERE farm_id = :farm_id

app/routers/farms.py
  Line 140:   Wire farm_active_groups defaults per Catalog Redesign Doctrine Amendment v2

app/routers/onboarding.py
  Line 318:   Wire default farm_active_groups rows per Catalog Redesign Doctrine

app/services/farm_active_groups_defaults.py
  Line 33:    Insert 11 default farm_active_groups rows for a newly-created farm
  Line 41:    INSERT INTO tenant.farm_active_groups
```

### Strike #91 critical finding (code-level confirmation of Phase 3.11 cross-tenant exposure)

**Every query on `farm_active_groups` filters by `farm_id` only. None filter by `tenant_id`.** Combined with Phase 3 finding (no `tenant_id` column, no RLS policy):

```sql
-- Current pattern in farm_active_groups.py and event_catalog.py:
SELECT * FROM tenant.farm_active_groups WHERE farm_id = :farm_id

-- What this returns:
-- ALL rows for that farm_id, regardless of which tenant queries.
-- If tenant A passes farm_id "F001-A0EE" (which is owned by tenant a0eebc99), 
-- the query returns those rows even if tenant A has no claim on that farm.
```

**The application layer's only protection is** that the `farm_id` parameter must come from a context where the tenant has been authorized for that farm. In FastAPI routers using `Depends(get_db_with_rls)`, the RLS context is set on the DB connection but RLS isn't enforced on `farm_active_groups` (no policy). So the query happily reads cross-tenant data **if the farm_id is known**.

**Attack vector:** any attacker who:
1. Has a valid JWT for tenant A (BASIC tier)
2. Knows or guesses a farm_id belonging to tenant B (e.g. `F001-A0EE` is guessable from the tenant UUID prefix per Phase 3.25 naming convention)
3. Calls `GET /api/v1/farms/F001-A0EE/active-groups`

Would receive tenant B's group activations.

→ Phase 9 critical. **This is the most actionable security finding from Phase 1-4 combined.** A targeted strike (call it Strike #121 candidate) could fix it cleanly:
- Add `tenant_id` column to `farm_active_groups`, NOT NULL, FK to tenants
- Backfill from `tenant.farms.tenant_id` (33 rows × 1 join)
- Add RLS policy `USING (tenant_id = current_setting('app.tenant_id')::uuid)`
- Add force RLS

---

## 4.22 OpenClaw (TIS agent home)

### Files (4)

```
agent_config.yaml      3.1 KB   ← agent + tool wiring
INTEGRATION_GUIDE.md   5.8 KB   ← integration docs
MEMORY_template.md     1.6 KB   ← per-conversation memory template
system_prompt.md       3.9 KB / 112 lines  ← Claude system prompt
tools.yaml             8.3 KB   ← tool definitions for agentic workflow
```

### `system_prompt.md` excerpt (first 30 lines)

```markdown
# TIS — TFOS Farm Assistant System Prompt
# Loaded by OpenClaw as the Claude system prompt for farmer WhatsApp conversations.
# This is the FARM-FACING mode of TIS — operational context only.
# Full TIS identity, tone, authority model, and confidentiality rules are in TIS-OPERATING-MANUAL.md.

You are TIS — the Teivaka Intelligence System. In this mode you are helping farmers track and manage their operations through WhatsApp.

## Farm Context (refreshed every 5 minutes from TFOS API)
- **Farm:** {FARM_NAME} ({FARM_ID}) — {LOCATION}
- **Farmer:** {FARMER_NAME}
- **Active crops:** {ACTIVE_CYCLES}
- **Open alerts ({ALERT_COUNT}):** {OPEN_ALERTS}
- **Pending tasks ({TASK_COUNT}):** {PENDING_TASKS}
- **Farm health:** {DECISION_ENGINE_SCORE}/10
- **Last chemical application:** {LAST_CHEMICAL} — WHD expires {WHD_EXPIRES}
```

The prompt is **template-injected** from MEMORY_template.md every 5 min from TFOS API. Variables in `{BRACES}` are replaced at runtime per-conversation.

### Strike #91 finding (positive — TIS context wiring is real)

The system prompt explicitly references `{DECISION_ENGINE_SCORE}` — meaning TIS conversations include the Decision Engine output. Cluster #110-116 result is **consumed by TIS**, not just displayed to farmers. → Phase 8 (integrations) will verify the API path that feeds this.

### TIS-OPERATING-MANUAL.md not found in openclaw/

The system prompt references "Full TIS identity, tone, authority model, and confidentiality rules are in TIS-OPERATING-MANUAL.md" but that file isn't in `openclaw/`. → Phase 4 / 8 follow-up: locate the operating manual.

---

## 4.23 Function/class totals

```
Functions across app/:    417
Classes across app/:      170
```

Cross-check with section breakdown:
- Models: 49 classes
- Pydantic: 48 classes
- Services: 1 class (notification_service)
- ORM bases: 2 (TenantBase, SharedBase)
- Middleware: 1 (AuthMiddleware)
- Workers task config: ~10 (Celery `@app.task` decorators with options dataclasses)
- Misc: ~60 (router-internal helpers, etc.)

Approximate total: 170 ≈ 49 + 48 + ~70 misc. Tracks.

---

## Cross-cutting findings (Phase 4)

| # | Finding | Severity | → Phase |
|---|---------|---|---|
| XX | Tier enum drift across 6 vocabularies (FREE/BASIC/PREMIUM/PROFESSIONAL/CUSTOM/ENTERPRISE) — no single source of truth, gates reference tiers no tenant has | **High** | 4 + 8 |
| YY | `tenants.mode` DB column dead weight — `/auth/me` derives at request-time, never persists | **High** | 4 |
| ZZ | RLS context set in 10 call sites across 6 patterns — duplication risk | High | 9 |
| AAA | `farm_active_groups` queries filter by `farm_id` only (no tenant_id, no RLS) — cross-tenant exposure via guessable farm_id | **CRITICAL** | 9 |
| BBB | `events_registry.py` has 12 .bak-pre-* siblings — most-edited Pydantic file | Med (cleanup) | 10 |
| CCC | `app/templates/` empty directory — reserved or stub | Low | 10 |
| DDD | `main.py` says "Import all 39 routers" but actual is 51 — stale comment off by 12 | Trivial | 10 |
| EEE | `admin.py` has router-level `prefix="/admin"` + main.py adds `/api/v1/admin` — possible double-prefix | Med (verify) | 8 |
| FFF | `notification_service.py` is class-based; rest function-based — style outlier | Low | 4 |
| GGG | `class TenantBase(DeclarativeBase)` declared 2× across model files — likely re-export, confirm | Low | 4 |
| HHH | `automation_worker.py` at 63 KB — biggest file, single complexity hotspot, Strike #118 backlog | Med | 4 + 10 |
| III | `cash.py` not in audit emission grep but CASH_LOGGED appears 5× in audit.events — different emission path | Med (verify) | 4 |
| JJJ | `KB_SEED_ARTICLES.sql` (63 KB) on disk but `shared.kb_articles` empty — seed never loaded | High | 4 + 8 |
| KKK | `TIS-OPERATING-MANUAL.md` referenced by system_prompt.md but not in `openclaw/` — locate or it's a missing file | Med | 4 + 8 |
| LLL | 8 tenant tables and 13 shared tables exist in DB without ORM models (raw SQL only) | Med | 4 |
| MMM | Beat schedule 8 entries — confirms cluster #110 wiring; 2026-05-08 06:05 Fiji natural fire matched Phase 3 latest snapshot | (positive) | (informational) |
| NNN | Audit emission centralized via `app/core/audit_chain.emit_audit_event` — clean architecture | (positive) | (informational) |
| OOO | Single-secret JWT auth (no Supabase) — clear ownership, per AuthMiddleware docstring | (positive) | 9 |
| PPP | Sentry SDK integrated (FastApiIntegration + SqlalchemyIntegration) — observability in place | (positive) | (informational) |
| QQQ | `task_acks_late=True` + `task_reject_on_worker_lost=True` — durable Celery semantics | (positive) | (informational) |

---

## Strike candidates surfaced by Phase 4

Concrete, scoped strikes that could ship before Phase 10:

1. **Strike #121 (candidate): farm_active_groups tenant_id + RLS** — eliminates the cross-tenant exposure (CC + AAA). Migration 076 + ORM update + router queries unchanged (RLS does the lifting). ~30 minute strike.
2. **Strike #122 (candidate): Tier enum reconciliation** — pick canonical vocabulary (likely FREE/BASIC/PROFESSIONAL/CUSTOM per subscriptions.py + brief intent), fix `automation_rules.py:105`, `community.py:87,186`, `ai_worker.py:133`, `decision_engine_worker.py:270`. ~2 hour strike with router-level functional verification.
3. **Strike #123 (candidate): mode column resolution** — either persist computed_mode on tenants.mode or drop the column. ~1 hour strike.
4. **Strike #124 (candidate): events_registry.bak cleanup** — git rm 12 .bak siblings, single doc-sync commit. 5 minute strike.
5. **Strike #125 (candidate): main.py "39 routers" comment fix** — trivial. 1 minute strike.

→ Phase 10 will integrate these into the post-audit recommendation sequence with prioritization.

---

## Handoffs

- **Phase 5 (frontend):** cross-check the 51 routers against React Router routes; identify endpoints with no UI consumer.
- **Phase 6 (infrastructure):** confirm 8th beat-schedule entry (line 105+ partially visible); verify `ops-run-cheap-checks` queue routing; verify Sentry DSN configured.
- **Phase 7 (deps):** OpenAI SDK present? text-embedding-3-small in requirements? Anthropic Claude SDK present?
- **Phase 8 (integrations):** verify admin.py double-prefix (EEE); locate TIS-OPERATING-MANUAL.md (KKK); verify KB seed file (JJJ); verify M-PAiSA stub state; confirm Stripe webhook signature verify.
- **Phase 9 (security):** **farm_active_groups is the highest-priority audit finding from Phase 1-4 combined (AAA)**; verify webhook signature verification; consolidate the 10 RLS-context call sites; verify JWT secret-key rotation policy.
- **Phase 10 (synthesis):** strike candidates #121-125; tier enum reconciliation strategy; mode column decision; bake all audit findings into 90-day sequence.

---

**Phase 4 complete.** No mutations. File written 2026-05-08 06:00 UTC.
