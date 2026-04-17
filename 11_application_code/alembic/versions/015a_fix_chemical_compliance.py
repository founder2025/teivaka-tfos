"""015a - Consolidate chemical compliance triggers (inviolable rule #2)

Revision ID: 015a_fix_chemical_compliance
Revises: 014_growth_foundations
Create Date: 2026-04-15

Background
----------
Two BEFORE INSERT triggers existed on tenant.harvest_log:

  1. harvest_compliance_check  → tenant.check_harvest_chemical_compliance()
       - Referenced shared.chemical_library.withholding_days_harvest
         (column does NOT exist; actual: withholding_period_days).
       - COALESCE(..., 0) silently masked the missing column → max_whd
         always 0 → trigger never blocked anything. Inviolable rule #2
         was silently bypassed.
       - Used CURRENT_DATE (now) instead of NEW.harvest_date — wrong
         semantics for backdated harvests.

  2. before_harvest_compliance → tenant.trigger_chemical_compliance_check()
       - Wrote to columns compliance_blocked / chemical_compliance_checked /
         blocking_chemicals — none of which exist on harvest_log.
       - Therefore EVERY INSERT into harvest_log raised "column does not
         exist". The harvest API has been non-functional.
       - Also did not raise on violation — explicitly delegated to API
         layer. Inviolable rule #2 demands a DB-level hard block.

This migration drops both, replaces with one canonical trigger:
  harvest_compliance_enforce → tenant.enforce_harvest_compliance()

Canonical behavior
------------------
- JOIN field_events → chemical_library on the REAL column names
  (chem_name, withholding_period_days).
- Window: chemicals applied on this PU since cycle planting_date
  (fall back to NEW.harvest_date - 180 days if planting_date NULL —
   safety net for kava and other long-cycle crops).
- Compute clearance = max(event_date + withholding_period_days).
- Compare against NEW.harvest_date (not CURRENT_DATE) so backdated
  harvests are validated correctly.
- Set NEW.last_chemical_date, NEW.whd_clearance_date,
  NEW.chemical_compliance_cleared (columns that DO exist).
- RAISE EXCEPTION when violated unless NEW.compliance_override is true.

Reversibility
-------------
Downgrade reinstates both old triggers and functions verbatim. A WARNING
is emitted because the prior state was broken (rule #2 not enforced).
"""
from alembic import op

revision = "015a_fix_chemical_compliance"
down_revision = "014_growth_foundations"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


# ─── Canonical replacement ────────────────────────────────────────────────────

NEW_FUNCTION_SQL = r"""
CREATE OR REPLACE FUNCTION tenant.enforce_harvest_compliance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
    v_planting_date      DATE;
    v_window_start       DATE;
    v_last_event_date    DATE;
    v_clearance_date     DATE;
BEGIN
    -- Window start: cycle planting_date, else NEW.harvest_date - 180 days.
    -- 180 days protects long-cycle crops (kava, cassava) where planting_date
    -- might be missing or older than typical chemical persistence.
    SELECT planting_date INTO v_planting_date
    FROM   tenant.production_cycles
    WHERE  cycle_id = NEW.cycle_id;

    v_window_start := COALESCE(v_planting_date, (NEW.harvest_date::DATE) - 180);

    -- Find latest (event_date + withholding_period_days) for this PU since window_start.
    -- This is the latest clearance_date across all chemicals applied — any one
    -- of them not yet cleared blocks the harvest.
    SELECT
        MAX(fe.event_date::DATE),
        MAX( (fe.event_date::DATE) + COALESCE(cl.withholding_period_days, 0) )
    INTO v_last_event_date, v_clearance_date
    FROM   tenant.field_events       fe
    JOIN   shared.chemical_library   cl ON cl.chemical_id = fe.chemical_id
    WHERE  fe.pu_id                 = NEW.pu_id
      AND  fe.chemical_application  = true
      AND  fe.event_date::DATE     >= v_window_start;

    IF v_last_event_date IS NOT NULL THEN
        NEW.last_chemical_date := v_last_event_date;
        NEW.whd_clearance_date := v_clearance_date;

        IF (NEW.harvest_date::DATE) < v_clearance_date
           AND NOT COALESCE(NEW.compliance_override, false)
        THEN
            RAISE EXCEPTION
                'CHEMICAL_COMPLIANCE_VIOLATION: harvest_date % is before clearance_date % (last application: %, days remaining: %)',
                NEW.harvest_date::DATE,
                v_clearance_date,
                v_last_event_date,
                (v_clearance_date - NEW.harvest_date::DATE)
            USING HINT = 'Wait until clearance date or set compliance_override=true with a documented reason.';
        END IF;

        NEW.chemical_compliance_cleared :=
            ((NEW.harvest_date::DATE) >= v_clearance_date)
            OR COALESCE(NEW.compliance_override, false);
    ELSE
        -- No chemical applications recorded in window → compliance vacuously met.
        NEW.chemical_compliance_cleared := true;
    END IF;

    RETURN NEW;
END;
$func$;
"""

NEW_TRIGGER_SQL = """
CREATE TRIGGER harvest_compliance_enforce
    BEFORE INSERT ON tenant.harvest_log
    FOR EACH ROW
    EXECUTE FUNCTION tenant.enforce_harvest_compliance();
"""


# ─── Old (broken) definitions, restored verbatim on downgrade ────────────────

OLD_FUNC_CHECK_HARVEST = r"""
CREATE OR REPLACE FUNCTION tenant.check_harvest_chemical_compliance()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
DECLARE
    v_last_chemical_date  DATE;
    v_max_whd             INTEGER := 0;
    v_clearance_date      DATE;
    v_planting_date       DATE;
BEGIN
    SELECT planting_date INTO v_planting_date
    FROM   tenant.production_cycles
    WHERE  cycle_id = NEW.cycle_id;

    SELECT
        MAX(fe.event_date::DATE),
        MAX(COALESCE(cl.withholding_days_harvest, 0))
    INTO v_last_chemical_date, v_max_whd
    FROM   tenant.field_events  fe
    JOIN   shared.chemical_library cl ON cl.chemical_id = fe.chemical_id
    WHERE  fe.pu_id              = NEW.pu_id
      AND  fe.chemical_application = true
      AND  fe.event_date          >= v_planting_date;

    IF v_last_chemical_date IS NOT NULL THEN
        v_clearance_date       := v_last_chemical_date + v_max_whd;
        NEW.last_chemical_date := v_last_chemical_date;
        NEW.whd_clearance_date := v_clearance_date;

        IF CURRENT_DATE < v_clearance_date AND NOT NEW.compliance_override THEN
            RAISE EXCEPTION
                'CHEMICAL_COMPLIANCE_VIOLATION: Cannot harvest. Last chemical application: %. WHD clearance date: %. Days remaining: %.',
                v_last_chemical_date,
                v_clearance_date,
                (v_clearance_date - CURRENT_DATE);
        END IF;

        NEW.chemical_compliance_cleared :=
            (CURRENT_DATE >= v_clearance_date OR NEW.compliance_override);
    ELSE
        NEW.chemical_compliance_cleared := true;
    END IF;

    RETURN NEW;
END;
$func$;
"""

OLD_FUNC_TRIGGER_CHECK = r"""
CREATE OR REPLACE FUNCTION tenant.trigger_chemical_compliance_check()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
DECLARE
    v_compliance JSONB;
    v_blocking   JSONB;
    v_chem_ids   TEXT[];
    v_item       JSONB;
    v_idx        INT;
BEGIN
    v_compliance := check_chemical_compliance(NEW.pu_id, NEW.harvest_date);

    IF (v_compliance->>'compliant')::BOOL = false THEN
        NEW.compliance_blocked     := true;
        NEW.chemical_compliance_checked := true;

        v_blocking := v_compliance->'blocking_chemicals';
        IF jsonb_array_length(v_blocking) > 0 THEN
            v_chem_ids := ARRAY[]::TEXT[];
            FOR v_idx IN 0..jsonb_array_length(v_blocking) - 1 LOOP
                v_item     := v_blocking->v_idx;
                v_chem_ids := v_chem_ids || ARRAY[(v_item->>'chemical_id')::TEXT];
            END LOOP;
            NEW.blocking_chemicals := v_chem_ids;
        END IF;
    ELSE
        NEW.compliance_blocked          := false;
        NEW.chemical_compliance_checked := true;
        NEW.blocking_chemicals          := ARRAY[]::TEXT[];
    END IF;

    RETURN NEW;
END;
$func$;
"""

OLD_TRIGGER_HARVEST_CHECK = """
CREATE TRIGGER harvest_compliance_check
    BEFORE INSERT ON tenant.harvest_log
    FOR EACH ROW
    EXECUTE FUNCTION tenant.check_harvest_chemical_compliance();
"""

OLD_TRIGGER_BEFORE_HARVEST = """
CREATE TRIGGER before_harvest_compliance
    BEFORE INSERT ON tenant.harvest_log
    FOR EACH ROW
    EXECUTE FUNCTION tenant.trigger_chemical_compliance_check();
"""


def upgrade():
    _exec_each([
        "DROP TRIGGER IF EXISTS harvest_compliance_check  ON tenant.harvest_log",
        "DROP TRIGGER IF EXISTS before_harvest_compliance ON tenant.harvest_log",
        "DROP FUNCTION IF EXISTS tenant.check_harvest_chemical_compliance()",
        "DROP FUNCTION IF EXISTS tenant.trigger_chemical_compliance_check()",
        NEW_FUNCTION_SQL,
        NEW_TRIGGER_SQL,
    ])


def downgrade():
    _exec_each([
        "DO $$ BEGIN RAISE WARNING 'Reverting to broken compliance triggers — inviolable rule #2 (chemical WHD enforcement) will not be enforced at the DB layer in this state.'; END $$",
        "DROP TRIGGER IF EXISTS harvest_compliance_enforce ON tenant.harvest_log",
        "DROP FUNCTION IF EXISTS tenant.enforce_harvest_compliance()",
        OLD_FUNC_CHECK_HARVEST,
        OLD_FUNC_TRIGGER_CHECK,
        OLD_TRIGGER_HARVEST_CHECK,
        OLD_TRIGGER_BEFORE_HARVEST,
    ])
