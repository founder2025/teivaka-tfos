"""farm_map — Locations L2 persistence for the draw-your-own satellite map.

GET  /farm-map/{farm_id}   -> GeoJSON FeatureCollection of saved features.
PUT  /farm-map/{farm_id}   -> replace this farm's whole feature set (one txn).

One row per drawn shape in tenant.map_features (RLS-scoped). Each Feature's
properties carry kind/ref_id/label/area_ha; the rest of properties (colour,
facility_type, …) round-trips untouched so the Leaflet/Geoman client owns its
own styling. Replace-all keeps client and server in lockstep with no diffing.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Optional
from sqlalchemy import text

from app.db.session import get_rls_db, get_db
from app.middleware.rls import get_current_user
from app.utils.roles import has_role
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends as _Depends

router = APIRouter()

_KINDS = {"BOUNDARY", "ZONE", "BLOCK", "FACILITY", "POINT"}


def _walk_coords(c, lats, lngs):
    """Flatten any GeoJSON coordinate nesting into lat/lng lists ([lng,lat] pairs)."""
    if isinstance(c, (list, tuple)):
        if len(c) >= 2 and all(isinstance(x, (int, float)) for x in c[:2]):
            lngs.append(c[0]); lats.append(c[1])
        else:
            for e in c:
                _walk_coords(e, lats, lngs)


def _compute_pin(features):
    """Representative farm pin = centroid of the BOUNDARY if drawn, else of all shapes."""
    boundary = [f for f in features if (f.properties or {}).get("kind") == "BOUNDARY"]
    src = boundary or features
    lats, lngs = [], []
    for f in src:
        g = f.geometry or {}
        _walk_coords(g.get("coordinates"), lats, lngs)
    if not lats:
        return None
    return (round(sum(lats) / len(lats), 6), round(sum(lngs) / len(lngs), 6))


class Feature(BaseModel):
    type: str = "Feature"
    geometry: dict[str, Any]
    properties: dict[str, Any] = Field(default_factory=dict)


class FeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: list[Feature] = Field(default_factory=list)


def _kind(props: dict) -> str:
    k = str(props.get("kind") or props.get("feature_kind") or "BLOCK").upper()
    return k if k in _KINDS else "BLOCK"


def _row_to_feature(r) -> dict:
    props = dict(r["properties"] or {})
    props.update({
        "feature_id": str(r["feature_id"]),
        "kind": r["feature_kind"],
        "ref_id": r["ref_id"],
        "label": r["label"],
        "area_ha": float(r["area_ha"]) if r["area_ha"] is not None else None,
    })
    return {"type": "Feature", "geometry": r["geometry"], "properties": props}


# NOTE: registered before /{farm_id} so the literal path isn't captured as a farm_id.
@router.get("/global-pins")
async def global_pins(user: dict = Depends(get_current_user),
                      db: AsyncSession = _Depends(get_db)):
    """Platform-wide farm location pins — coordinates only, for admins + partners.

    Cross-tenant (non-RLS session, like the admin analytics map). Pins only
    (farm_id + lat/lng + name) per the operator's "just pin coordinates" brief —
    no enterprise/financial detail. PARTNER role and above only (PARTNER < ADMIN
    in the ladder, has_role is >=).
    """
    if not has_role(user.get("role"), "PARTNER"):
        raise HTTPException(status_code=403, detail="Requires PARTNER role or above")
    result = await db.execute(text("""
        SELECT f.farm_id, f.farm_name AS name, f.gps_lat AS lat, f.gps_lng AS lng
          FROM tenant.farms f
         WHERE f.gps_lat IS NOT NULL AND f.gps_lng IS NOT NULL AND f.is_active = true
    """))
    pins = [dict(r) for r in result.mappings()]
    return {"pins": pins, "count": len(pins)}


@router.get("/{farm_id}")
async def get_farm_map(farm_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("""
                SELECT feature_id, feature_kind, ref_id, label, geometry,
                       properties, area_ha
                  FROM tenant.map_features
                 WHERE tenant_id = :tid AND farm_id = :farm_id
                 ORDER BY feature_kind, created_at
            """),
            {"tid": str(user["tenant_id"]), "farm_id": farm_id},
        )
        rows = result.mappings().all()
    return {"type": "FeatureCollection", "farm_id": farm_id,
            "features": [_row_to_feature(r) for r in rows]}


@router.put("/{farm_id}")
async def put_farm_map(farm_id: str, fc: FeatureCollection,
                       user: dict = Depends(get_current_user)):
    tid = str(user["tenant_id"])
    uid = str(user.get("user_id")) if user.get("user_id") else None

    # Light validation: every feature needs a GeoJSON geometry with coordinates.
    for f in fc.features:
        if not isinstance(f.geometry, dict) or "type" not in f.geometry \
                or "coordinates" not in f.geometry:
            raise HTTPException(status_code=422, detail="INVALID_GEOMETRY")

    async with get_rls_db(tid) as db:
        # Replace-all: client always sends the authoritative full set.
        await db.execute(
            text("DELETE FROM tenant.map_features WHERE tenant_id = :tid AND farm_id = :farm_id"),
            {"tid": tid, "farm_id": farm_id},
        )
        for f in fc.features:
            props = dict(f.properties or {})
            area = props.get("area_ha")
            await db.execute(
                text("""
                    INSERT INTO tenant.map_features
                        (tenant_id, farm_id, feature_kind, ref_id, label,
                         geometry, properties, area_ha, updated_by)
                    VALUES
                        (:tid, :farm_id, :kind, :ref_id, :label,
                         CAST(:geometry AS jsonb), CAST(:properties AS jsonb),
                         :area_ha, CAST(:uid AS uuid))
                """),
                {
                    "tid": tid, "farm_id": farm_id, "kind": _kind(props),
                    "ref_id": props.get("ref_id"),
                    "label": props.get("label"),
                    "geometry": _json(f.geometry),
                    "properties": _json(props),
                    "area_ha": float(area) if isinstance(area, (int, float)) else None,
                    "uid": uid,
                },
            )
    # Auto-derive the farm's pin from the captured map and persist it on the farm
    # (own RLS context). Best-effort + isolated txn so it can never break the save
    # — feeds the platform-wide pins map. (decision: auto-from-their-map)
    pin = _compute_pin(fc.features)
    if pin:
        lat, lng = pin
        try:
            async with get_rls_db(tid) as db2:
                await db2.execute(
                    text("""
                        UPDATE tenant.farms
                           SET gps_lat = :lat, gps_lng = :lng,
                               latitude = :lat, longitude = :lng
                         WHERE farm_id = :farm_id AND tenant_id = :tid
                    """),
                    {"lat": lat, "lng": lng, "farm_id": farm_id, "tid": tid},
                )
        except Exception:
            pass  # grant/column gap must not fail the map save

    return {"ok": True, "farm_id": farm_id, "saved": len(fc.features), "pin": pin}


import json as _jsonlib
def _json(v) -> str:
    return _jsonlib.dumps(v)
