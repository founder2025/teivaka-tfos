"""Phase 4.2 — Task Engine v4 extensions to tenant.task_queue

Revision ID: 022_task_engine_v4
Revises: 021_seed_rule_038
Create Date: 2026-04-21

Adds 13 new columns to tenant.task_queue to support the Task Engine as the
v4.1 nervous system. Extends existing task_queue table; does NOT replace it.
Adds two indexes (rank-ordered queue scan + expiry sweep).

Contract:
- Every task row MUST have: tenant_id, imperative, task_rank, source_module,
  source_reference, icon_key, status.
- Dedupe key: (tenant_id, source_module, source_reference) where status = 'OPEN'.
- Rank ranges (reserved):
    1-99     CRITICAL
    100-299  HIGH
    300-599  MEDIUM
    600-899  LOW
    900-999  OPTIONAL
    1000+    ADVISORY (Growth/Commercial dashboard only, never Solo)

Reference: 01_architecture/Phase_4_2_Task_Engine_Spec.md §2
Reference: 01_architecture/TFOS_v4_1_Execution_Reality_Addendum.md §Task Engine

IMPORTANT — down_revision: set to whatever the current alembic head is on the
server at deploy time. Run `alembic current` inside teivaka_api to confirm.
If 017 is still the head (i.e. 018-021 never shipped), set down_revision to
'017_community_schema'. If 021 is the head, set to '021_rule_038_seed'.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '022_task_engine_v4'
down_revision = '021_seed_rule_038'  # Current head confirmed 2026-04-21
branch_labels = None
depends_on = None


def _exec_each(statements):
    """asyncpg rejects multi-statement strings in op.execute(). Split each DDL
    into its own call. Required by v3 Master Build Instruction Part 4.
    """
    for stmt in statements:
        op.execute(stmt)


def upgrade() -> None:
    # --- 1. Add 13 new columns to tenant.task_queue -----------------------
    # Defaults chosen so existing rows remain valid after migration.
    _exec_each([
        "ALTER TABLE tenant.task_queue ADD COLUMN IF NOT EXISTS task_rank INT NOT NULL DEFAULT 1000",
        "ALTER TABLE tenant.task_queue ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL",
        "ALTER TABLE tenant.task_queue ADD COLUMN IF NOT EXISTS default_outcome VARCHAR(32) NULL",
        "ALTER TABLE tenant.task_queue ADD COLUMN IF NOT EXISTS voice_playback_url TEXT NULL",
        "ALTER TABLE tenant.task_queue ADD COLUMN IF NOT EXISTS icon_key VARCHAR(64) NOT NULL DEFAULT 'default'",
        "ALTER TABLE tenant.task_queue ADD COLUMN IF NOT EXISTS input_hint VARCHAR(32) NULL",
        "ALTER TABLE tenant.task_queue ADD COLUMN IF NOT EXISTS source_module VARCHAR(64) NOT NULL DEFAULT 'manual'",
        "ALTER TABLE tenant.task_queue ADD COLUMN IF NOT EXISTS source_reference VARCHAR(128) NULL",
        "ALTER TABLE tenant.task_queue ADD COLUMN IF NOT EXISTS imperative VARCHAR(120) NOT NULL DEFAULT 'Task'",
        "ALTER TABLE tenant.task_queue ADD COLUMN IF NOT EXISTS body_md TEXT NULL",
        "ALTER TABLE tenant.task_queue ADD COLUMN IF NOT EXISTS entity_type VARCHAR(64) NULL",
        "ALTER TABLE tenant.task_queue ADD COLUMN IF NOT EXISTS entity_id VARCHAR(64) NULL",
        "ALTER TABLE tenant.task_queue ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'OPEN'",
    ])

    # --- 2. Remove now-unwanted defaults on NOT NULL required columns ----
    # Defaults above were transitional (to keep existing rows valid). New rows
    # must explicitly provide these values.
    _exec_each([
        "ALTER TABLE tenant.task_queue ALTER COLUMN source_module DROP DEFAULT",
        "ALTER TABLE tenant.task_queue ALTER COLUMN imperative DROP DEFAULT",
    ])

    # --- 3. Check constraint: valid status values ------------------------
    _exec_each([
        """
        ALTER TABLE tenant.task_queue
        ADD CONSTRAINT task_queue_status_valid
        CHECK (status IN ('OPEN', 'COMPLETED', 'SKIPPED', 'EXPIRED', 'CANCELLED'))
        """,
    ])

    # --- 4. Check constraint: valid source_module values -----------------
    _exec_each([
        """
        ALTER TABLE tenant.task_queue
        ADD CONSTRAINT task_queue_source_module_valid
        CHECK (source_module IN (
            'automation', 'decision', 'weather', 'rotation',
            'compliance', 'cash', 'market', 'manual', 'tis'
        ))
        """,
    ])

    # --- 5. Check constraint: valid default_outcome ----------------------
    _exec_each([
        """
        ALTER TABLE tenant.task_queue
        ADD CONSTRAINT task_queue_default_outcome_valid
        CHECK (default_outcome IS NULL OR default_outcome IN (
            'AUTO_SKIP', 'AUTO_COMPLETE', 'AUTO_ESCALATE'
        ))
        """,
    ])

    # --- 6. Check constraint: valid input_hint ---------------------------
    _exec_each([
        """
        ALTER TABLE tenant.task_queue
        ADD CONSTRAINT task_queue_input_hint_valid
        CHECK (input_hint IS NULL OR input_hint IN (
            'none', 'numeric_kg', 'numeric_fjd', 'photo', 'text_short',
            'checklist', 'confirm_yn'
        ))
        """,
    ])

    # --- 7. Indexes -----------------------------------------------------
    # idx_task_queue_rank: Solo mode reads WHERE status='OPEN' ORDER BY task_rank ASC
    # idx_task_queue_expires: expiry sweep reads WHERE expires_at < NOW() AND status='OPEN'
    # idx_task_queue_dedupe: UPSERT lookup on source_module + source_reference
    _exec_each([
        """
        CREATE INDEX IF NOT EXISTS idx_task_queue_rank
        ON tenant.task_queue (tenant_id, status, task_rank)
        WHERE status = 'OPEN'
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_task_queue_expires
        ON tenant.task_queue (expires_at)
        WHERE status = 'OPEN' AND expires_at IS NOT NULL
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_task_queue_dedupe
        ON tenant.task_queue (tenant_id, source_module, source_reference)
        WHERE status = 'OPEN'
        """,
    ])

    # --- 8. Ensure RLS is enabled (should already be) --------------------
    # tenant.task_queue inherits the standard tenant isolation policy. This
    # migration does NOT create the policy (assumed already in place from
    # migration 001 or equivalent). Verify with:
    #   SELECT * FROM pg_policies WHERE tablename = 'task_queue';
    # If missing, create.
    #
    # Session variable name is `app.tenant_id` — deployed convention, not
    # `app.current_tenant_id` (which is master-doc drift).
    _exec_each([
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies
                WHERE schemaname = 'tenant'
                  AND tablename = 'task_queue'
                  AND policyname = 'task_queue_tenant_isolation'
            ) THEN
                EXECUTE 'ALTER TABLE tenant.task_queue ENABLE ROW LEVEL SECURITY';
                EXECUTE 'CREATE POLICY task_queue_tenant_isolation ON tenant.task_queue '
                        'USING (tenant_id = current_setting(''app.tenant_id'')::uuid)';
            END IF;
        END $$
        """,
    ])


def downgrade() -> None:
    # Reverse in opposite order. IF EXISTS guards every step.
    _exec_each([
        "DROP INDEX IF EXISTS tenant.idx_task_queue_dedupe",
        "DROP INDEX IF EXISTS tenant.idx_task_queue_expires",
        "DROP INDEX IF EXISTS tenant.idx_task_queue_rank",
        "ALTER TABLE tenant.task_queue DROP CONSTRAINT IF EXISTS task_queue_input_hint_valid",
        "ALTER TABLE tenant.task_queue DROP CONSTRAINT IF EXISTS task_queue_default_outcome_valid",
        "ALTER TABLE tenant.task_queue DROP CONSTRAINT IF EXISTS task_queue_source_module_valid",
        "ALTER TABLE tenant.task_queue DROP CONSTRAINT IF EXISTS task_queue_status_valid",
        "ALTER TABLE tenant.task_queue DROP COLUMN IF EXISTS status",
        "ALTER TABLE tenant.task_queue DROP COLUMN IF EXISTS entity_id",
        "ALTER TABLE tenant.task_queue DROP COLUMN IF EXISTS entity_type",
        "ALTER TABLE tenant.task_queue DROP COLUMN IF EXISTS body_md",
        "ALTER TABLE tenant.task_queue DROP COLUMN IF EXISTS imperative",
        "ALTER TABLE tenant.task_queue DROP COLUMN IF EXISTS source_reference",
        "ALTER TABLE tenant.task_queue DROP COLUMN IF EXISTS source_module",
        "ALTER TABLE tenant.task_queue DROP COLUMN IF EXISTS input_hint",
        "ALTER TABLE tenant.task_queue DROP COLUMN IF EXISTS icon_key",
        "ALTER TABLE tenant.task_queue DROP COLUMN IF EXISTS voice_playback_url",
        "ALTER TABLE tenant.task_queue DROP COLUMN IF EXISTS default_outcome",
        "ALTER TABLE tenant.task_queue DROP COLUMN IF EXISTS expires_at",
        "ALTER TABLE tenant.task_queue DROP COLUMN IF EXISTS task_rank",
    ])
