"""189 - Trust Engine v1: claim_verifications + trust_snapshots.

TATI Phase 2. Two tables:
  tenant.claim_verifications — multi-layer, claim-level verification (D4). Each row is one
    source attesting one claim; trust accumulates across independent sources. Phase 2
    auto-seeds the cheap SELF/EMAIL/PHONE/FARM/LAND claims; third-party attestations
    (officer/coop/buyer/gov/FI) are written by Phase 3+.
  tenant.trust_snapshots — precomputed per-dimension scores (Inviolable #3: pages read
    these, never compute on load). One row per (subject, dimension), upserted each run.

Both FORCED RLS, canonical app.tenant_id policy. Apply AS OWNER (teivaka) per Strike #123.

Revision ID: 189_trust_engine
Revises: 188_passport_profile
"""
from alembic import op


revision = "189_trust_engine"
down_revision = "188_passport_profile"
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
        CREATE TABLE IF NOT EXISTS tenant.claim_verifications (
            verification_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id           UUID NOT NULL,
            claim_type          TEXT NOT NULL,   -- IDENTITY | FARM_OWNERSHIP | LAND_BOUNDARY | PRODUCTION | SALE | COMPLIANCE | TRAINING | MEMBERSHIP
            claim_ref           TEXT NOT NULL,   -- entity verified (user_id / farm_id / cycle_id / ...)
            source              TEXT NOT NULL,   -- SELF | PHONE | EMAIL | GOV_ID | EXTENSION_OFFICER | COOPERATIVE | LANDOWNER | BUYER | GOV_PROGRAMME | FINANCIAL_INSTITUTION
            source_ref          TEXT,
            status              TEXT NOT NULL DEFAULT 'VERIFIED',  -- PENDING | VERIFIED | REJECTED | EXPIRED
            confidence_weight   INTEGER NOT NULL DEFAULT 0,
            evidence_audit_hash TEXT,
            verified_at         TIMESTAMPTZ DEFAULT now(),
            expires_at          TIMESTAMPTZ,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (tenant_id, claim_type, claim_ref, source)
        )
        """,
        "ALTER TABLE tenant.claim_verifications ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE tenant.claim_verifications FORCE ROW LEVEL SECURITY",
        """
        CREATE POLICY claim_verifications_tenant_isolation ON tenant.claim_verifications
            FOR ALL
            USING      (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
        """,
        "CREATE INDEX IF NOT EXISTS idx_claim_verif_tenant ON tenant.claim_verifications (tenant_id, claim_type)",

        """
        CREATE TABLE IF NOT EXISTS tenant.trust_snapshots (
            snapshot_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id        UUID NOT NULL,
            subject_type     TEXT NOT NULL DEFAULT 'FARMER',
            subject_id       TEXT NOT NULL,
            dimension        TEXT NOT NULL,
            score            INTEGER NOT NULL DEFAULT 0,
            band             TEXT NOT NULL DEFAULT 'Building',
            evidence_count   INTEGER NOT NULL DEFAULT 0,
            inputs           JSONB,
            why              TEXT,
            how_to_improve   TEXT,
            formula_version  TEXT,
            computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (tenant_id, subject_id, dimension)
        )
        """,
        "ALTER TABLE tenant.trust_snapshots ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE tenant.trust_snapshots FORCE ROW LEVEL SECURITY",
        """
        CREATE POLICY trust_snapshots_tenant_isolation ON tenant.trust_snapshots
            FOR ALL
            USING      (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
        """,
        "CREATE INDEX IF NOT EXISTS idx_trust_snap_subject ON tenant.trust_snapshots (tenant_id, subject_id)",

        """
        DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.claim_verifications TO teivaka_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.trust_snapshots TO teivaka_app;
        END IF; END $$
        """,
    ])


def downgrade():
    _exec_each([
        "DROP POLICY IF EXISTS trust_snapshots_tenant_isolation ON tenant.trust_snapshots",
        "DROP TABLE IF EXISTS tenant.trust_snapshots",
        "DROP POLICY IF EXISTS claim_verifications_tenant_isolation ON tenant.claim_verifications",
        "DROP TABLE IF EXISTS tenant.claim_verifications",
    ])
