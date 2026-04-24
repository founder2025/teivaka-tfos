"""farmer_label columns on farmer-visible tenant tables

Revision ID: 027_farmer_label_columns
Revises: 026_one_active_cycle_per_pu
Create Date: 2026-04-24

Option 3 / Naming Doctrine
(TFOS_DESIGN_DOCTRINE.md Part IV — Naming & Fresh-Start Doctrine)

Adds farmer-chosen display labels to every tenant.* table that surfaces
entities to farmers. Internal IDs (UUIDs, PU002-style composite keys)
remain for referential integrity and audit chain hashing; farmer_label
is what the farmer actually sees in the UI.

Tables modified:
  - tenant.production_units   (farmer names their blocks per Universal Naming v2)
  - tenant.production_cycles  (farmer names their crop cycles / seasons)
  - tenant.livestock          (farmer names their animals / hives)
  - tenant.harvest_log        (farmer optionally labels a specific harvest)

Backfill policy: leave NULL. Onboarding wizard captures labels on new
signup. F001 / F002 pilot operators (Laisenia, Cody) label existing rows
post-deploy via /admin/labels UI (Day 7 of execution pack). Never seed
a farmer-chosen label in a migration — labels are tenant data, not
platform data.

Indexes are partial — only rows with non-null labels are indexed, since
display queries always filter on that condition and un-labeled rows
(pre-onboarding or pre-backfill) fall back to internal ID display.

Schema Reality Drift List compliance:
  - tenant.production_cycles uses cycle_status (not status) — unaffected here
  - tenant.harvest_log uses qty_kg, pu_id, chemical_compliance_cleared
    — this migration only adds farmer_label, does not touch drift columns

asyncpg constraint respected: every DDL is its own op.execute() call
per v4 Part 4 migration rules.

Rollback: safe. Dropping farmer_label columns returns the schema to the
026 state. No FK dependencies. No RLS policies need updating — RLS on
these tables already filters by tenant_id which is unchanged.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic
revision = '027_farmer_label_columns'
down_revision = '026_one_active_cycle_per_pu'
branch_labels = None
depends_on = None


def upgrade():
    # ------------------------------------------------------------
    # Add farmer_label column to four farmer-visible tenant tables
    # VARCHAR(64) — enough for "Eggplant block near the mango tree"
    # without being wasteful. UI enforces 64-char truncation.
    # ------------------------------------------------------------

    op.execute(
        "ALTER TABLE tenant.production_units "
        "ADD COLUMN farmer_label VARCHAR(64)"
    )
    op.execute(
        "ALTER TABLE tenant.production_cycles "
        "ADD COLUMN farmer_label VARCHAR(64)"
    )
    op.execute(
        "ALTER TABLE tenant.livestock "
        "ADD COLUMN farmer_label VARCHAR(64)"
    )
    op.execute(
        "ALTER TABLE tenant.harvest_log "
        "ADD COLUMN farmer_label VARCHAR(64)"
    )

    # ------------------------------------------------------------
    # Partial indexes on farmer_label (non-null rows only)
    # Display queries always filter WHERE farmer_label IS NOT NULL
    # because un-labeled rows fall back to UUID display in the UI.
    # Partial indexes keep the btree small for the common case.
    # ------------------------------------------------------------

    op.execute(
        "CREATE INDEX idx_production_units_farmer_label "
        "ON tenant.production_units (tenant_id, farmer_label) "
        "WHERE farmer_label IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX idx_production_cycles_farmer_label "
        "ON tenant.production_cycles (tenant_id, farmer_label) "
        "WHERE farmer_label IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX idx_livestock_farmer_label "
        "ON tenant.livestock (tenant_id, farmer_label) "
        "WHERE farmer_label IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX idx_harvest_log_farmer_label "
        "ON tenant.harvest_log (tenant_id, farmer_label) "
        "WHERE farmer_label IS NOT NULL"
    )

    # ------------------------------------------------------------
    # No seed data. Onboarding wizard (Option 3 frontend work) captures
    # labels at the point a new farmer creates blocks / cycles / animals.
    # F001 / F002 pilot tenants label their existing rows via the UI
    # admin backfill flow — labels are tenant data, never platform seed.
    # ------------------------------------------------------------


def downgrade():
    # Drop indexes first, then columns, reverse order of creation.
    # No data loss concern in down direction — farmer_label is
    # farmer-captured, not reconstructable, so downgrade should only
    # be used on a dev / staging environment, never production.
    op.execute("DROP INDEX IF EXISTS tenant.idx_harvest_log_farmer_label")
    op.execute("DROP INDEX IF EXISTS tenant.idx_livestock_farmer_label")
    op.execute("DROP INDEX IF EXISTS tenant.idx_production_cycles_farmer_label")
    op.execute("DROP INDEX IF EXISTS tenant.idx_production_units_farmer_label")

    op.execute("ALTER TABLE tenant.harvest_log DROP COLUMN farmer_label")
    op.execute("ALTER TABLE tenant.livestock DROP COLUMN farmer_label")
    op.execute("ALTER TABLE tenant.production_cycles DROP COLUMN farmer_label")
    op.execute("ALTER TABLE tenant.production_units DROP COLUMN farmer_label")
