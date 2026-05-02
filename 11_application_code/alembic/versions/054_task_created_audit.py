"""Add TASK_CREATED to event_type_catalog and audit.events CHECK enum.

Phase 8-2: foundational audit event type for the automated task generator.
The generator does not currently emit TASK_CREATED itself (the source compliance
event is the audit anchor), but landing this in catalog + CHECK enum keeps the
door open for granular audit trails when downstream phases need them.

PRE-CHECK confirmed:
- TASK_CREATED missing from shared.event_type_catalog (TASK_COMPLETED/CANCELLED/ASSIGNED present)
- TASK_CREATED missing from audit.events.event_type CHECK enum
- CHECK enum format uses ::character varying (per migration 052 lesson, NOT ::text)

Strike #51 pattern applied: catalog INSERT + CHECK enum extension together.
Strike #53 lesson: revision id '054_task_created_audit' (22 chars, ≤32).

Revision ID: 054_task_created_audit
Revises: 053_seed_task_queue
"""
import re

from alembic import op
import sqlalchemy as sa


revision = '054_task_created_audit'
down_revision = '053_seed_task_queue'
branch_labels = None
depends_on = None


NEW_EVENT_TYPE = 'TASK_CREATED'


def upgrade():
    conn = op.get_bind()

    # 1. Catalog INSERT (idempotent)
    conn.execute(sa.text("""
        INSERT INTO shared.event_type_catalog
            (event_type, catalog_group, sort_order, is_user_facing, is_compound,
             livestock_only, min_role, min_mode, backdating_window_days, is_active, notes)
        VALUES
            ('TASK_CREATED', 'POULTRY', 250, FALSE, FALSE, FALSE,
             'WORKER', 'SOLO', 0, TRUE,
             'Phase 8-2: System-emitted when automated task generator creates a task_queue row.')
        ON CONFLICT (event_type) DO NOTHING;
    """))

    # 2. Extend audit.events.event_type CHECK constraint enum
    constraint_row = conn.execute(sa.text("""
        SELECT conname, pg_get_constraintdef(oid) AS defn
        FROM pg_constraint
        WHERE conrelid = 'audit.events'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%event_type%'
        LIMIT 1;
    """)).first()

    if constraint_row is None:
        return

    if NEW_EVENT_TYPE in constraint_row.defn:
        return

    constraint_name = constraint_row.conname
    match = re.search(r"ARRAY\[(.*?)\]", constraint_row.defn, re.DOTALL)
    if not match:
        raise RuntimeError(f"Cannot parse current event_type CHECK: {constraint_row.defn}")

    array_body = match.group(1)
    existing_values = re.findall(r"'([^']+)'::character varying", array_body)
    if not existing_values:
        raise RuntimeError(
            f"Parsed zero existing values from CHECK; refusing to recreate empty enum. "
            f"Body: {array_body[:200]}"
        )

    new_values = list(existing_values)
    if NEW_EVENT_TYPE not in new_values:
        new_values.append(NEW_EVENT_TYPE)

    conn.execute(sa.text(f"ALTER TABLE audit.events DROP CONSTRAINT {constraint_name};"))

    array_literal = ", ".join([f"'{v}'::character varying" for v in new_values])
    conn.execute(sa.text(
        f"ALTER TABLE audit.events ADD CONSTRAINT {constraint_name} "
        f"CHECK (((event_type)::text = ANY ((ARRAY[{array_literal}])::text[])));"
    ))


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM shared.event_type_catalog WHERE event_type = 'TASK_CREATED';"))
    # CHECK enum left permissive on downgrade (orphan-row protection per 052 pattern).
