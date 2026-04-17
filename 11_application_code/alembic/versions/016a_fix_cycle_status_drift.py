"""016a - Sweep cycle_status drift in tenant.* function bodies

Revision ID: 016a_fix_cycle_status_drift
Revises: 015g_qualify_tenant_func_refs
Create Date: 2026-04-15

Background
----------
5 functions reference `pc.status` (column does not exist; real column
is `cycle_status`) and/or compare to lowercase status literals
(`'completed'`, `'active'`, etc.) when actual values are uppercase.
Effects:
  - validate_rotation() never finds a "previous" cycle → permanent
    no-op → rotation gate (master spec rule) silently bypassed
  - 4 dashboard/forecast functions silently miss data on planted state

Targets:
  validate_rotation, compute_decision_signal,
  compute_cashflow_forecast, compute_expansion_readiness,
  get_farm_dashboard

Approach
--------
Same DO-block / regex_replace / EXECUTE pattern as 015g. Two passes:
  1. `pc.status` → `pc.cycle_status` (column rename)
  2. lowercase status literals → uppercase (value rename)

Reversibility
-------------
Best-effort downgrade: emits WARNING, no body restoration. The pre-016a
bodies were silently broken; restoring them is not desirable. To truly
revert, restore from pre-016a pg_dump.
"""
from alembic import op

revision = "016a_fix_cycle_status_drift"
down_revision = "015g_qualify_tenant_func_refs"
branch_labels = None
depends_on = None


SWEEP_SQL = r"""
DO $sweep$
DECLARE
    r RECORD;
    new_def TEXT;
    target_fns TEXT[] := ARRAY[
        'validate_rotation',
        'compute_decision_signal',
        'compute_cashflow_forecast',
        'compute_expansion_readiness',
        'get_farm_dashboard'
    ];
BEGIN
    FOR r IN
        SELECT proname, pg_get_functiondef(oid) AS def
        FROM   pg_proc
        WHERE  pronamespace = (SELECT oid FROM pg_namespace WHERE nspname='tenant')
          AND  proname = ANY(target_fns)
    LOOP
        new_def := r.def;
        -- Pass 1: column drift pc.status → pc.cycle_status
        new_def := regexp_replace(new_def, 'pc\.status\M', 'pc.cycle_status', 'g');
        -- Pass 2: status value literals (lowercase → uppercase)
        new_def := replace(new_def, '''completed''',  '''CLOSED''');
        new_def := replace(new_def, '''closed''',     '''CLOSED''');
        new_def := replace(new_def, '''active''',     '''ACTIVE''');
        new_def := replace(new_def, '''planned''',    '''PLANNED''');
        new_def := replace(new_def, '''failed''',     '''FAILED''');
        new_def := replace(new_def, '''harvesting''', '''HARVESTING''');
        new_def := replace(new_def, '''closing''',    '''CLOSING''');
        EXECUTE new_def;
        RAISE NOTICE '016a: rewrote tenant.%', r.proname;
    END LOOP;
END
$sweep$;
"""


def upgrade():
    op.execute(SWEEP_SQL)


def downgrade():
    op.execute(
        "DO $$ BEGIN RAISE WARNING "
        "'016a downgrade is no-op: pre-016a function bodies referenced pc.status "
        "(non-existent column) and lowercase status literals; rotation gate was "
        "silently bypassed. Restore from pre-016a pg_dump if a true revert is "
        "required.'; END $$"
    )
