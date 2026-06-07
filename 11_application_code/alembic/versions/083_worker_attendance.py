"""083 worker attendance — tenant.worker_attendance (geo-locked clock in/out)

L3 of Locations. Records worker clock-in/out with the GPS fix taken in the
field, and whether that fix falls inside the farm's drawn BOUNDARY polygon
(point-in-polygon checked in the API against tenant.map_features). Per-tenant
RLS so every farm account independently sees only its own attendance.

revision: 083_worker_attendance
down_revision: 082_farm_map_features
"""
from alembic import op

revision = "083_worker_attendance"
down_revision = "082_farm_map_features"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS tenant.worker_attendance (
            attendance_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id        UUID NOT NULL,
            farm_id          TEXT NOT NULL,
            worker_id        UUID,
            worker_name      TEXT,
            kind             TEXT NOT NULL CHECK (kind IN ('CLOCK_IN','CLOCK_OUT')),
            occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            lat              NUMERIC(9,6),
            lng              NUMERIC(9,6),
            accuracy_m       NUMERIC(8,2),
            inside_boundary  BOOLEAN,
            distance_m       NUMERIC(10,2),
            note             TEXT,
            created_by       UUID,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_worker_attendance_lookup
            ON tenant.worker_attendance (tenant_id, farm_id, occurred_at DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_worker_attendance_tenant
            ON tenant.worker_attendance (tenant_id)
    """)

    # RLS — canonical app.tenant_id policy, mirror sibling tenant.* tables.
    op.execute("ALTER TABLE tenant.worker_attendance ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tenant.worker_attendance FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY worker_attendance_tenant_isolation
            ON tenant.worker_attendance
            USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    """)

    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
                GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.worker_attendance TO teivaka_app;
            END IF;
        END $$
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tenant.worker_attendance")
