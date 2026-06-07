"""084 farm activity context — tenant.farm_activity_context (append-only TIS memory)

L/Phase 6 of Locations-as-backbone. An append-only log of meaningful farm changes
(block created/renamed, cycle started, event logged, task created, rotation
accepted, etc.) that TIS reads as grounded context — so it answers "what should I
do on Block 1?" / "why is this field idle?" from real logged activity, never
hallucination (Inviolable #1). Per-tenant RLS. App role gets SELECT+INSERT only
(append-only by grant — no runtime update/delete).

revision: 084_farm_activity_context
down_revision: 083_worker_attendance
"""
from alembic import op

revision = "084_farm_activity_context"
down_revision = "083_worker_attendance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS tenant.farm_activity_context (
            activity_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id     UUID NOT NULL,
            farm_id       TEXT NOT NULL,
            pu_id         TEXT,
            cycle_id      TEXT,
            kind          TEXT NOT NULL,
            summary       TEXT NOT NULL,
            payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
            source        TEXT NOT NULL DEFAULT 'app',
            created_by    UUID,
            occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_farm_activity_lookup
            ON tenant.farm_activity_context (tenant_id, farm_id, occurred_at DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_farm_activity_pu
            ON tenant.farm_activity_context (tenant_id, pu_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_farm_activity_tenant
            ON tenant.farm_activity_context (tenant_id)
    """)

    op.execute("ALTER TABLE tenant.farm_activity_context ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tenant.farm_activity_context FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY farm_activity_context_tenant_isolation
            ON tenant.farm_activity_context
            USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    """)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
                GRANT SELECT, INSERT ON tenant.farm_activity_context TO teivaka_app;
            END IF;
        END $$
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tenant.farm_activity_context")
