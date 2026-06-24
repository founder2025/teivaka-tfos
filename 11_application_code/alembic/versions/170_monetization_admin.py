"""170 — admin-editable monetization: subscription_plans + discount_codes

Moves plan pricing OUT of the hardcoded Python TIER_DEFINITIONS dict and into a
runtime-editable table so the Operator + team can change prices/limits/features
from Admin Settings with no deploy. Adds a general discount-code system.

Both tables are PLATFORM-GLOBAL (not per-tenant), so they live in `community.*`
(runtime-writable, admin-gated) — mirroring community.affiliate_settings. NOT in
shared.* (read-only at runtime per Inviolable #7).

Seeds the four current tiers from the existing TIER_DEFINITIONS so behaviour is
identical on day one; prices become editable thereafter. Additive + reversible.
Apply as owner (Strike #123).

Revision ID: 170_monetization_admin
Revises: 169_push_devices
"""
from alembic import op
import sqlalchemy as sa

revision = "170_monetization_admin"
down_revision = "169_push_devices"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # ── subscription_plans — single source of truth for tier pricing ──────────
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS community.subscription_plans (
            tier              TEXT PRIMARY KEY,
            name              TEXT NOT NULL,
            price_fjd_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
            price_fjd_annual  NUMERIC(10,2),
            tis_daily_limit   INTEGER NOT NULL DEFAULT 5,
            farms_limit       INTEGER NOT NULL DEFAULT 1,
            users_limit       INTEGER NOT NULL DEFAULT 2,
            features          JSONB   NOT NULL DEFAULT '[]'::jsonb,
            badge             TEXT,
            sort_order        INTEGER NOT NULL DEFAULT 0,
            is_active         BOOLEAN NOT NULL DEFAULT true,
            updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by        UUID
        )
    """))

    # Seed from the current TIER_DEFINITIONS (idempotent). annual = ~10 months
    # (2 free) as a sensible editable default; the Operator can change any field.
    conn.execute(sa.text("""
        INSERT INTO community.subscription_plans
            (tier, name, price_fjd_monthly, price_fjd_annual, tis_daily_limit,
             farms_limit, users_limit, features, badge, sort_order, is_active)
        VALUES
            ('FREE','Free',0,0,5,1,2,
             '["basic_tracking","tis_chat","weather_log"]'::jsonb, NULL, 0, true),
            ('BASIC','Basic',49,490,25,2,5,
             '["basic_tracking","tis_chat","weather_log","community_listings","financials","rotation_planner"]'::jsonb, NULL, 1, true),
            ('PROFESSIONAL','Professional',149,1490,100,10,20,
             '["all_basic","voice_query","livestock","apiculture","profit_share","nursery","exports","decision_engine"]'::jsonb, 'Most popular', 2, true),
            ('ENTERPRISE','Enterprise',399,3990,500,-1,-1,
             '["all_professional","custom_reports","api_access","dedicated_support","multi_island"]'::jsonb, NULL, 3, true)
        ON CONFLICT (tier) DO NOTHING
    """))

    # ── discount_codes — general promo/coupon system ─────────────────────────
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS community.discount_codes (
            code        TEXT PRIMARY KEY,
            kind        TEXT NOT NULL DEFAULT 'PERCENT' CHECK (kind IN ('PERCENT','FLAT')),
            value       NUMERIC(10,2) NOT NULL DEFAULT 0,
            applies_to  TEXT[] NOT NULL DEFAULT '{}',   -- empty = all tiers
            max_uses    INTEGER,                        -- NULL = unlimited
            used_count  INTEGER NOT NULL DEFAULT 0,
            starts_at   TIMESTAMPTZ,
            expires_at  TIMESTAMPTZ,
            is_active   BOOLEAN NOT NULL DEFAULT true,
            note        TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_by  UUID
        )
    """))

    # Grants (idempotent) — admin writes go through the app role, mirroring
    # community.affiliate_settings.
    conn.execute(sa.text("""
        DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON community.subscription_plans TO teivaka_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON community.discount_codes     TO teivaka_app;
        END IF; END $$
    """))


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS community.discount_codes"))
    conn.execute(sa.text("DROP TABLE IF EXISTS community.subscription_plans"))
