"""geo.py — shared geo helpers for distance-ranked surfaces (audit Slice 0).

Created for the Near You feed (near_you.py). Intentionally NOT yet refactoring the
4 existing copies in jobs_board/service_jobs/farm_map (that touches live endpoints —
a separate slice); this is the single source of truth for new code.

- resolve_viewer_origin(tenant_id, user_id): farm GPS → user GPS → None (read under
  the viewer's RLS context, since tenant.farms/users are RLS-scoped). map_features
  centroid fallback is deferred to a later slice.
- sql_distance_case(lat_col, lng_col): a NULL-safe SQL haversine fragment (km),
  guarded by a :has_origin bool param so it returns NULL when the viewer has no origin
  or the row has no coords.
- haversine_km(...): Python fallback for non-SQL call sites.
"""
from math import radians, sin, cos, asin, sqrt

from sqlalchemy import text

from app.db.session import get_rls_db


async def resolve_viewer_origin(tenant_id, user_id) -> dict:
    """Best-effort distance origin for the viewer. Never raises — returns has_origin=False
    on any failure so the caller degrades to an unranked (urgency-only) feed."""
    lat = lng = name = None
    try:
        async with get_rls_db(str(tenant_id)) as db:
            row = (await db.execute(text(
                "SELECT farm_name AS name, gps_lat, gps_lng FROM tenant.farms "
                "WHERE gps_lat IS NOT NULL AND gps_lng IS NOT NULL ORDER BY created_at LIMIT 1"
            ))).mappings().first()
            if not row:
                row = (await db.execute(text(
                    "SELECT full_name AS name, gps_lat, gps_lng FROM tenant.users "
                    "WHERE user_id = cast(:u AS uuid) AND gps_lat IS NOT NULL AND gps_lng IS NOT NULL"
                ), {"u": str(user_id)})).mappings().first()
            if row and row["gps_lat"] is not None and row["gps_lng"] is not None:
                lat, lng, name = float(row["gps_lat"]), float(row["gps_lng"]), row["name"]
    except Exception:
        pass  # origin is best-effort; never block the feed
    return {"lat": lat, "lng": lng, "name": name, "has_origin": lat is not None}


def sql_distance_case(lat_col: str, lng_col: str) -> str:
    """NULL-safe great-circle distance (km) as a SQL expression. Requires bound params
    :has_origin (bool), :olat, :olng (floats; bind 0.0 when no origin — value is unused
    because :has_origin gates it). LEAST/GREATEST clamp guards acos domain errors."""
    return (
        f"CASE WHEN :has_origin AND {lat_col} IS NOT NULL AND {lng_col} IS NOT NULL THEN "
        f"6371.0 * acos(LEAST(1.0, GREATEST(-1.0, "
        f"cos(radians(:olat)) * cos(radians({lat_col})) * cos(radians({lng_col}) - radians(:olng)) "
        f"+ sin(radians(:olat)) * sin(radians({lat_col})) ))) "
        f"ELSE NULL END"
    )


def haversine_km(a_lat, a_lng, b_lat, b_lng):
    if None in (a_lat, a_lng, b_lat, b_lng):
        return None
    a_lat, a_lng, b_lat, b_lng = map(float, (a_lat, a_lng, b_lat, b_lng))
    dlat, dlng = radians(b_lat - a_lat), radians(b_lng - a_lng)
    h = sin(dlat / 2) ** 2 + cos(radians(a_lat)) * cos(radians(b_lat)) * sin(dlng / 2) ** 2
    return round(2 * 6371.0 * asin(sqrt(h)), 1)
