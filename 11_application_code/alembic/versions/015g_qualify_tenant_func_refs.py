"""015g - Schema-qualify all tenant.* table refs inside tenant.* function bodies

Revision ID: 015g_qualify_tenant_func_refs
Revises: 015f_fix_referral_rewards_rls
Create Date: 2026-04-15

Background
----------
Bonus drift audit (Phase 4a-5) found 10 functions in the `tenant` schema
that reference tenant tables WITHOUT the `tenant.` prefix. They work
today because most callers run with a search_path that happens to
include `tenant`. They will silently break when:
  - Promoted to SECURITY DEFINER (we did this on 4 trigger fns already)
  - Called by background workers / materialized view refreshes
  - Used in any context where search_path is reset

This migration sweeps all 10 functions, regex-prefixes bare references
to known tenant tables with `tenant.`, and re-executes the resulting
CREATE OR REPLACE FUNCTION DDL.

Functions affected
------------------
  check_chemical_compliance, compute_cashflow_forecast, compute_cogk,
  compute_decision_signal, compute_expansion_readiness,
  compute_harvest_reconciliation, generate_cycle_id, generate_event_id,
  get_farm_dashboard, validate_rotation

Tables covered (those actually referenced inside the 10 bodies)
----------------------------------------------------------------
  alerts, customers, farms, field_events, harvest_log,
  input_transactions, inputs, price_master, production_cycles,
  production_units, workers

Approach
--------
Done inside a PL/pgSQL DO block at migration time:
  - For each target function, fetch pg_get_functiondef
  - regex_replace bare table names with `tenant.<name>` (word boundaries)
  - Guard against double-prefixing (`tenant.tenant.foo` → `tenant.foo`)
  - EXECUTE the patched DDL
Verified pre-flight: zero string-literal collisions on these names; zero
shared.* unqualified refs to worry about.

Reversibility
-------------
Downgrade is BEST-EFFORT only — it cannot perfectly restore the original
broken bodies without storing snapshots elsewhere. We emit a WARNING
instructing operators to restore from the bootstrap SQL or the
pre-015g pg_dump if a true revert is needed. No automatic re-installation
of broken function bodies; we just no-op with a loud warning.
"""
from alembic import op

revision = "015g_qualify_tenant_func_refs"
down_revision = "015f_fix_referral_rewards_rls"
branch_labels = None
depends_on = None


SWEEP_SQL = r"""
DO $sweep$
DECLARE
    r RECORD;
    new_def TEXT;
    target_fns TEXT[] := ARRAY[
        'check_chemical_compliance',
        'compute_cashflow_forecast',
        'compute_cogk',
        'compute_decision_signal',
        'compute_expansion_readiness',
        'compute_harvest_reconciliation',
        'generate_cycle_id',
        'generate_event_id',
        'get_farm_dashboard',
        'validate_rotation'
    ];
    target_tables TEXT[] := ARRAY[
        'alerts','customers','farms','field_events','harvest_log',
        'input_transactions','inputs','price_master','production_cycles',
        'production_units','workers'
    ];
    t TEXT;
BEGIN
    FOR r IN
        SELECT proname, pg_get_functiondef(oid) AS def
        FROM   pg_proc
        WHERE  pronamespace = (SELECT oid FROM pg_namespace WHERE nspname='tenant')
          AND  proname = ANY(target_fns)
    LOOP
        new_def := r.def;
        FOREACH t IN ARRAY target_tables LOOP
            -- Add `tenant.` prefix to bare \mTABLE\M references.
            new_def := regexp_replace(
                new_def,
                '\m' || t || '\M',
                'tenant.' || t,
                'g'
            );
        END LOOP;
        -- Squash any double-prefix that resulted from already-qualified refs.
        new_def := replace(new_def, 'tenant.tenant.', 'tenant.');
        EXECUTE new_def;
        RAISE NOTICE '015g: rewrote tenant.%', r.proname;
    END LOOP;
END
$sweep$;
"""


def upgrade():
    op.execute(SWEEP_SQL)


def downgrade():
    op.execute(
        "DO $$ BEGIN RAISE WARNING "
        "'015g downgrade is no-op: original (broken) function bodies are not "
        "snapshotted. Restore from bootstrap SQL (02_database/schema/) or a "
        "pre-015g pg_dump if a true revert is required.'; END $$"
    )
