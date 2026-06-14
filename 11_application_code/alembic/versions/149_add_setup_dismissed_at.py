"""149 - Add tenant.users.setup_dismissed_at for the in-platform setup widget

Revision ID: 149_add_setup_dismissed_at
Revises: 148_grant_attribution_update
Create Date: 2026-06-14

Slice 1 of the onboarding-wall replacement. The blocking 7-step wall is retired;
new users land inside the platform and complete setup at their own pace via a
non-blocking welcome card + "Getting started" checklist. Checklist done-states
are DERIVED from real records (no progress table). This single nullable flag is
the only new state: it records when a user dismisses the setup widget so a
finished user never sees it again. Kept SEPARATE from onboarded_at (which was the
old wall-gate signal) — do not overload.

Per-user (not per-tenant): the welcome/checklist is a user experience and several
items (name, photo, whatsapp) are user-level. teivaka_app already holds UPDATE on
tenant.users (verified pre-build, B73), so no GRANT is needed.

asyncpg: one statement per op.execute (Strike #72). Applied as owner (Strike #123).
"""
from alembic import op

revision = "149_add_setup_dismissed_at"
down_revision = "148_grant_attribution_update"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        "ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS setup_dismissed_at TIMESTAMPTZ",
    ])


def downgrade():
    _exec_each([
        "ALTER TABLE tenant.users DROP COLUMN IF EXISTS setup_dismissed_at",
    ])
