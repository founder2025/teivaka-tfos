"""Geo helpers — server-side reverse geocoding for the composer's Place picker.

The browser can't call third-party geocoders directly (CSP connect-src 'self'),
so the API proxies a reverse lookup: GPS coords -> nearby village/town/region
names the farmer can tap as place chips. Uses OSM Nominatim (free tier, polite:
identifying User-Agent + per-coordinate cache so repeated opens cost nothing).
"""
import logging
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.rls import get_current_user

logger = logging.getLogger("teivaka.geo")
router = APIRouter()

# coords rounded to ~1km -> (expires_at, names). Tiny + process-local: this is
# a convenience cache, not a correctness dependency.
_cache: dict[tuple[float, float], tuple[float, list[str]]] = {}
_CACHE_TTL = 6 * 3600


@router.get("/regions")
async def list_regions(
    level: str | None = Query(None, description="DIVISION|PROVINCE|DISTRICT|TIKINA|VILLAGE"),
    parent_id: str | None = Query(None, description="region_id of the parent to list children of"),
    db: AsyncSession = Depends(get_db),
):
    """Public reference data for the registration region cascade (read-only).

    Drives Province -> District -> Tikina: the frontend asks for level=PROVINCE,
    then parent_id=<province> for its children, etc. Levels with no data yet
    (DISTRICT/TIKINA until that dataset is loaded) simply return [] — the UI
    renders only the levels that have rows. No auth: region names are public.
    """
    clauses, params = [], {}
    if level:
        clauses.append("level = :level")
        params["level"] = level.upper().strip()
    if parent_id:
        clauses.append("parent_region_id = :pid")
        params["pid"] = parent_id.strip()
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    rows = await db.execute(
        text(f"SELECT region_id, level, name, parent_region_id FROM shared.geo_regions{where} ORDER BY name"),
        params,
    )
    return {"data": [dict(r) for r in rows.mappings()]}


@router.get("/reverse")
async def reverse_geocode(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    user: dict = Depends(get_current_user),
):
    """Nearby place names for the given GPS position (most specific first)."""
    key = (round(lat, 2), round(lon, 2))
    hit = _cache.get(key)
    if hit and hit[0] > time.time():
        return {"data": {"places": hit[1]}}
    try:
        async with httpx.AsyncClient(timeout=6) as client:
            r = await client.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={"lat": lat, "lon": lon, "format": "jsonv2", "zoom": 14, "accept-language": "en"},
                headers={"User-Agent": "TFOS-Teivaka/1.0 (founder@teivaka.com)"},
            )
            r.raise_for_status()
            addr = (r.json() or {}).get("address", {}) or {}
    except Exception as e:  # noqa: BLE001 — geocoder down = empty suggestions, not an error page
        logger.warning("reverse geocode failed: %s", e)
        raise HTTPException(status_code=502, detail="Couldn't look up nearby places right now")
    # Most-specific-first, de-duplicated, max 5 chips.
    names: list[str] = []
    for k in ("village", "hamlet", "suburb", "town", "city", "municipality", "county", "state_district", "state"):
        v = addr.get(k)
        if v and v not in names:
            names.append(v)
    names = names[:5]
    _cache[key] = (time.time() + _CACHE_TTL, names)
    return {"data": {"places": names}}
