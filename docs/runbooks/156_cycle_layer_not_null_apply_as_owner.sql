-- 156 production_cycles.layer NOT NULL — apply-as-owner DDL (Strike #123)
-- 3-Layer doctrine (Strike #101/#103). Backend resolve_layer() (cycle_service) must be
-- DEPLOYED FIRST so no new cycle can be created with a NULL layer.
-- Backfill runs as OWNER (BYPASSRLS) so it sees all tenants' NULL rows.
-- Run as the OWNER role, then alembic stamp:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/156_cycle_layer_not_null_apply_as_owner.sql
--   docker exec teivaka_api alembic stamp 156_cycle_layer_not_null
--   docker exec teivaka_api alembic current   -- -> 156_cycle_layer_not_null (head)
-- Mirrors 11_application_code/alembic/versions/156_cycle_layer_not_null.py upgrade().
-- If the ALTER fails on remaining NULLs, classify the borderline cycle(s) first
-- (Strike #104a banner / PATCH /cycles/{id}/classify-layer) then re-run.

UPDATE tenant.production_cycles pc
SET layer = p.suggested_layer
FROM shared.productions p
WHERE pc.production_id = p.production_id
  AND pc.layer IS NULL
  AND p.suggested_layer IS NOT NULL;

ALTER TABLE tenant.production_cycles ALTER COLUMN layer SET NOT NULL;
