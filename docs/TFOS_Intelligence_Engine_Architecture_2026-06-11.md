# TFOS Agricultural Intelligence Engine — Architecture & Implementation Program

**Status:** Architecture (decision document). NOT a single build — a sequenced 12–24 month program.
**Date:** 2026-06-11 · **Author:** Claude Code session, Founder-directed
**Scope:** Turn Teivaka into the agricultural intelligence infrastructure layer for Fiji → Pacific → global.

---

## 0. THE BLUNT ASSESSMENT (read this first)

This prompt describes a national agricultural data infrastructure. Most of it is real and
worth building. But three hard truths shape the plan:

1. **Most "intelligence" tables would be EMPTY for months or years** because their data has
   no source yet: weather (no feed), soil (no lab pipeline), market prices (thin crowdsourced
   data), geographic hierarchy (no Fiji village registry loaded). Building 15 empty schemas
   to look complete is the fake-surface trap at national scale. We build the SPINE now
   (so no rebuild), and light up each dome as its data source becomes real.

2. **The moat is NOT collecting everything — it's the verifiable, consented, aggregated
   layer.** Anyone can scrape farmer data. Only Teivaka has hash-chained, farmer-consented,
   k-anonymized agricultural records that a ministry can legally buy and a bank can legally
   underwrite against. The Covenant IS the moat. Every "capture more" instinct must pass
   Covenant §3 or it becomes a liability, not an asset.

3. **The single highest-leverage build is the EVENT SPINE**, not any dashboard. One
   append-only analytics event stream that every module writes to. Get that right and every
   future dashboard, AI model, and report is a query — not a new integration. Get it wrong
   and you rebuild forever. This is deliverable #4 and it comes first.

What already exists (do not rebuild): `audit.events` (hash-chained business events),
`community.intel_snapshots` + `/admin/intelligence` (production/people/commerce/engagement),
`community.activity_days` + `metric_events` (DAU/WAU/MAU, visits, installs), the Growth KPI
board, feature flags, the Covenant §3 external-report k-anonymity engine.

---

## 1. ADMIN INFORMATION ARCHITECTURE (deliverable 1)

The Admin Command Center is the single source of truth. Final section map:

```
Admin Command Center (FOUNDER/ADMIN gated)
├── Overview
│   ├── Dashboard (live KPI tiles + queues — BUILT)
│   └── System Health (was "Control Room" — infra/container/chain status)
├── People        — Users · Verifications · Tier requests
├── Content       — Moderation · Classroom · Library submissions
├── Commerce      — Affiliate console · (future) Orders · Settlements
├── Intelligence  — Growth · Production · People · Commerce · Engagement (BUILT)
│                   + (future) Geographic · Weather · Soil · Pest/Disease · Market domes
├── Platform      — Feature flags · Admin access · Settings · Task Engine
└── Founder War Room (FOUNDER-only, stricter than ADMIN — deliverable 9)
```

**Rename done:** "Control Room" → the admin area is "Admin Command Center"; the legacy
Control-Room nav item is relabeled "System Health" (its real function: infra/chain status).
Route `/admin/control-room` preserved (no dead links).

---

## 2. DATABASE SCHEMA RECOMMENDATIONS (deliverable 2)

**Principle: a reference-data spine + a fact spine, both designed once so AI never forces a rebuild.**

### Geographic spine (reference — load Fiji registry once)
```
shared.geo_regions (
  region_id, level ENUM('COUNTRY','DIVISION','PROVINCE','DISTRICT','TIKINA','VILLAGE'),
  name, parent_region_id FK→self, centroid_lat, centroid_lng, code )
```
Then `tenant.farms.region_id FK→geo_regions` (village level). This single FK makes EVERY
roll-up (National → Province → … → Field) a recursive CTE — no per-report geo logic.
**Blocker:** needs the Fiji Bureau of Statistics / iTaukei Lands geographic dataset loaded.
Until then farms carry free-text `location_island` (today's reality) + optional lat/lng.

### Fact spine (the relational intelligence model — deliverable 5)
The Field is the atom. Everything hangs off `tenant.production_cycles` (the field-season):
```
production_cycle ──< field_events (planting, input, scouting, harvest — EXISTS as field_events)
                 ──< harvest_log (yield, grade — EXISTS)
                 ──< input_transactions (seed/fert/chem cost — EXISTS)
                 ──< (NEW) cycle_observations (soil sample, pest sighting, weather snapshot)
                 ──> shared.productions (crop) · shared.crop_varieties (variety — EXISTS)
                 ──> tenant.farms ──> geo_regions
```
Every fact row carries `cycle_id`, `farm_id`, `region_id`, `occurred_at`, `tenant_id`.
That 5-key shape is what makes any future model (yield, disease, credit) a JOIN, not a migration.

### Domain reference tables (load as data sources appear — NOT empty theater)
- `shared.weather_observations` (region_id, date, rainfall, temp_min/max, humidity, wind, event_type)
- `shared.soil_samples` (farm_id, field_ref, sampled_at, ph, om_pct, n, p, k, ca, mg, s, texture, drainage)
- `shared.pest_disease_reports` (cycle_id, region_id, pest_or_disease, severity, crop, variety, treatment, outcome, reported_at)
- `shared.market_prices` (commodity_id, region_id, price_tier ENUM('FARMGATE','WHOLESALE','RETAIL','EXPORT'), price_fjd, unit, observed_at)  ← extends today's crowdsourced market_price_reports
- `shared.input_demand_signals` (input_type, region_id, period, qty_signal, source)

**Rule:** ship each table ONLY in the migration that also ships its first real writer or loader.
No empty domes.

---

## 3. BACKEND DATA-FLOW ARCHITECTURE (deliverable 3)

```
[ Pillar action ]  →  business event  →  audit.events  (hash-chained, low-volume, legal record)
       │
       └────────────→  telemetry event →  analytics.events  (high-volume, append-only, NOT chained)
                                              │
                          nightly rollup jobs │  (Celery beat — exists)
                                              ▼
                       community.intel_snapshots + new domain snapshots
                                              │
                                  /admin/intelligence reads snapshots  (Inviolable #3)
```
**Two separate streams is the key decision.** `audit.events` stays sacred and small (it's
the Bank-Evidence spine — never pollute it with "user scrolled feed"). `analytics.events`
is the firehose for behavioural intelligence. Conflating them would wreck both.

---

## 4. EVENT-TRACKING ARCHITECTURE (deliverable 4 — BUILD THIS FIRST)

```
analytics.events (
  event_id BIGSERIAL, ts TIMESTAMPTZ DEFAULT now(),
  actor_user_id UUID NULL, tenant_id UUID NULL, region_id TEXT NULL,
  pillar TEXT ('home'|'classroom'|'tis'|'farm'|'admin'|'market'),
  event_type TEXT,           -- 'post_created','tis_query','course_enrolled','harvest_logged',…
  entity_type TEXT, entity_id TEXT,
  props JSONB,               -- typed per event_type, schema-on-read
  session_id TEXT )          -- partitioned monthly; TimescaleDB hypertable
```
One thin `track(pillar, event_type, props)` helper, called from every router. The frontend
already has the ping pattern (`/me/activity`, `/platform/metric`) — generalize it to one
`/api/v1/track` (rate-limited, PII-free props enforced). **Privacy gate in the helper:**
props are whitelisted per event_type; raw post text / message bodies / personal fields are
NEVER written to analytics. This is where data-minimization is enforced in code, not policy.

---

## 5–8. AGRICULTURAL / GEOGRAPHIC / AI-READINESS ARCHITECTURE (deliverables 5–8)

- **Agricultural model (5):** the Field-atom fact spine above. Already 70% real
  (cycles/harvests/inputs/varieties exist). Gap: `cycle_observations` for soil/pest/weather
  snapshots tied to the cycle.
- **Geographic (6):** recursive `geo_regions` + farm FK → roll-up CTEs. National Watermelon →
  Province → Village is one query once the registry loads.
- **AI readiness (7–8):** the 5-key fact shape (cycle/farm/region/time/tenant) is deliberately
  the feature-store grain. Yield/disease/credit models train on JOINs over it. No rebuild
  needed — that's the whole point of designing the spine before the dashboards. Provide a
  read-only `analytics.feature_*` view layer when the first model is commissioned.

---

## 9. FOUNDER WAR ROOM (deliverable 9)

Stricter gate than ADMIN — **FOUNDER role only** (the new `analytics` reads + revenue data).
Sections, all from existing/spine data:
- Subscription retention & churn cohorts (tenant tier history + activity_days)
- Conversion funnels (analytics.events: signup→verify→first-record→subscribe)
- Revenue analytics & CLV (tier × tenure; real once payments/T1 land)
- Feature adoption (analytics.events by event_type)
- Drop-off points (funnel step deltas)
- Marketplace & ecosystem growth (listings, orders, GMV)

---

## 10–12. MISSING DATA / REPORTS / ANALYTICS (deliverables 10–12)

**Missing data points (highest value first):**
1. `analytics.events` stream — nothing behavioural is captured beyond DAU today.
2. `geo_regions` + farm region FK — without it, no sub-island roll-up is possible.
3. `cycle_observations` (soil/pest/weather per field-season) — the agronomic core.
4. Consent ledger (`tenant.users.consent_*`) — REQUIRED before any external data sale.
5. Search/query text capture for TIS trends — but PII-screened (deliverable 4 gate).

**Missing reports:** geographic roll-up; cohort retention; commodity supply/demand gap by
region; TIS unanswered-topic trend (partially built); workforce skill-gap (Classroom).

**Missing analytics:** funnel/drop-off; feature adoption; price forecasting (needs market
data depth); outbreak clustering (needs pest reports).

---

## 13. SCALABILITY REVIEW (deliverable 13)

- `analytics.events` WILL outgrow a normal table → TimescaleDB hypertable (already in stack),
  monthly partitions, retention policy on raw rows (roll up, then drop raw > N months).
- Dashboards read SNAPSHOTS not live aggregates (Inviolable #3) — already the pattern.
- Rollups run on Celery beat (exists). Heavy geo CTEs get materialized views, refreshed nightly.
- Single-node Postgres is fine to ~10⁴ tenants; plan read-replicas + per-region sharding
  (the Covenant's sovereign-residency clause already anticipates regional infra) beyond that.

---

## 14. SECURITY REVIEW (deliverable 14)

- Founder War Room + analytics reads: FOUNDER-only, server-enforced.
- `/api/v1/track`: rate-limited, prop-whitelisted, PII rejected in code.
- Today's hardening stands (docs off in prod, security headers, rate guards) — see
  `docs/SECURITY_HARDENING_2026-06-11.md`. Still owed: rotate default admin password,
  httpOnly-cookie auth migration (tracked).
- Every external data export passes the existing k-anonymity engine (Covenant §3). No raw
  identifiers leave the platform, ever.

---

## 15. LEGAL & COMPLIANCE AUDIT (deliverable 15) — the part that protects you

This is where most "collect everything" platforms get sued. Teivaka's posture, enforced:

| Principle | Implementation |
|---|---|
| Data minimization | `track()` whitelists props; analytics stores agronomic facts, never post/message text, never personal fields. |
| No sensitive categories | NEVER store: national ID (unless a law compels + consent), health, political, religious, biometric, bank-account numbers. KYC docs already live in a private admin-gated path and are not analytics inputs. |
| Consent management | NEW `consent_*` columns + a consent ledger; aggregation/sale requires explicit opt-in (Covenant §3) — default OFF. |
| Right to delete | Exists (account delete anonymizes, keeps hash-chain as custody). Analytics rows key on user_id → cascade/anonymize on delete. |
| Aggregate-before-report | k≥10 floor enforced in code (BUILT). Differential-privacy noise on published aggregates (add when first external report ships). |
| Audit logging | audit.events (hash-chained) + admin action events (BUILT). |
| RBAC | FARMER/MANAGER/ACCOUNTANT/VIEWER/ADMIN/FOUNDER (BUILT). |

**Verdict:** the agricultural-data-not-personal-data strategy is correct and is your legal
moat. The one gap to close before ANY data monetization: the **consent ledger** (deliverable
in Phase 2). Do not sell or share a single aggregate until that exists and is opt-in.

---

## STEP-BY-STEP IMPLEMENTATION PLAN (the honest sequence)

| Phase | Slice | Why now / blocker |
|---|---|---|
| **I1** | `analytics.events` spine + `/api/v1/track` helper (PII-gated) + wire the top ~15 events across 4 pillars | Foundation. Everything downstream is a query off this. No external dependency. |
| **I2** | Nightly rollup jobs → behavioural snapshots; Founder War Room (funnels, retention, adoption, drop-off) | Real value from I1 data within weeks. |
| **I3** | Consent ledger (`consent_*` + ledger table) — BEFORE any external sharing | Legal gate. Blocks monetization until done. |
| **I4** | `geo_regions` registry load + `farms.region_id` FK + roll-up CTEs + Geographic Intelligence dome | Needs Fiji geo dataset (external — start the data request now). |
| **I5** | `cycle_observations` (soil/pest/weather per field-season) + Pest/Disease + Soil domes | Agronomic core; needs farmer input UX + (soil) lab pipeline. |
| **I6** | `market_prices` depth + Market Intelligence dome + forecasting readiness | Needs market data partnerships (ministry/exporters). |
| **I7** | `weather_observations` feed + Weather dome + crop/yield linkage | Needs a weather API/Met Service partnership. |
| **I8** | AI feature-store views + first model (yield or credit-risk) | Only after I1–I5 have accumulated real data. |

**External actions to start in parallel (yours, not code):** request the Fiji geographic
registry (Bureau of Statistics / iTaukei Lands); open conversations with the Met Service
(weather) and Ministry of Agriculture (market prices, soil); these have long lead times and
gate I4/I6/I7.

---

## DECISION GATES FOR THE FOUNDER

1. **Build order confirm:** I1 (event spine) first — agreed? It's the no-regret foundation.
2. **Consent posture:** external data sharing OFF until the consent ledger ships (I3). Confirm.
3. **Scope honesty:** domes I4–I7 ship as their data sources become real, not as empty tables.
   Confirm you want honest-empty-until-fed over impressive-but-fake.

Nothing in this document was built blind. The spine (I1) is ready to build the moment you say go.
