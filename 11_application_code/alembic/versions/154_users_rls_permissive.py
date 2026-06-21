"""154 - codify the permissive tenant.users RLS policy (DR/source-drift fix).

Revision ID: 154_users_rls_permissive
Revises: 153_revoke_audit_mutations
Create Date: 2026-06-21

Cluster 3.2 (tenant isolation — source-vs-prod drift / greenfield-auth landmine).

The LIVE prod policy on tenant.users is permissive-on-NULL:

    USING ( current_setting('app.tenant_id', true) IS NULL
            OR current_setting('app.tenant_id', true) = ''
            OR tenant_id::text = current_setting('app.tenant_id', true) )

This is REQUIRED and correct: the pre-login auth lookup (app/middleware/auth.py)
reads tenant.users by user_id BEFORE any tenant context exists, so the policy must
allow reads under a NULL/'' context. (Isolation is still preserved in practice
because that lookup is keyed by the globally-unique user_id.)

But NO migration ever created this policy — it was hand-applied on prod and is
untracked drift. The source of truth (02_tenant_schema.sql:110 and migration
015c:85) defines the STRICT form `tenant_id = current_setting('app.tenant_id')::uuid`.
So a fresh deploy / DR-rebuild-from-migrations would create the STRICT policy →
the pre-login lookup runs with no context → login breaks for everyone. Same class
of latent landmine as the 074 / 105 fixes: prod works, rebuild-from-scratch breaks,
and source lies about reality.

This migration makes source == live: drop whatever users policy exists and create
the permissive one verbatim. PROD is already correct, so on prod this is applied
STAMP-ONLY (no DDL touches the live auth policy — see runbook). On greenfield it
runs after 015c and replaces the strict policy with the permissive one.

asyncpg: one statement per op.execute (Strike #72). Apply as owner (Strike #123).
rev id 24 chars (<= 32, B41).

ROLLBACK WARNING: downgrade restores the STRICT policy, which BREAKS the pre-login
auth lookup. Only downgrade on a throwaway DB. To revert bookkeeping on prod use
`alembic stamp 153_revoke_audit_mutations` (pointer-only; leaves the live
permissive policy untouched).
"""
from alembic import op

revision = "154_users_rls_permissive"
down_revision = "153_revoke_audit_mutations"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("DROP POLICY IF EXISTS users_tenant_isolation ON tenant.users")
    op.execute(
        """
        CREATE POLICY users_tenant_isolation ON tenant.users
            USING (
                current_setting('app.tenant_id', true) IS NULL
                OR current_setting('app.tenant_id', true) = ''
                OR tenant_id::text = current_setting('app.tenant_id', true)
            )
        """
    )


def downgrade():
    # WARNING: the strict policy breaks the pre-login auth lookup. Throwaway DBs only.
    op.execute("DROP POLICY IF EXISTS users_tenant_isolation ON tenant.users")
    op.execute(
        "CREATE POLICY users_tenant_isolation ON tenant.users "
        "USING (tenant_id = current_setting('app.tenant_id')::uuid)"
    )
