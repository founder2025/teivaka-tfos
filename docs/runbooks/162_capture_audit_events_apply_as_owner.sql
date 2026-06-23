-- 162 capture audit events (slice 2b) — apply-as-owner (Strike #123)
-- Ensures ATTENDANCE_LOGGED / WORKER_CHECKIN / INPUT_USED_ADJUSTMENT exist in the catalog
-- + rebuilds audit.events CHECK. Idempotent. Run as OWNER, rebuild backend, then stamp (B78):
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/162_capture_audit_events_apply_as_owner.sql
--   docker compose -f 04_environment/docker-compose.yml build --no-cache api && docker compose -f 04_environment/docker-compose.yml up -d api
--   docker exec teivaka_api alembic stamp 162_capture_audit_events && docker exec teivaka_api alembic current

DO $$
DECLARE vals text;
BEGIN
  INSERT INTO shared.event_type_catalog
      (event_type, catalog_group, sort_order, is_user_facing, is_compound,
       livestock_only, min_role, min_mode, backdating_window_days,
       requires_reason_after_days, is_active, notes)
  VALUES
      ('ATTENDANCE_LOGGED',     'OTHER', 5, false, false, false, 'WORKER', 'SOLO', 0, NULL, true, 'Slice 2b capture audit.'),
      ('WORKER_CHECKIN',        'OTHER', 5, false, false, false, 'WORKER', 'SOLO', 0, NULL, true, 'Slice 2b capture audit.'),
      ('INPUT_USED_ADJUSTMENT', 'OTHER', 5, false, false, false, 'WORKER', 'SOLO', 0, NULL, true, 'Slice 2b capture audit.')
  ON CONFLICT (event_type) DO NOTHING;

  INSERT INTO shared.naming_dictionary (concept_key, locale, form, value, is_active) VALUES
      ('event.ATTENDANCE_LOGGED.label',     'en', 'label', 'Attendance logged', TRUE),
      ('event.WORKER_CHECKIN.label',        'en', 'label', 'Worker check-in',    TRUE),
      ('event.INPUT_USED_ADJUSTMENT.label', 'en', 'label', 'Stock movement',     TRUE)
  ON CONFLICT (concept_key, locale, form) DO NOTHING;

  ALTER TABLE audit.events DROP CONSTRAINT IF EXISTS events_event_type_check;
  SELECT string_agg(DISTINCT quote_literal(event_type), ', ') INTO vals FROM shared.event_type_catalog;
  EXECUTE 'ALTER TABLE audit.events ADD CONSTRAINT events_event_type_check CHECK (event_type IN ('||vals||'))';
END $$;
