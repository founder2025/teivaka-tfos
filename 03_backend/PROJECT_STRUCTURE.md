# FILE: 03_backend/PROJECT_STRUCTURE.md

# Teivaka TFOS Backend — Project Structure

**Platform:** Python 3.12 + FastAPI 0.115+
**Database:** PostgreSQL 16 + TimescaleDB
**ORM:** SQLAlchemy 2.0 async
**Cache / Queue:** Redis 7.2 + Celery 5.4
**AI Services:** Claude API (claude-sonnet-4-20250514), OpenAI Whisper API
**Notifications:** Twilio WhatsApp
**Storage:** Supabase Storage
**Hosting:** Hetzner CAX21

---

## 1. Complete Folder Tree

```
teivaka-api/
├── main.py
├── config.py
├── database.py
├── dependencies.py
├── middleware/
│   ├── __init__.py
│   ├── auth.py
│   ├── tenant.py
│   ├── subscription.py
│   └── rate_limit.py
├── routers/
│   ├── __init__.py
│   ├── auth.py
│   ├── farms.py
│   ├── zones.py
│   ├── production_units.py
│   ├── productions.py
│   ├── cycles.py
│   ├── events.py
│   ├── harvests.py
│   ├── income.py
│   ├── labor.py
│   ├── weather.py
│   ├── delivery.py
│   ├── nursery.py
│   ├── cash.py
│   ├── inputs.py
│   ├── orders.py
│   ├── workers.py
│   ├── equipment.py
│   ├── suppliers.py
│   ├── customers.py
│   ├── livestock.py
│   ├── hives.py
│   ├── financial.py
│   ├── tasks.py
│   ├── alerts.py
│   ├── decision_engine.py
│   ├── automation.py
│   ├── rotation.py
│   ├── knowledge.py
│   ├── tis.py
│   ├── dashboard.py
│   ├── reports.py
│   ├── community.py
│   ├── subscriptions.py
│   ├── admin.py
│   └── webhooks.py
├── models/
│   ├── __init__.py
│   ├── db/
│   │   ├── __init__.py
│   │   ├── core.py
│   │   ├── production.py
│   │   ├── operations.py
│   │   ├── inventory.py
│   │   ├── financial.py
│   │   ├── people.py
│   │   ├── assets.py
│   │   ├── livestock.py
│   │   ├── intelligence.py
│   │   ├── ai.py
│   │   └── community.py
│   └── schemas/
│       ├── __init__.py
│       ├── auth.py
│       ├── farms.py
│       ├── cycles.py
│       ├── operations.py
│       ├── financial.py
│       ├── intelligence.py
│       ├── tis.py
│       └── common.py
├── services/
│   ├── __init__.py
│   ├── auth_service.py
│   ├── rotation_service.py
│   ├── compliance_service.py
│   ├── decision_service.py
│   ├── automation_service.py
│   ├── tis_service.py
│   ├── tis_kb_service.py
│   ├── tis_interpreter.py
│   ├── tis_executor.py
│   ├── voice_service.py
│   ├── whatsapp_service.py
│   ├── financial_service.py
│   ├── report_service.py
│   ├── upload_service.py
│   └── sync_service.py
├── workers/
│   ├── __init__.py
│   ├── celery_app.py
│   ├── beat_schedule.py
│   ├── automation_worker.py
│   ├── decision_worker.py
│   ├── whatsapp_worker.py
│   ├── tis_worker.py
│   ├── voice_worker.py
│   ├── sync_worker.py
│   ├── kpi_worker.py
│   ├── maintenance_worker.py
│   └── views_worker.py
├── core/
│   ├── __init__.py
│   ├── security.py
│   ├── exceptions.py
│   └── constants.py
├── migrations/
│   ├── env.py
│   └── versions/
│       ├── 001_initial_schema.py
│       ├── 002_timescale_hypertables.py
│       ├── 003_rls_policies.py
│       ├── 004_production_data.py
│       ├── 005_rotation_rules.py
│       ├── 006_kb_articles.py
│       ├── 007_automation_rules.py
│       ├── 008_materialized_views.py
│       ├── 009_decision_signals.py
│       ├── 010_community_schema.py
│       ├── 011_ai_tables.py
│       ├── 012_financial_views.py
│       ├── 013_worker_tables.py
│       ├── 014_livestock_tables.py
│       ├── 015_offline_sync.py
│       └── 016_subscriptions.py
├── tests/
│   ├── conftest.py
│   ├── test_rotation_engine.py
│   ├── test_automation_engine.py
│   ├── test_decision_engine.py
│   ├── test_financial.py
│   └── test_tis.py
├── alembic.ini
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── .env.example
└── Caddyfile
```

---

## 2. File-by-File Purpose Reference

### Root Files

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app creation, all router mounting via `app.include_router()`, global middleware registration (CORS, auth, tenant, rate limit), startup/shutdown event handlers, health check endpoint at `GET /health` |
| `config.py` | `Settings` class extending Pydantic `BaseSettings`. Loads all environment variables, provides singleton `get_settings()` function cached with `@lru_cache`. All config consumed via `Depends(get_settings)` — never hardcoded anywhere. |
| `database.py` | Async SQLAlchemy engine creation via `create_async_engine()`, `AsyncSessionLocal` session factory, `Base` declarative base, `get_db()` async dependency that yields a session and handles commit/rollback/close lifecycle. |
| `dependencies.py` | Shared FastAPI dependency functions: `get_current_user()` (decodes JWT, fetches user row), `require_role(roles)` (role gate), `require_tier(tiers)` (subscription gate), `get_farm_or_404()` (fetches farm and validates tenant ownership), `get_pagination()` (page/limit params). |

---

### middleware/

| File | Purpose |
|------|---------|
| `__init__.py` | Empty init. |
| `auth.py` | JWT validation middleware. On every request: extracts `Authorization: Bearer <token>`, calls `core.security.decode_jwt()`, rejects with 401 if invalid/expired. Writes `request.state.user_id` and `request.state.tenant_id` for downstream use. Skips public endpoints (`/auth/login`, `/auth/register`, `/health`, `/webhooks/whatsapp`). |
| `tenant.py` | Row-Level Security middleware. After auth: executes `SET LOCAL app.tenant_id = '<tenant_id>'` on the database session before each request. This activates PostgreSQL RLS policies so every query is automatically scoped to the tenant without explicit `WHERE tenant_id =` in application code. |
| `subscription.py` | Subscription feature gating middleware. Reads `request.state.subscription_tier`. For TIS endpoints: checks daily TIS usage counter in Redis (`tis_usage:{tenant_id}:{date}`). FREE tier blocked at 5 TIS calls/day; BASIC at 20/day; PREMIUM unlimited. For feature endpoints: validates tier meets minimum required tier. Returns 403 with `SUBSCRIPTION_REQUIRED` error code if gated. |
| `rate_limit.py` | Redis-based rate limiting. Standard endpoints: 100 requests/minute per `tenant_id`. AI/TIS endpoints (`/tis/*`, `/voice/*`): 10 requests/minute per `tenant_id`. Uses sliding window algorithm with Redis sorted sets (`rate:{tenant_id}:{endpoint_prefix}:{minute_bucket}`). Returns 429 with `Retry-After` header on limit breach. |

---

### routers/

| File | Purpose |
|------|---------|
| `__init__.py` | Empty init. |
| `auth.py` | `POST /auth/login` (username+password → JWT), `POST /auth/register` (new tenant+user), `POST /auth/refresh` (refresh token → new JWT), `POST /auth/logout` (invalidate refresh token), `POST /auth/change-password`. All public endpoints — no auth middleware applied. |
| `farms.py` | `GET /farms` (list farms for tenant), `POST /farms` (create farm), `GET /farms/{farm_id}` (farm detail with subscription summary), `PATCH /farms/{farm_id}` (update), `GET /farms/{farm_id}/summary` (aggregated farm metrics). Requires MANAGER or FOUNDER role. |
| `zones.py` | `GET /farms/{farm_id}/zones`, `POST /farms/{farm_id}/zones`, `GET /zones/{zone_id}`, `PATCH /zones/{zone_id}`, `DELETE /zones/{zone_id}` (soft delete only). |
| `production_units.py` | Full CRUD on production units. `GET /production-units` with filters (farm_id, zone_id, status). `POST /production-units`. `GET /production-units/{pu_id}` returns PU with current active cycle summary. `PATCH /production-units/{pu_id}`. Subscription gate: FREE tier max 2 PUs per farm. |
| `productions.py` | `GET /productions` — read-only list of shared production master data (crops, livestock types, forestry). `GET /productions/{production_id}` — detail with rotation rules. No tenant scoping — shared data, no write endpoints exposed via tenant API. |
| `cycles.py` | `POST /cycles` (create cycle — triggers rotation validation first), `GET /cycles` (list with filters), `GET /cycles/{cycle_id}` (detail with CoKG), `PATCH /cycles/{cycle_id}` (update status), `POST /cycles/{pu_id}/override-rotation` (submit override request), `POST /cycles/approve-override` (FOUNDER only — approve override). All cycle creation runs `rotation_service.validate_rotation()` before inserting. |
| `events.py` | CRUD for field events (planting notes, observations, pest scouting, spray applications). `POST /events`, `GET /events?pu_id=&cycle_id=&event_type=`, `GET /events/{event_id}`, `PATCH /events/{event_id}`. |
| `harvests.py` | `POST /harvests` — creates harvest log. Automatically calls `compliance_service.check_chemical_compliance()` before inserting. If compliance check fails and `force=False`, returns 422 with compliance violation detail. If `chemical_compliance_auto_check=True` and `force=False`, compliance violation blocks harvest. `GET /harvests?cycle_id=`, `GET /harvests/{harvest_id}`. |
| `income.py` | `POST /income`, `GET /income?cycle_id=&farm_id=&date_from=&date_to=`, `GET /income/{income_id}`, `PATCH /income/{income_id}`. |
| `labor.py` | `POST /labor` (log attendance record for one worker one day), `GET /labor?farm_id=&worker_id=&week_start=`, `GET /labor/weekly-summary?farm_id=&week_start=` (aggregated by worker). |
| `weather.py` | `POST /weather` (log weather observation), `GET /weather?farm_id=&date_from=&date_to=`, `GET /weather/latest?farm_id=` (most recent entry). |
| `delivery.py` | `POST /delivery` (log delivery to buyer), `GET /delivery?farm_id=&cycle_id=`, `PATCH /delivery/{delivery_id}` (update delivery status/shortage flag). |
| `nursery.py` | `POST /nursery` (log seedling batch), `GET /nursery?farm_id=`, `PATCH /nursery/{batch_id}` (update batch status — ready/transplanted/failed). |
| `cash.py` | `GET /cash/balance?farm_id=` (current net cash position), `POST /cash` (log cash transaction), `GET /cash/ledger?farm_id=&date_from=&date_to=` (transaction history), `GET /cash/forecast?farm_id=` (13-week rolling cashflow forecast from `financial_service.compute_cashflow_forecast()`). |
| `inputs.py` | `GET /inputs?farm_id=` (inventory list with current stock and stock status), `POST /inputs` (add new input to inventory), `POST /inputs/{input_id}/transaction` (log purchase or usage), `GET /inputs/{input_id}` (detail with transaction history), `GET /inputs/low-stock?farm_id=` (inputs below reorder point). |
| `orders.py` | `POST /orders` (create purchase order), `GET /orders?farm_id=&status=`, `GET /orders/{order_id}`, `PATCH /orders/{order_id}` (update status — ordered/in_transit/delivered/cancelled). |
| `workers.py` | `POST /workers` (register worker), `GET /workers?farm_id=`, `GET /workers/{worker_id}`, `PATCH /workers/{worker_id}`, `GET /workers/{worker_id}/performance?weeks=4` (performance summary from materialized view). |
| `equipment.py` | `POST /equipment`, `GET /equipment?farm_id=`, `GET /equipment/{equipment_id}`, `PATCH /equipment/{equipment_id}` (update hours used, maintenance date). |
| `suppliers.py` | `POST /suppliers`, `GET /suppliers?farm_id=`, `GET /suppliers/{supplier_id}`, `PATCH /suppliers/{supplier_id}`. |
| `customers.py` | `POST /customers`, `GET /customers?farm_id=`, `GET /customers/{customer_id}`, `PATCH /customers/{customer_id}`. |
| `livestock.py` | `POST /livestock` (register animal), `GET /livestock?farm_id=&species=`, `GET /livestock/{animal_id}`, `POST /livestock/{animal_id}/event` (log event — vaccination, weight check, mortality), `GET /livestock/summary?farm_id=` (from materialized view). |
| `hives.py` | `POST /hives` (register hive), `GET /hives?farm_id=`, `GET /hives/{hive_id}`, `POST /hives/{hive_id}/log` (log inspection or harvest), `GET /hives/summary?farm_id=` (apiculture summary from materialized view). |
| `financial.py` | `GET /financial/cycle/{cycle_id}` (CoKG, margin, full cost breakdown for one cycle), `GET /financial/farm/{farm_id}/pnl?period=` (farm-level P&L), `GET /financial/farm/{farm_id}/profit-share` (Nayan's share + Teivaka cut), `GET /financial/farm/{farm_id}/expansion-readiness` (expansion readiness score). |
| `tasks.py` | `GET /tasks?farm_id=&status=&assigned_to=`, `POST /tasks` (manually create task), `PATCH /tasks/{task_id}` (update status — complete, cancel), `GET /tasks/overdue?farm_id=` (all overdue tasks). |
| `alerts.py` | `GET /alerts?farm_id=&severity=&status=`, `GET /alerts/{alert_id}`, `POST /alerts/{alert_id}/resolve` (mark resolved with note), `POST /alerts/{alert_id}/dismiss` (MANAGER+ only). |
| `decision_engine.py` | `GET /decision-engine/signals?farm_id=` (latest snapshot of all 10 signals for a farm), `GET /decision-engine/signals/{signal_id}` (single signal detail with history), `GET /decision-engine/dashboard?farm_id=` (all signals formatted for dashboard display). |
| `automation.py` | `GET /automation/rules` (list all 43 rules with active status), `GET /automation/rules/{rule_id}` (rule detail), `PATCH /automation/rules/{rule_id}` (activate/deactivate rule — FOUNDER only), `POST /automation/trigger` (manually trigger engine — FOUNDER only), `GET /automation/run-log` (history of engine runs with outcomes). |
| `rotation.py` | `POST /rotation/validate` (validates proposed production for a PU — no cycle created), `GET /rotation/history/{pu_id}` (full rotation history for a PU), `GET /rotation/alternatives/{pu_id}` (recommended next productions for current PU state), `GET /rotation/overrides?farm_id=` (list all override decisions). |
| `knowledge.py` | `GET /knowledge/articles` (list KB articles — shared.kb_articles, read-only), `GET /knowledge/articles/{article_id}` (article detail), `GET /knowledge/search?q=` (full-text search over KB articles, used by TIS Knowledge Broker). No write endpoints — KB is managed by Teivaka admin only. |
| `tis.py` | `POST /tis/chat` (text message → TIS routing → response), `POST /tis/voice` (audio file URL → Whisper transcription → TIS routing → response), `GET /tis/conversations?farm_id=` (conversation history), `GET /tis/conversations/{conversation_id}` (single conversation thread), `GET /tis/insights?farm_id=` (proactive AI insights list), `POST /tis/whatsapp` (internal endpoint — Twilio webhook routes here after validation). |
| `dashboard.py` | `GET /dashboard?farm_id=` — single aggregated call returning full dashboard payload. Calls `decision_service.get_dashboard_payload()`. Returns: active cycles with CoKG, open alerts (by severity), overdue tasks, cash balance, latest weather, worker summary, pending orders, TIS usage today. Optimized for mobile — single request replaces 8+ separate calls. |
| `reports.py` | `GET /reports/weekly-kpi?farm_id=&week_start=` (weekly KPI snapshot), `GET /reports/pnl?farm_id=&month=` (monthly P&L), `GET /reports/cycle/{cycle_id}` (full cycle report at close), `GET /reports/crop-ranking?farm_id=` (crop performance ranking by CoKG and margin), `POST /reports/generate` (trigger async report generation for download). |
| `community.py` | `GET /community/listings` (view marketplace listings — all tiers), `POST /community/listings` (create listing — BASIC+ only, Phase 2), `GET /community/price-index` (current commodity prices from price_index), `POST /community/posts` (community post — PREMIUM Phase 2), `GET /community/posts` (view posts — all tiers Phase 1). Phase 1 is view-only; full participation is Phase 2 BASIC+ feature. |
| `subscriptions.py` | `GET /subscriptions/current` (current plan detail, usage stats), `POST /subscriptions/upgrade` (request tier upgrade — initiates billing flow), `GET /subscriptions/plans` (list all tier features and pricing), `GET /subscriptions/usage` (daily TIS usage, PU count vs limits). |
| `admin.py` | Admin-only endpoints. `GET /admin/tenants` (list all tenants), `GET /admin/tenants/{tenant_id}` (tenant detail with usage stats), `POST /admin/tenants/{tenant_id}/suspend`, `GET /admin/system-health` (all queue depths, worker status, DB connections), `POST /admin/automation/run-all` (force run all automation rules), `GET /admin/kb/articles` (manage knowledge base), `POST /admin/kb/articles` (create KB article). Requires ADMIN role (platform-level, not tenant-level). |
| `webhooks.py` | `POST /webhooks/whatsapp` — Twilio incoming WhatsApp webhook. Validates Twilio signature (`X-Twilio-Signature` header), extracts sender phone number, matches to tenant user, routes message to TIS via `tis_service.route_message()`. Voice notes: routes to `voice_service.process_voice_note()`. Returns TwiML response. |

---

### models/db/

All SQLAlchemy ORM models. Use `MappedColumn` / `mapped_column` syntax from SQLAlchemy 2.0. All tables include `tenant_id` column with RLS policy. TimescaleDB hypertables applied to event/log tables.

| File | SQLAlchemy Models |
|------|------------------|
| `core.py` | `Tenant` (id, name, subscription_tier, active, created_at), `User` (id, tenant_id, email, hashed_password, role, full_name, phone, is_active), `Farm` (id, tenant_id, farm_code, farm_name, location, island, area_acres, has_ferry_dependency), `Zone` (id, farm_id, zone_name, area_acres, soil_type, irrigation_type) |
| `production.py` | `ProductionCycle` (id, pu_id, production_id, cycle_status, planting_date, expected_harvest_start, actual_harvest_end, area_planted_acres, rotation_override, rotation_override_reason, logged_via), `CycleCreationGate` (id, pu_id, proposed_production_id, gate_status, rotation_result_json, requested_by, created_at), `OverrideLog` (id, pu_id, previous_production_id, new_production_id, rule_violated, violation_type, days_short, requested_by, reason, approved_by, severity, approved_at, created_at) |
| `operations.py` | `FieldEvent` (id, cycle_id, pu_id, event_type, event_date, description, chemical_name, whd_days, quantity_used, unit, logged_by, logged_via), `HarvestLog` (id, cycle_id, pu_id, harvest_date, qty_kg, grade, price_per_kg_fjd, buyer_id, compliance_status, blocking_chemicals_json, logged_via), `IncomeLog` (id, cycle_id, pu_id, income_date, amount_fjd, income_type, notes), `LaborAttendance` (id, farm_id, worker_id, attendance_date, hours_worked, task_description, rate_fjd, logged_via), `WeatherLog` (id, farm_id, log_date, rainfall_mm, temp_min_c, temp_max_c, wind_speed_kmh, notes, logged_via) |
| `inventory.py` | `Input` (id, farm_id, input_name, input_type, unit, current_stock, reorder_point, unit_cost_fjd, supplier_id, lead_time_days), `InputTransaction` (id, input_id, farm_id, transaction_date, transaction_type, qty_change, cost_fjd, notes), `Order` (id, farm_id, supplier_id, input_id, order_date, qty_ordered, unit_cost_fjd, total_fjd, order_status, expected_delivery_date, actual_delivery_date) |
| `financial.py` | `CycleFinancials` (id, cycle_id, farm_id, cogk_fjd, total_revenue_fjd, total_labor_cost_fjd, total_input_cost_fjd, total_other_cost_fjd, gross_margin_fjd, gross_margin_pct, computed_at — materialized from view), `ProfitShare` (id, farm_id, period_month, nayans_share_pct, nayans_share_fjd, teivaka_cut_pct, teivaka_cut_fjd, base_profit_fjd), `AccountsReceivable` (id, farm_id, customer_id, cycle_id, invoice_date, amount_fjd, due_date, ar_status, paid_date), `PriceMaster` (id, production_id, market, price_fjd_per_kg, effective_date, source) |
| `people.py` | `Worker` (id, farm_id, worker_code, full_name, employment_type, phone, daily_rate_fjd, is_active, joined_date), `WorkerBookingQueue` (id, farm_id, worker_id, requested_date, task_type, status, requested_by) |
| `assets.py` | `Equipment` (id, farm_id, equipment_name, equipment_type, purchase_date, last_maintenance_date, next_maintenance_date, maintenance_interval_days, hours_used, notes), `Supplier` (id, farm_id, supplier_code, supplier_name, contact_name, phone, email, supply_category, lead_time_days, notes), `Customer` (id, farm_id, customer_code, customer_name, contact_name, phone, email, customer_type, payment_terms_days) |
| `livestock.py` | `LivestockRegister` (id, farm_id, animal_code, species, breed, sex, birth_date, purchase_date, status, notes), `HiveRegister` (id, farm_id, hive_code, hive_type, installation_date, queen_age_months, status, location_notes), `LivestockEvent` (id, animal_id, farm_id, event_date, event_type, weight_kg, notes, vet_name, cost_fjd, logged_via), `HiveLog` (id, hive_id, farm_id, log_date, log_type, honey_kg, health_score_1_5, notes, logged_via) |
| `intelligence.py` | `AutomationRule` (id, rule_id, rule_name, is_active, trigger_category, applies_to, production_id, task_type, days_after_start, frequency_days, threshold_value, comparison_operator, severity, requires_cycle, source_reference, notes), `TaskQueue` (id, farm_id, pu_id, cycle_id, rule_id, task_name, task_type, assigned_to, due_date, priority, status, completed_at, notes), `Alert` (id, farm_id, pu_id, rule_id, alert_key, alert_type, severity, status, message, raw_data_json, created_at, resolved_at, auto_resolved, escalated_at, escalation_count), `DecisionSignal` (id, farm_id, signal_name, signal_type, rag_status, score_0_10, value, target_value, unit, action_at_red, computed_at), `KpiWeekly` (id, farm_id, week_start, total_harvest_kg, total_revenue_fjd, total_labor_cost_fjd, total_input_cost_fjd, avg_cogk_fjd, active_cycles, open_alerts, tasks_completed, tasks_overdue) |
| `ai.py` | `AiCommand` (id, tenant_id, farm_id, user_id, command_type, raw_input, parsed_intent_json, tis_module_used, response_text, execution_result_json, tokens_used, latency_ms, status, created_at), `AiInsight` (id, farm_id, insight_type, title, body, rag_status, signal_ref, created_at, expires_at, dismissed), `TisConversation` (id, farm_id, user_id, channel, started_at, ended_at, message_count, summary), `TisVoiceLog` (id, farm_id, user_id, audio_url, transcript, whisper_confidence, command_id, status, error_message, created_at) |
| `community.py` | `CommunityProfile` (id, tenant_id, display_name, island, farm_type_tags, bio, is_verified), `MarketplaceListing` (id, tenant_id, production_id, quantity_kg, price_per_kg_fjd, available_date, listing_status, contact_phone, notes), `PriceIndex` (id, production_id, market, avg_price_fjd, min_price_fjd, max_price_fjd, sample_count, week_start), `CommunityPost` (id, tenant_id, post_type, title, body, tags, is_pinned, created_at) |

---

### models/schemas/

Pydantic request/response models. See `MODELS.md` for complete class definitions.

| File | Contains |
|------|---------|
| `auth.py` | LoginRequest, TokenResponse, UserResponse, ChangePasswordRequest |
| `farms.py` | FarmCreate, FarmUpdate, FarmResponse, ZoneCreate, ZoneUpdate, ZoneResponse, PUCreate, PUUpdate, PUResponse |
| `cycles.py` | CycleCreate, CycleUpdate, CycleResponse, CycleListItem, RotationValidateRequest, RotationValidationResult |
| `operations.py` | EventCreate, EventUpdate, EventResponse, HarvestCreate, HarvestResponse, IncomeCreate, IncomeResponse, LaborCreate, LaborResponse, WeatherCreate, WeatherResponse |
| `financial.py` | CycleFinancialsResponse, FarmPnLResponse, ProfitShareResponse, InputCreate, InputResponse, StockStatus |
| `intelligence.py` | AlertResponse, AlertListItem, TaskCreate, TaskResponse, TaskListItem, DecisionSignalResponse, FarmDashboard |
| `tis.py` | TisChatRequest, TisResponse, TisVoiceRequest, CommandResult |
| `common.py` | All enums, BaseResponse, SuccessResponse, ErrorResponse, PaginationMeta, ErrorDetail |

---

### services/

| File | Responsibility |
|------|---------------|
| `auth_service.py` | `create_access_token(user_id, tenant_id, role)` → JWT string. `verify_password(plain, hashed)` using bcrypt. `hash_password(plain)`. `authenticate_user(email, password, db)` → User or None. Refresh token creation and validation. Token blacklist check via Redis (`token_blacklist:{jti}`). |
| `rotation_service.py` | `validate_rotation(pu_id, proposed_production_id, proposed_planting_date, db)` → RotationValidationResult. Full 9-step algorithm (see ROTATION_ENGINE.md). `get_rotation_history(pu_id, db)`. `get_rotation_alternatives(pu_id, db)`. `submit_override_request(pu_id, reason, user_id, db)`. `approve_override(gate_id, approver_id, db)`. |
| `compliance_service.py` | `check_chemical_compliance(cycle_id, harvest_date, db)` → ComplianceResult. Queries field_events for chemical applications on the cycle in the last 90 days. For each chemical found: checks if `harvest_date < application_date + whd_days`. If any violation: returns `compliant=False, blocking_chemicals=[...]`. `get_safe_harvest_date(cycle_id, db)` → earliest date all chemicals have cleared. |
| `decision_service.py` | `compute_decision_signal(farm_id, signal_name, db)` → DecisionSignalResponse. `get_all_signals(farm_id, db)` → list of 10 signals. `get_dashboard_payload(farm_id, db)` → FarmDashboard. Signal computation formulas sourced from `core.constants.SIGNAL_DEFINITIONS`. |
| `automation_service.py` | `run_automation_engine(tenant_id, db)` → RunResult. Fetches all active rules, evaluates each by trigger_category using category-specific evaluation logic, creates tasks and alerts, runs deduplication, runs auto-resolution. Returns count of tasks created, alerts created, alerts resolved. |
| `tis_service.py` | `route_message(message, context, user, db)` → TisResponse. Intent classification: if question about crops/pests/protocols → Knowledge Broker; if question about this farm's data → Operational Interpreter; if command detected (LOG_, CHECK_, CREATE_, GET_, REPORT_) → Command Executor. Context includes farm_id, user role, conversation history. |
| `tis_kb_service.py` | `answer_knowledge_question(question, context, db)` → str. Queries `shared.kb_articles` using full-text search and semantic similarity. Assembles context chunks (max 3000 tokens). Calls Claude API with HARD instruction: "Answer only from the provided knowledge base articles. If the answer is not in the knowledge base, say so explicitly. Never hallucinate agronomy advice." Returns response text with article citations. |
| `tis_interpreter.py` | `interpret_farm_data(question, farm_id, user, db)` → str. Fetches relevant live TFOS data (alerts, cycles, CoKG, P&L, tasks) based on question topic. Assembles data context. Calls Claude API to explain the data in plain Fijian-English. Does not answer knowledge questions — redirects those to KB module. |
| `tis_executor.py` | `execute_command(command_type, params, user, db)` → CommandResult. Routes 12 command types to corresponding API service calls. `LOG_LABOR` → `labor_service.create()`. `LOG_HARVEST` → `harvests_service.create()` with auto compliance check. `CHECK_FINANCIALS` → `financial_service.get_cycle_financials()` + `decision_service.get_ckg_signal()`. `CREATE_CYCLE` → `rotation_service.validate_rotation()` then `cycles_service.create()`. All 12 command types handled. Returns structured CommandResult. |
| `voice_service.py` | `transcribe_audio(audio_url)` → str. Downloads audio from Supabase Storage URL, sends to OpenAI Whisper API (`whisper-1` model), returns transcript. `process_voice_note(audio_url, user, farm_id, db)` → TisResponse. Calls `transcribe_audio()`, stores transcript, routes to `tis_service.route_message()`. |
| `whatsapp_service.py` | `send_alert(alert_id, db)` — fetches alert, formats WhatsApp message using template for alert.rule_id, sends via Twilio WhatsApp API. `send_text(phone, message)` — raw send. `send_batch(alerts, db)` — for LOW severity batching. SMS fallback: if WhatsApp send fails, retry as SMS via Twilio SMS. Logs delivery status on alert record. |
| `financial_service.py` | `compute_cogk(cycle_id, db)` → Decimal. Formula: `(total_labor_cost + total_input_cost + total_other_cost) / total_harvest_qty_kg`. `get_cycle_financials(cycle_id, db)` → CycleFinancialsResponse. `get_farm_pnl(farm_id, period, db)` → FarmPnLResponse. `compute_profit_share(farm_id, period, db)` → ProfitShareResponse. `compute_cashflow_forecast(farm_id, db)` → 13-week forecast array. |
| `report_service.py` | `generate_weekly_kpi(farm_id, week_start, db)` → KpiReport. `generate_monthly_pnl(farm_id, month, db)` → PnLReport. `generate_cycle_report(cycle_id, db)` → CycleReport. `generate_crop_ranking(farm_id, db)` → list of CropRanking ordered by CoKG ascending (lower is better). |
| `upload_service.py` | `upload_file(file_bytes, filename, bucket, path)` → str (public URL). `strip_gps_metadata(image_bytes)` → image_bytes (strips EXIF GPS before upload — privacy). `generate_signed_url(path, expires_in=3600)` → signed URL for private files. Uses Supabase Python client. |
| `sync_service.py` | `process_sync_batch(batch_id, db)` → SyncResult. Fetches offline sync batch record. Validates each entry: schema validation, required fields, FK references exist. Deduplication: checks `(client_timestamp, pu_id, entry_type)` uniqueness. Inserts in dependency order: WeatherLog → FieldEvent → HarvestLog → IncomeLog → LaborAttendance. Returns per-entry success/failure report. |

---

### workers/

| File | Responsibility |
|------|---------------|
| `celery_app.py` | Celery app instance creation. Broker: `redis://localhost:6379/0`. Result backend: `redis://localhost:6379/1`. Task serialization: JSON. Timezone: UTC. `task_always_eager=False` in production. Autodiscovery of tasks from all worker modules. |
| `beat_schedule.py` | `CELERYBEAT_SCHEDULE` dict with all 6 cron entries. See CELERY_WORKERS.md for full schedule. |
| `automation_worker.py` | `run_automation_engine` Celery task. See CELERY_WORKERS.md. |
| `decision_worker.py` | `run_decision_engine` Celery task. See CELERY_WORKERS.md. |
| `whatsapp_worker.py` | `send_whatsapp_alert` Celery task. See CELERY_WORKERS.md. |
| `tis_worker.py` | `process_tis_command` Celery task. See CELERY_WORKERS.md. |
| `voice_worker.py` | `process_voice_command` Celery task. See CELERY_WORKERS.md. |
| `sync_worker.py` | `sync_offline_entries` Celery task. See CELERY_WORKERS.md. |
| `kpi_worker.py` | `run_weekly_kpi_snapshot` Celery task. See CELERY_WORKERS.md. |
| `maintenance_worker.py` | `check_equipment_maintenance` Celery task. Queries equipment records where next_maintenance_date is within 3 days, creates tasks and alerts via automation_service. |
| `views_worker.py` | `refresh_materialized_views` and `refresh_community_price_index` tasks. See CELERY_WORKERS.md. |

---

### core/

| File | Contents |
|------|---------|
| `security.py` | `encode_jwt(payload, secret, algorithm='HS256')` → token string. `decode_jwt(token, secret)` → payload dict or raises `InvalidTokenError`. `hash_password(plain)` → bcrypt hash string. `verify_password(plain, hashed)` → bool. JWT payload includes: `sub` (user_id), `tenant_id`, `role`, `jti` (unique token ID for blacklisting), `exp`, `iat`. |
| `exceptions.py` | Custom exception classes: `RotationBlockedError(pu_id, rotation_key, days_short, message)`, `ComplianceViolationError(cycle_id, blocking_chemicals, safe_harvest_date, message)`, `TisRateLimitError(tier, daily_limit, usage_today, message)`, `SubscriptionGateError(required_tier, current_tier, feature, message)`, `TenantNotFoundError`, `UnauthorizedError`, `ValidationError`. All extend `TFOSBaseError(HTTPException)`. |
| `constants.py` | `SUBSCRIPTION_TIERS: dict` (tier → feature list, TIS_daily_limit, max_PUs). `SEVERITY_LEVELS: list` (`['Critical','High','Medium','Low']`). `TIS_MODULES: list`. `COMMAND_TYPES: list` (12 types). `ESCALATION_RULES: dict` (`{'MEDIUM': {'days': 3, 'escalate_to': 'HIGH'}, 'HIGH': {'days': 7, 'escalate_to': 'CRITICAL'}}`). `ALERT_DEDUP_WINDOW: str` (`'week'`). `FIJI_TZ: str` (`'Pacific/Fiji'`). `F002_FARM_ID: str` (`'F002'`). `F002_FERRY_SUPPLIER_CODE: str` (`'SUP-012'`). `SIGNAL_DEFINITIONS: dict` (10 signal configs with formula refs). `WHATSAPP_TEMPLATES: dict` (27 templates keyed by rule_id). |

---

### migrations/

Alembic migrations. `env.py` imports `Base` from `models/db/__init__.py`, configures async engine from `config.py`.

| Migration | Contents |
|-----------|---------|
| `001_initial_schema.py` | Core tables: tenants, users, farms, zones, production_units |
| `002_timescale_hypertables.py` | Convert event/log tables to TimescaleDB hypertables: field_events, harvest_logs, weather_logs, labor_attendance, hive_logs, livestock_events |
| `003_rls_policies.py` | Row-Level Security policies on all tenant-scoped tables. Policy: `USING (tenant_id = current_setting('app.tenant_id')::uuid)` |
| `004_production_data.py` | Seed shared production master data (crops, livestock, forestry types) |
| `005_rotation_rules.py` | Seed 1,444 rotation rules in `shared.actionable_rules` and `shared.rotation_top_choices` |
| `006_kb_articles.py` | Seed initial KB articles in `shared.kb_articles`. Create full-text search index. |
| `007_automation_rules.py` | Seed all 43 automation rules in automation_rules table |
| `008_materialized_views.py` | Create all 11 materialized views: input_balance, farm_pnl, crop_ranking, labor_weekly_summary, harvest_reconciliation, worker_performance, livestock_summary, apiculture_summary, expansion_readiness, pu_financials, decision_signals_current |
| `009_decision_signals.py` | Create decision_signals table and signal snapshot infrastructure |
| `010_community_schema.py` | Community tables: profiles, listings, price_index, posts |
| `011_ai_tables.py` | AI tables: ai_commands, ai_insights, tis_conversations, tis_voice_logs |
| `012_financial_views.py` | Financial views: cashflow_forecast, profit_share_calc, accounts_receivable_aging |
| `013_worker_tables.py` | Worker tables: workers, worker_booking_queue |
| `014_livestock_tables.py` | Livestock: livestock_register, hive_register, livestock_events, hive_logs |
| `015_offline_sync.py` | Offline sync: sync_batch, sync_entries, conflict_log |
| `016_subscriptions.py` | Subscription tables: subscription_plans, tenant_subscriptions, billing_events |

---

### tests/

| File | What it tests |
|------|--------------|
| `conftest.py` | `pytest.fixture: test_db` — creates isolated async PostgreSQL test database using `asyncpg`. `pytest.fixture: client` — TestClient with overridden `get_db`. `pytest.fixture: seed_data` — inserts F001/F002 farms, workers W-001 through W-009, sample cycles, sample inputs. `pytest.fixture: auth_headers(role)` — generates JWT headers for FOUNDER, MANAGER, WORKER roles. |
| `test_rotation_engine.py` | Tests `rotation_service.validate_rotation()`. Covers: no previous cycle returns APPROVED. BLOCK rule with days_short > 0 returns BLOCKED. BLOCK rule with days_since > min_rest returns APPROVED. AVOID rule always returns OVERRIDE_REQUIRED. PREF rule returns APPROVED with note. Override flow end-to-end. Solanaceae family policy. F/A `OVERLAY` production. `N/A` forestry production. |
| `test_automation_engine.py` | Tests `automation_service.run_automation_engine()`. Covers: RULE-017 HarvestAlert triggers when no harvest in 7 days. RULE-017 does NOT trigger for CRP-KAV (uses 180 days). RULE-038 ChemicalCompliance blocks harvest. RULE-034 F002FerryBuffer triggers for F002 only. RULE-042 OrderStatus (was broken in v7.0 — test confirms fix). RULE-043 WorkerPerformance (was broken in v7.0 — test confirms fix). Alert deduplication prevents duplicate alerts. Auto-resolution clears alert when condition resolved. Escalation: MEDIUM → HIGH after 3 days. |
| `test_decision_engine.py` | Tests `decision_service.compute_decision_signal()`. Covers: all 10 signals compute without error. CoKG signal returns correct RAG status based on thresholds. Cash signal goes RED at negative balance. Harvest frequency signal. Signal written to decision_signals table correctly. Dashboard payload assembles all 10 signals. |
| `test_financial.py` | Tests `financial_service.compute_cogk()`. Formula: `(labor + input + other) / harvest_kg`. Covers: zero harvest (division by zero → None not exception). Multiple harvests in cycle aggregated correctly. Profit share calculation. Cashflow forecast 13-week array. |
| `test_tis.py` | Tests TIS routing. Covers: agronomy question → routes to Knowledge Broker. Farm data question → routes to Operational Interpreter. `LOG_LABOR` command → routes to Command Executor → creates labor record. `CHECK_FINANCIALS` → returns CoKG + margin. `LOG_HARVEST` with compliance violation → returns blocked message. Rate limit: FREE tier blocks after 5 requests/day. BASIC tier blocks after 20. PREMIUM: no limit. |

---

## 3. Naming Conventions

| Scope | Convention | Example |
|-------|-----------|---------|
| Files and modules | `snake_case` | `rotation_service.py`, `tis_kb_service.py` |
| Functions and methods | `snake_case` | `validate_rotation()`, `check_chemical_compliance()` |
| Classes (Pydantic, ORM, etc.) | `PascalCase` | `ProductionCycle`, `CycleFinancialsResponse` |
| Constants | `UPPER_SNAKE_CASE` | `SUBSCRIPTION_TIERS`, `F002_FERRY_SUPPLIER_CODE` |
| Enum members | `UPPER_SNAKE_CASE` | `CycleStatus.ACTIVE`, `AlertSeverity.CRITICAL` |
| URL route paths | `kebab-case` | `/production-units`, `/decision-engine` |
| Database tables | `snake_case` | `production_cycles`, `labor_attendance` |
| Database columns | `snake_case` | `cogk_fjd`, `whd_days`, `logged_via` |
| Celery task names | `module.function_name` | `workers.automation_worker.run_automation_engine` |

---

## 4. Import Conventions

**Always use absolute imports.** Never use relative imports (`from . import`, `from ..services import`).

```python
# CORRECT
from services.rotation_service import validate_rotation
from models.schemas.cycles import CycleCreate, CycleResponse
from core.exceptions import RotationBlockedError
from config import get_settings

# INCORRECT — never do this
from ..services.rotation_service import validate_rotation
from .models import CycleCreate
```

**Dependency injection via FastAPI `Depends()`:**

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from dependencies import get_current_user, require_tier
from models.db.core import User

router = APIRouter()

@router.post("/cycles")
async def create_cycle(
    body: CycleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_tier(["BASIC", "PREMIUM", "CUSTOM"])),
):
    ...
```

Never instantiate services directly inside route functions — pass `db` to service functions.

---

## 5. Config Management

All configuration lives in `config.py` via Pydantic `BaseSettings`. The `.env` file is loaded automatically. **Zero hardcoded values in any other file.**

```python
# config.py
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional

class Settings(BaseSettings):
    # Application
    APP_NAME: str = "Teivaka TFOS API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    SECRET_KEY: str  # Required — no default
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Database
    DATABASE_URL: str  # Required. asyncpg format: postgresql+asyncpg://...
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    DATABASE_POOL_TIMEOUT: int = 30

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # Celery
    CELERY_TIMEZONE: str = "UTC"
    CELERY_TASK_SERIALIZER: str = "json"
    CELERY_RESULT_SERIALIZER: str = "json"
    CELERY_ACCEPT_CONTENT: list = ["json"]

    # Claude AI
    ANTHROPIC_API_KEY: str  # Required
    CLAUDE_MODEL: str = "claude-sonnet-4-20250514"
    CLAUDE_MAX_TOKENS: int = 2048
    CLAUDE_TEMPERATURE: float = 0.3
    TIS_KB_MAX_CONTEXT_TOKENS: int = 3000

    # OpenAI Whisper
    OPENAI_API_KEY: str  # Required
    WHISPER_MODEL: str = "whisper-1"

    # Twilio WhatsApp
    TWILIO_ACCOUNT_SID: str  # Required
    TWILIO_AUTH_TOKEN: str  # Required
    TWILIO_WHATSAPP_FROM: str  # e.g. "whatsapp:+14155238886"
    TWILIO_SMS_FROM: str  # Fallback SMS number
    WHATSAPP_ALERT_PHONE_F001: str  # Laisenia Waqa / farm manager F001
    WHATSAPP_ALERT_PHONE_F002: str  # Farm manager F002

    # Supabase Storage
    SUPABASE_URL: str  # Required
    SUPABASE_SERVICE_ROLE_KEY: str  # Required
    SUPABASE_BUCKET_UPLOADS: str = "farm-uploads"
    SUPABASE_BUCKET_VOICE: str = "voice-notes"

    # Farm Constants
    F001_FARM_ID: str = "F001"
    F002_FARM_ID: str = "F002"
    F002_FERRY_SUPPLIER_CODE: str = "SUP-012"
    F002_FERRY_LEAD_TIME_DAYS: int = 7
    F002_FERRY_BUFFER_DAYS: int = 7  # Alert when stock < lead_time + 7 days

    # Subscription Limits
    FREE_TIER_MAX_PUS: int = 2
    FREE_TIER_TIS_DAILY: int = 5
    BASIC_TIER_TIS_DAILY: int = 20
    PREMIUM_TIER_TIS_DAILY: int = 999999  # Effectively unlimited

    # Rate Limiting
    RATE_LIMIT_STANDARD: int = 100  # Per minute per tenant
    RATE_LIMIT_AI: int = 10         # Per minute per tenant for AI endpoints

    # Automation
    ALERT_DEDUP_WINDOW: str = "week"
    ESCALATION_MEDIUM_DAYS: int = 3
    ESCALATION_HIGH_DAYS: int = 7
    HARVEST_GAP_DEFAULT_DAYS: int = 7     # RULE-017 default
    HARVEST_GAP_KAV_DAYS: int = 180       # RULE-017 override for CRP-KAV (Kava)

    # Decision Engine
    DECISION_SIGNAL_COUNT: int = 10
    COGK_RED_THRESHOLD_FJD: float = 4.50   # CoKG above this = RED
    COGK_AMBER_THRESHOLD_FJD: float = 3.00 # CoKG above this = AMBER
    CASH_RED_THRESHOLD_FJD: float = 0.0    # Net cash below = RED

    # Sentry (Error Monitoring)
    SENTRY_DSN: Optional[str] = None

    # CORS
    CORS_ALLOWED_ORIGINS: list = ["http://localhost:3000", "https://app.teivaka.com"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True

@lru_cache()
def get_settings() -> Settings:
    return Settings()
```

---

## 6. Complete Environment Variable Reference

All variables required in `.env.example`:

```bash
# ─── Application ──────────────────────────────────────────────────────────────
APP_NAME="Teivaka TFOS API"
APP_VERSION="1.0.0"
DEBUG=false
SECRET_KEY=your-256-bit-secret-key-here  # Generate: openssl rand -hex 32
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30

# ─── Database ─────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://tfos_user:password@localhost:5432/tfos_db
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20
DATABASE_POOL_TIMEOUT=30

# ─── Redis ────────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0
REDIS_RESULT_BACKEND=redis://localhost:6379/1

# ─── Claude AI ────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-20250514
CLAUDE_MAX_TOKENS=2048
CLAUDE_TEMPERATURE=0.3
TIS_KB_MAX_CONTEXT_TOKENS=3000

# ─── OpenAI Whisper ───────────────────────────────────────────────────────────
OPENAI_API_KEY=sk-...
WHISPER_MODEL=whisper-1

# ─── Twilio WhatsApp ──────────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_SMS_FROM=+1...
WHATSAPP_ALERT_PHONE_F001=+6799XXXXXXX  # Laisenia Waqa or F001 manager
WHATSAPP_ALERT_PHONE_F002=+6799XXXXXXX  # F002 farm manager (Kadavu)

# ─── Supabase Storage ─────────────────────────────────────────────────────────
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_BUCKET_UPLOADS=farm-uploads
SUPABASE_BUCKET_VOICE=voice-notes

# ─── Farm Constants ───────────────────────────────────────────────────────────
F001_FARM_ID=F001
F002_FARM_ID=F002
F002_FERRY_SUPPLIER_CODE=SUP-012
F002_FERRY_LEAD_TIME_DAYS=7
F002_FERRY_BUFFER_DAYS=7

# ─── Subscription Limits ──────────────────────────────────────────────────────
FREE_TIER_MAX_PUS=2
FREE_TIER_TIS_DAILY=5
BASIC_TIER_TIS_DAILY=20
PREMIUM_TIER_TIS_DAILY=999999

# ─── Rate Limiting ────────────────────────────────────────────────────────────
RATE_LIMIT_STANDARD=100
RATE_LIMIT_AI=10

# ─── Automation Engine ────────────────────────────────────────────────────────
ALERT_DEDUP_WINDOW=week
ESCALATION_MEDIUM_DAYS=3
ESCALATION_HIGH_DAYS=7
HARVEST_GAP_DEFAULT_DAYS=7
HARVEST_GAP_KAV_DAYS=180

# ─── Decision Engine ──────────────────────────────────────────────────────────
DECISION_SIGNAL_COUNT=10
COGK_RED_THRESHOLD_FJD=4.50
COGK_AMBER_THRESHOLD_FJD=3.00
CASH_RED_THRESHOLD_FJD=0.0

# ─── Error Monitoring ─────────────────────────────────────────────────────────
SENTRY_DSN=https://...@sentry.io/...

# ─── CORS ─────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS=["http://localhost:3000","https://app.teivaka.com"]
```

---

## 7. Technology Stack Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | Python | 3.12 |
| Web Framework | FastAPI | 0.115+ |
| ORM | SQLAlchemy (async) | 2.0 |
| Database | PostgreSQL + TimescaleDB | 16 |
| Cache | Redis | 7.2 |
| Task Queue | Celery | 5.4 |
| AI - Chat | Claude API (claude-sonnet-4-20250514) | latest |
| AI - Voice | OpenAI Whisper | whisper-1 |
| Notifications | Twilio WhatsApp + SMS | — |
| Storage | Supabase Storage | — |
| Frontend | React 18 PWA | 18 |
| Hosting | Hetzner CAX21 | — |
| Proxy | Caddy | 2.x |
| Migrations | Alembic | 1.13+ |
| Auth | JWT (python-jose) + bcrypt | — |
| Config | pydantic-settings | 2.x |
| Logging | structlog | — |
| Error Monitoring | Sentry | — |
| Testing | pytest + pytest-asyncio | — |
