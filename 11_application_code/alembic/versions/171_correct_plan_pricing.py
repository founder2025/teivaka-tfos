"""171 — correct subscription_plans seed to the ratified monetization strategy

Migration 170 seeded community.subscription_plans from the STALE in-code
TIER_DEFINITIONS dict ($49 / $149 / $399), which contradicts the canonical
Operator-ratified pricing in TEIVAKA_Monetization_Strategy.md (2026-06-15):

    Free Farmer   — free
    Teivaka Pro   — FJD $15/mo  ($150/yr)
    Teivaka Business — FJD $49/mo ($490/yr)
    Enterprise    — from FJD $299/mo (custom; no fixed annual)

This UPDATEs the existing rows to the canonical prices + display names. We keep
the internal tier CODES (FREE/BASIC/PROFESSIONAL/ENTERPRISE) unchanged on
purpose — they are the PK joined by tenant.tenants.subscription_tier and a CHECK
constraint, so renaming the codes would churn every existing user row. Only the
farmer-visible `name` + prices change here. (Code rename is a separate, staged
data migration if ever wanted.)

AI metering (tis_daily_limit) is intentionally NOT touched: the doc specifies
per-MONTH prompt caps but the platform limiter counts per-DAY — converting the
unit is a logic change, deferred to its own decision.

Additive/idempotent UPDATE; reversible. Apply as owner (Strike #123).

Revision ID: 171_correct_plan_pricing
Revises: 170_monetization_admin
"""
from alembic import op
import sqlalchemy as sa

revision = "171_correct_plan_pricing"
down_revision = "170_monetization_admin"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    # Guard: only run if 170 created the table.
    has = conn.execute(sa.text(
        "SELECT to_regclass('community.subscription_plans') IS NOT NULL")).scalar()
    if not has:
        return

    # FREE — name/price already correct; re-assert for idempotence.
    conn.execute(sa.text("""
        UPDATE community.subscription_plans
           SET name='Free', price_fjd_monthly=0, price_fjd_annual=0,
               badge=NULL, sort_order=0, is_active=true
         WHERE tier='FREE'
    """))

    # BASIC code  → Teivaka Pro, FJD $15/mo, $150/yr (entry paid, volume tier).
    conn.execute(sa.text("""
        UPDATE community.subscription_plans
           SET name='Teivaka Pro', price_fjd_monthly=15, price_fjd_annual=150,
               badge='Most popular', sort_order=1, is_active=true
         WHERE tier='BASIC'
    """))

    # PROFESSIONAL code → Teivaka Business, FJD $49/mo, $490/yr.
    conn.execute(sa.text("""
        UPDATE community.subscription_plans
           SET name='Teivaka Business', price_fjd_monthly=49, price_fjd_annual=490,
               badge=NULL, sort_order=2, is_active=true
         WHERE tier='PROFESSIONAL'
    """))

    # ENTERPRISE → from FJD $299/mo, custom (no fixed annual).
    conn.execute(sa.text("""
        UPDATE community.subscription_plans
           SET name='Enterprise', price_fjd_monthly=299, price_fjd_annual=NULL,
               badge=NULL, sort_order=3, is_active=true
         WHERE tier='ENTERPRISE'
    """))


def downgrade():
    conn = op.get_bind()
    has = conn.execute(sa.text(
        "SELECT to_regclass('community.subscription_plans') IS NOT NULL")).scalar()
    if not has:
        return
    # Revert to migration 170's seed values.
    conn.execute(sa.text("""
        UPDATE community.subscription_plans
           SET name='Basic', price_fjd_monthly=49, price_fjd_annual=490,
               badge=NULL, sort_order=1
         WHERE tier='BASIC'
    """))
    conn.execute(sa.text("""
        UPDATE community.subscription_plans
           SET name='Professional', price_fjd_monthly=149, price_fjd_annual=1490,
               badge='Most popular', sort_order=2
         WHERE tier='PROFESSIONAL'
    """))
    conn.execute(sa.text("""
        UPDATE community.subscription_plans
           SET name='Enterprise', price_fjd_monthly=399, price_fjd_annual=3990,
               badge=NULL, sort_order=3
         WHERE tier='ENTERPRISE'
    """))
