-- 093 profile fields — apply-as-owner (Strike #123)
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/093_profile_fields_apply_as_owner.sql
--   docker exec teivaka_api alembic stamp 093_profile_fields && docker exec teivaka_api alembic current
ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS field_visibility JSONB NOT NULL DEFAULT '{}'::jsonb;
