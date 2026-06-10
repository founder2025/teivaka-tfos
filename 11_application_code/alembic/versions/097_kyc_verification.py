"""097 - KYC verification: requests table + users.kyc_verified (the green tick)

community.verification_requests follows the community-schema pattern (cross-
tenant, no RLS — same as feed/chat) because the admin review queue is
inherently cross-tenant. PII protection is structural instead: the ID/selfie
FILES live in a private directory served ONLY via an admin-gated endpoint
(never the public uploads route), the table is granted to the app role only,
and every endpoint is own-request or admin-gated (Operator-approved design,
2026-06-11).

tenant.users.kyc_verified is the platform-wide green tick — KYC-verified, a
separate (stronger) claim than email_verified, which keeps gating posting.
Apply-as-owner (Strike #123). One statement per op.execute (Strike #72).
"""
from alembic import op

revision = "097_kyc_verification"
down_revision = "096_stories"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        "ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS kyc_verified BOOLEAN NOT NULL DEFAULT FALSE",
        """
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
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_verif_status ON community.verification_requests(status, created_at)",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.verification_requests TO teivaka_app",
    ])


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS community.verification_requests",
        "ALTER TABLE tenant.users DROP COLUMN IF EXISTS kyc_verified",
    ])
