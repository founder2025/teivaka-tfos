-- 155 poultry_event_log.created_by FK -> tenant.users — apply-as-owner DDL (Strike #123)
-- Operator anchor was the only unconstrained anchor on the audit-bearing event table.
-- Pre-verified: 0 orphaned created_by on prod (ADD CONSTRAINT validates existing rows).
-- Run as the OWNER role, then alembic stamp:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/155_poultry_created_by_fk_apply_as_owner.sql
--   docker exec teivaka_api alembic stamp 155_poultry_created_by_fk
--   docker exec teivaka_api alembic current   -- -> 155_poultry_created_by_fk (head)
-- Mirrors 11_application_code/alembic/versions/155_poultry_created_by_fk.py upgrade().

ALTER TABLE tenant.poultry_event_log
    ADD CONSTRAINT poultry_event_log_created_by_fk
    FOREIGN KEY (created_by) REFERENCES tenant.users(user_id);
