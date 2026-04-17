# FILE: 09_knowledge_base/AUTOMATION_RULES_REFERENCE.md

# Teivaka TFOS — Automation Rules Reference
**Total Rules:** 43 (38 active, 5 inactive)
**Engine:** Celery Beat scheduler + FastAPI automation module
**Delivery:** WhatsApp via Twilio (primary) + in-app alert
**Last Updated:** 2026-04-07

---

## Overview

The Automation Engine runs on a 15-minute scan cycle (Celery Beat) and evaluates all 43 rules against current farm data for each active tenant. When a rule condition is met, it:
1. Creates an alert record in the `alerts` table
2. Queues a WhatsApp notification via Celery notification queue
3. Creates a task record in `task_queue` where appropriate
4. Deduplicates: does NOT create a duplicate alert if the same rule fired in the last 24 hours for the same entity (farm/PU/worker/hive)

Alert escalation (applies to all rules unless specified otherwise):
- MEDIUM alert open for 3 days → upgraded to HIGH
- HIGH alert open for 7 days → upgraded to CRITICAL
- CRITICAL alerts cannot auto-escalate further; Cody must manually resolve

WhatsApp message language: Mixed Fijian-English ("Vinaka!" for confirmations, direct English for technical details). Keep messages under 160 characters where possible for SMS fallback compatibility.

---

## RULE-001: ProductionStageProtocol — Seedbed Preparation Due

**Status:** ACTIVE
**Trigger:** A production cycle is in status 'planned' and proposed_planting_date is within 14 days from today, but no Seedbed Preparation field event has been logged for this PU in the past 7 days.
**Output:** Task created (TASK-SEEDBED-{pu_id}) + Alert (LOW)
**Severity:** LOW
**Frequency:** Daily scan at 18:05 UTC (6:05 AM Fiji)
**Farm Applicability:** Both F001 and F002, all crop types
**WhatsApp Message Template:**
```
[TFOS] PU{pu_id} {crop_name}: Seedbed prep due before {planting_date}.
Soil test, clear weeds, add compost. Vinaka!
```
**Resolution Condition:** A field_event with event_type='seedbed_preparation' is logged for this PU within the alert validity window. Auto-resolves.
**Developer Note:** Check cycle_status='planned' AND (proposed_planting_date - CURRENT_DATE) <= 14. Field event lookup: `SELECT COUNT(*) FROM field_events WHERE pu_id = $1 AND event_type = 'seedbed_preparation' AND event_date >= NOW() - INTERVAL '7 days'`

---

## RULE-002: ProductionStageProtocol — Nursery Start Due

**Status:** ACTIVE
**Trigger:** A production cycle enters 'planned' status for any transplanted crop (eggplant, tomato, capsicum, cabbage, chilli), and no nursery batch has been created for this cycle in nursery_log within 5 days of planting schedule.
**Output:** Task created + Alert (LOW)
**Severity:** LOW
**Frequency:** Daily scan
**Farm Applicability:** Both farms, transplanted crops only
**WhatsApp Message Template:**
```
[TFOS] {crop_name} on {pu_id}: Start nursery now — planting in {days_to_planting} days.
Log batch at app.teivaka.com. Vinaka!
```
**Resolution Condition:** nursery_log record created for the associated cycle_id. Auto-resolves.
**Developer Note:** Transplanted crop list is maintained in shared.productions column `transplanted = true`. Query: `SELECT transplanted FROM shared.productions WHERE production_id = $1`

---

## RULE-003: ProductionStageProtocol — Transplanting Due

**Status:** ACTIVE
**Trigger:** nursery_log shows batch_status = 'ready' for 3+ days and no transplant event logged.
**Output:** Task created + Alert (MEDIUM)
**Severity:** MEDIUM
**Frequency:** Daily scan
**Farm Applicability:** Both farms
**WhatsApp Message Template:**
```
[TFOS] ⚠ {crop_name} nursery batch {batch_id} READY for transplant for 3+ days.
Transplant ASAP — seedlings may bolt or weaken. PU{pu_id}. Vinaka!
```
**Resolution Condition:** field_event of type 'transplanting' logged for the associated PU. Auto-resolves.
**Developer Note:** batch_status = 'ready' AND (CURRENT_DATE - batch_ready_date) >= 3. Cross-reference nursery_log.cycle_id to get pu_id.

---

## RULE-004: ProductionStageProtocol — First Fertilization Due

**Status:** ACTIVE
**Trigger:** Production cycle is in 'vegetative' stage AND no fertilization event logged in the last 21 days.
**Output:** Task created + Alert (MEDIUM)
**Severity:** MEDIUM
**Frequency:** Daily scan
**Farm Applicability:** Both farms, all annual crops
**WhatsApp Message Template:**
```
[TFOS] {crop_name} PU{pu_id}: No fertilizer logged in 21 days.
Apply NPK as per protocol. Log in TFOS. Vinaka, {worker_name}!
```
**Resolution Condition:** field_event of type 'fertilization' logged for this PU within the current vegetative stage. Auto-resolves.
**Developer Note:** Stage check: join production_cycles to shared.production_stages. Fertilization event: event_type = 'fertilization' OR event_type = 'top_dressing'.

---

## RULE-005: ProductionStageProtocol — First Pest Scouting Due

**Status:** ACTIVE
**Trigger:** Production cycle enters 'vegetative' stage AND no pest scouting event logged in the last 7 days.
**Output:** Task created + Alert (LOW)
**Severity:** LOW
**Frequency:** Daily scan
**Farm Applicability:** Both farms
**WhatsApp Message Template:**
```
[TFOS] {crop_name} PU{pu_id}: Weekly pest scout overdue.
Check leaves, soil surface, record findings in TFOS. Vinaka!
```
**Resolution Condition:** field_event of type 'pest_scouting' logged for this PU in the last 7 days. Auto-resolves.
**Developer Note:** 7-day rolling window from CURRENT_DATE. This rule resets every 7 days — it will fire weekly if scouting is never done.

---

## RULE-006: ProductionStageProtocol — Flowering Stage Alert

**Status:** ACTIVE
**Trigger:** Production cycle stage changes to 'flowering' (auto-detected by days-from-planting threshold OR manual stage update by farm worker).
**Output:** Alert (LOW) + informational task
**Severity:** LOW
**Frequency:** Triggered on stage change event (not scheduled scan)
**Farm Applicability:** Both farms, fruiting crops (Solanaceae, Cucurbitaceae, fruits)
**WhatsApp Message Template:**
```
[TFOS] {crop_name} PU{pu_id} is FLOWERING. 🌸
Avoid pesticides during flowering — bee activity active. Log flower count if benchmarking. Vinaka!
```
**Resolution Condition:** Informational only — auto-resolves after 48 hours.
**Developer Note:** Trigger via webhook from stage_transition event in production_cycles table. No scheduled scan needed — event-driven only.

---

## RULE-007: ProductionStageProtocol — Fruit Set Monitoring Due

**Status:** ACTIVE
**Trigger:** Production cycle in 'fruiting' stage AND no fruit_count or quality_check event logged in the last 10 days.
**Output:** Task created + Alert (LOW)
**Severity:** LOW
**Frequency:** Daily scan
**Farm Applicability:** Both farms, fruiting crops
**WhatsApp Message Template:**
```
[TFOS] {crop_name} PU{pu_id}: Fruit monitoring due.
Count fruits per plant on 5 sample plants, log to TFOS. Vinaka!
```
**Resolution Condition:** field_event of type 'quality_check' or 'fruit_count' logged. Auto-resolves.

---

## RULE-008: ProductionStageProtocol — Pre-Harvest Chemical Check

**Status:** ACTIVE
**Trigger:** Production cycle approaching harvest date (≤14 days from estimated harvest date) AND the last chemical application for this PU exists in field_events.
**Output:** Alert (HIGH) + auto-runs check_chemical_compliance()
**Severity:** HIGH
**Frequency:** Daily scan during final 14 days before harvest
**Farm Applicability:** Both farms, all chemical-using crops
**WhatsApp Message Template:**
```
[TFOS] ⚠ PRE-HARVEST CHECK: {crop_name} PU{pu_id}.
Last chemical: {chemical_name} on {application_date}.
WHD ends: {safe_harvest_date}. {'SAFE TO HARVEST' if compliant else 'DO NOT HARVEST UNTIL ' + safe_harvest_date}.
```
**Resolution Condition:** Withholding period ends (auto-resolves on safe_harvest_date).
**Developer Note:** Call `check_chemical_compliance(pu_id, proposed_harvest_date)` and include result in alert. This is an informational version of RULE-038 — it warns rather than blocks, because harvest has not been attempted yet.

---

## RULE-009: ProductionStageProtocol — Harvest Start Notification

**Status:** ACTIVE
**Trigger:** Production cycle enters 'harvesting' stage (manually set or auto-triggered by reaching estimated harvest date).
**Output:** Alert (LOW) + task for harvest team assembly
**Severity:** LOW
**Frequency:** Event-triggered on stage transition
**Farm Applicability:** Both farms
**WhatsApp Message Template:**
```
[TFOS] 🌿 HARVEST TIME: {crop_name} PU{pu_id} is ready for harvest!
Estimated yield: {estimated_yield_kg}kg. Assign harvest team. Log each pick to TFOS. Vinaka, {manager_name}!
```
**Resolution Condition:** First harvest_log record created for this cycle. Auto-resolves.

---

## RULE-010: ProductionStageProtocol — Post-Harvest Soil Rest Reminder

**Status:** ACTIVE
**Trigger:** Production cycle status changes to 'closed' (harvest complete).
**Output:** Alert (LOW) + informational message about rotation
**Severity:** LOW
**Frequency:** Event-triggered on cycle closure
**Farm Applicability:** Both farms
**WhatsApp Message Template:**
```
[TFOS] {crop_name} PU{pu_id} cycle CLOSED.
Rest this plot for {min_rest_days} days before replanting.
Run rotation check before next cycle. Vinaka!
```
**Resolution Condition:** Informational — auto-resolves after 24 hours.

---

## RULE-011: ProductionStageProtocol — Cycle Approaching Maximum Duration

**Status:** ACTIVE
**Trigger:** Production cycle has been in 'active' or 'harvesting' status for more than 90% of its expected duration but cycle_status has not been updated to 'closing' or 'closed'.
**Output:** Alert (MEDIUM)
**Severity:** MEDIUM
**Frequency:** Daily scan
**Farm Applicability:** Both farms
**WhatsApp Message Template:**
```
[TFOS] ⚠ {crop_name} PU{pu_id}: Cycle near max duration.
Update cycle status — is harvest complete? Log completion or extend cycle in TFOS.
```
**Resolution Condition:** Cycle status updated to 'closing', 'closed', or cycle_end_date extended in system. Auto-resolves.
**Developer Note:** Expected duration from shared.productions.expected_cycle_days. Calculate: (CURRENT_DATE - actual_start_date) / expected_cycle_days > 0.90.

---

## RULE-012: InventoryAlert — Low Stock Reorder

**Status:** ACTIVE
**Trigger:** Any input in the `inputs` table where `current_stock_qty <= reorder_point` for the active tenant.
**Output:** Alert (MEDIUM) + task to reorder
**Severity:** MEDIUM
**Frequency:** Daily scan
**Farm Applicability:** Both farms (F002 items must account for ferry lead time — see RULE-034)
**WhatsApp Message Template:**
```
[TFOS] ⚠ LOW STOCK: {input_name} on {farm_id}.
Stock: {current_stock}{unit}. Reorder point: {reorder_point}{unit}.
Reorder now. Supplier: {supplier_name} ({supplier_contact}).
```
**Resolution Condition:** `current_stock_qty > reorder_point` after restocking is logged. Auto-resolves.
**Developer Note:** Query: `SELECT * FROM inputs WHERE tenant_id = $1 AND current_stock_qty <= reorder_point`. F002 inputs that are low should ALSO trigger RULE-034 if ferry buffer not met.

---

## RULE-013: TaskOverdue — Overdue Task Escalation

**Status:** ACTIVE
**Trigger:** Any record in `task_queue` where `due_date < CURRENT_DATE` AND `task_status = 'open'`.
**Output:** Alert (MEDIUM) + escalation message
**Severity:** MEDIUM → escalates to HIGH after 3 days open
**Frequency:** Daily scan at 18:05 UTC
**Farm Applicability:** Both farms
**WhatsApp Message Template:**
```
[TFOS] ⚠ OVERDUE TASK: {task_title}
Due: {due_date}. Days overdue: {days_overdue}. Assigned to: {assignee_name}.
Complete or reassign in TFOS. Vinaka!
```
**Resolution Condition:** `task_status` updated to 'completed' in task_queue. Auto-resolves.
**Developer Note:** Do not re-fire alert if alert already exists for this task_id and is still open (deduplication by task_id).

---

## RULE-014: WeatherAlert — Heavy Rainfall Warning

**Status:** ACTIVE
**Trigger:** weather_log entry for the farm's location shows `rainfall_mm >= 50` in the last 24 hours OR weather forecast service returns heavy rain warning.
**Output:** Alert (HIGH)
**Severity:** HIGH
**Frequency:** Every 3 hours (weather check), or on weather log insert (event-triggered)
**Farm Applicability:** Both farms (F002 Kadavu is especially high risk — island flooding)
**WhatsApp Message Template:**
```
[TFOS] 🌧 HEAVY RAIN ALERT: {farm_name}.
{rainfall_mm}mm in last 24h. Check drainage on low-lying zones.
Delay fertilizer application. Protect nursery. Vinaka!
```
**Resolution Condition:** rainfall_mm < 25 for 24 consecutive hours in weather_log. Auto-resolves.
**Developer Note:** Weather data source: auto-logged from weather station or manual entry. If forecast API integrated (future feature), trigger before rainfall occurs. For F002 Kadavu: also check if any ferry deliveries scheduled during heavy rain window — flag potential delivery disruption.

---

## RULE-015: NurseryAlert — Transplant Ready

**Status:** ACTIVE
**Trigger:** nursery_log record shows `batch_status = 'ready'` for the first time (status just changed from 'germinating' to 'ready').
**Output:** Alert (LOW) + task
**Severity:** LOW
**Frequency:** Event-triggered on nursery_log status change
**Farm Applicability:** Both farms
**WhatsApp Message Template:**
```
[TFOS] 🌱 NURSERY READY: {batch_name} ({seedling_count} seedlings) for {crop_name} PU{pu_id}.
Transplant within 5 days. Prepare receiving bed first. Vinaka, {manager_name}!
```
**Resolution Condition:** nursery_log batch_status updated to 'transplanted'. Auto-resolves.

---

## RULE-016: EquipmentAlert — Maintenance Overdue

**Status:** ACTIVE
**Trigger:** Any equipment record in `equipment_log` where `next_maintenance_due <= CURRENT_DATE` and `maintenance_status != 'completed'`.
**Output:** Alert (MEDIUM)
**Severity:** MEDIUM
**Frequency:** Daily scan
**Farm Applicability:** Both farms
**WhatsApp Message Template:**
```
[TFOS] 🔧 MAINTENANCE DUE: {equipment_name} ({equipment_id}).
Due: {next_maintenance_due}. Days overdue: {days_overdue}.
Schedule service immediately. Log completion in TFOS.
```
**Resolution Condition:** `maintenance_status = 'completed'` logged for this equipment with `service_date >= next_maintenance_due`. Auto-resolves.
**Developer Note:** Consider creating a task record for W-001 Laisenia Waqa (permanent worker) to action equipment maintenance.

---

## RULE-017: HarvestAlert — Harvest Gap Too Long

**Status:** ACTIVE
**Trigger:** Any active production cycle in 'harvesting' stage where the last harvest_log entry for that cycle is more than `inactivity_alert_days` days ago.

**CRITICAL THRESHOLD OVERRIDE:**
- Default `inactivity_alert_days`: 7 days (all crops)
- CRP-KAV (Kava) OVERRIDE: `inactivity_alert_days = 180 days`

This means CRP-KAV cycles will NOT trigger this alert unless there has been no harvest-related activity for 180 days. This is correct behavior — kava is a 4-year crop.

**Output:** Alert (MEDIUM → HIGH)
**Severity:** MEDIUM
**Frequency:** Daily scan
**Farm Applicability:** Both farms
**WhatsApp Message Template (standard crops):**
```
[TFOS] ⚠ HARVEST GAP: {crop_name} PU{pu_id} — no harvest logged in {days_since_harvest} days.
Inspect crop condition. Log harvest or flag issue. Vinaka!
```
**WhatsApp Message Template (CRP-KAV after 180 days):**
```
[TFOS] ⚠ KAVA CHECK: {pu_id} — no kava activity in {days_since_harvest} days.
Inspect kava plants. Update activity log in TFOS. Vinaka!
```
**Resolution Condition:** New harvest_log entry created for the cycle. Auto-resolves.
**Developer Note:**
```sql
SELECT inactivity_alert_days
FROM shared.production_thresholds
WHERE production_id = cycle.production_id;
-- Returns 7 for most crops, 180 for CRP-KAV
-- Use this value in the WHERE clause, not a hardcoded constant
```

---

## RULE-018: CashAlert — Cash Balance Below Minimum

**Status:** ACTIVE
**Trigger:** Net cash balance in cash_ledger for the tenant falls below FJD 100. Computed as: `SUM(amount_fjd WHERE direction='in') - SUM(amount_fjd WHERE direction='out')`.
**Output:** Alert (HIGH)
**Severity:** HIGH
**Frequency:** Triggered on every cash_ledger INSERT (event-driven) + daily scan
**Farm Applicability:** Both farms (single shared cash ledger for Teivaka tenant)
**WhatsApp Message Template:**
```
[TFOS] ⚠ LOW CASH ALERT: Balance is FJD{balance:.2f}.
Review expenses. Collect outstanding AR. Contact buyers for advance.
Do not make non-essential purchases. Vinaka, Cody!
```
**Resolution Condition:** Cash balance exceeds FJD 200 after new income logged. Auto-resolves.
**Developer Note:** Compute balance in real-time from cash_ledger — do not use a cached balance field. This rule's trigger is event-driven: add it as a post-insert trigger on cash_ledger OR compute in daily scan. Cody's WhatsApp (founder) receives this alert directly.

---

## RULE-019: Livestock WeighAnimal — Monthly Weight Check

**Status:** ACTIVE
**Trigger:** Any livestock animal record in the `livestock_register` where `last_weigh_date < CURRENT_DATE - INTERVAL '30 days'` AND `animal_status = 'active'`.
**Output:** Task created + Alert (MEDIUM)
**Severity:** MEDIUM
**Frequency:** Daily scan
**Farm Applicability:** F002 only (LIV-GOA — 8 goats: LIV-F002-001 through LIV-F002-008)
**WhatsApp Message Template:**
```
[TFOS] 🐐 WEIGH GOATS: {animal_count} goats on F002 due for weight check.
Animals: {animal_ids}. Last weighed: {last_weigh_date}.
Record weights in TFOS. Vinaka, {f002_coordinator}!
```
**Resolution Condition:** `last_weigh_date` updated to CURRENT_DATE for all triggered animals. Auto-resolves.
**Developer Note:** Send message to F002 contact (currently Cody's WhatsApp until F002 coordinator assigned — see OPEN_QUESTIONS.md Q3). Group all overdue animals in a single alert message, not one alert per animal.

---

## RULE-020: Livestock Vaccination — Schedule Alert

**Status:** ACTIVE
**Trigger:** Any livestock animal where `next_vaccination_due <= CURRENT_DATE + INTERVAL '7 days'` AND `vaccination_status != 'up_to_date'`.
**Output:** Alert (HIGH) + task
**Severity:** HIGH
**Frequency:** Daily scan
**Farm Applicability:** F002 (goats), F001 if livestock added
**WhatsApp Message Template:**
```
[TFOS] 💉 VACCINATION DUE: {animal_count} goats on F002 due for {vaccine_name}.
Due date: {due_date}. Contact vet or apply on-farm if qualified.
Log vaccination in TFOS immediately after. Vinaka!
```
**Resolution Condition:** Vaccination event logged for all triggered animals. Auto-resolves.
**Developer Note:** Vaccine schedule is stored in `livestock_vaccination_schedule` table (vaccine_name, frequency_days, last_given_date, next_due). Alert fires 7 days before due date to allow vet scheduling.

---

## RULE-021: Livestock MortalityResponse — Animal Death CRITICAL Alert

**Status:** ACTIVE
**Trigger:** `livestock_register.animal_status` updated to 'deceased' OR a mortality event logged in field_events.
**Output:** Alert (CRITICAL) — immediate, no deduplication delay
**Severity:** CRITICAL
**Frequency:** Event-triggered on mortality record insert (not scheduled scan)
**Farm Applicability:** Both farms (any livestock)
**WhatsApp Message Template:**
```
[TFOS] 🚨 CRITICAL: ANIMAL MORTALITY. Farm {farm_id}, Animal {animal_id} ({animal_type}).
Date: {mortality_date}. Cause (if known): {cause}.
IMMEDIATELY: isolate remaining herd, photograph, contact vet.
Record necropsy findings in TFOS. Cody alerted. Vinaka!
```
**Resolution Condition:** Mortality response task marked complete AND necropsy findings logged. Manually resolved by FOUNDER or ADMIN.
**Developer Note:** This rule CANNOT be auto-dismissed. Manual resolution required. Message sent to both Cody AND F002 coordinator (or F001 manager). The word "CRITICAL" in the message must be present in all caps. Log to Sentry as a warning-level event (for audit trail, not error tracking).

---

## RULE-022: Apiculture HiveInspection — 14-Day Inspection Due

**Status:** ACTIVE
**Trigger:** Any active hive in `hive_register` where `last_inspection_date < CURRENT_DATE - INTERVAL '14 days'`.
**Output:** Task created + Alert (MEDIUM)
**Severity:** MEDIUM
**Frequency:** Daily scan
**Farm Applicability:** F001 only (4 hives: HIV-F001-001, HIV-F001-002, HIV-F001-003, HIV-F001-004)
**WhatsApp Message Template:**
```
[TFOS] 🐝 HIVE INSPECTION DUE: {hive_count} hives on F001 overdue for 14-day inspection.
Hives: {hive_ids}. Last inspection: {oldest_inspection_date} ago.
Check brood, queen, Varroa, honey stores. Log in TFOS. Vinaka!
```
**Resolution Condition:** `last_inspection_date` updated to CURRENT_DATE for all triggered hives. Auto-resolves.
**Developer Note:** Group all overdue hives in a single alert. Inspection checklist items logged as sub-tasks in task_queue (brood health, queen sighting, Varroa mite count, honey stores estimation). Do NOT fire this alert if hive_status = 'inactive' (dormant hive).

---

## RULE-023: Apiculture HoneyHarvest — 30-Day Harvest Check

**Status:** ACTIVE
**Trigger:** Any active hive where `last_honey_harvest_date < CURRENT_DATE - INTERVAL '30 days'` AND last inspection showed honey stores at 'medium' or above capacity.
**Output:** Alert (LOW) + task
**Severity:** LOW
**Frequency:** Daily scan
**Farm Applicability:** F001 (4 hives)
**WhatsApp Message Template:**
```
[TFOS] 🍯 HONEY HARVEST: Hives {hive_ids} on F001 are due for honey extraction.
Last harvest: {last_harvest_date}. Estimated yield: {estimated_yield_kg}kg.
Prepare smoker, extractor. Log harvest weight per hive. Vinaka!
```
**Resolution Condition:** honey_harvest event logged with yield_kg for the triggered hives. Auto-resolves.
**Developer Note:** Condition: last_honey_harvest_date older than 30 days AND inspection_honey_stores IN ('medium', 'full'). If stores are 'low', do not trigger harvest alert — flag for feeding instead.

---

## RULE-024: Aquaculture TilapiaFeed — Daily Feed Alert (INACTIVE)

**Status:** INACTIVE — seeded, not executed
**Trigger:** (When active) Daily feed schedule for tilapia ponds — feed not logged by 9am Fiji time.
**Output:** Alert (MEDIUM)
**Severity:** MEDIUM
**Frequency:** Daily (when active)
**Farm Applicability:** Would apply to AQU-TIL cycles
**WhatsApp Message Template:**
```
[TFOS] TILAPIA FEED DUE: Pond {pond_id} — feed not logged today.
Log feeding now or confirm delay. Vinaka!
```
**Resolution Condition:** feed event logged for the pond.
**Developer Note:** is_active = false. Do not execute. Activate in Phase 2 when AQU-TIL cycles are created.

---

## RULE-025: Aquaculture WaterQuality — Parameter Check (INACTIVE)

**Status:** INACTIVE — seeded, not executed
**Trigger:** (When active) Water quality parameters (pH, dissolved oxygen, temperature, ammonia) not logged for 48+ hours.
**Output:** Alert (HIGH)
**Severity:** HIGH
**Farm Applicability:** Aquaculture ponds
**WhatsApp Message Template:**
```
[TFOS] ⚠ WATER QUALITY CHECK OVERDUE: Pond {pond_id} — last test {hours_since_test}h ago.
Test pH, DO, temp, ammonia NOW. Log to TFOS. Vinaka!
```
**Developer Note:** is_active = false. Activate with AQU modules in Phase 2.

---

## RULE-026: Aquaculture HarvestReady — Stocking Weight Reached (INACTIVE)

**Status:** INACTIVE — seeded, not executed
**Trigger:** (When active) Average fish weight in pond reaches target market weight (250g for tilapia).
**Output:** Alert (MEDIUM)
**Severity:** MEDIUM
**Farm Applicability:** AQU-TIL cycles
**Developer Note:** is_active = false. Activate in Phase 2.

---

## RULE-027: Pig Growth Monitoring — Weekly Weight (INACTIVE)

**Status:** INACTIVE — seeded, not executed
**Trigger:** (When active) Pig weight not logged for 7+ days for any active pig in livestock_register.
**Output:** Task + Alert (MEDIUM)
**Severity:** MEDIUM
**Farm Applicability:** LIV-PIG cycles (currently INACTIVE as a production type)
**Developer Note:** is_active = false. Both LIV-PIG production type and RULE-027 are inactive. Do not activate without biosecurity infrastructure. ASF (African Swine Fever) risk context must be addressed.

---

## RULE-028: Pig Feeding — Daily Feed Alert (INACTIVE)

**Status:** INACTIVE — seeded, not executed
**Trigger:** (When active) Pig feed not logged by scheduled time.
**Output:** Alert (LOW)
**Severity:** LOW
**Farm Applicability:** LIV-PIG cycles
**Developer Note:** is_active = false. Do not activate.

---

## RULE-029: RepeatPestPattern — Same Pest Detected Consecutively

**Status:** ACTIVE
**Trigger:** The same pest_type is recorded in pest_scouting events for the same PU in 2+ consecutive scouting sessions (within 30-day window), AND severity_level >= 'MODERATE' in both events.
**Output:** Alert (HIGH) + task for treatment escalation
**Severity:** HIGH
**Frequency:** Triggered on each pest_scouting log insert
**Farm Applicability:** Both farms
**WhatsApp Message Template:**
```
[TFOS] ⚠ REPEAT PEST: {pest_name} detected on PU{pu_id} for {consecutive_count} consecutive scoutings.
Last seen: {last_scouting_date} at {severity_level} severity.
Escalate treatment — check chemical_library for registered options.
Log treatment plan in TFOS. Vinaka, {manager_name}!
```
**Resolution Condition:** Next scouting shows pest_severity = 'NONE' or 'LOW'. Auto-resolves.
**Developer Note:** Consecutive scouting detection: compare last 2 scouting events for same PU + pest_type. If both have severity >= 'MODERATE': trigger. This prevents one-off sightings from generating alerts — only repeated infestations fire.

---

## RULE-030: WithholdingPeriodAlert — Pre-Harvest Chemical Compliance Warning

**Status:** ACTIVE
**Trigger:** A farmer attempts to log a harvest (POST /harvests) while any chemical applied to the same PU has a withholding period that has not yet expired. Specifically: for any chemical application in field_events WHERE chemical_id IS NOT NULL AND (application_date + whd_days) > proposed_harvest_date.
**Output:** Alert (HIGH) — harvest log BLOCKED (returns 409 error to API caller)
**Severity:** HIGH
**Frequency:** Event-triggered on every harvest log attempt (not scheduled scan)
**Farm Applicability:** Both farms, all chemical-using crops
**WhatsApp Message Template:**
```
[TFOS] 🚫 HARVEST BLOCKED: {crop_name} PU{pu_id}.
{chemical_name} applied {days_since_application} days ago.
WHD: {whd_days} days. Safe to harvest after: {safe_harvest_date}.
Do NOT harvest until then. Vinaka, {manager_name}!
```
**Resolution Condition:** ONLY when `safe_harvest_date` (application_date + whd_days) has passed. Cannot be manually dismissed. FOUNDER override is available but creates a logged exception with regulatory risk flag.
**Developer Note:** This rule is implemented at TWO layers:
1. **Database layer:** PostgreSQL trigger `harvest_compliance_check` on INSERT to harvest_log — rejects if WHD not met
2. **API layer:** `check_chemical_compliance(pu_id, harvest_date)` called in POST /harvests handler before DB insert
Both layers must be active. If DB trigger is disabled for maintenance, API layer still enforces. See 02_database/schema/05_functions.sql for trigger definition.

---

## RULE-031: DeliveryShortage — Delivery Shortage Flagged

**Status:** ACTIVE
**Trigger:** An order in `purchase_orders` is marked with `delivery_status = 'shortage'` — i.e., the delivered quantity is less than the ordered quantity.
**Output:** Alert (MEDIUM) + task to follow up with supplier
**Severity:** MEDIUM
**Frequency:** Event-triggered on purchase_order status update
**Farm Applicability:** Both farms
**WhatsApp Message Template:**
```
[TFOS] ⚠ DELIVERY SHORTAGE: Order {order_id} from {supplier_name}.
Ordered: {ordered_qty}{unit}. Received: {received_qty}{unit}. Shortage: {shortage_qty}{unit}.
Follow up with supplier for credit or re-delivery. Log resolution in TFOS.
```
**Resolution Condition:** `delivery_status` updated to 'resolved' or a credit note logged. Auto-resolves.
**Developer Note (MIGRATION FIX):** RULE-031 had a column mapping error in the v7.0 Google Sheets extraction. The `trigger_category` column was incorrectly mapped. Verify after migration:
```sql
SELECT trigger_category FROM automation_rules WHERE rule_id = 'RULE-031';
-- MUST return: 'delivery' (not 'inventory' or NULL)
```

---

## RULE-032: IncidentAlert — New Incident Recorded

**Status:** ACTIVE
**Trigger:** A new record is inserted into the `incidents` table with severity >= 'MEDIUM'.
**Output:** Alert matching incident severity
**Severity:** Mirrors incident.severity (LOW/MEDIUM/HIGH/CRITICAL)
**Frequency:** Event-triggered on incident INSERT
**Farm Applicability:** Both farms
**WhatsApp Message Template:**
```
[TFOS] 🚨 INCIDENT REPORTED: {incident_title}.
Farm: {farm_id}. Severity: {severity}. Date: {incident_date}.
Reported by: {reporter_name}.
Review and respond in TFOS. Cody alerted. Vinaka!
```
**Resolution Condition:** `incident_status` updated to 'resolved' in incidents table. Auto-resolves.
**Developer Note (MIGRATION FIX):** RULE-032 also had a column mapping error in v7.0. Verify:
```sql
SELECT trigger_category FROM automation_rules WHERE rule_id = 'RULE-032';
-- MUST return: 'incident' (not 'task' or NULL)
```

---

## RULE-033: HarvestReady — Cycle Approaching Harvest Date

**Status:** ACTIVE
**Trigger:** Production cycle `estimated_harvest_date` is within 7 days from CURRENT_DATE AND cycle_status is still 'active' (not yet 'harvesting').
**Output:** Alert (MEDIUM) + task to prepare harvest team and equipment
**Severity:** MEDIUM
**Frequency:** Daily scan
**Farm Applicability:** Both farms
**WhatsApp Message Template:**
```
[TFOS] 🌾 HARVEST APPROACHING: {crop_name} PU{pu_id} is ready to harvest in {days_to_harvest} days.
Estimated yield: {estimated_yield_kg}kg.
Prepare: harvest baskets, team schedule, buyer contact, transport.
Update cycle status to HARVESTING when picking begins. Vinaka, {manager_name}!
```
**Resolution Condition:** `cycle_status` updated to 'harvesting'. Auto-resolves.
**Developer Note:** Fire once only — deduplication key: (cycle_id, 'RULE-033'). If already fired, suppress re-fire unless days_to_harvest changes significantly.

---

## RULE-034: F002FerryBuffer — Kadavu Island Supply Critical Warning

**Status:** ACTIVE
**Trigger:** Weekly scan of all inputs assigned to F002 (Viyasiyasi Farm, Kadavu Island). Fires when any F002 input has `current_stock_days_remaining < (lead_time_days + 7)`.

Where:
- `current_stock_days_remaining = current_stock_qty / daily_consumption_rate`
- `lead_time_days = 14` (default: weekly ferry + 7 buffer; update after confirming Sea Master schedule — see OPEN_QUESTIONS.md Q4)
- The extra 7-day buffer accounts for: ferry cancellations due to weather (Kadavu is exposed to cyclone swells), loading delays at Suva wharf, and unpredictable sea conditions

**Output:** Alert (CRITICAL) + urgent task for immediate procurement action
**Severity:** CRITICAL (highest possible — island supply failure has no quick fix)
**Frequency:** Weekly scan — every Monday at 20:00 UTC (8:00 AM Fiji Tuesday — start of work week)
**Farm Applicability:** F002 ONLY — this rule does not apply to F001 (mainland road access)
**WhatsApp Message Template:**
```
[TFOS] 🚨 CRITICAL — FERRY BUFFER: F002 Viyasiyasi SUPPLY RISK!
Low stock items: {item_list}.
Kadavu ferry (Sea Master SUP-012) lead time: {lead_time_days} days.
ORDER IMMEDIATELY or arrange emergency supply.
Sea Master Shipping: {sea_master_contact}.
Next ferry: {next_ferry_date} (confirm schedule).
Vinaka, Cody! This is urgent.
```
**Resolution Condition:** All F002 inputs have `current_stock_days_remaining >= (lead_time_days + 14)` after restocking. Auto-resolves.
**Developer Note:**
- This is the most operationally critical rule for F002. A missed ferry order means NO inputs for 2+ weeks on an island with no alternative supply chain.
- `sea_master_contact` is stored in `suppliers` table under supplier_code = 'SUP-012' (Sea Master Shipping).
- Run weekly, not daily. Daily would create alert fatigue. Weekly on Monday morning (Fiji) gives a full work week to act.
- The `lead_time_days` value is configurable per-input in the `inputs` table (`lead_time_days` column). Use the per-input value if set, otherwise default to 14.
- Deduplication: only re-fire if a new item has crossed the threshold since last alert. Do not re-fire same item unless stock has changed.

---

## RULE-035: PaymentOverdue — Accounts Receivable Overdue

**Status:** ACTIVE
**Trigger:** Any record in `income_log` with `payment_status = 'pending'` AND `invoice_date < CURRENT_DATE - INTERVAL '7 days'`.
**Output:** Alert (MEDIUM) + task to follow up with customer
**Severity:** MEDIUM → HIGH after 14 days outstanding
**Frequency:** Daily scan
**Farm Applicability:** Both farms (AR tracked at tenant level)
**WhatsApp Message Template:**
```
[TFOS] 💰 PAYMENT OVERDUE: {customer_name} ({customer_id}) owes FJD{amount:.2f}.
Invoice: {invoice_id}. Due date: {due_date}. Days overdue: {days_overdue}.
Contact customer and request payment. Log contact in TFOS.
```
**Resolution Condition:** `payment_status` updated to 'paid' in income_log. Auto-resolves.
**Developer Note:** Join income_log to customers table for customer_name and contact. If customer has WhatsApp number stored: optionally send a polite payment reminder directly to customer (Phase 2 feature — do not auto-send to customers in Phase 1 without Cody confirmation).

---

## RULE-036: HarvestLoss — Loss Gap Exceeds Threshold

**Status:** ACTIVE
**Trigger:** For any harvest batch in harvest_log: `loss_qty_kg / total_harvested_qty_kg > 0.10` (i.e., post-harvest losses exceed 10% of harvest).
**Output:** Alert (MEDIUM)
**Severity:** MEDIUM
**Frequency:** Event-triggered on harvest_log INSERT or UPDATE where loss_qty_kg is set
**Farm Applicability:** Both farms
**WhatsApp Message Template:**
```
[TFOS] ⚠ HARVEST LOSS: {crop_name} PU{pu_id} batch {batch_id}.
Total harvested: {total_kg}kg. Loss: {loss_kg}kg ({loss_pct:.1f}%).
Investigate cause: overripe, pest damage, transport, storage?
Log root cause in TFOS. Vinaka, {manager_name}!
```
**Resolution Condition:** Loss root cause logged in harvest_log `loss_reason` field. Auto-resolves after root cause entry.
**Developer Note:** Loss threshold (10%) is configurable in `shared.system_config` table (`harvest_loss_alert_pct`). Do not hardcode.

---

## RULE-037: AROverdue — Accounts Receivable Aging Alert

**Status:** ACTIVE
**Trigger:** Total outstanding AR for the tenant exceeds FJD 1,000 AND the oldest unpaid invoice is more than 21 days old.
**Output:** Alert (HIGH)
**Severity:** HIGH
**Frequency:** Weekly scan (Monday 20:00 UTC)
**Farm Applicability:** Both farms (tenant-level AR)
**WhatsApp Message Template:**
```
[TFOS] ⚠ AR AGING ALERT: Total outstanding AR = FJD{total_ar:.2f}.
Oldest invoice: {oldest_invoice_id} ({oldest_days_overdue} days overdue) from {customer_name}.
Review AR aging in TFOS and prioritize collection. Vinaka, Cody!
```
**Resolution Condition:** Total outstanding AR falls below FJD 500 OR all invoices older than 21 days are paid. Auto-resolves.
**Developer Note:** AR aging report query:
```sql
SELECT SUM(amount_fjd) as total_ar,
       MIN(invoice_date) as oldest_invoice,
       CURRENT_DATE - MIN(invoice_date) as oldest_days
FROM income_log
WHERE payment_status = 'pending'
  AND tenant_id = $1;
```

---

## RULE-038: ChemicalCompliance — Harvest Blocked During Withholding Period

**Status:** ACTIVE
**Trigger:** Harvest log INSERT attempted on a PU where any chemical with an active withholding period has not expired.

**This is the most enforcement-critical rule in the system.**

**Output:** HTTP 409 response (harvest BLOCKED) + CRITICAL alert + WhatsApp message
**Severity:** CRITICAL
**Frequency:** Event-triggered on every harvest log INSERT attempt
**Farm Applicability:** Both farms — ALL chemical-using crops

**Two-Layer Enforcement:**

Layer 1 — Database Trigger:
```sql
-- Defined in 05_functions.sql
CREATE OR REPLACE FUNCTION check_harvest_compliance()
RETURNS TRIGGER AS $$
DECLARE
  v_blocking_chemical RECORD;
BEGIN
  SELECT c.chemical_name, fe.application_date,
         fe.application_date + c.withholding_days AS safe_date,
         c.withholding_days
  INTO v_blocking_chemical
  FROM field_events fe
  JOIN shared.chemical_library c ON fe.chemical_id = c.chemical_id
  WHERE fe.pu_id = NEW.pu_id
    AND fe.event_type = 'chemical_application'
    AND (fe.application_date + c.withholding_days) > NEW.harvest_date
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'HARVEST_BLOCKED: % applied on %. Safe to harvest after %',
      v_blocking_chemical.chemical_name,
      v_blocking_chemical.application_date,
      v_blocking_chemical.safe_date;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER harvest_compliance_check
  BEFORE INSERT ON harvest_log
  FOR EACH ROW EXECUTE FUNCTION check_harvest_compliance();
```

Layer 2 — API Enforcement:
```python
# In POST /harvests handler
compliance_result = await check_chemical_compliance(pu_id, harvest_date, db)
if not compliance_result.compliant:
    raise HTTPException(
        status_code=409,
        detail={
            "error": "CHEMICAL_COMPLIANCE_VIOLATION",
            "chemical": compliance_result.blocking_chemical,
            "applied_date": compliance_result.application_date,
            "safe_harvest_date": compliance_result.safe_harvest_date,
            "days_remaining": compliance_result.days_remaining
        }
    )
```

**WhatsApp Message Template:**
```
[TFOS] 🚨 HARVEST BLOCKED — CHEMICAL COMPLIANCE.
{crop_name} PU{pu_id}: {chemical_name} applied {days_since_application} days ago.
Withholding period: {whd_days} days. DO NOT HARVEST until {safe_harvest_date}.
FOOD SAFETY RULE — cannot be dismissed. Vinaka!
```
**Resolution Condition:** `safe_harvest_date` passes (application_date + whd_days <= CURRENT_DATE). Auto-resolves. Cannot be manually dismissed.
**Developer Note:** FOUNDER override creates override_log record but does NOT remove the DB trigger block. If FOUNDER insists on overriding, the API bypasses its layer-2 check (with override logged), but the DB trigger remains. Only a DBA with direct DB access can physically bypass the DB trigger — and that action is audited. This is by design.

---

## RULE-039: RotationDue — Recommend Next Crop for Idle PU

**Status:** ACTIVE
**Trigger:** A production unit has `unit_status = 'idle'` for more than 7 days AND the previous cycle's min_rest_days has elapsed.
**Output:** Alert (LOW) + recommendation from RotationAdvisor
**Severity:** LOW
**Frequency:** Weekly scan
**Farm Applicability:** Both farms (especially F001 — 70+ idle acres)
**WhatsApp Message Template:**
```
[TFOS] 🌱 PU{pu_id} is idle and ready for new cycle.
Previous crop: {last_production_name} (harvested {days_since_harvest} days ago).
Rotation suggestions: 1) {option_1_name} (PREF), 2) {option_2_name} (OK), 3) {option_3_name} (OK).
Start new cycle in TFOS when ready. Vinaka!
```
**Resolution Condition:** New cycle created for this PU. Auto-resolves.
**Developer Note:** Call validate_rotation() for this PU for each candidate production to generate the suggestions list. Return top 3 by rule_status priority (PREF first, then OK).

---

## RULE-040: MaintenanceDue — Equipment Maintenance Upcoming

**Status:** ACTIVE
**Trigger:** Equipment `next_maintenance_due` is within 7 days (advance warning, before it becomes overdue — RULE-016 handles overdue).
**Output:** Alert (LOW) + task
**Severity:** LOW
**Frequency:** Daily scan
**Farm Applicability:** Both farms
**WhatsApp Message Template:**
```
[TFOS] 🔧 UPCOMING MAINTENANCE: {equipment_name} due in {days_to_maintenance} days.
Schedule service now to avoid disruption. Log when completed. Vinaka!
```
**Resolution Condition:** Maintenance logged with service_date. Auto-resolves.
**Developer Note:** Complementary to RULE-016. RULE-040 fires BEFORE overdue. RULE-016 fires AFTER. Ensure deduplication: if RULE-040 already created alert for this equipment, RULE-016 should not create a second alert — escalate the existing one instead.

---

## RULE-041: CashFlowNegative — 13-Week Rolling Forecast Goes Negative

**Status:** ACTIVE
**Trigger:** 13-week cash flow forecast computation shows a week where projected net position (opening balance + projected inflows - projected outflows) goes negative.
**Output:** Alert (HIGH) + task for financial review
**Severity:** HIGH
**Frequency:** Weekly scan (Friday 20:00 UTC = Saturday morning Fiji)
**Farm Applicability:** Both farms (tenant-level)
**WhatsApp Message Template:**
```
[TFOS] ⚠ CASH FLOW WARNING: 13-week forecast shows negative balance.
Projected deficit in week {deficit_week} of FJD{deficit_amount:.2f}.
Review expenses, accelerate collections, plan harvest timing.
Check 13-week forecast in TFOS dashboard. Vinaka, Cody!
```
**Resolution Condition:** Forecast updated (new income logged or expenses cancelled) and 13-week projection no longer shows negative balance. Auto-resolves on next weekly scan.
**Developer Note:** 13-week forecast is computed from: opening_balance + SUM(projected_harvest_income) - SUM(scheduled_payments). Projected harvest income is estimated from active cycles' expected yield × price_master price. This is a planning tool — accuracy improves as actual data accumulates.

---

## RULE-042: OrderStatus — Purchase Order Overdue

**Status:** ACTIVE
**Trigger:** Any `purchase_orders` record where `expected_delivery_date < CURRENT_DATE` AND `delivery_status != 'delivered'` AND `delivery_status != 'cancelled'`.
**Output:** Alert (MEDIUM)
**Severity:** MEDIUM
**Frequency:** Daily scan
**Farm Applicability:** Both farms
**WhatsApp Message Template:**
```
[TFOS] ⚠ ORDER OVERDUE: PO {po_id} from {supplier_name}.
Expected delivery: {expected_delivery_date}. Days overdue: {days_overdue}.
Contact supplier for status update. Log response in TFOS.
```
**Resolution Condition:** `delivery_status = 'delivered'` or `delivery_status = 'cancelled'`. Auto-resolves.
**Developer Note (MIGRATION FIX):** RULE-042 had a column mapping error in v7.0. The `trigger_table` column was mapped to the wrong source column. Verify after migration:
```sql
SELECT rule_id, trigger_category, trigger_table, is_active
FROM automation_rules WHERE rule_id = 'RULE-042';
-- trigger_category MUST be: 'procurement'
-- trigger_table MUST be: 'purchase_orders'
-- is_active MUST be: true
```

---

## RULE-043: WorkerPerformance — Permanent Worker Inactivity Alert

**Status:** ACTIVE
**Trigger:** W-001 Laisenia Waqa (the sole permanent worker) has no `labor_attendance` records for more than 14 consecutive days (excluding logged leave days).
**Output:** Alert (HIGH)
**Severity:** HIGH
**Frequency:** Daily scan
**Farm Applicability:** F001 (W-001 is assigned to F001)
**WhatsApp Message Template:**
```
[TFOS] ⚠ WORKER INACTIVITY: W-001 Laisenia Waqa has no attendance logged for {days_inactive} days.
Last logged: {last_attendance_date}.
Check in with Laisenia — is leave recorded? Is there a welfare concern?
Log attendance or leave in TFOS. Vinaka, Cody!
```
**Resolution Condition:** New labor_attendance record for W-001 OR leave record logged covering the inactive period. Auto-resolves.
**Developer Note (MIGRATION FIX):** RULE-043 also had a column mapping error in v7.0. Verify after migration:
```sql
SELECT rule_id, trigger_category, entity_filter, is_active
FROM automation_rules WHERE rule_id = 'RULE-043';
-- trigger_category MUST be: 'worker'
-- entity_filter MUST contain: 'W-001'
-- is_active MUST be: true
```
Note: The 14-day threshold is specific to the permanent worker. Casual workers (W-002 through W-009) are not subject to this rule — they are hired on-demand and may not log attendance for weeks between engagements.

---

## Summary Table

| Rule ID | Name | Status | Severity | Frequency | Farm |
|---------|------|--------|----------|-----------|------|
| RULE-001 | ProductionStageProtocol — Seedbed Prep | ACTIVE | LOW | Daily | Both |
| RULE-002 | ProductionStageProtocol — Nursery Start | ACTIVE | LOW | Daily | Both |
| RULE-003 | ProductionStageProtocol — Transplanting Due | ACTIVE | MEDIUM | Daily | Both |
| RULE-004 | ProductionStageProtocol — First Fertilization | ACTIVE | MEDIUM | Daily | Both |
| RULE-005 | ProductionStageProtocol — Pest Scouting | ACTIVE | LOW | Daily | Both |
| RULE-006 | ProductionStageProtocol — Flowering Alert | ACTIVE | LOW | Event | Both |
| RULE-007 | ProductionStageProtocol — Fruit Set Monitoring | ACTIVE | LOW | Daily | Both |
| RULE-008 | ProductionStageProtocol — Pre-Harvest Chemical Check | ACTIVE | HIGH | Daily | Both |
| RULE-009 | ProductionStageProtocol — Harvest Start | ACTIVE | LOW | Event | Both |
| RULE-010 | ProductionStageProtocol — Post-Harvest Rest Reminder | ACTIVE | LOW | Event | Both |
| RULE-011 | ProductionStageProtocol — Max Duration Warning | ACTIVE | MEDIUM | Daily | Both |
| RULE-012 | InventoryAlert — Low Stock Reorder | ACTIVE | MEDIUM | Daily | Both |
| RULE-013 | TaskOverdue — Escalation | ACTIVE | MEDIUM→HIGH | Daily | Both |
| RULE-014 | WeatherAlert — Heavy Rainfall | ACTIVE | HIGH | 3-hourly | Both |
| RULE-015 | NurseryAlert — Transplant Ready | ACTIVE | LOW | Event | Both |
| RULE-016 | EquipmentAlert — Maintenance Overdue | ACTIVE | MEDIUM | Daily | Both |
| RULE-017 | HarvestAlert — Gap Too Long | ACTIVE | MEDIUM | Daily | Both |
| RULE-018 | CashAlert — Balance Below FJD 100 | ACTIVE | HIGH | Event+Daily | Both |
| RULE-019 | Livestock WeighAnimal — Monthly | ACTIVE | MEDIUM | Daily | F002 |
| RULE-020 | Livestock Vaccination — Schedule | ACTIVE | HIGH | Daily | F002 |
| RULE-021 | Livestock MortalityResponse — CRITICAL | ACTIVE | CRITICAL | Event | Both |
| RULE-022 | Apiculture HiveInspection — 14 Days | ACTIVE | MEDIUM | Daily | F001 |
| RULE-023 | Apiculture HoneyHarvest — 30 Days | ACTIVE | LOW | Daily | F001 |
| RULE-024 | Aquaculture TilapiaFeed | **INACTIVE** | MEDIUM | Daily | — |
| RULE-025 | Aquaculture WaterQuality | **INACTIVE** | HIGH | Daily | — |
| RULE-026 | Aquaculture HarvestReady | **INACTIVE** | MEDIUM | Event | — |
| RULE-027 | Pig Growth Monitoring | **INACTIVE** | MEDIUM | Daily | — |
| RULE-028 | Pig Feeding Alert | **INACTIVE** | LOW | Daily | — |
| RULE-029 | RepeatPestPattern | ACTIVE | HIGH | Event | Both |
| RULE-030 | WithholdingPeriodAlert | ACTIVE | HIGH | Event | Both |
| RULE-031 | DeliveryShortage | ACTIVE | MEDIUM | Event | Both |
| RULE-032 | IncidentAlert | ACTIVE | Mirror | Event | Both |
| RULE-033 | HarvestReady — Approaching Date | ACTIVE | MEDIUM | Daily | Both |
| RULE-034 | F002FerryBuffer — CRITICAL | ACTIVE | CRITICAL | Weekly | F002 only |
| RULE-035 | PaymentOverdue — AR | ACTIVE | MEDIUM | Daily | Both |
| RULE-036 | HarvestLoss — >10% | ACTIVE | MEDIUM | Event | Both |
| RULE-037 | AROverdue — Aging Alert | ACTIVE | HIGH | Weekly | Both |
| RULE-038 | ChemicalCompliance — Harvest BLOCKED | ACTIVE | CRITICAL | Event | Both |
| RULE-039 | RotationDue — Idle PU | ACTIVE | LOW | Weekly | Both |
| RULE-040 | MaintenanceDue — Upcoming | ACTIVE | LOW | Daily | Both |
| RULE-041 | CashFlowNegative — 13-Week Forecast | ACTIVE | HIGH | Weekly | Both |
| RULE-042 | OrderStatus — PO Overdue [FIXED] | ACTIVE | MEDIUM | Daily | Both |
| RULE-043 | WorkerPerformance — W-001 Inactivity [FIXED] | ACTIVE | HIGH | Daily | F001 |

**Active: 38 | Inactive: 5 | Total: 43**
