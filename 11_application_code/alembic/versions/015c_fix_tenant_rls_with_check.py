"""015c - Add WITH CHECK clauses to all tenant.* RLS policies

Revision ID: 015c_fix_tenant_rls_with_check
Revises: 015b_fix_field_event_whd_trigger
Create Date: 2026-04-15

Background
----------
38 policies on tenant.* tables were created with `FOR ALL ... USING (...)`
but no WITH CHECK clause. Postgres rule: a FOR ALL policy with NULL
WITH CHECK denies all INSERT and UPDATE operations. Reads worked,
writes silently failed (asyncpg masks RLS denial as
"relation does not exist"). Discovered when Phase 4a-5 T3
(harvest with override) returned 500.

This migration sweeps every affected policy and recreates it with
`WITH CHECK = USING` (symmetrical row visibility). DDL emitted
explicitly per policy for audit trail (no PL/pgSQL loop).

Outlier flagged
---------------
tenant.referral_rewards.referral_rewards_tenant_isolation uses
`app.current_tenant_id` (master-spec name) instead of `app.tenant_id`
(deployed convention). Preserved verbatim here — fixing in 015d so the
diff for this migration stays "WITH CHECK only".

Reversibility
-------------
Downgrade recreates each policy with USING only (no WITH CHECK).
Restores pre-015c behavior (writes denied via RLS).
"""
from alembic import op

revision = "015c_fix_tenant_rls_with_check"
down_revision = "015b_fix_field_event_whd_trigger"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


# (table, policy_name, using_expression)
# Enumerated from live pg_policy on 2026-04-15 — 38 policies.
_POLICIES = [
    ("accounts_receivable",       "accounts_receivable_tenant_isolation", "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("ai_commands",               "ai_commands_tenant_isolation",         "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("alerts",                    "alerts_tenant_isolation",              "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("automation_rules",          "automation_rules_tenant_isolation",    "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("cash_ledger",               "cash_ledger_tenant_isolation",         "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("customers",                 "customers_tenant_isolation",           "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("cycle_financials",          "cycle_financials_tenant_isolation",    "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("decision_signal_config",    "dsc_tenant_isolation",                 "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("decision_signal_snapshots", "dss_tenant_isolation",                 "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("delivery_log",              "delivery_log_tenant_isolation",        "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("equipment",                 "equipment_tenant_isolation",           "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("farms",                     "farms_tenant_isolation",               "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("field_events",              "field_events_tenant_isolation",        "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("harvest_log",               "harvest_log_tenant_isolation",         "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("harvest_loss",              "harvest_loss_tenant_isolation",        "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("hive_register",             "hive_register_tenant_isolation",       "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("income_log",                "income_log_tenant_isolation",          "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("input_transactions",        "input_transactions_tenant_isolation",  "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("inputs",                    "inputs_tenant_isolation",              "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("kb_embeddings",             "kb_embeddings_tenant_isolation",       "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("labor_attendance",          "labor_attendance_tenant_isolation",    "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("livestock_register",        "livestock_register_tenant_isolation",  "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("nursery_log",               "nursery_log_tenant_isolation",         "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("order_line_items",          "order_line_items_tenant_isolation",    "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("orders",                    "orders_tenant_isolation",              "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("price_master",              "price_master_tenant_isolation",        "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("production_cycles",         "cycles_tenant_isolation",              "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("production_units",          "production_units_tenant_isolation",    "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("profit_share",              "profit_share_tenant_isolation",        "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    # Outlier — preserved verbatim. Fix planned for 015d.
    ("referral_rewards",          "referral_rewards_tenant_isolation",    "(tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid)"),
    ("suppliers",                 "suppliers_tenant_isolation",           "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("task_queue",                "task_queue_tenant_isolation",          "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("tis_conversations",         "tis_conversations_tenant_isolation",   "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("tis_voice_logs",            "tis_voice_logs_tenant_isolation",      "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("users",                     "users_tenant_isolation",               "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("weather_log",               "weather_log_tenant_isolation",         "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("workers",                   "workers_tenant_isolation",             "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
    ("zones",                     "zones_tenant_isolation",               "(tenant_id = (current_setting('app.tenant_id'::text))::uuid)"),
]


def upgrade():
    statements = []
    for table, polname, expr in _POLICIES:
        statements.append(f"DROP POLICY IF EXISTS {polname} ON tenant.{table}")
        statements.append(
            f"CREATE POLICY {polname} ON tenant.{table} "
            f"FOR ALL USING {expr} WITH CHECK {expr}"
        )
    _exec_each(statements)


def downgrade():
    statements = []
    for table, polname, expr in _POLICIES:
        statements.append(f"DROP POLICY IF EXISTS {polname} ON tenant.{table}")
        statements.append(
            f"CREATE POLICY {polname} ON tenant.{table} "
            f"FOR ALL USING {expr}"
        )
    _exec_each(statements)
