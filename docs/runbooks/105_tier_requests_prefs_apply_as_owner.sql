-- 105 tier requests + notification prefs — apply-as-owner (Strike #123). Idempotent.
-- GENERATED from alembic/versions/105_tier_requests_prefs.py STATEMENTS — keep in sync.

CREATE TABLE IF NOT EXISTS community.tier_change_requests (
        request_id   TEXT PRIMARY KEY,
        tenant_id    UUID NOT NULL,
        user_id      UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        current_tier TEXT NOT NULL,
        target_tier  TEXT NOT NULL,
        billing_period TEXT NOT NULL DEFAULT 'MONTHLY',
        payment_method TEXT,
        notes        TEXT,
        status       TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
        reason       TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        decided_at   TIMESTAMPTZ,
        decided_by   UUID
    );
CREATE INDEX IF NOT EXISTS idx_tier_requests_status ON community.tier_change_requests(status, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON community.tier_change_requests TO teivaka_app;
ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS notify_whatsapp BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS notify_tasks BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS notify_weather BOOLEAN NOT NULL DEFAULT true;

-- verify
SELECT (to_regclass('community.tier_change_requests') IS NOT NULL)::int + (SELECT count(*) FROM information_schema.columns WHERE table_schema='tenant' AND table_name='users' AND column_name IN ('notify_whatsapp','notify_tasks','notify_weather'))::int AS objects_4;
