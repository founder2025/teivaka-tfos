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
from app.schemas.tasks import FarmerMode, ModeDerivation


# --- Mode derivation thresholds (per v4.1 Addendum §Mode Derivation) ----

SOLO_MAX_AREA_HA = 5.0
SOLO_MAX_ACTIVE_CYCLES = 3
SOLO_MAX_TENURE_DAYS = 90

COMMERCIAL_MIN_AREA_HA = 50.0
COMMERCIAL_MIN_ACTIVE_CYCLES = 15
COMMERCIAL_TIERS: set[str] = {"PREMIUM", "CUSTOM"}


async def derive_mode(
    db: AsyncSession,
    tenant_id: UUID,
    user_id: UUID,
) -> tuple[FarmerMode, ModeDerivation]:
    """Compute the current farmer mode. Never user-toggled — always derived.

    Reads:
      - SUM(farms.land_area_ha) WHERE tenant
      - COUNT(production_cycles) WHERE tenant AND cycle_status='ACTIVE'
      - user.created_at → tenure in days
      - tenant.subscription_tier

    Returns (mode, derivation). Stored on request.state.mode after middleware.
    """
    row = (
        await db.execute(
            text(
                """
                SELECT
                    COALESCE(SUM(f.land_area_ha), 0)::float AS total_area_ha,
                    COALESCE((
                        SELECT COUNT(*) FROM tenant.production_cycles pc
                        WHERE pc.tenant_id = :tid AND pc.cycle_status = 'ACTIVE'
                    ), 0)::int AS active_cycles,
                    EXTRACT(
                        EPOCH FROM (NOW() - COALESCE(u.created_at, NOW()))
                    )::int / 86400 AS tenure_days,
                    COALESCE(t.subscription_tier, 'FREE') AS subscription_tier
                FROM tenant.tenants t
                LEFT JOIN tenant.farms f ON f.tenant_id = t.tenant_id
                LEFT JOIN tenant.users u ON u.user_id = :uid
                WHERE t.tenant_id = :tid
                GROUP BY u.created_at, t.subscription_tier
                """
            ),
            {"tid": str(tenant_id), "uid": str(user_id)},
        )
    ).first()

    if row is None:
        # New tenant with no farms yet — default to SOLO
        return (
            FarmerMode.SOLO,
            ModeDerivation(
                total_area_ha=0.0,
                active_cycles=0,
                user_tenure_days=0,
                subscription_tier="FREE",
                reason="SOLO (default): no farms yet",
            ),
        )

    total_area, active_cycles, tenure_days, tier = row

    # Commercial takes precedence (larger/paying farmers)
    if (
        total_area >= COMMERCIAL_MIN_AREA_HA
        or active_cycles >= COMMERCIAL_MIN_ACTIVE_CYCLES
        or tier in COMMERCIAL_TIERS
    ):
        return (
            FarmerMode.COMMERCIAL,
            ModeDerivation(
                total_area_ha=total_area,
                active_cycles=active_cycles,
                user_tenure_days=tenure_days,
                subscription_tier=tier,
                reason=(
                    f"COMMERCIAL: area={total_area}ha, cycles={active_cycles}, "
                    f"tier={tier}"
                ),
            ),
        )

    # Solo: small + new + unpaid
    if (
        total_area <= SOLO_MAX_AREA_HA
        and active_cycles <= SOLO_MAX_ACTIVE_CYCLES
        and tenure_days < SOLO_MAX_TENURE_DAYS
    ):
        return (
            FarmerMode.SOLO,
            ModeDerivation(
                total_area_ha=total_area,
                active_cycles=active_cycles,
                user_tenure_days=tenure_days,
                subscription_tier=tier,
                reason=(
                    f"SOLO: area={total_area}ha, cycles={active_cycles}, "
                    f"tenure={tenure_days}d"
                ),
            ),
        )

    # Default: Growth
    return (
        FarmerMode.GROWTH,
        ModeDerivation(
            total_area_ha=total_area,
            active_cycles=active_cycles,
            user_tenure_days=tenure_days,
            subscription_tier=tier,
            reason=(
                f"GROWTH: area={total_area}ha, cycles={active_cycles}, "
                f"tenure={tenure_days}d, tier={tier}"
            ),
        ),
    )


async def get_current_mode(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FarmerMode:
    """FastAPI dependency — return the current farmer's derived mode.

    Use on endpoints that change behavior by mode (e.g., /tasks/next
    always returns only 1 task in Solo mode; /tasks may return a filtered
    list in Commercial mode that hides Growth-only analytics).
    """
    mode, _ = await derive_mode(db, user["tenant_id"], user["user_id"])
    return mode


async def get_current_mode_with_derivation(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> tuple[FarmerMode, ModeDerivation]:
    """FastAPI dependency — mode + explanation. Used by /me/mode debug endpoint."""
    return await derive_mode(db, user["tenant_id"], user["user_id"])


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
