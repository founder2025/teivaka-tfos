"""Strike #115: decision_signal_config composite PK + snapshots FK rewire.

Revision ID: 075_decision_signal_composite_pk
Revises: 074_inputs_farm_id
Create Date: 2026-05-07

Bug D.2 schema cleanup. Strike #112 worked around a schema contradiction by
seeding all 10 config rows under a single tenant (F001-A0EE). The schema
intent was per-tenant customization (tenant_id NOT NULL + FK + RLS policy)
but the PK was (signal_id) alone, which contradicted the design.

This migration:
1. Drops snapshots single-column FK (signal_id -> config.signal_id)
2. Drops config single-column PK (signal_id alone)
3. Cross-product seeds: copies the 10 canonical rows from F001-A0EE to all
   other active tenants (currently F001-26D6 + F001-F9A8). Result: 30 rows
   total (10 per tenant × 3 tenants). Done AFTER dropping single-column PK
   so multiple rows per signal_id are allowed.
4. Adds config composite PK (signal_id, tenant_id)
5. Adds snapshots composite FK (signal_id, tenant_id) -> config (composite)

After this migration: every tenant has its own threshold rows. The 40
existing snapshot rows continue to satisfy the new composite FK because
snapshots already carry tenant_id; the post-seed config rows match.

Strike #113 SAVEPOINT scaffolding on Decision Engine remains unchanged.
"""
from alembic import op
import sqlalchemy as sa


revision = '075_decision_signal_composite_pk'
down_revision = '074_inputs_farm_id'
branch_labels = None
depends_on = None


# F001-A0EE Save-A-Lot Farm tenant — Strike #112 anchor; source of truth for
# canonical thresholds in this migration. Future Strike #116 dedups
# Python SIGNAL_THRESHOLDS vs these DB rows.
SOURCE_TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'


def upgrade() -> None:
    """Drop FK -> drop old PK -> cross-product seed -> add composite PK -> add composite FK."""
    conn = op.get_bind()

    # Step 1: Drop snapshots single-column FK (must precede PK drop)
    op.execute("""
        ALTER TABLE tenant.decision_signal_snapshots
        DROP CONSTRAINT IF EXISTS decision_signal_snapshots_signal_id_fkey
    """)

    # Step 2: Drop config single-column PK
    op.execute("""
        ALTER TABLE tenant.decision_signal_config
        DROP CONSTRAINT IF EXISTS decision_signal_config_pkey
    """)

    # Step 3: Cross-product seed — must run AFTER PK drop so multiple rows
    # per signal_id are allowed. For every active tenant that doesn't already
    # have config rows, copy all 10 rows from the source tenant (F001-A0EE).
    conn.execute(sa.text("""
        INSERT INTO tenant.decision_signal_config (
            signal_id, tenant_id, signal_name, signal_category,
            green_threshold, amber_threshold, red_threshold,
            threshold_direction, is_active, custom_formula, created_at
        )
        SELECT
            src.signal_id,
            t.tenant_id,
            src.signal_name,
            src.signal_category,
            src.green_threshold,
            src.amber_threshold,
            src.red_threshold,
            src.threshold_direction,
            src.is_active,
            src.custom_formula,
            NOW()
        FROM tenant.decision_signal_config src
        CROSS JOIN tenant.tenants t
        WHERE src.tenant_id = CAST(:source_tenant AS UUID)
          AND t.subscription_status = 'ACTIVE'
          AND t.tenant_id <> CAST(:source_tenant AS UUID)
          AND NOT EXISTS (
              SELECT 1 FROM tenant.decision_signal_config existing
              WHERE existing.signal_id = src.signal_id
                AND existing.tenant_id = t.tenant_id
          )
    """), {'source_tenant': SOURCE_TENANT_ID})

    # Step 4: Add config composite PK
    op.execute("""
        ALTER TABLE tenant.decision_signal_config
        ADD CONSTRAINT decision_signal_config_pkey
        PRIMARY KEY (signal_id, tenant_id)
    """)

    # Step 5: Add snapshots composite FK
    op.execute("""
        ALTER TABLE tenant.decision_signal_snapshots
        ADD CONSTRAINT decision_signal_snapshots_signal_id_fkey
        FOREIGN KEY (signal_id, tenant_id)
        REFERENCES tenant.decision_signal_config (signal_id, tenant_id)
    """)


def downgrade() -> None:
    """Reverse: composite FK -> composite PK -> single PK -> single FK -> remove seeded rows."""
    op.execute("""
        ALTER TABLE tenant.decision_signal_snapshots
        DROP CONSTRAINT IF EXISTS decision_signal_snapshots_signal_id_fkey
    """)
    op.execute("""
        ALTER TABLE tenant.decision_signal_config
        DROP CONSTRAINT IF EXISTS decision_signal_config_pkey
    """)
    # NOTE: cannot fully restore the original single-column PK because that
    # would require deleting 20 of the 30 rows (only one tenant's worth can
    # remain). Downgrade restores PK to (signal_id) by deleting all but the
    # source tenant's rows.
    op.execute(f"""
        DELETE FROM tenant.decision_signal_config
        WHERE tenant_id <> CAST('{SOURCE_TENANT_ID}' AS UUID)
    """)
    op.execute("""
        ALTER TABLE tenant.decision_signal_config
        ADD CONSTRAINT decision_signal_config_pkey PRIMARY KEY (signal_id)
    """)
    op.execute("""
        ALTER TABLE tenant.decision_signal_snapshots
        ADD CONSTRAINT decision_signal_snapshots_signal_id_fkey
        FOREIGN KEY (signal_id) REFERENCES tenant.decision_signal_config (signal_id)
    """)
