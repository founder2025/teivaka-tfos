"""015f - Fix referral_rewards RLS policy outlier (app.current_tenant_id → app.tenant_id)

Revision ID: 015f_fix_referral_rewards_rls
Revises: 015e_fix_financials_trigger_v2
Create Date: 2026-04-15

The referral_rewards policy was created in migration 014 with the
master-spec session-var name `app.current_tenant_id`. Deployed
convention is `app.tenant_id`. Result: reads return 0 rows for
everyone (var never set), writes were doubly broken (NULL WITH
CHECK + wrong USING).

015c added WITH CHECK to all tenant.* policies but preserved this
outlier verbatim. 015f fixes it.
"""
from alembic import op

revision = "015f_fix_referral_rewards_rls"
down_revision = "015e_fix_financials_trigger_v2"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        "DROP POLICY IF EXISTS referral_rewards_tenant_isolation ON tenant.referral_rewards",
        """
        CREATE POLICY referral_rewards_tenant_isolation ON tenant.referral_rewards
            FOR ALL
            USING      (tenant_id = current_setting('app.tenant_id')::uuid)
            WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid)
        """,
    ])


def downgrade():
    _exec_each([
        "DO $$ BEGIN RAISE WARNING 'Reverting referral_rewards RLS policy to broken outlier (app.current_tenant_id, no WITH CHECK).'; END $$",
        "DROP POLICY IF EXISTS referral_rewards_tenant_isolation ON tenant.referral_rewards",
        """
        CREATE POLICY referral_rewards_tenant_isolation ON tenant.referral_rewards
            FOR ALL
            USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        """,
    ])
