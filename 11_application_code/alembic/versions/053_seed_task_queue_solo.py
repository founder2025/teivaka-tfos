"""Seed tenant.task_queue with 3 OPEN tasks for Operator's tenant — Phase 8-1.

Strike #59: PRE-CHECK found existing 347-line SoloTaskCard.jsx + /api/v1/tasks/next +
tenant.task_queue infrastructure already shipped (CLAUDE.md Section 14 doc drift).
The actual gap was that task_queue had 0 OPEN rows — pipeline operational but unfed.

This migration seeds 3 placeholder tasks for Operator's tenant (F001-A0EE) so the
existing Solo Voice surface renders real data end-to-end. Phase 8-2 builds the
automated task generator (Compliance → task_queue, Decision Engine → task_queue).

Schema reality (verified pre-migration):
  - task_id column is TEXT, but Pydantic TaskOut model expects UUID — must use UUIDs
  - task_type CHECK: ALERT|FIELD_TASK|ORDER|REMINDER|INSPECTION|OTHER  → use REMINDER
  - status CHECK: OPEN|COMPLETED|SKIPPED|EXPIRED|CANCELLED              → use OPEN
  - priority CHECK: CRITICAL|HIGH|MEDIUM|LOW                            → use MEDIUM
  - source_module CHECK: automation|decision|weather|rotation|compliance|cash|market|manual|tis
                                                                         → use 'manual'
  - imperative is the field SoloTaskCard renders (line 229); title is internal
  - task_rank controls order via /tasks/next ORDER BY task_rank ASC
  - source_reference is free-form — use 'phase_8_1_seed' for clean downgrade

Revision ID: 053_seed_task_queue
Revises: 052_vaccine_withholding
"""
from alembic import op


revision = '053_seed_task_queue'
down_revision = '052_vaccine_withholding'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        INSERT INTO tenant.task_queue
            (task_id, tenant_id, farm_id, task_type, title, imperative, body_md,
             priority, status, task_rank, source_module, source_reference, icon_key)
        SELECT
            gen_random_uuid()::text AS task_id,
            (SELECT tenant_id FROM tenant.farms WHERE farm_id = 'F001-A0EE' LIMIT 1) AS tenant_id,
            'F001-A0EE' AS farm_id,
            'REMINDER' AS task_type,
            t.title,
            t.imperative,
            t.body_md,
            'MEDIUM' AS priority,
            'OPEN' AS status,
            t.task_rank,
            'manual' AS source_module,
            'phase_8_1_seed' AS source_reference,
            'default' AS icon_key
        FROM (VALUES
            ('Daily check water', 'Check water for goats',
             'Make sure the water trough has fresh clean water. Goats drink a lot in the heat.',
             100),
            ('Daily egg count', 'Count eggs collected today',
             'Walk through the coop and count any eggs you find. Write the number down or log it in the app.',
             200),
            ('Daily flock health scan', 'Look at flock for sick birds',
             'Look at each bird in the flock. Note any that look sick, slow, or have strange feathers.',
             300)
        ) AS t(title, imperative, body_md, task_rank)
        WHERE EXISTS (SELECT 1 FROM tenant.farms WHERE farm_id = 'F001-A0EE');
    """)


def downgrade():
    op.execute("""
        DELETE FROM tenant.task_queue
        WHERE source_reference = 'phase_8_1_seed' AND farm_id = 'F001-A0EE';
    """)
