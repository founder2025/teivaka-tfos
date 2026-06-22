-- 158 add GRADE/DELIVERY_DISPATCH/DELIVERY_CONFIRM to field_events CHECK — apply-as-owner (Strike #123)
-- Hypertable-safe CHECK extension (metadata-only). NO audit migration (audit CHECK already covers
-- GRADING/DELIVERY_*). Bulletproof: new constraint = intended verbs ∪ existing data.
-- Run as the OWNER role, then alembic stamp:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/158_field_events_grade_deliv_apply_as_owner.sql
--   docker exec teivaka_api alembic stamp 158_field_events_grade_deliv
--   docker exec teivaka_api alembic current   -- -> 158_field_events_grade_deliv (head)
-- Mirrors alembic/versions/158_field_events_grade_deliv.py upgrade().

DO $$
DECLARE vals text;
BEGIN
  ALTER TABLE tenant.field_events DROP CONSTRAINT IF EXISTS field_events_event_type_check;
  SELECT string_agg(DISTINCT quote_literal(v), ', ') INTO vals FROM (
    SELECT unnest(ARRAY[
      'PLANTING','TRANSPLANT','FERTILIZE','IRRIGATE','SPRAY','PRUNE',
      'PEST_OBSERVE','DISEASE_OBSERVE','HARVEST_PARTIAL','HARVEST_FINAL',
      'INSPECTION','SOIL_TEST','PHOTO','OTHER','WEED_MANAGEMENT','LAND_PREP',
      'MULCH','THIN','COVER_CROP','SEED_SAVE','BIO_CONTROL','CROP_HEALTH',
      'STORAGE','LOSS','CYCLE_ABANDON','CROP_SALE','CROP_GIVEN',
      'GRADE','DELIVERY_DISPATCH','DELIVERY_CONFIRM'
    ]) AS v
    UNION
    SELECT event_type FROM tenant.field_events WHERE event_type IS NOT NULL
  ) s;
  EXECUTE 'ALTER TABLE tenant.field_events ADD CONSTRAINT field_events_event_type_check CHECK (event_type IN ('||vals||'))';
END $$;
