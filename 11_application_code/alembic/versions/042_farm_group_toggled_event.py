"""Sprint 5 Phase 5.5b — FARM_GROUP_TOGGLED audit event + catalog row + vocabulary

Revision ID: 042_farm_group_toggled_event
Revises: 041_naming_dictionary_groups_v2
Create Date: 2026-04-30

Adds the FARM_GROUP_TOGGLED event type to power audit-trail compliance for
the new PUT /api/v1/farms/{farm_id}/active-groups endpoint. Per Path A
decision (Catalog Redesign Doctrine Amendment v2) and Inviolable Rule #2
(audit chain integrity): every state mutation emits an audit row.

Three coordinated changes (atomic, all-or-nothing):
1. INSERT row into shared.event_type_catalog (SYSTEM group, not user-facing)
2. Expand audit.events.event_type CHECK from 72 -> 73 values to include
   FARM_GROUP_TOGGLED
3. INSERT row into shared.naming_dictionary (admin-facing label only since
   is_user_facing=false)

Reversible (DELETE rows + restore old CHECK).
"""
from alembic import op


revision = '042_farm_group_toggled_event'
down_revision = '041_naming_dictionary_groups_v2'
branch_labels = None
depends_on = None


INSERT_CATALOG_ROW = """
INSERT INTO shared.event_type_catalog
(event_type, catalog_group, sort_order, is_user_facing, is_compound, compound_emits, livestock_only, min_role, min_mode, backdating_window_days, requires_reason_after_days, notes, is_active)
VALUES
('FARM_GROUP_TOGGLED', 'SYSTEM', 400, false, false, NULL, false, 'OWNER', 'SOLO', 0, NULL, 'Audit trail when a farm owner toggles a catalog_group active/inactive in farm_active_groups', true)
"""

DROP_OLD_AUDIT_CHECK = """
ALTER TABLE audit.events DROP CONSTRAINT audit_events_event_type_valid
"""

ADD_NEW_AUDIT_CHECK = """
ALTER TABLE audit.events ADD CONSTRAINT audit_events_event_type_valid
CHECK (event_type IN (
    'PLANTING', 'HARVEST_LOGGED', 'IRRIGATION', 'CHEMICAL_APPLIED',
    'FERTILIZER_APPLIED', 'WEED_MANAGEMENT', 'PRUNING_TRAINING',
    'TRANSPLANT_LOGGED', 'LAND_PREP',
    'LIVESTOCK_BIRTH', 'LIVESTOCK_MORTALITY', 'VACCINATION', 'WEIGHT_CHECK',
    'HIVE_INSPECTION', 'LIVESTOCK_ACQUIRED', 'LIVESTOCK_SALE',
    'SELL_CROPS', 'CASH_OUT', 'BUY_SUPPLIES', 'HIRE_MACHINE',
    'INPUT_RECEIVED', 'WAGES_PAID', 'DELIVERY_DISPATCHED', 'DELIVERY_CONFIRMED',
    'PEST_SCOUTING', 'DISEASE_SCOUTING', 'WEATHER_OBSERVED', 'WEATHER_IMPACT',
    'FIELD_OBSERVATION', 'INCIDENT_REPORT',
    'NURSERY_BATCH_CREATED', 'NURSERY_READY', 'GERMINATION_LOGGED',
    'WORKER_CHECKIN', 'INPUT_USED_ADJUSTMENT', 'POST_HARVEST_LOSS',
    'GRADING', 'CYCLE_CREATED', 'CYCLE_CLOSED',
    'TASK_COMPLETED', 'TASK_SKIPPED', 'TASK_CANCELLED', 'TASK_EXPIRED',
    'STAGE_TRANSITION', 'TASK_ASSIGNED', 'EQUIPMENT_USE', 'INPUT_USED',
    'WAGE_PAID', 'CASH_IN', 'OVERRIDE_EXECUTED', 'EVENT_CORRECTED',
    'PAYMENT_RECEIVED',
    'CYCLE_TRANSITION', 'LABOR_LOGGED', 'INVENTORY_ADJUSTED',
    'ROTATION_OVERRIDE', 'COMPLIANCE_OVERRIDE', 'ALERT_RESOLVED',
    'USER_INVITED', 'FARM_CREATED', 'FARM_CLOSED', 'SUBSCRIPTION_CHANGED',
    'REFERRAL_ACTIVATED', 'BANK_PDF_GENERATED', 'CREDIT_SCORE_UPDATED',
    'ADVISORY_READ', 'ONBOARDING_STARTED', 'ONBOARDING_COMPLETED',
    'CASH_LOGGED', 'CASH_UPDATED', 'CASH_DELETED', 'PAYMENT_SENT',
    'FARM_GROUP_TOGGLED'
))
"""

INSERT_VOCABULARY_ROW = """
INSERT INTO shared.naming_dictionary (concept_key, locale, form, value)
VALUES ('event.FARM_GROUP_TOGGLED.label', 'en', 'label', 'Group toggled')
"""

DOWNGRADE_DELETE_VOCABULARY = """
DELETE FROM shared.naming_dictionary
WHERE concept_key = 'event.FARM_GROUP_TOGGLED.label' AND locale = 'en'
"""

DOWNGRADE_RESTORE_OLD_CHECK_DROP = """
ALTER TABLE audit.events DROP CONSTRAINT audit_events_event_type_valid
"""

DOWNGRADE_RESTORE_OLD_CHECK_ADD = """
ALTER TABLE audit.events ADD CONSTRAINT audit_events_event_type_valid
CHECK (event_type IN (
    'PLANTING', 'HARVEST_LOGGED', 'IRRIGATION', 'CHEMICAL_APPLIED',
    'FERTILIZER_APPLIED', 'WEED_MANAGEMENT', 'PRUNING_TRAINING',
    'TRANSPLANT_LOGGED', 'LAND_PREP',
    'LIVESTOCK_BIRTH', 'LIVESTOCK_MORTALITY', 'VACCINATION', 'WEIGHT_CHECK',
    'HIVE_INSPECTION', 'LIVESTOCK_ACQUIRED', 'LIVESTOCK_SALE',
    'SELL_CROPS', 'CASH_OUT', 'BUY_SUPPLIES', 'HIRE_MACHINE',
    'INPUT_RECEIVED', 'WAGES_PAID', 'DELIVERY_DISPATCHED', 'DELIVERY_CONFIRMED',
    'PEST_SCOUTING', 'DISEASE_SCOUTING', 'WEATHER_OBSERVED', 'WEATHER_IMPACT',
    'FIELD_OBSERVATION', 'INCIDENT_REPORT',
    'NURSERY_BATCH_CREATED', 'NURSERY_READY', 'GERMINATION_LOGGED',
    'WORKER_CHECKIN', 'INPUT_USED_ADJUSTMENT', 'POST_HARVEST_LOSS',
    'GRADING', 'CYCLE_CREATED', 'CYCLE_CLOSED',
    'TASK_COMPLETED', 'TASK_SKIPPED', 'TASK_CANCELLED', 'TASK_EXPIRED',
    'STAGE_TRANSITION', 'TASK_ASSIGNED', 'EQUIPMENT_USE', 'INPUT_USED',
    'WAGE_PAID', 'CASH_IN', 'OVERRIDE_EXECUTED', 'EVENT_CORRECTED',
    'PAYMENT_RECEIVED',
    'CYCLE_TRANSITION', 'LABOR_LOGGED', 'INVENTORY_ADJUSTED',
    'ROTATION_OVERRIDE', 'COMPLIANCE_OVERRIDE', 'ALERT_RESOLVED',
    'USER_INVITED', 'FARM_CREATED', 'FARM_CLOSED', 'SUBSCRIPTION_CHANGED',
    'REFERRAL_ACTIVATED', 'BANK_PDF_GENERATED', 'CREDIT_SCORE_UPDATED',
    'ADVISORY_READ', 'ONBOARDING_STARTED', 'ONBOARDING_COMPLETED',
    'CASH_LOGGED', 'CASH_UPDATED', 'CASH_DELETED', 'PAYMENT_SENT'
))
"""

DOWNGRADE_DELETE_CATALOG_ROW = """
DELETE FROM shared.event_type_catalog WHERE event_type = 'FARM_GROUP_TOGGLED'
"""


def upgrade() -> None:
    op.execute(INSERT_CATALOG_ROW)
    op.execute(DROP_OLD_AUDIT_CHECK)
    op.execute(ADD_NEW_AUDIT_CHECK)
    op.execute(INSERT_VOCABULARY_ROW)


def downgrade() -> None:
    op.execute(DOWNGRADE_DELETE_VOCABULARY)
    op.execute(DOWNGRADE_RESTORE_OLD_CHECK_DROP)
    op.execute(DOWNGRADE_RESTORE_OLD_CHECK_ADD)
    op.execute(DOWNGRADE_DELETE_CATALOG_ROW)
