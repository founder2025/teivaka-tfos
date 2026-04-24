"""
FILE: app/routers/admin_monitoring.py

Read-only infra monitoring view for the platform founder.
FOUNDER role only — exposes the last 24 h of ops.health_checks and any
currently-unresolved alert_events.

Mounted at /api/v1/admin/monitoring. Uses the master Part 13 envelope
({status, data, meta}) — this is a new endpoint, so we set the standard
correctly from the start.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.rls import require_role, ROLE_FOUNDER

router = APIRouter()


@router.get("/health")
async def monitoring_health(
    _: dict = Depends(require_role(ROLE_FOUNDER)),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the last 24 h of health-check rows grouped by check_name, plus
    the currently-unresolved alert_events.
    """
    checks_rs = await db.execute(
        text("""
            SELECT
                check_name,
                status,
                response_time_ms,
                error_detail,
                checked_at
            FROM ops.health_checks
            WHERE checked_at >= NOW() - INTERVAL '24 hours'
            ORDER BY check_name, checked_at DESC
        """)
    )
    rows = [dict(r) for r in checks_rs.mappings()]
    by_name: dict[str, list[dict]] = {}
    for row in rows:
        by_name.setdefault(row["check_name"], []).append({
            "status":           row["status"],
            "response_time_ms": row["response_time_ms"],
            "error_detail":     row["error_detail"],
            "checked_at":       row["checked_at"].isoformat() if row["checked_at"] else None,
        })

    checks_summary = []
    for name, entries in sorted(by_name.items()):
        latest = entries[0]
        fails = sum(1 for e in entries if e["status"] == "FAIL")
        checks_summary.append({
            "check_name":        name,
            "latest_status":     latest["status"],
            "latest_checked_at": latest["checked_at"],
            "latest_error":      latest["error_detail"],
            "total_24h":         len(entries),
            "fails_24h":         fails,
            "history":           entries,
        })

    alerts_rs = await db.execute(
        text("""
            SELECT
                id,
                check_name,
                severity,
                consecutive_fails,
                fired_at,
                resolved_at,
                notification_channel,
                notification_status
            FROM ops.alert_events
            WHERE resolved_at IS NULL
            ORDER BY fired_at DESC
        """)
    )
    active_alerts = []
    for a in alerts_rs.mappings():
        active_alerts.append({
            "id":                   str(a["id"]),
            "check_name":           a["check_name"],
            "severity":             a["severity"],
            "consecutive_fails":    a["consecutive_fails"],
            "fired_at":             a["fired_at"].isoformat() if a["fired_at"] else None,
            "notification_channel": a["notification_channel"],
            "notification_status":  a["notification_status"],
        })

    return {
        "status": "ok",
        "data": {
            "checks":        checks_summary,
            "active_alerts": active_alerts,
        },
        "meta": {
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "window_hours":     24,
        },
    }
