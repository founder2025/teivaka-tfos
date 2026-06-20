-- audit_rls_check.sql — RLS coverage + auth-path resolver (Foundation Audit N4)
--
-- Run on the server BEFORE applying force_rls_all_tenant_tables.sql:
--   psql -U teivaka -d teivaka_db -f scripts/audit_rls_check.sql
--
-- Purpose:
--   1. List every tenant.* table that lacks ENABLE or FORCE row level security.
--   2. Resolve the auth-path question: does applying FORCE risk locking out the
--      pre-tenant-context auth lookup on tenant.users? That depends on (a) which
--      role the app connects as, (b) whether that role owns the tables or has
--      BYPASSRLS, and (c) whether tenant.users carries a policy that permits the
--      login lookup. The queries below surface all three so the FORCE step can be
--      applied with confidence instead of blind.
--
-- Reading the output:
--   * If section 1 returns rows  -> those tables are isolation gaps to FORCE.
--   * If the app role is NOT a table owner and has rolbypassrls = false, then
--     ENABLE already constrains it and FORCE only adds owner-side enforcement —
--     safe, provided tenant.users has a permissive SELECT policy for auth (sec 4).
--   * If the app role IS a table owner (sec 3) and auth currently works only via
--     owner bypass, FORCE WILL break login — add a SECURITY DEFINER auth-lookup
--     function or a permissive policy on tenant.users FIRST.

\echo '=== 1. tenant.* tables missing ENABLE or FORCE row level security ==='
SELECT c.relname AS table_name,
       c.relrowsecurity   AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       pg_get_userbyid(c.relowner) AS owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'tenant'
  AND c.relkind = 'r'
  AND (c.relrowsecurity = false OR c.relforcerowsecurity = false)
ORDER BY c.relrowsecurity, c.relforcerowsecurity, c.relname;

\echo ''
\echo '=== 2. count summary ==='
SELECT
  count(*) FILTER (WHERE relrowsecurity)                            AS enabled,
  count(*) FILTER (WHERE relrowsecurity AND relforcerowsecurity)    AS forced,
  count(*) FILTER (WHERE NOT relrowsecurity)                        AS no_rls,
  count(*)                                                          AS total_tables
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'tenant' AND c.relkind = 'r';

\echo ''
\echo '=== 3. roles: who owns tenant.* and who can BYPASS RLS ==='
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname IN (
  SELECT DISTINCT pg_get_userbyid(c.relowner)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'tenant' AND c.relkind = 'r'
)
   OR rolname IN ('teivaka', 'teivaka_app', current_user)
ORDER BY rolbypassrls DESC, rolsuper DESC, rolname;

\echo ''
\echo '=== 4. policies on tenant.users (the pre-context auth lookup target) ==='
SELECT polname,
       CASE polcmd WHEN '*' THEN 'ALL' WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                   WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' END AS command,
       pg_get_expr(polqual, polrelid)      AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS with_check_expr
FROM pg_policy
WHERE polrelid = 'tenant.users'::regclass
ORDER BY polname;

\echo ''
\echo '=== 5. the role THIS connection is using ==='
SELECT current_user AS connected_as,
       (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS can_bypass_rls;
