"""132 — Audit chain: monotonic chain_seq + seal v1 history (Bank Evidence moat fix)

ROOT CAUSE of the "N breaks detected" banner: the chain was BUILT by linking to
the row with the latest user-supplied occurred_at, but VERIFIED by reconstructing
along occurred_at order. occurred_at is backdatable (every sale_date / planting_date
/ given_date), so backdated and same-timestamp events made the build order and the
verify order disagree → false "breaks". Not tampering — a wrong-axis design flaw
from migrations 023/049 (same root as backlog B69 "70 chain origins").

FIX (Operator-ratified "Seal & epoch" 2026-06-13):
  1. Add audit.events.chain_seq BIGSERIAL — a strictly monotonic, server-assigned
     insertion key. The correct axis for a tamper-evidence chain.
  2. Seal v1: record the max chain_seq now in audit.chain_seal. Historical hashes
     are LEFT UNTOUCHED (originals preserved; any dispatched Bank Evidence QR still
     resolves). The flawed-ordering history is sealed, not rewritten.
  3. verify_chain_for_tenant reconstructs by chain_seq ASC and counts breaks only
     in the post-seal (v2) window — so the active chain verifies clean while the
     sealed history is preserved as-is. total_events still reports the full count.

The companion app change (app/core/audit_chain.py) resolves previous_hash by
chain_seq DESC (true insertion tip) so every NEW event chains correctly.

Revision ID: 132_audit_chain_seq_seal
Revises: 131_pu_established_event
"""
from alembic import op
import sqlalchemy as sa

revision = "132_audit_chain_seq_seal"
down_revision = "131_pu_established_event"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # 1. Monotonic insertion key. BIGSERIAL backfills existing rows via its
    #    sequence (heap/insertion order — fine; pre-seal rows are sealed anyway)
    #    and auto-assigns every future insert.
    conn.execute(sa.text("ALTER TABLE audit.events ADD COLUMN IF NOT EXISTS chain_seq BIGSERIAL"))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_chainseq "
        "ON audit.events (tenant_id, chain_seq DESC)"))

    # 2. Seal v1 history (single row, id=1).
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS audit.chain_seal (
            id                INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            sealed_chain_seq  BIGINT NOT NULL,
            sealed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            reason            TEXT
        )
    """))
    conn.execute(sa.text("""
        INSERT INTO audit.chain_seal (id, sealed_chain_seq, reason)
        SELECT 1, COALESCE(MAX(chain_seq), 0),
               'Migration 132: v1 chain sealed (occurred_at-ordering flaw); v2 verifies by chain_seq.'
        FROM audit.events
        ON CONFLICT (id) DO NOTHING
    """))

    # 3. Verifier: reconstruct by chain_seq, count breaks only in the post-seal
    #    window. total_events stays the full tenant count for display continuity.
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
        DECLARE
            v_seal BIGINT;
        BEGIN
            SELECT sealed_chain_seq INTO v_seal FROM audit.chain_seal WHERE id = 1;
            v_seal := COALESCE(v_seal, 0);

            RETURN QUERY
            WITH active AS (
                SELECT
                    ae.previous_hash,
                    ae.this_hash,
                    LAG(ae.this_hash) OVER (ORDER BY ae.chain_seq ASC) AS expected_prev
                FROM audit.events ae
                WHERE ae.tenant_id = p_tenant_id
                  AND ae.chain_seq > v_seal
            )
            SELECT
                (SELECT COUNT(*)::BIGINT FROM audit.events e2 WHERE e2.tenant_id = p_tenant_id),
                COUNT(*) FILTER (
                    WHERE active.previous_hash IS DISTINCT FROM active.expected_prev
                      AND active.expected_prev IS NOT NULL
                )::BIGINT,
                now()::TIMESTAMPTZ
            FROM active;
        END;
        $$;
    """))
    conn.execute(sa.text("REVOKE ALL ON FUNCTION audit.verify_chain_for_tenant(UUID) FROM PUBLIC"))
    conn.execute(sa.text("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
                GRANT EXECUTE ON FUNCTION audit.verify_chain_for_tenant(UUID) TO teivaka_app;
            END IF;
        END $$
    """))


def downgrade():
    conn = op.get_bind()
    # Restore the v1 occurred_at-ordering verifier (the flawed one) for symmetry.
    conn.execute(sa.text("""
        CREATE OR REPLACE FUNCTION audit.verify_chain_for_tenant(p_tenant_id UUID)
        RETURNS TABLE (total_events BIGINT, break_count BIGINT, verified_at TIMESTAMPTZ)
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
        AS $$
        BEGIN
            RETURN QUERY
            WITH chain AS (
                SELECT ae.previous_hash, ae.this_hash,
                       LAG(ae.this_hash) OVER (ORDER BY ae.occurred_at ASC, ae.event_id ASC) AS expected_prev
                FROM audit.events ae WHERE ae.tenant_id = p_tenant_id
            )
            SELECT COUNT(*)::BIGINT,
                   COUNT(*) FILTER (WHERE chain.previous_hash IS DISTINCT FROM chain.expected_prev
                                      AND chain.expected_prev IS NOT NULL)::BIGINT,
                   now()::TIMESTAMPTZ
            FROM chain;
        END; $$;
    """))
    conn.execute(sa.text("DROP TABLE IF EXISTS audit.chain_seal"))
    conn.execute(sa.text("DROP INDEX IF EXISTS audit.idx_audit_events_tenant_chainseq"))
    conn.execute(sa.text("ALTER TABLE audit.events DROP COLUMN IF EXISTS chain_seq"))
