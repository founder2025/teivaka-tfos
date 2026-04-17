"""
tasks.py — Task queue management.

Routes:
  GET  /tasks                → list tasks (filter by assignee, status, farm, priority)
  POST /tasks                → create task
  GET  /tasks/{task_id}      → task detail
  PATCH /tasks/{task_id}     → update task (notes, status, assignee)
  PATCH /tasks/{task_id}/complete → mark complete
  DELETE /tasks/{task_id}    → delete task (FOUNDER/MANAGER only)
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import date
import logging

from app.middleware.rls import get_current_user, get_tenant_db, require_role

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    farm_id: UUID
    title: str
    description: Optional[str] = None
    assigned_to: Optional[UUID] = None
    due_date: Optional[date] = None
    priority: str = "MEDIUM"  # LOW, MEDIUM, HIGH, URGENT
    task_type: Optional[str] = None
    zone_id: Optional[UUID] = None
    cycle_id: Optional[UUID] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to: Optional[UUID] = None
    due_date: Optional[date] = None
    priority: Optional[str] = None
    task_type: Optional[str] = None
    status: Optional[str] = None


class TaskComplete(BaseModel):
    completion_note: Optional[str] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", summary="List tasks")
async def list_tasks(
    farm_id: Optional[UUID] = Query(None),
    assigned_to: Optional[UUID] = Query(None),
    task_status: Optional[str] = Query(None, alias="status"),
    priority: Optional[str] = Query(None),
    due_before: Optional[date] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    filters = []
    params: dict = {"limit": limit, "offset": offset}

    if farm_id:
        filters.append("t.farm_id = :farm_id")
        params["farm_id"] = str(farm_id)
    if assigned_to:
        filters.append("t.assigned_to = :assigned_to")
        params["assigned_to"] = str(assigned_to)
    if task_status:
        filters.append("t.status = :task_status")
        params["task_status"] = task_status.upper()
    if priority:
        filters.append("t.priority = :priority")
        params["priority"] = priority.upper()
    if due_before:
        filters.append("t.due_date <= :due_before")
        params["due_before"] = due_before.isoformat()

    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""

    result = await db.execute(
        text(f"""
            SELECT
                t.task_id,
                t.farm_id,
                f.farm_code,
                t.title,
                t.description,
                t.task_type,
                t.status,
                t.priority,
                t.assigned_to,
                w.full_name AS assigned_to_name,
                t.due_date,
                t.completed_at,
                t.zone_id,
                z.zone_code,
                t.cycle_id,
                t.created_at,
                CASE
                    WHEN t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE AND t.status != 'COMPLETE'
                    THEN true ELSE false
                END AS is_overdue
            FROM tenant.tasks t
            JOIN tenant.farms f ON f.farm_id = t.farm_id
            LEFT JOIN tenant.workers w ON w.worker_id = t.assigned_to
            LEFT JOIN tenant.zones z ON z.zone_id = t.zone_id
            {where_clause}
            ORDER BY
                CASE t.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
                t.due_date ASC NULLS LAST,
                t.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    rows = result.mappings().all()
    return {"tasks": [dict(r) for r in rows], "limit": limit, "offset": offset}


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create task")
async def create_task(
    payload: TaskCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    result = await db.execute(
        text("""
            INSERT INTO tenant.tasks
                (farm_id, title, description, assigned_to, due_date,
                 priority, task_type, zone_id, cycle_id, created_by)
            VALUES
                (:farm_id, :title, :description, :assigned_to, :due_date,
                 :priority, :task_type, :zone_id, :cycle_id, :created_by)
            RETURNING task_id, farm_id, title, status, priority, due_date, created_at
        """),
        {
            "farm_id": str(payload.farm_id),
            "title": payload.title,
            "description": payload.description,
            "assigned_to": str(payload.assigned_to) if payload.assigned_to else None,
            "due_date": payload.due_date.isoformat() if payload.due_date else None,
            "priority": payload.priority.upper(),
            "task_type": payload.task_type,
            "zone_id": str(payload.zone_id) if payload.zone_id else None,
            "cycle_id": str(payload.cycle_id) if payload.cycle_id else None,
            "created_by": str(user["user_id"]),
        },
    )
    row = result.mappings().first()
    return dict(row)


@router.get("/{task_id}", summary="Task detail")
async def get_task(
    task_id: UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    result = await db.execute(
        text("""
            SELECT t.*, f.farm_code, z.zone_code,
                   w.full_name AS assigned_to_name
            FROM tenant.tasks t
            JOIN tenant.farms f ON f.farm_id = t.farm_id
            LEFT JOIN tenant.zones z ON z.zone_id = t.zone_id
            LEFT JOIN tenant.workers w ON w.worker_id = t.assigned_to
            WHERE t.task_id = :task_id
        """),
        {"task_id": str(task_id)},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return dict(row)


@router.patch("/{task_id}", summary="Update task")
async def update_task(
    task_id: UUID,
    payload: TaskUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    set_clauses = ", ".join(f"{col} = :{col}" for col in updates)
    updates["task_id"] = str(task_id)

    result = await db.execute(
        text(f"""
            UPDATE tenant.tasks
            SET {set_clauses}, updated_at = NOW()
            WHERE task_id = :task_id
            RETURNING task_id, title, status, priority, updated_at
        """),
        updates,
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return dict(row)


@router.patch("/{task_id}/complete", summary="Mark task complete")
async def complete_task(
    task_id: UUID,
    payload: TaskComplete = TaskComplete(),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    result = await db.execute(
        text("""
            UPDATE tenant.tasks
            SET
                status = 'COMPLETE',
                completed_at = NOW(),
                completed_by = :user_id,
                completion_note = :completion_note,
                updated_at = NOW()
            WHERE task_id = :task_id AND status != 'COMPLETE'
            RETURNING task_id, status, completed_at, completed_by
        """),
        {
            "task_id": str(task_id),
            "user_id": str(user["user_id"]),
            "completion_note": payload.completion_note,
        },
    )
    row = result.mappings().first()
    if not row:
        check = await db.execute(
            text("SELECT task_id, status FROM tenant.tasks WHERE task_id = :tid"),
            {"tid": str(task_id)},
        )
        existing = check.mappings().first()
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Task is already complete")
    return dict(row)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete task")
async def delete_task(
    task_id: UUID,
    user: dict = Depends(require_role("FOUNDER", "MANAGER")),
    db: AsyncSession = Depends(get_tenant_db),
):
    result = await db.execute(
        text("DELETE FROM tenant.tasks WHERE task_id = :task_id RETURNING task_id"),
        {"task_id": str(task_id)},
    )
    if not result.first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
