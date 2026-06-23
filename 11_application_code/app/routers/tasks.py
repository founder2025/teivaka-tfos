"""Phase 4.2 Step 5-6 — Task API endpoints.

Five endpoints that farmers (and UI) hit for the Task Engine:
  GET  /api/v1/tasks/next                 — Solo-mode single card
  GET  /api/v1/tasks                      — Growth/Commercial list w/ filters
  POST /api/v1/tasks/{id}/complete        — Mark COMPLETED, emit audit
  POST /api/v1/tasks/{id}/skip            — Mark SKIPPED, emit audit
  POST /api/v1/tasks/{id}/help            — Return body_md + KB refs (no state change)

All endpoints:
  - Require authentication (get_current_user)
  - Set tenant context for RLS (set_tenant_context)
  - Wrap responses in the Part 13 envelope: {status, data, meta}
  - Emit audit.events for every state-changing action (COMPLETE/SKIP)

Deployment target: /opt/teivaka/11_application_code/app/routers/tasks.py
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Deployed layout: get_current_user is provided by app.middleware.rls
# and returns a dict (keys: tenant_id, user_id, role, tier). All
# user.X attribute access in this file is user["X"].
from app.middleware.rls import get_current_user
from app.core.audit_chain import emit_audit_event
from app.db.session import get_db
from app.deps.tasks import (
    load_open_task,
    set_tenant_context,
)
from app.schemas.tasks import (
    KBArticleRef,
    RANK_BAND_RANGES,
    RankBand,
    SourceModule,
    TaskCompleteIn,
    TaskCompleteOut,
    TaskHelpOut,
    TaskListOut,
    TaskOut,
    TaskSkipIn,
    TaskSkipOut,
    TaskStatus,
)


# Prefix is applied in app/main.py via include_router(..., prefix=f"{PREFIX}/tasks")
# — matches the convention of all other routers in this repo. Do NOT set a prefix
# here; it concatenates with main.py's prefix and produces /api/v1/tasks/api/v1/tasks/...
router = APIRouter(tags=["tasks"])


# --- Helpers ---------------------------------------------------------

def _envelope_ok(data):
    return {
        "status": "success",
        "data": data,
        "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
    }


def _row_to_task_out(row) -> TaskOut:
    """Map an asyncpg row into the TaskOut schema."""
    return TaskOut(
        task_id=row.task_id,
        imperative=row.imperative,
        task_rank=row.task_rank,
        icon_key=row.icon_key,
        input_hint=row.input_hint or "none",
        body_md=row.body_md,
        due_date=row.due_date,
        expires_at=row.expires_at,
        default_outcome=row.default_outcome,
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        source_module=row.source_module,
        source_reference=row.source_reference,
        voice_playback_url=row.voice_playback_url,
        status=row.status,
        created_at=row.created_at,
    )


async def _fetch_next_task(db: AsyncSession, tenant_id: UUID) -> TaskOut | None:
    """Return the lowest-rank OPEN task that is due today or earlier.

    The due_date predicate hides scheduled-future reminders (e.g. WHD
    clearance seeds) until their day arrives. Tasks with NULL due_date
    are immediate and always eligible.
    """
    row = (
        await db.execute(
            text(
                """
                SELECT task_id, imperative, task_rank, icon_key, input_hint,
                       body_md, due_date, expires_at, default_outcome,
                       entity_type, entity_id, source_module,
                       source_reference, voice_playback_url, status,
                       created_at
                FROM tenant.task_queue
                WHERE tenant_id = :tid
                  AND status = 'OPEN'
                  AND (expires_at IS NULL OR expires_at > NOW())
                  AND (due_date IS NULL OR due_date <= CURRENT_DATE)
                ORDER BY task_rank ASC, created_at ASC
                LIMIT 1
                """
            ),
            {"tid": str(tenant_id)},
        )
    ).first()
    return _row_to_task_out(row) if row else None


def _validate_input_against_hint(hint: str, value):
    """Raise 422 if the completion input_value doesn't match the task's hint."""
    if hint == "none":
        if value is not None:
            raise HTTPException(422, {"code": "INVALID_INPUT", "message": "Task requires no input; input_value must be null"})
        return
    if hint == "numeric_kg" or hint == "numeric_fjd":
        if not isinstance(value, str):
            raise HTTPException(422, {"code": "INVALID_INPUT", "message": f"{hint} requires a decimal string"})
        try:
            n = float(value)
        except (TypeError, ValueError):
            raise HTTPException(422, {"code": "INVALID_INPUT", "message": f"{hint} value is not a decimal"})
        if n < 0:
            raise HTTPException(422, {"code": "INVALID_INPUT", "message": f"{hint} must be non-negative"})
        return
    if hint == "text_short":
        if not isinstance(value, str) or len(value) > 200:
            raise HTTPException(422, {"code": "INVALID_INPUT", "message": "text_short must be a string ≤ 200 chars"})
        return
    if hint == "photo":
        if not isinstance(value, str) or not value.startswith(("http://", "https://")):
            raise HTTPException(422, {"code": "INVALID_INPUT", "message": "photo value must be an http(s) URL"})
        return
    if hint == "checklist":
        if not isinstance(value, list) or not all(isinstance(b, bool) for b in value):
            raise HTTPException(422, {"code": "INVALID_INPUT", "message": "checklist must be a list of booleans"})
        return
    if hint == "confirm_yn":
        if not isinstance(value, bool):
            raise HTTPException(422, {"code": "INVALID_INPUT", "message": "confirm_yn must be true/false"})
        return


# --- Endpoints -------------------------------------------------------

@router.get("/next", response_model=None)
async def get_next_task(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Solo-mode single card. Returns the highest-priority OPEN task.

    Returns null data if no OPEN tasks exist.
    """
    await set_tenant_context(db, user["tenant_id"])
    task = await _fetch_next_task(db, user["tenant_id"])
    return _envelope_ok(task.model_dump(mode="json") if task else None)


@router.get("", response_model=None)
async def list_tasks(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    status_filter: TaskStatus | None = Query(default=TaskStatus.OPEN, alias="status"),
    rank_band: RankBand | None = None,
    source_module: SourceModule | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    include_future: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    """Growth/Commercial list view with filters.

    Default: status='OPEN', sorted by task_rank ASC, limit 50.

    By default future-dated tasks (due_date > today) are hidden so the
    farmer view matches /tasks/next. Pass include_future=true to surface
    the full scheduled queue (admin / planning views).
    """
    await set_tenant_context(db, user["tenant_id"])

    where_clauses = ["tenant_id = :tid"]
    params: dict = {"tid": str(user["tenant_id"]), "limit": limit, "offset": offset}

    if status_filter is not None:
        where_clauses.append("status = :status")
        params["status"] = status_filter.value

    if rank_band is not None:
        lo, hi = RANK_BAND_RANGES[rank_band]
        where_clauses.append("task_rank BETWEEN :rank_lo AND :rank_hi")
        params["rank_lo"] = lo
        params["rank_hi"] = hi

    if source_module is not None:
        where_clauses.append("source_module = :sm")
        params["sm"] = source_module.value

    if entity_type is not None:
        where_clauses.append("entity_type = :etype")
        params["etype"] = entity_type

    if entity_id is not None:
        where_clauses.append("entity_id = :eid")
        params["eid"] = entity_id

    if not include_future:
        where_clauses.append("(due_date IS NULL OR due_date <= CURRENT_DATE)")

    where_sql = " AND ".join(where_clauses)

    count_row = (
        await db.execute(
            text(f"SELECT COUNT(*) FROM tenant.task_queue WHERE {where_sql}"),
            params,
        )
    ).scalar_one()

    rows = (
        await db.execute(
            text(
                f"""
                SELECT task_id, imperative, task_rank, icon_key, input_hint,
                       body_md, due_date, expires_at, default_outcome,
                       entity_type, entity_id, source_module,
                       source_reference, voice_playback_url, status,
                       created_at
                FROM tenant.task_queue
                WHERE {where_sql}
                ORDER BY task_rank ASC, created_at ASC
                LIMIT :limit OFFSET :offset
                """
            ),
            params,
        )
    ).fetchall()

    tasks = [_row_to_task_out(r) for r in rows]
    return _envelope_ok(
        TaskListOut(total=int(count_row), tasks=tasks).model_dump(mode="json")
    )


@router.post("/{task_id}/complete", response_model=None)
async def complete_task(
    task_id: UUID,
    body: TaskCompleteIn,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark task COMPLETED.

    - Validates input_value against task.input_hint
    - Updates task_queue row
    - Emits audit.events TASK_COMPLETED (hash chain continues)
    - Returns the next OPEN task in the same response (Solo-mode preload)
    - Idempotent on offline_id: if the same offline_id is received twice,
      return the prior result instead of double-emitting audit
    """
    await set_tenant_context(db, user["tenant_id"])

    # Idempotency check via offline_id — dedupe before touching state
    if body.offline_id:
        prior = (
            await db.execute(
                text(
                    """
                    SELECT e.event_id, e.this_hash
                    FROM audit.events e
                    WHERE e.tenant_id = :tid
                      AND e.client_offline_id = :oid
                      AND e.event_type = 'TASK_COMPLETED'
                    LIMIT 1
                    """
                ),
                {"tid": str(user["tenant_id"]), "oid": body.offline_id},
            )
        ).first()
        if prior is not None:
            next_task = await _fetch_next_task(db, user["tenant_id"])
            return _envelope_ok(
                TaskCompleteOut(
                    task_id=task_id,
                    status="COMPLETED",
                    audit_event_id=prior.event_id,
                    audit_this_hash=prior.this_hash,
                    next_task=next_task,
                ).model_dump(mode="json")
            )

    task = await load_open_task(db, task_id, user["tenant_id"])
    _validate_input_against_hint(task.input_hint or "none", body.input_value)

    # Update task row to COMPLETED
    await db.execute(
        text(
            """
            UPDATE tenant.task_queue
            SET status = 'COMPLETED',
                updated_at = NOW()
            WHERE task_id = :tid AND tenant_id = :tenant
            """
        ),
        {"tid": str(task_id), "tenant": str(user["tenant_id"])},
    )

    # Emit audit.events — hash chain continues
    event_id, this_hash = await emit_audit_event(
        db=db,
        tenant_id=user["tenant_id"],
        actor_user_id=user["user_id"],
        event_type="TASK_COMPLETED",
        entity_type=task.entity_type,
        entity_id=task.entity_id,
        payload={
            "task_id": str(task_id),
            "imperative": task.imperative,
            "source_module": task.source_module,
            "source_reference": task.source_reference,
            "input_value": body.input_value,
            "note": body.note,
        },
        client_offline_id=body.offline_id,
    )

    await db.commit()

    # Teach TIS + leave a history trail: log the completion into farm_activity_context.
    # Separate best-effort txn so it can never roll back the completion.
    try:
        await db.execute(
            text(
                """
                INSERT INTO tenant.farm_activity_context
                    (tenant_id, farm_id, pu_id, kind, summary, source, created_by)
                SELECT tenant_id, farm_id, pu_id, 'TASK_DONE', :s, 'auto', CAST(:uid AS uuid)
                  FROM tenant.task_queue WHERE task_id = :tid AND tenant_id = :tenant
                """
            ),
            {"s": f"Completed: {task.imperative}"[:500], "uid": str(user["user_id"]),
             "tid": str(task_id), "tenant": str(user["tenant_id"])},
        )
        await db.commit()
    except Exception:
        await db.rollback()

    # Fetch next task for Solo preload
    next_task = await _fetch_next_task(db, user["tenant_id"])

    return _envelope_ok(
        TaskCompleteOut(
            task_id=task_id,
            status="COMPLETED",
            audit_event_id=event_id,
            audit_this_hash=this_hash,
            next_task=next_task,
        ).model_dump(mode="json")
    )


@router.post("/{task_id}/skip", response_model=None)
async def skip_task(
    task_id: UUID,
    body: TaskSkipIn,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark task SKIPPED with required reason.

    Same idempotency contract as /complete via offline_id.
    """
    await set_tenant_context(db, user["tenant_id"])

    if body.offline_id:
        prior = (
            await db.execute(
                text(
                    """
                    SELECT e.event_id, e.this_hash
                    FROM audit.events e
                    WHERE e.tenant_id = :tid
                      AND e.client_offline_id = :oid
                      AND e.event_type = 'TASK_SKIPPED'
                    LIMIT 1
                    """
                ),
                {"tid": str(user["tenant_id"]), "oid": body.offline_id},
            )
        ).first()
        if prior is not None:
            next_task = await _fetch_next_task(db, user["tenant_id"])
            return _envelope_ok(
                TaskSkipOut(
                    task_id=task_id,
                    status="SKIPPED",
                    audit_event_id=prior.event_id,
                    audit_this_hash=prior.this_hash,
                    next_task=next_task,
                ).model_dump(mode="json")
            )

    task = await load_open_task(db, task_id, user["tenant_id"])

    await db.execute(
        text(
            """
            UPDATE tenant.task_queue
            SET status = 'SKIPPED',
                updated_at = NOW()
            WHERE task_id = :tid AND tenant_id = :tenant
            """
        ),
        {"tid": str(task_id), "tenant": str(user["tenant_id"])},
    )

    event_id, this_hash = await emit_audit_event(
        db=db,
        tenant_id=user["tenant_id"],
        actor_user_id=user["user_id"],
        event_type="TASK_SKIPPED",
        entity_type=task.entity_type,
        entity_id=task.entity_id,
        payload={
            "task_id": str(task_id),
            "imperative": task.imperative,
            "source_module": task.source_module,
            "source_reference": task.source_reference,
            "reason": body.reason.value,
            "note": body.note,
        },
        client_offline_id=body.offline_id,
    )

    await db.commit()

    next_task = await _fetch_next_task(db, user["tenant_id"])

    return _envelope_ok(
        TaskSkipOut(
            task_id=task_id,
            status="SKIPPED",
            audit_event_id=event_id,
            audit_this_hash=this_hash,
            next_task=next_task,
        ).model_dump(mode="json")
    )


@router.post("/{task_id}/help", response_model=None)
async def task_help(
    task_id: UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return body_md + KB article pointers for this task. No state change.

    KB lookup strategy:
      Phase 4.2 Step 5-6 (current): body_md only, kb_articles returns empty list.
      Reason: deployed shared.kb_articles schema (columns article_id, article_type,
      title, content_md, content_summary, embedding_vector, validated_by,
      validated_date, published, created_at) does not have slug/layer/status/
      tags/updated_at. The original lookup strategy was written against an
      earlier schema draft. KB reconciliation is a Phase 4.3 task.
      Phase 4.3+: rebuild KB lookup against real columns — either published=true
      filter + entity_type match, or pgvector similarity on task imperative.
    """
    await set_tenant_context(db, user["tenant_id"])

    # Load task (any status — help is read-only)
    row = (
        await db.execute(
            text(
                """
                SELECT task_id, body_md, source_module, entity_type, entity_id
                FROM tenant.task_queue
                WHERE task_id = :tid AND tenant_id = :tenant
                """
            ),
            {"tid": str(task_id), "tenant": str(user["tenant_id"])},
        )
    ).first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TASK_NOT_FOUND", "message": "Task not found"},
        )

    # KB article lookup deferred to Phase 4.3 — see docstring.
    kb_articles: list[KBArticleRef] = []

    help_out = TaskHelpOut(
        task_id=task_id,
        body_md=row.body_md,
        kb_articles=kb_articles,
        escalation=None,  # Phase 4.3+: populate from task's entity owner / farm manager
    )
    return _envelope_ok(help_out.model_dump(mode="json"))


# --- Manual task creation (Tasks page "Manual task" button) -----------
from uuid import uuid4 as _uuid4
from pydantic import BaseModel as _BaseModel


class ManualTaskIn(_BaseModel):
    farm_id: str
    imperative: str
    due_date: date | None = None
    rank_band: RankBand | None = None  # critical/high/medium/low/optional/advisory


_BAND_RANK = {"critical": 50, "high": 200, "medium": 450, "low": 750, "optional": 950, "advisory": 1000}


@router.post("/manual", response_model=None)
async def create_manual_task(
    body: ManualTaskIn,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a farmer-entered task (source_module='manual'). Tenant + farm scoped."""
    if not body.imperative.strip():
        raise HTTPException(422, {"code": "INVALID_INPUT", "message": "imperative required"})
    await set_tenant_context(db, user["tenant_id"])
    rank = _BAND_RANK.get(body.rank_band.value if body.rank_band else "medium", 450)
    tid = str(_uuid4())
    title = body.imperative.strip()[:120]
    await db.execute(
        text(
            """
            INSERT INTO tenant.task_queue
                (task_id, tenant_id, farm_id, task_type, title, description,
                 priority, status, imperative, source_module, task_rank, due_date)
            VALUES
                (:tid, :tenant, :farm, 'OTHER', :title, :title,
                 'MEDIUM', 'OPEN', :title, 'manual', :rank, :due)
            """
        ),
        {"tid": tid, "tenant": str(user["tenant_id"]), "farm": body.farm_id,
         "title": title, "rank": rank, "due": body.due_date},
    )
    # One add -> one audit row (Universal Event Form Contract). Same session as the INSERT.
    await emit_audit_event(
        db=db,
        tenant_id=UUID(str(user["tenant_id"])),
        actor_user_id=UUID(str(user["user_id"])) if user.get("user_id") else None,
        event_type="TASK_CREATED",
        entity_type="task",
        entity_id=tid,
        payload={"task_id": tid, "farm_id": body.farm_id, "imperative": title, "source_module": "manual"},
    )
    return _envelope_ok({"task_id": tid, "imperative": title, "status": "OPEN"})


@router.get("/history", response_model=None)
async def task_history(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    """Completed / skipped / expired tasks for the Farm History timeline.
    Ordered by when they closed (completed_at, else updated_at)."""
    await set_tenant_context(db, user["tenant_id"])
    where = ["tenant_id = :tid", "status IN ('COMPLETED','SKIPPED','EXPIRED')"]
    params: dict = {"tid": str(user["tenant_id"]), "limit": limit, "offset": offset}
    if from_date:
        where.append("COALESCE(completed_at, updated_at) >= :fromd")
        params["fromd"] = from_date
    if to_date:
        where.append("COALESCE(completed_at, updated_at) < (:tod::date + 1)")
        params["tod"] = to_date
    rows = (
        await db.execute(
            text(
                f"""
                SELECT task_id, imperative, status, source_module, entity_type, entity_id,
                       pu_id, COALESCE(completed_at, updated_at) AS closed_at, due_date
                FROM tenant.task_queue
                WHERE {' AND '.join(where)}
                ORDER BY COALESCE(completed_at, updated_at) DESC
                LIMIT :limit OFFSET :offset
                """
            ),
            params,
        )
    ).mappings().all()
    data = [{
        "task_id": str(r["task_id"]), "imperative": r["imperative"], "status": r["status"],
        "source_module": r["source_module"], "entity_type": r["entity_type"],
        "entity_id": r["entity_id"], "pu_id": r["pu_id"],
        "closed_at": r["closed_at"].isoformat() if r["closed_at"] else None,
    } for r in rows]
    return _envelope_ok({"total": len(data), "tasks": data})


@router.get("/count", response_model=None)
async def task_count(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Cheap counts for the nav badge: open / overdue / urgent (tenant-wide)."""
    await set_tenant_context(db, user["tenant_id"])
    row = (
        await db.execute(
            text(
                """
                SELECT
                  COUNT(*) FILTER (WHERE status='OPEN') AS open,
                  COUNT(*) FILTER (WHERE status='OPEN' AND due_date IS NOT NULL AND due_date < CURRENT_DATE) AS overdue,
                  COUNT(*) FILTER (WHERE status='OPEN' AND task_rank < 300) AS urgent
                FROM tenant.task_queue WHERE tenant_id = :tid
                """
            ),
            {"tid": str(user["tenant_id"])},
        )
    ).first()
    return _envelope_ok({"open": int(row.open or 0), "overdue": int(row.overdue or 0), "urgent": int(row.urgent or 0)})
