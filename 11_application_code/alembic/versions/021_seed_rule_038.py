"""021 - seed RULE-038 (ChemicalCompliance) into tenant.automation_rules

Revision ID: 021_seed_rule_038
Revises: 020_field_events_soft_delete
Create Date: 2026-04-20

Phase 4.1 Step 5. Backfills the FK target that lets the harvest override
alert row in tenant.alerts point at a real rule row (replaces the
metadata.rule_id workaround added in Step 4).

Tenant-id choice
----------------
`tenant.automation_rules.tenant_id` is NOT NULL and the table's PK is
`rule_id` alone, so one row covers the platform. The row is attributed to
the F001 tenant (a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11) because:

  * F001 is the only tenant that currently owns FOUNDER override activity,
  * tenant.alerts.rule_id FK checks ignore RLS and match on rule_id only,
    so alerts from any tenant can still link to this row,
  * the `increment_rule_count_on_alert` trigger scopes the counter update
    to (rule_id, tenant_id) and will simply no-op for non-F001 alerts —
    acceptable until multi-tenant rule seeding is addressed as a separate
    migration.

Downgrade removes the single row. Idempotent via ON CONFLICT.
"""
from alembic import op

revision = "021_seed_rule_038"
down_revision = "020_field_events_soft_delete"
branch_labels = None
depends_on = None


_SEED_TENANT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"

_WHATSAPP_TEMPLATE = (
    "\U0001F6A8 CRITICAL: Chemical compliance override\n"
    "Farm: {{farm_id}} / PU: {{pu_id}}\n"
    "Harvest: {{harvest_id}} forced by {{attempted_role}} {{attempted_by_user_id}}\n"
    "Blocking chemical: {{chem_name}}\n"
    "WHD remaining: {{whd_days_remaining}} days\n"
    "Reason: {{reason}}\n"
    "Override ID: {{override_id}}\n"
    "This is a recorded food-safety event."
)


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    op.execute(
        f"""
        INSERT INTO tenant.automation_rules (
            rule_id, tenant_id, rule_name, trigger_category, trigger_condition,
            action_type, action_description, alert_severity,
            whatsapp_template, notify_roles, auto_resolve, auto_resolve_condition,
            farm_specific, is_active
        ) VALUES (
            'RULE-038',
            '{_SEED_TENANT_ID}'::uuid,
            'ChemicalCompliance',
            'chemical_compliance',
            'harvest_compliance_overrides.approved = true',
            'ALERT',
            'Alerts when a FOUNDER overrides the chemical withholding period for a harvest. CRITICAL, cannot be dismissed.',
            'CRITICAL',
            $tpl${_WHATSAPP_TEMPLATE}$tpl$,
            ARRAY['FOUNDER','ADMIN']::text[],
            true,
            'last_chemical_date + whd_days <= CURRENT_DATE',
            false,
            true
        )
        ON CONFLICT (rule_id) DO NOTHING
        """
    )


def downgrade():
    op.execute("DELETE FROM tenant.automation_rules WHERE rule_id = 'RULE-038'")
