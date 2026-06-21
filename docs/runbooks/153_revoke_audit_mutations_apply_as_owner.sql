-- 153 revoke audit.events UPDATE/DELETE from teivaka_app — apply-as-owner DDL (Strike #123)
-- Sacred-chain defense-in-depth: finish the REVOKE that migration 023 left commented out.
-- Run as the OWNER role, then alembic stamp:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/153_revoke_audit_mutations_apply_as_owner.sql
--   docker exec teivaka_api alembic stamp 153_revoke_audit_mutations
--   docker exec teivaka_api alembic current   -- -> 153_revoke_audit_mutations (head)
-- Mirrors 11_application_code/alembic/versions/153_revoke_audit_mutations.py upgrade().
-- Idempotent: revoking a privilege not held is a no-op.

REVOKE UPDATE, DELETE ON audit.events FROM teivaka_app;
