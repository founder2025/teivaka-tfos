"""015e - Second-pass fix for tenant.trigger_update_cycle_financials()

Revision ID: 015e_fix_financials_trigger_v2
Revises: 015d_fix_financials_trigger
Create Date: 2026-04-15

Background
----------
015d fixed the unqualified table references (`harvest_log` → `tenant.harvest_log`,
`cycle_financials` → `tenant.cycle_financials`) and the bogus `quantity_kg`
column. But the function body STILL referenced columns that don't exist on
`tenant.cycle_financials`:

  Wrong reference            Real column
  ─────────────────────────  ────────────────
  total_harvest_qty_kg       total_harvest_kg
  financials_updated_at      last_computed_at
  needs_refresh              (no such column)

Also missing from the INSERT: `financial_id` (NOT NULL, no default),
`tenant_id` (NOT NULL), `farm_id` (NOT NULL). The previous body would
have failed on those even if the column names had been right.

This migration replaces the function body with one that:
  1. References real column names.
  2. Provides every NOT NULL column on INSERT (financial_id, tenant_id,
     farm_id, cycle_id, total_harvest_kg, last_computed_at).
  3. Generates financial_id as 'FIN-' || NEW.cycle_id (stable per cycle;
     only used on the INSERT branch — UPSERT preserves any existing id).
  4. Upserts on the cycle_id UNIQUE constraint.

Reversibility
-------------
Downgrade restores the 015d body (still broken — column names wrong) with
WARNING. Going further back to the original (unqualified tables) would
require downgrading 015d first.
"""
from alembic import op

revision = "015e_fix_financials_trigger_v2"
down_revision = "015d_fix_financials_trigger"
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
        financial_id, tenant_id, cycle_id, farm_id,
        total_harvest_kg, last_computed_at
    ) VALUES (
        'FIN-' || NEW.cycle_id, NEW.tenant_id, NEW.cycle_id, NEW.farm_id,
        v_total_harvest, NOW()
    )
    ON CONFLICT (cycle_id) DO UPDATE SET
        total_harvest_kg = EXCLUDED.total_harvest_kg,
        last_computed_at = EXCLUDED.last_computed_at;

    RETURN NEW;
END;
$func$;
"""

OLD_015D_FUNCTION_SQL = r"""
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


def upgrade():
    _exec_each([NEW_FUNCTION_SQL])


def downgrade():
    _exec_each([
        "DO $$ BEGIN RAISE WARNING 'Reverting to 015d body — references columns total_harvest_qty_kg / financials_updated_at / needs_refresh that do not exist; harvest INSERTs will fail.'; END $$",
        OLD_015D_FUNCTION_SQL,
    ])
