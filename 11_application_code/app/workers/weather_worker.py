"""weather_worker — scheduled Open-Meteo fetch into tenant.weather_forecast.

Cross-tenant scan is STRUCTURAL (Strike #95): iterate tenant.tenants, then
with_rls per tenant. Per-farm SAVEPOINT isolation (Strike #113) so one farm's
failure never rolls back the rest. Coordinate-dedupe avoids refetching shared
locations. Browser never touches Open-Meteo — only this worker does.
"""
import json
import logging
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from math import radians, sin, cos, asin, sqrt

import redis as sync_redis

from app.workers.celery_app import app as celery_app
from app.workers.rls_helpers import with_rls
from app.workers.decision_engine_worker import get_sync_db
from app.config import settings

logger = logging.getLogger(__name__)

OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
HOURLY = "temperature_2m,precipitation,precipitation_probability,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code"
DAILY = "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,weather_code"
CURRENT = "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,weather_code"
HOURLY_KEEP = 48  # next ~2 days


def _fetch(lat, lon):
    qs = urllib.parse.urlencode({
        "latitude": lat, "longitude": lon,
        "current": CURRENT, "hourly": HOURLY, "daily": DAILY,
        "forecast_days": 7, "wind_speed_unit": "kmh", "timezone": "Pacific/Fiji",
    })
    with urllib.request.urlopen(f"{OPEN_METEO}?{qs}", timeout=20) as r:
        return json.loads(r.read())


def _rows_from(payload):
    """Flatten Open-Meteo payload into weather_forecast row dicts."""
    rows = []
    cur = payload.get("current") or {}
    if cur.get("time"):
        rows.append(dict(kind="CURRENT", valid_at=cur["time"],
            temp_c=cur.get("temperature_2m"), temp_min_c=None, temp_max_c=None,
            precip_mm=cur.get("precipitation"), precip_prob_pct=None,
            humidity_pct=cur.get("relative_humidity_2m"),
            wind_kmh=cur.get("wind_speed_10m"), wind_dir=str(cur.get("wind_direction_10m") or ""),
            weather_code=cur.get("weather_code")))
    h = payload.get("hourly") or {}
    for i, t in enumerate(h.get("time", [])[:HOURLY_KEEP]):
        g = lambda k: (h.get(k) or [None] * (i + 1))[i]  # noqa: E731
        rows.append(dict(kind="HOURLY", valid_at=t,
            temp_c=g("temperature_2m"), temp_min_c=None, temp_max_c=None,
            precip_mm=g("precipitation"), precip_prob_pct=g("precipitation_probability"),
            humidity_pct=g("relative_humidity_2m"),
            wind_kmh=g("wind_speed_10m"), wind_dir=str(g("wind_direction_10m") or ""),
            weather_code=g("weather_code")))
    d = payload.get("daily") or {}
    for i, t in enumerate(d.get("time", [])[:7]):
        g = lambda k: (d.get(k) or [None] * (i + 1))[i]  # noqa: E731
        rows.append(dict(kind="DAILY", valid_at=t,
            temp_c=None, temp_min_c=g("temperature_2m_min"), temp_max_c=g("temperature_2m_max"),
            precip_mm=g("precipitation_sum"), precip_prob_pct=g("precipitation_probability_max"),
            humidity_pct=None, wind_kmh=g("wind_speed_10m_max"), wind_dir=None,
            weather_code=g("weather_code")))
    return rows


@celery_app.task(name="app.workers.weather_worker.fetch_all_weather")
def fetch_all_weather():
    conn = get_sync_db()
    conn.autocommit = False
    fetched, farms_done, farms_skipped = {}, 0, 0
    try:
        with conn.cursor() as c0:
            c0.execute("SELECT tenant_id FROM tenant.tenants")
            tenant_ids = [r["tenant_id"] for r in c0.fetchall()]

        for tid in tenant_ids:
            with conn:  # one transaction per tenant
                with with_rls(conn, str(tid)) as cur:
                    cur.execute("""
                        SELECT farm_id, latitude, longitude
                          FROM tenant.farms
                         WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                    """)
                    farms = cur.fetchall()
                    for f in farms:
                        cur.execute("SAVEPOINT sp_farm")
                        try:
                            key = (round(float(f["latitude"]), 2), round(float(f["longitude"]), 2))
                            payload = fetched.get(key) or fetched.setdefault(key, _fetch(*key))
                            rows = _rows_from(payload)
                            cur.execute(
                                "DELETE FROM tenant.weather_forecast WHERE farm_id = %s",
                                (f["farm_id"],),
                            )
                            for row in rows:
                                cur.execute("""
                                    INSERT INTO tenant.weather_forecast
                                      (tenant_id, farm_id, kind, valid_at, temp_c, temp_min_c,
                                       temp_max_c, precip_mm, precip_prob_pct, humidity_pct,
                                       wind_kmh, wind_dir, weather_code, source, fetched_at)
                                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'open-meteo',now())
                                """, (str(tid), f["farm_id"], row["kind"], row["valid_at"],
                                      row["temp_c"], row["temp_min_c"], row["temp_max_c"],
                                      row["precip_mm"], row["precip_prob_pct"], row["humidity_pct"],
                                      row["wind_kmh"], row["wind_dir"], row["weather_code"]))
                            cur.execute("RELEASE SAVEPOINT sp_farm")
                            farms_done += 1
                        except Exception as e:  # noqa: BLE001
                            cur.execute("ROLLBACK TO SAVEPOINT sp_farm")
                            farms_skipped += 1
                            logger.warning("weather fetch failed for farm %s: %s", f.get("farm_id"), e)
        logger.info("fetch_all_weather done: %s farms updated, %s skipped, %s locations fetched",
                    farms_done, farms_skipped, len(fetched))
        return {"farms_updated": farms_done, "farms_skipped": farms_skipped,
                "locations_fetched": len(fetched), "ran_at": datetime.now(timezone.utc).isoformat()}
    finally:
        conn.close()


# ── GDACS tropical-cyclone watch (Redis-cached, no table) ────────────
GDACS_TC = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP?eventtypes=TC"
FIJI_CENTROID = (-17.7, 178.0)
CYCLONE_REDIS_KEY = "weather:cyclones"


def haversine_km(a_lat, a_lon, b_lat, b_lon):
    la1, lo1, la2, lo2 = map(radians, [a_lat, a_lon, b_lat, b_lon])
    h = sin((la2 - la1) / 2) ** 2 + cos(la1) * cos(la2) * sin((lo2 - lo1) / 2) ** 2
    return 6371.0 * 2 * asin(sqrt(h))


def _fetch_cyclones():
    """Active tropical cyclones from GDACS within ~3000 km of Fiji (South Pacific)."""
    req = urllib.request.Request(GDACS_TC, headers={"User-Agent": "TFOS/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.loads(r.read())
    out = []
    for f in (data.get("features") or []):
        try:
            geom = f.get("geometry") or {}
            coords = geom.get("coordinates") or []
            if len(coords) < 2:
                continue
            lon, lat = float(coords[0]), float(coords[1])
            dist = haversine_km(FIJI_CENTROID[0], FIJI_CENTROID[1], lat, lon)
            if dist > 3000:
                continue
            p = f.get("properties") or {}
            sev = p.get("severitydata") or {}
            out.append({
                "name": p.get("eventname") or p.get("name") or "Tropical cyclone",
                "alert": p.get("alertlevel"),
                "category": sev.get("severity"),
                "category_text": sev.get("severitytext"),
                "lat": lat, "lon": lon,
                "is_current": p.get("iscurrent"),
            })
        except Exception:  # noqa: BLE001
            continue
    return out


@celery_app.task(name="app.workers.weather_worker.fetch_cyclones")
def fetch_cyclones():
    """Cache South-Pacific tropical cyclones to Redis (TTL 3h). No DB table."""
    try:
        cyclones = _fetch_cyclones()
    except Exception as e:  # noqa: BLE001
        logger.warning("GDACS cyclone fetch failed: %s", e)
        return {"error": str(e)}
    try:
        rc = sync_redis.from_url(settings.redis_url)
        rc.set(CYCLONE_REDIS_KEY,
               json.dumps({"cyclones": cyclones, "fetched_at": datetime.now(timezone.utc).isoformat()}),
               ex=10800)
    except Exception as e:  # noqa: BLE001
        logger.warning("cyclone cache write failed: %s", e)
        return {"error": f"redis: {e}", "cyclones": len(cyclones)}
    logger.info("fetch_cyclones cached %s South-Pacific systems", len(cyclones))
    return {"cyclones": len(cyclones), "ran_at": datetime.now(timezone.utc).isoformat()}
