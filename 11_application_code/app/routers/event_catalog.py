"""event_catalog.py — Read-only event catalog for the (+) modal.

GET /api/v1/event-catalog returns the role-filtered, mode-filtered, livestock-derived
list of events the current user is allowed to log. Drives the (+) UI rebuild
(Sprint 4 of Catalog Redesign).

Design notes per Phase 5 doctrine decisions:
- has_livestock derived on-demand from EXISTS on audit.events (no farms column)
- Role tiers translated from tenant.users.role -> catalog.min_role via hardcoded map
  (drift list pattern, see MBI Section 12)
- mode NULL treated as 'SOLO'
- ENTERPRISE-tier rows are vestigial (no rows currently use it; tenants.mode CHECK
  doesn't allow it). Accepted but never matched.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.rls import get_current_user, get_tenant_db
from app.schemas.envelope import error_envelope, success_envelope
from app.services.naming import name_many


router = APIRouter()


# Role translation: tenant.users.role -> numeric tier rank.
# Used to compare against shared.event_type_catalog.min_role.
USER_ROLE_RANK: dict[str, int] = {
    "VIEWER":  0,
    "WORKER":  1,
    "FARMER":  2,   # Solo farmer = effective OWNER for own farm
    "MANAGER": 2,
    "ADMIN":   3,   # account admin = OWNER/ENTERPRISE_ADMIN equivalent
    "FOUNDER": 4,
}

# Catalog tier rank: shared.event_type_catalog.min_role -> numeric tier rank.
CATALOG_ROLE_RANK: dict[str, int] = {
    "WORKER":           1,
    "MANAGER":          2,
    "OWNER":            2,
    "ENTERPRISE_ADMIN": 3,
    "FOUNDER":          4,
}

# Mode translation: tenants.mode (varchar) -> numeric tier rank.
# NULL -> SOLO per Phase 5 Q3 decision.
MODE_RANK: dict[str, int] = {
    "SOLO":       0,
    "GROWTH":     1,
    "COMMERCIAL": 2,
    "ENTERPRISE": 3,   # vestigial; CHECK on tenants.mode doesn't allow this today
}

VALID_GROUPS = {"CROPS", "ANIMALS", "MONEY", "NOTES", "OTHER", "SYSTEM"}


@router.get("", summary="List event types available to current user")
async def list_event_catalog(
    group: Optional[str] = Query(None, description="Filter to one catalog group"),
    include_system: bool = Query(False, description="FOUNDER-only: include SYSTEM-group events"),
    farm_id: Optional[str] = Query(None, description="Filter to events allowed for this farm's active groups"),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    # ---- 1. Validate group filter ----
    if group is not None and group not in VALID_GROUPS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=error_envelope(
                "INVALID_GROUP",
                f"group must be one of {sorted(VALID_GROUPS)}",
            ),
        )

    # ---- 2. Translate user role -> rank ----
    user_role = (user.get("role") or "VIEWER").upper()
    user_role_rank = USER_ROLE_RANK.get(user_role, 0)

    # FOUNDER role can request SYSTEM events; everyone else gets is_user_facing only
    is_founder = user_role == "FOUNDER"
    if include_system and not is_founder:
        # silently downgrade — non-founders never see SYSTEM
        include_system = False

    # ---- 3. Fetch tenant mode (NULL -> SOLO) ----
    tid = str(user["tenant_id"])
    mode_row = (await db.execute(
        text("SELECT mode FROM tenant.tenants WHERE tenant_id = :tid"),
        {"tid": tid},
    )).first()
    tenant_mode = (mode_row[0] if mode_row and mode_row[0] else "SOLO").upper()
    tenant_mode_rank = MODE_RANK.get(tenant_mode, 0)

    # ---- 4. Compute has_livestock on demand ----
    livestock_row = (await db.execute(
        text("""
            SELECT EXISTS(
                SELECT 1 FROM audit.events
                WHERE tenant_id = :tid
                  AND event_type LIKE 'LIVESTOCK_%'
                LIMIT 1
            ) AS has_livestock
        """),
        {"tid": tid},
    )).first()
    has_livestock = bool(livestock_row[0]) if livestock_row else False

    # ---- 4.5. Resolve farm_active_groups if farm_id provided ----
    active_groups: Optional[list[str]] = None
    if farm_id:
        # Validate farm belongs to user's tenant
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

        # Fetch active groups for this farm
        ag_rows = (await db.execute(
            text("""
                SELECT catalog_group
                FROM tenant.farm_active_groups
                WHERE farm_id = :fid AND is_active = true
            """),
            {"fid": farm_id},
        )).all()
        ag_list = [r[0] for r in ag_rows]
        # Empty list = farm not yet onboarded; fall back to "show all"
        # Non-empty list = apply filter
        if ag_list:
            active_groups = ag_list

    # ---- 5. Fetch catalog rows ----
    # Apply filters in SQL where possible; role/mode rank comparisons in Python
    # (catalog stores enum strings, not ranks — translation happens here).
    sql_filters = ["c.is_active = true"]
    params: dict = {}

    if include_system:
        # FOUNDER + include_system: include SYSTEM rows AND user-facing rows
        pass  # no is_user_facing filter
    else:
        sql_filters.append("c.is_user_facing = true")

    if group:
        sql_filters.append("c.catalog_group = :group")
        params["group"] = group

    if not has_livestock:
        sql_filters.append("c.livestock_only = false")

    if active_groups is not None:
        sql_filters.append("c.catalog_group = ANY(:active_groups)")
        params["active_groups"] = active_groups

    where = " AND ".join(sql_filters)

    rows = (await db.execute(
        text(f"""
            SELECT
                c.event_type,
                c.catalog_group,
                c.sort_order,
                c.is_user_facing,
                c.is_compound,
                c.compound_emits,
                c.livestock_only,
                c.min_role,
                c.min_mode,
                c.backdating_window_days,
                c.requires_reason_after_days,
                c.notes,
                COALESCE(
                    (
                        SELECT array_agg(s.subtype_value ORDER BY s.sort_order)
                        FROM shared.event_type_subtypes s
                        WHERE s.event_type = c.event_type AND s.is_active = true
                    ),
                    ARRAY[]::text[]
                ) AS subtypes
            FROM shared.event_type_catalog c
            WHERE {where}
            ORDER BY c.catalog_group, c.sort_order
        """),
        params,
    )).mappings().all()

    # ---- 6. Apply role + mode rank filters in Python ----
    filtered: list[dict] = []
    for r in rows:
        d = dict(r)
        # Role filter
        min_role_rank = CATALOG_ROLE_RANK.get(d["min_role"], 99)
        if user_role_rank < min_role_rank:
            continue
        # Mode filter
        min_mode_rank = MODE_RANK.get(d["min_mode"], 99)
        if tenant_mode_rank < min_mode_rank:
            continue
        # Convert compound_emits from PG array (already a list in mappings()) to plain list
        if d.get("compound_emits") is not None and not isinstance(d["compound_emits"], list):
            d["compound_emits"] = list(d["compound_emits"])
        filtered.append(d)

    # ---- 7. Inject translations from shared.naming_dictionary ----
    label_keys = []
    desc_keys = []
    voice_keys = []
    subtype_keys = []
    for d in filtered:
        label_keys.append(f"event.{d['event_type']}.label")
        desc_keys.append(f"event.{d['event_type']}.description")
        voice_keys.append(f"event.{d['event_type']}.voice_prompt")
        for st in (d.get('subtypes') or []):
            subtype_keys.append(f"subtype.{d['event_type']}.{st}.label")
    group_keys = [f"group.{g}.label" for g in {d['catalog_group'] for d in filtered}]

    labels        = await name_many(db, label_keys,   form='label')        if label_keys   else {}
    descriptions  = await name_many(db, desc_keys,    form='description')  if desc_keys    else {}
    voice_prompts = await name_many(db, voice_keys,   form='voice_prompt') if voice_keys   else {}
    subtype_labels= await name_many(db, subtype_keys, form='label')        if subtype_keys else {}
    group_labels  = await name_many(db, group_keys,   form='label')        if group_keys   else {}

    for d in filtered:
        et = d['event_type']
        d['translated'] = {
            'label':        labels.get(f"event.{et}.label", et),
            'description':  descriptions.get(f"event.{et}.description", ''),
            'voice_prompt': voice_prompts.get(f"event.{et}.voice_prompt", ''),
            'subtype_labels': {st: subtype_labels.get(f"subtype.{et}.{st}.label", st) for st in (d.get('subtypes') or [])},
        }

    return success_envelope(
        {"events": filtered},
        meta={
            "count": len(filtered),
            "user_role": user_role,
            "user_role_rank": user_role_rank,
            "tenant_mode": tenant_mode,
            "has_livestock": has_livestock,
            "include_system": include_system,
            "active_groups": active_groups,
            "farm_id": farm_id,
            "group_labels": {g.replace('group.', '').replace('.label', ''): v for g, v in group_labels.items()},
        },
    )
