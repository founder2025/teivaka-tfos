"""Phase PDFv1-pre — audit.report_exports table (Bank Evidence PDF spine)

Revision ID: 031_audit_report_exports
Revises: 030_force_tenant_rls
Create Date: 2026-04-27

Prereq for the Bank Evidence PDF service (Phase PDFv1). Tracks every
generated PDF for idempotency + dispatch state. One row per (tenant_id,
farm_id, period_start, period_end) generation; redispatch creates a new
row with dispatch_status='redispatched' (so the original artefact stays
traceable).

Hash-chain integrity is recorded at generation time via chain_first_event
/ chain_last_event / chain_verified_at / chain_verified_ok. The PDF
artefact itself is content-addressed by pdf_sha256; pdf_storage_url
points to durable storage (Supabase / S3).

RLS pattern matches audit.events:
- Session variable `app.tenant_id` (NOT `app.current_tenant_id` — master
  spec drift; deployed schema uses `app.tenant_id` per CLAUDE.md rule 11)
- Policy uses USING + WITH CHECK + soft-null fallback (`, true`) so that
  a missing session variable yields NULL match instead of raising. This
  is intentionally more defensive than audit.events (which uses USING
  only, hard-fail) because dispatch workers may briefly run outside an
  app session context.

Reference: 01_architecture/Phase_4_2_Task_Engine_Spec.md §Bank Evidence
"""
from alembic import op


revision = '031_audit_report_exports'
down_revision = '030_force_tenant_rls'
branch_labels = None
depends_on = None


def _exec_each(statements):
    for stmt in statements:
        op.execute(stmt)


def upgrade() -> None:
    _exec_each([
        "CREATE SCHEMA IF NOT EXISTS audit",
        """
        CREATE TABLE audit.report_exports (
            export_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id          UUID NOT NULL,
            farm_id            VARCHAR(64),
            period_start       DATE NOT NULL,
            period_end         DATE NOT NULL,
            event_count        INT NOT NULL DEFAULT 0,
            chain_first_event  UUID,
            chain_last_event   UUID,
            chain_verified_at  TIMESTAMPTZ,
            chain_verified_ok  BOOLEAN,
            pdf_sha256         CHAR(64),
            pdf_storage_url    TEXT,
            dispatched_at      TIMESTAMPTZ,
            dispatch_channel   VARCHAR(32),
            dispatch_recipient VARCHAR(128),
            dispatch_status    VARCHAR(32) DEFAULT 'pending',
            created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT chk_dispatch_status CHECK (dispatch_status IN
                ('pending', 'generated', 'queued', 'sent', 'failed', 'redispatched'))
        )
        """,
        """
        CREATE INDEX idx_report_exports_tenant_period
        ON audit.report_exports (tenant_id, period_start, period_end)
        """,
        """
        CREATE INDEX idx_report_exports_dispatch_status
        ON audit.report_exports (dispatch_status, created_at)
        WHERE dispatch_status IN ('pending', 'queued', 'failed')
        """,
        "ALTER TABLE audit.report_exports ENABLE ROW LEVEL SECURITY",
        """
        CREATE POLICY tenant_isolation ON audit.report_exports
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
        """,
    ])


def downgrade() -> None:
    _exec_each([
        "DROP POLICY IF EXISTS tenant_isolation ON audit.report_exports",
        "DROP INDEX IF EXISTS audit.idx_report_exports_dispatch_status",
        "DROP INDEX IF EXISTS audit.idx_report_exports_tenant_period",
        "DROP TABLE IF EXISTS audit.report_exports CASCADE",
    ])
