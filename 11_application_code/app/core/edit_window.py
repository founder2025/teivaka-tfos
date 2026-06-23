"""edit_window — the 48-hour correction window (Operator-ratified 2026-06-23).

A logged record can be edited/corrected for EDIT_WINDOW_HOURS after it was *recorded
on the server* (created_at — never occurred_at, so a backdated entry can't extend its
own window). Every in-window edit emits its own audit event, so corrections are
transparent and bounded; after the window the source record is LOCKED (403).

The audit.events hash chain is ALWAYS immutable (migration 153) — this governs the
SOURCE rows (cash_ledger, field_events), not the chain. That is stronger Bank Evidence
than "no edits ever": honest corrections are visible and time-bounded.
"""
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, status

EDIT_WINDOW_HOURS = 48


def is_within_edit_window(recorded_at, hours: int = EDIT_WINDOW_HOURS) -> bool:
    if recorded_at is None:
        return False
    if recorded_at.tzinfo is None:
        recorded_at = recorded_at.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - recorded_at) <= timedelta(hours=hours)


def assert_within_edit_window(recorded_at, hours: int = EDIT_WINDOW_HOURS) -> None:
    """Raise 403 EDIT_WINDOW_CLOSED if the record is past its correction window."""
    if not is_within_edit_window(recorded_at, hours):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "EDIT_WINDOW_CLOSED",
                "message": f"This record was recorded over {hours}h ago and is now locked. "
                           f"It can no longer be edited — the audit trail is permanent.",
            },
        )
