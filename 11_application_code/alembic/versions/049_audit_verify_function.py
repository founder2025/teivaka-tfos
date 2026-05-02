"""Add SECURITY DEFINER function audit.verify_event_by_hash for Phase 9-1.

Public unauth verify endpoint needs to look up audit.events by this_hash
across all tenants. audit.events has RLS enabled (audit_events_tenant_isolation
policy), so a normal session sees ZERO rows.

Solution: SECURITY DEFINER function owned by teivaka superuser bypasses RLS.
Function projection enforces the locked privacy contract at SQL layer:
  - Returns: event_type, occurred_at, farm_id (from payload), tenant_id (for chain walk only)
  - DOES NOT return: payload_jsonb, previous_hash, this_hash, event_id, user_id, etc.

Companion function audit.verify_chain_for_tenant returns only chain stats,
never event UUIDs or hashes.

Revision ID: 049_audit_verify_function
Revises: 048_flock_fk_to_event_log
"""
from alembic import op
import sqlalchemy as sa


revision = '049_audit_verify_function'
down_revision = '048_flock_fk_to_event_log'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # Function 1: lookup by hash, returns sanitized event row OR no rows
    conn.execute(sa.text("""
        CREATE OR REPLACE FUNCTION audit.verify_event_by_hash(p_hash CHAR(64))
        RETURNS TABLE (
            event_type TEXT,
            occurred_at TIMESTAMPTZ,
            farm_id TEXT,
            tenant_id UUID
        )
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog, public
        AS $$
        BEGIN
            RETURN QUERY
            SELECT
                ae.event_type::TEXT,
                ae.occurred_at,
                COALESCE(ae.payload_jsonb->>'farm_id', NULL)::TEXT AS farm_id,
                ae.tenant_id
            FROM audit.events ae
            WHERE ae.this_hash = p_hash
            LIMIT 1;
        END;
        $$;
    """))

    # Function 2: chain integrity stats for a tenant, returns only counts
    conn.execute(sa.text("""
        CREATE OR REPLACE FUNCTION audit.verify_chain_for_tenant(p_tenant_id UUID)
        RETURNS TABLE (
            total_events BIGINT,
            break_count BIGINT,
            verified_at TIMESTAMPTZ
        )
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog, public
        AS $$
        BEGIN
            RETURN QUERY
            WITH chain AS (
                SELECT
                    ae.event_id,
                    ae.previous_hash,
                    ae.this_hash,
                    LAG(ae.this_hash) OVER (ORDER BY ae.occurred_at ASC, ae.event_id ASC) AS expected_prev
                FROM audit.events ae
                WHERE ae.tenant_id = p_tenant_id
            )
            SELECT
                COUNT(*)::BIGINT AS total_events,
                COUNT(*) FILTER (
                    WHERE chain.previous_hash IS DISTINCT FROM chain.expected_prev
                    AND chain.expected_prev IS NOT NULL
                )::BIGINT AS break_count,
                now()::TIMESTAMPTZ AS verified_at
            FROM chain;
        END;
        $$;
    """))

    # Permissions: revoke from PUBLIC, grant to teivaka_app runtime role only
    conn.execute(sa.text("REVOKE ALL ON FUNCTION audit.verify_event_by_hash(CHAR(64)) FROM PUBLIC;"))
    conn.execute(sa.text("REVOKE ALL ON FUNCTION audit.verify_chain_for_tenant(UUID) FROM PUBLIC;"))
    conn.execute(sa.text("GRANT EXECUTE ON FUNCTION audit.verify_event_by_hash(CHAR(64)) TO teivaka_app;"))
    conn.execute(sa.text("GRANT EXECUTE ON FUNCTION audit.verify_chain_for_tenant(UUID) TO teivaka_app;"))

    # Performance index: single-column on this_hash for cross-tenant verify lookups.
    # The composite (tenant_id, this_hash) UNIQUE index can't service WHERE this_hash = :h efficiently.
    conn.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS idx_audit_events_this_hash
        ON audit.events (this_hash);
    """))


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DROP INDEX IF EXISTS audit.idx_audit_events_this_hash;"))
    conn.execute(sa.text("DROP FUNCTION IF EXISTS audit.verify_chain_for_tenant(UUID);"))
    conn.execute(sa.text("DROP FUNCTION IF EXISTS audit.verify_event_by_hash(CHAR(64));"))
