"""184 — payments PIN + lockout (second factor on the Payments section)

The Payments hub holds money-movement controls. Data is already owner-only (JWT +
RLS), but a logged-in device (shared phones are common) shouldn't expose it. This
adds a per-user payments PIN with attempt lockout. The PIN is bcrypt-hashed; the
short-lived "unlocked" state lives in Redis (not here). Per-tenant FORCE RLS.

Reversible. Apply as owner (Strike #123).

Revision ID: 184_payment_security
Revises: 183_payments_phase0
"""
from alembic import op

revision = "184_payment_security"
down_revision = "183_payments_phase0"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS tenant.payment_security (
            user_id         UUID PRIMARY KEY REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            tenant_id       UUID NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
            pin_hash        TEXT NOT NULL,
            failed_attempts INTEGER NOT NULL DEFAULT 0,
            locked_until    TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("ALTER TABLE tenant.payment_security ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tenant.payment_security FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY payment_security_tenant_isolation ON tenant.payment_security
            USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    """)
    op.execute("""
        DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.payment_security TO teivaka_app;
        END IF; END $$
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS tenant.payment_security")
