"""Phase 4.2 Option 3 Day 2 — TIS Advisory SSE stream + read handler.

Endpoints (registered under /api/v1/tis prefix in main.py):
  GET  /stream                      — Server-Sent Events advisory stream
  POST /advisories/{id}/read        — mark an advisory read, emit ADVISORY_READ

SSE shape per v2.1 §11.8:
  {
    "type": "TIS_ADVISORY",
    "advisory_id": "<uuid>",
    "priority": "LOW|MEDIUM|HIGH|CRITICAL",
    "preview": "...",
    "source_task_id": "<text?>",
    "source_audit_event_id": "<uuid?>"
  }

Behavior:
  - Bearer auth required (middleware populates request.state.user).
  - On connect, flush every unread advisory for the user (read_at IS NULL),
    ordered by created_at ASC.
  - Keep-alive every 25 seconds.
  - Connection tracking is in-process; Redis pub/sub fan-out across workers
    is Phase 5 work.

Implementation note: the POST /read handler lives in this module because
it is part of the same feature surface (the advisory lifecycle).
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import text
from sse_starlette.sse import EventSourceResponse

from app.core.audit_chain import emit_audit_event
from app.db.session import AsyncSessionLocal
from app.middleware.rls import get_current_user


router = APIRouter(tags=["TIS — Advisory Stream"])


KEEP_ALIVE_SECONDS = 25
POLL_INTERVAL_SECONDS = 5


def _envelope(data: dict) -> dict:
    return {
        "status": "success",
        "data": data,
        "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
    }


async def _open_rls_session(tenant_id: str):
    session = AsyncSessionLocal()
    await session.execute(
        text("SELECT set_config('app.tenant_id', :tid, false)"),
        {"tid": tenant_id},
    )
    return session


async def _fetch_unread_advisories(session, user_id: str, after_iso: str | None):
    """Return advisories for a user with read_at IS NULL.

    after_iso filters to rows newer than a timestamp string (stream polling).
    """
    params = {"uid": user_id}
    where = "user_id = :uid AND read_at IS NULL"
    if after_iso:
        where += " AND created_at > :after"
        params["after"] = after_iso
    rows = (
        await session.execute(
            text(
                f"""
                SELECT advisory_id, priority, preview, full_message,
                       source_task_id, source_audit_id, created_at
                FROM tenant.tis_advisories
                WHERE {where}
                ORDER BY created_at ASC
                """
            ),
            params,
        )
    ).fetchall()
    return rows


@router.get("/stream")
async def tis_stream(
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Server-Sent Events: push new TIS advisories to this user."""

    tenant_id = str(user["tenant_id"])
    user_id = str(user["user_id"])

    async def event_generator():
        last_seen_iso: str | None = None
        last_keepalive = datetime.now(timezone.utc)

        while True:
            if await request.is_disconnected():
                break

            session = await _open_rls_session(tenant_id)
            try:
                rows = await _fetch_unread_advisories(session, user_id, last_seen_iso)
                for r in rows:
                    payload = {
                        "type": "TIS_ADVISORY",
                        "advisory_id": str(r.advisory_id),
                        "priority": r.priority,
                        "preview": r.preview,
                        "source_task_id": r.source_task_id,
                        "source_audit_event_id": (
                            str(r.source_audit_id) if r.source_audit_id else None
                        ),
                    }
                    yield {
                        "event": "advisory",
                        "data": json.dumps(payload),
                    }
                    last_seen_iso = r.created_at.isoformat()
            finally:
                await session.close()

            # Keep-alive ping every 25s even if no new advisories.
            now = datetime.now(timezone.utc)
            if (now - last_keepalive).total_seconds() >= KEEP_ALIVE_SECONDS:
                yield {"event": "ping", "data": "{}"}
                last_keepalive = now

            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    return EventSourceResponse(event_generator())


@router.post("/advisories/{advisory_id}/read")
async def mark_advisory_read(
    advisory_id: UUID,
    user: dict = Depends(get_current_user),
):
    """Mark advisory read. Idempotent. Emits ADVISORY_READ audit event."""
    tenant_id = str(user["tenant_id"])
    user_id = str(user["user_id"])

    session = await _open_rls_session(tenant_id)
    try:
        row = (
            await session.execute(
                text(
                    """
                    SELECT advisory_id, user_id, read_at
                    FROM tenant.tis_advisories
                    WHERE advisory_id = :aid
                    """
                ),
                {"aid": str(advisory_id)},
            )
        ).first()

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "ADVISORY_NOT_FOUND", "message": "Advisory not found"},
            )

        if str(row.user_id) != user_id:
            # Row exists but belongs to another user in the tenant.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "ADVISORY_NOT_OWNED",
                    "message": "This advisory is addressed to another user",
                },
            )

        # Idempotent update.
        if row.read_at is None:
            result = (
                await session.execute(
                    text(
                        """
                        UPDATE tenant.tis_advisories
                        SET read_at = NOW()
                        WHERE advisory_id = :aid AND read_at IS NULL
                        RETURNING read_at
                        """
                    ),
                    {"aid": str(advisory_id)},
                )
            ).first()
            read_at = result.read_at if result else None
        else:
            read_at = row.read_at

        await emit_audit_event(
            db=session,
            tenant_id=user["tenant_id"],
            actor_user_id=user["user_id"],
            event_type="ADVISORY_READ",
            entity_type="advisory",
            entity_id=str(advisory_id),
            payload={
                "advisory_id": str(advisory_id),
                "read_at": read_at.isoformat() if read_at else None,
            },
        )

        await session.commit()

        return _envelope(
            {
                "advisory_id": str(advisory_id),
                "read_at": read_at.isoformat() if read_at else None,
            }
        )
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
