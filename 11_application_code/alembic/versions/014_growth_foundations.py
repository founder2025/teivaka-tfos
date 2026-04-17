"""014 - Growth foundations: referral, attribution, trial windows

Revision ID: 014_growth_foundations
Revises: 013_phone_otp
Create Date: 2026-04-15
"""
from alembic import op

revision = "014_growth_foundations"
down_revision = "013_phone_otp"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        # tenant.users columns (single ALTER, multiple ADD clauses = one statement)
        """
        ALTER TABLE tenant.users
            ADD COLUMN IF NOT EXISTS referral_code        VARCHAR(16),
            ADD COLUMN IF NOT EXISTS referred_by_user_id  UUID,
            ADD COLUMN IF NOT EXISTS referral_source      VARCHAR(32),
            ADD COLUMN IF NOT EXISTS referral_campaign    VARCHAR(64),
            ADD COLUMN IF NOT EXISTS trial_started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS trial_ends_at        TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days')
        """,
        """
        DO $$ BEGIN
            ALTER TABLE tenant.users
                ADD CONSTRAINT users_referral_code_key UNIQUE (referral_code);
        EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
        END $$
        """,
        """
        DO $$ BEGIN
            ALTER TABLE tenant.users
                ADD CONSTRAINT users_referred_by_fkey
                FOREIGN KEY (referred_by_user_id)
                REFERENCES tenant.users(user_id) ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
        """,
        "CREATE INDEX IF NOT EXISTS ix_users_referred_by   ON tenant.users (referred_by_user_id)",
        "CREATE INDEX IF NOT EXISTS ix_users_trial_ends_at ON tenant.users (trial_ends_at)",

        # shared.attribution_events
        """
        CREATE TABLE IF NOT EXISTS shared.attribution_events (
            event_id        BIGSERIAL PRIMARY KEY,
            occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            event_type      VARCHAR(48)  NOT NULL,
            user_id         UUID,
            anonymous_id    VARCHAR(64),
            source          VARCHAR(32),
            campaign        VARCHAR(64),
            medium          VARCHAR(32),
            referrer_url    TEXT,
            landing_path    TEXT,
            user_agent      TEXT,
            ip_hash         VARCHAR(64),
            properties      JSONB NOT NULL DEFAULT '{}'::jsonb
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_attr_events_user      ON shared.attribution_events (user_id)",
        "CREATE INDEX IF NOT EXISTS ix_attr_events_type_time ON shared.attribution_events (event_type, occurred_at DESC)",
        "CREATE INDEX IF NOT EXISTS ix_attr_events_campaign  ON shared.attribution_events (campaign)",

        # tenant.referral_rewards
        """
        CREATE TABLE IF NOT EXISTS tenant.referral_rewards (
            reward_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id        UUID NOT NULL,
            referrer_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            referee_user_id  UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            reward_type      VARCHAR(32) NOT NULL,
            reward_amount    NUMERIC(12,2),
            reward_currency  VARCHAR(8) DEFAULT 'FJD',
            status           VARCHAR(16) NOT NULL DEFAULT 'pending',
            granted_at       TIMESTAMPTZ,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
            CONSTRAINT referral_rewards_unique_pair UNIQUE (referrer_user_id, referee_user_id, reward_type)
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_referral_rewards_tenant   ON tenant.referral_rewards (tenant_id)",
        "CREATE INDEX IF NOT EXISTS ix_referral_rewards_referrer ON tenant.referral_rewards (referrer_user_id)",
        "CREATE INDEX IF NOT EXISTS ix_referral_rewards_status   ON tenant.referral_rewards (status)",
        "ALTER TABLE tenant.referral_rewards ENABLE ROW LEVEL SECURITY",
        """
        DO $$ BEGIN
            CREATE POLICY referral_rewards_tenant_isolation
                ON tenant.referral_rewards
                USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
        """,
    ])


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS tenant.referral_rewards",
        "DROP TABLE IF EXISTS shared.attribution_events",
        "DROP INDEX IF EXISTS tenant.ix_users_trial_ends_at",
        "DROP INDEX IF EXISTS tenant.ix_users_referred_by",
        """
        ALTER TABLE tenant.users
            DROP CONSTRAINT IF EXISTS users_referred_by_fkey,
            DROP CONSTRAINT IF EXISTS users_referral_code_key,
            DROP COLUMN IF EXISTS trial_ends_at,
            DROP COLUMN IF EXISTS trial_started_at,
            DROP COLUMN IF EXISTS referral_campaign,
            DROP COLUMN IF EXISTS referral_source,
            DROP COLUMN IF EXISTS referred_by_user_id,
            DROP COLUMN IF EXISTS referral_code
        """,
    ])
