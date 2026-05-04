"""RLS context helper for raw psycopg2 worker code.

Workers that bypass FastAPI dependency injection (which sets app.tenant_id
automatically via SQLAlchemy events) must explicitly manage RLS context.

DOCTRINE — adopted Strike #95 after first-attempt 'bypass_rls' approach
discovered teivaka_app does not have BYPASSRLS and tenant.* policies cast
app.tenant_id::uuid (which crashes on empty string).

Cross-tenant work must be STRUCTURAL, not bypass-based:
  1. Query non-RLS tables (tenant.tenants is currently the only one) to get
     the tenant list
  2. For each tenant: with_rls(conn, tenant_id), then per-tenant queries

This makes cross-tenant scans visible in code. Future readers cannot miss
that the worker is iterating across the multi-tenant boundary.

Future evolution (B72): WORKER_DATABASE_URL using teivaka superuser (which
has BYPASSRLS) for genuinely cross-tenant aggregation. Out of Strike #95
scope.
"""
from contextlib import contextmanager


@contextmanager
def with_rls(conn, tenant_id: str):
    """Per-tenant RLS context. Use for tenant.* queries scoped to one tenant.

    Caller must be inside a transaction (BEGIN ... COMMIT or autocommit=False)
    because set_config(..., true) is transaction-local.

    Usage:
        with conn:  # transaction
            with with_rls(conn, tenant_id) as cur:
                cur.execute("SELECT * FROM tenant.farms WHERE ...")
                rows = cur.fetchall()
    """
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT set_config('app.tenant_id', %s, true)",
            (str(tenant_id),)
        )
        yield cur
    finally:
        cur.close()
