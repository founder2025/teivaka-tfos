"""191 - Attestation requests (Pillar B) + AI summary cache (Pillar C). TATI Phase 3.

Pillar B (D4): claims stop being self-asserted. A farmer mints a one-time attestation link
addressed to an officer/coop/landowner/buyer; they confirm → a claim_verifications row is
written (their source weight) → trust lifts live.
  tenant.attestation_requests + SECURITY DEFINER audit.resolve_attestation (unauth verifier
  bootstrap, like resolve_share).

Pillar C: the AI executive summary is cached against the trust snapshot it summarises.
  tenant.passport_ai_summary.

Both FORCED RLS. Apply AS OWNER (teivaka) per Strike #123.

Revision ID: 191_attestation_summary
Revises: 190_share_sessions
"""
from alembic import op


revision = "191_attestation_summary"
down_revision = "190_share_sessions"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        """
        CREATE TABLE IF NOT EXISTS tenant.attestation_requests (
            request_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id           UUID NOT NULL,
            requested_by_user_id UUID NOT NULL,
            claim_type          TEXT NOT NULL,   -- IDENTITY | FARM_OWNERSHIP | LAND_BOUNDARY | PRODUCTION | SALE
            claim_ref           TEXT NOT NULL,
            subject_label       TEXT,            -- human description of what is being confirmed
            verifier_source     TEXT NOT NULL,   -- EXTENSION_OFFICER | COOPERATIVE | LANDOWNER | BUYER | GOV_PROGRAMME
            verifier_label      TEXT,            -- who is being asked (name/role)
            token_hash          TEXT NOT NULL UNIQUE,
            status              TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | CONFIRMED | DECLINED | EXPIRED
            response_note       TEXT,
            responded_at        TIMESTAMPTZ,
            expires_at          TIMESTAMPTZ,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """,
        "ALTER TABLE tenant.attestation_requests ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE tenant.attestation_requests FORCE ROW LEVEL SECURITY",
        """
        CREATE POLICY attestation_requests_tenant_isolation ON tenant.attestation_requests
            FOR ALL
            USING      (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
        """,
        "CREATE INDEX IF NOT EXISTS idx_attest_tenant ON tenant.attestation_requests (tenant_id, created_at DESC)",

        """
        CREATE OR REPLACE FUNCTION audit.resolve_attestation(p_token_hash TEXT)
        RETURNS TABLE (
            request_id UUID, tenant_id UUID, claim_type TEXT, claim_ref TEXT, subject_label TEXT,
            verifier_source TEXT, verifier_label TEXT, status TEXT, expires_at TIMESTAMPTZ
        )
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
        AS $$
        BEGIN
            RETURN QUERY
            SELECT a.request_id, a.tenant_id, a.claim_type, a.claim_ref, a.subject_label,
                   a.verifier_source, a.verifier_label, a.status, a.expires_at
            FROM tenant.attestation_requests a
            WHERE a.token_hash = p_token_hash
            LIMIT 1;
        END;
        $$;
        """,
        "REVOKE ALL ON FUNCTION audit.resolve_attestation(TEXT) FROM PUBLIC",
        "GRANT EXECUTE ON FUNCTION audit.resolve_attestation(TEXT) TO teivaka_app",

        """
        CREATE TABLE IF NOT EXISTS tenant.passport_ai_summary (
            tenant_id     UUID PRIMARY KEY,
            summary       TEXT,
            source        TEXT NOT NULL DEFAULT 'deterministic',  -- deterministic | ai
            based_on      TIMESTAMPTZ,   -- the trust snapshot computed_at it summarises
            generated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """,
        "ALTER TABLE tenant.passport_ai_summary ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE tenant.passport_ai_summary FORCE ROW LEVEL SECURITY",
        """
        CREATE POLICY passport_ai_summary_tenant_isolation ON tenant.passport_ai_summary
            FOR ALL
            USING      (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
        """,

        """
        DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.attestation_requests TO teivaka_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.passport_ai_summary TO teivaka_app;
        END IF; END $$
        """,
    ])


def downgrade():
    _exec_each([
        "DROP FUNCTION IF EXISTS audit.resolve_attestation(TEXT)",
        "DROP POLICY IF EXISTS passport_ai_summary_tenant_isolation ON tenant.passport_ai_summary",
        "DROP TABLE IF EXISTS tenant.passport_ai_summary",
        "DROP POLICY IF EXISTS attestation_requests_tenant_isolation ON tenant.attestation_requests",
        "DROP TABLE IF EXISTS tenant.attestation_requests",
    ])
