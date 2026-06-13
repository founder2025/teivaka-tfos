"""133 — Per-user guided-tour state (first-visit pillar tours)

tenant.user_tours records which guided tours a user has completed/dismissed, so
the auto-run first-visit tour for each Farm-pillar destination fires once and
follows the farmer across devices (server-side, not localStorage). FORCE RLS.

Revision ID: 133_user_tours
Revises: 132_audit_chain_seq_seal
"""
from alembic import op
import sqlalchemy as sa

revision = "133_user_tours"
down_revision = "132_audit_chain_seq_seal"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS tenant.user_tours (
            tenant_id  UUID NOT NULL,
            user_id    UUID NOT NULL,
            tour_key   TEXT NOT NULL,
            seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, tour_key)
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_user_tours_user ON tenant.user_tours (user_id)"))
    conn.execute(sa.text("ALTER TABLE tenant.user_tours ENABLE ROW LEVEL SECURITY"))
    conn.execute(sa.text("ALTER TABLE tenant.user_tours FORCE ROW LEVEL SECURITY"))
    conn.execute(sa.text("""
        CREATE POLICY user_tours_tenant_isolation ON tenant.user_tours
            USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    """))
    conn.execute(sa.text("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
                GRANT SELECT, INSERT, DELETE ON tenant.user_tours TO teivaka_app;
            END IF;
        END $$
    """))


def downgrade():
    op.get_bind().execute(sa.text("DROP TABLE IF EXISTS tenant.user_tours"))
