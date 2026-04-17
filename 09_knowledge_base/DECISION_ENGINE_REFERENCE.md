# FILE: 09_knowledge_base/DECISION_ENGINE_REFERENCE.md

# Teivaka TFOS — Decision Engine Reference
**Engine:** Daily snapshot computation, stored in decision_signal_snapshots
**Schedule:** Daily at 18:05 UTC = 6:05 AM Fiji time (Pacific/Fiji, UTC+12)
**Celery Task:** `automation.tasks.run_decision_engine`
**Signals:** 10 signals per farm, scored 0–10, status GREEN/AMBER/RED
**Last Updated:** 2026-04-07

---

## Overview

The Decision Engine runs once per day at 6:05 AM Fiji time — the start of the farm work day. It evaluates 10 signals from live operational data and produces a health snapshot for each active farm under the tenant. Results are stored in `decision_signal_snapshots` (a TimescaleDB hypertable) for trending.

**Why a stored snapshot?**
The dashboard must load in < 2 seconds. Computing 10 signals from raw tables in real-time would take 3–8 seconds at Phase 1 data volume and will degrade as data accumulates over years. The snapshot is the answer. The dashboard reads from the snapshot, not raw tables.

**Trend calculation:**
Each signal's trend is computed by comparing today's raw value to the 7-day-ago snapshot. Trend directions: `IMPROVING`, `STABLE`, `DECLINING`. Displayed as an arrow indicator in the dashboard.

**Score mapping:**
Each signal maps its raw value to a 0–10 score:
- 10 = best possible (farm operating perfectly on this signal)
- 0 = worst possible (critical failure on this signal)
- Score is continuous, not just 0/5/10 — allows for nuance

**Overall Farm Health Score:**
The 10 signal scores are averaged (equal weight, Phase 1) to produce an `overall_health_score` (0–10). In Phase 2, weights will be configurable per tenant (e.g., Cody may weight GrossMarginPct more heavily than NurseryStatus).

**First Run:**
Run manually on deployment day:
```bash
docker compose exec worker-automation \
  celery -A app.celery_app call automation.tasks.run_decision_engine \
  --args='["<teivaka-tenant-uuid>"]'
```

---

## Signal 1 — GrossMarginPct

**Signal Name:** `GrossMarginPct`
**Purpose:** Revenue health — is the farm making money on its active crop cycles?
**Business Question:** Are our input costs and labor costs leaving us with a healthy margin?

### Data Source
Table: `cycle_financials` (materialized view, refreshed every 30 minutes)
- `gross_margin_pct` column: pre-computed as `(revenue_fjd - total_cost_fjd) / revenue_fjd × 100`
- Filter: `cycle_status IN ('active', 'harvesting')` — only running cycles
- Scope: per farm_id

### Computation Formula (Pseudocode)
```sql
SELECT AVG(gross_margin_pct) AS signal_value
FROM cycle_financials cf
JOIN production_cycles pc ON cf.cycle_id = pc.cycle_id
WHERE pc.farm_id = :farm_id
  AND pc.cycle_status IN ('active', 'harvesting')
  AND cf.revenue_fjd > 0;  -- exclude cycles with no revenue yet (early stage)
```

If no cycles have revenue yet (all in early vegetative stage): signal_value = NULL → display as "INSUFFICIENT DATA", score = 5 (neutral).

### Thresholds and Status
| Status | Threshold | Meaning |
|--------|-----------|---------|
| GREEN | > 40% | Healthy margin — inputs well-controlled, pricing good |
| AMBER | 20% – 40% | Acceptable but watch input costs and pricing |
| RED | < 20% | Low margin — review inputs, labor efficiency, selling price |

### Score 0–10 Mapping
```python
def score_gross_margin(gm_pct):
    if gm_pct is None: return 5  # insufficient data
    if gm_pct >= 60: return 10
    if gm_pct >= 40: return 7 + (gm_pct - 40) / 20 * 3   # 7.0–10.0
    if gm_pct >= 20: return 4 + (gm_pct - 20) / 20 * 3   # 4.0–7.0
    if gm_pct >= 0:  return 0 + (gm_pct / 20) * 4         # 0.0–4.0
    return 0  # negative margin
```

### Required Action at RED
1. Open TFOS cycle detail for each active cycle — check which cycles have the worst margins
2. Review `cycle_financials.cost_breakdown` — identify highest cost category (labor, NPK, chemicals, or transport)
3. Check `price_master` — is current selling price below market benchmark?
4. If labor cost is high: review labor_attendance hours per cycle
5. If input cost is high: consider reducing NPK application frequency or sourcing cheaper supplier
6. Escalate to Cody via WhatsApp if margin < 10%

### Trend Calculation
`trend = today.signal_value - snapshot_7_days_ago.signal_value`
- If delta > +2%: IMPROVING
- If delta < -2%: DECLINING
- If |delta| <= 2%: STABLE

### Fiji-Specific Notes
- Seasonal price swings are large in Fiji. Eggplant can be FJD 1.20/kg in wet season (Nov–Apr) and FJD 2.50/kg in dry season (May–Oct). Margin fluctuations by season are expected.
- F002 (Kadavu) has higher logistics costs due to ferry transport. F002 margins will structurally be 5–10% lower than F001 for equivalent crops. Adjust interpretation accordingly.
- CRP-KAV (Kava) has 4-year cycles — no revenue is generated until year 4. Gross margin for CRP-KAV cycles will show NULL during growth years. This is normal — exclude CRP-KAV from GrossMarginPct calculation during active growth phases.

---

## Signal 2 — DaysSinceLastHarvest

**Signal Name:** `DaysSinceLastHarvest`
**Purpose:** Harvest frequency indicator — is the farm actively producing and selling?
**Business Question:** When did we last bring in product and revenue?

### Data Source
Table: `harvest_log` (TimescaleDB hypertable, partitioned by harvest_date)
- Filter: `farm_id = :farm_id` AND `tenant_id = :tenant_id`
- Compute: `CURRENT_DATE - MAX(harvest_date)`

### Computation Formula (Pseudocode)
```sql
SELECT CURRENT_DATE - MAX(harvest_date) AS days_since_harvest
FROM harvest_log
WHERE farm_id = :farm_id
  AND tenant_id = :tenant_id
  AND production_id != 'CRP-KAV';  -- exclude kava (handled separately)
```

**Special handling for CRP-KAV:**
If the farm's ONLY active cycles are CRP-KAV (4-year crop), the threshold changes:
```python
if farm_has_only_kav_active_cycles(farm_id):
    green_threshold = 180
    amber_threshold = 270
    red_threshold = 365
else:
    green_threshold = 7
    amber_threshold = 14
    red_threshold = 21
```

### Thresholds and Status (Standard — non-KAV farms)
| Status | Threshold | Meaning |
|--------|-----------|---------|
| GREEN | < 7 days | Active harvest — farm producing regularly |
| AMBER | 7–14 days | Short gap — acceptable but monitor |
| RED | > 21 days | Long gap — investigate why no harvest |

### Thresholds and Status (KAV-only farm override)
| Status | Threshold | Meaning |
|--------|-----------|---------|
| GREEN | < 180 days | Kava activity within normal inactivity window |
| AMBER | 180–270 days | Elevated but within kava growth expectations |
| RED | > 365 days | Kava plot potentially abandoned — inspect |

### Score 0–10 Mapping (Standard)
```python
def score_days_since_harvest(days, kav_only=False):
    if kav_only:
        # Different scale for kava-only farms
        if days <= 60: return 10
        if days <= 180: return 7
        if days <= 270: return 4
        return 0
    # Standard crops
    if days is None: return 5  # no harvest history (new farm)
    if days <= 3: return 10
    if days <= 7: return 8
    if days <= 14: return 6
    if days <= 21: return 4
    if days <= 30: return 2
    return 0
```

### Required Action at RED
1. Check which active cycles are in 'harvesting' stage — is a harvest log just missing?
2. If crop is ready: check RULE-038 chemical compliance — may be blocking harvest
3. If crop is NOT ready: check cycle stage (may still be vegetative — acceptable)
4. If no active cycles at all: check Signal 6 (ActiveCyclesCount) — likely RED too
5. If harvest data exists but not logged: check with field workers — data gap?

### Trend Calculation
`trend = today.signal_value - snapshot_7_days_ago.signal_value`
- Positive delta (more days have passed): DECLINING
- Zero or negative delta (harvested recently): IMPROVING or STABLE

### Fiji-Specific Notes
- Kadavu (F002) may have harvest gaps when ferry schedule doesn't allow product transport to Suva market. A harvest gap may reflect logistical delay, not production failure.
- F002 FRT-PIN (pineapple) produces year-round but with distinct flush periods (Oct–Jan is peak). AMBER status during non-flush off-season is acceptable.

---

## Signal 3 — OpenAlertsCount

**Signal Name:** `OpenAlertsCount`
**Purpose:** Operational risk indicator — how many unresolved issues are there?
**Business Question:** Are we on top of our farm operations, or are problems accumulating?

### Data Source
Table: `alerts`
- Filter: `farm_id = :farm_id` AND `alert_status = 'open'` AND `tenant_id = :tenant_id`
- Compute: `COUNT(*)`

### Computation Formula (Pseudocode)
```sql
SELECT COUNT(*) AS total_open,
       COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical_count,
       COUNT(*) FILTER (WHERE severity = 'HIGH') AS high_count,
       COUNT(*) FILTER (WHERE severity = 'MEDIUM') AS medium_count
FROM alerts
WHERE farm_id = :farm_id
  AND alert_status = 'open'
  AND tenant_id = :tenant_id;
```

The raw value is `total_open`, but the score is modulated by severity mix:
- A farm with 5 CRITICAL alerts is much worse than a farm with 10 MEDIUM alerts.

### Thresholds and Status
| Status | Threshold | Meaning |
|--------|-----------|---------|
| GREEN | 0–3 open alerts | Well-managed farm, issues addressed promptly |
| AMBER | 4–7 open alerts | Some backlog — review and clear |
| RED | > 7 open alerts | Significant backlog — prioritize resolution |

| Override | Condition | Status |
|----------|-----------|--------|
| Instant RED | ANY CRITICAL alert open | Regardless of total count |

### Score 0–10 Mapping
```python
def score_open_alerts(total_open, critical_count, high_count):
    if critical_count > 0: return 0  # any CRITICAL = minimum score
    if total_open == 0: return 10
    if total_open <= 2: return 9
    if total_open <= 5: return 7 - (high_count * 1)  # high alerts drag score
    if total_open <= 10: return 5 - (high_count * 0.5)
    return max(0, 3 - (high_count * 0.5))
```

### Required Action at RED
Resolve alerts in this priority order:
1. CRITICAL alerts first (RULE-021 Mortality, RULE-034 Ferry Buffer, RULE-038 Chemical)
2. HIGH alerts (RULE-020 Vaccination, RULE-018 Cash, RULE-037 AR Aging)
3. MEDIUM alerts (RULE-003 Transplant, RULE-013 Overdue Task)
4. LOW alerts (can batch-resolve weekly)

### Trend Calculation
`trend = today.signal_value - snapshot_7_days_ago.signal_value`
- More alerts today: DECLINING
- Fewer alerts today: IMPROVING
- Same: STABLE

### Fiji-Specific Notes
- After each Fiji cyclone season swell (Jan–Apr), expect WeatherAlert alerts to be open. This is expected — the alert tells the farm to inspect, not that something has gone wrong.
- F002 will accumulate more alerts on average due to higher logistics risk (RULE-034 fires regularly).

---

## Signal 4 — WeeklyLogActivity

**Signal Name:** `WeeklyLogActivity`
**Purpose:** Data quality indicator — is the farm being actively managed and recorded?
**Business Question:** Are field workers logging their activities? Is there a connectivity or absence issue?

### Data Source
Tables (ALL of the following, combined):
- `field_events` — WHERE `created_at >= NOW() - INTERVAL '7 days'`
- `harvest_log` — WHERE `created_at >= NOW() - INTERVAL '7 days'`
- `labor_attendance` — WHERE `work_date >= CURRENT_DATE - INTERVAL '7 days'`
- `cash_ledger` — WHERE `transaction_date >= CURRENT_DATE - INTERVAL '7 days'`
- `weather_log` — WHERE `recorded_at >= NOW() - INTERVAL '7 days'`

### Computation Formula (Pseudocode)
```sql
SELECT (
  (SELECT COUNT(*) FROM field_events WHERE farm_id = :farm_id AND created_at >= NOW() - '7 days'::interval) +
  (SELECT COUNT(*) FROM harvest_log WHERE farm_id = :farm_id AND created_at >= NOW() - '7 days'::interval) +
  (SELECT COUNT(*) FROM labor_attendance WHERE farm_id = :farm_id AND work_date >= CURRENT_DATE - 7) +
  (SELECT COUNT(*) FROM cash_ledger WHERE farm_id = :farm_id AND transaction_date >= CURRENT_DATE - 7) +
  (SELECT COUNT(*) FROM weather_log WHERE farm_id = :farm_id AND recorded_at >= NOW() - '7 days'::interval)
) AS total_log_entries;
```

### Thresholds and Status
| Status | Threshold | Meaning |
|--------|-----------|---------|
| GREEN | ≥ 5 entries | Active farm with regular logging |
| AMBER | 2–4 entries | Low activity — possible light week or partial logging |
| RED | < 2 entries | Data gap — connectivity issue, worker absence, or no farming activity |

### Score 0–10 Mapping
```python
def score_log_activity(count):
    if count >= 20: return 10
    if count >= 10: return 8
    if count >= 5: return 6
    if count >= 3: return 4
    if count >= 1: return 2
    return 0
```

### Required Action at RED
1. Contact farm manager or W-001 Laisenia Waqa via WhatsApp: "TFOS shows no activity logged this week — can you confirm operations?"
2. Check if there is an internet connectivity issue (Kadavu F002 is high risk for connectivity drops)
3. Check if there is a system access issue (auth token expired, app not loading)
4. Verify field workers have the app installed and know how to use voice logging
5. If farm is genuinely inactive (holiday, weather stop), log the reason as a field_event to prevent future false alerts

### Trend Calculation
`trend = today.signal_value - snapshot_7_days_ago.signal_value`
- More entries: IMPROVING
- Fewer entries: DECLINING

### Fiji-Specific Notes
- F002 (Kadavu) connectivity is unreliable. Offline-first PWA (IndexedDB) must buffer logs and sync when connected. If sync is working, entries should appear in bursts. Do not interpret a 3-day gap followed by a burst as poor logging — it is normal offline-sync behavior.
- Fiji public holidays (Christmas week, Diwali, Ratu Sir Lala Sukuna Day, Independence Day): expect LOW activity during national holidays. Do not send RED alerts on public holiday weeks without confirming farm situation.

---

## Signal 5 — LaborCostRatio

**Signal Name:** `LaborCostRatio`
**Purpose:** Efficiency indicator — what proportion of farm revenue is being spent on labor?
**Business Question:** Are we over-spending on labor relative to what the farm is earning?

### Data Source
Tables:
- `labor_attendance` — `total_cost_fjd` column (computed from hours × rate)
- `income_log` — `total_fjd` column
- Rolling window: last 30 days

### Computation Formula (Pseudocode)
```sql
SELECT
  SUM(la.total_cost_fjd) AS total_labor_cost,
  SUM(il.total_fjd) AS total_revenue,
  SUM(la.total_cost_fjd) / NULLIF(SUM(il.total_fjd), 0) * 100 AS labor_cost_ratio_pct
FROM labor_attendance la
FULL OUTER JOIN income_log il ON il.farm_id = la.farm_id
  AND il.transaction_date >= CURRENT_DATE - 30
WHERE la.farm_id = :farm_id
  AND la.work_date >= CURRENT_DATE - 30
  AND la.tenant_id = :tenant_id;
```

If total_revenue = 0 (no revenue in last 30 days): ratio is NULL → display as "INSUFFICIENT DATA", score = 5.

### Thresholds and Status
| Status | Threshold | Meaning |
|--------|-----------|---------|
| GREEN | < 30% | Excellent labor efficiency |
| AMBER | 30–50% | Moderate — watch for over-staffing during low-revenue periods |
| RED | ≥ 50% | High labor cost — unsustainable if sustained |

### Score 0–10 Mapping
```python
def score_labor_ratio(ratio_pct):
    if ratio_pct is None: return 5  # insufficient data
    if ratio_pct <= 15: return 10
    if ratio_pct <= 30: return 8
    if ratio_pct <= 40: return 6
    if ratio_pct <= 50: return 4
    if ratio_pct <= 70: return 2
    return 0
```

### Required Action at RED
1. Review labor_attendance for the farm — are casual workers (W-002 through W-009) deployed appropriately?
2. Check if revenue has dropped (harvest gap, pest damage) while labor has stayed constant
3. Review whether specific high-labor tasks can be mechanized (e.g., weeding via tractor vs manual)
4. Consider reducing casual worker days until next harvest revenue arrives
5. For W-001 Laisenia Waqa (permanent, salaried): labor cost is fixed regardless of activity — ensure W-001 is deployed on value-generating tasks

### Trend Calculation
`trend = today.signal_value - snapshot_7_days_ago.signal_value`
- Increasing ratio: DECLINING
- Decreasing ratio: IMPROVING

### Fiji-Specific Notes
- Fiji minimum wage context (2025): ~FJD 4.00/hour for agricultural workers. W-001 (permanent) has a fixed monthly rate. W-002 through W-009 are casual — paid per day worked.
- During harvest peaks (high revenue, high labor simultaneously): ratio may temporarily spike then recover. A single RED week during harvest is acceptable.
- F002 (Kadavu) labor cost includes boat transport from village to farm — include in labor cost if applicable.

---

## Signal 6 — ActiveCyclesCount

**Signal Name:** `ActiveCyclesCount`
**Purpose:** Production pipeline health — does the farm have enough active production to generate revenue?
**Business Question:** How many crops are actively in the ground right now?

### Data Source
Table: `production_cycles`
- Filter: `farm_id = :farm_id` AND `cycle_status IN ('active', 'harvesting')` AND `tenant_id = :tenant_id`
- Compute: `COUNT(*)`

### Computation Formula (Pseudocode)
```sql
SELECT COUNT(*) AS active_cycles
FROM production_cycles
WHERE farm_id = :farm_id
  AND tenant_id = :tenant_id
  AND cycle_status IN ('active', 'harvesting');
```

### Thresholds and Status
| Status | Threshold | Meaning |
|--------|-----------|---------|
| GREEN | ≥ 5 cycles | Strong pipeline — diversified production |
| AMBER | 2–4 cycles | Acceptable but thin pipeline — plan new cycles |
| RED | < 2 cycles | Critical — farm revenue at risk, not enough production |

### Score 0–10 Mapping
```python
def score_active_cycles(count):
    if count >= 8: return 10
    if count >= 5: return 8
    if count >= 3: return 6
    if count == 2: return 4
    if count == 1: return 2
    return 0
```

### Required Action at RED
1. Review available PUs — which production units are idle?
2. Call validate_rotation() for idle PUs to find eligible new crops
3. Check inventory: do we have seeds/planting material for recommended crops?
4. F001 has 70+ idle acres — even converting 1–2 acres to new cycles moves this from RED to GREEN
5. Check cash position (Signal 9) — new cycles require input costs, so cash must be available

### Trend Calculation
`trend = today.signal_value - snapshot_7_days_ago.signal_value`
- More cycles: IMPROVING
- Fewer cycles: DECLINING (may signal planned closures — check)

### Fiji-Specific Notes
- Both CRP-KAV cycles (F002-PU006, F002-PU007) count toward F002's ActiveCyclesCount even though they are 4-year cycles. This is correct — they are active and generating future value.
- LIV-API (4 hives) counts as 1 active cycle on F001 (continuous production).
- LIV-GOA (8 goats, F002) counts as 1 active cycle on F002.
- Current status: F001 has 4 active cycles, F002 has 3 active cycles (on deployment day).

---

## Signal 7 — NurseryStatus

**Signal Name:** `NurseryStatus`
**Purpose:** Forward production planning — are we preparing the next generation of crops?
**Business Question:** Is the nursery stocked for continuity of production?

### Data Source
Table: `nursery_log`
- Filter: `farm_id = :farm_id` AND `batch_status IN ('germinating', 'ready')` AND `tenant_id = :tenant_id`
- Compute: `COUNT(DISTINCT batch_id)`

### Computation Formula (Pseudocode)
```sql
SELECT COUNT(DISTINCT batch_id) AS active_nursery_batches
FROM nursery_log
WHERE farm_id = :farm_id
  AND tenant_id = :tenant_id
  AND batch_status IN ('germinating', 'ready');
```

### Thresholds and Status
| Status | Threshold | Meaning |
|--------|-----------|---------|
| GREEN | ≥ 3 active batches | Strong nursery pipeline — future plantings planned |
| AMBER | 1–2 active batches | Limited forward planning — start more batches |
| RED | 0 batches | No nursery activity — future production gap risk |

### Score 0–10 Mapping
```python
def score_nursery(count):
    if count >= 5: return 10
    if count >= 3: return 8
    if count == 2: return 6
    if count == 1: return 4
    return 0
```

### Required Action at RED
1. Identify which crops have closed or near-closing cycles (will need replanting)
2. Call validate_rotation() to find eligible crops for each PU
3. Check seed inventory — do we have seeds available?
4. Start at least 1–2 nursery batches immediately (eggplant, tomato, or leafy greens are fast to germinate)
5. Log nursery batch creation in TFOS (POST /nursery/batches)

### Trend Calculation
`trend = today.signal_value - snapshot_7_days_ago.signal_value`
- More batches: IMPROVING
- Zero batches for 7 days: DECLINING

### Fiji-Specific Notes
- Direct-sown crops (cassava, sweet potato, long bean) do not use nursery — they do not count here. NurseryStatus only reflects transplant crops.
- F002 nursery on Kadavu: seeds must come via ferry. NurseryStatus RED on F002 could reflect a seed supply problem, not just planning failure. Cross-check with Signal 10 (InputStockLevel).

---

## Signal 8 — WeatherStress

**Signal Name:** `WeatherStress`
**Purpose:** Environmental risk indicator — is the farm under climate stress right now?
**Business Question:** Has recent weather created conditions that threaten crops or field operations?

### Data Source
Table: `weather_log` (TimescaleDB hypertable)
- Filter: `farm_id = :farm_id` AND `recorded_at >= NOW() - INTERVAL '3 days'`
- Columns: `rainfall_mm`, `temperature_max`, `wind_speed_kmh`, `weather_condition`

### Computation Formula (Pseudocode)
```python
# Pull last 3 days of weather data
recent_weather = query("SELECT * FROM weather_log WHERE farm_id = :farm_id AND recorded_at >= NOW() - '3 days'::interval")

stress_level = 'LOW'
for day in recent_weather:
    if day.rainfall_mm >= 50:
        stress_level = 'HIGH'
        break
    if day.temperature_max > 38:
        stress_level = 'HIGH'
        break
    if day.weather_condition in ('cyclone', 'storm', 'severe_thunderstorm'):
        stress_level = 'HIGH'
        break
    if day.rainfall_mm >= 25 or (35 <= day.temperature_max <= 38):
        if stress_level != 'HIGH':
            stress_level = 'MEDIUM'
```

Signal value stored as: LOW=1, MEDIUM=2, HIGH=3

### Thresholds and Status
| Status | Condition | Meaning |
|--------|-----------|---------|
| GREEN | LOW (all days < 25mm rainfall, temp < 35°C, no storm) | Normal Fiji conditions — field operations proceed |
| AMBER | MEDIUM (any day 25–50mm rainfall OR temp 35–38°C) | Moderate stress — reduce irrigation, monitor drainage |
| RED | HIGH (any day ≥ 50mm OR temp > 38°C OR storm condition) | Severe stress — protect crops, halt operations, inspect for damage |

### Score 0–10 Mapping
```python
def score_weather_stress(stress_level):
    if stress_level == 'LOW': return 10
    if stress_level == 'MEDIUM': return 5
    if stress_level == 'HIGH': return 0
    return 7  # no data
```

### Required Action at RED
1. Halt all field operations (no spraying, no transplanting, no harvesting in heavy rain)
2. Inspect drainage channels on low-lying zones — especially F001 Serua lowlands (flood risk)
3. Secure nursery — move seedlings to elevated positions or inside structure
4. Check F002 Kadavu: if cyclone or severe storm, activate emergency contact protocol for island farm
5. Log weather damage to crops as field_events (event_type = 'weather_damage')
6. Notify Cody immediately if storm condition detected at F002 (island — no road egress)

### Trend Calculation
`trend = today.stress_level - snapshot_7_days_ago.stress_level`
- Lower stress: IMPROVING
- Higher stress: DECLINING

### Fiji-Specific Notes
- **Wet Season (Nov–Apr):** HIGH stress events are frequent. Decision Engine during this period will routinely show AMBER or RED for WeatherStress. This is expected — it is not a failure of the farm, it is Fiji's climate.
- **Cyclone Season (Nov–Apr):** Fiji sits in the South Pacific cyclone belt. Named cyclones are a recurring risk. F002 (Kadavu) is particularly exposed — the island has no road access and is entirely dependent on sea transport for evacuation.
- **F002 specific:** A 50mm+ rainfall event on Kadavu also risks disrupting ferry schedules, compounding logistics risk (interacts with RULE-034).

---

## Signal 9 — CashPosition

**Signal Name:** `CashPosition`
**Purpose:** Liquidity indicator — does the farm have cash to operate?
**Business Question:** Can we pay workers and buy inputs this week?

### Data Source
Table: `cash_ledger` (TimescaleDB hypertable)
- Filter: `farm_id = :farm_id` AND `tenant_id = :tenant_id`
- All-time net balance (not rolling window — total cash on hand)

### Computation Formula (Pseudocode)
```sql
SELECT
  SUM(amount_fjd) FILTER (WHERE direction = 'in') AS total_inflows,
  SUM(amount_fjd) FILTER (WHERE direction = 'out') AS total_outflows,
  SUM(amount_fjd) FILTER (WHERE direction = 'in') -
    SUM(amount_fjd) FILTER (WHERE direction = 'out') AS net_balance
FROM cash_ledger
WHERE farm_id = :farm_id
  AND tenant_id = :tenant_id;
```

Note: Cash is tracked at the tenant level (Teivaka PTE LTD) but reported per farm for the dashboard. In Phase 1 (single tenant), F001 and F002 share a single cash pool. This may be split in Phase 2 if Cody wants per-farm cash management.

### Thresholds and Status
| Status | Threshold | Meaning |
|--------|-----------|---------|
| GREEN | > FJD 500 | Adequate operational buffer |
| AMBER | FJD 0 – FJD 500 | Low buffer — monitor carefully, no discretionary spending |
| RED | ≤ FJD 0 (zero or negative) | URGENT — farm cannot meet operating obligations |

### Score 0–10 Mapping
```python
def score_cash_position(balance_fjd):
    if balance_fjd >= 5000: return 10
    if balance_fjd >= 2000: return 8
    if balance_fjd >= 1000: return 7
    if balance_fjd >= 500: return 6
    if balance_fjd >= 200: return 5
    if balance_fjd >= 0: return 3
    # Negative balance
    if balance_fjd >= -500: return 1
    return 0
```

### Required Action at RED
If balance ≤ 0 (URGENT):
1. **Immediate:** Review and defer all non-essential cash outflows
2. **Same day:** Contact all buyers with outstanding invoices — request accelerated payment
3. **Same day:** Review upcoming farm expenses — can any supplier payment be delayed?
4. **Within 48 hours:** Contact Cody directly — RED cash position is a founder-level decision point
5. **Consider:** Advance sale of standing kava at F002 (partial harvest negotiation with buyers)
6. **Consider:** Bridge loan from cooperatives or family-business network (common in Fiji agriculture)

### Trend Calculation
`trend = today.signal_value - snapshot_7_days_ago.signal_value`
- Balance increasing: IMPROVING
- Balance decreasing: DECLINING
- Stable within ±FJD 50: STABLE

### Fiji-Specific Notes
- Fiji agricultural cash flows are highly seasonal. Dry season (May–Oct) typically brings better eggplant prices and more harvest revenue. Cash position naturally improves in dry season and tightens in wet season.
- F001 profit share with Nayans (landowner): when profit share is calculated, a portion of cash flows to Nayans. The cash_ledger should record profit_share payments as 'out' transactions tagged with category='profit_share'. The rate is TBD (see OPEN_QUESTIONS.md Q1).
- Kava revenue (F002): when kava is harvested at year 4, cash position will spike significantly. The Decision Engine should not interpret this spike as anomalous — it is the planned return on a 4-year investment.

---

## Signal 10 — InputStockLevel

**Signal Name:** `InputStockLevel`
**Purpose:** Supply chain health — are we running low on critical farm inputs?
**Business Question:** Do we have enough seeds, fertilizer, and chemicals to continue operations?

### Data Source
Table: `inputs`
- Filter: `farm_id = :farm_id` AND `tenant_id = :tenant_id`
- Compute: `COUNT(*) WHERE current_stock_qty <= reorder_point`

### Computation Formula (Pseudocode)
```sql
SELECT
  COUNT(*) AS total_inputs,
  COUNT(*) FILTER (WHERE current_stock_qty <= reorder_point) AS low_stock_items,
  COUNT(*) FILTER (WHERE current_stock_qty = 0) AS out_of_stock_items,
  ARRAY_AGG(input_name) FILTER (WHERE current_stock_qty <= reorder_point) AS low_stock_list
FROM inputs
WHERE farm_id = :farm_id
  AND tenant_id = :tenant_id
  AND is_active = true;
```

Signal value = `low_stock_items` count.

### Thresholds and Status
| Status | Threshold | Meaning |
|--------|-----------|---------|
| GREEN | 0 items at or below reorder point | All inputs adequately stocked |
| AMBER | 1–2 items below reorder point | Minor stock concern — reorder soon |
| RED | > 5 items below reorder point OR any item = 0 stock | Supply chain failure risk |

### Score 0–10 Mapping
```python
def score_input_stock(low_stock_count, out_of_stock_count):
    if out_of_stock_count > 0: return 0  # any zero stock = minimum
    if low_stock_count == 0: return 10
    if low_stock_count == 1: return 8
    if low_stock_count == 2: return 6
    if low_stock_count <= 4: return 4
    if low_stock_count <= 7: return 2
    return 0
```

### Required Action at RED
For EACH low-stock item:
1. Check `inputs.lead_time_days` — how long does restocking take?
2. For F001 inputs: contact supplier directly, expect 1–3 day delivery (mainland, road access)
3. For F002 inputs: check ferry schedule (Sea Master SUP-012). Add 7-day buffer. If stock days remaining < (lead_time + 7): CRITICAL, order immediately. This also triggers RULE-034.
4. Log purchase order in TFOS (POST /procurement/orders)
5. Track delivery status in purchase_orders table

### Trend Calculation
`trend = today.signal_value - snapshot_7_days_ago.signal_value`
- More items low: DECLINING
- Fewer items low: IMPROVING

### Fiji-Specific Notes
- F002 (Kadavu) inputs have structurally longer lead times due to ferry dependency. For F002, the effective reorder point should be 3× the standard reorder point (to account for ferry schedule uncertainty). Configure this in `inputs.reorder_point` as a per-farm value, not a system-wide default.
- Critical inputs that affect chemical compliance: NPK fertilizer, Dimethoate, Mancozeb. If these hit zero stock, it doesn't just create supply risk — it can halt harvest if compliance depends on specific application timing.
- Seed stock: include seeds in the inputs table. Seed stock running low means no new nursery batches possible, which cascades to Signal 7 (NurseryStatus) going RED.

---

## Snapshot Storage Schema

```sql
-- decision_signal_snapshots is a TimescaleDB hypertable on snapshot_date
CREATE TABLE decision_signal_snapshots (
  snapshot_id         UUID DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(tenant_id),
  farm_id             VARCHAR(10) NOT NULL,
  snapshot_date       DATE NOT NULL,
  snapshot_timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Signal values (raw)
  gross_margin_pct        NUMERIC(5,2),
  days_since_harvest       INTEGER,
  open_alerts_count        INTEGER,
  weekly_log_activity      INTEGER,
  labor_cost_ratio_pct     NUMERIC(5,2),
  active_cycles_count      INTEGER,
  nursery_status_count     INTEGER,
  weather_stress_level     VARCHAR(10),   -- LOW/MEDIUM/HIGH
  cash_position_fjd        NUMERIC(12,2),
  input_low_stock_count    INTEGER,

  -- Signal scores (0-10)
  score_gross_margin       NUMERIC(4,2),
  score_days_harvest       NUMERIC(4,2),
  score_open_alerts        NUMERIC(4,2),
  score_log_activity       NUMERIC(4,2),
  score_labor_ratio        NUMERIC(4,2),
  score_active_cycles      NUMERIC(4,2),
  score_nursery            NUMERIC(4,2),
  score_weather            NUMERIC(4,2),
  score_cash               NUMERIC(4,2),
  score_input_stock        NUMERIC(4,2),

  -- Signal statuses (GREEN/AMBER/RED)
  status_gross_margin      VARCHAR(10),
  status_days_harvest      VARCHAR(10),
  status_open_alerts       VARCHAR(10),
  status_log_activity      VARCHAR(10),
  status_labor_ratio       VARCHAR(10),
  status_active_cycles     VARCHAR(10),
  status_nursery           VARCHAR(10),
  status_weather           VARCHAR(10),
  status_cash              VARCHAR(10),
  status_input_stock       VARCHAR(10),

  -- Trend indicators (vs 7-day ago)
  trend_gross_margin       VARCHAR(10),   -- IMPROVING/STABLE/DECLINING
  trend_days_harvest       VARCHAR(10),
  trend_open_alerts        VARCHAR(10),
  trend_log_activity       VARCHAR(10),
  trend_labor_ratio        VARCHAR(10),
  trend_active_cycles      VARCHAR(10),
  trend_nursery            VARCHAR(10),
  trend_cash               VARCHAR(10),
  trend_input_stock        VARCHAR(10),

  -- Derived overall score
  overall_health_score     NUMERIC(4,2),  -- AVG of 10 signal scores
  overall_status           VARCHAR(10),   -- GREEN/AMBER/RED (worst single signal)

  PRIMARY KEY (snapshot_id, snapshot_date)
);

SELECT create_hypertable('decision_signal_snapshots', 'snapshot_date');
```

---

## Dashboard API Response Format

```json
GET /api/v1/farms/{farm_id}/dashboard

{
  "farm_id": "F001",
  "farm_name": "Save-A-Lot Farm",
  "snapshot_date": "2026-04-07",
  "snapshot_timestamp": "2026-04-07T18:05:23Z",
  "overall_health_score": 7.2,
  "overall_status": "AMBER",
  "signals": {
    "gross_margin_pct": {
      "value": 43.5,
      "unit": "%",
      "status": "GREEN",
      "score": 8.1,
      "trend": "IMPROVING",
      "label": "Gross Margin"
    },
    "days_since_last_harvest": {
      "value": 3,
      "unit": "days",
      "status": "GREEN",
      "score": 9.0,
      "trend": "IMPROVING",
      "label": "Last Harvest"
    },
    "open_alerts_count": {
      "value": 5,
      "unit": "alerts",
      "status": "AMBER",
      "score": 6.0,
      "trend": "STABLE",
      "label": "Open Alerts",
      "breakdown": {"critical": 0, "high": 1, "medium": 3, "low": 1}
    },
    "weekly_log_activity": {
      "value": 12,
      "unit": "entries",
      "status": "GREEN",
      "score": 8.0,
      "trend": "STABLE",
      "label": "Weekly Activity"
    },
    "labor_cost_ratio": {
      "value": 35.2,
      "unit": "%",
      "status": "AMBER",
      "score": 6.5,
      "trend": "DECLINING",
      "label": "Labor/Revenue Ratio"
    },
    "active_cycles_count": {
      "value": 5,
      "unit": "cycles",
      "status": "GREEN",
      "score": 8.0,
      "trend": "STABLE",
      "label": "Active Cycles"
    },
    "nursery_status": {
      "value": 1,
      "unit": "batches",
      "status": "AMBER",
      "score": 4.0,
      "trend": "DECLINING",
      "label": "Nursery Batches"
    },
    "weather_stress": {
      "value": "LOW",
      "unit": null,
      "status": "GREEN",
      "score": 10.0,
      "trend": "STABLE",
      "label": "Weather Stress"
    },
    "cash_position": {
      "value": 1250.00,
      "unit": "FJD",
      "status": "GREEN",
      "score": 7.0,
      "trend": "IMPROVING",
      "label": "Cash Balance"
    },
    "input_stock": {
      "value": 2,
      "unit": "low items",
      "status": "AMBER",
      "score": 6.0,
      "trend": "STABLE",
      "label": "Input Stock",
      "low_items": ["NPK 15-15-15", "Dimethoate 400EC"]
    }
  },
  "active_cycles": [...],
  "open_alerts": [...],
  "cokg_summary": {
    "F001-PU001": {"cycle": "CRP-CAS", "cokg_fjd": 0.48},
    "F001-PU002": {"cycle": "CRP-EGG", "cokg_fjd": 1.82},
    "F001-PU003": {"cycle": "CRP-EGG", "cokg_fjd": 1.94}
  }
}
```

---

## Signal Configuration Table

```sql
-- Stores configurable thresholds (allows Cody to adjust without code change)
CREATE TABLE decision_signal_config (
  config_id       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id),
  signal_name     VARCHAR(50) NOT NULL,
  green_threshold NUMERIC,
  amber_threshold NUMERIC,
  red_threshold   NUMERIC,
  weight          NUMERIC(4,2) DEFAULT 1.0,  -- for future weighted scoring
  is_active       BOOLEAN DEFAULT true,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Seed 10 rows (one per signal) during migration
-- Verify post-migration:
SELECT signal_name FROM decision_signal_config WHERE signal_name IS NOT NULL;
-- MUST return exactly 10 rows
```
