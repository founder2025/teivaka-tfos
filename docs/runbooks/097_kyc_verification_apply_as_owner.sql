-- 097 KYC verification — apply-as-owner (Strike #123), then stamp:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/097_kyc_verification_apply_as_owner.sql
--   docker exec teivaka_api alembic stamp 097_kyc_verification
--   docker exec teivaka_api alembic current   -- -> 097_kyc_verification (head)
--
-- Green tick = KYC-verified (government ID + selfie, admin-reviewed) — a
-- separate, stronger claim than email_verified (which keeps gating posting).
-- Files live in a PRIVATE dir served only via an admin-gated endpoint.

ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS kyc_verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS community.verification_requests (
    request_id   TEXT PRIMARY KEY,
    tenant_id    UUID,
    user_id      UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    id_doc_path  TEXT NOT NULL,
    selfie_path  TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    note         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at  TIMESTAMPTZ,
    reviewed_by  UUID
);
CREATE INDEX IF NOT EXISTS idx_verif_status ON community.verification_requests(status, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON community.verification_requests TO teivaka_app;

-- verify
SELECT to_regclass('community.verification_requests') AS verification_requests,
       (SELECT count(*) FROM information_schema.columns
        WHERE table_schema='tenant' AND table_name='users' AND column_name='kyc_verified') AS kyc_col;
