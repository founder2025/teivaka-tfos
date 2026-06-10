-- COMMUNITY GRANT SWEEP — ends the "permission denied for table X" class of
-- feed/profile/chat 500s in one shot. Idempotent; safe to re-run any time.
--
-- Cause: runbooks partially applied left some community.* tables owned by
-- teivaka with no grants for the app role (teivaka_app). Any query touching an
-- ungranted table dies with InsufficientPrivilege. This sweeps EVERY existing
-- table in community.*, and sets DEFAULT PRIVILEGES so tables created by
-- future migrations are granted automatically — no future runbook can miss it.
--
-- Run:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/fix_community_grants_sweep.sql

GRANT USAGE ON SCHEMA community TO teivaka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA community TO teivaka_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA community TO teivaka_app;
ALTER DEFAULT PRIVILEGES FOR ROLE teivaka IN SCHEMA community
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO teivaka_app;
ALTER DEFAULT PRIVILEGES FOR ROLE teivaka IN SCHEMA community
  GRANT USAGE, SELECT ON SEQUENCES TO teivaka_app;

-- Profile "Records logged" reads the audit ledger count (read-only).
GRANT USAGE ON SCHEMA audit TO teivaka_app;
GRANT SELECT ON audit.events TO teivaka_app;

-- VERIFICATION (prints a row per community table with has_select = t).
-- Any 'f' row would be the next culprit — there should be none.
SELECT c.relname AS table_name,
       has_table_privilege('teivaka_app', c.oid, 'SELECT') AS has_select,
       has_table_privilege('teivaka_app', c.oid, 'INSERT') AS has_insert
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'community' AND c.relkind = 'r'
ORDER BY c.relname;
