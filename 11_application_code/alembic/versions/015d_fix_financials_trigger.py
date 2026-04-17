"""015d - Fix tenant.trigger_update_cycle_financials() schema + column drift

Revision ID: 015d_fix_cycle_financials_trigger
Revises: 015c_fix_tenant_rls_with_check
Create Date: 2026-04-15

Background
----------
The AFTER INSERT trigger `after_harvest_financials` on tenant.harvest_log
fires `tenant.trigger_update_cycle_financials()`. Two bugs in the function:

  1. Unqualified table references — `harvest_log` and `cycle_financials`
     instead of `tenant.harvest_log` and `tenant.cycle_financials`. When
     the trigger fires under FastAPI's async session, search_path does
     not include `tenant`, so Postgres raises:
         relation "harvest_log" does not exist
     This is the real cause of HTTP 500 on Phase 4a-5 T3 (override harvest
     insert). Misleading because the error appears to be about the table
     being inserted INTO, not the AFTER trigger reading from it.

  2. References non-existent column `quantity_kg`. The actual harvest_log
     columns are `gross_yield_kg`, `marketable_yield_kg`, `waste_kg`. The
     existing sibling trigger `update_cycle_on_harvest()` correctly uses
     `marketable_yield_kg` — we mirror that semantic.

Why earlier probes missed this
-------------------------------
Direct asyncpg / SQLAlchemy probes used a non-existent user_id for
`compliance_override_by`, hitting the FK violation BEFORE the AFTER
triggers fired. The trigger bug only surfaces on a successful row insert.

This migration
--------------
- Replaces the function body to schema-qualify both relations.
- Swaps SUM(quantity_kg) → SUM(marketable_yield_kg) for semantic match
  with cycle.actual_yield_kg.
- Adds SECURITY DEFINER for consistency with 015a/015b pattern and to
  pin search_path behavior under any future caller context.

Reversibility
-------------
Downgrade restores the broken body verbatim (with WARNING).
"""
from alembic import op

revision = "015d_fix_financials_trigger"
down_revision = "015c_fix_tenant_rls_with_check"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


NEW_FUNCTION_SQL = r"""
CREATE OR REPLACE FUNCTION tenant.trigger_update_cycle_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
    v_total_harvest NUMERIC;
BEGIN
    SELECT COALESCE(SUM(marketable_yield_kg), 0)
    INTO   v_total_harvest
    FROM   tenant.harvest_log
    WHERE  cycle_id = NEW.cycle_id;

    INSERT INTO tenant.cycle_financials (
        cycle_id,
        total_harvest_qty_kg,
        financials_updated_at,
        needs_refresh
    ) VALUES (
        NEW.cycle_id,
        v_total_harvest,
        NOW(),
        true
    )
    ON CONFLICT (cycle_id) DO UPDATE SET
        total_harvest_qty_kg  = EXCLUDED.total_harvest_qty_kg,
        financials_updated_at = EXCLUDED.financials_updated_at,
        needs_refresh         = true;

    RETURN NEW;
END;
$func$;
"""

OLD_FUNCTION_SQL = r"""
CREATE OR REPLACE FUNCTION tenant.trigger_update_cycle_financials()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
DECLARE
    v_total_harvest NUMERIC;
BEGIN
    SELECT COALESCE(SUM(quantity_kg), 0)
    INTO v_total_harvest
    FROM harvest_log
    WHERE cycle_id = NEW.cycle_id;

    INSERT INTO cycle_financials (
        cycle_id,
        total_harvest_qty_kg,
        financials_updated_at,
        needs_refresh
    )
    VALUES (
        NEW.cycle_id,
        v_total_harvest,
        NOW(),
        true
    )
    ON CONFLICT (cycle_id) DO UPDATE SET
        total_harvest_qty_kg  = EXCLUDED.total_harvest_qty_kg,
        financials_updated_at = EXCLUDED.financials_updated_at,
        needs_refresh         = true;

    RETURN NEW;
END;
$func$;
"""


def upgrade():
    _exec_each([NEW_FUNCTION_SQL])


def downgrade():
    _exec_each([
        "DO $$ BEGIN RAISE WARNING 'Reverting tenant.trigger_update_cycle_financials() to broken body — every harvest_log INSERT will fail with relation does not exist.'; END $$",
        OLD_FUNCTION_SQL,
    ])
