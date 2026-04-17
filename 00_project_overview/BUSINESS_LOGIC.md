# FILE: 00_project_overview/BUSINESS_LOGIC.md

# Teivaka TFOS — Business Logic Reference

> **Authority:** This document encodes every business rule that governs TFOS behaviour.
> Any feature implementation that conflicts with a rule defined here is wrong.
> Resolve conflicts by returning to this document, not by changing it to match code.
>
> **Company:** Teivaka PTE LTD, Fiji | Company No. 2025RC001894
> **Last Updated:** April 2026

---

## Table of Contents

1. [Rotation Gate Logic](#section-1-rotation-gate-logic)
2. [Cycle Lifecycle](#section-2-cycle-lifecycle)
3. [Alert Severity Matrix](#section-3-alert-severity-matrix)
4. [Chemical Compliance Enforcement](#section-4-chemical-compliance-enforcement)
5. [Profit Share Calculation](#section-5-profit-share-calculation)
6. [Expansion Readiness Scoring](#section-6-expansion-readiness-scoring)
7. [Decision Engine Signal Definitions](#section-7-decision-engine-signal-definitions)
8. [Harvest Reconciliation](#section-8-harvest-reconciliation)
9. [Labor Cost Ratio](#section-9-labor-cost-ratio)
10. [CoKG Computation](#section-10-cokg-computation)
11. [F002 Ferry Buffer Logic](#section-11-f002-ferry-buffer-logic)
12. [Kava Long-Cycle Exception](#section-12-kava-long-cycle-exception)
13. [Subscription Feature Gating](#section-13-subscription-feature-gating)
14. [TIS RAG Constraint](#section-14-tis-rag-constraint)
15. [Voice Command Intent Types](#section-15-voice-command-intent-types)
16. [Offline-First Sync](#section-16-offline-first-sync)

---

## Section 1: Rotation Gate Logic

### Purpose

Crop rotation is a foundational agronomic practice. Planting the same crop family repeatedly on the same soil depletes specific nutrients, builds up disease inocula, and creates pest population explosions. TFOS enforces rotation rules programmatically to prevent these outcomes.

The Rotation Gate runs every time a new production cycle is about to be created. It is not advisory — it can BLOCK cycle creation entirely.

### The `validate_rotation()` Function

**Signature:**
```python
def validate_rotation(
    farm_id: str,          # e.g. "F001"
    pu_id: str,            # e.g. "F001-PU001"
    proposed_production_id: str,   # e.g. "CRP-TOM"
    tenant_id: uuid.UUID
) -> RotationValidationResult
```

**When it runs:**
- Called synchronously within the `POST /cycles/create` endpoint
- Called within the TIS Command Executor when processing a `CREATE_CYCLE` intent
- Must complete before any cycle record is written to the database

**Data sources it reads:**
- `production_cycles` table: finds the most recently CLOSED or ACTIVE cycle on the specified PU, extracts the `production_id` of that cycle
- `shared.rotation_matrix` table: looks up the rotation compatibility between the previous `production_id` and the proposed `production_id`
- `production_thresholds` table: reads the `min_rest_days` for the proposed production type

### Full Response Schema

```python
class RotationValidationResult(BaseModel):
    allowed: bool
    # True if cycle creation may proceed (status is PREF, OK, COND, OVERLAY, or N/A)
    # False if cycle creation is blocked (status is BLOCK)
    # False if status is AVOID and user has not explicitly acknowledged the warning

    enforcement_decision: Literal["APPROVED", "BLOCKED", "OVERRIDE_REQUIRED"]
    # APPROVED: proceed automatically
    # BLOCKED: hard block, cycle cannot be created regardless of user action
    # OVERRIDE_REQUIRED: user must explicitly acknowledge the warning before cycle is created

    rule_status: Literal["PREF", "OK", "AVOID", "BLOCK", "COND", "OVERLAY", "N/A"]
    # The underlying rotation matrix decision (see definitions below)

    min_rest_days: int
    # Minimum days the soil should rest before planting the proposed crop
    # 0 if no rest required (PREF or OK with no rest condition)

    days_short: int
    # How many days short of min_rest_days the current situation is
    # 0 if min_rest_days is already satisfied
    # Positive integer if rest period is insufficient

    days_since_last_harvest: int
    # Days elapsed since the last harvest on this PU
    # Used to compute days_short

    rotation_key: str
    # The lookup key used in the rotation matrix
    # Format: "{previous_production_id}→{proposed_production_id}"
    # Example: "CRP-TOM→CRP-TOM" (tomato after tomato = BLOCK)

    alternatives: list[RotationAlternative]
    # Suggested alternative crops that are PREF or OK for this PU right now
    # Populated when enforcement_decision is BLOCKED or OVERRIDE_REQUIRED
    # Empty list when enforcement_decision is APPROVED

class RotationAlternative(BaseModel):
    production_id: str      # e.g. "CRP-CAB"
    name: str               # e.g. "CABBAGE"
    status: str             # e.g. "PREF"
    min_rest_days: int      # 0 for PREF alternatives
```

### The Seven Rotation Status Types

**PREF — Preferred**
This crop is the ideal rotational follow to the previous crop. It actively benefits soil health (e.g., a nitrogen-fixing legume following a heavy feeder). No rest period required. Cycle creation proceeds automatically (`APPROVED`).

**OK — Acceptable**
This crop is a safe rotational follow. No known adverse interaction with the previous crop. May require a minimum rest period (e.g., 14–30 days). Cycle creation proceeds if rest period is satisfied (`APPROVED`). If rest period is not satisfied, returns `OVERRIDE_REQUIRED` with days_short populated.

**AVOID — Not Recommended**
This crop follows poorly after the previous crop. Known risk of disease carryover or nutrient depletion. TFOS will not automatically block cycle creation, but requires the user to explicitly acknowledge the agronomic warning. Returns `OVERRIDE_REQUIRED`. The override must be logged — the system records `rotation_override: true` on the cycle record with a timestamp and the user_id who approved it.

**BLOCK — Auto-Blocked**
This crop cannot be planted after the previous crop under any circumstances. Hard block. Returns `BLOCKED`. `allowed: false`. The cycle cannot be created even with a manager override. This covers scenarios such as: same crop family in consecutive seasons on the same soil (e.g., tomato → tomato, or any solanaceae → solanaceae), or a crop known to cause irreversible soil pH disruption after specific predecessors. A BLOCK can only be lifted by manually editing the rotation matrix — which requires Teivaka agronomist sign-off.

**COND — Conditional**
This crop can follow the previous crop, but only under specific conditions (e.g., soil testing required, specific amendment applied, minimum rest of 60 days). Returns `OVERRIDE_REQUIRED` with a `condition_description` field explaining what must be confirmed. The user must check the condition and acknowledge it before proceeding.

**OVERLAY — Livestock or Perennial Overlay**
Used when the proposed "production" is not a sequential crop but an overlay that coexists with an existing cycle (e.g., planting Napier Grass between fruit trees, or running goats through a fallow field). Returns `APPROVED` with a note that this is an overlay arrangement. Overlay cycles do not reset the rotation clock for the underlying crop sequence.

**N/A — Not Applicable**
The PU has no previous cycle (new ground), or the previous cycle type makes rotation rules inapplicable (e.g., the PU was under perennial forestry). Returns `APPROVED`. No rest period required.

### Enforcement in the Database

The rotation gate enforcement is implemented at the API layer only (not as a DB trigger). The database has a `rotation_override` boolean column on the `production_cycles` table. If a cycle was created despite an AVOID or COND status, `rotation_override = true` and `rotation_override_approved_by` (user_id) and `rotation_override_at` (timestamp) are populated. This creates an audit trail.

---

## Section 2: Cycle Lifecycle

### State Machine

A production cycle moves through the following states in order:

```
PLANNED → ACTIVE → HARVESTING → CLOSING → CLOSED
                                        ↘ FAILED
```

Any cycle that does not reach CLOSED through the normal path can transition to FAILED from any state.

### State Definitions and Triggers

**PLANNED**
The cycle has been created and validated but planting has not yet occurred. Land preparation tasks may be in progress. The Rotation Gate has already run and approved this cycle.

*Entry trigger:* Successful `POST /cycles/create` with rotation gate APPROVED or acknowledged OVERRIDE.
*Exit trigger:* Worker logs a "planting complete" or "transplant complete" event for this PU. Stage Engine advances to ACTIVE.
*Who can force this transition:* Farm Manager or above.

**ACTIVE**
The crop is in the ground and growing. The Stage Engine is driving this cycle through growth stages. Tasks are being generated and assigned. Alerts are firing based on scheduled intervals.

*Entry trigger:* First field event logged with event_type = PLANTING or TRANSPLANT for this cycle.
*Exit trigger:* First harvest event logged for this cycle. Stage Engine advances to HARVESTING.
*Who can force this transition:* Farm Manager or above.
*Key rules active in this state:* RULE-003 (vegetative fertilizer every 14d), RULE-004 (pest scouting every 7d), RULE-005 (preventive pest spray every 10d), RULE-013 (overdue task alert), RULE-014 (weather alert), RULE-015 (nursery transplant ready), RULE-030 (chemical withholding scan).

**HARVESTING**
Active harvesting is occurring. Harvest logs are being created. Chemical compliance is actively checked on every harvest attempt. The cycle may oscillate between HARVESTING and late ACTIVE stages (e.g., for crops harvested multiple times per cycle like eggplant or tomato).

*Entry trigger:* First `harvest_log` record created for this cycle.
*Exit trigger:* Farm Manager marks final harvest complete. Stage Engine advances to CLOSING.
*Who can force this transition:* Farm Manager or above.
*Key rules active in this state:* RULE-006 (harvest every 3d), RULE-017 (harvest gap >7d alert), RULE-030 (withholding period scan), RULE-031 (delivery shortage), RULE-036 (loss gap >10%).

**CLOSING**
Final harvest complete. Post-harvest tasks are being completed: land cleanup, residue management, soil amendment, equipment wash, final cost recording, final profit share calculation.

*Entry trigger:* Farm Manager marks final harvest complete.
*Exit trigger:* All closing tasks marked complete AND final CoKG computed AND profit share calculated. Stage Engine advances to CLOSED.
*Who can force this transition:* Farm Manager or above.

**CLOSED**
The cycle is complete. All records are finalized. CoKG is locked. Profit share is settled. The PU is now available for the next cycle (Rotation Gate will run again).

*Entry trigger:* All CLOSING tasks confirmed complete.
*Exit trigger:* None — terminal state.
*Data locked:* harvest_quantity, total_cost, CoKG, profit_share amounts. No edits permitted to financial records for CLOSED cycles without admin override and audit log.

**FAILED**
The cycle has been terminated early due to crop failure, disease outbreak, weather event, or other cause. An `incident_log` record must be created documenting the failure reason. CoKG is computed on whatever was harvested (may be FJD 0 if no harvest occurred). Loss is recorded.

*Entry trigger:* Farm Manager or above forces transition with failure reason code and incident log reference.
*Exit trigger:* None — terminal state.
*Rotation gate impact:* A FAILED cycle still counts as a predecessor for the next cycle's rotation validation. The `days_since_last_harvest` for FAILED cycles with zero harvest is set to `days_since_planting` (the soil was still occupied).

---

## Section 3: Alert Severity Matrix

### Severity Levels

**CRITICAL**
Immediate action required. The farm or a worker is at risk of significant loss, legal violation, or safety incident.

- Chemical compliance violation (RULE-038) — harvest blocked by withholding period
- Livestock mortality event (RULE-021) — animal death requires immediate response and biosecurity check
- F002 Ferry Buffer breach (RULE-034) — island farm will run out of inputs before next ferry
- Repeat pest pattern (RULE-029) — pest resistance or outbreak spreading across multiple PUs

*Delivery:* WhatsApp message to Farm Manager + all designated CRITICAL alert contacts. Never suppressed. No opt-out. Fires immediately.

**HIGH**
Action required within 24 hours. Significant financial or operational risk if unaddressed.

- Overdue task > 48 hours (RULE-013)
- Harvest gap > 7 days (RULE-017)
- Low cash balance (RULE-018)
- Accounts receivable overdue (RULE-037)
- Order delivery shortage (RULE-031)
- Worker inactive > 14 days (RULE-043)
- Equipment maintenance overdue (RULE-016)
- Harvest loss gap > 10% (RULE-036)

*Delivery:* WhatsApp message to Farm Manager. Can be suppressed by manager for non-critical farms during quiet periods. Fires on schedule or event.

**MEDIUM**
Action required within 72 hours. Operational efficiency at risk.

- Pest scouting due (RULE-004)
- Nursery transplant ready (RULE-015)
- Weather stress alert (RULE-014)
- Livestock weighing due (RULE-019)
- Hive inspection due (RULE-022)
- Crop rotation recommendation due (RULE-039)

*Delivery:* In-app notification + WhatsApp if worker has opted in to MEDIUM alerts. Can be suppressed.

**LOW**
Informational. No immediate action required.

- Honey harvest window approaching (RULE-023)
- Equipment maintenance upcoming (scheduled, not overdue)
- Yield trend information

*Delivery:* In-app notification only. No WhatsApp. Can be dismissed permanently for specific alert types.

### Escalation Rules

Alerts that remain unresolved escalate automatically:

- **MEDIUM unresolved for 3 calendar days → escalates to HIGH**
- **HIGH unresolved for 7 calendar days → escalates to CRITICAL**
- CRITICAL alerts do not escalate further but re-fire every 24 hours until resolved

Escalation is handled by a Celery beat task running daily at 7:00am Fiji time. The task queries all open alerts, checks `created_at` against current time, and updates severity if escalation thresholds are met. A new WhatsApp notification is sent when an alert is escalated.

### Auto-Resolution Conditions

Some alerts resolve automatically when the triggering condition is corrected:

| Rule | Auto-Resolution Trigger |
|------|------------------------|
| RULE-012 (low stock) | Input quantity raised above reorder threshold |
| RULE-013 (overdue task) | Task marked complete |
| RULE-017 (harvest gap) | New harvest_log created for that cycle |
| RULE-018 (low cash) | Cash ledger entry brings balance above threshold |
| RULE-022 (hive inspection) | Hive inspection field event logged |
| RULE-034 (ferry buffer) | F002 stock replenished above (LeadTime_Days + 7) |
| RULE-035 (payment overdue) | Payment received and cash_ledger entry created |
| RULE-037 (AR overdue) | Outstanding receivable paid |

Alerts that cannot auto-resolve (mortality, chemical compliance violation, incident reports) must be manually resolved by a Farm Manager with a resolution note.

### Alert Status Values

Every alert has one of three statuses:

- `open` — Active and unresolved. Included in Signal 3 (OpenAlertsCount) computation.
- `resolved` — Action was taken and the issue is corrected. Resolution note and resolver user_id recorded.
- `dismissed` — Alert acknowledged but no action taken (e.g., farm manager disagrees with the alert). Dismissal requires a reason code. Dismissed alerts do not count toward OpenAlertsCount.

---

## Section 4: Chemical Compliance Enforcement

### Overview

Fiji law and good agricultural practice require that no crop is harvested within the withholding period of any applied chemical (pesticide, herbicide, fungicide, growth regulator). The withholding period is the mandatory waiting time after a chemical application before the crop can be safely harvested for human consumption. TFOS enforces this at TWO independent enforcement points.

### Enforcement Point 1: PostgreSQL Database Trigger

A `BEFORE INSERT` trigger on the `harvest_log` table runs on every attempted harvest record insertion.

**Logic:**
```sql
-- Pseudo-code for the trigger
FOR EACH chemical application in field_events
WHERE pu_id = NEW.pu_id
  AND cycle_id = NEW.cycle_id
  AND event_type = 'CHEMICAL_APPLICATION'
  AND applied_at >= (NEW.harvest_date - MAX(withholding_days) FROM kb.chemicals)
DO
  RAISE EXCEPTION 'WITHHOLDING_PERIOD_VIOLATION'
    DETAIL: 'Chemical {chemical_name} applied on {applied_at}, withholding period {days} days,
             earliest safe harvest {earliest_safe_date}';
END FOR;
```

The trigger checks the `kb.chemicals` table (shared schema) for the withholding_days value of each chemical applied to the PU in the current cycle. If any application is too recent, the insert is rejected with a specific exception code that the API can catch and handle.

### Enforcement Point 2: API Validation

The `POST /harvests/create` endpoint includes a pre-write compliance check that runs BEFORE the database call. This is the first line of defence and provides a user-friendly error message rather than a raw database exception.

**Logic:**
```python
def check_chemical_compliance(pu_id: str, cycle_id: str, harvest_date: date) -> ComplianceResult:
    # Query all chemical applications for this PU in this cycle
    applications = get_chemical_applications(pu_id, cycle_id)
    violations = []
    for app in applications:
        chem = get_chemical_by_id(app.chemical_id)
        earliest_safe = app.applied_at + timedelta(days=chem.withholding_days)
        if harvest_date < earliest_safe:
            violations.append(ComplianceViolation(
                chemical_name=chem.name,
                applied_at=app.applied_at,
                withholding_days=chem.withholding_days,
                earliest_safe_harvest=earliest_safe,
                days_remaining=( earliest_safe - harvest_date).days
            ))
    return ComplianceResult(is_compliant=len(violations)==0, violations=violations)
```

If `is_compliant = False`:
1. The API returns HTTP 422 with a structured error listing each violation
2. A CRITICAL alert is created (RULE-038)
3. A WhatsApp message is sent to the Farm Manager with the chemical name, application date, withholding period, and earliest safe harvest date
4. The harvest record is NOT created

### Rules Involved

- **RULE-038 (ChemicalCompliance / BlockHarvest / DailyScan / CRITICAL):** A daily scan at 6:00am Fiji time checks all active cycles for upcoming chemical withholding deadlines. If a harvest is expected (based on the task queue) within the next 7 days and a chemical withholding period has not yet expired, a proactive CRITICAL alert is created to warn the farm manager before harvest teams are mobilized.

- **RULE-030 (FoodSafety / WithholdingPeriodAlert / DailyScan / CRITICAL):** Scans all open harvest tasks and checks chemical compliance. Fires on any day where a scheduled harvest task conflicts with an active withholding period. Prevents reactive violations — the goal is to catch this before the harvest crew shows up.

### What Happens on Violation

1. **Insert blocked** — harvest_log record not created (DB trigger or API validation)
2. **CRITICAL alert created** — `alerts` table, severity=CRITICAL, status=open, linked to the PU and cycle
3. **WhatsApp notification** — sent immediately to Farm Manager with:
   - Farm name and PU ID
   - Crop name
   - Chemical applied (name, registration number)
   - Application date
   - Withholding period in days
   - Earliest safe harvest date
4. **In-app block** — Harvest button disabled in PWA for this PU until withholding period expires
5. **Audit log** — Violation attempt recorded in `compliance_incidents` table with user_id, timestamp, and details

The violation is never silently ignored. Both enforcement layers must independently catch it.

---

## Section 5: Profit Share Calculation

### Context

Save-A-Lot Farm (F001) is operated by Teivaka on land owned by the Nayans family. This is an iTaukei lease arrangement. The financial arrangement: Nayans takes a share of net profit from each production cycle as land compensation. Teivaka retains the remainder.

### Configuration

The profit share rate is configurable. It is stored in the `farm_config` table under the key `profit_share_rate_pct` for tenant/farm F001. It is **never hardcoded** anywhere in the codebase. Any developer who hardcodes the profit share rate will introduce a critical business logic error that could result in incorrect payments.

```sql
-- How to read the profit share rate
SELECT config_value::numeric AS profit_share_rate_pct
FROM farm_config
WHERE farm_id = 'F001' AND config_key = 'profit_share_rate_pct';
```

The rate is expected to be set to a value agreed between Teivaka and Nayans. As of writing, this value is TBD (to be determined through commercial negotiation). The system must function correctly with any value between 0% and 100%.

### Profit Share Formulas

All amounts in FJD.

```
CycleRevenue       = SUM(harvest_log.quantity_kg × price_master.price_per_kg)
                     WHERE cycle_id = this cycle

CycleTotalCost     = CoKG × TotalHarvestQty_kg
                   = TotalLaborCost + TotalInputCost + TotalOtherCost

CycleNetProfit     = CycleRevenue - CycleTotalCost

NayansShare_FJD    = CycleNetProfit × (ProfitShareRate_% / 100)
TeivakaCut_FJD     = CycleNetProfit - NayansShare_FJD
```

If `CycleNetProfit` is negative (the cycle is loss-making), `NayansShare_FJD` will be negative. This means Teivaka absorbs the full loss and Nayans does not share in the loss. This is standard land-lease practice. TFOS computes the negative number but the `profit_share` table records are annotated with `is_loss_cycle = true`. There is no financial transfer to Nayans for a loss cycle.

### Storage

```sql
-- profit_share table (one record per closed cycle on F001)
CREATE TABLE profit_share (
    id                UUID PRIMARY KEY,
    farm_id           VARCHAR(10) NOT NULL DEFAULT 'F001',
    cycle_id          VARCHAR(30) NOT NULL REFERENCES production_cycles(cycle_id),
    cycle_net_profit  NUMERIC(12,2) NOT NULL,
    profit_share_rate NUMERIC(5,4) NOT NULL,  -- stored as decimal: 0.3000 = 30%
    nayans_share_fjd  NUMERIC(12,2) NOT NULL,
    teivaka_cut_fjd   NUMERIC(12,2) NOT NULL,
    is_loss_cycle     BOOLEAN NOT NULL DEFAULT FALSE,
    computed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by       UUID REFERENCES users(id),  -- Teivaka manager who confirmed
    settled_at        TIMESTAMPTZ,  -- NULL until payment confirmed
    tenant_id         UUID NOT NULL
);
```

### Related-Party Transaction Flags

Sales to CUS-003 through CUS-007 (the five Nayans supermarkets) are related-party transactions because Nayans also receives profit share from the same farm. These transactions must be flagged in the `income_records` table with `is_related_party = true` and `related_party_id = 'Nayans'`. This is for accounting transparency — the pricing to related-party customers must be at arm's length (market rate), not discounted. TFOS does not enforce pricing but flags related-party sales for financial review.

---

## Section 6: Expansion Readiness Scoring

### Purpose

The Expansion Readiness Score determines whether a farm is in a position to start a new Production Unit (expand cultivation area). It prevents over-extension when the farm is already financially stressed or labor-constrained.

### The 7 Conditions

All 7 conditions must be satisfied for a farm to be considered expansion-ready. If any condition fails, the farm is NOT expansion-ready.

**Condition 1: Cash Surplus**
`cash_position > FJD 500` (the minimum operating reserve)
Signal 9 (CashPosition) must be GREEN.
*Rationale:* Starting a new PU requires upfront input cost (seeds, fertilizer). The farm must have cash reserves to fund it without disrupting existing operations.

**Condition 2: Revenue Trend Positive**
Weekly revenue has been positive for at least 4 consecutive weeks.
Computed from: `SUM(income_records.amount) - SUM(cash_ledger.expense_amount)` per calendar week, last 4 weeks, all positive.
*Rationale:* A farm that has been consistently earning revenue is stable enough to take on more complexity.

**Condition 3: Labor Not Maxed**
Current labor utilization < 80% of capacity.
Computed as: `(total_scheduled_hours_this_week / total_available_hours_this_week) < 0.80`
Available hours = sum of working hours for all active workers on this farm (permanent + casual bookings confirmed).
*Rationale:* If workers are already working at or above capacity, adding a new PU will create task overruns and harvest delays on existing PUs.

**Condition 4: Labor Capacity Available**
At least one worker slot is available for assignment to the new PU in the next 14 days.
For F001: checks W-001 through W-009 booking schedule.
For F002: checks WorkerBookingQueue for available ferry slots.
*Rationale:* Expansion requires people to work the new land.

**Condition 5: Idle Acres Available**
The farm has idle (uncultivated but arable) acreage available.
F001: 83 total acres, 4.15 currently active. ~78 idle acres available.
F002: 34 total acres, depends on current cycle footprint.
The system checks `zone_area_acres - active_pu_area_acres > 0` for at least one zone on the farm.
*Rationale:* Cannot expand if there is no land to expand into.

**Condition 6: Cost Estimate Fundable**
The estimated input cost for the proposed new cycle (from KB protocol for the proposed production type) is less than or equal to current cash position minus FJD 500 reserve.
`estimated_input_cost ≤ (cash_position - 500)`
*Rationale:* Cannot commit to planting inputs the farm cannot pay for.

**Condition 7: No Unresolved CRITICAL Alerts**
Zero open alerts with severity = CRITICAL on this farm.
Signal 3 (OpenAlertsCount) — but specifically filtered to CRITICAL severity.
*Rationale:* If the farm has an unresolved CRITICAL issue, it needs that fixed before taking on more operational complexity.

### Scoring Output

```python
class ExpansionReadinessResult(BaseModel):
    farm_id: str
    is_expansion_ready: bool          # True only if ALL 7 conditions pass
    conditions: list[ConditionResult]
    checked_at: datetime
    recommended_action: str           # Human-readable next step

class ConditionResult(BaseModel):
    condition_number: int      # 1-7
    condition_name: str
    passed: bool
    actual_value: str          # e.g. "Cash: FJD 1,240 (> FJD 500 threshold)"
    threshold: str             # e.g. "> FJD 500"
```

The Expansion Readiness Score is displayed in the farm dashboard as part of the Decision Engine output. It is computed daily by the Decision Engine job at 6:05am Fiji time and stored in `decision_signals`. It is never computed on-demand.

---

## Section 7: Decision Engine Signal Definitions

### Overview

The Decision Engine runs as a Celery beat task every day at **6:05am Fiji time (UTC+12) = 6:05pm UTC (previous calendar day)**. It computes 10 diagnostic signals for each active farm and writes results to the `decision_signals` table. Signals are never computed on-demand. The dashboard always reads from `decision_signals`.

### The 10 Signals

**Signal 1: GrossMargin%**
- **Source:** `cycle_financials` view
- **Formula:** `(CycleRevenue - CycleTotalCost) / CycleRevenue × 100` for all ACTIVE and HARVESTING cycles
- **GREEN:** > 40%
- **AMBER:** > 20% and ≤ 40%
- **RED:** ≤ 20%
- **Purpose:** Core profitability check. If gross margin is RED, the farm is operating dangerously close to or below breakeven.

**Signal 2: DaysSinceLastHarvest**
- **Source:** `harvest_log` table
- **Formula:** `CURRENT_DATE - MAX(harvest_date)` across all harvest_log records for this farm where cycle status = HARVESTING or ACTIVE
- **GREEN:** < 7 days
- **AMBER:** 7–14 days
- **RED:** > 21 days
- **Purpose:** Ensures active harvesting crops are actually being harvested. A long gap usually means a problem (logistics, labor shortage, or market issue).

**Signal 3: OpenAlertsCount**
- **Source:** `alerts` table
- **Formula:** `COUNT(*) WHERE farm_id = this_farm AND status = 'open'`
- **GREEN:** ≤ 3 open alerts
- **AMBER:** 4–7 open alerts
- **RED:** > 7 open alerts
- **Purpose:** Measures the operational burden of unresolved issues. High alert counts indicate a farm that is not managing its task list.

**Signal 4: WeeklyLogActivity**
- **Source:** All raw logging tables (field_events, harvest_log, labor_attendance, cash_ledger, weather_log)
- **Formula:** `COUNT of new records created in last 7 days across all five tables` for this farm
- **GREEN:** ≥ 5 log entries in 7 days
- **AMBER:** 2–4 log entries in 7 days
- **RED:** < 2 log entries in 7 days
- **Purpose:** Ensures the farm is actively logging. A farm with no logging activity is either not using the system (data quality problem) or has gone offline without sync completing.

**Signal 5: LaborCostRatio**
- **Source:** `cash_ledger` (expenses) + `income_records` (revenue)
- **Formula:** `SUM(labor_costs last 30 days) / SUM(income last 30 days)`
- **GREEN:** < 30%
- **AMBER:** 30%–50%
- **RED:** > 50%
- **Purpose:** Labor is typically the largest variable cost in Fiji farming. If labor cost exceeds 50% of revenue, the operation is not economically viable.

**Signal 6: ActiveCyclesCount**
- **Source:** `production_cycles` table
- **Formula:** `COUNT(*) WHERE farm_id = this_farm AND status IN ('ACTIVE', 'HARVESTING')`
- **GREEN:** ≥ 5 active cycles
- **AMBER:** 2–4 active cycles
- **RED:** < 2 active cycles
- **Purpose:** Measures farm productivity. Very few active cycles suggests under-utilization of available land.

**Signal 7: NurseryStatus**
- **Source:** `nursery_log` table
- **Formula:** `COUNT of nursery batches with status = 'READY_TO_TRANSPLANT'` for this farm
- **GREEN:** ≥ 3 batches ready
- **AMBER:** 1–2 batches ready
- **RED:** 0 batches ready
- **Purpose:** Nursery throughput is the pipeline for new PU planting. No ready batches means no new cycles can start soon — a leading indicator of future production drops.

**Signal 8: WeatherStress**
- **Source:** `weather_log` table (last 3 days)
- **Formula:** `MAX(stress_level)` across last 3 days of weather_log records for this farm location
  - stress_level computed from: rainfall (heavy rain = HIGH), wind speed (>60 km/h = HIGH), temperature extremes
- **GREEN:** stress_level = LOW (normal conditions)
- **AMBER:** stress_level = MEDIUM (moderate stress)
- **RED:** stress_level = HIGH (damaging weather event)
- **Purpose:** Weather is the leading external risk factor for Fiji farms. Cyclone season (November–April) creates sustained weather stress periods.

**Signal 9: CashPosition**
- **Source:** `cash_ledger` table
- **Formula:** `SUM(income_entries) - SUM(expense_entries)` across all cash_ledger records for this farm (running balance)
- **GREEN:** > FJD 500
- **AMBER:** FJD 0 – FJD 500
- **RED:** < FJD 0 (negative cash — farm is in overdraft)
- **Purpose:** Cash is oxygen. Negative cash means the farm cannot pay workers, cannot order inputs, and cannot operate. This is the highest-priority financial signal.

**Signal 10: InputStockLevel**
- **Source:** `inputs_inventory` table
- **Formula:** `COUNT(*) WHERE current_stock <= reorder_point AND farm_id = this_farm`
  (count of distinct inputs at or below their reorder threshold)
- **GREEN:** 0 inputs at or below reorder threshold
- **AMBER:** 1–2 inputs at or below reorder threshold
- **RED:** > 5 inputs at or below reorder threshold
- **Purpose:** Running out of inputs (seeds, fertilizer, chemicals) stops farming operations. Critical for F002 where ordering requires ferry logistics.

### Storage Schema

```sql
CREATE TABLE decision_signals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id         VARCHAR(10) NOT NULL,
    tenant_id       UUID NOT NULL,
    computed_at     TIMESTAMPTZ NOT NULL,
    signal_1_value  NUMERIC(8,2),   signal_1_rag  VARCHAR(5),
    signal_2_value  INTEGER,        signal_2_rag  VARCHAR(5),
    signal_3_value  INTEGER,        signal_3_rag  VARCHAR(5),
    signal_4_value  INTEGER,        signal_4_rag  VARCHAR(5),
    signal_5_value  NUMERIC(8,4),   signal_5_rag  VARCHAR(5),
    signal_6_value  INTEGER,        signal_6_rag  VARCHAR(5),
    signal_7_value  INTEGER,        signal_7_rag  VARCHAR(5),
    signal_8_value  VARCHAR(20),    signal_8_rag  VARCHAR(5),
    signal_9_value  NUMERIC(12,2),  signal_9_rag  VARCHAR(5),
    signal_10_value INTEGER,        signal_10_rag VARCHAR(5),
    overall_rag     VARCHAR(5),     -- worst RAG status across all 10 signals
    expansion_ready BOOLEAN
);
```

---

## Section 8: Harvest Reconciliation

### Purpose

Every kilogram of produce harvested must be accounted for. Harvest reconciliation checks that the sum of all recorded harvests matches the sum of all deliveries and sales, and flags significant gaps as potential losses (shrinkage, spoilage, theft, or data entry errors).

### The Loss Gap Formula

```
LossGap% = (HarvestedQty_kg - DeliveredQty_kg - SoldFarmgate_kg) / HarvestedQty_kg × 100
```

Where:
- `HarvestedQty_kg` = `SUM(harvest_log.quantity_kg)` for this cycle
- `DeliveredQty_kg` = `SUM(delivery_log.quantity_kg)` for this cycle (produce delivered to customers)
- `SoldFarmgate_kg` = `SUM(farmgate_sales.quantity_kg)` for this cycle (on-farm direct sales, e.g., CUS-011)

### Threshold and Trigger

- **Threshold:** 10%
- If `LossGap% > 10%`, **RULE-036** fires: severity HIGH alert created, WhatsApp notification to Farm Manager
- Loss gap is computed daily by the Decision Engine job
- Stored in the `harvest_reconciliation` materialized view

### Materialized View

```sql
CREATE MATERIALIZED VIEW harvest_reconciliation AS
SELECT
    c.cycle_id,
    c.farm_id,
    c.production_id,
    c.tenant_id,
    COALESCE(SUM(hl.quantity_kg), 0)  AS harvested_qty_kg,
    COALESCE(SUM(dl.quantity_kg), 0)  AS delivered_qty_kg,
    COALESCE(SUM(fs.quantity_kg), 0)  AS sold_farmgate_qty_kg,
    COALESCE(SUM(hl.quantity_kg), 0)
        - COALESCE(SUM(dl.quantity_kg), 0)
        - COALESCE(SUM(fs.quantity_kg), 0)  AS loss_gap_kg,
    CASE
        WHEN COALESCE(SUM(hl.quantity_kg), 0) = 0 THEN 0
        ELSE (
            (COALESCE(SUM(hl.quantity_kg), 0)
             - COALESCE(SUM(dl.quantity_kg), 0)
             - COALESCE(SUM(fs.quantity_kg), 0))
            / COALESCE(SUM(hl.quantity_kg), 0)
        ) * 100
    END AS loss_gap_pct
FROM production_cycles c
LEFT JOIN harvest_log hl ON hl.cycle_id = c.cycle_id
LEFT JOIN delivery_log dl ON dl.cycle_id = c.cycle_id
LEFT JOIN farmgate_sales fs ON fs.cycle_id = c.cycle_id
WHERE c.status IN ('ACTIVE', 'HARVESTING', 'CLOSING')
GROUP BY c.cycle_id, c.farm_id, c.production_id, c.tenant_id;
```

The view is refreshed concurrently each morning by the Decision Engine job.

### Acceptable Loss Rationale

A 10% threshold is used because:
- Post-harvest losses from sorting and grading: 2–5% expected
- Transport shrinkage (tropical heat): 1–3% expected
- Farm-gate informal sales (small quantities): up to 2%
- Total expected: up to ~8–9%, so 10% threshold catches actual problems

Loss gaps consistently above 15–20% require investigation and may indicate systematic record-keeping failure or theft.

---

## Section 9: Labor Cost Ratio

### Definition

The Labor Cost Ratio measures what proportion of farm revenue goes to paying workers. It is a key financial health indicator for labor-intensive tropical farming.

### Formula

```
LaborCostRatio = TotalLaborCost_30days / TotalIncome_30days
```

Where:
- `TotalLaborCost_30days` = `SUM(cash_ledger.amount)` WHERE `expense_category = 'LABOR'` AND `transaction_date >= NOW() - INTERVAL '30 days'` AND `farm_id = this_farm`
- `TotalIncome_30days` = `SUM(income_records.amount)` WHERE `income_date >= NOW() - INTERVAL '30 days'` AND `farm_id = this_farm`

### RAG Thresholds (Signal 5)

| Ratio | Status | Meaning |
|-------|--------|---------|
| < 30% | GREEN | Healthy. Workers are well-paid but farm is profitable. |
| 30% – 50% | AMBER | Warning. Margins are being compressed by labor cost. |
| > 50% | RED | Critical. Labor is consuming more than half of all revenue. Farm may be losing money. |

### Context for Fiji

The standard casual field worker rate is FJD 6.00 per hour. For an 8-hour day, that is FJD 48 per day per worker. A crew of 5 workers costs FJD 240 per day in labor. If the farm earns FJD 600 on that day from produce sales, the labor cost ratio is 40% (AMBER). This is a realistic scenario — Fiji farming margins are thin and labor cost management is critical.

---

## Section 10: CoKG Computation

### Definition

CoKG (Cost of Goods per Kilogram) is the **primary financial metric** in TFOS. It answers the fundamental question: "How much does it cost us to produce one kilogram of this crop?" If CoKG exceeds the market selling price per kg, the cycle is loss-making.

### Formula

```
CoKG = (TotalLaborCost + TotalInputCost + TotalOtherCost) / TotalHarvestQty_kg
```

Where:
- `TotalLaborCost` = SUM of all labor cash_ledger entries for this cycle (wages paid to workers)
- `TotalInputCost` = SUM of all input purchases attributed to this cycle (seeds, fertilizer, chemicals, water)
- `TotalOtherCost` = SUM of all other expenses attributed to this cycle (transport, equipment hire, contractor services)
- `TotalHarvestQty_kg` = SUM of all harvest_log.quantity_kg for this cycle

### Loss Detection

```python
def is_loss_making_cycle(cycle_id: str) -> bool:
    cokg = compute_cokg(cycle_id)
    market_price = get_market_price(production_id, grade='STANDARD')
    return cokg > market_price
```

If `CoKG > market_price_per_kg` (from `price_master` table), the cycle is flagged as loss-making. This triggers a HIGH alert to the Farm Manager.

### When CoKG is Computed

- **Real-time estimate:** Available to PREMIUM subscribers during ACTIVE and HARVESTING states (uses costs-to-date and harvest-to-date as a running estimate)
- **Final CoKG:** Computed when the cycle moves to CLOSING state (all costs are in, all harvests are recorded). This is the locked value used for profit share calculation.
- **Historical:** Stored in `cycle_financials` table. Never recomputed after CLOSED state.

### Cost Attribution Rules

- Labor cost: attributed to a cycle if the labor_attendance record references a task that belongs to that cycle's PU
- Input cost: attributed to a cycle if the field_event record for the input application references that cycle_id
- Other cost: attributed via manual cycle_id tagging in the cash_ledger (farm managers must tag expenses to cycles)

Untagged expenses remain at the farm level and are NOT included in any cycle's CoKG. This keeps cycle-level CoKG clean but means farm-level overhead (e.g., equipment maintenance) requires separate tracking.

---

## Section 11: F002 Ferry Buffer Logic (RULE-034)

### The Island Farm Problem

Viyasiyasi Farm (F002) is on Kadavu Island. Every agricultural input — from NPK fertilizer to pesticide bottles to seedling trays to fuel — must be purchased in Suva and shipped to Kadavu via the Sea Master Shipping ferry (SUP-012). The ferry does not run every day. Weather can delay sailings. Island operations have NO backup supply chain.

If F002 runs out of a critical input (e.g., the fertilizer needed for the vegetative stage of a kava cycle), the crop may miss a critical window. For kava, which has a 4-year cycle, missing a fertilizer window cannot be corrected — it is locked in for the whole season.

### RULE-034: F002FerryBuffer

- **Category:** F002FerryBuffer
- **Trigger:** WeeklyScan (runs every Monday morning at 7:00am Fiji time)
- **Severity:** CRITICAL
- **Status:** Active

### The Buffer Check Logic

```python
def check_f002_ferry_buffer():
    """
    For each input in the F002 inventory, check if stock will run out
    before the next feasible ferry delivery can arrive.
    Fires a CRITICAL alert if any input breaches the buffer.
    """
    f002_inputs = get_farm_inputs(farm_id='F002')
    ferry_lead_time_days = get_config('F002', 'ferry_lead_time_days')  # default: 7 days
    buffer_days = ferry_lead_time_days + 7  # 7 days safety margin beyond lead time

    alerts_to_create = []

    for input_item in f002_inputs:
        daily_consumption_rate = compute_daily_consumption(input_item)
        if daily_consumption_rate == 0:
            continue  # Not actively being consumed, skip

        stock_days_remaining = input_item.current_stock / daily_consumption_rate

        if stock_days_remaining < buffer_days:
            alerts_to_create.append(
                Alert(
                    farm_id='F002',
                    rule_id='RULE-034',
                    severity='CRITICAL',
                    title=f'Ferry Buffer Alert: {input_item.name} running low',
                    body=(
                        f'{input_item.name} has {stock_days_remaining:.0f} days of stock remaining. '
                        f'Ferry lead time + buffer requires {buffer_days} days. '
                        f'ACTION REQUIRED: Contact Sea Master Shipping (SUP-012) immediately to '
                        f'book next ferry shipment to Kadavu. '
                        f'Reorder quantity: {compute_reorder_quantity(input_item)} units.'
                    ),
                    supplier_id='SUP-012',
                    whatsapp_required=True
                )
            )

    create_alerts_batch(alerts_to_create)
    send_whatsapp_batch(alerts_to_create, target='farm_manager')
```

### Key Parameters

- `ferry_lead_time_days`: Time from order placement to delivery on Kadavu. Stored in `farm_config` for F002. Default: 7 days. Can be adjusted for cyclone season (may extend to 14 days).
- `buffer_days = ferry_lead_time_days + 7`: The total lead time plus a 7-day safety margin.
- If `stock_days_remaining < buffer_days` → CRITICAL alert.

### The Alert Cannot Be Suppressed

RULE-034 alerts are CRITICAL severity. Per the alert severity rules, CRITICAL alerts cannot be suppressed or opted out of. They will fire to the Farm Manager via WhatsApp regardless of alert preferences.

---

## Section 12: Kava Long-Cycle Exception

### The Kava Cycle

Kava (CRP-KAV, production ID) is a traditional Fijian crop with a growth cycle of approximately **4 years** from planting to harvest. This is radically different from all other crops in TFOS, which have cycles measured in weeks to months.

Current kava cycles on F002:
- `CY-F002-25-001` — F002-PU006 — planted 2025-01-06 — expected harvest approximately January 2029
- `CY-F002-25-002` — F002-PU007 — planted 2025-01-09 — expected harvest approximately January 2029

### The Problem with Standard Alert Rules

Standard TFOS rules assume that a farm cycle that hasn't had a harvest in 7 days might be a problem (RULE-017 HarvestGap). For kava, no harvest for 1,000+ days is entirely normal. If standard rules applied to kava, F002 would receive constant false HIGH alerts about "no harvest in 7 days" for 4 years. This would bury real alerts in noise.

### The Kava Exception Rule

**InactivityAlert_days for CRP-KAV = 180 days** (not the default 7 days for other crops)

Before RULE-017 (HarvestGap 7-day threshold) fires, it must check the `production_thresholds` table for the specific production_id of the cycle being evaluated:

```sql
SELECT inactivity_alert_days
FROM production_thresholds
WHERE production_id = 'CRP-KAV';
-- Returns: 180
```

If `days_since_last_activity > inactivity_alert_days`, THEN fire RULE-017. For kava, the cycle only generates a harvest-gap alert if there has been no logged activity (field events, inspections, fertilizer applications) for 180 consecutive days.

This exception applies to RULE-017 specifically. Other rules (RULE-003 fertilizer, RULE-004 pest scouting, RULE-005 spray) still apply to kava on their normal schedules because kava does require ongoing agronomic care throughout its 4-year cycle — it just doesn't get harvested until year 4.

### Implementation Requirement

RULE-017 implementation **must** read `production_thresholds.inactivity_alert_days` for every cycle it evaluates. The threshold is **never hardcoded** as 7 days. The 7-day value is only the default in `production_thresholds` for crops that don't have a specific override.

```python
def check_harvest_gap_rule(cycle: ProductionCycle) -> Optional[Alert]:
    threshold = get_production_threshold(cycle.production_id, 'inactivity_alert_days')
    days_since_activity = compute_days_since_last_activity(cycle)
    if days_since_activity > threshold:
        return create_alert(rule_id='RULE-017', severity='HIGH', cycle=cycle)
    return None
```

---

## Section 13: Subscription Feature Gating

All feature gating is enforced at the API layer via the `subscription_tier` field on the `tenants` table. Never gate features only at the frontend — the API must independently reject requests from insufficiently-subscribed tenants.

### FREE Tier

**What is included:**
- Maximum 2 Production Units active simultaneously
- Knowledge Base: core crop profiles and basic stage guides (no full protocol detail)
- Basic field event logging (text input only, no voice pipeline)
- TIS Knowledge Broker: 5 queries per day (hard limit enforced via Redis counter)
- Community: view-only (can browse marketplace and KB articles, cannot post or interact)
- Alerts: task overdue alerts only (no financial or compliance alerts)

**What is excluded:**
- Voice pipeline (WhatsApp voice to TIS)
- Stage Engine (no automated task generation)
- Task Queue (no structured task management)
- Financial reporting (no CoKG, no gross margin)
- Decision Engine signals
- Multi-farm support
- Harvest reconciliation
- Profit share calculation
- All chemical compliance automation

### BASIC Tier

**Everything in FREE, plus:**
- Unlimited Production Units
- Full KB access (all 49 production types, full stage protocols)
- Voice pipeline active (WhatsApp voice → Whisper → TIS)
- Stage Engine active
- Task Queue active
- Full alert system (all 43 rules)
- TIS: all three modules, 20 queries per day
- Standard reporting (harvest summary, labor cost, input usage)
- Community: full interaction (post, comment, interact with listings)

**Still excluded (PREMIUM only):**
- Risk Engine
- Economic Engine (full CoKG dashboard, gross margin analysis, cycle P&L)
- Full Inventory Management (tracking with reorder alerts)
- Decision Engine signals dashboard
- Multi-farm support
- Advanced reporting (financial statements, yield trends)
- Data export (CSV/PDF)
- Profit share calculation module

### PREMIUM Tier

**Everything in BASIC, plus:**
- Risk Engine (automated risk scoring, weather stress signal, pest pattern detection)
- Economic Engine (full CoKG, gross margin, cycle-level P&L, profit share)
- Full Inventory Management
- Decision Engine: full 10-signal dashboard with historical RAG tracking
- Multi-farm: supports multiple farms under one account
- TIS: unlimited queries per day
- Advanced dashboard with expansion readiness scoring
- Premium reporting (full financial statements, yield trend analysis, historical performance)
- Data export (CSV and PDF for all reports)
- Community Marketplace: premium listing features, buyer pipeline access

### CUSTOM Tier

**Everything in PREMIUM, plus:**
- Bespoke onboarding and custom farm configuration
- Direct API access with IP-whitelisted API keys
- Teivaka agronomic consulting services
- Performance-linked revenue share tracking (Teivaka takes a % of farm profit — `profit_share` table used at platform level)
- SLA with uptime guarantees and dedicated support contact
- Custom alert routing (e.g., specific alerts to specific contacts)

### Feature Gate Implementation Pattern

```python
from functools import wraps
from fastapi import HTTPException

def require_tier(minimum_tier: str):
    """
    Decorator for FastAPI endpoints that enforces subscription tier.
    Tier hierarchy: FREE < BASIC < PREMIUM < CUSTOM
    """
    tier_rank = {'FREE': 0, 'BASIC': 1, 'PREMIUM': 2, 'CUSTOM': 3}

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, tenant=Depends(get_current_tenant), **kwargs):
            if tier_rank.get(tenant.subscription_tier, 0) < tier_rank[minimum_tier]:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "SUBSCRIPTION_TIER_INSUFFICIENT",
                        "required_tier": minimum_tier,
                        "current_tier": tenant.subscription_tier,
                        "upgrade_message": f"This feature requires {minimum_tier} subscription."
                    }
                )
            return await func(*args, tenant=tenant, **kwargs)
        return wrapper
    return decorator

# Usage example:
@router.get("/cycles/{cycle_id}/cokg")
@require_tier("PREMIUM")
async def get_cycle_cokg(cycle_id: str, tenant=Depends(get_current_tenant)):
    ...
```

---

## Section 14: TIS RAG Constraint

### The Hard Rule

**TIS Knowledge Broker only answers from validated Teivaka KB content. This is non-negotiable.**

The Knowledge Broker is powered by Claude API (`claude-sonnet-4-20250514`) with a RAG pipeline against the Teivaka KB vector store. When a farmer asks an agronomic question, the system:

1. Embeds the query
2. Retrieves the top-K most semantically similar KB articles (using pgvector)
3. Passes the retrieved articles as context to Claude with a strict system prompt
4. Returns only answers grounded in the retrieved KB content

### The Mandatory Response Template for Out-of-KB Questions

If the retrieval step returns no sufficiently similar KB articles (similarity score below threshold), or if the retrieved articles do not contain a validated answer for the specific question, the Knowledge Broker **must** respond with:

```
"I cannot find a validated answer for that specific question in the Teivaka Knowledge Base.
Here is the closest protocol I can reference: [nearest KB article title and key points]."
```

This exact format is enforced via the system prompt to Claude. Claude is explicitly instructed NOT to use general agricultural knowledge from its training data to answer questions that are not in the KB.

### Why This Rule Exists

1. **Agronomic safety:** Incorrect advice (wrong chemical, wrong dosage, wrong timing) can destroy a crop, harm human health, or create chemical residue violations. The stakes are high.

2. **Pacific-specific validity:** General LLM training data contains primarily Northern Hemisphere agricultural practices. Fiji's tropical conditions, local pest pressures, local varieties, and local chemical registrations are different. Generic advice may be wrong for Fiji.

3. **Legal liability:** Teivaka cannot be liable for agronomic advice it cannot validate. If advice comes from the KB, it is Teivaka's validated protocol. If it comes from "the internet" via LLM knowledge, it is unvalidated and creates legal exposure.

4. **Trust:** Farmers trust TFOS because the KB is authoritative. If TIS starts making things up, farmers will lose confidence in the entire platform.

### System Prompt Enforcement (Non-Negotiable)

The Claude API call for Knowledge Broker queries must include this instruction in the system prompt (paraphrased; exact wording in TIS_INTEGRATION.md):

> "You are the Teivaka Knowledge Broker. You answer farmer questions ONLY using the Knowledge Base articles provided in this context. If the provided articles do not contain a validated answer, you MUST say so explicitly using the standard response template. You MUST NOT use your general agricultural knowledge to fill gaps. If you do not know, say you do not know."

This instruction must be present in every single Knowledge Broker API call. It is never removed or weakened.

---

## Section 15: Voice Command Intent Types

The TIS Operational Interpreter parses voice-transcribed (or text) natural language into one of 12 structured intent types. These are the only intents the Command Executor handles. Any input that cannot be mapped to one of these 12 intents returns an "intent not recognized" response and does NOT write to the database.

### Intent 1: LOG_LABOR

**Creates:** `labor_attendance` record

**Extracts:** worker_id, pu_id, task_id (optional), hours_worked, attendance_date, activity_description

**Example voice input:** "Maika worked 6 hours on PU002 today doing weeding"

**Parsed output:**
```json
{
  "intent": "LOG_LABOR",
  "worker_id": "W-002",
  "pu_id": "F001-PU002",
  "hours_worked": 6.0,
  "attendance_date": "today",
  "activity": "WEEDING",
  "confidence": 0.92
}
```

**Validations:** worker_id must exist, pu_id must be active, hours_worked must be between 0.5 and 12.

### Intent 2: LOG_HARVEST

**Creates:** `harvest_log` record

**Extracts:** pu_id, cycle_id (inferred from active cycle on PU), quantity_kg, harvest_date, quality_grade (optional), destination_customer_id (optional)

**CRITICAL:** Chemical compliance check runs automatically before creating the harvest_log record. If within a withholding period, harvest is blocked and CRITICAL alert fires.

**Example:** "We harvested 80 kilos of eggplant from PU003 this morning, grade A, going to New World"

**Parsed output:**
```json
{
  "intent": "LOG_HARVEST",
  "pu_id": "F001-PU003",
  "quantity_kg": 80.0,
  "harvest_date": "today",
  "quality_grade": "A",
  "destination_customer_id": "CUS-001",
  "chemical_compliance_check": true
}
```

### Intent 3: LOG_INPUT

**Creates:** `field_events` record with event_type = CHEMICAL_APPLICATION or FERTILIZER_APPLICATION or SEED_PURCHASE etc.

**Extracts:** pu_id, cycle_id, input_type, input_name (matched to kb.chemicals or inputs_inventory), quantity, unit, application_date

**Example:** "Applied 2 liters of dimethoate to PU002 for aphids today"

**Critical:** `applied_at` is recorded. Withholding period begins from this timestamp. The chemical must be matched to `kb.chemicals` to retrieve the withholding_days value.

### Intent 4: LOG_CASH

**Creates:** `cash_ledger` record

**Extracts:** transaction_type (INCOME or EXPENSE), amount_fjd, description, expense_category (LABOR, INPUTS, TRANSPORT, EQUIPMENT, OTHER), cycle_id (optional for expense attribution), customer_id or supplier_id

**Example:** "Received 420 dollars from Flagstaff market for watermelon delivery today"

**Parsed output:**
```json
{
  "intent": "LOG_CASH",
  "transaction_type": "INCOME",
  "amount_fjd": 420.00,
  "description": "Watermelon delivery payment",
  "customer_id": "CUS-008",
  "transaction_date": "today"
}
```

### Intent 5: LOG_WEATHER

**Creates:** `weather_log` record

**Extracts:** farm_id (from user context), rainfall_mm (optional), wind_speed_kmh (optional), weather_event_type (RAIN, STORM, CYCLONE, DROUGHT, NORMAL), observation_date

**Example:** "Heavy rain last night at the farm, about 40mm I think"

### Intent 6: CHECK_TASKS

**Queries:** `task_queue` table

**Returns:** Formatted list of tasks for the requesting worker's farm and PU assignments, filtered by status = PENDING or OVERDUE, sorted by due_date ascending

**Example:** "What tasks are due this week for PU002?"

**Response format:** Plain text list of tasks with task name, PU, and due date. Maximum 10 tasks returned (truncated with "and N more tasks" if more exist).

### Intent 7: CHECK_ALERTS

**Queries:** `alerts` table WHERE status = 'open'

**Returns:** Formatted list of open alerts, sorted by severity DESC then created_at ASC

**Example:** "What alerts are open for the farm right now?"

**Response:** Groups by severity. CRITICAL alerts first, then HIGH, then MEDIUM. Maximum 5 per severity level in the voice response (brevity for audio).

### Intent 8: CHECK_FINANCIALS

**Queries:** `cycle_financials` view + `cash_ledger` table

**Returns:** CoKG estimate, gross margin %, cash position for specified cycle or PU

**Example:** "What's the CoKG for the eggplant on PU002?"

**Permission check:** Requires PREMIUM subscription. Returns subscription gate error for FREE/BASIC subscribers.

### Intent 9: CREATE_CYCLE

**Initiates:** New production cycle creation workflow

**Extracts:** pu_id, production_id (crop type), planned_start_date

**Triggers automatically:**
1. `validate_rotation()` — rotation gate check
2. If APPROVED: creates PLANNED cycle and generates initial tasks
3. If BLOCKED: returns rotation gate result with alternatives
4. If OVERRIDE_REQUIRED: sends confirmation request to Farm Manager

**Example:** "I want to start a new cassava cycle on PU005 next week"

**This is the most complex intent — it triggers the rotation gate, requires Farm Manager confirmation, and creates multiple database records.**

### Intent 10: CHECK_STOCK

**Queries:** `inputs_inventory` table

**Returns:** Current stock level for specified input, whether it is at or below reorder threshold, reorder quantity

**Example:** "How much NPK fertilizer do we have left?"

**For F002:** Includes ferry buffer days remaining calculation in the response.

### Intent 11: GET_PROTOCOL

**Queries:** `shared.kb_protocols` table (Knowledge Broker call)

**Returns:** The stage protocol for the current stage of the specified PU/cycle

**Example:** "What should I be doing with the watermelon on PU001 right now?"

**Response:** Current stage name, current recommended tasks from the KB protocol, any upcoming stage milestones.

### Intent 12: REPORT_INCIDENT

**Creates:** `incident_log` record

**Extracts:** incident_type (THEFT, CROP_FAILURE, EQUIPMENT_FAILURE, ANIMAL_MORTALITY, WEATHER_DAMAGE, PEST_OUTBREAK, OTHER), description, pu_id (optional), severity_estimate, incident_date

**Creates:** Corresponding CRITICAL (for mortality, crop failure, theft) or HIGH (for equipment failure) alert.

**Example:** "One of the goats died this morning, found it near the water trough"

**Triggers:** RULE-021 (MortalityResponse EventBased Critical) — immediately fires CRITICAL alert and WhatsApp notification.

---

## Section 16: Offline-First Sync

### The Offline Requirement

F002 on Kadavu Island has unreliable to zero internet connectivity during farm working hours. F001 in rural Serua has moderate connectivity. Both farms require that TFOS works fully offline for field data entry operations.

### Operations That Cache to IndexedDB

The following operations must work identically online and offline:

| Operation | IndexedDB Store | Sync Priority |
|-----------|----------------|---------------|
| `field_event` creation (LOG_INPUT, LOG_WEATHER) | `pending_field_events` | MEDIUM |
| `harvest_log` creation (LOG_HARVEST) | `pending_harvest_logs` | HIGH |
| `cash_ledger` entry (LOG_CASH) | `pending_cash_entries` | HIGH |
| `labor_attendance` entry (LOG_LABOR) | `pending_labor_records` | MEDIUM |

Operations that do NOT work offline (require live database):
- Rotation gate validation (CREATE_CYCLE)
- Chemical compliance check
- Alert resolution
- TIS Knowledge Broker queries
- Decision Engine reads

### Sync Queue Dispatch

When connectivity is restored (detected via the browser's `online` event and a ping to the TFOS API health endpoint), the sync queue processes pending records in this order:

1. `pending_labor_records` — lowest conflict risk
2. `pending_cash_entries` — ordered by transaction_date
3. `pending_field_events` — ordered by event_date
4. `pending_harvest_logs` — LAST, because chemical compliance check runs during sync upload. If a harvest_log was created offline during a withholding period, the compliance check will block it and create a CRITICAL alert at sync time.

### Conflict Resolution

- **Resolution strategy:** Last-write-wins per record (by `created_at` timestamp)
- This means: if a Farm Manager edits a record online while a worker's offline entry for the same PU is pending sync, the most recently created record wins
- Conflicts are logged in `sync_conflict_log` table for manual review
- Workers are never silently discarded — if a record is overwritten, the original is preserved in `sync_conflict_log`

### Maximum Offline Queue Size

- **500 records** maximum in the offline queue before the PWA forces the user to seek connectivity and sync
- At 490 records, the PWA displays a persistent banner: "Offline queue nearly full. Please connect to sync your data soon."
- At 500 records, new offline logging is blocked with a hard error: "Offline queue full. Please connect to the internet to sync before logging more data."
- This limit prevents data loss from extended offline periods where the queue could grow uncontrollably

### UI Requirements

The PWA must display a sync status indicator at all times:

- **Green dot + "Online":** Connected to TFOS API, all records synced
- **Yellow dot + "Offline — N pending":** No connectivity, N records queued in IndexedDB
- **Blue spinning dot + "Syncing...":** Sync in progress
- **Red dot + "Sync failed — N records":** Sync attempted but one or more records failed to upload (with tap-to-retry)

The sync status indicator is a non-negotiable UI element for all field-facing screens. It is never hidden.

### Service Worker Caching Strategy

The PWA Service Worker must cache:
- Full application shell (HTML, JS bundles, CSS)
- All static assets (icons, fonts, farm logos)
- The last-loaded PU list and active cycle list for the user's farm (for offline reference)
- KB article content that the user has previously viewed (for offline agronomic reference)

The Service Worker does NOT cache:
- Real-time decision signals (must be live)
- Alert states (must be live)
- Financial reports (must be live)

---

*This document is the authoritative reference for all TFOS business rules. When in doubt, the rule in this document governs. When a rule changes through business negotiation (e.g., profit share rate, ferry lead time days, expansion readiness thresholds), update this document first, then update the configurable value in the database.*

---

**Document maintained by:** Teivaka Development Team
**Company:** Teivaka PTE LTD, Fiji | Company No. 2025RC001894
**Founder:** Uraia Koroi Kama (Cody)
