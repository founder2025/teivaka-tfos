"""Phase 4b — tenant.mv_input_balance stub view for inventory list.

Revision ID: 035_tenant_mv_input_balance_stub
Revises: 033_cash_ledger_anchors
Create Date: 2026-04-30

Note on revision chain: this migration deliberately targets 033 as its
down_revision, NOT 034. Migration 034 (audit.verify_event SECURITY DEFINER
function for Phase 9) is staged on host but reserved for a dedicated Phase 9
deployment session. Bundling Phase 9 with an inventory hot-fix would conflate
two unrelated changes. When 034 ships, it will be retargeted to
down_revision = '035_tenant_mv_input_balance_stub'.

Why this migration exists:
inputs.py:list_inputs LEFT JOINs tenant.mv_input_balance for stock_status and
expiring_soon. The materialized view was never created in this environment,
so every GET /api/v1/inputs returned 500. We create mv_input_balance as a
regular VIEW (not materialized — no refresh complexity needed for stub data)
returning NULL for both derived columns. Frontend handles NULL gracefully —
status badge falls through to a neutral state.

Real stock_status logic (LOW / OK / OUT thresholds) and expiring_soon window
(7d? 30d?) will be filled in by a future migration once business rules are
confirmed by the Operator.

Note on UPGRADE_SQL: kept to a single statement deliberately. asyncpg rejects
multi-statement strings in op.execute(). A separate COMMENT statement was
removed for that reason — view name and this docstring document the intent.

Reversible.
"""
from alembic import op


revision = '035_tenant_mv_input_balance_stub'
down_revision = '033_cash_ledger_anchors'
branch_labels = None
depends_on = None


UPGRADE_SQL = """
CREATE OR REPLACE VIEW tenant.mv_input_balance AS
SELECT
    i.input_id,
    NULL::text    AS stock_status,
    NULL::boolean AS expiring_soon
FROM tenant.inputs i
"""

DOWNGRADE_SQL = """
DROP VIEW IF EXISTS tenant.mv_input_balance
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
