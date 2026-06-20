"""150 - FORCE ROW LEVEL SECURITY on all RLS-enabled tenant.* tables

Revision ID: 150_force_rls_all_tenant
Revises: 149_add_setup_dismissed_at
Create Date: 2026-06-20

Foundation Audit N4. Records (in the migration chain) the FORCE applied to prod
via scripts/pending/force_rls_all_tenant_tables.sql on 2026-06-20, so fresh
deploys / disaster recovery inherit it instead of drifting.

Revision id kept <= 32 chars for tenant.alembic_version.version_num varchar(32)
(backlog B41 — widen the column before any longer id is used).

Context (verified on prod via scripts/audit_rls_check.sql): the runtime role
`teivaka_app` is non-owner + non-bypass, so ENABLE RLS already constrains it; the
owner `teivaka` is superuser + BYPASSRLS and bypasses RLS regardless of FORCE.
FORCE therefore adds defense-in-depth + consistency (32 stragglers brought in
line with the 30 already-forced tables) rather than closing an active runtime
hole — the active protection is that the app connects as teivaka_app, not
teivaka. The tenant.users isolation policy is permissive on a NULL/'' context,
so FORCE does not break the pre-context auth lookup.

Idempotent: only touches tenant.* tables that already have RLS ENABLED but not
FORCED. Does not enable RLS on tables that lack it (alembic_version, tenants —
intentionally un-RLS'd). Safe to re-run; a no-op on a DB where the SQL script
already applied it.

asyncpg: a single DO block is one statement (Strike #72).
"""
from alembic import op

revision = "150_force_rls_all_tenant"
down_revision = "149_add_setup_dismissed_at"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        DO $$
        DECLARE r record;
        BEGIN
          FOR r IN
            SELECT c.relname
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'tenant'
              AND c.relkind = 'r'
              AND c.relrowsecurity = true
              AND c.relforcerowsecurity = false
            ORDER BY c.relname
          LOOP
            EXECUTE format('ALTER TABLE tenant.%I FORCE ROW LEVEL SECURITY', r.relname);
          END LOOP;
        END $$;
        """
    )


def downgrade():
    op.execute(
        """
        DO $$
        DECLARE r record;
        BEGIN
          FOR r IN
            SELECT c.relname
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'tenant'
              AND c.relkind = 'r'
              AND c.relforcerowsecurity = true
            ORDER BY c.relname
          LOOP
            EXECUTE format('ALTER TABLE tenant.%I NO FORCE ROW LEVEL SECURITY', r.relname);
          END LOOP;
        END $$;
        """
    )
