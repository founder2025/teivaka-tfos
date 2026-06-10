"""093 - Profile fields: bio, avatar_url, field_visibility

Revision ID: 093_profile_fields
Revises: 092_push_subscriptions
Create Date: 2026-06-10

Adds editable profile fields + per-field visibility to tenant.users for the social
profile page. tenant.* edit → apply-as-owner runbook (Strike #123). One statement per
op.execute (Strike #72).
"""
from alembic import op

revision = "093_profile_fields"
down_revision = "092_push_subscriptions"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        "ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS bio TEXT",
        "ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS avatar_url TEXT",
        "ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS field_visibility JSONB NOT NULL DEFAULT '{}'::jsonb",
    ])


def downgrade():
    _exec_each([
        "ALTER TABLE tenant.users DROP COLUMN IF EXISTS field_visibility",
        "ALTER TABLE tenant.users DROP COLUMN IF EXISTS avatar_url",
        "ALTER TABLE tenant.users DROP COLUMN IF EXISTS bio",
    ])
