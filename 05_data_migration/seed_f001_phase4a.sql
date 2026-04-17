-- seed_f001_phase4a.sql — Phase 4a-5 baseline data for F001
--
-- Creates ONE active eggplant cycle on F001-PU002, plus two SPRAY field events
-- so we can validate the chemical compliance enforcement path end-to-end.
--
-- WHD math (today = 2026-04-15):
--   Mancozeb     14d ago, WHD=7 → clearance 2026-04-08 → CLEARED
--   Cypermethrin  3d ago, WHD=7 → clearance 2026-04-19 → BLOCKING (4d remaining)
--
-- Idempotent — safe to re-run. Cycle uses ON CONFLICT (cycle_id) DO NOTHING;
-- field_events uses INSERT ... WHERE NOT EXISTS (composite hypertable PK).

BEGIN;

-- 1. Active eggplant cycle on F001-PU002, planted 30 days ago.
INSERT INTO tenant.production_cycles (
    cycle_id, tenant_id, pu_id, zone_id, farm_id, production_id,
    cycle_status, planting_date, expected_harvest_date,
    planned_area_sqm, planned_yield_kg, cycle_notes
)
SELECT
    'F001-PU002-EGG-2026-001',
    f.tenant_id,
    'F001-PU002',
    'F001-Z01',
    'F001',
    'CRP-EGG',
    'ACTIVE',
    (CURRENT_DATE - INTERVAL '30 days')::date,
    (CURRENT_DATE + INTERVAL '20 days')::date,
    100.00,
    150.00,
    'Phase 4a-5 seed cycle — eggplant, F001-PU002.'
FROM tenant.farms f
WHERE f.farm_id = 'F001'
ON CONFLICT (cycle_id) DO NOTHING;

-- 2a. SPRAY event 1 — Mancozeb, 14d ago, should clear (WHD=7).
INSERT INTO tenant.field_events (
    event_id, tenant_id, cycle_id, pu_id, farm_id,
    event_type, event_date,
    chemical_application, chemical_id,
    chemical_dose_per_liter, tank_volume_liters,
    observation_text
)
SELECT
    'FE-F001-PU002-001',
    f.tenant_id,
    'F001-PU002-EGG-2026-001',
    'F001-PU002',
    'F001',
    'SPRAY',
    (NOW() - INTERVAL '14 days'),
    true,
    'CHEM-002',  -- Mancozeb 80% WP, WHD=7
    2.5,
    16.0,
    'Phase 4a-5 seed: Mancozeb spray, should be cleared.'
FROM tenant.farms f
WHERE f.farm_id = 'F001'
  AND NOT EXISTS (
      SELECT 1 FROM tenant.field_events
      WHERE event_id = 'FE-F001-PU002-001'
  );

-- 2b. SPRAY event 2 — Cypermethrin, 3d ago, should still block (WHD=7).
INSERT INTO tenant.field_events (
    event_id, tenant_id, cycle_id, pu_id, farm_id,
    event_type, event_date,
    chemical_application, chemical_id,
    chemical_dose_per_liter, tank_volume_liters,
    observation_text
)
SELECT
    'FE-F001-PU002-002',
    f.tenant_id,
    'F001-PU002-EGG-2026-001',
    'F001-PU002',
    'F001',
    'SPRAY',
    (NOW() - INTERVAL '3 days'),
    true,
    'CHEM-003',  -- Cypermethrin 10% EC, WHD=7
    1.5,
    16.0,
    'Phase 4a-5 seed: Cypermethrin spray, should BLOCK harvest until 2026-04-19.'
FROM tenant.farms f
WHERE f.farm_id = 'F001'
  AND NOT EXISTS (
      SELECT 1 FROM tenant.field_events
      WHERE event_id = 'FE-F001-PU002-002'
  );

COMMIT;

-- Inline verification
SELECT cycle_id, cycle_status, planting_date, expected_harvest_date
FROM tenant.production_cycles WHERE farm_id='F001';

SELECT event_id, event_type, event_date::date, chemical_id, whd_clearance_date
FROM tenant.field_events WHERE pu_id='F001-PU002' ORDER BY event_date;
