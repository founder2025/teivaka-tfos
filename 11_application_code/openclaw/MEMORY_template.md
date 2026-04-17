# TFOS Session Memory — {DATE}
# This is the TFOS farm context injected into TIS at session start and refreshed every 5 minutes.
# It sits alongside (not replacing) TIS's existing MEMORY.md, USER.md, SOUL.md, and daily notes.
# Persistent farm data lives in TFOS PostgreSQL — this file is read-only context.

## Active Farm
- Farm ID: {FARM_ID}
- Farm Name: {FARM_NAME}
- Location: {LOCATION}
- Farmer: {FARMER_NAME} ({FARMER_PHONE})
- Tier: {SUBSCRIPTION_TIER}

## Farm Health (Decision Engine — last run {LAST_ENGINE_RUN})
- Overall: {SCORE}/10
- DS-001 Gross Margin: {STATUS} — {VALUE}%
- DS-002 CoKG Trend: {STATUS}
- DS-003 Harvest Frequency: {STATUS}
- DS-004 Labor Efficiency: {STATUS}
- DS-005 Input Depletion: {STATUS}
- DS-006 Debt-to-Revenue: {STATUS}
- DS-007 Cycle Completion: {STATUS}
- DS-008 AR Overdue: {STATUS}
- DS-009 Alert Load: {STATUS}
- DS-010 Ferry Buffer: {STATUS}  # F002 only — NULL for F001

## Active Cycles
{ACTIVE_CYCLES_LIST}
# Format: CYC-ID | Crop | Stage | Planted | Expected Harvest

## Open Alerts ({ALERT_COUNT})
{ALERTS_LIST}
# Format: RULE-ID | Severity | Message

## Pending Tasks ({TASK_COUNT})
{TASKS_LIST}
# Format: Task | Priority | Due

## Recent Activity (7 days)
- Harvests: {HARVEST_COUNT} entries, {HARVEST_KG_TOTAL}kg total
- Field events: {FIELD_EVENT_COUNT}
- Last chemical: {LAST_CHEMICAL} on {LAST_CHEMICAL_DATE} — WHD expires {WHD_EXPIRES}

## Low Stock Inputs
{LOW_STOCK_INPUTS}
# Empty if all inputs are above reorder point

## This Session
- Started: {SESSION_START}
- Pending confirmation: {YES/NO} — {OPERATION if pending}
- IDs assigned this session: {USED_IDS}
