"""emit_task — the single entry point for every task producer.

Every module that creates tasks (Automation Engine rules, Decision Engine
signals, Chemical Compliance, Rotation Gate, Cash Ledger, Weather, TIS
manual creation) calls this function. No other path writes to
tenant.task_queue.

Contract:
- Dedupes on (tenant_id, source_module, source_reference) where status='OPEN'
- If a matching OPEN task exists: updates imperative/rank/expires_at if changed,
  returns existing task_id. Does NOT create duplicate.
- If no match: INSERTs new row, returns new task_id.
- Does NOT emit audit.events — task CREATION is not audited, only
  COMPLETE/SKIP/CANCEL are. This is intentional per v4.1 §Bank Evidence:
  the audit chain records what the farmer DID, not what the system
  suggested.

Reference: 01_architecture/Phase_4_2_Task_Engine_Spec.md §5

Deployment target: /opt/teivaka/11_application_code/app/core/task_engine.py
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


SourceModule = Literal[
    "automation", "decision", "weather", "rotation",
    "compliance", "cash", "market", "manual", "tis",
]

InputHint = Literal[
    "none", "numeric_kg", "numeric_fjd", "photo",
    "text_short", "checklist", "confirm_yn",
]

DefaultOutcome = Literal["AUTO_SKIP", "AUTO_COMPLETE", "AUTO_ESCALATE"]

TaskType = Literal[
    "ALERT", "FIELD_TASK", "ORDER", "REMINDER", "INSPECTION", "OTHER",
]


async def emit_task(
    db: AsyncSession,
    tenant_id: UUID,
    farm_id: str,
    source_module: SourceModule,
    source_reference: str,
    imperative: str,
    rank: int,
    icon_key: str,
    input_hint: InputHint = "none",
    body_md: str | None = None,
    expires_at: datetime | None = None,
    default_outcome: DefaultOutcome | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    task_type: TaskType = "OTHER",
    title: str | None = None,
) -> UUID:
    """Upsert a task. Returns task_id.

    Args:
        db:                 Async SQLAlchemy session with tenant context set.
        tenant_id:          Tenant owning this task.
        source_module:      Which engine produced this task.
        source_reference:   Deterministic dedupe key. MUST be unique per
                            (tenant, module, logical task). Examples:
                              'RULE-038:PU002:2026-04-21'
                              'signal:cash_runway:2026-04-21'
                              'rotation_block:PU002:cycle_42'
        imperative:         ≤ 5 words ideally, ≤ 120 chars max. The single
                            sentence the farmer sees on the card.
        rank:               1-99 CRITICAL, 100-299 HIGH, 300-599 MEDIUM,
                            600-899 LOW, 900-999 OPTIONAL, 1000+ ADVISORY.
        icon_key:           lucide-react icon name (e.g. 'AlertTriangle',
                            'Droplet', 'Tractor'). Must be recognized by
                            the Solo shell icon resolver.
        input_hint:         If completion needs input from the farmer,
                            what kind. Default 'none' = DONE button alone
                            completes the task.
        body_md:             Optional detail shown only if HELP tapped.
        expires_at:         Auto-close at this time with default_outcome.
        default_outcome:    What happens if expires_at passes with no action.
        entity_type:        What tenant entity this task relates to (for
                            drill-down in Growth/Commercial). e.g. 'pu',
                            'cycle', 'cash_ledger_entry'.
        entity_id:          ID string for that entity.
        farm_id:            Which farm the task belongs to. NOT NULL in
                            tenant.task_queue with FK → tenant.farms. Every
                            task must be scoped to one farm. For tenant-wide
                            tasks, pass the tenant's primary farm.
        task_type:          High-level category enforced by CHECK constraint
                            on tenant.task_queue. Default 'OTHER'. Producers
                            that care (e.g. automation rules emitting ALERT
                            tasks, compliance emitting INSPECTION tasks) pass
                            the specific value.
        title:              TEXT NOT NULL on tenant.task_queue. If omitted,
                            defaults to imperative truncated to 120 chars.
                            Used for search / notification subject lines /
                            list views — imperative remains the card sentence.

    Raises:
        ValueError: on rank out of range, imperative too long, unknown
                    source_module, or unknown task_type.
    """
    # --- Validate -------------------------------------------------------
    if not (1 <= rank <= 9999):
        raise ValueError(f"rank must be 1-9999, got {rank}")
    if len(imperative) > 120:
        raise ValueError(f"imperative must be ≤120 chars, got {len(imperative)}")
    if source_module not in (
        "automation", "decision", "weather", "rotation",
        "compliance", "cash", "market", "manual", "tis",
    ):
        raise ValueError(f"unknown source_module: {source_module}")
    if task_type not in (
        "ALERT", "FIELD_TASK", "ORDER", "REMINDER", "INSPECTION", "OTHER",
    ):
        raise ValueError(f"unknown task_type: {task_type}")

    # Default title from imperative — the farmer sees imperative on the card;
    # title is only used for search/notification subject lines.
    effective_title = title if title is not None else imperative[:120]

    # --- Dedupe lookup --------------------------------------------------
    row = (
        await db.execute(
            text(
                """
                SELECT task_id, imperative, task_rank, expires_at
                FROM tenant.task_queue
                WHERE tenant_id = :tid
                  AND source_module = :sm
                  AND source_reference = :sr
                  AND status = 'OPEN'
                LIMIT 1
                """
            ),
            {"tid": str(tenant_id), "sm": source_module, "sr": source_reference},
        )
    ).first()

    if row is not None:
        existing_task_id, existing_imp, existing_rank, existing_expires = row

        # If anything material changed, update in place. Otherwise return unchanged.
        if (existing_imp != imperative
                or existing_rank != rank
                or existing_expires != expires_at):
            await db.execute(
                text(
                    """
                    UPDATE tenant.task_queue
                    SET imperative = :imp,
                        title = :title,
                        task_rank = :rank,
                        expires_at = :expires,
                        body_md = :body,
                        icon_key = :icon,
                        input_hint = :hint,
                        default_outcome = :outcome,
                        task_type = :ttype,
                        updated_at = NOW()
                    WHERE task_id = :tid
                    """
                ),
                {
                    "imp": imperative,
                    "title": effective_title,
                    "rank": rank,
                    "expires": expires_at,
                    "body": body_md,
                    "icon": icon_key,
                    "hint": input_hint,
                    "outcome": default_outcome,
                    "ttype": task_type,
                    "tid": str(existing_task_id),
                },
            )
        return existing_task_id

    # --- Insert new ----------------------------------------------------
    task_id = uuid4()
    await db.execute(
        text(
            """
            INSERT INTO tenant.task_queue (
                task_id, tenant_id, farm_id,
                imperative, title, task_type,
                task_rank, icon_key, input_hint,
                source_module, source_reference,
                body_md, expires_at, default_outcome,
                entity_type, entity_id,
                status, created_at
            ) VALUES (
                :task_id, :tenant_id, :farm_id,
                :imp, :title, :ttype,
                :rank, :icon, :hint,
                :sm, :sr,
                :body, :expires, :outcome,
                :etype, :eid,
                'OPEN', NOW()
            )
            """
        ),
        {
            "task_id": str(task_id),
            "tenant_id": str(tenant_id),
            "farm_id": farm_id,
            "imp": imperative,
            "title": effective_title,
            "ttype": task_type,
            "rank": rank,
            "icon": icon_key,
            "hint": input_hint,
            "sm": source_module,
            "sr": source_reference,
            "body": body_md,
            "expires": expires_at,
            "outcome": default_outcome,
            "etype": entity_type,
            "eid": entity_id,
        },
    )

    return task_id


async def expire_due_tasks(db: AsyncSession) -> int:
    """Sweep job — run every 15 minutes via Celery beat.

    For every OPEN task where expires_at < NOW():
      - If default_outcome == 'AUTO_COMPLETE': mark COMPLETED, emit audit.events
      - If default_outcome == 'AUTO_SKIP':     mark EXPIRED
      - If default_outcome == 'AUTO_ESCALATE': mark EXPIRED + emit critical alert
      - If default_outcome IS NULL:             mark EXPIRED

    Returns: number of tasks acted on.

    This is a separate function from emit_task because it is a system
    actor, not a producer. It does not own dedupe.
    """
    # Implementation stub — wire this up with audit_chain.emit_audit_event
    # when building Step 9 of Phase 4.2 (Automation Engine producers).
    # Placeholder: just count candidates for now.
    row = (
        await db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM tenant.task_queue
                WHERE status = 'OPEN'
                  AND expires_at IS NOT NULL
                  AND expires_at < NOW()
                """
            )
        )
    ).scalar_one()
    return int(row)
