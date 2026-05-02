"""POULTRY Compliance Dashboard endpoint — Phase 6.6-3.

GET /api/v1/poultry/compliance returns three sections:
  1. active_blocks: per-flock active sale blocks (vaccine withholding + severe health)
  2. upcoming_clearances: vaccine withholdings clearing in next 14 days
  3. recent_audit: last 30 WITHHOLDING_VIOLATION_ATTEMPTED events for this tenant

Strike #56: tenant.poultry_event_log uses payload_jsonb column.
Tenant-scoped reads via get_tenant_db (RLS + app.tenant_id session var).
No SECURITY DEFINER needed (single-tenant queries, RLS-permitted).
"""

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.rls import get_current_user, get_tenant_db
from app.schemas.envelope import error_envelope


router = APIRouter()


@router.get("/poultry/compliance")
async def get_poultry_compliance(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
):
    """Composite read endpoint surfacing all active and recent compliance state."""
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(
            status_code=400,
            detail=error_envelope("missing_tenant", "Tenant context required."),
        )

    now = datetime.now(timezone.utc)
    fortnight = now + timedelta(days=14)

    # ─── SECTION 1a: Vaccine withholding active blocks ──────────
    # DISTINCT ON (flock_id) takes the LATEST vaccination per flock; older
    # vaccinations are ignored once a newer one supersedes.
    vaccine_blocks_result = await db.execute(text("""
        WITH latest_vaccination_per_flock AS (
            SELECT DISTINCT ON (pel.flock_id)
                pel.flock_id,
                pel.occurred_at,
                fl.name AS vaccine_name,
                COALESCE((fl.attributes->>'withholding_eggs_days')::int, 0) AS eggs_days,
                COALESCE((fl.attributes->>'withholding_meat_days')::int, 0) AS meat_days,
                pel.occurred_at + COALESCE((fl.attributes->>'withholding_eggs_days')::int, 0) * INTERVAL '1 day' AS eggs_clear_at,
                pel.occurred_at + COALESCE((fl.attributes->>'withholding_meat_days')::int, 0) * INTERVAL '1 day' AS meat_clear_at
            FROM tenant.poultry_event_log pel
            LEFT JOIN shared.farm_libraries fl
                ON fl.library_id = (pel.payload_jsonb->>'vaccine_id')::uuid
            WHERE pel.event_type = 'VACCINATION_GIVEN'
              AND pel.flock_id IS NOT NULL
            ORDER BY pel.flock_id, pel.occurred_at DESC
        )
        SELECT *
        FROM latest_vaccination_per_flock
        WHERE eggs_clear_at > now() OR meat_clear_at > now()
        ORDER BY GREATEST(eggs_clear_at, meat_clear_at) ASC;
    """))

    vaccine_blocks = []
    for row in vaccine_blocks_result.fetchall():
        blocks = []
        eggs_clear_iso = None
        meat_clear_iso = None
        if row.eggs_days > 0 and row.eggs_clear_at and row.eggs_clear_at > now:
            days_remaining = (row.eggs_clear_at - now).days + 1
            blocks.append({"sale_kind": "eggs", "days_remaining": max(days_remaining, 0)})
            eggs_clear_iso = row.eggs_clear_at.isoformat()
        if row.meat_days > 0 and row.meat_clear_at and row.meat_clear_at > now:
            days_remaining = (row.meat_clear_at - now).days + 1
            blocks.append({"sale_kind": "meat", "days_remaining": max(days_remaining, 0)})
            meat_clear_iso = row.meat_clear_at.isoformat()
        if blocks:
            vaccine_blocks.append({
                "flock_id": row.flock_id,
                "block_type": "vaccine_withholding",
                "vaccine_name": row.vaccine_name,
                "vaccinated_at": row.occurred_at.isoformat(),
                "eggs_clear_at": eggs_clear_iso,
                "meat_clear_at": meat_clear_iso,
                "blocks": blocks,
            })

    # ─── SECTION 1b: SEVERE health blocks ──────────────────────
    health_blocks_result = await db.execute(text("""
        WITH latest_health AS (
            SELECT DISTINCT ON (flock_id)
                flock_id,
                occurred_at AS observed_at,
                payload_jsonb->>'severity' AS severity,
                payload_jsonb->'symptoms' AS symptoms,
                payload_jsonb->>'qty_affected' AS qty_affected
            FROM tenant.poultry_event_log
            WHERE event_type = 'HEALTH_OBSERVATION'
              AND flock_id IS NOT NULL
            ORDER BY flock_id, occurred_at DESC
        )
        SELECT * FROM latest_health WHERE severity = 'SEVERE';
    """))

    health_blocks = []
    for row in health_blocks_result.fetchall():
        health_blocks.append({
            "flock_id": row.flock_id,
            "block_type": "severe_health",
            "severity": row.severity,
            "observed_at": row.observed_at.isoformat(),
            "symptoms": row.symptoms,
            "qty_affected": int(row.qty_affected) if row.qty_affected else None,
            "blocks": [
                {"sale_kind": "eggs"},
                {"sale_kind": "meat"},
            ],
            "resolution": "Log a CLEARED HEALTH_OBSERVATION on this flock to lift the block.",
        })

    # ─── SECTION 2: Upcoming clearances (next 14 days) ──────────
    upcoming_result = await db.execute(text("""
        WITH latest_vaccination_per_flock AS (
            SELECT DISTINCT ON (pel.flock_id)
                pel.flock_id,
                pel.occurred_at,
                fl.name AS vaccine_name,
                COALESCE((fl.attributes->>'withholding_eggs_days')::int, 0) AS eggs_days,
                COALESCE((fl.attributes->>'withholding_meat_days')::int, 0) AS meat_days,
                pel.occurred_at + COALESCE((fl.attributes->>'withholding_eggs_days')::int, 0) * INTERVAL '1 day' AS eggs_clear_at,
                pel.occurred_at + COALESCE((fl.attributes->>'withholding_meat_days')::int, 0) * INTERVAL '1 day' AS meat_clear_at
            FROM tenant.poultry_event_log pel
            LEFT JOIN shared.farm_libraries fl
                ON fl.library_id = (pel.payload_jsonb->>'vaccine_id')::uuid
            WHERE pel.event_type = 'VACCINATION_GIVEN'
              AND pel.flock_id IS NOT NULL
            ORDER BY pel.flock_id, pel.occurred_at DESC
        )
        SELECT flock_id, vaccine_name, eggs_days, meat_days, eggs_clear_at, meat_clear_at
        FROM latest_vaccination_per_flock
        WHERE (eggs_clear_at BETWEEN now() AND now() + INTERVAL '14 days')
           OR (meat_clear_at BETWEEN now() AND now() + INTERVAL '14 days');
    """))

    upcoming = []
    for row in upcoming_result.fetchall():
        if row.eggs_days > 0 and row.eggs_clear_at and now < row.eggs_clear_at <= fortnight:
            upcoming.append({
                "flock_id": row.flock_id,
                "vaccine_name": row.vaccine_name,
                "sale_kind": "eggs",
                "clear_at": row.eggs_clear_at.isoformat(),
            })
        if row.meat_days > 0 and row.meat_clear_at and now < row.meat_clear_at <= fortnight:
            upcoming.append({
                "flock_id": row.flock_id,
                "vaccine_name": row.vaccine_name,
                "sale_kind": "meat",
                "clear_at": row.meat_clear_at.isoformat(),
            })
    upcoming.sort(key=lambda x: x["clear_at"])

    # ─── SECTION 3: Recent compliance audit (last 30 events) ────
    audit_result = await db.execute(text("""
        SELECT
            occurred_at,
            payload_jsonb->>'blocked_event_type' AS blocked_event_type,
            payload_jsonb->>'block_reason' AS block_reason,
            entity_id AS flock_id,
            payload_jsonb->'violation' AS violation
        FROM audit.events
        WHERE event_type = 'WITHHOLDING_VIOLATION_ATTEMPTED'
          AND tenant_id = :tid
        ORDER BY occurred_at DESC
        LIMIT 30
    """), {"tid": str(tenant_id)})

    recent_audit = []
    for row in audit_result.fetchall():
        recent_audit.append({
            "occurred_at": row.occurred_at.isoformat(),
            "blocked_event_type": row.blocked_event_type,
            "block_reason": row.block_reason or "vaccine_withholding",
            "flock_id": row.flock_id,
            "violation_summary": row.violation,
        })

    # ─── Compose response ──────────────────────────────────────
    all_blocks = vaccine_blocks + health_blocks
    all_blocks.sort(key=lambda b: b["flock_id"])

    return {
        "data": {
            "summary": {
                "active_block_count": len(all_blocks),
                "flocks_blocked": len(set(b["flock_id"] for b in all_blocks)),
                "upcoming_count": len(upcoming),
                "recent_audit_count": len(recent_audit),
            },
            "active_blocks": all_blocks,
            "upcoming_clearances": upcoming,
            "recent_audit": recent_audit,
        }
    }
