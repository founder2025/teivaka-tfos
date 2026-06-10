"""095 - Profile completeness: cover photo + unit/money preferences

Adds to tenant.users:
  - cover_url       : profile banner image
  - unit_mode       : 'country' | 'choice' | 'universal' (Money & units setting)
  - pref_currency / pref_weight / pref_area / pref_temp : per-field unit choices

tenant.users is owned by teivaka (base schema) -> apply-as-owner (Strike #123):
  docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/095_profile_prefs_apply_as_owner.sql
  docker exec teivaka_api alembic stamp 095_profile_prefs
One statement per op.execute (Strike #72).
"""
from alembic import op

revision = "095_profile_prefs"
down_revision = "094_community_interactions"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        "ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS cover_url TEXT",
        "ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS unit_mode TEXT NOT NULL DEFAULT 'country'",
        "ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS pref_currency TEXT",
        "ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS pref_weight TEXT",
        "ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS pref_area TEXT",
        "ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS pref_temp TEXT",
    ])


def downgrade():
    _exec_each([
        "ALTER TABLE tenant.users DROP COLUMN IF EXISTS pref_temp",
        "ALTER TABLE tenant.users DROP COLUMN IF EXISTS pref_area",
        "ALTER TABLE tenant.users DROP COLUMN IF EXISTS pref_weight",
        "ALTER TABLE tenant.users DROP COLUMN IF EXISTS pref_currency",
        "ALTER TABLE tenant.users DROP COLUMN IF EXISTS unit_mode",
        "ALTER TABLE tenant.users DROP COLUMN IF EXISTS cover_url",
    ])
