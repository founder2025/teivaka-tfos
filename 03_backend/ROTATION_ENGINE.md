# FILE: 03_backend/ROTATION_ENGINE.md

# Teivaka TFOS Backend — Rotation Engine Reference

Complete specification for the crop rotation validation engine, including the 9-step algorithm, 7 rule status types, 14 family policies, override flow, and the complete output schema.

---

## 1. Overview

The rotation engine enforces agronomic best practices by validating proposed crop sequences before a new production cycle is created. It queries the `shared.actionable_rules` table (1,444 rules) for the specific crop-to-crop transition and returns a decision: APPROVED, BLOCKED, or OVERRIDE_REQUIRED.

The engine runs at:
- Cycle creation time (`POST /cycles`) — mandatory, cannot be bypassed
- Rotation preview time (`POST /rotation/validate`) — validation only, no cycle created
- Automation engine (RULE-037 RotationDue) — proactive recommendation generation

---

## 2. Input Schema

```python
# Input to validate_rotation() service function
{
    "pu_id": str,                      # e.g. "F001-PU001"
    "proposed_production_id": str,     # e.g. "CRP-TOM"
    "proposed_planting_date": date,    # Must not be > 30 days in future
}
```

---

## 3. The 9-Step Validation Algorithm

```python
# services/rotation_service.py

async def validate_rotation(
    pu_id: str,
    proposed_production_id: str,
    proposed_planting_date: date,
    db: AsyncSession,
) -> RotationValidationResult:
    """
    Validates whether a proposed crop is agronomically sound for a given PU
    at the proposed planting date.

    Returns a complete RotationValidationResult with enforcement decision,
    rule status, days_short, alternatives, and override availability.
    """
```

### Step 1: Find last closed cycle for the PU

```sql
SELECT id, production_id, actual_harvest_end
FROM production_cycles
WHERE pu_id = :pu_id
  AND cycle_status IN ('closed', 'failed')
  AND actual_harvest_end IS NOT NULL
ORDER BY actual_harvest_end DESC
LIMIT 1
```

Query uses index on `(pu_id, cycle_status, actual_harvest_end DESC)` — efficient single-row fetch.

### Step 2: No previous cycle — always APPROVED

If the above query returns no rows (this is the PU's first cycle ever, or all previous cycles are still active):

```python
return RotationValidationResult(
    allowed=True,
    enforcement_decision=EnforcementDecision.APPROVED,
    rule_status=RotationStatus.NA,
    min_rest_days=0,
    days_short=0,
    days_since_last_harvest=0,
    rotation_key="NONE:{}".format(proposed_production_id),
    current_production_id=None,
    proposed_production_id=proposed_production_id,
    previous_production_name=None,
    proposed_production_name=await get_production_name(proposed_production_id, db),
    alternatives=[],
    override_available=False,
    validation_timestamp=datetime.now(timezone.utc),
)
```

### Step 3: Compute days since last harvest

```python
last_production_id = last_cycle.production_id
last_harvest_end = last_cycle.actual_harvest_end   # date

days_since_last_harvest = (proposed_planting_date - last_harvest_end).days
```

Note: `days_since_last_harvest` can be negative if proposed_planting_date is before actual_harvest_end (overlap — this is automatically a violation for any BLOCK rule).

### Step 4: Construct rotation_key

```python
rotation_key = f"{last_production_id}:{proposed_production_id}"
# Example: "CRP-EGG:CRP-TOM"
# Example: "CRP-CAB:CRP-LBN"
# Example: "FOR-TEK:CRP-TOM"
```

### Step 5: Query shared.actionable_rules

```sql
SELECT
    rule_id,
    rule_status,
    min_rest_days,
    enforce_level,
    notes,
    rationale,
    source_reference
FROM shared.actionable_rules
WHERE current_production_id = :last_production_id
  AND next_production_id = :proposed_production_id
LIMIT 1
```

Uses composite index `(current_production_id, next_production_id)` — O(1) lookup.

If no rule found in `shared.actionable_rules`: default to OK status with min_rest_days=0. Log a warning for the rotation key to track missing rules.

### Step 6: Evaluate rule_status to enforcement_decision

```python
rule_status = rotation_rule.rule_status   # RotationStatus enum
min_rest_days = rotation_rule.min_rest_days

if rule_status == RotationStatus.BLOCK:
    # Hard block. Enforce rest period strictly.
    if days_since_last_harvest < min_rest_days:
        enforcement_decision = EnforcementDecision.BLOCKED
    else:
        # Rest period satisfied — BLOCK condition no longer applies
        enforcement_decision = EnforcementDecision.APPROVED

elif rule_status == RotationStatus.AVOID:
    # Soft block. Always requires override, regardless of rest period.
    # Manager can proceed but FOUNDER override is recorded.
    enforcement_decision = EnforcementDecision.OVERRIDE_REQUIRED

elif rule_status == RotationStatus.OK:
    # Standard acceptable rotation. Approved.
    enforcement_decision = EnforcementDecision.APPROVED

elif rule_status == RotationStatus.PREF:
    # Preferred rotation. Approved with positive note.
    enforcement_decision = EnforcementDecision.APPROVED

elif rule_status == RotationStatus.COND:
    # Conditional. May need manual review based on notes.
    # For now: APPROVED, but notes surfaced to the user.
    # Conditions are described in rotation_rule.notes.
    enforcement_decision = EnforcementDecision.APPROVED

elif rule_status == RotationStatus.OVERLAY:
    # Overlapping production systems (e.g. apiculture always active).
    # Rotation concept does not apply in the same way.
    # Always APPROVED — different logic pathway.
    enforcement_decision = EnforcementDecision.APPROVED

elif rule_status == RotationStatus.NA:
    # Not applicable (e.g. forestry, different production system).
    # Always APPROVED.
    enforcement_decision = EnforcementDecision.APPROVED

else:
    # Unknown status — fail safe to APPROVED with a warning log
    enforcement_decision = EnforcementDecision.APPROVED
    logger.warning("unknown_rotation_status", rule_status=rule_status, rotation_key=rotation_key)
```

### Step 7: Calculate days_short

```python
days_short = max(0, min_rest_days - days_since_last_harvest)
# days_short = 0 if the rest period has been satisfied or not applicable
# days_short > 0 if the proposed planting_date is too soon
```

### Step 8: Fetch alternative production recommendations

```sql
SELECT
    rc.next_production_id,
    p.production_name,
    rc.rule_status,
    rc.min_rest_days,
    rc.notes
FROM shared.rotation_top_choices rc
JOIN shared.productions p ON p.id = rc.next_production_id
WHERE rc.production_id = :last_production_id
ORDER BY
    CASE rc.rule_status
        WHEN 'PREF' THEN 1
        WHEN 'OK' THEN 2
        WHEN 'COND' THEN 3
        WHEN 'AVOID' THEN 4
        ELSE 5
    END ASC,
    rc.sort_order ASC
LIMIT 5
```

### Step 9: Assemble and return RotationValidationResult

```python
return RotationValidationResult(
    allowed=(enforcement_decision == EnforcementDecision.APPROVED),
    enforcement_decision=enforcement_decision,
    rule_status=rule_status,
    min_rest_days=min_rest_days,
    days_short=days_short,
    days_since_last_harvest=days_since_last_harvest,
    rotation_key=rotation_key,
    current_production_id=last_production_id,
    proposed_production_id=proposed_production_id,
    previous_production_name=await get_production_name(last_production_id, db),
    proposed_production_name=await get_production_name(proposed_production_id, db),
    alternatives=alternatives,
    override_available=(enforcement_decision == EnforcementDecision.BLOCKED),
    # Only BLOCKED decisions can be overridden by FOUNDER.
    # OVERRIDE_REQUIRED (AVOID) is a soft warning — proceeds differently.
    validation_timestamp=datetime.now(timezone.utc),
)
```

---

## 4. Complete Output Schema

```python
# models/schemas/cycles.py — RotationValidationResult

{
    # Primary decision
    "allowed": bool,
    # True = cycle creation may proceed
    # False = blocked (enforcement_decision = BLOCKED)

    "enforcement_decision": "APPROVED" | "BLOCKED" | "OVERRIDE_REQUIRED",
    # APPROVED: proceed with cycle creation
    # BLOCKED: rule_status = BLOCK and rest period not satisfied. Hard stop.
    # OVERRIDE_REQUIRED: rule_status = AVOID. Soft stop — FOUNDER can acknowledge.

    "rule_status": "PREF" | "OK" | "AVOID" | "BLOCK" | "COND" | "OVERLAY" | "N/A",
    # The raw agronomic rule status from shared.actionable_rules

    "min_rest_days": int,
    # Minimum days of rest required between last harvest and proposed planting
    # 0 for PREF, OK, OVERLAY, N/A

    "days_short": int,
    # How many days short of the minimum rest period the proposed planting date is
    # 0 if min_rest_days is satisfied or not applicable

    "days_since_last_harvest": int,
    # Actual days between actual_harvest_end and proposed_planting_date
    # Can be negative (overlap scenario)

    "rotation_key": str,
    # Format: "PREVIOUS_PRODUCTION_ID:PROPOSED_PRODUCTION_ID"
    # Example: "CRP-EGG:CRP-TOM"
    # "NONE:CRP-TOM" if first cycle on PU

    "current_production_id": str | None,
    # The production ID of the last closed cycle. None if first cycle.

    "proposed_production_id": str,
    # The production ID being proposed for the new cycle

    "previous_production_name": str | None,
    # Human-readable name. E.g. "Eggplant". None if first cycle.

    "proposed_production_name": str,
    # Human-readable name. E.g. "Tomato"

    "alternatives": [
        {
            "production_id": str,        # e.g. "CRP-LBN"
            "production_name": str,      # e.g. "Long Bean"
            "rule_status": str,          # e.g. "PREF"
            "min_rest_days": int,        # e.g. 0
            "notes": str,               # e.g. "Nitrogen-fixing legume — excellent rotation after Solanaceae"
        }
        # Up to 5 alternatives, sorted by rule_status preference (PREF first)
    ],

    "override_available": bool,
    # True ONLY when enforcement_decision = BLOCKED
    # Means a FOUNDER-role user can submit an override request
    # False when APPROVED or OVERRIDE_REQUIRED

    "validation_timestamp": "2025-04-07T09:00:00Z"
}
```

### Complete Example — BLOCKED

```json
{
    "allowed": false,
    "enforcement_decision": "BLOCKED",
    "rule_status": "BLOCK",
    "min_rest_days": 60,
    "days_short": 23,
    "days_since_last_harvest": 37,
    "rotation_key": "CRP-EGG:CRP-TOM",
    "current_production_id": "CRP-EGG",
    "proposed_production_id": "CRP-TOM",
    "previous_production_name": "Eggplant",
    "proposed_production_name": "Tomato",
    "alternatives": [
        {
            "production_id": "CRP-LBN",
            "production_name": "Long Bean",
            "rule_status": "PREF",
            "min_rest_days": 0,
            "notes": "Nitrogen-fixing legume. Excellent after Solanaceae — restores soil nitrogen."
        },
        {
            "production_id": "CRP-FRB",
            "production_name": "French Bean",
            "rule_status": "PREF",
            "min_rest_days": 0,
            "notes": "Another nitrogen-fixing legume. Good rotation option."
        },
        {
            "production_id": "CRP-CAB",
            "production_name": "Cabbage",
            "rule_status": "OK",
            "min_rest_days": 30,
            "notes": "Different family. Acceptable rotation. Ensure 30-day rest from eggplant harvest."
        }
    ],
    "override_available": true,
    "validation_timestamp": "2025-04-07T09:00:00Z"
}
```

### Complete Example — APPROVED (PREF)

```json
{
    "allowed": true,
    "enforcement_decision": "APPROVED",
    "rule_status": "PREF",
    "min_rest_days": 0,
    "days_short": 0,
    "days_since_last_harvest": 14,
    "rotation_key": "CRP-CAB:CRP-LBN",
    "current_production_id": "CRP-CAB",
    "proposed_production_id": "CRP-LBN",
    "previous_production_name": "Cabbage",
    "proposed_production_name": "Long Bean",
    "alternatives": [],
    "override_available": false,
    "validation_timestamp": "2025-04-07T09:05:00Z"
}
```

---

## 5. Query Performance

### Why 1,444 Rules Are Fast

The `shared.actionable_rules` table contains 1,444 rows — one for each valid production-pair combination across all production types in the TFOS system (crops, livestock, forestry, etc.).

**Composite index:**

```sql
-- Migration 005_rotation_rules.py
CREATE INDEX idx_actionable_rules_rotation_key
ON shared.actionable_rules (current_production_id, next_production_id);
```

The query in Step 5 is effectively:

```sql
SELECT * FROM shared.actionable_rules
WHERE current_production_id = 'CRP-EGG'
  AND next_production_id = 'CRP-TOM'
LIMIT 1;
```

With the composite index, PostgreSQL performs an O(1) B-tree index lookup by (current_production_id, next_production_id) — no table scan. Query time: < 1ms regardless of table size.

The table is read-only in normal operation (only Teivaka admin can modify via `POST /admin/rotation-rules`). It is loaded into Redis cache at application startup with a 24-hour TTL as a further optimization:

```python
# On startup: cache all rotation rules as dict keyed by rotation_key
ROTATION_CACHE_KEY = "rotation_rules:all"
# Value: JSON dict of {rotation_key: {rule_status, min_rest_days, notes, ...}}
# TTL: 86400 seconds (24 hours)
# Cache miss: fall through to DB query, then re-cache
```

---

## 6. The 7 Status Types — Complete Reference

### PREF (Preferred)

The proposed crop is agronomically recommended after the previous crop.

**Agronomic basis:** Typically nitrogen-fixing legumes after heavy feeders, or crops from very different botanical families that break disease and pest cycles.

**Enforcement:** APPROVED immediately. No rest period required.

**Example:**
- `CRP-LBN` (Long Bean) after `CRP-CAB` (Cabbage)
- Rationale: Long Bean is a Fabaceae (legume) — fixes atmospheric nitrogen into the soil, directly benefiting the next crop. Cabbage is a heavy nitrogen consumer. This sequence restores soil fertility naturally.
- min_rest_days: 0
- UI display: Green badge, positive message "Excellent rotation choice!"

---

### OK (Acceptable)

The proposed crop is a generally acceptable rotation — not the best choice but not harmful.

**Agronomic basis:** Different families, no significant shared pest/disease pressure, no strong soil chemistry conflicts.

**Enforcement:** APPROVED. A rest period recommendation is noted but not enforced.

**Example:**
- `CRP-TOM` (Tomato) after `CRP-CAS` (Cassava)
- Rationale: Completely different families (Solanaceae vs Euphorbiaceae), different root depth, no shared pest pressure.
- min_rest_days: 30 (recommended, not enforced)
- UI display: Green badge, neutral message "Acceptable rotation."

---

### AVOID (Not Recommended — Soft Block)

The proposed crop shares disease pressure, pest hosts, or soil chemistry conflicts with the previous crop, but the situation can be managed with proper agronomy.

**Agronomic basis:** Same plant family or similar root zone. Disease and pest populations may carry over. Not an absolute prohibition, but requires acknowledgment of the risk.

**Enforcement:** OVERRIDE_REQUIRED always — regardless of rest days elapsed. The farmer/MANAGER sees the risk and must acknowledge it. This is logged but does not require FOUNDER approval (unlike BLOCK).

**Example:**
- `CRP-EGG` (Eggplant) after `CRP-TOM` (Tomato)
- Rationale: Both Solanaceae. Share Fusarium wilt, bacterial wilt, and common caterpillar pests. Planting Solanaceae back-to-back even with a rest period carries elevated risk.
- min_rest_days: 60 (noted in rule — but enforcement is OVERRIDE_REQUIRED regardless)
- UI display: Amber badge, warning message "Not recommended. Same plant family — disease risk. Acknowledge to proceed."

---

### BLOCK (Hard Block)

The proposed crop MUST NOT follow the previous crop within the minimum rest period. This is an absolute agronomic prohibition that will cause predictable crop failure, significant soil degradation, or serious disease escalation.

**Agronomic basis:** Same-family back-to-back with documented high disease risk. Fusarium wilt in Solanaceae, white rot in Araceae (Dalo), club root in Brassicaceae are examples of soil-borne pathogens that persist and multiply when the same family is planted consecutively.

**Enforcement:** BLOCKED if days_since_last_harvest < min_rest_days. System will not allow cycle creation. Only a FOUNDER-role user can approve an override after seeing the full risk documentation.

**Example:**
- `CRP-TOM` (Tomato) after `CRP-EGG` (Eggplant)
- Rationale: Both Solanaceae. Fusarium oxysporum f.sp. lycopersici (Fusarium wilt of tomato) builds up significantly in soil that previously hosted eggplant. Consecutive Solanaceae planting without 60-day rest in Fiji's humid climate leads to predictable 30-60% yield loss.
- min_rest_days: 60
- UI display: Red badge, hard stop message. Override button shown only to FOUNDER role.

---

### COND (Conditional)

The proposed crop is acceptable under specific conditions that must be manually reviewed. The conditions are described in the rule's `notes` field.

**Agronomic basis:** Context-dependent — the same rotation may be fine on well-drained slopes but risky on flat land with poor drainage, or acceptable after a specific soil amendment but not otherwise.

**Enforcement:** APPROVED, but the conditions (from `rotation_rule.notes`) are surfaced to the user prominently in the UI. The farmer must read and acknowledge the conditions.

**Example:**
- `CRP-KAV` (Kava) after `CRP-DAL` (Dalo/Taro)
- Rationale: Both prefer similar soil moisture conditions. Kava can follow Dalo on well-drained volcanic soils with good slope, but on flat clay soils with water retention the combination causes Phytophthora root rot in both crops. Manual review required.
- notes: "Acceptable on well-drained volcanic soils (slope > 5°). Avoid on flat clay soils or areas with known Phytophthora history."
- UI display: Amber badge with conditions text, "Proceed with caution" message.

---

### OVERLAY (Overlapping System)

One of the productions is a perennial or always-present system that operates concurrently with crop rotations rather than in sequence. The rotation concept does not apply in the traditional sense.

**Agronomic basis:** Apiculture (bees), perennial tree crops (banana, coconut, teak), or livestock on the same land as annual crops. These are managed on different timescales and benefit from co-existence rather than strict rotation.

**Enforcement:** APPROVED. The engine recognizes this is a different production system logic and routes around the rotation check. A different set of co-planting rules may apply (managed separately in `shared.overlay_rules`, not in `shared.actionable_rules`).

**Example:**
- `LIV-API` (Apiculture / Beehives) on `F001-PU011`
- Rationale: Beehives are always present. They overlay any crop rotation happening on surrounding PUs. The hive PU itself does not rotate — it is permanent.
- `FRT-BAN` (Banana) on any PU: Banana is a perennial. It does not rotate in the conventional sense. New sucker management is what drives cycles, not crop-to-crop rotation.
- UI display: Blue badge, "Perennial / overlay system — rotation rules do not apply."

---

### N/A (Not Applicable)

The proposed production is from a fundamentally different agricultural system where the crop rotation concept does not apply at all.

**Agronomic basis:** Forestry crops (Teak, Mahogany) have 15-50 year cycles. Rotation between them or with annual crops is not an agronomic consideration in the same timeframe. The engine simply approves these.

**Enforcement:** APPROVED always.

**Example:**
- `FOR-TEK` (Teak) on any PU
- Rationale: Teak is planted once and harvested after 15-30 years. No meaningful crop rotation interaction with annual vegetable crops on adjacent PUs.
- `FOR-MAH` (Mahogany): same logic.
- UI display: Grey badge, "Forestry / long-cycle system — not subject to rotation rules."

---

## 7. Family Policy Enforcement

The 1,444 rules in `shared.actionable_rules` encode family-level policies systematically. The rotation engine does not apply family policies separately — they are already embedded in the per-pair rules. However, understanding the family policies helps developers understand why rules are set the way they are.

### 14 Family Policies

| Plant Family | Production IDs | Min Rest Days | Enforce Level | Rationale |
|-------------|---------------|--------------|---------------|-----------|
| Solanaceae | CRP-TOM, CRP-EGG, CRP-CAP, CRP-CHI | 60 days | BLOCK | Fusarium wilt, bacterial wilt, caterpillar carry-over. High-risk consecutive planting. |
| Cucurbitaceae | CRP-WAT, CRP-CUC, CRP-SQU | 45 days | BLOCK | Downy mildew, cucumber beetle, nematodes accumulate in soil. |
| Fabaceae | CRP-FRB, CRP-LBN | 30 days | OK (beneficial) | Nitrogen-fixing — actually PREF after heavy feeders. Within-family: 30 days rest to avoid bean rust carry-over. |
| Araceae | CRP-DAL, CRP-DTN | 90 days | BLOCK | Phytophthora taro leaf blight persists 6+ months. Dalo-after-Dalo is high risk in Fiji's climate. |
| Brassicaceae | CRP-CAB | 60 days | BLOCK | Clubroot (Plasmodiophora brassicae) is a soil-borne pathogen that persists 10+ years and is spread by same-family replanting. |
| Poaceae | CRP-SCN, CRP-SUG, CRP-DUR, SUP-NAP | 30 days | AVOID | Grasses share some root pathogens and nematode hosts. 30 days rest and avoid back-to-back. |
| Euphorbiaceae | CRP-CAS | 180 days | BLOCK | Cassava mosaic disease and cassava bacterial blight persist in soil residues. Very long rest required. |
| Convolvulaceae | CRP-SPT | 60 days | AVOID | Sweet potato weevil (Cylas formicarius) pupates in soil and can infect next sweet potato crop. |
| Zingiberaceae | CRP-GIN, CRP-TUR | 90 days | AVOID | Fusarium yellows and bacterial wilt carry over. Extended rest recommended. |
| Musaceae (Perennial) | FRT-BAN | — | OVERLAY | Banana is perennial — sucker management, not rotation. Overlay logic. |
| Arecaceae (Perennial) | FRT-COC | — | OVERLAY | Coconut is perennial — 60-80 year lifespan. Overlay logic. |
| Piperaceae (Special) | CRP-KAV | — | Special | Kava has a 4-year growth cycle. Never BLOCK for rotation — harvest inactivity threshold is 180 days (RULE-017 exception). After harvest, 1-year rest before replanting. |
| Livestock | LIV-* | — | OVERLAY | Livestock production is tracked separately from crop rotation. Overlay logic for any LIV production. |
| Forestry | FOR-* | — | N/A | 15-50 year cycles. Rotation concept does not apply. Always N/A. |

### Same-Family Rule Generation Logic

For each family with BLOCK enforcement, all within-family crop pairs have the following rule pattern:

```
Current: CRP-TOM, Next: CRP-TOM → BLOCK, 60 days
Current: CRP-TOM, Next: CRP-EGG → BLOCK, 60 days
Current: CRP-TOM, Next: CRP-CAP → BLOCK, 60 days
Current: CRP-EGG, Next: CRP-TOM → BLOCK, 60 days
Current: CRP-EGG, Next: CRP-EGG → BLOCK, 60 days
... (all Solanaceae permutations)
```

For AVOID families, the same pattern applies but with AVOID enforcement.

For Fabaceae (PREF/beneficial within-family): within-family pairs are OK (30 day rest), and Fabaceae after any heavy feeder (Solanaceae, Brassicaceae, Araceae) is typically PREF.

---

## 8. Override Flow — Complete Specification

The override flow allows a FOUNDER-role user to proceed with a BLOCKED rotation decision. This is an audit-logged process with no way to bypass the documentation requirements.

### Step 1: API returns BLOCKED decision

```json
{
    "allowed": false,
    "enforcement_decision": "BLOCKED",
    "override_available": true,
    ...
}
```

The React PWA frontend shows:
- Red banner: "Rotation BLOCKED — Solanaceae back-to-back (Eggplant → Tomato)"
- Days short: "23 days short of 60-day minimum rest"
- Risk summary: "Fusarium wilt risk. Predictable 30-60% yield loss."
- Alternatives: top 3 recommended alternatives shown as action buttons
- Override button: visible only to FOUNDER role users

---

### Step 2: FOUNDER submits override request

```
POST /cycles/{pu_id}/override-rotation

Request body:
{
    "pu_id": "F001-PU001",
    "previous_production_id": "CRP-EGG",
    "proposed_production_id": "CRP-TOM",
    "proposed_planting_date": "2025-05-01",
    "reason": "Market demand - buyer contracted for tomatoes specifically. Will apply Trichoderma bio-fungicide to mitigate Fusarium risk."
}
```

The system creates a `CycleCreationGate` record:

```python
gate = CycleCreationGate(
    id=str(uuid.uuid4()),
    pu_id=pu_id,
    proposed_production_id=proposed_production_id,
    proposed_planting_date=proposed_planting_date,
    gate_status="override_requested",
    rotation_result_json=rotation_validation_result.model_dump_json(),
    override_reason=reason,
    requested_by=current_user.id,
    requested_at=datetime.now(timezone.utc),
)
```

---

### Step 3: FOUNDER reviews in UI

The UI presents the FOUNDER with:
- `rule_violated`: "BLOCK: CRP-EGG → CRP-TOM (Solanaceae same-family)"
- `violation_type`: "same_family_disease_risk"
- `days_short`: 23
- `risk_level`: "HIGH" (derived from rule status BLOCK)
- `rotation_rule.rationale`: Full agronomic explanation from shared.actionable_rules
- `rotation_rule.notes`: Specific risk notes
- `proposed_alternatives`: Top 3 alternatives shown again as final reminder

---

### Step 4: FOUNDER approves override

```
POST /cycles/approve-override

Request body:
{
    "gate_id": "gate-uuid-here",
    "approval_note": "Acknowledged. Will apply Trichoderma. Accepted market commitment risk.",
    "confirmed": true   # Must be explicitly true — prevents accidental approval
}
```

---

### Step 5: OverrideLog entry created

```python
override_log = OverrideLog(
    id=str(uuid.uuid4()),
    pu_id=pu_id,
    previous_production_id=previous_production_id,
    new_production_id=proposed_production_id,
    rule_violated=f"RULE: {rotation_key} — {rule_status.value}",
    violation_type="same_family_disease_risk",  # Derived from rule rationale
    days_short=days_short,
    requested_by=gate.requested_by,
    reason=gate.override_reason,
    approved_by=current_user.id,
    approval_note=approval_note,
    severity=rule_status.value,                  # BLOCK, AVOID
    approved_at=datetime.now(timezone.utc),
    created_at=gate.requested_at,
)
```

All fields are immutable after creation — override log is an audit trail.

---

### Step 6: CycleCreationGate updated

```python
gate.gate_status = "override_approved"
gate.approved_by = current_user.id
gate.approved_at = datetime.now(timezone.utc)
```

---

### Step 7: Cycle creation proceeds

The cycle is now created normally, with:

```python
new_cycle = ProductionCycle(
    ...
    rotation_override=True,
    rotation_override_reason=gate.override_reason,
    rotation_override_approved_by=current_user.id,
    rotation_override_log_id=override_log.id,
    ...
)
```

---

### Step 8: Audit alert created

An alert is generated and sent via WhatsApp to all MANAGER+ users for the farm:

```
"Rotation override approved by {founder_name} on {pu_id}:
 {previous_crop_name} → {new_crop_name}.
 Reason: {reason}.
 Rule violated: {rule_status} — {rule_violated}.
 Risk level: HIGH.
 Override log: {override_log_id}."
```

This ensures full visibility — all farm managers know a rotation rule has been overridden and why.

---

### Override Flow Summary Diagram

```
POST /rotation/validate
        ↓
  enforcement_decision = BLOCKED
  override_available = True
        ↓
  [FOUNDER sees: risk details, alternatives, override button]
        ↓
  POST /cycles/{pu_id}/override-rotation
        ↓
  CycleCreationGate created (gate_status = "override_requested")
        ↓
  [FOUNDER reviews: rule_violated, days_short, rationale]
        ↓
  POST /cycles/approve-override
        ↓
  OverrideLog entry written (immutable audit trail)
        ↓
  CycleCreationGate updated (gate_status = "override_approved")
        ↓
  POST /cycles proceeds → ProductionCycle created with rotation_override = True
        ↓
  Alert + WhatsApp to all managers: "Rotation override approved"
```

---

## 9. Override Log Table Schema

All overrides permanently recorded in `override_log` table. No deletes allowed.

```sql
-- From migration 001_initial_schema.py
CREATE TABLE override_log (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pu_id                   TEXT NOT NULL,
    previous_production_id  TEXT NOT NULL,
    new_production_id       TEXT NOT NULL,
    rule_violated           TEXT NOT NULL,          -- e.g. "BLOCK: CRP-EGG:CRP-TOM"
    violation_type          TEXT NOT NULL,          -- e.g. "same_family_disease_risk"
    days_short              INTEGER NOT NULL,
    requested_by            UUID NOT NULL REFERENCES users(id),
    reason                  TEXT NOT NULL,
    approved_by             UUID NOT NULL REFERENCES users(id),
    approval_note           TEXT,
    severity                TEXT NOT NULL,          -- The RotationStatus value: BLOCK, AVOID
    approved_at             TIMESTAMPTZ NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Row-level security
    tenant_id               UUID NOT NULL REFERENCES tenants(id),

    -- Constraints
    CONSTRAINT override_log_reason_not_empty CHECK (LENGTH(TRIM(reason)) > 0),
    CONSTRAINT override_log_no_delete CHECK (true)  -- Enforced at RLS policy level
);

-- Immutable row policy: no UPDATE, no DELETE allowed
CREATE POLICY override_log_no_modify ON override_log
    AS RESTRICTIVE
    FOR UPDATE USING (false);   -- No updates ever

CREATE POLICY override_log_no_delete ON override_log
    AS RESTRICTIVE
    FOR DELETE USING (false);   -- No deletes ever

-- Tenant scoped read
CREATE POLICY override_log_tenant_read ON override_log
    FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

---

## 10. Related Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/rotation/validate` | POST | Validate rotation without creating cycle |
| `/rotation/history/{pu_id}` | GET | Full rotation history for a PU (all closed cycles) |
| `/rotation/alternatives/{pu_id}` | GET | Top recommended next productions for current PU state |
| `/rotation/overrides?farm_id=` | GET | List all override decisions for a farm (audit view) |
| `/cycles/{pu_id}/override-rotation` | POST | Submit override request (FOUNDER+ required) |
| `/cycles/approve-override` | POST | Approve override (FOUNDER required) |
| `/cycles` | POST | Create cycle — always runs rotation validation internally |

---

## 11. Integration with TIS Command Executor

When the TIS Command Executor handles a `CREATE_CYCLE` command (via voice or chat):

```python
# services/tis_executor.py
async def execute_create_cycle(params: dict, user: User, db: AsyncSession) -> CommandResult:
    # Step 1: Run rotation validation
    validation = await validate_rotation(
        pu_id=params["pu_id"],
        proposed_production_id=params["production_id"],
        proposed_planting_date=params["planting_date"],
        db=db
    )

    if validation.enforcement_decision == "BLOCKED":
        # Return informative message — TIS cannot auto-override
        return CommandResult(
            command_type=VoiceCommandType.CREATE_CYCLE,
            success=False,
            message=(
                f"Rotation BLOCKED: {validation.previous_production_name} → "
                f"{validation.proposed_production_name} on {params['pu_id']}. "
                f"{validation.days_short} days short of {validation.min_rest_days}-day minimum rest. "
                f"Override requires FOUNDER approval in TFOS app. "
                f"Recommended alternatives: {', '.join(a['production_name'] for a in validation.alternatives[:3])}."
            )
        )

    elif validation.enforcement_decision == "OVERRIDE_REQUIRED":
        # Soft block — TIS explains risk but can proceed if user confirms
        # In voice context: ask for verbal confirmation before proceeding
        return CommandResult(
            command_type=VoiceCommandType.CREATE_CYCLE,
            success=False,   # Requires explicit confirmation
            message=(
                f"Warning: Planting {validation.proposed_production_name} after "
                f"{validation.previous_production_name} on {params['pu_id']} is not recommended "
                f"(same plant family — disease risk). "
                f"Say 'confirm rotation' to proceed anyway, or choose: "
                f"{', '.join(a['production_name'] for a in validation.alternatives[:2])}."
            )
        )

    else:
        # APPROVED — proceed with cycle creation
        cycle = await cycles_service.create(params, validation, user, db)
        return CommandResult(
            command_type=VoiceCommandType.CREATE_CYCLE,
            success=True,
            created_id=cycle.id,
            message=f"New {validation.proposed_production_name} cycle started on {params['pu_id']}. Cycle ID: {cycle.id}."
        )
```

---

## 12. Testing Rotation Engine

Key test cases in `tests/test_rotation_engine.py`:

| Test Case | Scenario | Expected Result |
|-----------|----------|-----------------|
| `test_first_cycle_always_approved` | No previous cycle on PU | APPROVED, N/A status |
| `test_block_solanaceae_back_to_back` | Tomato → Tomato, 0 days rest | BLOCKED, days_short=60 |
| `test_block_satisfied_by_rest_days` | Eggplant → Tomato, 65 days rest | APPROVED (60 day min satisfied) |
| `test_avoid_always_override_required` | Eggplant → Tomato (AVOID version) | OVERRIDE_REQUIRED always |
| `test_pref_approved_immediately` | Cabbage → Long Bean | APPROVED, PREF status |
| `test_ok_approved` | Tomato → Cassava | APPROVED, OK status |
| `test_cond_approved_with_notes` | Dalo → Kava | APPROVED with conditions surfaced |
| `test_overlay_apiculture` | Any crop → Apiculture hive | APPROVED, OVERLAY status |
| `test_na_forestry` | Any crop → Teak | APPROVED, N/A status |
| `test_override_flow_end_to_end` | Submit override request → approve → cycle created | Cycle with rotation_override=True |
| `test_override_requires_founder_role` | MANAGER tries to approve override | 403 Forbidden |
| `test_araceae_family_policy` | Dalo → Dalo, 30 days rest | BLOCKED, days_short=60 (90 day min) |
| `test_kav_harvest_gap_exception` | CRP-KAV no harvest in 45 days | No RULE-017 alert (uses 180-day threshold) |
| `test_negative_days_since_harvest` | Proposed date before last harvest | BLOCKED (overlap = days_short > 0) |
| `test_no_rule_defaults_to_ok` | Obscure production pair with no rule | APPROVED (default OK, warning logged) |
| `test_rotation_key_format` | Check key format for various pairs | "PREV_ID:NEXT_ID" format verified |
| `test_alternatives_sorted_by_preference` | PREF alternatives before OK | PREF first in alternatives list |
| `test_override_log_immutable` | Attempt UPDATE on override_log | RLS policy rejects (psycopg2 error) |
| `test_euphorbiaceae_cassava_policy` | Cassava → Cassava, 90 days rest | BLOCKED, days_short=90 (180 day min) |
| `test_cache_hit` | Second validate_rotation call same pair | Returns from Redis cache (< 1ms) |
