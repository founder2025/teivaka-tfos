"""Create tenant.poultry_event_log table for polymorphic POULTRY events.

Per Phase 6.2-1 architectural decisions (Operator-confirmed 2026-05-01):
- Decision 1: Generic POST /api/v1/events polymorphic endpoint
- Decision 2: Single tenant.poultry_event_log per group with JSONB payload
- Decision A+B: Anchor columns are TEXT (matching prod schema for human-readable
  farm/PU IDs); cycle_id named explicitly (vs production_id which is shared.productions FK)

Schema design notes:
- event_id (PK) = UUID (system PK; matches farm_libraries / audit.events convention)
- tenant_id = UUID FK to tenant.tenants (system PK)
- farm_id = TEXT FK to tenant.farms (human-readable: F001-A0EE)
- pu_id = TEXT FK to tenant.production_units, NULLABLE for whole-farm events
- cycle_id = TEXT FK to tenant.production_cycles, NULLABLE for no-crop events
- flock_id = UUID, NULLABLE; FK constraint added in Migration 048 (Phase 6.2-2)
- created_by = UUID (Operator anchor)
- event_type = TEXT, validated against shared.event_type_catalog at app layer
- payload_jsonb = event-type-specific payload, validated against Pydantic registry
- payload_schema_version = INT, allows future schema migrations of payload shape
- audit_event_id = UUID FK to audit.events (NOT NULL — every event row links to its audit emission)

RLS: tenant_id::text = current_setting('app.tenant_id', TRUE) — standard tenant.* pattern.

Strike #21 + #22 fix baked in:
- All farm-facing IDs are TEXT (not UUID)
- cycle_id (instance) is the Crop anchor, NOT production_id (category)

Cross-group reuse: this same shape will be replicated in tenant.livestock_event_log,
tenant.aquaculture_event_log, etc. as each group ships.

Revision ID: 046_poultry_event_log_table
Revises: 045_drop_stale_audit_check
Create Date: 2026-05-01
"""

from alembic import op
import sqlalchemy as sa

revision = '046_poultry_event_log_table'
down_revision = '045_drop_stale_audit_check'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # 1. Create the polymorphic event log table (TEXT anchors per Strike #21)
    conn.execute(sa.text("""
        CREATE TABLE tenant.poultry_event_log (
            event_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id               UUID NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
            farm_id                 TEXT NOT NULL REFERENCES tenant.farms(farm_id),
            pu_id                   TEXT REFERENCES tenant.production_units(pu_id),
            cycle_id                TEXT REFERENCES tenant.production_cycles(cycle_id),
            flock_id                UUID,  -- FK constraint added in Migration 048 (Phase 6.2-2)
            created_by              UUID NOT NULL,
            event_type              TEXT NOT NULL,
            occurred_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
            payload_jsonb           JSONB NOT NULL DEFAULT '{}'::jsonb,
            payload_schema_version  INTEGER NOT NULL DEFAULT 1,
            audit_event_id          UUID NOT NULL,
            CONSTRAINT poultry_event_log_audit_fk
                FOREIGN KEY (audit_event_id) REFERENCES audit.events(event_id)
        );
    """))

    # 2. Indexes for common query patterns
    conn.execute(sa.text("""
        CREATE INDEX idx_poultry_event_log_farm_occurred
        ON tenant.poultry_event_log (tenant_id, farm_id, occurred_at DESC);
    """))

    conn.execute(sa.text("""
        CREATE INDEX idx_poultry_event_log_pu
        ON tenant.poultry_event_log (tenant_id, pu_id, occurred_at DESC)
        WHERE pu_id IS NOT NULL;
    """))

    conn.execute(sa.text("""
        CREATE INDEX idx_poultry_event_log_type
        ON tenant.poultry_event_log (tenant_id, event_type, occurred_at DESC);
    """))

    # 3. Enable RLS
    conn.execute(sa.text("""
        ALTER TABLE tenant.poultry_event_log ENABLE ROW LEVEL SECURITY;
    """))

    # 4. RLS policy: tenant_id matches session
    conn.execute(sa.text("""
        CREATE POLICY poultry_event_log_tenant_isolation ON tenant.poultry_event_log
        FOR ALL
        USING (tenant_id::text = current_setting('app.tenant_id', TRUE))
        WITH CHECK (tenant_id::text = current_setting('app.tenant_id', TRUE));
    """))

    # 5. Grant runtime user access
    conn.execute(sa.text("""
        GRANT SELECT, INSERT, UPDATE ON tenant.poultry_event_log TO teivaka_app;
    """))


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS tenant.poultry_event_log CASCADE;"))
