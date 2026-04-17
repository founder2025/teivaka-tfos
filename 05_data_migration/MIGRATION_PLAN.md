# FILE: 05_data_migration/MIGRATION_PLAN.md

# Teivaka TFOS v7.0 — Data Migration Plan

**Platform:** Teivaka Agricultural TOS (Agri-TOS), Fiji
**Source:** Google Sheets TFOS v7.0 workbook
**Target:** PostgreSQL 16 + TimescaleDB (teivaka_db)
**Version:** 1.0
**Date:** 2026-04-07
**Prepared by:** Teivaka Development Team

---

## Overview

This document defines the complete migration plan for moving all Teivaka Farm Operating System (TFOS) reference data, configuration, and active operational data from the Google Sheets v7.0 workbook into the PostgreSQL database.

The migration is **a one-time data seeding operation**, not a live sync. Once the PostgreSQL database is live, the Google Sheets v7.0 workbook becomes read-only historical reference. All new data is captured through the TFOS application.

**Scope:**
- All reference/master data (shared schema: productions, stages, libraries, rotation, rules)
- All tenant configuration (farms, zones, PUs, workers, customers, suppliers, equipment, inputs)
- All automation configuration (automation_rules, decision_signal_config)
- Active production cycles (7 rows — current live cycles)
- Known data quality issues must be corrected during migration (see Section 2)

**Out of scope for migration (start fresh in PostgreSQL):**
- field_events (historical field operations)
- harvest_log (historical harvest records)
- labor_attendance (historical labor records)
- cash_ledger (historical cash records)
- weather_log (historical weather observations)
- automation_alerts (historical alerts — start fresh, current rules will regenerate them)

---

## SECTION 1 — Source Sheet → Target Table Mapping

### Complete Sheet-to-Table Reference

The following table maps every sheet in the TFOS v7.0 Google Sheets workbook to its target PostgreSQL table. Source row counts are as of the last export.

#### Shared Schema (cross-tenant reference data)

| Source Sheet (v7.0) | Target Table | Source Rows | Notes |
|---|---|---|---|
| `Production_Master` | `shared.productions` | 49 | Crop/production product definitions |
| `Production_Stages` | `shared.production_stages` | ~180 | Stages per production (multi-row per crop) |
| `Stage_Protocols` | `shared.production_stage_protocols` | ~90 | Links stages to KB articles |
| `Production_Thresholds` | `shared.production_thresholds` | ~200 | CoKG and performance thresholds per stage |
| `Stage_Task_Master` | `shared.stage_task_master` | ~350 | Automated tasks per stage |
| `Yield_Benchmarks` | `shared.yield_benchmarks` | ~100 | Benchmark yields per crop/stage/zone |
| `Pest_Library` | `shared.pest_library` | 43 | All tracked pest species |
| `Disease_Library` | `shared.disease_library` | 30 | All tracked plant diseases |
| `Weed_Library` | `shared.weed_library` | 27 | All tracked weed species |
| `Chemicals_Library` | `shared.chemical_library` | 45 | Registered chemicals with withholding periods |
| `Family_Policies` | `shared.family_policies` | 14 | Teivaka family business policies |
| `Rotation_Registry` | `shared.rotation_registry` | 49 | Crop rotation rules (all crop combinations) |
| `Actionable_Rules` | `shared.actionable_rules` | 1444 | Fine-grained operational rules |
| `Status_Matrix` | `shared.status_matrix` | ~200 | RAG status thresholds per signal |
| `MinRest_Matrix` | `shared.min_rest_matrix` | ~100 | Minimum rest days between crop rotations |
| `RotationTopChoices` | `shared.rotation_top_choices` | ~150 | Recommended next crops per previous crop |

#### Tenant Schema (Teivaka-specific data)

| Source Sheet (v7.0) | Target Table | Source Rows | Notes |
|---|---|---|---|
| `Farm_Setup` | `farms` | 2 | F001 (Save-A-Lot), F002 (Viyasiyasi) |
| `Zone_Register` | `zones` | 14 | Zones across both farms |
| `ProductionUnit_Register` | `production_units` | 21 | PUs across both farms |
| `Workers` | `workers` | 11 | All registered farm workers |
| `Resources` | `resources` | ~15 | Farm resource definitions |
| `Activities` | `activities` | ~20 | Activity type reference list |
| `Customers` | `customers` | 16 | All registered customers (with CUS-015 fix) |
| `Suppliers` | `suppliers` | 13 | All registered suppliers |
| `Equipment_Register` | `equipment` | 23 | Farm equipment inventory |
| `Inputs_Master` | `inputs` | 26 | Farm input inventory and stock levels |
| `Automation_Rules` | `automation_rules` | 43 | Automation rules (with RULE-042/043/031/032 fixes) |
| `Decision_Engine` | `decision_signal_config` | 10 | Decision engine signals (NULL row removed) |
| `Active_Cycles` | `production_cycles` | 7 | Currently active production cycles |
| `Price_Master` | `price_master` | ~30 | Current selling prices per crop/grade |
| *(new)* | `tenants` | 1 | Teivaka tenant record |
| *(new)* | `users` | 1+ | Cody + admin user accounts |
| *(new)* | `tenant_subscriptions` | 1 | Teivaka PREMIUM subscription |
| *(new)* | `hive_register` | 4 | Apiculture hives (LIV-API) |
| *(new)* | `livestock_register` | 8 | Goat records |

#### Column Mapping Notes

**`Farm_Setup` → `farms`:**
- `FarmID` → `farm_id`
- `FarmName` → `farm_name`
- `Location` → `location_description`
- `Island` (Y/N) → `island_flag` (boolean)
- `FerryBufferDays` → `ferry_buffer_days` (F002: 7, F001: 0)

**`ProductionUnit_Register` → `production_units`:**
- `PUID` → `pu_id`
- `FarmID` → `farm_id`
- `ZoneID` → `zone_id`
- `AreaHa` → `area_ha`
- `CurrentStatus` → `status` (normalize: Active → active)
- `SoilType` → `soil_type`

**`Workers` → `workers`:**
- `WorkerID` → `worker_id`
- `FullName` → `full_name`
- `Role` → `role`
- `PhoneNumber` → `phone_number` (normalize to +679XXXXXXX format)
- `DailyRateFJD` → `daily_rate_fjd`
- `FarmID` → `primary_farm_id`

**`Automation_Rules` → `automation_rules`:**
- See Section 2 for RULE-042, RULE-043, RULE-031, RULE-032 fixes
- `RuleID` → `rule_id`
- `Active` → `is_active` (boolean)
- `TriggerCategory` → `trigger_category`
- `TaskType` → `task_type`
- `FrequencyDays` → `frequency_days` (integer)
- `Severity` → `severity` (string: 'Low'/'Medium'/'High'/'Critical')

**`Decision_Engine` → `decision_signal_config`:**
- `SignalName` → `signal_name`
- `SignalDescription` → `description`
- `CalculationMethod` → `calculation_method`
- `GreenThreshold` → `green_threshold`
- `AmberThreshold` → `amber_threshold`
- See Section 2 for NULL row removal

**`Chemicals_Library` → `shared.chemical_library`:**
- `ChemicalID` → `chemical_id`
- `ChemicalName` → `chemical_name`
- `ActiveIngredient` → `active_ingredient`
- `WithholdingPeriodDays` → `withholding_period_days` (critical for compliance checks)
- `ApprovedCrops` → `approved_crop_ids` (text array)
- `RegistrationStatus` → `is_registered` (must be 'Registered' to appear in TIS recommendations)

---

## SECTION 2 — Known Data Quality Issues and Fixes

The following data quality issues were identified in the TFOS v7.0 Google Sheets workbook during export review. Each issue must be corrected during the extraction/transformation stage before loading into PostgreSQL.

### Issue 1: RULE-042 — Column Shift

**Problem:** In the `Automation_Rules` sheet, row corresponding to RULE-042 has a column alignment error. The values for `Active`, `TriggerCategory`, `TaskType`, `FrequencyDays`, and `Severity` are shifted one column to the right from their headers. This is a Google Sheets data entry error where one cell was inserted in the wrong column.

**Affected row:** RULE-042

**Incorrect data in sheet (shifted):**
- Column that should be `Active` → contains value that belongs in the previous column
- `TriggerCategory` → contains value that belongs in `Active`
- Etc. — all values shifted right by one position

**Correct values to apply:**
```
rule_id           = "RULE-042"
is_active         = true
trigger_category  = "OrderStatus"
task_type         = "OrderOverdue"
frequency_days    = 1
severity          = "High"
```

**Fix in extraction script:**
```python
# In extract_automation_rules.py
if row["RuleID"] == "RULE-042":
    row["Active"] = True
    row["TriggerCategory"] = "OrderStatus"
    row["TaskType"] = "OrderOverdue"
    row["FrequencyDays"] = 1
    row["Severity"] = "High"
```

---

### Issue 2: RULE-043 — Column Shift (Same as RULE-042)

**Problem:** RULE-043 has the same column shift issue as RULE-042. Both rules appear to have been entered during the same data entry session where the column was misaligned.

**Affected row:** RULE-043

**Correct values to apply:**
```
rule_id           = "RULE-043"
is_active         = true
trigger_category  = "WorkerPerformance"
task_type         = "WorkerInactive"
frequency_days    = 14
severity          = "Medium"
```

**Fix in extraction script:**
```python
if row["RuleID"] == "RULE-043":
    row["Active"] = True
    row["TriggerCategory"] = "WorkerPerformance"
    row["TaskType"] = "WorkerInactive"
    row["FrequencyDays"] = 14
    row["Severity"] = "Medium"
```

---

### Issue 3: RULE-031 — Boolean in Severity Field

**Problem:** RULE-031's `Severity` field contains the Python boolean literal `True` instead of the string `"High"`. This is caused by a Google Sheets Apps Script bug where a boolean value was written directly to a text field without string conversion.

**Affected row:** RULE-031
**Incorrect value:** `True` (boolean or string "True")
**Correct value:** `"High"` (string)

**Fix in extraction script:**
```python
if row["RuleID"] == "RULE-031":
    row["Severity"] = "High"

# Also apply general boolean-to-severity cleanup
def clean_severity(value):
    if value is True or str(value).strip().lower() == "true":
        return "High"
    if value is False or str(value).strip().lower() == "false":
        return "Low"
    return str(value).strip()
```

---

### Issue 4: RULE-032 — Boolean in Severity Field (Same as RULE-031)

**Problem:** RULE-032 has the same `Severity = True` issue as RULE-031.

**Affected row:** RULE-032
**Correct value:** `"High"`

**Fix in extraction script:**
```python
if row["RuleID"] == "RULE-032":
    row["Severity"] = "High"
```

---

### Issue 5: Decision Engine — NULL SignalName Row (Row 11)

**Problem:** Row 11 in the `Decision_Engine` sheet has a NULL (empty) `SignalName`. All other 10 rows have valid signal names. This NULL row is a data entry artifact — it does not correspond to any real decision signal and was likely created accidentally during copy-paste or row insertion.

**Affected row:** Row 11 (0-indexed row 10) in `Decision_Engine` sheet
**Issue:** `SignalName` is NULL or empty string

**Effect if not fixed:** Migration would create a `decision_signal_config` record with a NULL primary key or empty `signal_name`, causing downstream failures in the Decision Engine evaluation logic.

**Fix:**
```python
# In extract_decision_engine.py
rows = [r for r in raw_rows if r.get("SignalName") and str(r["SignalName"]).strip() != ""]
# This removes the NULL row — result should be exactly 10 valid signal rows
assert len(rows) == 10, f"Expected 10 decision signal rows, got {len(rows)}"
```

**Post-migration validation:**
```sql
-- Should return exactly 10 rows, no NULLs
SELECT COUNT(*), COUNT(signal_name) FROM decision_signal_config;
-- Expected: count = 10, count(signal_name) = 10
```

---

### Issue 6: CUS-016 Duplicate — Should Be CUS-015

**Problem:** In the `Customers` sheet, the CustomerID `CUS-016` appears twice. The second occurrence is actually a different customer — Vunisea Market on Kadavu Island — which should have CustomerID `CUS-015`. The first `CUS-016` is the correct CUS-016 entry. The second `CUS-016` was incorrectly entered when `CUS-015` was skipped during data entry.

**Affected data:**
- First CUS-016: legitimate CUS-016 entry — keep as-is
- Second CUS-016 (Vunisea Market, Kadavu): must be changed to CUS-015

**Customer details to correct:**
```
CustomerID:   CUS-015 (corrected from CUS-016)
CustomerName: Vunisea Market
Location:     Vunisea, Kadavu Island
FarmServed:   F002
```

**Fix in extraction script:**
```python
# In extract_customers.py
seen_customer_ids = set()
corrected_rows = []
for row in raw_rows:
    cid = row["CustomerID"]
    if cid == "CUS-016" and cid in seen_customer_ids:
        # This is the duplicate — it's actually CUS-015 (Vunisea Market)
        row["CustomerID"] = "CUS-015"
    seen_customer_ids.add(row["CustomerID"])
    corrected_rows.append(row)
```

**Post-migration validation:**
```sql
-- CUS-015 must exist with Vunisea Market
SELECT customer_id, customer_name FROM customers
WHERE customer_id IN ('CUS-015', 'CUS-016')
ORDER BY customer_id;
-- Expected: exactly 2 rows, CUS-015 = Vunisea Market, CUS-016 = [correct name]

-- CUS-016 must not appear twice
SELECT customer_id, COUNT(*) FROM customers GROUP BY customer_id HAVING COUNT(*) > 1;
-- Expected: 0 rows
```

---

### Issue 7: General Data Cleaning Rules

Apply these transformations to **all** extracted fields:

**Text fields — whitespace normalization:**
```python
def clean_text(value) -> str:
    if value is None:
        return None
    return str(value).strip()

# Apply to: all VARCHAR/TEXT columns — names, descriptions, IDs
```

**Phone number normalization:**
```python
import re

def normalize_phone_number(raw: str) -> str:
    """Normalize phone numbers to E.164 format for Fiji (+679XXXXXXX)."""
    if not raw:
        return None
    # Remove all non-digit characters
    digits = re.sub(r'\D', '', str(raw))
    # Fiji local numbers: 7 digits starting with 6,7,8,9
    if len(digits) == 7:
        return f"+679{digits}"
    # Already has country code
    if digits.startswith("679") and len(digits) == 10:
        return f"+{digits}"
    # International format already
    if digits.startswith("679") or len(digits) > 10:
        return f"+{digits.lstrip('0')}"
    return f"+679{digits}"

# Apply to: workers.phone_number, customers.phone_number, users.phone_number
```

**Boolean fields:**
```python
def clean_boolean(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().upper() in ("TRUE", "YES", "Y", "1", "ACTIVE")
    if isinstance(value, (int, float)):
        return bool(value)
    return False

# Apply to: automation_rules.is_active, production_units.is_active, workers.is_active
```

**Decimal/numeric cleaning:**
```python
def clean_decimal(value) -> float:
    if value is None or str(value).strip() == "":
        return None
    try:
        return float(str(value).replace(",", "").strip())
    except ValueError:
        return None

# Apply to: daily_rate_fjd, area_ha, qty values, price values
```

---

## SECTION 3 — Migration Order (Dependency Sequence)

The migration must proceed in dependency order. A table can only be loaded after all its foreign key dependencies are already populated.

### Phase A — Shared Schema (No FK Dependencies Outside shared)

All tables in `shared` schema reference only other `shared` tables or have no FKs. Load in this order:

| Step | Table | Source Sheet | Rows | Notes |
|---|---|---|---|---|
| 1 | `shared.productions` | `Production_Master` | 49 | No FKs — base reference table |
| 2 | `shared.production_stages` | `Production_Stages` | ~180 | FK → `shared.productions` |
| 3 | `shared.production_stage_protocols` | `Stage_Protocols` | ~90 | FK → `shared.production_stages` |
| 4 | `shared.production_thresholds` | `Production_Thresholds` | ~200 | FK → `shared.productions`, `shared.production_stages` |
| 5 | `shared.stage_task_master` | `Stage_Task_Master` | ~350 | FK → `shared.production_stages` |
| 6 | `shared.yield_benchmarks` | `Yield_Benchmarks` | ~100 | FK → `shared.productions`, `shared.production_stages` |
| 7 | `shared.pest_library` | `Pest_Library` | 43 | No FKs — independent library |
| 8 | `shared.disease_library` | `Disease_Library` | 30 | No FKs — independent library |
| 9 | `shared.weed_library` | `Weed_Library` | 27 | No FKs — independent library |
| 10 | `shared.chemical_library` | `Chemicals_Library` | 45 | No FKs — critical: withholding_period_days must be populated |
| 11 | `shared.family_policies` | `Family_Policies` | 14 | No FKs — Teivaka operational policies |
| 12 | `shared.rotation_registry` | `Rotation_Registry` | 49 | FK → `shared.productions` (source + target crops) |
| 13 | `shared.actionable_rules` | `Actionable_Rules` | 1444 | FK → `shared.productions`, `shared.production_stages` |
| 14 | `shared.status_matrix` | `Status_Matrix` | ~200 | FK → `shared.productions` |
| 15 | `shared.min_rest_matrix` | `MinRest_Matrix` | ~100 | FK → `shared.productions` (both crop columns) |
| 16 | `shared.rotation_top_choices` | `RotationTopChoices` | ~150 | FK → `shared.productions` |

**Phase A validation checkpoint:**
```sql
-- Verify row counts
SELECT 'shared.productions' AS tbl, COUNT(*) FROM shared.productions
UNION ALL
SELECT 'shared.pest_library', COUNT(*) FROM shared.pest_library
UNION ALL
SELECT 'shared.disease_library', COUNT(*) FROM shared.disease_library
UNION ALL
SELECT 'shared.weed_library', COUNT(*) FROM shared.weed_library
UNION ALL
SELECT 'shared.chemical_library', COUNT(*) FROM shared.chemical_library
UNION ALL
SELECT 'shared.actionable_rules', COUNT(*) FROM shared.actionable_rules;

-- Expected: productions=49, pest_library=43, disease_library=30, weed_library=27, chemical_library=45, actionable_rules=1444

-- Verify kava inactivity alert config
SELECT production_id, inactivity_alert_days
FROM shared.productions
WHERE production_id = 'CRP-KAV';
-- Expected: inactivity_alert_days = 180

-- Verify withholding periods populated
SELECT COUNT(*) FROM shared.chemical_library WHERE withholding_period_days IS NULL;
-- Expected: 0 (all chemicals must have withholding period defined)

-- Verify rotation registry
SELECT COUNT(*) FROM shared.rotation_registry;
-- Expected: 49

-- Verify no orphaned stages
SELECT COUNT(*) FROM shared.production_stages ps
LEFT JOIN shared.productions p ON ps.production_id = p.production_id
WHERE p.production_id IS NULL;
-- Expected: 0
```

---

### Phase B — Tenant Core (FK to tenants, no cross-tenant dependencies)

Load the Teivaka tenant record first, then all configuration that depends on it.

| Step | Table | Source | Rows | Notes |
|---|---|---|---|---|
| 17 | `tenants` | Manual | 1 | Teivaka tenant record — created, not from sheet |
| 18 | `users` | Manual | 1+ | Cody (admin) + any existing user accounts |
| 19 | `farms` | `Farm_Setup` | 2 | F001 and F002 |
| 20 | `zones` | `Zone_Register` | 14 | FK → `farms` |
| 21 | `suppliers` | `Suppliers` | 13 | FK → `tenants` |
| 22 | `customers` | `Customers` | 16 | FK → `tenants` — apply CUS-015 fix |
| 23 | `workers` | `Workers` | 11 | FK → `tenants`, `farms` — normalize phone numbers |
| 24 | `production_units` | `ProductionUnit_Register` | 21 | FK → `farms`, `zones` |
| 25 | `equipment` | `Equipment_Register` | 23 | FK → `farms`, optional `zones` |
| 26 | `inputs` | `Inputs_Master` | 26 | FK → `tenants`, optional `suppliers` |

**Teivaka tenant seed record:**
```sql
INSERT INTO tenants (
    tenant_id, tenant_name, subscription_tier, owner_name, owner_phone,
    primary_timezone, currency_code, is_active, created_at
) VALUES (
    'TEN-001',
    'Teivaka Agricultural TOS',
    'premium',
    'Uraia Koroi Kama',
    '+679XXXXXXXX',   -- Cody's number — fill from secure config
    'Pacific/Fiji',
    'FJD',
    true,
    NOW()
);
```

**Phase B validation checkpoint:**
```sql
-- Verify farm count
SELECT COUNT(*) FROM farms WHERE tenant_id = 'TEN-001';
-- Expected: 2

-- Verify F001 and F002 exist
SELECT farm_id, farm_name, island_flag FROM farms WHERE tenant_id = 'TEN-001' ORDER BY farm_id;
-- Expected: F001 (Save-A-Lot, island_flag=false), F002 (Viyasiyasi Farm, island_flag=true)

-- Verify all 21 PUs have valid farm_id
SELECT COUNT(*) FROM production_units pu
LEFT JOIN farms f ON pu.farm_id = f.farm_id AND pu.tenant_id = f.tenant_id
WHERE f.farm_id IS NULL;
-- Expected: 0

-- Verify 14 zones, all with valid farm_id
SELECT COUNT(*) FROM zones WHERE tenant_id = 'TEN-001';
-- Expected: 14

-- Verify CUS-015 exists (Vunisea Market, Kadavu)
SELECT customer_id, customer_name FROM customers
WHERE customer_id = 'CUS-015' AND tenant_id = 'TEN-001';
-- Expected: 1 row, customer_name = 'Vunisea Market'

-- Verify CUS-016 does NOT appear twice
SELECT customer_id, COUNT(*) AS cnt FROM customers
WHERE tenant_id = 'TEN-001'
GROUP BY customer_id HAVING COUNT(*) > 1;
-- Expected: 0 rows

-- Verify all 11 workers loaded
SELECT COUNT(*) FROM workers WHERE tenant_id = 'TEN-001';
-- Expected: 11

-- Verify no NULL phone numbers on workers (post normalization)
-- Some workers may have no phone — NULL is acceptable
-- But ensure format is correct where present
SELECT worker_id, phone_number FROM workers
WHERE phone_number IS NOT NULL
  AND phone_number NOT LIKE '+679%';
-- Expected: 0 rows (all non-null phones in Fiji format)

-- Verify 26 inputs loaded
SELECT COUNT(*) FROM inputs WHERE tenant_id = 'TEN-001';
-- Expected: 26
```

---

### Phase C — Automation Configuration

Load automation rules and decision engine configuration. These depend on Phase B (tenant, farms).

| Step | Table | Source | Rows | Notes |
|---|---|---|---|---|
| 27 | `automation_rules` | `Automation_Rules` | 43 | Apply RULE-042, 043, 031, 032 fixes |
| 28 | `decision_signal_config` | `Decision_Engine` | 10 | Remove NULL row — should load exactly 10 rows |

**Phase C validation checkpoint:**
```sql
-- Verify total automation rules count
SELECT COUNT(*) FROM automation_rules WHERE tenant_id = 'TEN-001';
-- Expected: 43

-- Verify RULE-042 has correct values
SELECT rule_id, is_active, trigger_category, task_type, frequency_days, severity
FROM automation_rules
WHERE rule_id = 'RULE-042';
-- Expected: is_active=true, trigger_category='OrderStatus', task_type='OrderOverdue',
--           frequency_days=1, severity='High'

-- Verify RULE-043 has correct values
SELECT rule_id, is_active, trigger_category, task_type, frequency_days, severity
FROM automation_rules
WHERE rule_id = 'RULE-043';
-- Expected: is_active=true, trigger_category='WorkerPerformance', task_type='WorkerInactive',
--           frequency_days=14, severity='Medium'

-- Verify RULE-031 severity is not boolean/string 'True'
SELECT rule_id, severity FROM automation_rules
WHERE rule_id IN ('RULE-031', 'RULE-032');
-- Expected: both rows have severity='High' (string, not boolean)

-- Verify no boolean values leaked into severity field across all rules
SELECT COUNT(*) FROM automation_rules
WHERE severity NOT IN ('Low', 'Medium', 'High', 'Critical');
-- Expected: 0

-- Verify decision signal config — exactly 10 rows, no NULL signal_name
SELECT COUNT(*), COUNT(signal_name) FROM decision_signal_config
WHERE tenant_id = 'TEN-001';
-- Expected: count=10, count(signal_name)=10

-- Verify no NULL signal names
SELECT COUNT(*) FROM decision_signal_config
WHERE signal_name IS NULL OR signal_name = '';
-- Expected: 0
```

---

### Phase D — Active Cycles and Operational Records

Load the currently active production cycles and related operational starting records.

| Step | Table | Source | Rows | Notes |
|---|---|---|---|---|
| 29 | `production_cycles` | `Active_Cycles` | 7 | 7 active cycles across F001 and F002 |
| 30 | `hive_register` | `Hive_Register` | 4 | 4 apiculture hives (LIV-API) |
| 31 | `livestock_register` | `Livestock_Register` | 8 | 8 goats |
| 32 | `price_master` | `Price_Master` | ~30 | Current selling prices by crop and grade |
| 33 | `tenant_subscriptions` | Manual | 1 | Teivaka PREMIUM subscription |

**Active cycles expected (from TFOS v7.0 Active_Cycles sheet):**

| Cycle ID | Farm | PU | Crop | Status |
|---|---|---|---|---|
| CY-F001-26-001 | F001 | F001-PU001 | Cassava (CRP-CAS) | active |
| CY-F001-26-002 | F001 | F001-PU002 | Eggplant (CRP-EGG) | active |
| CY-F001-26-003 | F001 | F001-PU003 | Eggplant (CRP-EGG) | active |
| CY-F001-26-004 | F001 | F001-PU004 | Pineapple (FRT-PIN) | active |
| CY-F001-KAV-01 | F001 | F001-PU-KAV | Kava (CRP-KAV) | active |
| CY-F002-26-001 | F002 | F002-PU001 | Eggplant (CRP-EGG) | active |
| CY-F002-26-002 | F002 | F002-PU002 | Cassava (CRP-CAS) | active |

*Note: Exact Cycle IDs must be confirmed against the Active_Cycles sheet. The table above is indicative — use actual IDs from the source.*

**Tenant subscription seed record:**
```sql
INSERT INTO tenant_subscriptions (
    subscription_id, tenant_id, tier, status,
    started_at, billing_period, monthly_rate_fjd
) VALUES (
    gen_random_uuid()::text,
    'TEN-001',
    'premium',
    'active',
    CURRENT_DATE,
    'monthly',
    NULL   -- rate TBD — set manually by Cody
);
```

**Phase D validation checkpoint:**
```sql
-- Verify 7 active cycles
SELECT COUNT(*) FROM production_cycles
WHERE tenant_id = 'TEN-001' AND status = 'active';
-- Expected: 7

-- Verify cycle IDs follow the locked format CY-FARM-YY-###
SELECT cycle_id FROM production_cycles
WHERE tenant_id = 'TEN-001' AND status = 'active'
ORDER BY cycle_id;
-- Manually verify each ID matches the format

-- Verify kava cycles have correct status
SELECT cycle_id, production_id, status, planting_date
FROM production_cycles
WHERE production_id = 'CRP-KAV' AND tenant_id = 'TEN-001';
-- Expected: status = 'active', planting_date populated

-- Verify all active cycles have valid pu_id
SELECT COUNT(*) FROM production_cycles pc
LEFT JOIN production_units pu ON pc.pu_id = pu.pu_id AND pc.tenant_id = pu.tenant_id
WHERE pc.tenant_id = 'TEN-001' AND pc.status = 'active' AND pu.pu_id IS NULL;
-- Expected: 0

-- Verify price_master populated
SELECT COUNT(*) FROM price_master WHERE tenant_id = 'TEN-001';
-- Expected: > 0 (at minimum one price per active crop and grade)

-- Verify tenant subscription
SELECT tier, status FROM tenant_subscriptions WHERE tenant_id = 'TEN-001';
-- Expected: tier='premium', status='active'
```

---

## SECTION 4 — Validation Checks Per Phase

### Summary of Validation Assertions

The following assertions must all pass before the migration is considered complete. Run these as a final validation suite after all phases are loaded.

#### Phase A Assertions

| Check | Query | Expected Result |
|---|---|---|
| All 49 crops loaded | `SELECT COUNT(*) FROM shared.productions` | 49 |
| All 43 pests loaded | `SELECT COUNT(*) FROM shared.pest_library` | 43 |
| All 30 diseases loaded | `SELECT COUNT(*) FROM shared.disease_library` | 30 |
| All 27 weeds loaded | `SELECT COUNT(*) FROM shared.weed_library` | 27 |
| All 45 chemicals loaded | `SELECT COUNT(*) FROM shared.chemical_library` | 45 |
| All 1444 actionable rules loaded | `SELECT COUNT(*) FROM shared.actionable_rules` | 1444 |
| All 14 family policies loaded | `SELECT COUNT(*) FROM shared.family_policies` | 14 |
| All 49 rotation rules loaded | `SELECT COUNT(*) FROM shared.rotation_registry` | 49 |
| No chemicals missing withholding period | `SELECT COUNT(*) FROM shared.chemical_library WHERE withholding_period_days IS NULL` | 0 |
| Kava inactivity alert correctly set | `SELECT inactivity_alert_days FROM shared.productions WHERE production_id = 'CRP-KAV'` | 180 |
| All production IDs present | `SELECT production_id FROM shared.productions ORDER BY production_id` | CRP-CAS, CRP-EGG, CRP-KAV, FRT-PIN, LIV-API, ... (all 49) |

#### Phase B Assertions

| Check | Query | Expected Result |
|---|---|---|
| Both farms loaded | `SELECT COUNT(*) FROM farms WHERE tenant_id = 'TEN-001'` | 2 |
| F001 is mainland (not island) | `SELECT island_flag FROM farms WHERE farm_id = 'F001'` | false |
| F002 is island | `SELECT island_flag FROM farms WHERE farm_id = 'F002'` | true |
| F002 has ferry buffer | `SELECT ferry_buffer_days FROM farms WHERE farm_id = 'F002'` | 7 |
| 14 zones loaded | `SELECT COUNT(*) FROM zones WHERE tenant_id = 'TEN-001'` | 14 |
| 21 PUs loaded | `SELECT COUNT(*) FROM production_units WHERE tenant_id = 'TEN-001'` | 21 |
| All PUs have valid farm_id | See Phase B checkpoint | 0 orphans |
| CUS-015 exists (Vunisea Market) | `SELECT COUNT(*) FROM customers WHERE customer_id = 'CUS-015'` | 1 |
| CUS-016 not duplicated | `SELECT COUNT(*) FROM customers WHERE customer_id = 'CUS-016'` | 1 (not 2) |
| 16 customers total | `SELECT COUNT(*) FROM customers WHERE tenant_id = 'TEN-001'` | 16 |
| 11 workers total | `SELECT COUNT(*) FROM workers WHERE tenant_id = 'TEN-001'` | 11 |
| All 9 named workers present | Check W-001 through W-009 exist | All 9 present |
| 13 suppliers loaded | `SELECT COUNT(*) FROM suppliers WHERE tenant_id = 'TEN-001'` | 13 |
| 23 equipment items loaded | `SELECT COUNT(*) FROM equipment WHERE tenant_id = 'TEN-001'` | 23 |
| 26 inputs loaded | `SELECT COUNT(*) FROM inputs WHERE tenant_id = 'TEN-001'` | 26 |

#### Phase C Assertions

| Check | Query | Expected Result |
|---|---|---|
| 43 automation rules loaded | `SELECT COUNT(*) FROM automation_rules WHERE tenant_id = 'TEN-001'` | 43 |
| RULE-042 trigger_category | `SELECT trigger_category FROM automation_rules WHERE rule_id = 'RULE-042'` | 'OrderStatus' |
| RULE-042 task_type | `SELECT task_type FROM automation_rules WHERE rule_id = 'RULE-042'` | 'OrderOverdue' |
| RULE-042 severity | `SELECT severity FROM automation_rules WHERE rule_id = 'RULE-042'` | 'High' |
| RULE-043 trigger_category | `SELECT trigger_category FROM automation_rules WHERE rule_id = 'RULE-043'` | 'WorkerPerformance' |
| RULE-043 frequency_days | `SELECT frequency_days FROM automation_rules WHERE rule_id = 'RULE-043'` | 14 |
| RULE-031 severity | `SELECT severity FROM automation_rules WHERE rule_id = 'RULE-031'` | 'High' |
| RULE-032 severity | `SELECT severity FROM automation_rules WHERE rule_id = 'RULE-032'` | 'High' |
| No invalid severity values | `SELECT COUNT(*) FROM automation_rules WHERE severity NOT IN ('Low','Medium','High','Critical')` | 0 |
| Exactly 10 decision signals | `SELECT COUNT(*) FROM decision_signal_config WHERE tenant_id = 'TEN-001'` | 10 |
| No NULL signal names | `SELECT COUNT(*) FROM decision_signal_config WHERE signal_name IS NULL` | 0 |

#### Phase D Assertions

| Check | Query | Expected Result |
|---|---|---|
| 7 active cycles | `SELECT COUNT(*) FROM production_cycles WHERE status = 'active' AND tenant_id = 'TEN-001'` | 7 |
| All cycles have valid pu_id | See Phase D checkpoint | 0 orphans |
| Kava cycle is active | `SELECT COUNT(*) FROM production_cycles WHERE production_id = 'CRP-KAV' AND status = 'active'` | ≥1 |
| Price master populated | `SELECT COUNT(*) FROM price_master WHERE tenant_id = 'TEN-001'` | >0 |
| Tenant subscription active | `SELECT status FROM tenant_subscriptions WHERE tenant_id = 'TEN-001'` | 'active' |

### Full Referential Integrity Check

Run after all phases complete:

```sql
-- Check all FK relationships hold (should return 0 for each)

-- production_stages → productions
SELECT COUNT(*) AS orphaned_stages FROM shared.production_stages ps
LEFT JOIN shared.productions p ON ps.production_id = p.production_id
WHERE p.production_id IS NULL;

-- production_units → farms
SELECT COUNT(*) AS orphaned_pus FROM production_units pu
LEFT JOIN farms f ON pu.farm_id = f.farm_id AND pu.tenant_id = f.tenant_id
WHERE f.farm_id IS NULL AND pu.tenant_id = 'TEN-001';

-- production_cycles → production_units
SELECT COUNT(*) AS orphaned_cycles FROM production_cycles pc
LEFT JOIN production_units pu ON pc.pu_id = pu.pu_id AND pc.tenant_id = pu.tenant_id
WHERE pu.pu_id IS NULL AND pc.tenant_id = 'TEN-001';

-- automation_rules → tenants
SELECT COUNT(*) AS orphaned_rules FROM automation_rules ar
LEFT JOIN tenants t ON ar.tenant_id = t.tenant_id
WHERE t.tenant_id IS NULL AND ar.tenant_id = 'TEN-001';
```

All queries above must return 0.

---

## SECTION 5 — Rollback Procedure

### Pre-Migration Backup

Before running any migration scripts, take a full backup of the current database state.

```bash
# Step 1: Schema-only backup (structure without data)
pg_dump \
  --host=localhost \
  --port=5432 \
  --username=teivaka \
  --schema-only \
  --no-owner \
  --no-acl \
  teivaka_db \
  > backups/teivaka_schema_$(date +%Y%m%d_%H%M%S).sql

# Step 2: Data-only backup (if any data already exists before migration)
pg_dump \
  --host=localhost \
  --port=5432 \
  --username=teivaka \
  --data-only \
  --no-owner \
  teivaka_db \
  > backups/teivaka_data_before_migration_$(date +%Y%m%d_%H%M%S).sql

echo "Pre-migration backups complete."
```

### Transaction-Based Migration

Each phase runs inside a single database transaction. If any error occurs within a phase, the entire phase is automatically rolled back.

```python
# Migration script structure (pseudocode)
# Each phase function follows this pattern:

async def run_phase_a(db: AsyncSession):
    """Phase A: Shared schema tables."""
    async with db.begin():   # starts a transaction
        try:
            await load_shared_productions(db)
            await load_shared_production_stages(db)
            # ... all phase A steps ...
            await load_shared_rotation_top_choices(db)

            # Validate before committing
            await validate_phase_a(db)

            # Transaction commits automatically on context manager exit
            print("Phase A committed successfully.")

        except Exception as e:
            # Transaction rolls back automatically on exception
            print(f"Phase A FAILED: {e}")
            print("Transaction rolled back. No changes committed.")
            raise

# Same pattern for phases B, C, D
# Each phase is independent — failure in Phase C does not affect Phase A/B data
```

### Manual Rollback

If a phase completes but validation fails post-commit:

```sql
-- Option 1: Truncate and re-run the failed phase
-- (safe because subsequent phases are not yet loaded)

-- Example: Phase B failed — truncate all Phase B tables
BEGIN;
TRUNCATE TABLE production_units CASCADE;
TRUNCATE TABLE equipment CASCADE;
TRUNCATE TABLE inputs CASCADE;
TRUNCATE TABLE workers CASCADE;
TRUNCATE TABLE customers CASCADE;
TRUNCATE TABLE suppliers CASCADE;
TRUNCATE TABLE zones CASCADE;
TRUNCATE TABLE farms CASCADE;
TRUNCATE TABLE users CASCADE;
-- Do NOT truncate tenants unless starting completely over
COMMIT;

-- Then fix the extraction script and re-run Phase B
```

```bash
# Option 2: Restore from pre-migration backup (nuclear option)
# Only use if schema was also corrupted

psql \
  --host=localhost \
  --port=5432 \
  --username=teivaka \
  teivaka_db \
  < backups/teivaka_data_before_migration_YYYYMMDD_HHMMSS.sql
```

### Source Sheet Protection

**Critical:** The Google Sheets TFOS v7.0 workbook must remain **read-only** throughout the migration process and after migration is complete. It serves as the historical record and audit trail.

```
Actions required BEFORE starting migration:
1. Create a copy of the v7.0 workbook (File > Make a copy) — title it "TFOS v7.0 — MIGRATION ARCHIVE — DO NOT MODIFY"
2. Set sharing on the archive copy to "View only" for all users
3. Protect all sheets in the archive workbook (Data > Protect sheets and ranges > Set restrictions)
4. Document the archive URL in this document below

Archive workbook URL: [TO BE FILLED BEFORE MIGRATION]
Migration date: [TO BE FILLED ON MIGRATION DAY]
Migrated by: [TO BE FILLED ON MIGRATION DAY]
```

### Post-Migration Validation Sign-Off

Before declaring migration complete, the following people must review and confirm:

| Validator | Area | Sign-off |
|---|---|---|
| Uraia Koroi Kama (Cody) | Farm data accuracy — all farms, zones, PUs, workers match reality | [ ] |
| Developer | All validation queries return expected results | [ ] |
| Developer | All FK integrity checks return 0 | [ ] |
| Developer | TIS voice and text commands tested with migrated data | [ ] |
| Developer | Automation rules generate expected alerts on test cycle | [ ] |

Only after all five sign-offs is the migration considered complete and the source Google Sheets v7.0 retired as the live system.
