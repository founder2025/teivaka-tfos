"""farm_map — Locations L2 persistence for the draw-your-own satellite map.

GET  /farm-map/{farm_id}   -> GeoJSON FeatureCollection of saved features.
PUT  /farm-map/{farm_id}   -> replace this farm's whole feature set (one txn).

One row per drawn shape in tenant.map_features (RLS-scoped). Each Feature's
properties carry kind/ref_id/label/area_ha; the rest of properties (colour,
facility_type, …) round-trips untouched so the Leaflet/Geoman client owns its
own styling. Replace-all keeps client and server in lockstep with no diffing.
"""
from uuid import UUID
import hashlib
import math
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Optional
from sqlalchemy import text

from app.db.session import get_rls_db, get_db
from app.core.audit_chain import emit_audit_event
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


def _haversine_km(a_lat, a_lng, b_lat, b_lng):
    if a_lat is None or a_lng is None or b_lat is None or b_lng is None:
        return None
    a_lat, a_lng, b_lat, b_lng = float(a_lat), float(a_lng), float(b_lat), float(b_lng)
    dlat = math.radians(b_lat - a_lat)
    dlng = math.radians(b_lng - a_lng)
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a_lat)) * math.cos(math.radians(b_lat)) * math.sin(dlng / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(h))


def _fuzz(lat, lng, seed):
    """Deterministic ~0.6–1.0 km offset so a shared pin never reveals the exact
    homestead GPS, yet stays put across reloads (seeded by the member's id).
    Distance is computed from the REAL coords before fuzzing, so it stays exact."""
    h = int(hashlib.sha256(str(seed).encode()).hexdigest(), 16)
    ang = (h % 360) * math.pi / 180.0
    rad_km = 0.6 + ((h >> 9) % 400) / 1000.0  # 0.6 .. 1.0 km
    lat = float(lat); lng = float(lng)
    coslat = math.cos(math.radians(lat)) or 1e-6
    dlat = (rad_km / 111.0) * math.cos(ang)
    dlng = (rad_km / (111.320 * coslat)) * math.sin(ang)
    return round(lat + dlat, 6), round(lng + dlng, 6)


@router.get("/network")
async def network_map(user: dict = Depends(get_current_user),
                      db: AsyncSession = _Depends(get_db)):
    """Networking map — verified members who opted to share, plotted with the EXACT
    distance from the viewer but a ~1km-FUZZED pin (Operator posture 2026-06-23:
    verified-viewers-only, exact km + fuzzed pin). Cross-tenant, like global-pins;
    returns name + type + verified badge + distance only — never exact coords."""
    viewer_tid = str(user["tenant_id"])
    # Viewer gate: verified members (green tick) or PARTNER+ (admins/partners inherit).
    vrow = (await db.execute(
        text("SELECT kyc_verified FROM tenant.users WHERE user_id = :uid"),
        {"uid": str(user["user_id"])},
    )).mappings().first()
    verified = bool(vrow and vrow["kyc_verified"]) or has_role(user.get("role"), "PARTNER")
    if not verified:
        raise HTTPException(status_code=403, detail="VERIFICATION_REQUIRED")

    # Viewer's own location (distance origin) — their first farm with coords.
    origin = (await db.execute(
        text("SELECT gps_lat, gps_lng FROM tenant.farms "
             "WHERE tenant_id = :tid AND gps_lat IS NOT NULL AND gps_lng IS NOT NULL "
             "ORDER BY created_at LIMIT 1"),
        {"tid": viewer_tid},
    )).mappings().first()
    o_lat = origin["gps_lat"] if origin else None
    o_lng = origin["gps_lng"] if origin else None

    # One pin per opted-in member farm (DISTINCT ON farm; representative = earliest
    # opted-in user in that tenant). Excludes the viewer's own tenant.
    rows = (await db.execute(text("""
        SELECT DISTINCT ON (f.farm_id)
               f.farm_id, f.farm_name, f.gps_lat, f.gps_lng,
               u.account_type, u.kyc_verified
          FROM tenant.farms f
          JOIN tenant.users u
            ON u.tenant_id = f.tenant_id
           AND u.share_location = true
           AND u.location_share_ack_at IS NOT NULL
         WHERE f.gps_lat IS NOT NULL AND f.gps_lng IS NOT NULL
           AND f.is_active = true
           AND f.tenant_id <> :viewer_tid
         ORDER BY f.farm_id, u.created_at
    """), {"viewer_tid": viewer_tid})).mappings().all()

    members = []
    for r in rows:
        flat, flng = _fuzz(r["gps_lat"], r["gps_lng"], r["farm_id"])
        dist = _haversine_km(o_lat, o_lng, r["gps_lat"], r["gps_lng"])
        members.append({
            "id": hashlib.sha256(str(r["farm_id"]).encode()).hexdigest()[:12],
            "name": r["farm_name"] or "Member farm",
            "account_type": r["account_type"] or "FARMER",
            "verified": bool(r["kyc_verified"]),
            "lat": flat, "lng": flng,
            "distance_km": round(dist, 1) if dist is not None else None,
        })
    members.sort(key=lambda m: (m["distance_km"] is None, m["distance_km"] or 0))
    return {"members": members, "count": len(members), "has_origin": o_lat is not None}


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
        created = {"blocks": [], "zones": []}
        default_zone_id = None
        for f in fc.features:
            props = dict(f.properties or {})
            area = props.get("area_ha")
            kind = _kind(props)
            ref_id = props.get("ref_id")

            # Canonical binding (Phase 1): a drawn/walked ZONE or BLOCK with no
            # ref_id mints a real tenant.zones / tenant.production_units record so
            # it becomes first-class across cycles/harvest/events/rotation/reports.
            # Best-effort: a perm/constraint gap must never break saving geometry.
            if not ref_id and kind == "ZONE":
                try:
                    ref_id = await _mint_zone(db, tid, farm_id, props.get("label"), area)
                    created["zones"].append(ref_id)
                except Exception:
                    ref_id = None
            elif not ref_id and kind == "BLOCK":
                try:
                    if default_zone_id is None:
                        default_zone_id = await _ensure_default_zone(db, tid, farm_id)
                    ref_id = await _mint_pu(db, tid, farm_id, default_zone_id, props.get("label"), area)
                    created["blocks"].append(ref_id)
                except Exception:
                    ref_id = None
            props["ref_id"] = ref_id

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
                    "tid": tid, "farm_id": farm_id, "kind": kind,
                    "ref_id": ref_id,
                    "label": props.get("label"),
                    "geometry": _json(f.geometry),
                    "properties": _json(props),
                    "area_ha": float(area) if isinstance(area, (int, float)) else None,
                    "uid": uid,
                },
            )
        # Each newly-minted production unit -> one audit row (Universal Event Form
        # Contract). Atomic with the map save; PRODUCTION_UNIT_ESTABLISHED matches the
        # form-based /production-units path.
        for _pu_id in created["blocks"]:
            await emit_audit_event(
                db=db,
                tenant_id=UUID(tid),
                actor_user_id=UUID(uid) if uid else None,
                event_type="PRODUCTION_UNIT_ESTABLISHED",
                entity_type="production_unit",
                entity_id=_pu_id,
                payload={"pu_id": _pu_id, "farm_id": farm_id, "source": "map_draw"},
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

    return {"ok": True, "farm_id": farm_id, "saved": len(fc.features), "pin": pin, "created": created}


# ── Phase 1 canonical-binding helpers: mint zones / production_units ─────────
async def _next_zone_id(db, farm_id: str) -> str:
    r = await db.execute(
        text("SELECT COALESCE(MAX(CAST(SUBSTRING(zone_id FROM :off) AS INT)),0) AS m "
             "FROM tenant.zones WHERE zone_id ~ :pat"),
        {"off": len(farm_id) + 3, "pat": f"^{farm_id}-Z[0-9]+$"},
    )
    return f"{farm_id}-Z{(int(r.scalar() or 0) + 1):02d}"


async def _next_pu_id(db, farm_id: str) -> str:
    r = await db.execute(
        text("SELECT COALESCE(MAX(CAST(SUBSTRING(pu_id FROM :off) AS INT)),0) AS m "
             "FROM tenant.production_units WHERE pu_id ~ :pat"),
        {"off": len(farm_id) + 4, "pat": f"^{farm_id}-PU[0-9]+$"},
    )
    return f"{farm_id}-PU{(int(r.scalar() or 0) + 1):03d}"


async def _mint_zone(db, tid, farm_id, label, area_ha) -> str:
    zid = await _next_zone_id(db, farm_id)
    await db.execute(
        text("""INSERT INTO tenant.zones (zone_id, tenant_id, farm_id, zone_name, zone_type, area_ha)
                VALUES (:zid, :tid, :farm, :name, 'MIXED', :area)"""),
        {"zid": zid, "tid": tid, "farm": farm_id, "name": (label or "Zone").strip(),
         "area": float(area_ha) if isinstance(area_ha, (int, float)) else None},
    )
    return zid


async def _ensure_default_zone(db, tid, farm_id) -> str:
    r = await db.execute(
        text("SELECT zone_id FROM tenant.zones WHERE tenant_id = :tid AND farm_id = :farm ORDER BY zone_id LIMIT 1"),
        {"tid": tid, "farm": farm_id},
    )
    row = r.first()
    if row:
        return row[0]
    zid = await _next_zone_id(db, farm_id)
    await db.execute(
        text("""INSERT INTO tenant.zones (zone_id, tenant_id, farm_id, zone_name, zone_type)
                VALUES (:zid, :tid, :farm, 'Main zone', 'MIXED')"""),
        {"zid": zid, "tid": tid, "farm": farm_id},
    )
    return zid


async def _mint_pu(db, tid, farm_id, zone_id, label, area_ha) -> str:
    pid = await _next_pu_id(db, farm_id)
    area_sqm = round(float(area_ha) * 10000, 2) if isinstance(area_ha, (int, float)) else None
    await db.execute(
        text("""INSERT INTO tenant.production_units
                    (pu_id, tenant_id, zone_id, farm_id, pu_name, pu_type, area_sqm)
                VALUES (:pid, :tid, :zone, :farm, :name, 'PLOT', :area)"""),
        {"pid": pid, "tid": tid, "zone": zone_id, "farm": farm_id,
         "name": (label or "Block").strip(), "area": area_sqm},
    )
    return pid


import json as _jsonlib
def _json(v) -> str:
    return _jsonlib.dumps(v)
