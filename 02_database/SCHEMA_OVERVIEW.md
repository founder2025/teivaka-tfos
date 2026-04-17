# FILE: 02_database/SCHEMA_OVERVIEW.md

# Teivaka Agri-TOS — Database Schema Overview

**Platform:** Teivaka Agricultural TOS (Agri-TOS), Fiji
**Database:** PostgreSQL 16 + TimescaleDB extension
**Last Updated:** 2026-04-07
**Schema Count:** 2 top-level schemas (`shared`, `tenant`)
**Total Domains:** 16
**Total Tables:** ~110 (including materialized views and hypertables)

---

## 1. Schema Architecture — `shared` vs `tenant`

All data lives in one of two PostgreSQL schemas:

| Schema | Purpose | Multi-tenant? |
|--------|---------|--------------|
| `shared` | Platform-wide reference data, rules, knowledge base. Shared across all tenants. Never contains tenant operational data. | No — single copy |
| `tenant` | All operational farm data. Every table has `tenant_id UUID NOT NULL`. Row-Level Security (RLS) enforced at PostgreSQL level using `auth.uid()` → `tenant_id` policy. | Yes — RLS isolated |

**RLS Policy (applied to every `tenant.*` table):**
```sql
CREATE POLICY tenant_isolation ON tenant.<table>
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

Supabase Auth is used for JWT-based session management. The `tenant_id` is extracted from the JWT claim and set as a session variable before any query executes.

---

## 2. Domain Map — All 16 Domains

### Domain 01 — Farm Structure (`tenant` schema)
**Tables: 5**

| Table | Description |
|-------|-------------|
| `tenant.farms` | Top-level farm entities. Contains `farm_id`, `tenant_id`, `farm_name`, `location_text`, `island`, `profit_share_rate_pct`, `is_island_farm` (critical for RULE-034), `timezone`. |
| `tenant.zones` | Sub-farm zones/blocks within a farm. FK: `farm_id`. |
| `tenant.production_units` | Individual planting units (PUs). FK: `zone_id`, `farm_id`. Contains `pu_id`, `area_m2`, `soil_type`, `current_production_id`. |
| `tenant.farm_settings` | Per-farm configuration key-value pairs. FK: `farm_id`. |
| `tenant.farm_supply_config` | Supply chain config per farm — ferry lead times, preferred suppliers, buffer_days. FK: `farm_id`. Critical for F002 (Kadavu Island). |

**Key instances:** F001 (Save-A-Lot, Korovou Serua), F002 (Viyasiyasi, Kadavu Island — `is_island_farm=true`)

---

### Domain 02 — Production Cycles (`tenant` schema)
**Tables: 6**

| Table | Description |
|-------|-------------|
| `tenant.production_cycles` | Core cycle entity. FK: `pu_id`, `production_id` (→ `shared.productions`). Contains `cycle_id`, `status` (PLANNED/ACTIVE/HARVESTING/COMPLETED/ABANDONED), `planting_date`, `expected_harvest_date`, `actual_harvest_end`, `notes`. |
| `tenant.cycle_financials` | Aggregated financial summary per cycle. FK: `cycle_id`. Contains `total_labor_cost`, `total_input_cost`, `total_other_cost`, `total_revenue`, `cog_per_kg`, `gross_margin_pct`. Updated by triggers on harvest/labor/input events. |
| `tenant.profit_share` | Profit share records per cycle per party. FK: `cycle_id`. Contains `party_name`, `share_pct`, `share_amount_fjd`, `is_related_party`. |
| `tenant.cycle_notes` | Free-text notes attached to a cycle, timestamped. FK: `cycle_id`. |
| `tenant.cycle_overrides` | Records of rotation override approvals. FK: `cycle_id`. Contains `override_reason`, `approved_by_role`, `approved_at`. |
| `tenant.override_log` | Immutable audit log for any override action. FK: `cycle_id`, `farm_id`. Contains `action`, `actor_user_id`, `actor_role`, `timestamp`, `before_state_json`, `after_state_json`. |

**Key instances:** CY-F001-26-001 (CRP-CAS), CY-F001-26-002 (CRP-EGG), CY-F001-26-003 (CRP-EGG), CY-F002-26-010 (FRT-PIN), CY-F001-26-011 (LIV-API), CY-F002-25-001 (CRP-KAV), CY-F002-25-002 (CRP-KAV)

---

### Domain 03 — Field Events & Harvest (`tenant` schema, TimescaleDB hypertables)
**Tables: 4**

| Table | Description |
|-------|-------------|
| `tenant.field_events` | **TimescaleDB hypertable** — all field activity logs (planting, fertilizing, spraying, watering, scouting, pruning). Partitioned by `event_date`, 7-day chunks. FK: `cycle_id`, `pu_id`, `farm_id`. |
| `tenant.harvest_log` | **TimescaleDB hypertable** — individual harvest records. Partitioned by `harvest_date`, 7-day chunks. FK: `cycle_id`, `pu_id`. Contains `harvest_qty_kg`, `grade`, `price_per_kg_fjd`, `harvest_date`. |
| `tenant.chemical_applications` | Log of every pesticide/fungicide/herbicide application. FK: `cycle_id`, `pu_id`, `chemical_id` (→ `shared.chemical_library`). Contains `application_date`, `dose_ml_per_litre`, `applied_by_worker_id`. Used by compliance engine to compute WHD expiry. |
| `tenant.nursery_batches` | Nursery tray/batch tracking. FK: `farm_id`, `production_id`. Contains `batch_id`, `sow_date`, `expected_transplant_date`, `qty_trays`, `status`. |

---

### Domain 04 — Labor (`tenant` schema)
**Tables: 4**

| Table | Description |
|-------|-------------|
| `tenant.workers` | Worker registry. FK: `tenant_id`. Contains `worker_id`, `full_name`, `phone_whatsapp`, `role`, `pay_rate_fjd_hr`, `is_active`. |
| `tenant.labor_attendance` | **TimescaleDB hypertable** — daily attendance and hours worked. Partitioned by `work_date`, 7-day chunks. FK: `worker_id`, `farm_id`, `cycle_id`. Contains `hours_worked`, `task_type`, `pay_amount_fjd`. |
| `tenant.labor_weekly_summary` | **Materialized view** — weekly labor cost aggregates per farm per worker. Refreshed daily at 5am Fiji. |
| `tenant.worker_performance` | **Materialized view** — rolling 30-day performance metrics per worker. Refreshed daily at 5am Fiji. |

**Key instances:** W-001 Laisenia Waqa, W-002 Maika Ratubaba, W-003 Maciu Tuilau

---

### Domain 05 — Inputs & Inventory (`tenant` schema)
**Tables: 5**

| Table | Description |
|-------|-------------|
| `tenant.inputs` | Input master registry (fertilizers, seeds, chemicals, tools). FK: `supplier_id` (→ `tenant.suppliers`). Contains `input_id`, `input_type`, `unit`, `reorder_point`, `current_stock`, `unit_cost_fjd`. |
| `tenant.input_transactions` | Every stock movement (purchase IN, application OUT, adjustment). FK: `input_id`, `cycle_id`. Contains `transaction_type`, `qty_change`, `cost_fjd`, `transaction_date`. |
| `tenant.input_balance` | **Materialized view** — real-time running balance per input. Computed from `input_transactions`. Refreshed every 30 minutes (most critical refresh schedule — drives RULE-012 inventory alerts). |
| `tenant.suppliers` | Supplier registry. Contains `supplier_id`, `supplier_name`, `contact_phone`, `lead_time_days`, `is_ferry_dependent`. |
| `tenant.purchase_orders` | PO tracking for planned input purchases. FK: `supplier_id`, `input_id`. |

**Key instances:** INP-FERT-NPK (NPK Fertilizer), INP-CHEM-DIM (Dimethoate), INP-SEED-EGG (Eggplant Seed)
**Key suppliers:** SUP-001 Hop Tiy & Co, SUP-012 Sea Master Shipping (ferry — CRITICAL for F002)

---

### Domain 06 — Finance (`tenant` schema)
**Tables: 6**

| Table | Description |
|-------|-------------|
| `tenant.cash_ledger` | **TimescaleDB hypertable** — every cash transaction (income + expense). Partitioned by `txn_date`, 7-day chunks. FK: `farm_id`, `cycle_id` (optional), `customer_id` (optional). Contains `txn_type`, `amount_fjd`, `category`, `description`. |
| `tenant.income_log` | Sales income records. FK: `cycle_id`, `customer_id`, `harvest_log_id`. Contains `qty_kg`, `price_per_kg_fjd`, `total_fjd`, `sale_date`, `is_related_party`. |
| `tenant.delivery_log` | Delivery tracking — kg dispatched to customer. FK: `cycle_id`, `customer_id`. |
| `tenant.accounts_receivable` | Outstanding receivables per customer. FK: `customer_id`, `income_log_id`. |
| `tenant.farm_pnl` | **Materialized view** — farm-level P&L aggregation. Refreshed every hour. Contains `total_revenue`, `total_cost`, `gross_profit`, `gross_margin_pct` per farm per period. |
| `tenant.pu_financials` | **Materialized view** — P&L broken down by production unit. Refreshed every hour. |

**Key customers:** CUS-001 New World, CUS-003 Nayans-Kalsa (related party — `is_related_party=true`), CUS-012 Paradiso Restaurant
**Currency:** FJD throughout. No currency conversion layer required.

---

### Domain 07 — Customers (`tenant` schema)
**Tables: 3**

| Table | Description |
|-------|-------------|
| `tenant.customers` | Customer registry. Contains `customer_id`, `customer_name`, `is_related_party`, `contact_phone`, `preferred_delivery_day`, `payment_terms_days`. |
| `tenant.customer_price_agreements` | Per-customer price agreements by production type. FK: `customer_id`, `production_id`. Contains `agreed_price_fjd_kg`, `grade`, `valid_from`, `valid_to`. |
| `tenant.customer_orders` | Order management. FK: `customer_id`, `cycle_id`. |

---

### Domain 08 — Alerts & Task Queue (`tenant` schema)
**Tables: 4**

| Table | Description |
|-------|-------------|
| `tenant.alerts` | All system-generated alerts. FK: `farm_id`, `pu_id` (optional), `cycle_id` (optional), `rule_id`. Contains `alert_id`, `tenant_id`, `alert_key` (UNIQUE per tenant for deduplication), `rule_id`, `severity` (Critical/High/Medium/Low), `status` (open/resolved/dismissed), `title`, `body_json`, `auto_resolved`, `created_at`, `resolved_at`. |
| `tenant.alert_history` | Immutable log of all status changes on alerts. FK: `alert_id`. |
| `tenant.task_queue` | Async task dispatch queue for Celery workers. FK: `alert_id` (optional), `farm_id`. Contains `task_type`, `payload_json`, `status`, `retry_count`, `scheduled_at`. |
| `tenant.notification_log` | Log of every WhatsApp/SMS notification sent. FK: `alert_id`, `farm_id`. Contains `channel`, `recipient_phone`, `message_preview`, `delivery_status`, `sent_at`. |

---

### Domain 09 — Automation Rules (`shared` schema)
**Tables: 3**

| Table | Description |
|-------|-------------|
| `shared.automation_rules` | Master registry of all 43 automation rules. Contains `rule_id` (e.g., RULE-017), `rule_name`, `description`, `trigger_condition_sql`, `severity_default`, `check_frequency`, `is_active`, `subscription_tier_required`. |
| `shared.rule_parameters` | Configurable parameters per rule. FK: `rule_id`. Contains `param_key`, `param_value_default`, `param_value_override_json` (for per-farm overrides). |
| `tenant.rule_overrides` | Per-tenant/per-farm rule parameter overrides. FK: `rule_id`, `farm_id`. |

---

### Domain 10 — Rotation Engine (`shared` schema)
**Tables: 4**

| Table | Description |
|-------|-------------|
| `shared.productions` | Master production type registry. Contains `production_id` (e.g., CRP-EGG), `production_name`, `family` (botanical), `category` (CRP/LIV/FOR/FRT), `min_rest_days_same_family`, `cycle_duration_days`, `inactivity_alert_days`. |
| `shared.actionable_rules` | All rotation pair rules. Contains `current_production_id`, `next_production_id`, `rule_status` (PREF/OK/AVOID/BLOCK/COND/OVERLAY/N/A), `min_rest_days`, `notes`. **O(1) lookup via composite index.** |
| `shared.rotation_top_choices` | Recommended next crops per production type. FK: `current_production_id`. Contains `recommended_production_id`, `rank`, `rationale`. Used to populate `alternatives` list in blocked/avoided rotation responses. |
| `shared.production_families` | Botanical family registry with default rest periods. Contains `family_name`, `default_rest_days`. |

**Key productions:** CRP-EGG (Eggplant, Solanaceae, 60-day rest), CRP-CAS (Cassava, Euphorbiaceae, 180-day rest), CRP-KAV (Kava, 4-year cycle, `inactivity_alert_days=180`), FRT-PIN (Pineapple), LIV-API (Apiculture — `rule_status=OVERLAY`)

---

### Domain 11 — Decision Engine (`tenant` schema)
**Tables: 4**

| Table | Description |
|-------|-------------|
| `tenant.decision_signals` | Stored snapshots of all 10 decision signals per farm per day. FK: `farm_id`. Contains `snapshot_date`, `signal_name`, `rag_status` (GREEN/AMBER/RED), `score`, `value_json`, `computed_at`. **NEVER computed on-demand — only from daily 6:05am Fiji cron.** |
| `tenant.decision_snapshots` | Daily aggregated farm health snapshot. FK: `farm_id`. Contains `snapshot_date`, `overall_rag`, `overall_score`, `signal_breakdown_json`, `ai_summary_text`. |
| `tenant.decision_signals_current` | **Materialized view** — latest snapshot per farm per signal. Refreshed after decision engine run (6:05am daily). |
| `tenant.expansion_readiness` | **Materialized view** — expansion readiness score per farm. Refreshed every 4 hours. |

---

### Domain 12 — Weather (`tenant` schema)
**Tables: 2**

| Table | Description |
|-------|-------------|
| `tenant.weather_log` | **TimescaleDB hypertable** — weather readings per farm. Partitioned by `reading_date`, 7-day chunks. FK: `farm_id`. Contains `temp_celsius`, `rainfall_mm`, `humidity_pct`, `wind_kmh`, `weather_source`. |
| `tenant.weather_stress_events` | Identified weather stress events (cyclone warnings, drought flags, flood risk). FK: `farm_id`. Contains `stress_type`, `severity`, `start_date`, `end_date`, `notes`. |

---

### Domain 13 — Livestock & Apiculture (`tenant` schema)
**Tables: 4**

| Table | Description |
|-------|-------------|
| `tenant.livestock_cycles` | Livestock cycle records. FK: `pu_id`, `production_id`. |
| `tenant.apiculture_hives` | Hive registry for beekeeping cycles. FK: `farm_id`. Contains `hive_id`, `hive_status`, `last_inspection_date`, `honey_yield_kg_last`. |
| `tenant.livestock_summary` | **Materialized view** — livestock stock summary per farm. Refreshed daily at 5am Fiji. |
| `tenant.apiculture_summary` | **Materialized view** — apiculture metrics per farm. Refreshed daily at 5am Fiji. |

---

### Domain 14 — TIS (Voice & AI Layer) (`tenant` schema)
**Tables: 5**

| Table | Description |
|-------|-------------|
| `tenant.tis_voice_logs` | Raw voice message metadata from WhatsApp (Twilio). FK: `farm_id`. Contains `voice_log_id`, `from_phone`, `media_url`, `whisper_transcript`, `duration_sec`, `received_at`. |
| `tenant.ai_commands` | Parsed AI command intents from TIS. FK: `voice_log_id` (optional), `farm_id`. Contains `command_type`, `parsed_intent_json`, `confidence_score`, `executed`, `execution_result_json`. |
| `tenant.tis_conversations` | Multi-turn conversation context per user/farm. FK: `farm_id`. Contains `session_id`, `messages_json` (array of role/content), `last_activity_at`, `context_summary`. |
| `tenant.tis_feedback` | User feedback on TIS responses (thumbs up/down + optional text). FK: `ai_command_id`. |
| `tenant.kb_queries` | Log of knowledge base queries for analytics. FK: `farm_id`. Contains `query_text`, `embedding_vector`, `top_result_ids`, `was_helpful`. |

---

### Domain 15 — Knowledge Base (`shared` schema)
**Tables: 3**

| Table | Description |
|-------|-------------|
| `shared.kb_articles` | Knowledge base articles for RAG retrieval. Contains `article_id`, `title`, `content_text`, `category`, `tags`, `embedding_vector` (pgvector, 1536 dimensions), `last_updated`. |
| `shared.kb_article_versions` | Version history for KB articles. FK: `article_id`. |
| `shared.kb_categories` | KB category taxonomy. |

---

### Domain 16 — Subscription & Multi-tenancy (`shared` schema)
**Tables: 4**

| Table | Description |
|-------|-------------|
| `shared.tenants` | Tenant registry. Contains `tenant_id`, `tenant_name`, `subscription_tier` (FREE/BASIC/PREMIUM/CUSTOM), `founder_user_id`, `created_at`, `is_active`. |
| `shared.subscription_tiers` | Feature gating configuration per tier. Contains `tier_name`, `max_farms`, `max_pus`, `decision_engine_enabled`, `tis_enabled`, `ai_advisor_enabled`, `api_access`. |
| `shared.user_roles` | Role assignments per user per tenant. FK: `tenant_id`. Contains `user_id`, `role` (FOUNDER/MANAGER/WORKER/VIEWER), `farm_access_json`. |
| `shared.audit_log` | Platform-wide immutable audit log. Contains `log_id`, `tenant_id`, `user_id`, `action`, `resource_type`, `resource_id`, `timestamp`, `ip_address`, `change_json`. |

---

## 3. Key Foreign Key Relationships (Dependency Graph)

```
shared.tenants
  └── tenant.farms (tenant_id)
        └── tenant.zones (farm_id)
              └── tenant.production_units (zone_id, farm_id)
                    └── tenant.production_cycles (pu_id)
                          │── tenant.field_events (cycle_id, pu_id)
                          │── tenant.harvest_log (cycle_id, pu_id)
                          │── tenant.labor_attendance (cycle_id)
                          └── tenant.cycle_financials (cycle_id)
                                └── tenant.profit_share (cycle_id)

shared.productions
  └── tenant.production_cycles (production_id)

shared.actionable_rules
  └── [lookup: current_production_id, next_production_id] → validate_rotation()

tenant.inputs
  └── tenant.input_transactions (input_id)
        └── [aggregated by] tenant.input_balance (mat view)

tenant.workers
  └── tenant.labor_attendance (worker_id)

tenant.customers
  ├── tenant.income_log (customer_id)
  ├── tenant.delivery_log (customer_id)
  └── tenant.accounts_receivable (customer_id)

shared.automation_rules
  └── tenant.alerts (rule_id)
        └── tenant.task_queue (alert_id)

shared.chemical_library
  └── tenant.chemical_applications (chemical_id)
        └── [compliance engine reads] → blocks harvest if within WHD

tenant.tis_voice_logs
  └── tenant.ai_commands (voice_log_id)
        └── tenant.tis_conversations (session context)

shared.kb_articles (embedding_vector)
  └── [pgvector cosine search] → tenant.kb_queries (results)
```

---

## 4. Index Strategy

### Universal Indexes (every `tenant.*` operational table)

```sql
-- Tenant isolation — applied to EVERY tenant.* table
CREATE INDEX idx_{table}_tenant_id ON tenant.{table}(tenant_id);

-- Farm scoping — applied to every table with farm_id column
CREATE INDEX idx_{table}_farm_id ON tenant.{table}(farm_id);
```

### Production Cycles Indexes

```sql
CREATE INDEX idx_cycles_pu_id        ON tenant.production_cycles(pu_id);
CREATE INDEX idx_cycles_status       ON tenant.production_cycles(status);
CREATE INDEX idx_cycles_planting_date ON tenant.production_cycles(planting_date);
-- Composite for common query pattern
CREATE INDEX idx_cycles_farm_status  ON tenant.production_cycles(farm_id, status)
  WHERE status IN ('ACTIVE', 'HARVESTING', 'PLANNED');
```

### Alerts Indexes

```sql
CREATE INDEX idx_alerts_farm_status ON tenant.alerts(farm_id, status);
-- UNIQUE constraint drives deduplication — prevents duplicate alerts same week
CONSTRAINT uq_alerts_dedup UNIQUE (tenant_id, alert_key);
```

### TimescaleDB Chunk Indexes (auto-created + explicit)

```sql
-- harvest_log: primary time-series access pattern
CREATE INDEX idx_harvest_pu_date ON tenant.harvest_log(pu_id, harvest_date DESC);

-- field_events: primary time-series access pattern
CREATE INDEX idx_events_pu_date ON tenant.field_events(pu_id, event_date DESC);

-- labor_attendance: daily cost queries
CREATE INDEX idx_attendance_worker_date ON tenant.labor_attendance(worker_id, work_date DESC);

-- cash_ledger: financial period queries
CREATE INDEX idx_ledger_farm_date ON tenant.cash_ledger(farm_id, txn_date DESC);

-- chemical_applications: WHD compliance lookups
CREATE INDEX idx_chem_app_pu_date ON tenant.chemical_applications(pu_id, application_date DESC);
```

### Rotation Engine Indexes (shared schema)

```sql
-- O(1) rotation rule lookup — most performance-critical index in the system
-- Used by validate_rotation() on every cycle creation/update
CREATE INDEX idx_rotation_lookup ON shared.actionable_rules(current_production_id, next_production_id);

-- Top choices lookup for alternatives
CREATE INDEX idx_rotation_choices ON shared.rotation_top_choices(current_production_id, rank);
```

### Knowledge Base Vector Index

```sql
-- ivfflat index — approximate nearest neighbor for RAG queries
-- 100 lists = appropriate for ~10,000 article dataset
CREATE INDEX idx_kb_embedding ON shared.kb_articles
  USING ivfflat (embedding_vector vector_cosine_ops)
  WITH (lists = 100);
```

### Decision Signals Index

```sql
CREATE INDEX idx_signals_farm_date ON tenant.decision_signals(farm_id, snapshot_date DESC);
CREATE INDEX idx_signals_current   ON tenant.decision_signals_current(farm_id, signal_name);
```

---

## 5. TimescaleDB Hypertables

Five tables are converted to TimescaleDB hypertables. All partition by time with **7-day chunks** (optimal for Fiji farm write patterns — predominantly daily ingest).

| Hypertable | Partition Column | Chunk Interval | Retention Policy |
|-----------|-----------------|----------------|-----------------|
| `tenant.field_events` | `event_date` | 7 days | 5 years |
| `tenant.harvest_log` | `harvest_date` | 7 days | 10 years |
| `tenant.cash_ledger` | `txn_date` | 7 days | 10 years |
| `tenant.weather_log` | `reading_date` | 7 days | 3 years |
| `tenant.labor_attendance` | `work_date` | 7 days | 5 years |

**Setup SQL (per hypertable):**
```sql
SELECT create_hypertable(
  'tenant.field_events',
  'event_date',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);
```

**Compression Policy (for data > 30 days old):**
```sql
ALTER TABLE tenant.harvest_log SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'pu_id'
);
SELECT add_compression_policy('tenant.harvest_log', INTERVAL '30 days');
```

---

## 6. Materialized View Refresh Schedule

All materialized views are refreshed by Celery Beat scheduled tasks (not pg_cron), running in Fiji timezone (UTC+12).

| Materialized View | Schema | Refresh Frequency | Rationale |
|------------------|--------|-------------------|-----------|
| `input_balance` | `tenant` | Every 30 minutes | Inventory is operationally critical — RULE-012 reads this |
| `farm_pnl` | `tenant` | Every 1 hour | Financial dashboard freshness |
| `crop_ranking` | `tenant` | Every 1 hour | Affects expansion recommendations |
| `pu_financials` | `tenant` | Every 1 hour | Per-PU cost breakdown freshness |
| `harvest_reconciliation` | `tenant` | Every 2 hours | Loss gap calculations for RULE-036 |
| `expansion_readiness` | `tenant` | Every 4 hours | Score is slow-moving |
| `labor_weekly_summary` | `tenant` | Daily at 5:00am Fiji | Weekly aggregates, once-daily is sufficient |
| `worker_performance` | `tenant` | Daily at 5:00am Fiji | 30-day rolling, once-daily is sufficient |
| `livestock_summary` | `tenant` | Daily at 5:00am Fiji | Livestock checks once daily |
| `apiculture_summary` | `tenant` | Daily at 5:00am Fiji | Apiculture checks once daily |
| `decision_signals_current` | `tenant` | After decision engine run (~6:05am Fiji daily) | Only meaningful after new signals are computed |

**Celery Beat Schedule Entry (example):**
```python
# In celery_config.py beat_schedule:
"refresh-input-balance": {
    "task": "tasks.db.refresh_materialized_view",
    "schedule": crontab(minute="*/30"),
    "args": ["tenant.input_balance"],
},
"refresh-decision-signals-current": {
    "task": "tasks.db.refresh_materialized_view",
    "schedule": crontab(hour=6, minute=10),  # After 6:05am engine run
    "args": ["tenant.decision_signals_current"],
},
```

---

## 7. Alembic Migration Strategy

Migrations are run in **dependency order** — shared/reference data first, then tenant operational tables. 16 numbered migrations, one per domain.

| Migration | Domain | Key Operations |
|----------|--------|----------------|
| `001_initial_schemas.py` | Infrastructure | Create `shared` and `tenant` PostgreSQL schemas; install TimescaleDB extension; install pgvector extension; create `shared.tenants`, `shared.subscription_tiers`. |
| `002_shared_reference_data.py` | Shared Reference | Create `shared.productions`, `shared.production_families`, `shared.chemical_library`, `shared.kb_categories`. No tenant data yet. |
| `003_farm_structure.py` | Domain 01 | Create `tenant.farms`, `tenant.zones`, `tenant.production_units`, `tenant.farm_settings`, `tenant.farm_supply_config`. Apply RLS policies. |
| `004_rotation_engine.py` | Domain 10 | Create `shared.actionable_rules`, `shared.rotation_top_choices`. Create `idx_rotation_lookup` composite index. Seed rotation rules for all production types. |
| `005_production_cycles.py` | Domain 02 | Create `tenant.production_cycles`, `tenant.cycle_financials`, `tenant.profit_share`, `tenant.cycle_notes`, `tenant.cycle_overrides`, `tenant.override_log`. |
| `006_field_events_harvest.py` | Domain 03 | Create `tenant.field_events` (hypertable), `tenant.harvest_log` (hypertable), `tenant.chemical_applications`, `tenant.nursery_batches`. Create chunk indexes. Enable compression policies. |
| `007_labor.py` | Domain 04 | Create `tenant.workers`, `tenant.labor_attendance` (hypertable). Create materialized views `tenant.labor_weekly_summary`, `tenant.worker_performance`. |
| `008_inputs_inventory.py` | Domain 05 | Create `tenant.inputs`, `tenant.input_transactions`, `tenant.suppliers`, `tenant.purchase_orders`. Create materialized view `tenant.input_balance`. |
| `009_finance.py` | Domain 06 | Create `tenant.cash_ledger` (hypertable), `tenant.income_log`, `tenant.delivery_log`, `tenant.accounts_receivable`. Create materialized views `tenant.farm_pnl`, `tenant.pu_financials`. |
| `010_customers.py` | Domain 07 | Create `tenant.customers`, `tenant.customer_price_agreements`, `tenant.customer_orders`. Set `is_related_party=true` default for CUS-003 through CUS-007 seed data. |
| `011_alerts_automation.py` | Domain 08/09 | Create `tenant.alerts` with UNIQUE(tenant_id, alert_key) constraint. Create `tenant.alert_history`, `tenant.task_queue`, `tenant.notification_log`. Create `shared.automation_rules`, `shared.rule_parameters`, `tenant.rule_overrides`. Seed all 43 rules. |
| `012_decision_engine.py` | Domain 11 | Create `tenant.decision_signals`, `tenant.decision_snapshots`. Create materialized views `tenant.decision_signals_current`, `tenant.expansion_readiness`. |
| `013_weather.py` | Domain 12 | Create `tenant.weather_log` (hypertable), `tenant.weather_stress_events`. |
| `014_livestock_apiculture.py` | Domain 13 | Create `tenant.livestock_cycles`, `tenant.apiculture_hives`. Create materialized views `tenant.livestock_summary`, `tenant.apiculture_summary`. |
| `015_tis_voice_ai.py` | Domain 14 | Create `tenant.tis_voice_logs`, `tenant.ai_commands`, `tenant.tis_conversations`, `tenant.tis_feedback`, `tenant.kb_queries`. |
| `016_knowledge_base.py` | Domain 15 | Create `shared.kb_articles` with pgvector `embedding_vector` column. Create `ivfflat` index with 100 lists (cosine distance). Create `shared.kb_article_versions`. |

**Alembic execution command:**
```bash
alembic upgrade head
```

Migrations are **idempotent** — all use `IF NOT EXISTS` guards. The migration runner checks current revision before applying.

**Important migration notes:**
- Migration 001 must run as a superuser (TimescaleDB and pgvector require extension creation privileges).
- Migrations 003 onwards must set `search_path = tenant, shared, public` for correct schema resolution.
- RLS policies are created in the same migration as their tables (not deferred).
- Seed data for `shared.*` tables is embedded in the migration that creates the table — no separate seed scripts.
- The `shared.actionable_rules` seed in migration 004 includes all Solanaceae BLOCK rules (CRP-EGG↔CRP-EGG, CRP-EGG↔CRP-TOM, CRP-TOM↔CRP-EGG, CRP-TOM↔CRP-TOM, CRP-EGG↔CRP-CAP, etc.) with `min_rest_days=60`.

---

## 8. Chemical Compliance — 2-Layer Enforcement

Chemical compliance (withholding period enforcement) operates at two layers to prevent any bypass:

**Layer 1 — PostgreSQL Trigger:**
```sql
CREATE OR REPLACE FUNCTION check_chemical_compliance()
RETURNS TRIGGER AS $$
DECLARE
    v_last_application DATE;
    v_whd_days INTEGER;
BEGIN
    -- Get most recent chemical application for this PU
    SELECT application_date, c.withholding_days
    INTO v_last_application, v_whd_days
    FROM tenant.chemical_applications ca
    JOIN shared.chemical_library c ON ca.chemical_id = c.chemical_id
    WHERE ca.pu_id = NEW.pu_id
      AND ca.tenant_id = NEW.tenant_id
      AND ca.application_date = (
          SELECT MAX(application_date)
          FROM tenant.chemical_applications
          WHERE pu_id = NEW.pu_id AND tenant_id = NEW.tenant_id
      );

    IF v_last_application IS NOT NULL
       AND NEW.harvest_date < (v_last_application + v_whd_days * INTERVAL '1 day') THEN
        RAISE EXCEPTION 'COMPLIANCE_BLOCK: Chemical withholding period active. Safe date: %',
            v_last_application + v_whd_days * INTERVAL '1 day';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_harvest_compliance
BEFORE INSERT ON tenant.harvest_log
FOR EACH ROW EXECUTE FUNCTION check_chemical_compliance();
```

**Layer 2 — API-level compliance_service check:**
Before the INSERT reaches the database, `compliance_service.check_harvest_compliance(pu_id, harvest_date)` queries `chemical_applications` and raises a `400 ComplianceError` with safe date information. The API returns the block before the DB trigger can fire.

**WHD reference:** CHEM-001 Dimethoate = 7 days, CHEM-002 Mancozeb = 7 days, CHEM-003 Cypermethrin = 7 days.

---

## 9. CoKG — Primary Financial Metric

CoKG (Cost per Kilogram) is the primary financial metric across the system.

```
CoKG = (TotalLaborCost + TotalInputCost + TotalOtherCost) / TotalHarvestQty_kg
```

**Implementation:** `cycle_financials.cog_per_kg` is a generated column updated by a PostgreSQL trigger that fires on INSERT/UPDATE to `harvest_log`, `labor_attendance`, and `input_transactions` for the same `cycle_id`. Returns NULL when `TotalHarvestQty_kg = 0` to avoid division by zero.

---

## 10. Key Business Rule Constraints in Schema

| Rule | Schema Constraint |
|------|------------------|
| Solanaceae 60-day rest | `shared.actionable_rules` BLOCK rows + DB trigger on `production_cycles` INSERT |
| Kava 4-year cycle duration | `shared.productions.cycle_duration_days = 1460` for CRP-KAV |
| Kava inactivity alert | `shared.productions.inactivity_alert_days = 180` for CRP-KAV (not 7) |
| F002 ferry buffer | `tenant.farms.is_island_farm = true` for F002; `shared.automation_rules` RULE-034 reads this flag |
| Alert deduplication | `UNIQUE(tenant_id, alert_key)` on `tenant.alerts` |
| Override requires FOUNDER | CHECK constraint or application-level enforcement; `override_log.actor_role` recorded |
| Related party sales | `tenant.customers.is_related_party` flag; `income_log.is_related_party` denormalized copy |
| Subscription feature gating | `shared.subscription_tiers` checked in API middleware before feature access |
