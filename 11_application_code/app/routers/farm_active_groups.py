"""farm_active_groups.py — User-controlled group visibility per farm.

Two endpoints:
- GET  /api/v1/farms/{farm_id}/active-groups — read current state of all 11 groups
- PUT  /api/v1/farms/{farm_id}/active-groups — toggle groups; emits FARM_GROUP_TOGGLED audit per change

Per Catalog Redesign Doctrine Amendment v2 (commit 272f513) and Path A decision
(2026-04-30): every group toggle emits an audit row for full chain compliance.

Audit emission uses the canonical helper app.core.audit_chain.emit_audit_event,
matching the pattern in field_events.py / onboarding.py / tis_stream.py.
The helper handles the previous_hash lookup, payload_sha256, and chain hash
computation correctly per migration 023's audit.compute_hash() spec.

Authorization:
- GET: any user with read access to the farm (tenant_id matches via FK)
- PUT: requires owner-equivalent role (USER_ROLE_RANK >= 2 — covers FARMER,
  MANAGER, ADMIN, FOUNDER per the drift table in event_catalog.py)

The 11 valid groups are the locked taxonomy:
CROPS, PERENNIALS, LIVESTOCK, POULTRY, APICULTURE, AQUACULTURE,
FORESTRY, SPECIALTY, MONEY, NOTES, OTHER.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_chain import emit_audit_event
from app.middleware.rls import get_current_user, get_tenant_db
from app.schemas.envelope import error_envelope, success_envelope


router = APIRouter()


# Locked 11-group taxonomy (mirror of doctrine + DB CHECK constraint)
VALID_GROUPS = {
    'CROPS', 'PERENNIALS', 'LIVESTOCK', 'POULTRY', 'APICULTURE',
    'AQUACULTURE', 'FORESTRY', 'SPECIALTY',
    'MONEY', 'NOTES', 'OTHER',
}

# Role rank for PUT authorization (mirror of event_catalog.py drift table per
# MBI Section 12). FARMER is included at rank 2 because a solo farmer is the
# effective owner of their own farm; MANAGER+ override on multi-user accounts.
USER_ROLE_RANK = {
    "VIEWER":  0,
    "WORKER":  1,
    "FARMER":  2,
    "MANAGER": 2,
    "ADMIN":   3,
    "FOUNDER": 4,
}
OWNER_RANK_MIN = 2


class GroupToggleInput(BaseModel):
    catalog_group: str = Field(..., description="One of the 11 locked group names")
    is_active: bool


class GroupTogglesRequest(BaseModel):
    groups: list[GroupToggleInput] = Field(..., min_length=1, max_length=11)


async def _verify_farm_access(db: AsyncSession, farm_id: str, tid: str) -> None:
    """Verify farm belongs to tenant; raise 404 if not."""
    farm_check = (await db.execute(
        text("SELECT farm_id FROM tenant.farms WHERE farm_id = :fid AND tenant_id = :tid"),
        {"fid": farm_id, "tid": tid},
    )).first()
    if not farm_check:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_envelope(
                "FARM_NOT_FOUND",
                f"Farm {farm_id} not found for current tenant",
            ),
        )


@router.get("/{farm_id}/active-groups", summary="Get active groups for a farm")
async def get_active_groups(
    farm_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    tid = str(user["tenant_id"])
    await _verify_farm_access(db, farm_id, tid)

    rows = (await db.execute(
        text("""
            SELECT catalog_group, is_active, activated_at, activated_by
            FROM tenant.farm_active_groups
            WHERE farm_id = :fid
            ORDER BY catalog_group
        """),
        {"fid": farm_id},
    )).mappings().all()

    return success_envelope(
        {"groups": [dict(r) for r in rows]},
        meta={"farm_id": farm_id, "count": len(rows)},
    )


@router.put("/{farm_id}/active-groups", summary="Toggle active groups for a farm")
async def put_active_groups(
    farm_id: str,
    body: GroupTogglesRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    tid = str(user["tenant_id"])
    user_role = (user.get("role") or "VIEWER").upper()
    user_id_raw = user.get("user_id") or user.get("sub")

    # Authorization: owner-equivalent role or higher
    if USER_ROLE_RANK.get(user_role, 0) < OWNER_RANK_MIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=error_envelope(
                "INSUFFICIENT_ROLE",
                f"Role {user_role} cannot toggle group visibility (FARMER/MANAGER/ADMIN/FOUNDER required)",
            ),
        )

    await _verify_farm_access(db, farm_id, tid)

    # Validate all groups in body are in the locked taxonomy
    for g in body.groups:
        if g.catalog_group not in VALID_GROUPS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=error_envelope(
                    "INVALID_GROUP",
                    f"catalog_group must be one of {sorted(VALID_GROUPS)}",
                ),
            )

    # Fetch current state for each group to determine deltas
    current_rows = (await db.execute(
        text("""
            SELECT catalog_group, is_active
            FROM tenant.farm_active_groups
            WHERE farm_id = :fid
              AND catalog_group = ANY(:groups)
        """),
        {"fid": farm_id, "groups": [g.catalog_group for g in body.groups]},
    )).mappings().all()
    current_map = {r["catalog_group"]: r["is_active"] for r in current_rows}

    changes = []
    for g in body.groups:
        old_state = current_map.get(g.catalog_group)
        new_state = g.is_active
        if old_state != new_state:
            changes.append({
                "catalog_group": g.catalog_group,
                "old_state": old_state,
                "new_state": new_state,
            })

    # Upsert the toggles (INSERT ... ON CONFLICT)
    for g in body.groups:
        await db.execute(
            text("""
                INSERT INTO tenant.farm_active_groups
                    (farm_id, catalog_group, is_active, activated_at, activated_by)
                VALUES (:fid, :group, :is_active, now(), :uid)
                ON CONFLICT (farm_id, catalog_group)
                DO UPDATE SET
                    is_active    = EXCLUDED.is_active,
                    activated_at = now(),
                    activated_by = EXCLUDED.activated_by
            """),
            {"fid": farm_id, "group": g.catalog_group, "is_active": g.is_active, "uid": user_id_raw},
        )

    # Emit FARM_GROUP_TOGGLED audit row per change via the canonical helper.
    # This guarantees the same hash chain semantics as field_events.py and
    # onboarding.py (Inviolable Rule #2: audit chain integrity).
    tenant_uuid = UUID(tid)
    actor_uuid = UUID(str(user_id_raw)) if user_id_raw else None

    for change in changes:
        await emit_audit_event(
            db=db,
            tenant_id=tenant_uuid,
            actor_user_id=actor_uuid,
            event_type="FARM_GROUP_TOGGLED",
            entity_type="farm",
            entity_id=farm_id,
            payload={
                "farm_id": farm_id,
                "catalog_group": change["catalog_group"],
                "old_state": change["old_state"],
                "new_state": change["new_state"],
            },
        )

    # Read updated state INSIDE the transaction (must happen before commit;
    # SQLAlchemy async sessions close the transaction context on commit and
    # subsequent queries raise InvalidRequestError).
    rows = (await db.execute(
        text("""
            SELECT catalog_group, is_active, activated_at, activated_by
            FROM tenant.farm_active_groups
            WHERE farm_id = :fid
            ORDER BY catalog_group
        """),
        {"fid": farm_id},
    )).mappings().all()

    await db.commit()

    return success_envelope(
        {"groups": [dict(r) for r in rows]},
        meta={
            "farm_id": farm_id,
            "count": len(rows),
            "changes_applied": len(changes),
            "audit_events_emitted": len(changes),
        },
    )
