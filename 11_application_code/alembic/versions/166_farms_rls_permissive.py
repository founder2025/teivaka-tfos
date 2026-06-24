"""166 - farms RLS permissive-on-empty-context (mirror users mig 154)

tenant.users was made permissive-on-empty (migration 154) so cross-tenant /
bootstrap reads via get_db (which sets app.tenant_id = '') work. tenant.farms was
NEVER given the same treatment, so it kept the STRICT policy
`tenant_id = current_setting('app.tenant_id')::uuid`. Under get_db's empty
context that evaluates `''::uuid` →

    asyncpg.exceptions.InvalidTextRepresentationError: invalid input syntax for type uuid: ""

i.e. EVERY cross-tenant farms read via get_db 500s — confirmed on
GET /api/v1/farm-map/network (the member map), and latent on global-pins +
/admin/analytics/map (same get_db cross-tenant pattern).

Fix: bring farms in line with users. READS are permissive-on-empty (so the
admin/bootstrap/cross-tenant get_db path works); WRITES stay STRICTLY scoped via
WITH CHECK (under empty context `tenant_id::text = ''` is false → no cross-tenant
INSERT/UPDATE can ever slip in — normal writes go through get_rls_db which sets a
real app.tenant_id). Tenant-scoped reads remain scoped (the third USING branch).

asyncpg: one statement per op.execute (Strike #72). Apply as owner (Strike #123).

ROLLBACK: downgrade restores the strict policy, which re-breaks cross-tenant farms
reads (admin map / global-pins / member map). Throwaway DBs only; on prod revert
bookkeeping with `alembic stamp 165_user_geo` and leave the live policy.
"""
from alembic import op

revision = "166_farms_rls_permissive"
down_revision = "165_user_geo"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("DROP POLICY IF EXISTS farms_tenant_isolation ON tenant.farms")
    op.execute(
        """
        CREATE POLICY farms_tenant_isolation ON tenant.farms
            USING (
                current_setting('app.tenant_id', true) IS NULL
                OR current_setting('app.tenant_id', true) = ''
                OR tenant_id::text = current_setting('app.tenant_id', true)
            )
            WITH CHECK (
                tenant_id::text = current_setting('app.tenant_id', true)
            )
        """
    )


def downgrade():
    # WARNING: the strict policy re-breaks cross-tenant farms reads. Throwaway DBs only.
    op.execute("DROP POLICY IF EXISTS farms_tenant_isolation ON tenant.farms")
    op.execute(
        "CREATE POLICY farms_tenant_isolation ON tenant.farms "
        "USING (tenant_id = current_setting('app.tenant_id')::uuid)"
    )
