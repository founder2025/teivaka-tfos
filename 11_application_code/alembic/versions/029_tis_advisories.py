"""Phase 4.2 Option 3 Day 2 — tenant.tis_advisories + audit.events event_type
extension + tenant.tenants onboarding state columns.

Revision ID: 029_tis_advisories
Revises: 028_farmer_label_columns
Create Date: 2026-04-25

Binding spec:
  /opt/teivaka/04_execution/phase_4_2_option_3_plus_nav_v2_1/day_2_tis_advisories_spec.md

Contents:
  1. tenant.tis_advisories — advisory feed for SSE stream (v2.1 §11.8).
  2. audit.events CHECK constraint extended with ADVISORY_READ,
     ONBOARDING_STARTED, ONBOARDING_COMPLETED.
  3. tenant.tenants gains onboarded_at / section_term / mode columns
     required by the Day 2 onboarding router. The binding spec lists
     only items 1 + 2, but the router cannot function without somewhere
     to persist onboarding completion + derived mode + farmer-chosen
     section term. Adding three nullable columns to an existing table
     with default NULL is backwards-compatible and does not disturb any
     existing row. Flagged as Day 2 scope extension in close report.

asyncpg rule: each DDL statement in its own op.execute() call.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '029_tis_advisories'
down_revision = '028_farmer_label_columns'
branch_labels = None
depends_on = None


_EVENT_TYPES_PRE_029 = (
    "'TASK_COMPLETED', 'TASK_SKIPPED', 'TASK_CANCELLED', 'TASK_EXPIRED', "
    "'HARVEST_LOGGED', 'CHEMICAL_APPLIED', "
    "'CYCLE_CREATED', 'CYCLE_CLOSED', 'CYCLE_TRANSITION', "
    "'ROTATION_OVERRIDE', 'COMPLIANCE_OVERRIDE', "
    "'PAYMENT_RECEIVED', 'PAYMENT_SENT', 'LABOR_LOGGED', "
    "'INVENTORY_ADJUSTED', 'ALERT_RESOLVED', 'USER_INVITED', "
    "'FARM_CREATED', 'FARM_CLOSED', 'SUBSCRIPTION_CHANGED', "
    "'REFERRAL_ACTIVATED', 'BANK_PDF_GENERATED', 'CREDIT_SCORE_UPDATED'"
)

_EVENT_TYPES_029 = (
    _EVENT_TYPES_PRE_029
    + ", 'ADVISORY_READ', 'ONBOARDING_STARTED', 'ONBOARDING_COMPLETED'"
)


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. tenant.tis_advisories
    # ------------------------------------------------------------------
    # source_task_id is TEXT (not UUID) to match tenant.task_queue.task_id —
    # confirmed in Day 2 pre-flight. source_audit_id is UUID per audit.events.
    op.execute(
        """
        CREATE TABLE tenant.tis_advisories (
            advisory_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id         UUID NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
            user_id           UUID NOT NULL REFERENCES tenant.users(user_id),
            priority          VARCHAR(16) NOT NULL
                              CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
            preview           TEXT NOT NULL,
            full_message      TEXT NOT NULL,
            source_task_id    TEXT REFERENCES tenant.task_queue(task_id),
            source_audit_id   UUID REFERENCES audit.events(event_id),
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            read_at           TIMESTAMPTZ,
            dismissed_at      TIMESTAMPTZ
        )
        """
    )

    op.execute(
        """
        CREATE INDEX idx_tis_advisories_user_unread
          ON tenant.tis_advisories (user_id, created_at DESC)
          WHERE read_at IS NULL
        """
    )

    op.execute("ALTER TABLE tenant.tis_advisories ENABLE ROW LEVEL SECURITY")

    op.execute(
        """
        CREATE POLICY tis_advisories_tenant_isolation ON tenant.tis_advisories
          USING (tenant_id = (current_setting('app.tenant_id'))::uuid)
          WITH CHECK (tenant_id = (current_setting('app.tenant_id'))::uuid)
        """
    )

    # ------------------------------------------------------------------
    # 2. audit.events event_type extension
    # ------------------------------------------------------------------
    op.execute(
        "ALTER TABLE audit.events DROP CONSTRAINT audit_events_event_type_valid"
    )
    op.execute(
        "ALTER TABLE audit.events ADD CONSTRAINT audit_events_event_type_valid "
        f"CHECK (event_type IN ({_EVENT_TYPES_029}))"
    )

    # ------------------------------------------------------------------
    # 3. tenant.tenants onboarding state columns (Day 2 scope extension)
    # ------------------------------------------------------------------
    op.execute(
        "ALTER TABLE tenant.tenants ADD COLUMN onboarded_at TIMESTAMPTZ"
    )
    op.execute(
        "ALTER TABLE tenant.tenants ADD COLUMN section_term VARCHAR(16)"
    )
    op.execute(
        "ALTER TABLE tenant.tenants ADD COLUMN mode VARCHAR(16)"
    )
    op.execute(
        "ALTER TABLE tenant.tenants ADD CONSTRAINT tenants_section_term_check "
        "CHECK (section_term IS NULL OR section_term IN ('BLOCK','PLOT','BED','FIELD','PATCH'))"
    )
    op.execute(
        "ALTER TABLE tenant.tenants ADD CONSTRAINT tenants_mode_check "
        "CHECK (mode IS NULL OR mode IN ('SOLO','GROWTH','COMMERCIAL'))"
    )


def downgrade() -> None:
    # Reverse order of upgrade.

    # 3. tenant.tenants columns
    op.execute(
        "ALTER TABLE tenant.tenants DROP CONSTRAINT IF EXISTS tenants_mode_check"
    )
    op.execute(
        "ALTER TABLE tenant.tenants DROP CONSTRAINT IF EXISTS tenants_section_term_check"
    )
    op.execute("ALTER TABLE tenant.tenants DROP COLUMN IF EXISTS mode")
    op.execute("ALTER TABLE tenant.tenants DROP COLUMN IF EXISTS section_term")
    op.execute("ALTER TABLE tenant.tenants DROP COLUMN IF EXISTS onboarded_at")

    # 2. Revert event_type check to pre-029 set.
    op.execute(
        "ALTER TABLE audit.events DROP CONSTRAINT audit_events_event_type_valid"
    )
    op.execute(
        "ALTER TABLE audit.events ADD CONSTRAINT audit_events_event_type_valid "
        f"CHECK (event_type IN ({_EVENT_TYPES_PRE_029}))"
    )

    # 1. Drop tis_advisories.
    op.execute(
        "DROP POLICY IF EXISTS tis_advisories_tenant_isolation ON tenant.tis_advisories"
    )
    op.execute("DROP INDEX IF EXISTS tenant.idx_tis_advisories_user_unread")
    op.execute("DROP TABLE IF EXISTS tenant.tis_advisories")
