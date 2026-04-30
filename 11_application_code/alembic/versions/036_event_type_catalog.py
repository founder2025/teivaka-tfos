"""Sprint 2 Catalog Redesign — shared.event_type_catalog + subtypes + CHECK expansion

Revision ID: 036_event_type_catalog
Revises: 035_tenant_mv_input_balance_stub
Create Date: 2026-04-30

Creates the data-driven catalog of all event types per Catalog Redesign Doctrine
2026-04-30. Single source of truth for the (+) modal. Drives:
- (+) UI rendering (Sprint 4)
- naming dictionary translation keys (Sprint 3)
- compound flow definitions (Sprint 5)
- role + mode + livestock gating

Three coordinated changes in one migration:
1. CREATE shared.event_type_catalog (72 seed rows: 39 user-facing + 13 system + 20 legacy)
2. CREATE shared.event_type_subtypes (12 seed rows: LAND_PREP x6, CHEMICAL_APPLIED x3, FIELD_OBSERVATION x3)
3. EXPAND audit.events.event_type CHECK constraint from 29 values to 72 values

Why one migration, not two:
The catalog and the CHECK must move together. Splitting them creates a window where
the catalog claims an event type that audit.events rejects on insert. Single
transaction = atomic. Either everything lands or nothing does.

UPGRADE_SQL pattern: each statement in its own op.execute() call (asyncpg
single-statement constraint, lesson from Migration 035).

Downgrade safety note:
Downgrade restores the old 29-value CHECK constraint. If audit.events has rows
referencing any of the 43 new event types at downgrade time, the CHECK ADD will
fail. In production we never downgrade — forward-fix via 037 instead. The
downgrade exists for local test reversibility only.

Reversible (with the caveat above).
"""
from alembic import op


revision = '036_event_type_catalog'
down_revision = '035_tenant_mv_input_balance_stub'
branch_labels = None
depends_on = None


# ------- UPGRADE STATEMENTS -------

CREATE_CATALOG_TABLE = """
CREATE TABLE shared.event_type_catalog (
    event_type                  text NOT NULL,
    catalog_group               text NOT NULL,
    sort_order                  integer NOT NULL,
    is_user_facing              boolean NOT NULL DEFAULT true,
    is_compound                 boolean NOT NULL DEFAULT false,
    compound_emits              text[],
    livestock_only              boolean NOT NULL DEFAULT false,
    min_role                    text NOT NULL DEFAULT 'WORKER',
    min_mode                    text NOT NULL DEFAULT 'SOLO',
    backdating_window_days      integer,
    requires_reason_after_days  integer,
    notes                       text,
    is_active                   boolean NOT NULL DEFAULT true,
    created_at                  timestamp with time zone NOT NULL DEFAULT now(),
    updated_at                  timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT event_type_catalog_pkey PRIMARY KEY (event_type),
    CONSTRAINT event_type_catalog_group_check CHECK (
        catalog_group IN ('CROPS', 'ANIMALS', 'MONEY', 'NOTES', 'OTHER', 'SYSTEM')
    ),
    CONSTRAINT event_type_catalog_role_check CHECK (
        min_role IN ('WORKER', 'MANAGER', 'OWNER', 'ENTERPRISE_ADMIN', 'FOUNDER')
    ),
    CONSTRAINT event_type_catalog_mode_check CHECK (
        min_mode IN ('SOLO', 'GROWTH', 'COMMERCIAL', 'ENTERPRISE')
    ),
    CONSTRAINT event_type_catalog_compound_consistency CHECK (
        (is_compound = false AND compound_emits IS NULL) OR
        (is_compound = true AND compound_emits IS NOT NULL AND array_length(compound_emits, 1) >= 1)
    )
)
"""

CREATE_CATALOG_INDEX = """
CREATE INDEX idx_event_type_catalog_group_sort
    ON shared.event_type_catalog (catalog_group, sort_order)
    WHERE is_user_facing = true AND is_active = true
"""

CREATE_SUBTYPES_TABLE = """
CREATE TABLE shared.event_type_subtypes (
    event_type    text NOT NULL,
    subtype_value text NOT NULL,
    sort_order    integer NOT NULL,
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT event_type_subtypes_pkey PRIMARY KEY (event_type, subtype_value),
    CONSTRAINT event_type_subtypes_event_fkey FOREIGN KEY (event_type)
        REFERENCES shared.event_type_catalog(event_type)
)
"""

CREATE_SUBTYPES_INDEX = """
CREATE INDEX idx_event_type_subtypes_event
    ON shared.event_type_subtypes (event_type, sort_order)
    WHERE is_active = true
"""

GRANT_CATALOG_SELECT = """
GRANT SELECT ON shared.event_type_catalog TO teivaka_app
"""

GRANT_SUBTYPES_SELECT = """
GRANT SELECT ON shared.event_type_subtypes TO teivaka_app
"""

# Catalog seed — split into INSERTs by group for readability + asyncpg compatibility.

SEED_CROPS = """
INSERT INTO shared.event_type_catalog
(event_type, catalog_group, sort_order, is_user_facing, is_compound, compound_emits, livestock_only, min_role, min_mode, backdating_window_days, requires_reason_after_days, notes)
VALUES
('PLANTING',           'CROPS', 10, true, false, NULL, false, 'WORKER', 'SOLO', 30, 7,    'Crop planted in a block'),
('HARVEST_LOGGED',     'CROPS', 20, true, false, NULL, false, 'WORKER', 'SOLO', 30, 7,    'Crop harvested'),
('IRRIGATION',         'CROPS', 30, true, false, NULL, false, 'WORKER', 'SOLO', 30, NULL, 'Watered the crop'),
('CHEMICAL_APPLIED',   'CROPS', 40, true, false, NULL, false, 'WORKER', 'SOLO', 7,  0,    'Sprayed pesticide/herbicide/fungicide. Backdating always requires reason.'),
('FERTILIZER_APPLIED', 'CROPS', 50, true, false, NULL, false, 'WORKER', 'SOLO', 30, 7,    'Fertilized the crop'),
('WEED_MANAGEMENT',    'CROPS', 60, true, false, NULL, false, 'WORKER', 'SOLO', 30, NULL, 'Weeded a block'),
('PRUNING_TRAINING',   'CROPS', 70, true, false, NULL, false, 'WORKER', 'SOLO', 30, NULL, 'Pruned or trained plants'),
('TRANSPLANT_LOGGED',  'CROPS', 80, true, false, NULL, false, 'WORKER', 'SOLO', 14, 3,    'Moved seedling from nursery to field; auto-emits CYCLE_CREATED'),
('LAND_PREP',          'CROPS', 90, true, false, NULL, false, 'WORKER', 'SOLO', 30, 7,    'Cleared, excavated, tilled, leveled, formed beds, or fenced. New event type per Decision 6.')
"""

SEED_ANIMALS = """
INSERT INTO shared.event_type_catalog
(event_type, catalog_group, sort_order, is_user_facing, is_compound, compound_emits, livestock_only, min_role, min_mode, backdating_window_days, requires_reason_after_days, notes)
VALUES
('LIVESTOCK_BIRTH',     'ANIMALS', 10, true, false, NULL,                  true, 'WORKER', 'SOLO', 7,  NULL, 'Animal birth'),
('LIVESTOCK_MORTALITY', 'ANIMALS', 20, true, false, NULL,                  true, 'WORKER', 'SOLO', 7,  0,    'Animal death — backdating always requires reason'),
('VACCINATION',         'ANIMALS', 30, true, false, NULL,                  true, 'WORKER', 'SOLO', 14, 3,    'Animal vaccination'),
('WEIGHT_CHECK',        'ANIMALS', 40, true, false, NULL,                  true, 'WORKER', 'SOLO', 14, NULL, 'Weight measurement'),
('HIVE_INSPECTION',     'ANIMALS', 50, true, false, NULL,                  true, 'WORKER', 'SOLO', 7,  NULL, 'Bee hive inspection'),
('LIVESTOCK_ACQUIRED',  'ANIMALS', 60, true, false, NULL,                  true, 'OWNER',  'SOLO', 30, 7,    'New animal added to herd/flock'),
('LIVESTOCK_SALE',      'ANIMALS', 70, true, true,  ARRAY['CASH_IN'],      true, 'OWNER',  'SOLO', 30, 7,    'Animal sold; auto-emits CASH_IN compound')
"""

SEED_MONEY = """
INSERT INTO shared.event_type_catalog
(event_type, catalog_group, sort_order, is_user_facing, is_compound, compound_emits, livestock_only, min_role, min_mode, backdating_window_days, requires_reason_after_days, notes)
VALUES
('SELL_CROPS',          'MONEY', 10, true, true,  ARRAY['DELIVERY_DISPATCHED','CASH_IN'],   false, 'OWNER',  'SOLO', 30, 7, 'Compound: emits DELIVERY_DISPATCHED + CASH_IN'),
('CASH_OUT',            'MONEY', 20, true, false, NULL,                                     false, 'OWNER',  'SOLO', 30, 7, 'Pay someone (general outflow)'),
('BUY_SUPPLIES',        'MONEY', 30, true, true,  ARRAY['CASH_OUT','INPUT_RECEIVED'],       false, 'OWNER',  'SOLO', 30, 7, 'Compound: emits CASH_OUT + INPUT_RECEIVED'),
('HIRE_MACHINE',        'MONEY', 40, true, true,  ARRAY['EQUIPMENT_USE','CASH_OUT','LAND_PREP'], false, 'OWNER', 'SOLO', 30, 7, 'Compound: emits EQUIPMENT_USE + CASH_OUT (+ LAND_PREP optional)'),
('INPUT_RECEIVED',      'MONEY', 50, true, false, NULL,                                     false, 'WORKER', 'SOLO', 30, 7, 'Received supplies (no payment — donation/subsidy)'),
('WAGES_PAID',          'MONEY', 60, true, true,  ARRAY['WAGE_PAID','CASH_OUT'],            false, 'OWNER',  'SOLO', 30, 7, 'Compound: emits WAGE_PAID + CASH_OUT'),
('DELIVERY_DISPATCHED', 'MONEY', 70, true, false, NULL,                                     false, 'WORKER', 'SOLO', 30, 7, 'Goods left the farm'),
('DELIVERY_CONFIRMED',  'MONEY', 80, true, false, NULL,                                     false, 'WORKER', 'SOLO', 30, 7, 'Buyer confirmed receipt')
"""

SEED_NOTES = """
INSERT INTO shared.event_type_catalog
(event_type, catalog_group, sort_order, is_user_facing, is_compound, compound_emits, livestock_only, min_role, min_mode, backdating_window_days, requires_reason_after_days, notes)
VALUES
('PEST_SCOUTING',     'NOTES', 10, true, false, NULL, false, 'WORKER', 'SOLO', 30, NULL, 'Pest observation'),
('DISEASE_SCOUTING',  'NOTES', 20, true, false, NULL, false, 'WORKER', 'SOLO', 30, NULL, 'Disease observation'),
('WEATHER_OBSERVED',  'NOTES', 30, true, false, NULL, false, 'WORKER', 'SOLO', 7,  NULL, 'Weather event noted'),
('WEATHER_IMPACT',    'NOTES', 40, true, false, NULL, false, 'WORKER', 'SOLO', 30, 7,    'Weather caused crop/livestock damage'),
('FIELD_OBSERVATION', 'NOTES', 50, true, false, NULL, false, 'WORKER', 'SOLO', 30, NULL, 'General/photo/free-note observation; subtype distinguishes UI flow'),
('INCIDENT_REPORT',   'NOTES', 60, true, false, NULL, false, 'WORKER', 'SOLO', 30, 0,    'Reportable incident — backdating requires reason')
"""

SEED_OTHER = """
INSERT INTO shared.event_type_catalog
(event_type, catalog_group, sort_order, is_user_facing, is_compound, compound_emits, livestock_only, min_role, min_mode, backdating_window_days, requires_reason_after_days, notes)
VALUES
('NURSERY_BATCH_CREATED', 'OTHER', 10, true, false, NULL, false, 'WORKER', 'SOLO',   14, NULL, 'Started a nursery batch'),
('NURSERY_READY',         'OTHER', 20, true, false, NULL, false, 'WORKER', 'SOLO',   7,  NULL, 'Nursery batch ready to transplant'),
('GERMINATION_LOGGED',    'OTHER', 30, true, false, NULL, false, 'WORKER', 'SOLO',   14, NULL, 'Seeds germinated'),
('WORKER_CHECKIN',        'OTHER', 40, true, false, NULL, false, 'WORKER', 'SOLO',   14, 3,    'Worker checked in for the day'),
('INPUT_USED_ADJUSTMENT', 'OTHER', 50, true, false, NULL, false, 'OWNER',  'SOLO',   30, 7,    'Manual inventory adjustment (replaces auto-deduction)'),
('POST_HARVEST_LOSS',     'OTHER', 60, true, false, NULL, false, 'OWNER',  'SOLO',   30, 7,    'Crop lost after harvest'),
('GRADING',               'OTHER', 70, true, false, NULL, false, 'WORKER', 'GROWTH', 30, 7,    'Graded harvest output'),
('CYCLE_CREATED',         'OTHER', 80, true, false, NULL, false, 'OWNER',  'SOLO',   14, NULL, 'Manually started a crop run (when not auto-emitted from transplant)'),
('CYCLE_CLOSED',          'OTHER', 90, true, false, NULL, false, 'OWNER',  'SOLO',   30, 7,    'Closed a crop run')
"""

SEED_SYSTEM = """
INSERT INTO shared.event_type_catalog
(event_type, catalog_group, sort_order, is_user_facing, is_compound, compound_emits, livestock_only, min_role, min_mode, backdating_window_days, requires_reason_after_days, notes, is_active)
VALUES
('TASK_COMPLETED',     'SYSTEM',  10, false, false, NULL, false, 'WORKER',  'SOLO', NULL, NULL, 'Auto-emitted from Task Engine on task completion', true),
('TASK_SKIPPED',       'SYSTEM',  20, false, false, NULL, false, 'WORKER',  'SOLO', NULL, NULL, 'Auto from Task Engine', true),
('TASK_CANCELLED',     'SYSTEM',  30, false, false, NULL, false, 'OWNER',   'SOLO', NULL, NULL, 'Task cancelled by owner action', true),
('TASK_EXPIRED',       'SYSTEM',  40, false, false, NULL, false, 'WORKER',  'SOLO', NULL, NULL, 'Auto from Task Engine timeout', true),
('STAGE_TRANSITION',   'SYSTEM',  50, false, false, NULL, false, 'OWNER',   'SOLO', NULL, NULL, 'Auto-emitted on cycle stage gate', true),
('TASK_ASSIGNED',      'SYSTEM',  60, false, false, NULL, false, 'OWNER',   'SOLO', NULL, NULL, 'Auto from Task Engine', true),
('EQUIPMENT_USE',      'SYSTEM',  70, false, false, NULL, false, 'WORKER',  'SOLO', NULL, NULL, 'Bundled into HIRE_MACHINE compound; not standalone', true),
('INPUT_USED',         'SYSTEM',  80, false, false, NULL, false, 'WORKER',  'SOLO', NULL, NULL, 'Auto-deducted from spray/feed/plant flows', true),
('WAGE_PAID',          'SYSTEM',  90, false, false, NULL, false, 'OWNER',   'SOLO', NULL, NULL, 'Bundled into WAGES_PAID compound', true),
('CASH_IN',            'SYSTEM', 100, false, false, NULL, false, 'WORKER',  'SOLO', NULL, NULL, 'Bundled into SELL_CROPS / LIVESTOCK_SALE compounds', true),
('OVERRIDE_EXECUTED',  'SYSTEM', 110, false, false, NULL, false, 'FOUNDER', 'SOLO', NULL, NULL, 'FOUNDER-only via dedicated admin path', true),
('EVENT_CORRECTED',    'SYSTEM', 120, false, false, NULL, false, 'WORKER',  'SOLO', NULL, NULL, 'System-derived from PATCH operations', true),
('PAYMENT_RECEIVED',   'SYSTEM', 130, false, false, NULL, false, 'WORKER',  'SOLO', NULL, NULL, 'System-derived from external payment confirmation', true)
"""

SEED_LEGACY = """
INSERT INTO shared.event_type_catalog
(event_type, catalog_group, sort_order, is_user_facing, is_compound, compound_emits, livestock_only, min_role, min_mode, backdating_window_days, requires_reason_after_days, notes, is_active)
VALUES
('CYCLE_TRANSITION',     'SYSTEM', 200, false, false, NULL, false, 'OWNER',  'SOLO', NULL, NULL, 'LEGACY — superseded by STAGE_TRANSITION; existing audit rows kept', false),
('LABOR_LOGGED',         'SYSTEM', 210, false, false, NULL, false, 'WORKER', 'SOLO', NULL, NULL, 'LEGACY — superseded by WORKER_CHECKIN', false),
('INVENTORY_ADJUSTED',   'SYSTEM', 220, false, false, NULL, false, 'WORKER', 'SOLO', NULL, NULL, 'LEGACY — superseded by INPUT_USED + INPUT_USED_ADJUSTMENT', false),
('ROTATION_OVERRIDE',    'SYSTEM', 230, false, false, NULL, false, 'OWNER',  'SOLO', NULL, NULL, 'Decision Engine signal; distinct from generic OVERRIDE_EXECUTED', true),
('COMPLIANCE_OVERRIDE',  'SYSTEM', 240, false, false, NULL, false, 'OWNER',  'SOLO', NULL, NULL, 'Decision Engine signal; distinct from generic OVERRIDE_EXECUTED', true),
('ALERT_RESOLVED',       'SYSTEM', 250, false, false, NULL, false, 'WORKER', 'SOLO', NULL, NULL, 'Decision Engine signal', true),
('USER_INVITED',         'SYSTEM', 260, false, false, NULL, false, 'OWNER',  'SOLO', NULL, NULL, 'Auth flow', true),
('FARM_CREATED',         'SYSTEM', 270, false, false, NULL, false, 'OWNER',  'SOLO', NULL, NULL, 'Entity creation audit', true),
('FARM_CLOSED',          'SYSTEM', 280, false, false, NULL, false, 'OWNER',  'SOLO', NULL, NULL, 'Entity closure audit', true),
('SUBSCRIPTION_CHANGED', 'SYSTEM', 290, false, false, NULL, false, 'OWNER',  'SOLO', NULL, NULL, 'Billing audit', true),
('REFERRAL_ACTIVATED',   'SYSTEM', 300, false, false, NULL, false, 'OWNER',  'SOLO', NULL, NULL, 'Phase 3.5a', true),
('BANK_PDF_GENERATED',   'SYSTEM', 310, false, false, NULL, false, 'OWNER',  'SOLO', NULL, NULL, 'Phase 6', true),
('CREDIT_SCORE_UPDATED', 'SYSTEM', 320, false, false, NULL, false, 'OWNER',  'SOLO', NULL, NULL, 'Phase 9', true),
('ADVISORY_READ',        'SYSTEM', 330, false, false, NULL, false, 'WORKER', 'SOLO', NULL, NULL, 'TIS interaction audit', true),
('ONBOARDING_STARTED',   'SYSTEM', 340, false, false, NULL, false, 'OWNER',  'SOLO', NULL, NULL, 'Onboarding flow', true),
('ONBOARDING_COMPLETED', 'SYSTEM', 350, false, false, NULL, false, 'OWNER',  'SOLO', NULL, NULL, 'Onboarding flow', true),
('CASH_LOGGED',          'SYSTEM', 360, false, false, NULL, false, 'WORKER', 'SOLO', NULL, NULL, 'Pre-doctrine cash event still emitting', true),
('CASH_UPDATED',         'SYSTEM', 370, false, false, NULL, false, 'WORKER', 'SOLO', NULL, NULL, 'Patch audit', true),
('CASH_DELETED',         'SYSTEM', 380, false, false, NULL, false, 'OWNER',  'SOLO', NULL, NULL, 'Soft delete audit', true),
('PAYMENT_SENT',         'SYSTEM', 390, false, false, NULL, false, 'OWNER',  'SOLO', NULL, NULL, 'Distinct from CASH_OUT compound emit', true)
"""

SEED_SUBTYPES = """
INSERT INTO shared.event_type_subtypes
(event_type, subtype_value, sort_order)
VALUES
('LAND_PREP',          'CLEARING',      10),
('LAND_PREP',          'EXCAVATION',    20),
('LAND_PREP',          'TILLING',       30),
('LAND_PREP',          'LEVELING',      40),
('LAND_PREP',          'BED_FORMATION', 50),
('LAND_PREP',          'FENCING',       60),
('CHEMICAL_APPLIED',   'PESTICIDE',     10),
('CHEMICAL_APPLIED',   'HERBICIDE',     20),
('CHEMICAL_APPLIED',   'FUNGICIDE',     30),
('FIELD_OBSERVATION',  'GENERAL',       10),
('FIELD_OBSERVATION',  'PHOTO_ONLY',    20),
('FIELD_OBSERVATION',  'FREE_NOTE',     30)
"""

DROP_OLD_CHECK = """
ALTER TABLE audit.events DROP CONSTRAINT audit_events_event_type_valid
"""

ADD_NEW_CHECK = """
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

# ------- DOWNGRADE STATEMENTS -------

RESTORE_OLD_CHECK = """
ALTER TABLE audit.events DROP CONSTRAINT audit_events_event_type_valid
"""

RESTORE_OLD_CHECK_ADD = """
ALTER TABLE audit.events ADD CONSTRAINT audit_events_event_type_valid
CHECK (event_type IN (
    'TASK_COMPLETED', 'TASK_SKIPPED', 'TASK_CANCELLED', 'TASK_EXPIRED',
    'HARVEST_LOGGED', 'CHEMICAL_APPLIED',
    'CYCLE_CREATED', 'CYCLE_CLOSED', 'CYCLE_TRANSITION',
    'ROTATION_OVERRIDE', 'COMPLIANCE_OVERRIDE',
    'PAYMENT_RECEIVED', 'PAYMENT_SENT',
    'LABOR_LOGGED', 'INVENTORY_ADJUSTED',
    'ALERT_RESOLVED', 'USER_INVITED',
    'FARM_CREATED', 'FARM_CLOSED',
    'SUBSCRIPTION_CHANGED', 'REFERRAL_ACTIVATED',
    'BANK_PDF_GENERATED', 'CREDIT_SCORE_UPDATED',
    'ADVISORY_READ',
    'ONBOARDING_STARTED', 'ONBOARDING_COMPLETED',
    'CASH_LOGGED', 'CASH_UPDATED', 'CASH_DELETED'
))
"""

DROP_SUBTYPES_TABLE = """
DROP TABLE IF EXISTS shared.event_type_subtypes
"""

DROP_CATALOG_TABLE = """
DROP TABLE IF EXISTS shared.event_type_catalog
"""


def upgrade() -> None:
    op.execute(CREATE_CATALOG_TABLE)
    op.execute(CREATE_CATALOG_INDEX)
    op.execute(CREATE_SUBTYPES_TABLE)
    op.execute(CREATE_SUBTYPES_INDEX)
    op.execute(GRANT_CATALOG_SELECT)
    op.execute(GRANT_SUBTYPES_SELECT)
    op.execute(SEED_CROPS)
    op.execute(SEED_ANIMALS)
    op.execute(SEED_MONEY)
    op.execute(SEED_NOTES)
    op.execute(SEED_OTHER)
    op.execute(SEED_SYSTEM)
    op.execute(SEED_LEGACY)
    op.execute(SEED_SUBTYPES)
    op.execute(DROP_OLD_CHECK)
    op.execute(ADD_NEW_CHECK)


def downgrade() -> None:
    op.execute(RESTORE_OLD_CHECK)
    op.execute(RESTORE_OLD_CHECK_ADD)
    op.execute(DROP_SUBTYPES_TABLE)
    op.execute(DROP_CATALOG_TABLE)
