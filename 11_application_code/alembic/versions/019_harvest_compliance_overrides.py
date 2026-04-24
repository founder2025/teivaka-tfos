"""019 - FOUNDER-only audit trail for harvest chemical compliance overrides

Revision ID: 019_harvest_compliance_overrides
Revises: 018_ops_health_checks
Create Date: 2026-04-20

Phase 4.1 hardening — Step 1 of 3.

Before this migration, any authenticated user could POST /api/v1/harvests
with `compliance_override=true` + any reason. The DB trigger
(015a) honored the flag regardless of caller role. Inviolable rule #2
(chemical WHD enforcement) was effectively unrestricted at the API layer.

This migration creates the forensic audit table. The role gate itself
lives in app/routers/harvests.py — every override attempt (approved or
denied) writes a row here BEFORE the harvest_log insert is attempted.
The DB trigger remains the second line of defense.

Deviations from task spec (flagged for reviewer)
-----------------------------------------------
1. Task spec said FK to `auth.users`. There is no `auth.*` schema in the
   deployed DB. The user table is `tenant.users`. FK points there, matching
   existing `harvest_log.compliance_override_by_fkey`.

2. Task spec said RLS policy uses `app.current_tenant_id`. Every other
   tenant.* policy uses `app.tenant_id` (see 015c). Per CLAUDE.md rule #11
   the deployed convention is `app.tenant_id`; `app.current_tenant_id` is
   master-spec drift. Policy here uses `app.tenant_id` so `get_tenant_db`
   (middleware/rls.py) works without a second SET_CONFIG call.

3. Task spec said `harvest_id UUID`. harvest_log.harvest_id is actually
   TEXT (format `HRV-YYYYMMDD-NNN`). Column here is TEXT to match. No FK
   to harvest_log — the PK is composite (harvest_id, harvest_date) so a
   single-column FK would require a new unique constraint on harvest_log,
   and the task forbids touching that table.
"""
from alembic import op

revision = "019_harvest_compliance_overrides"
down_revision = "018_ops_health_checks"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        """
        CREATE TABLE IF NOT EXISTS tenant.harvest_compliance_overrides (
            override_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            harvest_id             TEXT,
            tenant_id              UUID        NOT NULL,
            attempted_by_user_id   UUID        NOT NULL REFERENCES tenant.users(user_id),
            attempted_role         TEXT        NOT NULL,
            attempted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            reason                 TEXT        NOT NULL,
            approved               BOOLEAN     NOT NULL,
            request_payload        JSONB
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_hco_tenant_attempted_at ON tenant.harvest_compliance_overrides(tenant_id, attempted_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_hco_harvest_id ON tenant.harvest_compliance_overrides(harvest_id) WHERE harvest_id IS NOT NULL",
        "CREATE INDEX IF NOT EXISTS idx_hco_denied ON tenant.harvest_compliance_overrides(tenant_id, attempted_at DESC) WHERE approved = false",

        "ALTER TABLE tenant.harvest_compliance_overrides ENABLE ROW LEVEL SECURITY",
        """
        CREATE POLICY harvest_compliance_overrides_tenant_isolation
            ON tenant.harvest_compliance_overrides
            FOR ALL
            USING      (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
        """,
    ])


def downgrade():
    _exec_each([
        "DROP POLICY IF EXISTS harvest_compliance_overrides_tenant_isolation ON tenant.harvest_compliance_overrides",
        "DROP TABLE IF EXISTS tenant.harvest_compliance_overrides",
    ])
