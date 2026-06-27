"""188 - tenant.passport_profile: the FEW manual fields of the Agricultural Passport.

TATI Phase 1. The Passport is a PROJECTION of existing TFOS data (Golden Rule: never
re-ask). This table holds only what genuinely cannot be inferred from farming activity:
a professional photo, a short bio, and languages. Everything else (identity, farm, GPS,
production, sales, timeline, reputation) is projected from existing tables at read time.

FORCED RLS, canonical app.tenant_id policy. Apply AS OWNER (teivaka) per Strike #123.

Revision ID: 188_passport_profile
Revises: 187_report_evidence_fn
"""
from alembic import op


revision = "188_passport_profile"
down_revision = "187_report_evidence_fn"
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
        CREATE TABLE IF NOT EXISTS tenant.passport_profile (
            user_id                UUID PRIMARY KEY REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            tenant_id              UUID NOT NULL,
            preferred_name         TEXT,
            bio                    TEXT,
            languages              TEXT[],
            professional_photo_url TEXT,
            photo_sha256           TEXT,
            updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """,
        "ALTER TABLE tenant.passport_profile ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE tenant.passport_profile FORCE ROW LEVEL SECURITY",
        """
        CREATE POLICY passport_profile_tenant_isolation ON tenant.passport_profile
            FOR ALL
            USING      (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
        """,
        """
        DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.passport_profile TO teivaka_app;
        END IF; END $$
        """,
    ])


def downgrade():
    _exec_each([
        "DROP POLICY IF EXISTS passport_profile_tenant_isolation ON tenant.passport_profile",
        "DROP TABLE IF EXISTS tenant.passport_profile",
    ])
