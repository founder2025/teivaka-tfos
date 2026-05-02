"""Automated task generator — Phase 8-2.

Pure functions called from event handlers when compliance triggers fire.
Creates idempotent task_queue rows; auto-closes on resolution event.

Strike #59: builds on existing task_queue infrastructure (Phase 4.2). Does NOT
create parallel tables.
Strike #60: task_id generated via gen_random_uuid()::text to match TaskOut UUID model.

PRE-CHECK reality (per Phase 8-2 spec deviations):
- source_module CHECK enum allows: automation|decision|weather|rotation|compliance|cash|market|manual|tis
  → use 'compliance' (not 'compliance_auto' as spec said)
- status CHECK enum allows: OPEN|COMPLETED|SKIPPED|EXPIRED|CANCELLED
  → use 'COMPLETED' for auto-close (user did the work; system observed via resolution event)
- Resolution timestamp column is 'completed_at' (not 'closed_at' as spec said)
- 'title' is NOT NULL — must populate alongside 'imperative'
"""

from typing import Optional
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


SOURCE_MODULE = "compliance"


async def task_already_exists(
    db: AsyncSession,
    tenant_id: UUID,
    entity_type: str,
    entity_id: str,
    title_marker: str,
) -> bool:
    """Idempotency check: is there an OPEN compliance task for this entity matching this title pattern?"""
    result = await db.execute(text("""
        SELECT 1 FROM tenant.task_queue
        WHERE tenant_id = :tid
          AND status = 'OPEN'
          AND entity_type = :et
          AND entity_id = :eid
          AND source_module = :src
          AND title = :title_marker
        LIMIT 1
    """), {
        "tid": str(tenant_id),
        "et": entity_type,
        "eid": entity_id,
        "src": SOURCE_MODULE,
        "title_marker": title_marker,
    })
    return result.first() is not None


async def create_compliance_task(
    db: AsyncSession,
    tenant_id: UUID,
    farm_id: str,
    entity_type: str,
    entity_id: str,
    title: str,
    imperative: str,
    description: str,
    priority: str = "HIGH",
    task_rank: int = 500,
) -> Optional[str]:
    """Create OPEN task if no matching OPEN task already exists for this entity+title.

    Returns the new task_id, or None if skipped via idempotency check.

    `title` is the internal stable identifier used for idempotency (e.g.
    'auto:severe_health:flock_id'). `imperative` is what the farmer reads
    (≤5 words; truncated to 60 chars per Section 5 reading-load proxy).
    """
    imperative = imperative[:60].strip()

    if await task_already_exists(db, tenant_id, entity_type, entity_id, title):
        return None

    result = await db.execute(text("""
        INSERT INTO tenant.task_queue
            (task_id, tenant_id, farm_id, task_type, title, imperative, body_md,
             priority, status, task_rank, source_module, source_reference,
             entity_type, entity_id, icon_key)
        VALUES
            (gen_random_uuid()::text, :tid, :fid, 'REMINDER', :title, :imp, :desc,
             :pri, 'OPEN', :rank, :src, 'phase_8_2_auto',
             :et, :eid, 'default')
        RETURNING task_id
    """), {
        "tid": str(tenant_id),
        "fid": farm_id,
        "title": title,
        "imp": imperative,
        "desc": description,
        "pri": priority,
        "rank": task_rank,
        "src": SOURCE_MODULE,
        "et": entity_type,
        "eid": entity_id,
    })
    row = result.first()
    return row.task_id if row else None


async def close_compliance_tasks_for_entity(
    db: AsyncSession,
    tenant_id: UUID,
    entity_type: str,
    entity_id: str,
    title_prefix: Optional[str] = None,
) -> int:
    """Close all OPEN compliance tasks for this entity.

    Status transitions OPEN -> COMPLETED. Used when a resolution event fires
    (e.g. CLEARED HEALTH_OBSERVATION closes 'auto:severe_health:*' tasks).
    """
    params = {
        "tid": str(tenant_id),
        "et": entity_type,
        "eid": entity_id,
        "src": SOURCE_MODULE,
    }
    sql = """
        UPDATE tenant.task_queue
        SET status = 'COMPLETED', completed_at = now(), updated_at = now()
        WHERE tenant_id = :tid
          AND status = 'OPEN'
          AND entity_type = :et
          AND entity_id = :eid
          AND source_module = :src
    """
    if title_prefix:
        sql += " AND title LIKE :pattern"
        params["pattern"] = f"{title_prefix}%"

    sql += " RETURNING task_id"
    result = await db.execute(text(sql), params)
    return len(result.fetchall())


# ─── COMPLIANCE TASK FACTORIES ────────────────────────────────


def severe_health_task(flock_id: str, flock_label: str, qty_affected: Optional[int]) -> tuple[str, str, str]:
    """Returns (title, imperative, description) for SEVERE health auto-task."""
    title = f"auto:severe_health:{flock_id}"
    imperative = f"Check sick birds {flock_label}"[:60]
    if qty_affected:
        description = f"{qty_affected} birds showed severe symptoms. Check the flock and log a CLEARED health observation when ready."
    else:
        description = "Severe health issue logged. Check the flock and log a CLEARED health observation when ready."
    return title, imperative, description


def vaccination_withholding_task(
    flock_id: str,
    flock_label: str,
    vaccine_name: str,
    days_remaining: int,
    sale_kind: str,
) -> tuple[str, str, str]:
    """Returns (title, imperative, description) for vaccination withholding auto-task."""
    title = f"auto:vaccine_withhold:{flock_id}"
    imperative = f"{flock_label} clears {days_remaining}d"[:60]
    description = (
        f"{vaccine_name} {sale_kind} withholding active. "
        f"{days_remaining} day(s) until {flock_label} can sell {sale_kind}."
    )
    return title, imperative, description
