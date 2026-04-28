"""Phase P-Doctrine-2 — cash_ledger Block + Crop anchors

Revision ID: 033_cash_ledger_anchors
Revises: 032_audit_event_type_cash
Create Date: 2026-04-28

Adds pu_id + production_id to tenant.cash_ledger so cash entries can
be attributed to a specific Block (production unit) and Crop. Required
for Data Input Doctrine compliance — every event row must carry the
four anchors (Farm + Block + Crop + Operator). cash_ledger today has
Farm (farm_id) + Operator (created_by); this migration closes the
remaining two.

Both columns are NULLABLE on purpose:
  - existing rows pre-033 have nothing to anchor to (no backfill).
  - "whole-farm / general" expenses (utilities, fuel for the truck,
    farm-wide fertilizer purchase before allocation) genuinely don't
    tie to a block — NULL is the right value, not a synthetic "ALL"
    sentinel that would distort attribution rollups.

FK constraints intentionally skipped: pu_id may reference a PU that
has since been archived; production_id is in shared.* not tenant.*
and the schema avoids cross-schema FKs at runtime. Tenant-scoped
partial indexes give the read paths their join-friendly shape
without the FK overhead.

Reversible. No data movement (cash_ledger has 0 rows today, but the
migration would be safe even on a populated table — ADD COLUMN with
no DEFAULT is metadata-only on Postgres 11+).
"""
from alembic import op


revision = '033_cash_ledger_anchors'
down_revision = '032_audit_event_type_cash'
branch_labels = None
depends_on = None


def _exec_each(statements):
    for stmt in statements:
        op.execute(stmt)


def upgrade() -> None:
    _exec_each([
        "ALTER TABLE tenant.cash_ledger ADD COLUMN pu_id VARCHAR(64)",
        "ALTER TABLE tenant.cash_ledger ADD COLUMN production_id VARCHAR(64)",
        """
        CREATE INDEX idx_cash_ledger_pu
        ON tenant.cash_ledger (tenant_id, pu_id)
        WHERE pu_id IS NOT NULL
        """,
        """
        CREATE INDEX idx_cash_ledger_production
        ON tenant.cash_ledger (tenant_id, production_id)
        WHERE production_id IS NOT NULL
        """,
    ])


def downgrade() -> None:
    _exec_each([
        "DROP INDEX IF EXISTS tenant.idx_cash_ledger_production",
        "DROP INDEX IF EXISTS tenant.idx_cash_ledger_pu",
        "ALTER TABLE tenant.cash_ledger DROP COLUMN IF EXISTS production_id",
        "ALTER TABLE tenant.cash_ledger DROP COLUMN IF EXISTS pu_id",
    ])
