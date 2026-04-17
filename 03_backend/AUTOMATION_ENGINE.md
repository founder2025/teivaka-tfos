# FILE: 03_backend/AUTOMATION_ENGINE.md

# Teivaka TFOS Backend — Automation Engine Reference

Complete specification for the TFOS automation engine: rule evaluation, deduplication, auto-resolution, task generation, alert escalation, and WhatsApp message templates.

---

## 1. AutomationRule Data Structure

```python
# services/automation_service.py
from dataclasses import dataclass
from typing import Optional


@dataclass
class AutomationRule:
    rule_id: str             # 'RULE-001' through 'RULE-043'
    rule_name: str           # Human-readable name
    is_active: bool          # False = never evaluated (e.g. RULE-024 to RULE-028 Aquaculture/Pig)
    trigger_category: str    # One of 27 categories (see Section 3)
    applies_to: Optional[str]  # Production IDs (comma-separated), '*' = all, or 'FARM' scope
    production_id: Optional[str]  # Specific production if rule is crop-specific
    task_type: str           # Task type string for generated tasks
    days_after_start: Optional[int]   # For stage-based rules (days after planting/stage start)
    frequency_days: Optional[int]     # For recurring rules (re-trigger every N days)
    threshold_value: Optional[float]  # For threshold-based comparisons
    comparison_operator: Optional[str]  # 'gt','gte','lt','lte','eq','neq'
    severity: str            # 'Critical', 'High', 'Medium', 'Low'
    requires_cycle: bool     # True = rule only runs if active cycle exists
    source_reference: Optional[str]  # Protocol or regulation reference
    notes: Optional[str]     # Internal developer notes


# Full rule catalog reference
# RULE-001 to RULE-011: ProductionStageProtocol (crop-specific stage tasks)
# RULE-012: InventoryAlert (low stock)
# RULE-013: TaskOverdue
# RULE-014: WeatherAlert (heavy rain)
# RULE-015: NurseryAlert
# RULE-016: EquipmentAlert (basic check — RULE-025 is the full maintenance version)
# RULE-017: HarvestAlert (harvest gap / inactivity)
# RULE-018: CashAlert (low cash balance)
# RULE-019: Livestock (general)
# RULE-020: Apiculture
# RULE-021: Livestock (mortality — special)
# RULE-022: PestDisease
# RULE-023: FoodSafety
# RULE-024 to RULE-026: Aquaculture — INACTIVE
# RULE-027 to RULE-028: Pig — INACTIVE
# RULE-029: Delivery
# RULE-030: FoodSafety (extended)
# RULE-031: Incident
# RULE-032: HarvestLoss
# RULE-033: HarvestReady
# RULE-034: F002FerryBuffer (CRITICAL)
# RULE-035: PaymentOverdue
# RULE-036: AccountsReceivable
# RULE-037: RotationDue
# RULE-038: ChemicalCompliance (CRITICAL — blocks harvest)
# RULE-039: CashFlowNegative
# RULE-040: OrderStatus
# RULE-041: MaintenanceDue (advance warning)
# RULE-042: OrderStatus extended (had column mapping error in v7.0 — fixed)
# RULE-043: WorkerPerformance (had column mapping error in v7.0 — fixed)
```

---

## 2. Rule Evaluation Architecture

The automation engine is invoked as a Celery task (`run_automation_engine`) daily at 6:00am Fiji time. For each tenant, it:

1. Fetches all `AutomationRule` records where `is_active = True`
2. Groups rules by `trigger_category`
3. For each category, calls the category-specific evaluation function
4. Each evaluation function checks its condition and calls `maybe_create_alert_and_task()`
5. After all rules are evaluated: runs auto-resolution pass
6. After auto-resolution: runs escalation pass

```python
async def run_automation_engine(tenant_id: str, db: AsyncSession) -> EngineRunResult:
    """Main engine loop."""
    rules = await fetch_active_rules(db)

    result = EngineRunResult()

    for rule in rules:
        if not rule.is_active:
            continue  # Extra guard — inactive rules fetched for completeness

        evaluator = CATEGORY_EVALUATORS.get(rule.trigger_category)
        if evaluator is None:
            logger.warning("unknown_trigger_category", category=rule.trigger_category, rule_id=rule.rule_id)
            continue

        eval_results = await evaluator(rule, tenant_id, db)
        result.rules_evaluated += 1
        result.tasks_created += eval_results.tasks_created
        result.alerts_created += eval_results.alerts_created
        result.new_alert_ids.extend(eval_results.new_alert_ids)

    # Post-evaluation passes
    resolved = await run_auto_resolution(tenant_id, db)
    escalated = await run_escalation_check(tenant_id, db)
    result.alerts_resolved = resolved
    result.alerts_escalated = escalated

    return result
```

---

## 3. Rule Evaluation by Trigger Category

All 27 trigger categories and their evaluation logic:

---

### Category 1: ProductionStageProtocol

Generates scheduled tasks based on days elapsed since planting or stage start.

```
Logic:
  1. Query: SELECT * FROM production_cycles
            WHERE cycle_status IN ('active', 'harvesting')
            AND tenant_id = :tenant_id
            AND (production_id = rule.production_id OR rule.production_id IS NULL)

  2. For each active cycle:
     a. Compute days_since_planting = (TODAY - planting_date).days
     b. If rule.days_after_start is set:
        → trigger = (days_since_planting >= rule.days_after_start)
        → AND (days_since_planting < rule.days_after_start + (rule.frequency_days or 7))
        → This creates a "window" to avoid re-triggering every day
     c. If rule.frequency_days is set (recurring):
        → Check if task of this task_type was completed recently:
           SELECT MAX(completed_at) FROM task_queue
           WHERE cycle_id = cycle.id AND task_type = rule.task_type AND status = 'completed'
        → If last_completed_at IS NULL or (TODAY - last_completed_at).days >= rule.frequency_days:
           trigger = True

  3. If trigger: call maybe_create_alert_and_task(rule, cycle, db)
```

Rules in this category: RULE-001 (transplant), RULE-002 (first weeding), RULE-003 (fertilizer), RULE-004 (pest scouting), RULE-005 (preventive spray), RULE-006 (harvest).

---

### Category 2: InventoryAlert

Triggers when an input's stock falls at or below its reorder point.

```
Logic:
  1. Query: SELECT * FROM inputs
            WHERE farm_id IN (SELECT id FROM farms WHERE tenant_id = :tenant_id)
            AND current_stock <= reorder_point
            AND is_active = true

  2. For each low-stock input:
     a. Compute stock_days_remaining:
        SELECT AVG(ABS(qty_change)) / 7 AS avg_daily_usage
        FROM input_transactions
        WHERE input_id = input.id
        AND transaction_type = 'usage'
        AND transaction_date >= TODAY - 30
        → days_remaining = current_stock / avg_daily_usage  (None if no usage history)

     b. Severity:
        - current_stock = 0: severity = 'Critical'
        - current_stock <= reorder_point * 0.5: severity = 'High'
        - current_stock <= reorder_point: severity = 'Medium'

  3. Build raw_data: {input_name, current_stock, unit, reorder_point,
                      supplier_name, lead_time_days, days_remaining}
  4. Call maybe_create_alert_and_task(rule, input_context, db)
```

Rule: RULE-012.

---

### Category 3: TaskOverdue

Identifies tasks in the task_queue that are past their due_date and not completed.

```
Logic:
  1. Query: SELECT * FROM task_queue
            WHERE farm_id IN (farms for tenant)
            AND due_date < TODAY
            AND status NOT IN ('completed', 'cancelled', 'overdue')

  2. For each overdue task:
     a. UPDATE task_queue SET status = 'overdue' WHERE id = task.id
     b. Severity based on how overdue:
        - 1-2 days: 'Medium'
        - 3-7 days: 'High'
        - > 7 days: 'Critical'
     c. Call maybe_create_alert_and_task() with alert type 'task_overdue'
        (task already exists — alert references it)

  3. Do NOT create a new task — the existing task IS the task.
     Just create an alert referencing the overdue task.
```

Rule: RULE-013.

---

### Category 4: WeatherAlert

Generates alerts when recent rainfall exceeds a threshold.

```
Logic:
  1. Query: SELECT SUM(rainfall_mm) AS total_mm
            FROM weather_logs
            WHERE farm_id IN (farms for tenant)
            AND log_date >= TODAY - 3
     (rolling 3-day total rainfall)

  2. If total_mm >= rule.threshold_value (e.g. 100mm in 3 days):
     a. Build raw_data: {farm_id, rainfall_mm=total_mm, period_days=3}
     b. Severity: threshold in rule.severity field
     c. Suggested action: "Delay field operations. Check drainage on low-lying PUs."
     d. Call maybe_create_alert_and_task()

  3. Auto-resolution: if rainfall drops below threshold, resolve open WeatherAlert
```

Rule: RULE-014.

---

### Category 5: NurseryAlert

Alerts when nursery batches are ready for transplanting.

```
Logic:
  1. Query: SELECT * FROM nursery_logs
            WHERE farm_id IN (farms for tenant)
            AND batch_status = 'ready'
            AND expected_transplant_date <= TODAY

  2. For each ready batch:
     a. Severity: 'Medium' (batch is ready, not urgent crisis)
     b. Raw data: {batch_id, crop_name, batch_size, expected_transplant_date}
     c. Task type: 'transplant_nursery_batch'
     d. Call maybe_create_alert_and_task()

  3. Auto-resolution: when batch_status updated to 'transplanted', resolve alert
```

Rule: RULE-015.

---

### Category 6: EquipmentAlert

Basic equipment check — see also RULE-025 MaintenanceDue (advance warning, handled by maintenance_worker).

```
Logic:
  1. Query: SELECT * FROM equipment
            WHERE farm_id IN (farms for tenant)
            AND next_maintenance_date <= TODAY
            AND is_active = true

  2. For each due equipment:
     a. Severity: 'High' if today = due date, 'Critical' if overdue
     b. Call maybe_create_alert_and_task()
```

Rule: RULE-016.

---

### Category 7: HarvestAlert

Triggers when no harvest has been logged on an active cycle for too long.

**SPECIAL RULE:** The default inactivity threshold is 7 days. However, for CRP-KAV (Kava), the threshold is 180 days — Kava's harvest cycle is 4+ years with infrequent harvest events.

```
Logic:
  1. For each active cycle WHERE cycle_status IN ('active', 'harvesting'):
     a. Determine threshold:
        IF cycle.production_id = 'CRP-KAV':
            threshold_days = HARVEST_GAP_KAV_DAYS  (180 days, from settings)
        ELSE:
            threshold_days = rule.threshold_value OR HARVEST_GAP_DEFAULT_DAYS (7)

     b. Find last harvest:
        SELECT MAX(harvest_date) AS last_harvest_date
        FROM harvest_logs
        WHERE cycle_id = cycle.id

     c. If last_harvest_date IS NULL:
        days_since_harvest = (TODAY - cycle.planting_date).days
     ELSE:
        days_since_harvest = (TODAY - last_harvest_date).days

     d. If days_since_harvest > threshold_days:
        severity = rule.severity (typically 'High' for 7-day gap, 'Medium' for informational)
        raw_data = {pu_id, crop_name, days_since_harvest, last_harvest_date, threshold_days}
        Call maybe_create_alert_and_task()

  2. Auto-resolution: when new harvest_log is created for the cycle,
     the days_since_harvest drops to 0 — alert auto-resolved.
```

Rule: RULE-017.

---

### Category 8: CashAlert

Triggers when the farm's net cash balance drops below a threshold.

```
Logic:
  1. Query: SELECT SUM(amount_fjd) AS net_balance
            FROM cash_ledger
            WHERE farm_id = :farm_id

     (Positive entries = income/deposits. Negative entries = expenses.)

  2. If net_balance < rule.threshold_value (default: 0.0 from CASH_RED_THRESHOLD_FJD):
     severity = 'Critical' if net_balance < 0 else 'High'
     raw_data = {farm_id, balance=net_balance, threshold=rule.threshold_value}
     Call maybe_create_alert_and_task()

  3. Auto-resolution: when cash balance rises above threshold, resolve alert
```

Rule: RULE-018.

---

### Category 9: Livestock

Generates tasks when livestock care intervals are overdue.

```
Logic:
  1. Query animals WHERE farm_id in tenant farms
     AND species matches rule.applies_to (if set)
     AND status = 'active'

  2. For each animal:
     a. Find last event of rule.task_type:
        SELECT MAX(event_date) FROM livestock_events
        WHERE animal_id = animal.id AND event_type = rule.task_type

     b. If last_event_date IS NULL:
        days_since = days since animal registration
     ELSE:
        days_since = (TODAY - last_event_date).days

     c. If days_since >= rule.frequency_days:
        raw_data = {animal_code, species, task_type=rule.task_type, days_since}
        Call maybe_create_alert_and_task()

  3. RULE-021 special case (mortality):
     Triggered by a livestock_event of type 'mortality' created within last 24 hours.
     Severity = 'Critical'. Always creates immediate WhatsApp alert.
```

Rules: RULE-019, RULE-021.

---

### Category 10: Apiculture

Generates tasks when hive inspection or harvest intervals are overdue.

```
Logic:
  1. Query hive_register WHERE farm_id in tenant farms AND status = 'active'

  2. For each hive:
     a. Find last log of rule.task_type ('inspection' or 'harvest'):
        SELECT MAX(log_date) FROM hive_logs
        WHERE hive_id = hive.id AND log_type = rule.task_type

     b. If days_since >= rule.frequency_days:
        raw_data = {hive_code, task_type, days_since}
        Call maybe_create_alert_and_task()
```

Rule: RULE-020.

---

### Category 11: Aquaculture (INACTIVE)

Rules RULE-024, RULE-025, RULE-026 have `is_active = False`.

```
Logic:
  The evaluator exists but the is_active guard skips all evaluation:
  if not rule.is_active:
      return EvalResult(skipped=True)
```

Rules: RULE-024, RULE-025, RULE-026 — INACTIVE (Aquaculture business line not yet operational).

---

### Category 12: Pig (INACTIVE)

Rules RULE-027, RULE-028 have `is_active = False`.

```
Logic:
  Same as Aquaculture — evaluator exists, skipped due to is_active = False.
```

Rules: RULE-027, RULE-028 — INACTIVE (Pig farming business line not yet operational).

---

### Category 13: PestDisease

Detects recurring pest patterns across consecutive scoutings.

```
Logic:
  1. For each active cycle in tenant:
     a. Query field_events WHERE event_type = 'pest_scouting'
        AND cycle_id = cycle.id
        AND pest_identified IS NOT NULL
        AND event_date >= TODAY - 14

     b. Group events by pest_identified
     c. For each pest: count events and find date range

     d. If events_count >= 2 AND (most_recent_date - first_date).days <= 7:
        → Same pest identified on 2+ consecutive scoutings within 7 days
        → Pattern detected — escalate to alert
        severity = 'High' (recurring pest = escalating risk)
        raw_data = {pest_name, scouting_dates, pu_id, cycle_id}
        Call maybe_create_alert_and_task()
        Task type: 'pest_treatment_required'

  2. Auto-resolution: when no new pest scouting event with same pest_identified
     in 14 days, resolve alert.
```

Rule: RULE-022.

---

### Category 14: FoodSafety

Pre-harvest scan for chemical withholding period conflicts — early warning version (see also RULE-038 ChemicalCompliance for the hard block).

```
Logic:
  1. Query cycles WHERE cycle_status IN ('active', 'harvesting')
     AND expected_harvest_start <= TODAY + 7
     (upcoming harvests in the next 7 days)

  2. For each upcoming harvest cycle:
     Run compliance_service.check_chemical_compliance(cycle.id, expected_harvest_start, db)

  3. If compliance check finds violations (safe_date > expected_harvest_start):
     severity = 'High' (warning, not yet hard block — harvest hasn't happened)
     Message: "Upcoming harvest on {pu_id} may violate withholding period for
               {chemical_name}. Safe to harvest after {safe_date}."
     raw_data = {cycle_id, pu_id, blocking_chemicals}
     Call maybe_create_alert_and_task()
```

Rule: RULE-023 (early warning), RULE-030 (extended food safety scan, same logic with broader window).

---

### Category 15: Delivery

Alerts on delivery shortage flags.

```
Logic:
  1. Query delivery_log WHERE farm_id in tenant farms
     AND delivery_status = 'shortage_flagged'
     AND delivery_date >= TODAY - 7

  2. For each shortage record:
     raw_data = {delivery_id, buyer_name, shortage_qty_kg, production_name}
     severity = 'Medium'
     Call maybe_create_alert_and_task()

  3. Auto-resolution: when delivery_status updated to 'resolved' or 'cancelled'
```

Rule: RULE-029.

---

### Category 16: Incident

Generates alerts for newly created incident reports.

```
Logic:
  1. Query incident_log WHERE farm_id in tenant farms
     AND created_at >= NOW() - INTERVAL '2 hours'
     AND alert_created = False

  2. For each new incident:
     Severity based on incident_severity field on incident_log
     raw_data = {incident_type, description, reported_by}
     Call maybe_create_alert_and_task()
     UPDATE incident_log SET alert_created = True WHERE id = incident.id

  Note: REPORT_INCIDENT TIS command creates incident_log records.
        This rule converts them into tracked alerts within 2 hours.
```

Rule: RULE-031.

---

### Category 17: HarvestReady

Critical advance notice when harvest window is approaching.

```
Logic:
  1. Query production_cycles WHERE cycle_status = 'active'
     AND expected_harvest_start <= TODAY + 3
     AND expected_harvest_start >= TODAY
     (harvest expected in next 3 days)

  2. For each cycle:
     severity = 'Critical'  (must prepare team and confirm buyers)
     raw_data = {pu_id, crop_name, expected_harvest_start, cycle_id}
     Task: 'Confirm harvest team and buyer for {crop_name} on {pu_id}'
     due_date: expected_harvest_start - 1 day
     Call maybe_create_alert_and_task()
```

Rule: RULE-033.

---

### Category 18: F002FerryBuffer

CRITICAL rule for F002 (Viyasiyasi, Kadavu Island). Kadavu is only accessible by ferry. All inputs must be ordered well in advance. The ferry has a variable schedule (operated by Sea Master Shipping, supplier code SUP-012).

```
Logic:
  ONLY runs for farm_id = F002 (has_ferry_dependency = True).
  For all other farms: skip entirely.

  1. Confirm farm has has_ferry_dependency = True:
     IF farm.has_ferry_dependency = False: RETURN (skip)

  2. Query ALL inputs for F002 farm:
     SELECT i.id, i.input_name, i.current_stock, i.unit,
            i.lead_time_days, i.supplier_id, i.reorder_point
     FROM inputs i
     WHERE i.farm_id = 'F002' AND i.is_active = true

  3. For each input:
     a. Compute avg_daily_usage (same as InventoryAlert)
     b. stock_days_remaining = current_stock / avg_daily_usage  (if usage data exists)
        OR compare current_stock to reorder_point * 2 (conservative estimate if no usage data)

     c. BUFFER THRESHOLD = lead_time_days + F002_FERRY_BUFFER_DAYS (from settings, default 7)
        → Total buffer = lead_time + 7 days additional safety
        → E.g. if lead_time = 7 days: alert when stock < 14 days of supply

     d. If stock_days_remaining < buffer_threshold:
        severity = 'Critical'  (island logistics = always critical)
        raw_data = {
            input_name, current_stock, unit, stock_days=stock_days_remaining,
            lead_time_days, ferry_supplier='Sea Master Shipping (SUP-012)',
            buffer_days=buffer_threshold
        }
        message = "F002 supply warning: {input_name} has ~{stock_days} days of stock.
                   Book ferry with Sea Master Shipping (SUP-012) immediately.
                   Lead time: {lead_time_days} days + 7 day buffer required."
        Call maybe_create_alert_and_task() with IMMEDIATE WhatsApp dispatch

  4. Auto-resolution: stock_days_remaining >= buffer_threshold (reorder received)
```

Rule: RULE-034. This is the highest operational priority rule for F002 operations.

---

### Category 19: PaymentOverdue

Tracks overdue accounts receivable.

```
Logic:
  1. Query accounts_receivable WHERE farm_id in tenant farms
     AND due_date < TODAY - 7
     AND ar_status = 'open'

  2. For each overdue AR:
     days_overdue = (TODAY - due_date).days
     severity = 'High' if days_overdue < 14 else 'Critical'
     raw_data = {customer_name, amount_fjd, invoice_date, due_date, days_overdue}
     Call maybe_create_alert_and_task()
     Task type: 'follow_up_payment'

  3. Auto-resolution: when ar_status updated to 'paid'
```

Rule: RULE-035.

---

### Category 20: HarvestLoss

Detects yield loss gaps between expected and actual harvest.

```
Logic:
  1. Query harvest_reconciliation materialized view:
     SELECT * FROM harvest_reconciliation
     WHERE farm_id in tenant farms
     AND loss_gap_pct > 10.0
     AND reconciliation_date >= TODAY - 7

  2. For each high-loss reconciliation:
     severity = 'Medium' if loss_gap_pct < 20 else 'High'
     raw_data = {pu_id, expected_kg, actual_kg, loss_gap_pct, cycle_id}
     Call maybe_create_alert_and_task()
     Task type: 'investigate_harvest_loss'
```

Rule: RULE-032.

---

### Category 21: AccountsReceivable

Broader AR overdue check (complements PaymentOverdue).

```
Logic:
  1. Query accounts_receivable WHERE ar_status = 'overdue'
     AND farm_id in tenant farms

  2. Summarize total overdue amount:
     total_overdue_fjd = SUM(amount_fjd)
     overdue_count = COUNT(*)

  3. If overdue_count > 0:
     severity = 'High'
     raw_data = {total_overdue_fjd, overdue_count, oldest_due_date}
     Call maybe_create_alert_and_task()
```

Rule: RULE-036.

---

### Category 22: ChemicalCompliance

Hard block on harvest when withholding periods have not elapsed. See also Category 14 (FoodSafety) for the advance warning.

```
Logic:
  1. For all active cycles WHERE cycle_status = 'harvesting':
     Run compliance_service.check_chemical_compliance(cycle.id, TODAY, db)

  2. If compliance check returns compliant = False:
     severity = 'Critical'  (HARD BLOCK — must not harvest)
     blocking_chemicals = compliance.blocking_chemicals
     raw_data = {
         cycle_id, pu_id,
         blocking_chemicals: [
             {chemical_name, application_date, whd_days, safe_harvest_date, days_remaining}
         ]
     }
     → CREATE alert with RULE-038 rule_id
     → UPDATE any pending harvest_log records for this cycle:
        SET compliance_status = 'blocked',
            blocking_chemicals_json = blocking_chemicals_json

  3. Auto-resolution: when all withholding periods have elapsed
     (compliance_service.check_chemical_compliance returns compliant=True)
     → alert auto-resolved
     → harvest_log records un-blocked (compliance_status = 'clear')
```

Rule: RULE-038. CRITICAL severity — always immediate WhatsApp dispatch.

---

### Category 23: RotationDue

Generates rotation recommendation when a cycle is closing or recently closed.

```
Logic:
  1. Query production_cycles WHERE cycle_status IN ('closing', 'closed')
     AND actual_harvest_end >= TODAY - 7
     (recently closed or currently closing)

  2. For each cycle:
     a. Call rotation_service.get_rotation_alternatives(pu_id, db)
        Returns top 3 recommended next productions (from shared.rotation_top_choices)

     b. severity = 'Low' (informational — plan ahead)
     c. raw_data = {pu_id, completed_crop, alternatives: [...]}
     d. Task type: 'plan_next_cycle_rotation'
     e. Call maybe_create_alert_and_task()
        Message: "Cycle complete on {pu_id}. Consider planting: {alt1}, {alt2}, or {alt3} next."
```

Rule: RULE-037.

---

### Category 24: MaintenanceDue

Advance warning 3 days before equipment maintenance is due (the full maintenance check is also run by `maintenance_worker.check_equipment_maintenance`).

```
Logic:
  1. Query equipment WHERE next_maintenance_date BETWEEN TODAY AND TODAY + 3
     AND is_active = true

  2. For each equipment:
     days_until = (next_maintenance_date - TODAY).days
     severity = 'High' if days_until <= 1 else 'Medium'
     raw_data = {equipment_name, maintenance_date, days_until}
     Call maybe_create_alert_and_task()
```

Rule: RULE-041.

---

### Category 25: CashFlowNegative

Detects projected cash shortfalls in the 13-week rolling cashflow forecast.

```
Logic:
  1. Call financial_service.compute_cashflow_forecast(farm_id, db)
     Returns list of 13 weekly projections:
     [{week_start, projected_inflows, projected_outflows, cumulative_balance_fjd}]

  2. Find any weeks WHERE cumulative_balance_fjd < 0

  3. If any negative weeks found:
     first_negative_week = min(week where balance < 0)
     weeks_until_negative = (first_negative_week - TODAY).days // 7
     minimum_balance = min(cumulative_balance_fjd for all 13 weeks)

     severity = 'Critical'
     raw_data = {
         weeks_until_negative, first_negative_week,
         minimum_projected_balance=minimum_balance,
         farm_id
     }
     Message: "Cash flow projection: balance goes NEGATIVE in {weeks_until_negative} weeks.
               Minimum projected balance: FJD {minimum_balance:.2f}. Review expenses."
     Call maybe_create_alert_and_task()
     Task type: 'review_cashflow_urgent'

  4. Auto-resolution: when updated cashflow forecast shows no negative weeks
```

Rule: RULE-039.

---

### Category 26: OrderStatus

Tracks purchase orders that are overdue for delivery.

**Note:** RULE-042 had a column mapping error in v7.0 (mapped to wrong column name). This was fixed in migration `016_subscriptions.py` (column alias correction). Tests in `test_automation_engine.py` confirm the fix.

```
Logic:
  1. Query orders WHERE farm_id in tenant farms
     AND expected_delivery_date < TODAY
     AND order_status NOT IN ('delivered', 'cancelled')

  2. For each overdue order:
     days_overdue = (TODAY - expected_delivery_date).days
     severity = 'Medium' if days_overdue < 3 else 'High'
     raw_data = {
         order_id, supplier_name, input_name, qty_ordered,
         expected_delivery_date, days_overdue, order_status
     }
     Task type: 'follow_up_order_delivery'
     Call maybe_create_alert_and_task()

  3. Auto-resolution: when order_status updated to 'delivered' or 'cancelled'
```

Rules: RULE-040, RULE-042.

---

### Category 27: WorkerPerformance

Tracks worker inactivity — specifically for permanent workers who should be attending regularly.

**Note:** RULE-043 had a column mapping error in v7.0 (used `worker_id` where `id` was correct in the joined query). Fixed in automation_service.py patch. Tests confirm the fix.

```
Logic:
  Only applies to PERMANENT workers (employment_type = 'permanent').
  Casual workers are not tracked for attendance gaps — they're booked per task.

  1. Query workers WHERE farm_id in tenant farms
     AND employment_type = 'permanent'
     AND is_active = true

  2. For each permanent worker:
     SELECT MAX(attendance_date) AS last_attendance
     FROM labor_attendance
     WHERE worker_id = worker.id
     AND attendance_date >= TODAY - 14

     If last_attendance IS NULL (no attendance in 14 days):
       severity = 'High'
       raw_data = {
           worker_code, worker_name, employment_type,
           days_since_attended = 14 + (see below),
           last_known_attendance
       }
       Message: "WORKER INACTIVE: {worker_name} ({worker_code}) has no attendance
                 logged in 14 days. Please check in with worker."
       Task type: 'check_worker_status'
       Call maybe_create_alert_and_task()

  3. Special worker: W-001 Laisenia Waqa (permanent, F001)
     Same logic applies. RULE-043 specifically monitors W-001 and all permanent workers.

  4. Auto-resolution: when new labor_attendance record logged for the worker,
     last_attendance resets and alert is auto-resolved.
```

Rule: RULE-043.

---

## 4. Core Helper: `maybe_create_alert_and_task()`

```python
async def maybe_create_alert_and_task(
    rule: AutomationRule,
    context: dict,       # Contains farm_id, pu_id, raw_data, message
    db: AsyncSession,
) -> AlertTaskResult:
    """
    Checks deduplication, creates alert and task if not duplicate.

    1. Compute alert_key = f"{rule.rule_id}:{context['target_id']}:{week_start}"
       where week_start = DATE_TRUNC('week', CURRENT_DATE)
       and target_id = context.get('pu_id') or context.get('farm_id')

    2. Check: SELECT COUNT(*) FROM alerts
              WHERE alert_key = computed_key AND status = 'open'
       If count > 0: SKIP — duplicate alert exists for this week. Return empty result.

    3. Create alert record:
       INSERT INTO alerts (farm_id, pu_id, rule_id, alert_key, alert_type,
                           severity, status, message, raw_data_json, created_at)
       VALUES (...)

    4. Create task record (if rule.task_type is set):
       due_date = TODAY + SEVERITY_DUE_DAYS[severity]
       INSERT INTO task_queue (farm_id, pu_id, rule_id, task_name, task_type,
                               assigned_to, due_date, priority, status, created_at)
       VALUES (...)

    5. Return AlertTaskResult(alert_id=..., task_id=..., created=True)
    """
```

**SEVERITY_DUE_DAYS:**

| Severity | Days until due |
|----------|---------------|
| Critical | 1 day |
| High | 3 days |
| Medium | 7 days |
| Low | 14 days |

---

## 5. Alert Deduplication

```
alert_key format: '{rule_id}:{target_id}:{week_start}'

Examples:
  'RULE-017:F001-PU001:2025-03-31'  ← HarvestAlert for PU001, week of Mar 31
  'RULE-034:F002:2025-04-07'        ← FerryBuffer alert for F002 farm, week of Apr 7
  'RULE-012:input-uuid-xyz:2025-04-07'  ← LowStock alert for specific input

week_start is computed as: DATE_TRUNC('week', CURRENT_DATE)
(Monday of the current ISO week)

Before creating any alert:
  SELECT COUNT(*) FROM alerts
  WHERE alert_key = :computed_key
  AND status = 'open'

  IF count > 0: DO NOT CREATE. Return without action.
  IF count = 0: CREATE alert.

This means:
  - Each rule can only fire ONCE per target per week
  - Re-evaluating the same condition daily does not spam alerts
  - The weekly window resets on Monday morning (next automation engine run after week_start changes)
```

---

## 6. Auto-Resolution

Runs at the END of each automation engine execution, after all rules have been evaluated.

```python
async def run_auto_resolution(tenant_id: str, db: AsyncSession) -> int:
    """
    Re-evaluates the condition for every currently OPEN alert.
    If the triggering condition is no longer true: auto-resolve the alert.

    Returns: count of alerts auto-resolved in this run.
    """
    open_alerts = await fetch_open_alerts(tenant_id, db)
    resolved_count = 0

    for alert in open_alerts:
        rule = await db.get(AutomationRule, alert.rule_id)
        if rule is None:
            continue

        # Re-evaluate using same category evaluator but in 'check_only' mode
        condition_still_met = await evaluate_condition_check(rule, alert, db)

        if not condition_still_met:
            alert.status = AlertStatus.RESOLVED
            alert.resolved_at = datetime.now(timezone.utc)
            alert.auto_resolved = True
            await db.commit()
            resolved_count += 1
            logger.info("alert_auto_resolved", alert_id=alert.id, rule_id=alert.rule_id)

    return resolved_count
```

**Auto-resolution examples:**

| Rule | Trigger condition | Auto-resolution condition |
|------|-------------------|--------------------------|
| RULE-017 HarvestAlert | days_since_harvest > 7 | New harvest logged, days_since = 0 |
| RULE-012 InventoryAlert | current_stock <= reorder_point | New stock purchase, current_stock > reorder_point |
| RULE-038 ChemicalCompliance | withholding period active | All chemicals cleared withholding period |
| RULE-018 CashAlert | cash balance < threshold | Balance rises above threshold |
| RULE-034 F002FerryBuffer | stock_days < buffer_threshold | New stock received, stock_days >= buffer_threshold |
| RULE-035 PaymentOverdue | ar_status = 'open' past due | AR payment received, ar_status = 'paid' |
| RULE-042 OrderStatus | order overdue | Order delivered or cancelled |
| RULE-043 WorkerPerformance | no attendance in 14 days | New labor attendance record logged |

---

## 7. Alert Escalation

Runs after auto-resolution in the same automation engine execution.

```python
async def run_escalation_check(tenant_id: str, db: AsyncSession) -> int:
    """
    Escalates unresolved alerts based on time thresholds:
      MEDIUM → HIGH after 3 days unresolved
      HIGH → CRITICAL after 7 days unresolved
      CRITICAL: no further escalation (already max severity)

    On escalation:
      1. Update alert.severity to new level
      2. Set alert.escalated_at = NOW()
      3. Increment alert.escalation_count
      4. Re-queue WhatsApp alert send (immediate for HIGH; immediate for CRITICAL)
      5. CRITICAL escalation: also notify all farm managers + Cody

    Returns: count of alerts escalated in this run.
    """
    from config import get_settings
    settings = get_settings()

    open_alerts = await fetch_open_unresolved_alerts(tenant_id, db)
    escalated_count = 0

    for alert in open_alerts:
        days_open = (datetime.now(timezone.utc) - alert.created_at).days

        escalated = False

        if alert.severity == AlertSeverity.MEDIUM and days_open >= settings.ESCALATION_MEDIUM_DAYS:
            alert.severity = AlertSeverity.HIGH
            escalated = True

        elif alert.severity == AlertSeverity.HIGH and days_open >= settings.ESCALATION_HIGH_DAYS:
            alert.severity = AlertSeverity.CRITICAL
            escalated = True

        if escalated:
            alert.escalated_at = datetime.now(timezone.utc)
            alert.escalation_count += 1
            await db.commit()
            escalated_count += 1

            # Re-send WhatsApp at new severity
            from workers.whatsapp_worker import send_whatsapp_alert
            send_whatsapp_alert.apply_async(args=[alert.id], queue="notifications")

            logger.info("alert_escalated",
                alert_id=alert.id,
                rule_id=alert.rule_id,
                new_severity=alert.severity.value,
                days_open=days_open
            )

    return escalated_count
```

**Escalation schedule:**

| From Severity | Days Unresolved | Escalated To | WhatsApp Action |
|--------------|-----------------|-------------|-----------------|
| MEDIUM | 3 days | HIGH | Re-send within 5 minutes |
| HIGH | 7 days | CRITICAL | Re-send immediately, notify ALL managers + Cody |
| CRITICAL | — | No escalation | Already maximum severity |

---

## 8. Task Generation

When `maybe_create_alert_and_task()` creates a task, the following logic determines the task fields:

```python
async def create_task_for_rule(
    rule: AutomationRule,
    farm_id: str,
    pu_id: Optional[str],
    db: AsyncSession,
) -> Optional[str]:  # Returns task_id or None if already exists

    # Determine assigned_to:
    # Default: farm manager for that farm
    # F001: W-001 Laisenia Waqa (permanent worker / farm lead)
    # F002: farm manager user
    assigned_to = await get_default_assignee(farm_id, db)

    # Determine due_date from severity
    due_days = {
        "Critical": 1,
        "High": 3,
        "Medium": 7,
        "Low": 14,
    }
    due_date = date.today() + timedelta(days=due_days[rule.severity])

    # Determine priority from severity
    priority_map = {
        "Critical": TaskPriority.CRITICAL,
        "High": TaskPriority.HIGH,
        "Medium": TaskPriority.MEDIUM,
        "Low": TaskPriority.LOW,
    }

    task = TaskQueue(
        id=str(uuid.uuid4()),
        farm_id=farm_id,
        pu_id=pu_id,
        rule_id=rule.rule_id,
        task_name=derive_task_name(rule),  # Human-readable from rule.task_type
        task_type=rule.task_type,
        assigned_to=assigned_to,
        due_date=due_date,
        priority=priority_map[rule.severity],
        status=TaskStatus.OPEN,
        created_at=datetime.now(timezone.utc),
    )
    db.add(task)
    await db.commit()
    return task.id
```

---

## 9. WhatsApp Message Templates

All templates stored in `core/constants.py` under `WHATSAPP_TEMPLATES` dict, keyed by `rule_id`. Templates use Python `.format()` style placeholders populated from `alert.raw_data_json`.

Language register: Fijian-English mixed language appropriate for Fiji agricultural context.

```python
# core/constants.py (excerpt)
WHATSAPP_TEMPLATES = {

    "RULE-001": (
        "📋 Task Due | {pu_id}: Transplant seedlings — {crop_name}.\n"
        "Day 0 of cycle {cycle_id}. Seedling batch: {batch_id}.\n"
        "Please confirm completion in TFOS when done.\n"
        "Due: {due_date}"
    ),

    "RULE-002": (
        "🌿 Task Due | {pu_id}: First weeding required — {crop_name}.\n"
        "Remove all weeds from planting beds and pathways.\n"
        "Complete and log in TFOS by {due_date}."
    ),

    "RULE-003": (
        "🌱 Fertilizer Application Due | {pu_id} — {crop_name}.\n"
        "Vegetative stage fertilizer due. Apply NPK as per protocol.\n"
        "Log application in TFOS (chemical name + quantity).\n"
        "Due: {due_date}"
    ),

    "RULE-004": (
        "🔍 Pest Scouting Required | {pu_id} — {crop_name}.\n"
        "Check leaves (top and bottom), stems, and soil surface.\n"
        "Log all findings in TFOS — even if no pests found.\n"
        "Due: {due_date}"
    ),

    "RULE-005": (
        "💊 Preventive Spray Due | {pu_id} — {crop_name}.\n"
        "Chemical: {chemical_name}\n"
        "Apply as per protocol schedule. Wear full PPE.\n"
        "⚠️ Withholding period: {whd_days} days. Do NOT harvest before {safe_date}.\n"
        "Log spray in TFOS immediately after application.\n"
        "Due: {due_date}"
    ),

    "RULE-006": (
        "🌾 Harvest Due | {pu_id} — {crop_name}.\n"
        "Schedule harvest team. Confirm buyer before cutting.\n"
        "Log yield (kg) and price in TFOS when complete.\n"
        "Due: {due_date}"
    ),

    "RULE-012": (
        "⚠️ LOW STOCK ALERT | {farm_id}\n"
        "Item: {input_name}\n"
        "Current stock: {current_stock} {unit}\n"
        "Reorder point: {reorder_point} {unit}\n"
        "Days remaining: ~{days_remaining} days\n"
        "Supplier: {supplier_name} (lead time: {lead_time_days} days)\n"
        "Please order immediately to avoid running out."
    ),

    "RULE-013": (
        "🔴 OVERDUE TASK | {farm_id}\n"
        "Task: {task_name}\n"
        "PU: {pu_id}\n"
        "Was due: {due_date}\n"
        "Days overdue: {days_overdue}\n"
        "Please complete this task immediately and update in TFOS."
    ),

    "RULE-014": (
        "🌧️ Weather Alert | {farm_id}\n"
        "Heavy rain detected. Total rainfall: {rainfall_mm}mm in last 3 days.\n"
        "Consider delaying:\n"
        "• Spray applications (rain reduces effectiveness)\n"
        "• Harvesting (soil compaction risk)\n"
        "• Fertilizer application (leaching risk)\n"
        "Log weather data in TFOS daily."
    ),

    "RULE-015": (
        "🌱 Nursery Ready | {farm_id}\n"
        "Seedling batch {batch_id} — {crop_name} is ready for transplanting.\n"
        "Expected transplant date was: {expected_transplant_date}\n"
        "Target PU: {target_pu}\n"
        "Please transplant this week and update batch status in TFOS."
    ),

    "RULE-016": (
        "🔧 Equipment Check Due | {farm_id}\n"
        "Equipment: {equipment_name}\n"
        "Maintenance due: {maintenance_date}\n"
        "Please schedule service or inspection.\n"
        "Update next maintenance date in TFOS after completion."
    ),

    "RULE-017": (
        "⚠️ HARVEST GAP ALERT | {farm_id}\n"
        "PU: {pu_id} — {crop_name}\n"
        "No harvest logged for {days_since_harvest} days.\n"
        "Last harvest: {last_harvest_date}\n"
        "Please check:\n"
        "• Is the cycle still active?\n"
        "• Have harvests been occurring but not logged?\n"
        "• Is there a crop failure?\n"
        "Update cycle status or log harvests in TFOS."
    ),

    "RULE-018": (
        "💸 LOW CASH ALERT | {farm_id}\n"
        "Current cash balance: FJD {balance:.2f}\n"
        "This is below the minimum threshold of FJD {threshold:.2f}.\n"
        "Immediate action required:\n"
        "• Review upcoming expenses\n"
        "• Follow up on any outstanding payments\n"
        "• Consider advancing harvest if crop is ready\n"
        "Check full cashflow in TFOS."
    ),

    "RULE-019": (
        "🐄 Livestock Task Due | {farm_id}\n"
        "Animal: {animal_code} ({species})\n"
        "Task: {task_type}\n"
        "Days since last {task_type}: {days_since} days\n"
        "Please attend to animal and log event in TFOS.\n"
        "Due: {due_date}"
    ),

    "RULE-020": (
        "🐝 Apiculture Task Due | {farm_id}\n"
        "Hive: {hive_code}\n"
        "Task: {task_type}\n"
        "Days since last {task_type}: {days_since} days\n"
        "Please inspect hive and log in TFOS.\n"
        "Due: {due_date}"
    ),

    "RULE-021": (
        "🚨 CRITICAL — LIVESTOCK MORTALITY | {farm_id}\n"
        "Animal: {animal_code} ({species})\n"
        "Mortality recorded at: {event_time}\n"
        "IMMEDIATE ACTIONS REQUIRED:\n"
        "1. Isolate body from rest of herd\n"
        "2. Contact vet immediately\n"
        "3. Check all other animals for symptoms\n"
        "4. Update mortality record in TFOS with cause if known\n"
        "Vet contact: {vet_name} — {vet_phone}"
    ),

    "RULE-022": (
        "🐛 PEST PATTERN DETECTED | {farm_id}\n"
        "PU: {pu_id} — {crop_name}\n"
        "Pest: {pest_name}\n"
        "Identified on {scouting_count} consecutive scoutings.\n"
        "Scouting dates: {scouting_dates}\n"
        "ACTION REQUIRED: Check GET_PROTOCOL {pest_name} in TFOS for treatment.\n"
        "Log treatment application when complete."
    ),

    "RULE-023": (
        "⚠️ PRE-HARVEST COMPLIANCE WARNING | {farm_id}\n"
        "PU: {pu_id} — {crop_name}\n"
        "Upcoming harvest on {expected_harvest_start} may conflict with chemical withholding period.\n"
        "Blocking chemical: {chemical_name}\n"
        "Applied: {application_date} | WHD: {whd_days} days\n"
        "Safe to harvest after: {safe_date}\n"
        "Please adjust harvest date or obtain FOUNDER override."
    ),

    "RULE-029": (
        "📦 Delivery Shortage | {farm_id}\n"
        "Delivery {delivery_id} to {buyer_name} flagged as shortage.\n"
        "Crop: {production_name}\n"
        "Shortage qty: {shortage_qty_kg} kg\n"
        "Please follow up with buyer and update delivery record in TFOS."
    ),

    "RULE-030": (
        "🔬 Food Safety Scan | {farm_id}\n"
        "Chemical compliance check on active harvesting cycles.\n"
        "Potential violation detected on {pu_id}.\n"
        "Check TFOS for full compliance report before any harvesting."
    ),

    "RULE-031": (
        "📋 New Incident Reported | {farm_id}\n"
        "Incident type: {incident_type}\n"
        "Reported by: {reported_by}\n"
        "Description: {description}\n"
        "Please review and update status in TFOS.\n"
        "If urgent, escalate immediately."
    ),

    "RULE-032": (
        "📉 Harvest Loss Detected | {farm_id}\n"
        "PU: {pu_id}\n"
        "Expected: {expected_kg} kg | Actual: {actual_kg} kg\n"
        "Loss gap: {loss_gap_pct:.1f}%\n"
        "Please investigate and log findings as a field event.\n"
        "Task: {task_type} due {due_date}"
    ),

    "RULE-033": (
        "🌾 HARVEST READY | {farm_id}\n"
        "PU: {pu_id} — {crop_name}\n"
        "Expected harvest start: {expected_date}\n"
        "ACTIONS REQUIRED by {due_date}:\n"
        "1. Confirm harvest team availability\n"
        "2. Contact buyer to confirm order\n"
        "3. Check chemical compliance in TFOS\n"
        "4. Prepare harvest containers/packaging\n"
        "5. Book transport if needed"
    ),

    "RULE-034": (
        "🚨 F002 SUPPLY WARNING — KADAVU ISLAND | F002\n"
        "Item: {input_name}\n"
        "Current stock: {current_stock} {unit}\n"
        "Estimated days remaining: ~{stock_days} days\n"
        "Lead time (ferry): {lead_time_days} days + 7 day buffer\n"
        "⛴️ Book ferry with Sea Master Shipping (SUP-012) IMMEDIATELY.\n"
        "Do NOT wait — ferry schedule is irregular.\n"
        "Order minimum quantity to cover {buffer_days} days of supply."
    ),

    "RULE-035": (
        "💰 Payment Overdue | {farm_id}\n"
        "Customer: {customer_name}\n"
        "Invoice amount: FJD {amount_fjd:.2f}\n"
        "Invoice date: {invoice_date}\n"
        "Due date: {due_date}\n"
        "Days overdue: {days_overdue} days\n"
        "Please follow up on payment. Update AR status in TFOS when received."
    ),

    "RULE-036": (
        "📊 Accounts Receivable Overdue | {farm_id}\n"
        "Total overdue: FJD {total_overdue_fjd:.2f}\n"
        "Overdue invoices: {overdue_count}\n"
        "Oldest due date: {oldest_due_date}\n"
        "Please review AR report in TFOS and follow up with customers."
    ),

    "RULE-037": (
        "🌱 Rotation Planning Due | {farm_id}\n"
        "PU: {pu_id} — {completed_crop} cycle complete.\n"
        "Recommended next crops:\n"
        "1. {alt1_name} ({alt1_status})\n"
        "2. {alt2_name} ({alt2_status})\n"
        "3. {alt3_name} ({alt3_status})\n"
        "Check full rotation options in TFOS before starting next cycle."
    ),

    "RULE-038": (
        "🚫 CHEMICAL COMPLIANCE BLOCK | {farm_id}\n"
        "Harvest BLOCKED on {pu_id} — {crop_name}\n"
        "Blocking chemical: {chemical_name}\n"
        "Application date: {application_date}\n"
        "Withholding period: {whd_days} days\n"
        "Safe to harvest after: {safe_date}\n"
        "Days remaining: {days_remaining} days\n"
        "DO NOT HARVEST until safe date.\n"
        "Contact farm manager if override is required (FOUNDER approval needed)."
    ),

    "RULE-039": (
        "💸 CASHFLOW NEGATIVE PROJECTION | {farm_id}\n"
        "⚠️ Cash flow will go NEGATIVE in {weeks_until_negative} weeks.\n"
        "First negative week: {first_negative_week}\n"
        "Projected minimum balance: FJD {minimum_projected_balance:.2f}\n"
        "URGENT: Review cashflow forecast in TFOS.\n"
        "Consider: delaying expenses, advancing harvest, or following up payments."
    ),

    "RULE-040": (
        "📦 Overdue Order | {farm_id}\n"
        "Order from: {supplier_name}\n"
        "Item: {input_name} ({qty_ordered} {unit})\n"
        "Expected delivery: {expected_delivery_date}\n"
        "Days overdue: {days_overdue} days\n"
        "Status: {order_status}\n"
        "Please follow up with supplier and update order status in TFOS."
    ),

    "RULE-041": (
        "🔧 Maintenance Due Soon | {farm_id}\n"
        "Equipment: {equipment_name}\n"
        "Maintenance due: {maintenance_date} ({days_until} days away)\n"
        "Please schedule service in advance.\n"
        "Update next maintenance date in TFOS after completion."
    ),

    "RULE-042": (
        "📦 Order Status Update Needed | {farm_id}\n"
        "Order {order_id} from {supplier_name} is overdue.\n"
        "Please confirm delivery status and update in TFOS.\n"
        "Expected: {expected_delivery_date}"
    ),

    "RULE-043": (
        "👷 Worker Inactive | {farm_id}\n"
        "Worker: {worker_name} ({worker_code})\n"
        "Employment type: Permanent\n"
        "No attendance logged in 14 days.\n"
        "Last recorded attendance: {last_known_attendance}\n"
        "Please check in with {worker_name} and log attendance in TFOS."
    ),
}
```

---

## 10. Version History Notes

### v7.0 Bug Fixes (RULE-042 and RULE-043)

**RULE-042 (OrderStatus extended):**
- **Bug:** Column mapping error — evaluation query used `order_id` field where the JOIN expected `orders.id`. This caused the rule to return empty results (no alerts generated) for all overdue orders.
- **Fix:** Corrected column reference in `automation_service.py` `evaluate_order_status()` function. Query now correctly uses `orders.id` and maps to `order_id` in raw_data.
- **Test:** `test_automation_engine.py::test_rule_042_order_status_column_fix`

**RULE-043 (WorkerPerformance):**
- **Bug:** Column mapping error — the JOIN between `labor_attendance` and `workers` used `labor_attendance.worker_id = workers.worker_id` instead of the correct `labor_attendance.worker_id = workers.id`. This caused ALL permanent workers to appear "inactive" even when attendance was logged.
- **Fix:** Corrected JOIN condition in `automation_service.py` `evaluate_worker_performance()` function to use `workers.id`.
- **Test:** `test_automation_engine.py::test_rule_043_worker_performance_column_fix`

Both fixes were deployed as hotfixes in patch v7.0.1 and are covered by regression tests.
