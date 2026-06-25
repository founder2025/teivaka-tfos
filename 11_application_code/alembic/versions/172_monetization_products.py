"""172 — Hormozi monetization restructure: farmer plans + multi-product catalog

Operator-ratified pivot (2026-06-25): Teivaka stops pricing features and starts
pricing OUTCOMES across a multi-sided platform — farmers are DISTRIBUTION,
institutions are MONETIZATION. Two structural changes:

1. FARMER PLANS (entitlement-gated, live) corrected to the new model. Internal
   tier CODES kept stable (PK joined by tenant.tenants.subscription_tier + CHECK)
   — only farmer-visible name/price/limits change:
     FREE         → Free            (FJD 0    · 1 farm  · 2 users · TIS 50/mo)
     BASIC        → Farm Pro        (FJD 19/mo · 180/yr · 5 farms · 20 users · TIS 500/mo)
     PROFESSIONAL → Farm Business   (FJD 69/mo · 690/yr · 25 farms · 100 users · TIS 5000/mo)
     ENTERPRISE   → DEACTIVATED (no Enterprise on the farmer side; that's now
                    institutional Verified/Intelligence territory)
   Adds tis_monthly_limit (the spec is monthly). The live limiter still counts
   per-DAY (over-delivers vs these caps) until a dedicated daily→monthly slice.

2. PRODUCT CATALOG — the institutional/other revenue lines as an admin-editable
   catalog (community.product_catalog): Sponsored Farmers, Teivaka Verified,
   Teivaka Intelligence, Market Access, Compliance & Traceability, Academy,
   Advertising. This is the CATALOG + config layer; institutional billing/login
   is NOT wired yet (no payment rail, no institution accounts) — honestly a
   sales/management surface, not a checkout.

Additive/idempotent; reversible. Apply as owner (Strike #123).

Revision ID: 172_monetization_products
Revises: 171_correct_plan_pricing
"""
from alembic import op
import sqlalchemy as sa

revision = "172_monetization_products"
down_revision = "171_correct_plan_pricing"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # ── 1. Farmer plans → new model ──────────────────────────────────────────
    has_plans = conn.execute(sa.text(
        "SELECT to_regclass('community.subscription_plans') IS NOT NULL")).scalar()
    if has_plans:
        conn.execute(sa.text(
            "ALTER TABLE community.subscription_plans "
            "ADD COLUMN IF NOT EXISTS tis_monthly_limit INTEGER"))

        conn.execute(sa.text("""
            UPDATE community.subscription_plans SET
                name='Free', price_fjd_monthly=0, price_fjd_annual=0,
                tis_daily_limit=5, tis_monthly_limit=50, farms_limit=1, users_limit=2,
                badge=NULL, sort_order=0, is_active=true,
                features='["unlimited_records","verification","community","marketplace","classroom","trust_score","basic_tis","basic_reports","offline"]'::jsonb
             WHERE tier='FREE'
        """))
        conn.execute(sa.text("""
            UPDATE community.subscription_plans SET
                name='Farm Pro', price_fjd_monthly=19, price_fjd_annual=180,
                tis_daily_limit=50, tis_monthly_limit=500, farms_limit=5, users_limit=20,
                badge='Most popular', sort_order=1, is_active=true,
                features='["everything_in_free","advanced_reports","loan_readiness_pack","buyer_matching","inventory","labour_management","season_analytics"]'::jsonb
             WHERE tier='BASIC'
        """))
        conn.execute(sa.text("""
            UPDATE community.subscription_plans SET
                name='Farm Business', price_fjd_monthly=69, price_fjd_annual=690,
                tis_daily_limit=500, tis_monthly_limit=5000, farms_limit=25, users_limit=100,
                badge=NULL, sort_order=2, is_active=true,
                features='["everything_in_pro","forecasting","cashflow_planning","automation","advanced_dashboards","branded_reports","priority_support","advanced_verification"]'::jsonb
             WHERE tier='PROFESSIONAL'
        """))
        # No Enterprise on the farmer side anymore.
        conn.execute(sa.text(
            "UPDATE community.subscription_plans SET is_active=false WHERE tier='ENTERPRISE'"))

    # ── 2. Product catalog (institutional + other revenue lines) ─────────────
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS community.product_catalog (
            id                TEXT PRIMARY KEY,
            product           TEXT NOT NULL,           -- product family (e.g. VERIFIED)
            name              TEXT NOT NULL,           -- display plan name
            audience          TEXT,                    -- who it's sold to
            price_fjd_monthly NUMERIC(12,2),
            price_fjd_annual  NUMERIC(12,2),
            price_note        TEXT,                    -- "from", "per certificate", "by scale"
            features          JSONB NOT NULL DEFAULT '[]'::jsonb,
            sort_order        INTEGER NOT NULL DEFAULT 0,
            is_active         BOOLEAN NOT NULL DEFAULT true,
            updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by        UUID
        )
    """))

    conn.execute(sa.text("""
        INSERT INTO community.product_catalog
            (id, product, name, audience, price_fjd_monthly, price_note, features, sort_order)
        VALUES
            ('SPONSORED_SEAT','SPONSORED','Sponsored Farmer Seat',
             'Banks, Government, NGOs, Development Partners', 10, 'per farmer / month',
             '["Org sponsors farmer access","Impact dashboard","Training","Reporting"]'::jsonb, 10),

            ('VERIFIED_STARTER','VERIFIED','Verified — Starter',
             'Banks, Exporters, Insurers, Buyers, Processors', 500, NULL,
             '["Verified Farmer Network access","Basic search","Verification lookups"]'::jsonb, 20),
            ('VERIFIED_PRO','VERIFIED','Verified — Professional',
             'Banks, Exporters, Insurers, Buyers, Processors', 2500, NULL,
             '["Advanced search","Verified supplier discovery","Portfolio monitoring","Risk dashboard","Buyer matching"]'::jsonb, 21),
            ('VERIFIED_ENTERPRISE','VERIFIED','Verified — Enterprise',
             'Banks, Exporters, Insurers, Buyers, Processors', 10000, 'from',
             '["Custom integrations","API","Bulk verification","Compliance tools"]'::jsonb, 22),

            ('INTEL_REGIONAL','INTELLIGENCE','Intelligence — Regional Dashboard',
             'Government, NGOs, Development Partners, Research', 2000, NULL,
             '["Regional production analytics","Program tracking"]'::jsonb, 30),
            ('INTEL_NATIONAL','INTELLIGENCE','Intelligence — National Dashboard',
             'Government, NGOs, Development Partners, Research', 10000, NULL,
             '["National dashboard","Production analytics","Impact reporting"]'::jsonb, 31),
            ('INTEL_CUSTOM','INTELLIGENCE','Intelligence — Custom Analytics',
             'Government, NGOs, Development Partners, Research', 25000, 'from · per project',
             '["Bespoke analytics","Custom reports"]'::jsonb, 32),

            ('MARKET_BUYER','MARKET_ACCESS','Market Access — Buyer Subscription',
             'Exporters, Buyers, Processors', 500, NULL,
             '["Browse verified produce","Place orders"]'::jsonb, 40),
            ('MARKET_SUPPLIER','MARKET_ACCESS','Market Access — Verified Supplier Discovery',
             'Exporters, Buyers, Processors', 1500, NULL,
             '["Verified supplier discovery","Sourcing tools"]'::jsonb, 41),
            ('MARKET_PREFERRED','MARKET_ACCESS','Market Access — Preferred Buyer Status',
             'Exporters, Buyers, Processors', 3000, NULL,
             '["Preferred buyer placement","Priority matching"]'::jsonb, 42),

            ('COMPLIANCE_BASE','COMPLIANCE','Compliance & Traceability',
             'Exporters, Processors, Governments', 1000, 'FJD 1,000–20,000 / mo by scale',
             '["End-to-end traceability","Compliance reporting","Audit-ready records"]'::jsonb, 50),

            ('ACADEMY_REVSHARE','ACADEMY','Academy — Course Revenue Share',
             'Instructors & learners', NULL, '30% platform / 70% instructor',
             '["Course marketplace","Instructor payouts"]'::jsonb, 60),
            ('ACADEMY_CERT','ACADEMY','Academy — Certification',
             'Learners', 20, 'per certificate',
             '["Verifiable certificate"]'::jsonb, 61),

            ('AD_STARTER','ADVERTISING','Advertising — Starter',
             'Ag suppliers, banks, insurers, exporters', 99, NULL,
             '["Sponsored listing"]'::jsonb, 70),
            ('AD_GROWTH','ADVERTISING','Advertising — Growth',
             'Ag suppliers, banks, insurers, exporters', 299, NULL,
             '["Sponsored listing","Higher placement"]'::jsonb, 71),
            ('AD_PREMIUM','ADVERTISING','Advertising — Premium',
             'Ag suppliers, banks, insurers, exporters', 999, NULL,
             '["Premium placement","Campaign analytics"]'::jsonb, 72)
        ON CONFLICT (id) DO NOTHING
    """))

    conn.execute(sa.text("""
        DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON community.product_catalog TO teivaka_app;
        END IF; END $$
    """))


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS community.product_catalog"))
    has_plans = conn.execute(sa.text(
        "SELECT to_regclass('community.subscription_plans') IS NOT NULL")).scalar()
    if has_plans:
        # Restore migration 171's farmer plan values + reactivate Enterprise.
        conn.execute(sa.text("""
            UPDATE community.subscription_plans SET
                name='Teivaka Pro', price_fjd_monthly=15, price_fjd_annual=150,
                tis_daily_limit=25, farms_limit=2, users_limit=5, badge='Most popular',
                sort_order=1, is_active=true
             WHERE tier='BASIC'
        """))
        conn.execute(sa.text("""
            UPDATE community.subscription_plans SET
                name='Teivaka Business', price_fjd_monthly=49, price_fjd_annual=490,
                tis_daily_limit=100, farms_limit=10, users_limit=20, badge=NULL,
                sort_order=2, is_active=true
             WHERE tier='PROFESSIONAL'
        """))
        conn.execute(sa.text(
            "UPDATE community.subscription_plans SET is_active=true WHERE tier='ENTERPRISE'"))
        conn.execute(sa.text(
            "ALTER TABLE community.subscription_plans DROP COLUMN IF EXISTS tis_monthly_limit"))
