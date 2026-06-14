"""142 - Multi-role: also_account_types + specialty on users

Revision ID: 142_user_multirole
Revises: 141_self_serve_ads
Create Date: 2026-06-14

People hold several roles (a farmer who also does transport or casual labour).
Keep account_type as the single PRIMARY identity (drives role/badge/surface —
untouched), and add:
  - also_account_types TEXT[]  — secondary "I also do…" general-category tags
  - specialty          TEXT    — free-text "what do you do" (e.g. Veterinarian)

Additive + low-risk: no change to the account_type CHECK; tags/specialty are
app-validated. tenant.* runs as owner (Strike #123). asyncpg: one statement per
op.execute (Strike #72).
"""
from alembic import op

revision = "142_user_multirole"
down_revision = "141_self_serve_ads"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        "ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS also_account_types TEXT[] NOT NULL DEFAULT '{}'",
        "ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS specialty TEXT",
        "CREATE INDEX IF NOT EXISTS idx_users_also_types ON tenant.users USING GIN (also_account_types)",
    ])


def downgrade():
    _exec_each([
        "DROP INDEX IF EXISTS tenant.idx_users_also_types",
        "ALTER TABLE tenant.users DROP COLUMN IF EXISTS specialty",
        "ALTER TABLE tenant.users DROP COLUMN IF EXISTS also_account_types",
    ])
