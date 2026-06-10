-- 095 profile prefs: cover photo + unit/money preferences on tenant.users.
-- tenant.users is owned by teivaka -> apply-as-owner (Strike #123), then stamp:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/095_profile_prefs_apply_as_owner.sql
--   docker exec teivaka_api alembic stamp 095_profile_prefs
--   docker exec teivaka_api alembic current   -- -> 095_profile_prefs (head)

ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS unit_mode TEXT NOT NULL DEFAULT 'country';
ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS pref_currency TEXT;
ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS pref_weight TEXT;
ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS pref_area TEXT;
ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS pref_temp TEXT;
