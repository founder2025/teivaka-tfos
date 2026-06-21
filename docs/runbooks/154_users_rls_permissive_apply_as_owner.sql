-- 154 codify permissive tenant.users RLS policy — apply-as-owner DDL (Strike #123)
-- DR/source-drift fix: source defines the STRICT policy; live prod is permissive-on-NULL.
--
-- PROD IS ALREADY CORRECT (permissive). On prod do NOT run the DDL below — it would
-- momentarily drop the live auth policy. Prod path is STAMP-ONLY after verifying the
-- live policy matches:
--   docker exec teivaka_api alembic stamp 154_users_rls_permissive
--
-- This file is for GREENFIELD / DR-rebuild (and reference). On a from-scratch chain,
-- 015c creates the strict policy and migration 154 replaces it with the permissive
-- one. Run as the OWNER role on a throwaway/rebuild DB only:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/154_users_rls_permissive_apply_as_owner.sql
-- Mirrors 11_application_code/alembic/versions/154_users_rls_permissive.py upgrade().

DROP POLICY IF EXISTS users_tenant_isolation ON tenant.users;

CREATE POLICY users_tenant_isolation ON tenant.users
    USING (
        current_setting('app.tenant_id', true) IS NULL
        OR current_setting('app.tenant_id', true) = ''
        OR tenant_id::text = current_setting('app.tenant_id', true)
    );
