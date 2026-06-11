-- 111 consent ledger — apply-as-owner (Strike #123). Idempotent.
-- GENERATED from alembic/versions/111_consent_ledger.py STATEMENTS — keep in sync.

ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS aggregate_consent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS aggregate_consent_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS community.consent_events (
        event_id     BIGSERIAL PRIMARY KEY,
        user_id      UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        consent_type TEXT NOT NULL DEFAULT 'AGGREGATE',  -- AGGREGATE (external sharing); room for more
        granted      BOOLEAN NOT NULL,
        source       TEXT NOT NULL DEFAULT 'SELF',        -- SELF | ONBOARDING | ADMIN
        ts           TIMESTAMPTZ NOT NULL DEFAULT now()
    );
CREATE INDEX IF NOT EXISTS idx_consent_events_user ON community.consent_events(user_id, ts DESC);
GRANT SELECT, INSERT ON community.consent_events TO teivaka_app;
GRANT USAGE, SELECT ON SEQUENCE community.consent_events_event_id_seq TO teivaka_app;

-- verify
SELECT (to_regclass('community.consent_events') IS NOT NULL)::int + (SELECT count(*) FROM information_schema.columns WHERE table_schema='tenant' AND table_name='users' AND column_name='aggregate_consent')::int AS objects_2;
