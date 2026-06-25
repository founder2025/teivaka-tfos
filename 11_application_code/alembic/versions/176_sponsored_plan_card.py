"""176 — SPONSORED as an editable plan row (display-only, non-purchasable)

The SPONSORED card on /me/subscription was the last hardcoded one. Seed it as a
real community.subscription_plans row so its title/subtitle/price/features are
admin-editable like every other plan. It stays NON-purchasable: /upgrade rejects
it and the card shows "By sponsorship" (a farmer only gets it via a sponsor
code, which sets their tier to the funded plan — never to 'SPONSORED').

Additive/idempotent; reversible. Apply as owner (Strike #123).

Revision ID: 176_sponsored_plan_card
Revises: 175_plan_description_features
"""
from alembic import op
import sqlalchemy as sa

revision = "176_sponsored_plan_card"
down_revision = "175_plan_description_features"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    has = conn.execute(sa.text(
        "SELECT to_regclass('community.subscription_plans') IS NOT NULL")).scalar()
    if not has:
        return
    conn.execute(sa.text("""
        INSERT INTO community.subscription_plans
            (tier, name, description, price_fjd_monthly, price_fjd_annual,
             tis_daily_limit, tis_monthly_limit, farms_limit, users_limit,
             features, badge, sort_order, is_active)
        VALUES
            ('SPONSORED','Sponsored','Paid by your sponsor · ministry / NGO / bank',
             0, 0, 5, 50, 1, 2,
             '["Basic capability, no cost to you","The Bank Evidence document","Sponsor shown on your profile","Your data always stays yours"]'::jsonb,
             NULL, 9, true)
        ON CONFLICT (tier) DO NOTHING
    """))


def downgrade():
    conn = op.get_bind()
    has = conn.execute(sa.text(
        "SELECT to_regclass('community.subscription_plans') IS NOT NULL")).scalar()
    if not has:
        return
    conn.execute(sa.text("DELETE FROM community.subscription_plans WHERE tier = 'SPONSORED'"))
