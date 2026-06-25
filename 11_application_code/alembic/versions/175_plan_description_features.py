"""175 — make subscription cards fully admin-editable: description + bullet copy

The farmer pricing cards (/me/subscription) showed a hardcoded subtitle and a
hardcoded feature-bullet list (frontend TIER_CARDS) — neither was admin-editable
and they didn't even come from the DB. This makes EVERYTHING on the card live:
adds community.subscription_plans.description (the outcome subtitle) and rewrites
`features` into human-readable bullet strings (display-only — verified no gating
logic reads them). After this, the admin Monetization editor controls title,
subtitle, price, limits, badge, and the full bullet list — add/remove/reword,
no deploy.

Additive/idempotent; reversible. Apply as owner (Strike #123).

Revision ID: 175_plan_description_features
Revises: 174_sponsor_portal
"""
from alembic import op
import sqlalchemy as sa

revision = "175_plan_description_features"
down_revision = "174_sponsor_portal"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    has = conn.execute(sa.text(
        "SELECT to_regclass('community.subscription_plans') IS NOT NULL")).scalar()
    if not has:
        return
    conn.execute(sa.text(
        "ALTER TABLE community.subscription_plans ADD COLUMN IF NOT EXISTS description TEXT"))

    conn.execute(sa.text("""
        UPDATE community.subscription_plans SET
            description = 'One farm · essentials · try the platform',
            features = '["Unlimited records","Verification & public verify link","Community & marketplace","Classroom & Trust Score","TIS chat (50/month)"]'::jsonb
         WHERE tier = 'FREE'
    """))
    conn.execute(sa.text("""
        UPDATE community.subscription_plans SET
            description = 'Every serious farmer',
            features = '["Everything in Free","5 farms + 20 team seats","Advanced reports + Loan Readiness Pack","Buyer matching + inventory","TIS 500/month"]'::jsonb
         WHERE tier = 'BASIC'
    """))
    conn.execute(sa.text("""
        UPDATE community.subscription_plans SET
            description = 'Commercial growers, managers, contractors',
            features = '["Everything in Pro","25 farms + 100 users","Forecasting + cashflow planning","Automation + branded reports","TIS 5,000/month + priority support"]'::jsonb
         WHERE tier = 'PROFESSIONAL'
    """))


def downgrade():
    conn = op.get_bind()
    has = conn.execute(sa.text(
        "SELECT to_regclass('community.subscription_plans') IS NOT NULL")).scalar()
    if not has:
        return
    conn.execute(sa.text(
        "ALTER TABLE community.subscription_plans DROP COLUMN IF EXISTS description"))
