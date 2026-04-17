"""
alerts.py — Alert management.

Routes:
  GET  /alerts                        → list active alerts with filters
  GET  /alerts/{alert_id}             → alert detail
  POST /alerts                        → create manual alert (MANAGER/FOUNDER)
  PATCH /alerts/{alert_id}/acknowledge → acknowledge alert
  PATCH /alerts/{alert_id}/resolve    → resolve alert
  PATCH /alerts/{alert_id}/dismiss    → dismiss low-priority alert
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

class AlertCreate(BaseModel):
    farm_id: UUID
    zone_id: Optional[UUID] = None
    production_unit_id: Optional[UUID] = None
    alert_type: str
    severity: str  # CRITICAL, HIGH, MEDIUM, LOW
    title: str
    message: str
    due_date: Optional[date] = None


class AlertResolve(BaseModel):
    resolution_note: Optional[str] = None


class AlertAcknowledge(BaseModel):
    ack_note: Optional[str] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", summary="List alerts")
async def list_alerts(
    farm_id: Optional[UUID] = Query(None),
    zone_id: Optional[UUID] = Query(None),
    severity: Optional[str] = Query(None, description="CRITICAL | HIGH | MEDIUM | LOW"),
    alert_status: Optional[str] = Query(None, alias="status", description="OPEN | ACKNOWLEDGED | RESOLVED"),
    alert_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """
    Lists alerts for the tenant, ordered by severity then created_at desc.
    Defaults to showing only OPEN alerts if status filter is not provided.
    """
    filters = []
    params: dict = {"limit": limit, "offset": offset}

    # Default to OPEN if no status filter
    if alert_status:
        filters.append("a.status = :alert_status")
        params["alert_status"] = alert_status.upper()
    else:
        filters.append("a.status = 'OPEN'")

    if farm_id:
        filters.append("a.farm_id = :farm_id")
        params["farm_id"] = str(farm_id)
    if zone_id:
        filters.append("a.zone_id = :zone_id")
        params["zone_id"] = str(zone_id)
    if severity:
        filters.append("a.severity = :severity")
        params["severity"] = severity.upper()
    if alert_type:
        filters.append("a.alert_type = :alert_type")
        params["alert_type"] = alert_type.upper()

    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""

    result = await db.execute(
        text(f"""
            SELECT
                a.alert_id,
                a.alert_type,
                a.severity,
                a.status,
                a.title,
                a.message,
                a.farm_id,
                f.farm_code,
                a.zone_id,
                z.zone_code,
                a.production_unit_id,
                pu.crop_name,
                a.due_date,
                a.acknowledged_at,
                a.acknowledged_by,
                a.resolved_at,
                a.resolved_by,
                a.resolution_note,
                a.created_at,
                CASE
                    WHEN a.due_date IS NOT NULL AND a.due_date < CURRENT_DATE AND a.status = 'OPEN'
                    THEN true
                    ELSE false
                END AS is_overdue,
                (CURRENT_DATE - a.created_at::date) AS days_open
            FROM tenant.alerts a
            JOIN tenant.farms f ON f.farm_id = a.farm_id
            LEFT JOIN tenant.zones z ON z.zone_id = a.zone_id
            LEFT JOIN tenant.production_units pu ON pu.production_unit_id = a.production_unit_id
            {where_clause}
            ORDER BY
                CASE a.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
                a.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    rows = result.mappings().all()
    return {
        "alerts": [dict(r) for r in rows],
        "total_returned": len(rows),
        "limit": limit,
        "offset": offset,
    }


@router.get("/{alert_id}", summary="Alert detail")
async def get_alert(
    alert_id: UUID,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    result = await db.execute(
        text("""
            SELECT
                a.*,
                f.farm_code,
                f.farm_name,
                z.zone_code,
                pu.crop_name
            FROM tenant.alerts a
            JOIN tenant.farms f ON f.farm_id = a.farm_id
            LEFT JOIN tenant.zones z ON z.zone_id = a.zone_id
            LEFT JOIN tenant.production_units pu ON pu.production_unit_id = a.production_unit_id
            WHERE a.alert_id = :alert_id
        """),
        {"alert_id": str(alert_id)},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    return dict(row)


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create manual alert")
async def create_alert(
    payload: AlertCreate,
    user: dict = Depends(require_role("FOUNDER", "MANAGER")),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Creates a manual alert. System alerts are created by DB triggers and cron jobs."""
    valid_severities = {"CRITICAL", "HIGH", "MEDIUM", "LOW"}
    if payload.severity.upper() not in valid_severities:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"severity must be one of: {', '.join(valid_severities)}",
        )

    result = await db.execute(
        text("""
            INSERT INTO tenant.alerts
                (farm_id, zone_id, production_unit_id, alert_type,
                 severity, title, message, due_date, created_by, source)
            VALUES
                (:farm_id, :zone_id, :production_unit_id, :alert_type,
                 :severity, :title, :message, :due_date, :created_by, 'MANUAL')
            RETURNING alert_id, alert_type, severity, status, title, message,
                      farm_id, zone_id, due_date, created_at
        """),
        {
            "farm_id": str(payload.farm_id),
            "zone_id": str(payload.zone_id) if payload.zone_id else None,
            "production_unit_id": str(payload.production_unit_id) if payload.production_unit_id else None,
            "alert_type": payload.alert_type.upper(),
            "severity": payload.severity.upper(),
            "title": payload.title,
            "message": payload.message,
            "due_date": payload.due_date.isoformat() if payload.due_date else None,
            "created_by": str(user["user_id"]),
        },
    )
    row = result.mappings().first()
    logger.info(f"Manual alert created: {row['alert_id']} severity={payload.severity} by {user['user_id']}")
    return dict(row)


@router.patch("/{alert_id}/acknowledge", summary="Acknowledge alert")
async def acknowledge_alert(
    alert_id: UUID,
    payload: AlertAcknowledge = AlertAcknowledge(),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """
    Marks an alert as ACKNOWLEDGED. Any authenticated user can acknowledge alerts.
    Records who acknowledged and when.
    """
    result = await db.execute(
        text("""
            UPDATE tenant.alerts
            SET
                status = 'ACKNOWLEDGED',
                acknowledged_at = NOW(),
                acknowledged_by = :user_id,
                ack_note = :ack_note,
                updated_at = NOW()
            WHERE alert_id = :alert_id AND status = 'OPEN'
            RETURNING alert_id, status, acknowledged_at, acknowledged_by
        """),
        {
            "alert_id": str(alert_id),
            "user_id": str(user["user_id"]),
            "ack_note": payload.ack_note,
        },
    )
    row = result.mappings().first()
    if not row:
        # Either not found or not OPEN
        check = await db.execute(
            text("SELECT alert_id, status FROM tenant.alerts WHERE alert_id = :aid"),
            {"aid": str(alert_id)},
        )
        existing = check.mappings().first()
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Alert is already in status '{existing['status']}'",
        )
    return dict(row)


@router.patch("/{alert_id}/resolve", summary="Resolve alert")
async def resolve_alert(
    alert_id: UUID,
    payload: AlertResolve = AlertResolve(),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """
    Marks an alert as RESOLVED. Any authenticated user can resolve alerts.
    An optional resolution_note can be provided.
    """
    result = await db.execute(
        text("""
            UPDATE tenant.alerts
            SET
                status = 'RESOLVED',
                resolved_at = NOW(),
                resolved_by = :user_id,
                resolution_note = :resolution_note,
                updated_at = NOW()
            WHERE alert_id = :alert_id AND status IN ('OPEN', 'ACKNOWLEDGED')
            RETURNING alert_id, status, resolved_at, resolved_by, resolution_note
        """),
        {
            "alert_id": str(alert_id),
            "user_id": str(user["user_id"]),
            "resolution_note": payload.resolution_note,
        },
    )
    row = result.mappings().first()
    if not row:
        check = await db.execute(
            text("SELECT alert_id, status FROM tenant.alerts WHERE alert_id = :aid"),
            {"aid": str(alert_id)},
        )
        existing = check.mappings().first()
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot resolve alert in status '{existing['status']}'",
        )

    logger.info(f"Alert {alert_id} resolved by user {user['user_id']}")
    return dict(row)


@router.patch("/{alert_id}/dismiss", summary="Dismiss low-priority alert")
async def dismiss_alert(
    alert_id: UUID,
    user: dict = Depends(require_role("FOUNDER", "MANAGER")),
    db: AsyncSession = Depends(get_tenant_db),
):
    """
    Dismisses an alert (marks as DISMISSED). Restricted to FOUNDER/MANAGER.
    Only LOW or MEDIUM severity alerts can be dismissed via this endpoint.
    CRITICAL and HIGH alerts must be resolved properly.
    """
    check = await db.execute(
        text("SELECT alert_id, severity, status FROM tenant.alerts WHERE alert_id = :aid"),
        {"aid": str(alert_id)},
    )
    existing = check.mappings().first()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

    if existing["severity"] in ("CRITICAL", "HIGH"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot dismiss {existing['severity']} alerts. They must be resolved.",
        )

    result = await db.execute(
        text("""
            UPDATE tenant.alerts
            SET status = 'DISMISSED', updated_at = NOW(), resolved_by = :user_id
            WHERE alert_id = :alert_id
            RETURNING alert_id, status, updated_at
        """),
        {"alert_id": str(alert_id), "user_id": str(user["user_id"])},
    )
    row = result.mappings().first()
    return dict(row)
