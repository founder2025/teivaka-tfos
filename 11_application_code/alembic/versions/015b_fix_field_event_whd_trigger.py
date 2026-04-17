"""015b - Fix set_whd_clearance_date() column drift on field_events trigger

Revision ID: 015b_fix_field_event_whd_trigger
Revises: 015a_fix_chemical_compliance
Create Date: 2026-04-15

Background
----------
The BEFORE INSERT trigger `set_field_event_whd` on tenant.field_events
calls tenant.set_whd_clearance_date(), which referenced the wrong column:

    SELECT COALESCE(withholding_days_harvest, 0) FROM shared.chemical_library

The actual column is `withholding_period_days` (same drift pattern fixed
for harvest_log triggers in 015a). Effects of the bug:

  1. Any INSERT INTO tenant.field_events with chemical_application=true
     raised "column withholding_days_harvest does not exist" — chemical
     applications could not be logged at all.
  2. The COALESCE silently masked the missing column at *definition* time;
     the failure only surfaced at runtime on first INSERT.
  3. Even if the column had existed, every whd_clearance_date would have
     been (event_date + 0) = event_date — silent rule #2 weakening.

This migration replaces the function body to reference the real column.
Function/trigger name and signature unchanged — no dependent code shifts.

Reversibility
-------------
Downgrade restores the broken function verbatim and emits a WARNING.
"""
from alembic import op

revision = "015b_fix_field_event_whd_trigger"
down_revision = "015a_fix_chemical_compliance"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


NEW_FUNCTION_SQL = r"""
CREATE OR REPLACE FUNCTION tenant.set_whd_clearance_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
    v_whd INTEGER := 0;
BEGIN
    IF NEW.chemical_application = true AND NEW.chemical_id IS NOT NULL THEN
        SELECT COALESCE(withholding_period_days, 0)
        INTO   v_whd
        FROM   shared.chemical_library
        WHERE  chemical_id = NEW.chemical_id;

        NEW.whd_clearance_date := NEW.event_date::DATE + v_whd;
    END IF;

    RETURN NEW;
END;
$func$;
"""

OLD_FUNCTION_SQL = r"""
CREATE OR REPLACE FUNCTION tenant.set_whd_clearance_date()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
DECLARE
    v_whd INTEGER := 0;
BEGIN
    IF NEW.chemical_application = true AND NEW.chemical_id IS NOT NULL THEN
        SELECT COALESCE(withholding_days_harvest, 0)
        INTO   v_whd
        FROM   shared.chemical_library
        WHERE  chemical_id = NEW.chemical_id;

        NEW.whd_clearance_date := NEW.event_date::DATE + v_whd;
    END IF;

    RETURN NEW;
END;
$func$;
"""


def upgrade():
    _exec_each([NEW_FUNCTION_SQL])


def downgrade():
    _exec_each([
        "DO $$ BEGIN RAISE WARNING 'Reverting to broken WHD trigger — inviolable rule #2 weakened: field_events.whd_clearance_date will silently become event_date + 0.'; END $$",
        OLD_FUNCTION_SQL,
    ])
