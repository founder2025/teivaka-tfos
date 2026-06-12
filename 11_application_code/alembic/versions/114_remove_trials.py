"""114 - Remove free trials

The platform is moving to open access: new users are full members with no
14-day trial window. Migration 014 created trial_started_at / trial_ends_at
as NOT NULL DEFAULT (NOW() / NOW()+14d), so the DB would keep minting trials
even if the app stopped writing them. This migration:

  - drops the DEFAULT and NOT NULL on both columns so the app can leave them
    NULL (no trial), and
  - clears existing trial windows so current users also lose the trial state.

The columns + index are intentionally LEFT IN PLACE (nullable) rather than
dropped — trials may return later as a subscription concept, and keeping the
columns avoids a destructive drop. One statement per op.execute() (asyncpg
rejects multi-statement DDL — Strike #72).
"""
from alembic import op

revision = "114_remove_trials"
down_revision = "113_external_feeds"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        "ALTER TABLE tenant.users ALTER COLUMN trial_started_at DROP DEFAULT",
        "ALTER TABLE tenant.users ALTER COLUMN trial_started_at DROP NOT NULL",
        "ALTER TABLE tenant.users ALTER COLUMN trial_ends_at DROP DEFAULT",
        "ALTER TABLE tenant.users ALTER COLUMN trial_ends_at DROP NOT NULL",
        "UPDATE tenant.users SET trial_started_at = NULL, trial_ends_at = NULL",
    ])


def downgrade():
    # Best-effort restore of the trial window for users that have none.
    _exec_each([
        "UPDATE tenant.users SET trial_started_at = NOW() WHERE trial_started_at IS NULL",
        "UPDATE tenant.users SET trial_ends_at = NOW() + INTERVAL '14 days' WHERE trial_ends_at IS NULL",
        "ALTER TABLE tenant.users ALTER COLUMN trial_started_at SET DEFAULT NOW()",
        "ALTER TABLE tenant.users ALTER COLUMN trial_started_at SET NOT NULL",
        "ALTER TABLE tenant.users ALTER COLUMN trial_ends_at SET DEFAULT (NOW() + INTERVAL '14 days')",
        "ALTER TABLE tenant.users ALTER COLUMN trial_ends_at SET NOT NULL",
    ])
