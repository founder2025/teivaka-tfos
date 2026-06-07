"""attendance — Locations L3 geo-locked worker clock in/out.

POST /attendance/clock  — record a clock-in/out with the field GPS fix; the API
checks the point against the farm's drawn BOUNDARY (tenant.map_features) so a
worker can only validly clock on inside the farm. GET /attendance — recent rows.

Tenant-scoped via RLS: available to every farm account, each seeing only its own.
"""
import math
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import text

from app.db.session import get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()


class ClockIn(BaseModel):
    farm_id: str
    kind: str                       # CLOCK_IN | CLOCK_OUT
    lat: float
    lng: float
    accuracy_m: Optional[float] = None
    worker_id: Optional[str] = None
    worker_name: Optional[str] = None
    note: Optional[str] = None


def _rings(geom: dict):
    """Yield outer rings ([[lng,lat],...]) from a GeoJSON Polygon/MultiPolygon."""
    if not geom:
        return
    t, c = geom.get("type"), geom.get("coordinates")
    if t == "Polygon" and c:
        yield c[0]
    elif t == "MultiPolygon" and c:
        for poly in c:
            if poly:
                yield poly[0]


def _point_in_ring(lng, lat, ring) -> bool:
    """Ray-casting point-in-polygon. ring = [[lng,lat],...]."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (lng < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _geofence(boundary_geoms, lat, lng):
    """Return (has_boundary, inside, distance_m). distance = nearest vertex if outside."""
    rings = []
    for g in boundary_geoms:
        rings.extend(list(_rings(g)))
    if not rings:
        return (False, None, None)
    inside = any(_point_in_ring(lng, lat, r) for r in rings)
    if inside:
        return (True, True, 0.0)
    nearest = min(_haversine_m(lat, lng, pt[1], pt[0]) for r in rings for pt in r)
    return (True, False, round(nearest, 2))


@router.post("/clock")
async def clock(body: ClockIn, user: dict = Depends(get_current_user)):
    if body.kind not in ("CLOCK_IN", "CLOCK_OUT"):
        raise HTTPException(status_code=422, detail="kind must be CLOCK_IN or CLOCK_OUT")
    tid = str(user["tenant_id"])
    uid = str(user.get("user_id")) if user.get("user_id") else None
    worker_id = body.worker_id or uid

    async with get_rls_db(tid) as db:
        res = await db.execute(
            text("""
                SELECT geometry FROM tenant.map_features
                 WHERE tenant_id = :tid AND farm_id = :farm_id AND feature_kind = 'BOUNDARY'
            """),
            {"tid": tid, "farm_id": body.farm_id},
        )
        boundary_geoms = [row[0] for row in res.fetchall()]
        has_boundary, inside, distance = _geofence(boundary_geoms, body.lat, body.lng)

        ins = await db.execute(
            text("""
                INSERT INTO tenant.worker_attendance
                    (tenant_id, farm_id, worker_id, worker_name, kind, lat, lng,
                     accuracy_m, inside_boundary, distance_m, note, created_by)
                VALUES
                    (:tid, :farm_id, CAST(:worker_id AS uuid), :worker_name, :kind, :lat, :lng,
                     :acc, :inside, :dist, :note, CAST(:uid AS uuid))
                RETURNING attendance_id, occurred_at
            """),
            {
                "tid": tid, "farm_id": body.farm_id, "worker_id": worker_id,
                "worker_name": body.worker_name, "kind": body.kind,
                "lat": body.lat, "lng": body.lng, "acc": body.accuracy_m,
                "inside": inside, "dist": distance, "note": body.note, "uid": uid,
            },
        )
        row = ins.mappings().first()

    return {
        "attendance_id": str(row["attendance_id"]),
        "occurred_at": row["occurred_at"].isoformat(),
        "kind": body.kind,
        "has_boundary": has_boundary,
        "inside_boundary": inside,
        "distance_m": distance,
    }


@router.get("")
async def list_attendance(farm_id: str, limit: int = 50,
                          user: dict = Depends(get_current_user)):
    tid = str(user["tenant_id"])
    async with get_rls_db(tid) as db:
        res = await db.execute(
            text("""
                SELECT attendance_id, farm_id, worker_id, worker_name, kind,
                       occurred_at, lat, lng, accuracy_m, inside_boundary, distance_m, note
                  FROM tenant.worker_attendance
                 WHERE tenant_id = :tid AND farm_id = :farm_id
                 ORDER BY occurred_at DESC
                 LIMIT :limit
            """),
            {"tid": tid, "farm_id": farm_id, "limit": min(limit, 200)},
        )
        rows = [dict(r) for r in res.mappings().all()]
    for r in rows:
        r["attendance_id"] = str(r["attendance_id"])
        if r.get("worker_id"):
            r["worker_id"] = str(r["worker_id"])
        if r.get("occurred_at"):
            r["occurred_at"] = r["occurred_at"].isoformat()
    return {"data": rows, "count": len(rows)}
