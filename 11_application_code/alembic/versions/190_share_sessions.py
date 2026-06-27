"""190 - Share Sessions: the secure, permissioned, revocable QR portal (TATI Phase 3, Pillar A).

D2/P2: a report/passport is shared as a SHARE SESSION, not a public file. The farmer mints a
scoped, expiring, revocable (optionally password-protected, one-time) token; every resolve is
logged (who/when). Public /verify/{hash} stays proof-only.

Tables (tenant.*, FORCED RLS — owner-side CRUD is RLS-normal):
  tenant.share_sessions        — the grant (token stored HASHED; password HASHED)
  tenant.share_session_access  — append-only access log

One SECURITY DEFINER bootstrap function (owned by teivaka, bypasses RLS) lets the
UNauthenticated resolve endpoint look up a share by token hash; after that the endpoint
sets app.tenant_id to the share's owner tenant and works under normal RLS.

Apply AS OWNER (teivaka) per Strike #123.

Revision ID: 190_share_sessions
Revises: 189_trust_engine
"""
from alembic import op


revision = "190_share_sessions"
down_revision = "189_trust_engine"
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
        CREATE TABLE IF NOT EXISTS tenant.share_sessions (
            session_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id       UUID NOT NULL,
            owner_user_id   UUID NOT NULL,
            audience        TEXT NOT NULL DEFAULT 'OTHER',   -- LOAN|BUYER|INSURANCE|GOVERNMENT|INVESTOR|RESEARCHER|NGO|OTHER
            share_reason    TEXT,
            recipient       TEXT,
            scope           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {identity,reputation,trust,farm,evidence}
            token_hash      TEXT NOT NULL UNIQUE,
            password_hash   TEXT,
            view_only       BOOLEAN NOT NULL DEFAULT TRUE,
            allow_download  BOOLEAN NOT NULL DEFAULT FALSE,
            one_time        BOOLEAN NOT NULL DEFAULT FALSE,
            used_at         TIMESTAMPTZ,
            report_version  TEXT,
            expires_at      TIMESTAMPTZ,
            revoked_at      TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """,
        "ALTER TABLE tenant.share_sessions ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE tenant.share_sessions FORCE ROW LEVEL SECURITY",
        """
        CREATE POLICY share_sessions_tenant_isolation ON tenant.share_sessions
            FOR ALL
            USING      (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
        """,
        "CREATE INDEX IF NOT EXISTS idx_share_sessions_tenant ON tenant.share_sessions (tenant_id, created_at DESC)",

        """
        CREATE TABLE IF NOT EXISTS tenant.share_session_access (
            access_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id   UUID NOT NULL,
            tenant_id    UUID NOT NULL,
            accessed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            ip           TEXT,
            action       TEXT NOT NULL DEFAULT 'VIEW'
        )
        """,
        "ALTER TABLE tenant.share_session_access ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE tenant.share_session_access FORCE ROW LEVEL SECURITY",
        """
        CREATE POLICY share_session_access_tenant_isolation ON tenant.share_session_access
            FOR ALL
            USING      (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
        """,
        "CREATE INDEX IF NOT EXISTS idx_share_access_session ON tenant.share_session_access (session_id, accessed_at DESC)",

        # Bootstrap resolver — unauth endpoint reads a share by token hash across RLS.
        # Returns ONLY control fields (never farm data); the endpoint then sets
        # app.tenant_id and reads the scoped passport under normal RLS.
        """
        CREATE OR REPLACE FUNCTION audit.resolve_share(p_token_hash TEXT)
        RETURNS TABLE (
            session_id UUID, tenant_id UUID, scope JSONB, password_hash TEXT,
            view_only BOOLEAN, allow_download BOOLEAN, one_time BOOLEAN,
            used_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ,
            audience TEXT, share_reason TEXT
        )
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
        AS $$
        BEGIN
            RETURN QUERY
            SELECT s.session_id, s.tenant_id, s.scope, s.password_hash,
                   s.view_only, s.allow_download, s.one_time,
                   s.used_at, s.expires_at, s.revoked_at, s.audience, s.share_reason
            FROM tenant.share_sessions s
            WHERE s.token_hash = p_token_hash
            LIMIT 1;
        END;
        $$;
        """,
        "REVOKE ALL ON FUNCTION audit.resolve_share(TEXT) FROM PUBLIC",
        "GRANT EXECUTE ON FUNCTION audit.resolve_share(TEXT) TO teivaka_app",

        """
        DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.share_sessions TO teivaka_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.share_session_access TO teivaka_app;
        END IF; END $$
        """,
    ])


def downgrade():
    _exec_each([
        "DROP FUNCTION IF EXISTS audit.resolve_share(TEXT)",
        "DROP POLICY IF EXISTS share_session_access_tenant_isolation ON tenant.share_session_access",
        "DROP TABLE IF EXISTS tenant.share_session_access",
        "DROP POLICY IF EXISTS share_sessions_tenant_isolation ON tenant.share_sessions",
        "DROP TABLE IF EXISTS tenant.share_sessions",
    ])
