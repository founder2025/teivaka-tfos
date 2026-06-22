-- 161 register-create audit events (slice 2) — apply-as-owner (Strike #123)
-- Seeds BUYER_ADDED / EQUIPMENT_ADDED / INPUT_ADDED / WORKER_ADDED into the catalog
-- (is_user_facing=false) + a naming label, then rebuilds audit.events CHECK from the catalog.
-- Idempotent. Run as OWNER, then rebuild backend (the emits live in customers/equipment/inputs),
-- then stamp (AFTER rebuild — B78):
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/161_register_create_audit_apply_as_owner.sql
--   docker compose -f 04_environment/docker-compose.yml build --no-cache api && docker compose -f 04_environment/docker-compose.yml up -d api
--   docker exec teivaka_api alembic stamp 161_register_create_audit
--   docker exec teivaka_api alembic current   -- -> 161_register_create_audit (head)

DO $$
DECLARE vals text;
BEGIN
  INSERT INTO shared.event_type_catalog
      (event_type, catalog_group, sort_order, is_user_facing, is_compound,
       livestock_only, min_role, min_mode, backdating_window_days,
       requires_reason_after_days, is_active, notes)
  VALUES
      ('BUYER_ADDED',     'OTHER', 5, false, false, false, 'WORKER', 'SOLO', 0, NULL, true, 'Slice 2: register row created.'),
      ('EQUIPMENT_ADDED', 'OTHER', 5, false, false, false, 'WORKER', 'SOLO', 0, NULL, true, 'Slice 2: register row created.'),
      ('INPUT_ADDED',     'OTHER', 5, false, false, false, 'WORKER', 'SOLO', 0, NULL, true, 'Slice 2: register row created.'),
      ('WORKER_ADDED',    'OTHER', 5, false, false, false, 'WORKER', 'SOLO', 0, NULL, true, 'Slice 2: register row created.')
  ON CONFLICT (event_type) DO NOTHING;

  INSERT INTO shared.naming_dictionary (concept_key, locale, form, value, is_active) VALUES
      ('event.BUYER_ADDED.label',     'en', 'label', 'Buyer added',      TRUE),
      ('event.EQUIPMENT_ADDED.label', 'en', 'label', 'Equipment added',  TRUE),
      ('event.INPUT_ADDED.label',     'en', 'label', 'Input item added', TRUE),
      ('event.WORKER_ADDED.label',    'en', 'label', 'Worker added',     TRUE)
  ON CONFLICT (concept_key, locale, form) DO NOTHING;

  ALTER TABLE audit.events DROP CONSTRAINT IF EXISTS events_event_type_check;
  SELECT string_agg(DISTINCT quote_literal(event_type), ', ') INTO vals FROM shared.event_type_catalog;
  EXECUTE 'ALTER TABLE audit.events ADD CONSTRAINT events_event_type_check CHECK (event_type IN ('||vals||'))';
END $$;
