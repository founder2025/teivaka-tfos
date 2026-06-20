-- force_rls_all_tenant_tables.sql — apply FORCE ROW LEVEL SECURITY to all
-- RLS-enabled tenant.* tables (Foundation Audit N4).
--
-- ⚠️  GATED. Run scripts/audit_rls_check.sql FIRST and confirm it is safe:
--     applying FORCE makes RLS apply even to a table's OWNER. If the app role
--     owns tenant.users and the pre-tenant-context auth lookup relies on owner
--     bypass, this WILL break login. Resolve that (permissive policy or a
--     SECURITY DEFINER lookup) before running this.
--
-- Apply as owner (Strike #123):
--     psql -U teivaka -d teivaka_db -f scripts/pending/force_rls_all_tenant_tables.sql
--
-- Idempotent: only touches tables that already have RLS ENABLED but not FORCED.
-- Does NOT enable RLS on tables that lack it (those need a policy first — they
-- appear in section 1 of audit_rls_check.sql with rls_enabled = false and must
-- be handled individually).
--
-- This file lives under scripts/pending/ (NOT alembic/versions/) on purpose, so
-- `alembic upgrade head` never auto-applies it during a routine deploy. Once
-- verified and applied, record it as a migration per Strike #123 convention.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'tenant'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND c.relforcerowsecurity = false
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE tenant.%I FORCE ROW LEVEL SECURITY', r.relname);
    RAISE NOTICE 'FORCED RLS on tenant.%', r.relname;
  END LOOP;
END $$;

-- Verify zero remaining gaps after apply:
SELECT count(*) AS still_unforced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'tenant' AND c.relkind = 'r'
  AND c.relrowsecurity = true AND c.relforcerowsecurity = false;
