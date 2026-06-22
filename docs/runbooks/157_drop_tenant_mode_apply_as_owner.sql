-- 157 drop tenant.tenants.mode — apply-as-owner DDL (Strike #123), mode purge final.
-- DESTRUCTIVE: discards the SOLO/GROWTH/COMMERCIAL labels (intended — abandoned).
-- No code reads the column after purge sub-steps A-C. Take a backup first (below).
-- Run as the OWNER role, then alembic stamp:
--   docker exec teivaka_db pg_dump -U teivaka -d teivaka_db -Fc -f /tmp/pre_157_$(date -u +%Y%m%dT%H%M%SZ).dump
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/157_drop_tenant_mode_apply_as_owner.sql
--   docker exec teivaka_api alembic stamp 157_drop_tenant_mode
--   docker exec teivaka_api alembic current   -- -> 157_drop_tenant_mode (head)
-- Mirrors 11_application_code/alembic/versions/157_drop_tenant_mode.py upgrade().

ALTER TABLE tenant.tenants DROP COLUMN IF EXISTS mode;
