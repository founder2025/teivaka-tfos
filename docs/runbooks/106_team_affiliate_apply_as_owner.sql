-- 106 team invites + affiliate — apply-as-owner (Strike #123). Idempotent.
-- GENERATED from alembic/versions/106_team_affiliate.py STATEMENTS — keep in sync.

CREATE TABLE IF NOT EXISTS community.team_invites (
        invite_id     TEXT PRIMARY KEY,
        tenant_id     UUID NOT NULL,
        invited_by    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        invitee_name  TEXT NOT NULL,
        invitee_phone TEXT NOT NULL,
        team_role     TEXT NOT NULL DEFAULT 'WORKER' CHECK (team_role IN ('WORKER','MANAGER','ACCOUNTANT','VIEWER')),
        farm_scope    TEXT NOT NULL DEFAULT 'ALL',
        scope_label   TEXT NOT NULL DEFAULT 'All farms',
        token         TEXT NOT NULL UNIQUE,
        status        TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','CANCELLED','EXPIRED')),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
        accepted_at   TIMESTAMPTZ,
        accepted_user_id UUID
    );
CREATE INDEX IF NOT EXISTS idx_team_invites_tenant ON community.team_invites(tenant_id, status);
ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS team_role TEXT;
ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS farm_scope TEXT;
CREATE TABLE IF NOT EXISTS community.affiliates (
        user_id     UUID PRIMARY KEY REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','PENDING','REJECTED')),
        override_pct NUMERIC(5,2),
        enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
CREATE TABLE IF NOT EXISTS community.affiliate_commissions (
        commission_id     TEXT PRIMARY KEY,
        affiliate_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        referee_user_id   UUID NOT NULL,
        referee_name      TEXT NOT NULL DEFAULT '',
        tier              TEXT NOT NULL,
        pct               NUMERIC(5,2) NOT NULL,
        revenue_fjd       NUMERIC(10,2) NOT NULL DEFAULT 0,
        amount_fjd        NUMERIC(10,2) NOT NULL DEFAULT 0,
        status            TEXT NOT NULL DEFAULT 'ACCRUED' CHECK (status IN ('ACCRUED','PAID')),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        paid_at           TIMESTAMPTZ
    );
CREATE INDEX IF NOT EXISTS idx_aff_comm_affiliate ON community.affiliate_commissions(affiliate_user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS community.affiliate_settings (
        id                   INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        enabled              BOOLEAN NOT NULL DEFAULT true,
        global_pct           NUMERIC(5,2) NOT NULL DEFAULT 10,
        referred_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 10,
        basis                TEXT NOT NULL DEFAULT 'ONE_OFF' CHECK (basis IN ('ONE_OFF','RECURRING')),
        payout_mode          TEXT NOT NULL DEFAULT 'CREDIT' CHECK (payout_mode IN ('CREDIT','CASH'))
    );
INSERT INTO community.affiliate_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.team_invites, community.affiliates, community.affiliate_commissions, community.affiliate_settings TO teivaka_app;

-- verify
SELECT (to_regclass('community.team_invites') IS NOT NULL)::int + (to_regclass('community.affiliates') IS NOT NULL)::int + (to_regclass('community.affiliate_commissions') IS NOT NULL)::int + (to_regclass('community.affiliate_settings') IS NOT NULL)::int + (SELECT count(*) FROM information_schema.columns WHERE table_schema='tenant' AND table_name='users' AND column_name IN ('team_role','farm_scope'))::int AS objects_6;
