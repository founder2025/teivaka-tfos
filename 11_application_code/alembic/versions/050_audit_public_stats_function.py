"""Add audit.public_chain_stats SECURITY DEFINER function for Phase 9-3 public landing page.

Returns aggregate-only stats across all tenants:
  - total_events: count of all rows in audit.events
  - tenant_count: count of distinct tenant_ids
  - chain_break_count: total chain breaks across all tenants
  - latest_bank_pdf_hash: hash of the most recent BANK_PDF_GENERATED event
    (used as a sample QR target on the about page; this is already public —
    it ships in PDF footers — so no privacy concern.)

Privacy contract: NO per-tenant data, NO event_type breakdown for non-bank events,
NO timestamps, NO farm IDs, NO user IDs. Aggregate counts + the one already-public
sample hash only.

Same Strike #38 pattern as 049: SECURITY DEFINER bypasses RLS; EXECUTE granted to
teivaka_app only; PUBLIC revoked.

Revision ID: 050_audit_public_stats
Revises: 049_audit_verify_function
"""
from alembic import op
import sqlalchemy as sa


revision = '050_audit_public_stats'
down_revision = '049_audit_verify_function'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    conn.execute(sa.text("""
        CREATE OR REPLACE FUNCTION audit.public_chain_stats()
        RETURNS TABLE (
            total_events BIGINT,
            tenant_count BIGINT,
            chain_break_count BIGINT,
            latest_bank_pdf_hash CHAR(64)
        )
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog, public
        AS $$
        BEGIN
            RETURN QUERY
            WITH chain AS (
                SELECT
                    ae.tenant_id,
                    ae.previous_hash,
                    LAG(ae.this_hash) OVER (PARTITION BY ae.tenant_id ORDER BY ae.occurred_at ASC, ae.event_id ASC) AS expected_prev
                FROM audit.events ae
            )
            SELECT
                (SELECT COUNT(*)::BIGINT FROM audit.events),
                (SELECT COUNT(DISTINCT tenant_id)::BIGINT FROM audit.events),
                (SELECT COUNT(*)::BIGINT FROM chain WHERE chain.previous_hash IS DISTINCT FROM chain.expected_prev AND chain.expected_prev IS NOT NULL),
                (SELECT this_hash FROM audit.events WHERE event_type = 'BANK_PDF_GENERATED' ORDER BY occurred_at DESC LIMIT 1)::CHAR(64);
        END;
        $$;
    """))

    conn.execute(sa.text("REVOKE ALL ON FUNCTION audit.public_chain_stats() FROM PUBLIC;"))
    conn.execute(sa.text("GRANT EXECUTE ON FUNCTION audit.public_chain_stats() TO teivaka_app;"))


def downgrade():
    op.get_bind().execute(sa.text("DROP FUNCTION IF EXISTS audit.public_chain_stats();"))
