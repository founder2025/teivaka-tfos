"""192 - Document Vault (TATI Phase 4): leases, certificates, IDs, contracts.

Each document is content-hashed (SHA-256), expiry-tracked, soft-deletable, and version-chained.
Files live on the existing media disk (TFOS_MEDIA_DIR) under a non-guessable name; the DB row is
the access-control point. Retrieval is gated (owner JWT / documents-scoped share) — NOT the public
uploads path, because leases/IDs are sensitive.

Both FORCED RLS. Apply AS OWNER (teivaka) per Strike #123.

Revision ID: 192_document_vault
Revises: 191_attestation_summary
"""
from alembic import op


revision = "192_document_vault"
down_revision = "191_attestation_summary"
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
        CREATE TABLE IF NOT EXISTS tenant.documents (
            document_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id           UUID NOT NULL,
            owner_user_id       UUID NOT NULL,
            doc_type            TEXT NOT NULL DEFAULT 'OTHER',  -- LEASE|CERTIFICATE|ID|CONTRACT|INSURANCE|PERMIT|OTHER
            title               TEXT,
            storage_name        TEXT NOT NULL,    -- file on disk (non-guessable)
            sha256              TEXT,
            byte_size           BIGINT,
            mime                TEXT,
            issued_date         DATE,
            expiry_date         DATE,
            verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',  -- UNVERIFIED|VERIFIED|EXPIRED
            supersedes_id       UUID,
            uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at          TIMESTAMPTZ
        )
        """,
        "ALTER TABLE tenant.documents ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE tenant.documents FORCE ROW LEVEL SECURITY",
        """
        CREATE POLICY documents_tenant_isolation ON tenant.documents
            FOR ALL
            USING      (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
        """,
        "CREATE INDEX IF NOT EXISTS idx_documents_tenant ON tenant.documents (tenant_id, uploaded_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_documents_expiry ON tenant.documents (tenant_id, expiry_date) WHERE expiry_date IS NOT NULL AND deleted_at IS NULL",

        """
        CREATE TABLE IF NOT EXISTS tenant.document_access (
            access_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            document_id  UUID NOT NULL,
            tenant_id    UUID NOT NULL,
            accessed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            accessor     TEXT,
            action       TEXT NOT NULL DEFAULT 'VIEW'
        )
        """,
        "ALTER TABLE tenant.document_access ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE tenant.document_access FORCE ROW LEVEL SECURITY",
        """
        CREATE POLICY document_access_tenant_isolation ON tenant.document_access
            FOR ALL
            USING      (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
        """,

        """
        DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.documents TO teivaka_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.document_access TO teivaka_app;
        END IF; END $$
        """,
    ])


def downgrade():
    _exec_each([
        "DROP POLICY IF EXISTS document_access_tenant_isolation ON tenant.document_access",
        "DROP TABLE IF EXISTS tenant.document_access",
        "DROP POLICY IF EXISTS documents_tenant_isolation ON tenant.documents",
        "DROP TABLE IF EXISTS tenant.documents",
    ])
