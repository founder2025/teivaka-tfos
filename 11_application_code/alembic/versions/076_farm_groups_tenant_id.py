"""Strike #121: farm_active_groups tenant_id + RLS — close cross-tenant exposure.

Revision ID: 076_farm_groups_tenant_id
Revises: 075_decision_signal_composite_pk
Create Date: 2026-05-08

(Filename + revision shortened from 076_farm_active_groups_tenant_isolation
because tenant.alembic_version.version_num is varchar(32) — Strike #91
fail-loud caught the truncation on first apply attempt.)

Forensic audit Phase 3+4 surfaced the only tenant.* table with the bug
pattern: no tenant_id column, no RLS policy. The 33 existing rows are
isolated only by farm_id, which makes the table vulnerable to a known-
or-guessed F001-XXXX farm_id (the suffix is the first 4 hex of tenant
UUID — guessable). A BASIC-tier JWT for tenant A could read tenant B's
group activations via GET /api/v1/farms/F001-XXXX/active-groups.

This migration:
1. ADD COLUMN tenant_id uuid (nullable initially) — DDL, no DML impact
2. Backfill: UPDATE tenant_id from tenant.farms via farm_id join
   (33 rows × 1 join row each — verified in Strike #121 recon)
3. ALTER COLUMN SET NOT NULL — safe after backfill (0 NULLs)
4. ADD FK CASCADE to tenant.tenants(tenant_id) — matches existing pattern
5. CREATE INDEX on tenant_id — supports RLS USING-clause filter
6. ENABLE + FORCE ROW LEVEL SECURITY — match closest siblings (farms,
   production_units) which are also forced
7. CREATE POLICY farm_active_groups_tenant_isolation — canonical
   pattern matching all 43 tenant.* policies that follow the shape:
     USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
     WITH CHECK (...same...)

Strike #115 ordering doctrine respected: schema mutations precede RLS
FORCE so the backfill UPDATE runs as table-owner without bypass concern.

App code changes (separate to this migration but landed in same commit):
- app/services/farm_active_groups_defaults.py — add tenant_id param,
  include in INSERT
- app/routers/farm_active_groups.py — add :tid to PUT INSERT
- app/routers/farms.py — pass user["tenant_id"] to service helper
- app/routers/onboarding.py — pass tenant_id to service helper

After this migration ships, every read on farm_active_groups is RLS-
filtered to current tenant; every write must include matching tenant_id.
The cross-tenant exposure is closed at the database level — any router
that bypasses tenant_id in INSERT will fail-loud (NOT NULL violation),
and any SELECT cross-tenant returns 0 rows (RLS USING clause).

ORM impact: none — there is no FarmActiveGroup ORM class (table is
raw-SQL only across all 4 touch points).

Audit chain impact: none — this migration emits no audit.events rows.
The FARM_GROUP_TOGGLED events (83 in audit.events) continue to be
emitted by the router via the canonical emit_audit_event helper.
"""
from alembic import op


revision = "076_farm_groups_tenant_id"
down_revision = '075_decision_signal_composite_pk'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add tenant_id -> backfill -> NOT NULL + FK -> RLS + force + policy."""

    # Step 1: Add tenant_id column (nullable initially so the backfill UPDATE
    # can populate it without a constraint-temporal-coupling problem).
    op.execute("""
        ALTER TABLE tenant.farm_active_groups
        ADD COLUMN tenant_id uuid
    """)

    # Step 2: Backfill from tenant.farms via farm_id join. Recon verified
    # all 33 rows have a valid farms parent; backfill leaves zero NULLs.
    op.execute("""
        UPDATE tenant.farm_active_groups fag
        SET tenant_id = f.tenant_id
        FROM tenant.farms f
        WHERE fag.farm_id = f.farm_id
    """)

    # Step 3: Lock NOT NULL — safe because Step 2 left zero NULLs.
    op.execute("""
        ALTER TABLE tenant.farm_active_groups
        ALTER COLUMN tenant_id SET NOT NULL
    """)

    # Step 4: FK CASCADE to tenants — matches existing tenant_id FK pattern
    # across the 43 sibling tenant.* tables (tenant deletion cascades).
    op.execute("""
        ALTER TABLE tenant.farm_active_groups
        ADD CONSTRAINT farm_active_groups_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES tenant.tenants(tenant_id)
        ON DELETE CASCADE
    """)

    # Step 5: Index on tenant_id — supports RLS USING-clause filter
    # (every query becomes WHERE tenant_id = $1).
    op.execute("""
        CREATE INDEX idx_farm_active_groups_tenant_id
        ON tenant.farm_active_groups (tenant_id)
    """)

    # Step 6: Enable RLS — per-tenant isolation now enforced at row level.
    op.execute("""
        ALTER TABLE tenant.farm_active_groups
        ENABLE ROW LEVEL SECURITY
    """)

    # Step 7: Force RLS — match closest siblings (farms, production_units)
    # which are forced. Owner/superuser cannot bypass RLS on this table.
    op.execute("""
        ALTER TABLE tenant.farm_active_groups
        FORCE ROW LEVEL SECURITY
    """)

    # Step 8: Standard tenant_isolation policy (mirror of 43 sibling tables).
    op.execute("""
        CREATE POLICY farm_active_groups_tenant_isolation
        ON tenant.farm_active_groups
        FOR ALL
        USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
        WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    """)


def downgrade() -> None:
    """Reverse: drop policy -> drop force/enable -> drop index -> drop FK -> drop column."""

    op.execute("""
        DROP POLICY IF EXISTS farm_active_groups_tenant_isolation
        ON tenant.farm_active_groups
    """)

    op.execute("""
        ALTER TABLE tenant.farm_active_groups
        NO FORCE ROW LEVEL SECURITY
    """)

    op.execute("""
        ALTER TABLE tenant.farm_active_groups
        DISABLE ROW LEVEL SECURITY
    """)

    op.execute("""
        DROP INDEX IF EXISTS tenant.idx_farm_active_groups_tenant_id
    """)

    op.execute("""
        ALTER TABLE tenant.farm_active_groups
        DROP CONSTRAINT IF EXISTS farm_active_groups_tenant_id_fkey
    """)

    op.execute("""
        ALTER TABLE tenant.farm_active_groups
        DROP COLUMN IF EXISTS tenant_id
    """)
