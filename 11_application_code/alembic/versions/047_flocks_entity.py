"""Create tenant.flocks entity table for POULTRY domain.

Per Phase 6.2-2 Operator-locked decisions (2026-05-01):
- F1: flock_id TEXT human-readable, <farm_id>-FLK<NNN> (Strike #21 alignment)
- F2: 12-column full schema (avoids future migrations as Phase 6.4+ events ship)
- F3: Stored current_count (decrements via app layer on MORTALITY_LOGGED, etc.)
- F4: flock_type enum: LAYER, BROILER, DUAL_PURPOSE, BREEDER
- F5: lifecycle_status enum: PLACED, GROWING, LAYING, FINISHED, RETIRED, CULLED

FK targets:
- tenant_id → tenant.tenants(tenant_id) UUID
- farm_id → tenant.farms(farm_id) TEXT
- breed_id → shared.farm_libraries(library_id) UUID (POULTRY_BREED type by convention)
- current_pu_id → tenant.production_units(pu_id) TEXT, nullable

RLS: tenant_id matches session per standard tenant.* pattern.

Revision ID: 047_flocks_entity
Revises: 046_poultry_event_log_table
Create Date: 2026-05-01
"""

from alembic import op
import sqlalchemy as sa

revision = '047_flocks_entity'
down_revision = '046_poultry_event_log_table'
branch_labels = None
depends_on = None

FLOCK_TYPES = ['LAYER', 'BROILER', 'DUAL_PURPOSE', 'BREEDER']
LIFECYCLE_STATUSES = ['PLACED', 'GROWING', 'LAYING', 'FINISHED', 'RETIRED', 'CULLED']


def upgrade():
    conn = op.get_bind()

    flock_type_check = ', '.join(f"'{t}'" for t in FLOCK_TYPES)
    lifecycle_check = ', '.join(f"'{s}'" for s in LIFECYCLE_STATUSES)

    conn.execute(sa.text(f"""
        CREATE TABLE tenant.flocks (
            flock_id            TEXT PRIMARY KEY,
            tenant_id           UUID NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
            farm_id             TEXT NOT NULL REFERENCES tenant.farms(farm_id),
            flock_label         TEXT NOT NULL,
            breed_id            UUID NOT NULL REFERENCES shared.farm_libraries(library_id),
            current_pu_id       TEXT REFERENCES tenant.production_units(pu_id),
            placed_date         DATE NOT NULL,
            placed_count        INTEGER NOT NULL CHECK (placed_count > 0),
            current_count       INTEGER NOT NULL CHECK (current_count >= 0),
            flock_type          TEXT NOT NULL CHECK (flock_type IN ({flock_type_check})),
            lifecycle_status    TEXT NOT NULL DEFAULT 'PLACED' CHECK (lifecycle_status IN ({lifecycle_check})),
            notes               TEXT,
            is_active           BOOLEAN NOT NULL DEFAULT TRUE,
            created_by          UUID NOT NULL,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT no_empty_label CHECK (length(trim(flock_label)) > 0),
            CONSTRAINT current_lte_placed CHECK (current_count <= placed_count + 1000)
        );
    """))

    # Indexes for common queries
    conn.execute(sa.text("""
        CREATE INDEX idx_flocks_farm_active
        ON tenant.flocks (tenant_id, farm_id, is_active)
        WHERE is_active = TRUE;
    """))

    conn.execute(sa.text("""
        CREATE INDEX idx_flocks_pu_active
        ON tenant.flocks (tenant_id, current_pu_id, is_active)
        WHERE is_active = TRUE AND current_pu_id IS NOT NULL;
    """))

    conn.execute(sa.text("""
        CREATE INDEX idx_flocks_lifecycle
        ON tenant.flocks (tenant_id, lifecycle_status, is_active);
    """))

    # RLS
    conn.execute(sa.text("""
        ALTER TABLE tenant.flocks ENABLE ROW LEVEL SECURITY;
    """))

    conn.execute(sa.text("""
        CREATE POLICY flocks_tenant_isolation ON tenant.flocks
        FOR ALL
        USING (tenant_id::text = current_setting('app.tenant_id', TRUE))
        WITH CHECK (tenant_id::text = current_setting('app.tenant_id', TRUE));
    """))

    # Grants (DELETE not granted; soft-delete via UPDATE only)
    conn.execute(sa.text("""
        GRANT SELECT, INSERT, UPDATE ON tenant.flocks TO teivaka_app;
    """))


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS tenant.flocks CASCADE;"))
