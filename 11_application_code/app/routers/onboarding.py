"""Phase 4.2 Option 3 Day 2 — Onboarding router.

Five endpoints (per onboarding_wizard_spec.md §Backend API Contracts):

  GET  /api/v1/onboarding/status
  POST /api/v1/onboarding/farm-basics
  POST /api/v1/onboarding/production-units   — payload key "blocks"
  POST /api/v1/onboarding/livestock          — farmer UI copy "animals"
  POST /api/v1/onboarding/complete

All responses wrap data in the standard envelope
    {"status":"success", "data":{...}, "meta":{"timestamp":"..."}}
per v4 Part 13/14.

Every state-changing endpoint emits exactly one audit.events row via
app.core.audit_chain.emit_audit_event.

Mode gating: NOT applied. Onboarding must run for all modes (farmer has
not been assigned a mode yet at this point).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_chain import emit_audit_event
from app.db.session import AsyncSessionLocal
from app.middleware.rls import get_current_user
from app.services.onboarding_service import (
    default_farmer_label,
    derive_initial_mode,
    next_farm_id,
    next_hive_id,
    next_livestock_id,
    next_pu_id,
    next_zone_id,
    route_livestock_row,
)


router = APIRouter(tags=["Onboarding"])


# ----------------------------------------------------------------------
# Envelope helper
# ----------------------------------------------------------------------

def _envelope(data: Any) -> dict:
    return {
        "status": "success",
        "data": data,
        "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
    }


# ----------------------------------------------------------------------
# Pydantic request models
# ----------------------------------------------------------------------

class LocationIn(BaseModel):
    type: str = Field(..., description="gps | village | skip")
    lat: float | None = None
    lng: float | None = None
    village_id: str | None = None


class FarmBasicsIn(BaseModel):
    farm_name: str
    location: LocationIn | None = None
    area_acres: float | None = None
    tenure_type: str | None = None  # itaukei | freehold | crown | other | skip
    section_term: str = "BLOCK"


class BlockIn(BaseModel):
    farmer_label: str | None = None


class CropIn(BaseModel):
    production_id: str
    blocks: list[BlockIn] = Field(default_factory=list)


class ProductionUnitsIn(BaseModel):
    crops: list[CropIn] = Field(default_factory=list)


class LivestockGroupIn(BaseModel):
    production_id: str
    count: int = Field(ge=0)
    farmer_label: str | None = None


class LivestockIn(BaseModel):
    groups: list[LivestockGroupIn] = Field(default_factory=list)


# ----------------------------------------------------------------------
# RLS session helper — yields a committed session per request.
# We don't use get_tenant_db from middleware.rls because its begin()
# context manager auto-commits on exit; we want to commit explicitly
# after emit_audit_event so the hash chain row is persisted atomically
# with the business write.
# ----------------------------------------------------------------------

async def _rls_session(tenant_id: str) -> AsyncSession:
    session = AsyncSessionLocal()
    await session.execute(
        text("SELECT set_config('app.tenant_id', :tid, false)"),
        {"tid": tenant_id},
    )
    return session


# ----------------------------------------------------------------------
# Endpoints
# ----------------------------------------------------------------------

@router.get("/status")
async def onboarding_status(user: dict = Depends(get_current_user)):
    """Return onboarding progress for the current tenant.

    Derives step from live DB state — onboarded_at flag on tenants plus
    row presence in farms / production_units / livestock_register /
    hive_register.
    """
    tenant_id = str(user["tenant_id"])
    session = await _rls_session(tenant_id)
    try:
        tenant = (
            await session.execute(
                text(
                    """
                    SELECT onboarded_at, section_term, mode
                    FROM tenant.tenants
                    WHERE tenant_id = :tid
                    """
                ),
                {"tid": tenant_id},
            )
        ).first()

        farm = (
            await session.execute(
                text(
                    "SELECT farm_id FROM tenant.farms "
                    "WHERE tenant_id = :tid ORDER BY created_at ASC LIMIT 1"
                ),
                {"tid": tenant_id},
            )
        ).first()

        pu_count = (
            await session.execute(
                text(
                    "SELECT COUNT(*) FROM tenant.production_units WHERE tenant_id = :tid"
                ),
                {"tid": tenant_id},
            )
        ).scalar() or 0

        liv_count = (
            await session.execute(
                text(
                    "SELECT COUNT(*) FROM tenant.livestock_register WHERE tenant_id = :tid"
                ),
                {"tid": tenant_id},
            )
        ).scalar() or 0

        hive_count = (
            await session.execute(
                text(
                    "SELECT COUNT(*) FROM tenant.hive_register WHERE tenant_id = :tid"
                ),
                {"tid": tenant_id},
            )
        ).scalar() or 0

        onboarded_at = tenant.onboarded_at if tenant else None
        if onboarded_at is not None:
            return _envelope(
                {
                    "onboarding_complete": True,
                    "farm_id": farm.farm_id if farm else None,
                    "mode": tenant.mode if tenant else None,
                    "section_term": tenant.section_term if tenant else None,
                    "next_route": "/solo/task"
                    if (tenant and tenant.mode == "SOLO")
                    else "/farm",
                }
            )

        if farm is None:
            step = "FARM_BASICS"
            next_route = "/onboarding/farm-basics"
        elif pu_count == 0 and liv_count == 0 and hive_count == 0:
            step = "WHAT_YOU_GROW"
            next_route = "/onboarding/what-you-grow"
        elif liv_count == 0 and hive_count == 0:
            step = "ANIMALS"
            next_route = "/onboarding/animals"
        else:
            step = "COMPLETE"
            next_route = "/onboarding/first-task"

        return _envelope(
            {
                "onboarding_complete": False,
                "current_step": step,
                "next_route": next_route,
                "farm_id": farm.farm_id if farm else None,
                "pu_count": pu_count,
                "livestock_count": liv_count + hive_count,
                "section_term": tenant.section_term if tenant else None,
            }
        )
    finally:
        await session.close()


@router.post("/farm-basics")
async def farm_basics(
    body: FarmBasicsIn,
    user: dict = Depends(get_current_user),
):
    tenant_id = str(user["tenant_id"])
    session = await _rls_session(tenant_id)
    try:
        # Idempotency: if a farm already exists for this tenant, update it
        # instead of creating a second row. Step is designed to be replayable.
        existing = (
            await session.execute(
                text(
                    "SELECT farm_id FROM tenant.farms "
                    "WHERE tenant_id = :tid ORDER BY created_at ASC LIMIT 1"
                ),
                {"tid": tenant_id},
            )
        ).first()

        section_term = (body.section_term or "BLOCK").upper()
        if section_term not in {"BLOCK", "PLOT", "BED", "FIELD", "PATCH"}:
            section_term = "BLOCK"

        # Convert acres → ha for land_area_ha column (1 acre ≈ 0.404686 ha).
        land_area_ha = (
            round(body.area_acres * 0.404686, 2)
            if body.area_acres is not None
            else None
        )

        gps_lat = None
        gps_lng = None
        location_name = "Unspecified"
        if body.location and body.location.type == "gps":
            gps_lat = body.location.lat
            gps_lng = body.location.lng
            location_name = "GPS"
        elif body.location and body.location.type == "village" and body.location.village_id:
            location_name = body.location.village_id

        if existing:
            farm_id = existing.farm_id
            await session.execute(
                text(
                    """
                    UPDATE tenant.farms
                    SET farm_name = :farm_name,
                        land_area_ha = COALESCE(:land_area_ha, land_area_ha),
                        gps_lat = COALESCE(:gps_lat, gps_lat),
                        gps_lng = COALESCE(:gps_lng, gps_lng),
                        location_name = :location_name,
                        updated_at = NOW()
                    WHERE farm_id = :farm_id
                    """
                ),
                {
                    "farm_name": body.farm_name,
                    "land_area_ha": land_area_ha,
                    "gps_lat": gps_lat,
                    "gps_lng": gps_lng,
                    "location_name": location_name,
                    "farm_id": farm_id,
                },
            )
            created = False
        else:
            farm_id = await next_farm_id(session, user["tenant_id"])
            await session.execute(
                text(
                    """
                    INSERT INTO tenant.farms (
                        farm_id, tenant_id, farm_name, location_name,
                        land_area_ha, gps_lat, gps_lng, farm_type, is_active
                    ) VALUES (
                        :farm_id, :tid, :farm_name, :location_name,
                        :land_area_ha, :gps_lat, :gps_lng, 'OWNED', TRUE
                    )
                    """
                ),
                {
                    "farm_id": farm_id,
                    "tid": tenant_id,
                    "farm_name": body.farm_name,
                    "location_name": location_name,
                    "land_area_ha": land_area_ha,
                    "gps_lat": gps_lat,
                    "gps_lng": gps_lng,
                },
            )
            created = True

        # Persist tenant-scoped preferences.
        await session.execute(
            text(
                """
                UPDATE tenant.tenants
                SET section_term = :term,
                    updated_at = NOW()
                WHERE tenant_id = :tid
                """
            ),
            {"term": section_term, "tid": tenant_id},
        )

        # Emit audit row: FARM_CREATED on first touch, ONBOARDING_STARTED on update.
        event_type = "FARM_CREATED" if created else "ONBOARDING_STARTED"
        await emit_audit_event(
            db=session,
            tenant_id=user["tenant_id"],
            actor_user_id=user["user_id"],
            event_type=event_type,
            entity_type="farm",
            entity_id=farm_id,
            payload={
                "farm_id": farm_id,
                "farm_name": body.farm_name,
                "area_acres": body.area_acres,
                "land_area_ha": land_area_ha,
                "tenure_type": body.tenure_type,
                "section_term": section_term,
                "location": body.location.model_dump() if body.location else None,
            },
        )

        await session.commit()

        return _envelope(
            {
                "farm_id": farm_id,
                "section_term": section_term,
                "next_step": "WHAT_YOU_GROW",
                "next_route": "/onboarding/what-you-grow",
            }
        )
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


@router.post("/production-units")
async def production_units(
    body: ProductionUnitsIn,
    user: dict = Depends(get_current_user),
):
    tenant_id = str(user["tenant_id"])
    session = await _rls_session(tenant_id)
    try:
        farm = (
            await session.execute(
                text(
                    "SELECT farm_id FROM tenant.farms "
                    "WHERE tenant_id = :tid ORDER BY created_at ASC LIMIT 1"
                ),
                {"tid": tenant_id},
            )
        ).first()
        if farm is None:
            from fastapi import HTTPException, status as _status
            raise HTTPException(
                status_code=_status.HTTP_409_CONFLICT,
                detail={
                    "code": "FARM_REQUIRED",
                    "message": "POST /onboarding/farm-basics before adding production units",
                },
            )
        farm_id = farm.farm_id

        tenant_row = (
            await session.execute(
                text("SELECT section_term FROM tenant.tenants WHERE tenant_id = :tid"),
                {"tid": tenant_id},
            )
        ).first()
        section_term = tenant_row.section_term if tenant_row and tenant_row.section_term else "BLOCK"

        # One default zone per farm is enough for Phase 4.2 Option 3.
        default_zone = (
            await session.execute(
                text(
                    "SELECT zone_id FROM tenant.zones "
                    "WHERE farm_id = :fid ORDER BY zone_id ASC LIMIT 1"
                ),
                {"fid": farm_id},
            )
        ).first()
        if default_zone is None:
            zone_id = await next_zone_id(session, farm_id)
            await session.execute(
                text(
                    """
                    INSERT INTO tenant.zones (
                        zone_id, tenant_id, farm_id, zone_name, zone_type
                    ) VALUES (
                        :zone_id, :tid, :fid, 'Main zone', 'MIXED'
                    )
                    """
                ),
                {"zone_id": zone_id, "tid": tenant_id, "fid": farm_id},
            )
        else:
            zone_id = default_zone.zone_id

        created_pus: list[dict] = []
        for crop in body.crops:
            prod = (
                await session.execute(
                    text(
                        "SELECT production_id, production_name FROM shared.productions "
                        "WHERE production_id = :pid"
                    ),
                    {"pid": crop.production_id},
                )
            ).first()
            if prod is None:
                from fastapi import HTTPException, status as _status
                raise HTTPException(
                    status_code=_status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "UNKNOWN_PRODUCTION_ID",
                        "message": f"production_id not found: {crop.production_id}",
                    },
                )

            # At least one block per crop; empty blocks list implicitly creates one.
            blocks = crop.blocks if crop.blocks else [BlockIn(farmer_label=None)]
            for block in blocks:
                pu_id = await next_pu_id(session, farm_id)
                label = block.farmer_label or default_farmer_label(
                    prod.production_name, section_term, kind="crop"
                )
                await session.execute(
                    text(
                        """
                        INSERT INTO tenant.production_units (
                            pu_id, tenant_id, zone_id, farm_id, pu_name, pu_type,
                            current_production_id, farmer_label, is_active
                        ) VALUES (
                            :pu_id, :tid, :zone_id, :fid, :pu_name, 'PLOT',
                            :production_id, :farmer_label, TRUE
                        )
                        """
                    ),
                    {
                        "pu_id": pu_id,
                        "tid": tenant_id,
                        "zone_id": zone_id,
                        "fid": farm_id,
                        "pu_name": label,
                        "production_id": crop.production_id,
                        "farmer_label": label,
                    },
                )
                created_pus.append({"pu_id": pu_id, "farmer_label": label})

        # One ONBOARDING_STARTED audit row for the whole batch (scope == farm).
        await emit_audit_event(
            db=session,
            tenant_id=user["tenant_id"],
            actor_user_id=user["user_id"],
            event_type="ONBOARDING_STARTED",
            entity_type="farm",
            entity_id=farm_id,
            payload={
                "step": "WHAT_YOU_GROW",
                "farm_id": farm_id,
                "created_count": len(created_pus),
                "production_units": created_pus,
            },
        )

        await session.commit()

        return _envelope(
            {
                "created_count": len(created_pus),
                "next_step": "ANIMALS",
                "next_route": "/onboarding/animals",
            }
        )
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


@router.post("/livestock")
async def livestock(
    body: LivestockIn,
    user: dict = Depends(get_current_user),
):
    tenant_id = str(user["tenant_id"])
    session = await _rls_session(tenant_id)
    try:
        farm = (
            await session.execute(
                text(
                    "SELECT farm_id FROM tenant.farms "
                    "WHERE tenant_id = :tid ORDER BY created_at ASC LIMIT 1"
                ),
                {"tid": tenant_id},
            )
        ).first()
        if farm is None:
            from fastapi import HTTPException, status as _status
            raise HTTPException(
                status_code=_status.HTTP_409_CONFLICT,
                detail={
                    "code": "FARM_REQUIRED",
                    "message": "POST /onboarding/farm-basics before adding livestock",
                },
            )
        farm_id = farm.farm_id

        created_rows: list[dict] = []
        skipped_zero_count = 0
        for group in body.groups:
            if group.count == 0:
                skipped_zero_count += 1
                continue

            table = await route_livestock_row(session, group.production_id)
            prod = (
                await session.execute(
                    text(
                        "SELECT production_id, production_name FROM shared.productions "
                        "WHERE production_id = :pid"
                    ),
                    {"pid": group.production_id},
                )
            ).first()
            label = group.farmer_label or default_farmer_label(
                prod.production_name if prod else group.production_id,
                None,
                kind="animal",
            )

            if table == "tenant.hive_register":
                for _ in range(group.count):
                    hive_id = await next_hive_id(session, farm_id)
                    await session.execute(
                        text(
                            """
                            INSERT INTO tenant.hive_register (
                                hive_id, tenant_id, farm_id, hive_type,
                                status, farmer_label
                            ) VALUES (
                                :hive_id, :tid, :fid, 'LANGSTROTH',
                                'ACTIVE', :label
                            )
                            """
                        ),
                        {
                            "hive_id": hive_id,
                            "tid": tenant_id,
                            "fid": farm_id,
                            "label": label,
                        },
                    )
                    created_rows.append({"hive_id": hive_id, "farmer_label": label})
            else:
                # livestock_register — species must match the CHECK constraint.
                # Map production_id → species via production_name heuristic.
                species = _infer_livestock_species(group.production_id, prod.production_name if prod else None)
                for _ in range(group.count):
                    lv_id = await next_livestock_id(session, farm_id)
                    await session.execute(
                        text(
                            """
                            INSERT INTO tenant.livestock_register (
                                livestock_id, tenant_id, farm_id, species,
                                status, farmer_label
                            ) VALUES (
                                :lv_id, :tid, :fid, :species,
                                'ACTIVE', :label
                            )
                            """
                        ),
                        {
                            "lv_id": lv_id,
                            "tid": tenant_id,
                            "fid": farm_id,
                            "species": species,
                            "label": label,
                        },
                    )
                    created_rows.append({"livestock_id": lv_id, "farmer_label": label})

        await emit_audit_event(
            db=session,
            tenant_id=user["tenant_id"],
            actor_user_id=user["user_id"],
            event_type="ONBOARDING_STARTED",
            entity_type="farm",
            entity_id=farm_id,
            payload={
                "step": "ANIMALS",
                "farm_id": farm_id,
                "created_count": len(created_rows),
                "skipped_zero_count": skipped_zero_count,
                "rows": created_rows,
            },
        )

        await session.commit()

        return _envelope(
            {
                "created_count": len(created_rows),
                "next_step": "COMPLETE",
                "next_route": "/onboarding/first-task",
            }
        )
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


@router.post("/complete")
async def complete(
    _body: dict = Body(default_factory=dict),
    user: dict = Depends(get_current_user),
):
    tenant_id = str(user["tenant_id"])
    session = await _rls_session(tenant_id)
    try:
        farm = (
            await session.execute(
                text(
                    "SELECT farm_id, land_area_ha FROM tenant.farms "
                    "WHERE tenant_id = :tid ORDER BY created_at ASC LIMIT 1"
                ),
                {"tid": tenant_id},
            )
        ).first()
        if farm is None:
            from fastapi import HTTPException, status as _status
            raise HTTPException(
                status_code=_status.HTTP_409_CONFLICT,
                detail={
                    "code": "FARM_REQUIRED",
                    "message": "Cannot complete onboarding without a farm",
                },
            )

        pu_count = (
            await session.execute(
                text("SELECT COUNT(*) FROM tenant.production_units WHERE tenant_id = :tid"),
                {"tid": tenant_id},
            )
        ).scalar() or 0

        liv_count = (
            await session.execute(
                text("SELECT COUNT(*) FROM tenant.livestock_register WHERE tenant_id = :tid"),
                {"tid": tenant_id},
            )
        ).scalar() or 0

        hive_count = (
            await session.execute(
                text("SELECT COUNT(*) FROM tenant.hive_register WHERE tenant_id = :tid"),
                {"tid": tenant_id},
            )
        ).scalar() or 0

        animal_count = liv_count + hive_count

        # Recover original acres from stored ha; derivation thresholds are in acres.
        area_acres = (
            round(float(farm.land_area_ha) / 0.404686, 2)
            if farm.land_area_ha is not None
            else None
        )
        mode = derive_initial_mode(area_acres, pu_count, animal_count)

        await session.execute(
            text(
                """
                UPDATE tenant.tenants
                SET onboarded_at = NOW(),
                    mode = :mode,
                    updated_at = NOW()
                WHERE tenant_id = :tid
                """
            ),
            {"mode": mode, "tid": tenant_id},
        )

        await emit_audit_event(
            db=session,
            tenant_id=user["tenant_id"],
            actor_user_id=user["user_id"],
            event_type="ONBOARDING_COMPLETED",
            entity_type="tenant",
            entity_id=tenant_id,
            payload={
                "farm_id": farm.farm_id,
                "mode": mode,
                "pu_count": pu_count,
                "animal_count": animal_count,
                "area_acres": area_acres,
            },
        )

        await session.commit()

        next_route = "/solo/task" if mode == "SOLO" else "/farm"
        return _envelope(
            {
                "mode": mode,
                "first_task_id": None,  # first-task generation deferred to Task Engine sweep
                "next_route": next_route,
            }
        )
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


# ----------------------------------------------------------------------
# Local helpers
# ----------------------------------------------------------------------

_SPECIES_MAP = {
    "LIV-GOA": "GOAT",
    "LIV-PIG": "PIG",
    "LIV-CAT": "CATTLE",
    "LIV-DIR": "CATTLE",
    "LIV-PBR": "CHICKEN",
    "LIV-PLY": "CHICKEN",
    "LIV-DCK": "DUCK",
    "LIV-SHP": "OTHER",  # sheep not in livestock species CHECK — store as OTHER
}


def _infer_livestock_species(production_id: str, production_name: str | None) -> str:
    if production_id in _SPECIES_MAP:
        return _SPECIES_MAP[production_id]
    pname = (production_name or "").lower()
    if "goat" in pname:
        return "GOAT"
    if "pig" in pname or "swine" in pname:
        return "PIG"
    if "cattle" in pname or "cow" in pname or "dairy" in pname or "beef" in pname:
        return "CATTLE"
    if "chicken" in pname or "broiler" in pname or "layer" in pname:
        return "CHICKEN"
    if "duck" in pname:
        return "DUCK"
    if "rabbit" in pname:
        return "RABBIT"
    return "OTHER"
