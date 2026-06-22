"""Phase 4.2 Step 5-6 — FastAPI dependencies for task endpoints.

Provides:
  - get_current_mode: derives Solo/Growth/Commercial from farm + tenure state
  - validate_task_ownership: loads a task + confirms tenant match + OPEN status

Does NOT redefine get_current_user or get_db — those are assumed to already
exist in app/auth/dependencies.py and app/db/session.py respectively. Import
from there.

Deployment target: /opt/teivaka/11_application_code/app/deps/tasks.py
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Deployed project layout (verified 2026-04-21 pre-check):
#   get_current_user lives in app.middleware.rls and returns a dict
#     with keys tenant_id, user_id, role, tier. Any user.X attribute
#     access below MUST be user["X"].
#   _make_access_token lives at app.routers.auth (underscore-private).
#   get_db is the standard app.db.session.get_db async dependency.
from app.middleware.rls import get_current_user  # returns dict
from app.db.session import get_db                # async session dep
# (mode-derivation import removed 2026-06-22 — mode purge)


# --- Mode derivation REMOVED 2026-06-22 (mode purge): derive_mode +
#     get_current_mode[_with_derivation] were dead (no Depends used them).
# --- Task ownership / state guards ----------------------------------

async def load_open_task(
    db: AsyncSession,
    task_id: UUID,
    tenant_id: UUID,
):
    """Load a task row, enforce tenant scope + OPEN status.

    Raises:
        HTTPException 404: task not found or not owned by tenant
        HTTPException 409: task exists but is not in OPEN state
    """
    row = (
        await db.execute(
            text(
                """
                SELECT task_id, tenant_id, imperative, task_rank, icon_key,
                       input_hint, body_md, expires_at, default_outcome,
                       entity_type, entity_id, source_module, source_reference,
                       voice_playback_url, status, created_at
                FROM tenant.task_queue
                WHERE task_id = :tid
                  AND tenant_id = :tenant
                """
            ),
            {"tid": str(task_id), "tenant": str(tenant_id)},
        )
    ).first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TASK_NOT_FOUND", "message": "Task not found"},
        )

    if row.status != "OPEN":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "TASK_NOT_OPEN",
                "message": f"Task is {row.status}, cannot modify",
                "current_status": row.status,
            },
        )

    return row


async def set_tenant_context(db: AsyncSession, tenant_id: UUID) -> None:
    """Set the app.tenant_id session variable for RLS.

    Per the Schema Reality Drift List (Phase 4.2 deploy):
    session variable is `app.tenant_id`, NOT `app.current_tenant_id`.
    """
    await db.execute(
        text("SELECT set_config('app.tenant_id', :tid, false)"),
        {"tid": str(tenant_id)},
    )
