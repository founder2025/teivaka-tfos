from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
from typing import Optional
import uuid

router = APIRouter()

class WeatherLogCreate(BaseModel):
    farm_id: str
    observation_date: datetime
    observation_time: Optional[str] = None  # "07:00", "13:00", "18:00"
    rainfall_mm: Optional[Decimal] = None
    temp_min_c: Optional[Decimal] = None
    temp_max_c: Optional[Decimal] = None
    temp_avg_c: Optional[Decimal] = None
    humidity_pct: Optional[Decimal] = None
    wind_speed_kmh: Optional[Decimal] = None
    wind_direction: Optional[str] = None  # N, NE, E, SE, S, SW, W, NW
    cloud_cover: Optional[str] = None  # CLEAR, PARTLY_CLOUDY, OVERCAST
    weather_event: Optional[str] = None  # CYCLONE, HEAVY_RAIN, DROUGHT, FROST, FLOOD
    notes: Optional[str] = None
    idempotency_key: Optional[str] = None

@router.get("")
async def list_weather(farm_id: str = None, days: int = 30, user: dict = Depends(get_current_user)):
    """List weather observations for a farm for the last N days.

    Reads the live tenant.weather_log schema (log_id / logged_at / temp_min_c /
    temp_max_c) and aliases to the keys the UI consumes (weather_id /
    observation_date / temp_avg_c).
    """
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"]), "days": days}
        q = """
            SELECT log_id AS weather_id,
                   logged_at AS observation_date,
                   rainfall_mm,
                   temp_min_c, temp_max_c,
                   CASE WHEN temp_min_c IS NOT NULL AND temp_max_c IS NOT NULL
                        THEN ROUND(((temp_min_c + temp_max_c) / 2)::numeric, 1) END AS temp_avg_c,
                   humidity_pct, wind_speed_kmh, wind_direction,
                   weather_condition, source
              FROM tenant.weather_log
             WHERE tenant_id = :tid
               AND logged_at >= now() - interval '1 day' * :days
        """
        if farm_id:
            q += " AND farm_id = :farm_id"
            params["farm_id"] = farm_id
        result = await db.execute(text(q + " ORDER BY logged_at DESC LIMIT 200"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/summary/{farm_id}")
async def get_weather_summary(farm_id: str, days: int = 30, user: dict = Depends(get_current_user)):
    """Aggregated weather summary: total rainfall, avg/max/min temp, humidity."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(text("""
            SELECT
                COUNT(*) AS observations,
                COALESCE(SUM(rainfall_mm), 0) AS total_rainfall_mm,
                ROUND(AVG((temp_min_c + temp_max_c) / 2)::numeric, 1) AS avg_temp_c,
                MAX(temp_max_c) AS max_temp_c,
                MIN(temp_min_c) AS min_temp_c,
                ROUND(AVG(humidity_pct)::numeric, 1) AS avg_humidity_pct,
                MIN(logged_at) AS period_start,
                MAX(logged_at) AS period_end
            FROM tenant.weather_log
            WHERE farm_id = :farm_id AND tenant_id = :tid
              AND logged_at >= now() - interval '1 day' * :days
        """), {"farm_id": farm_id, "tid": str(user["tenant_id"]), "days": days})
        row = result.mappings().first()
        return {"data": dict(row) if row else {}}

# cloud_cover (UI) -> weather_condition CHECK enum on tenant.weather_log
_CONDITION = {"CLEAR": "SUNNY", "PARTLY_CLOUDY": "PARTLY_CLOUDY", "OVERCAST": "OVERCAST"}

@router.post("")
async def log_weather(body: WeatherLogCreate, user: dict = Depends(get_current_user)):
    """Log a daily weather observation into the live tenant.weather_log schema."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        log_id = f"WTH-{uuid.uuid4().hex[:8].upper()}"
        condition = _CONDITION.get((body.cloud_cover or "").upper())
        await db.execute(text("""
            INSERT INTO tenant.weather_log
                (log_id, tenant_id, farm_id, logged_at, rainfall_mm, temp_min_c,
                 temp_max_c, humidity_pct, wind_speed_kmh, wind_direction,
                 weather_condition, source, notes, created_by)
            VALUES
                (:log_id, :tenant_id, :farm_id, :logged_at, :rainfall_mm, :temp_min_c,
                 :temp_max_c, :humidity_pct, :wind_speed_kmh, :wind_direction,
                 :weather_condition, 'MANUAL', :notes, :created_by)
        """), {
            "log_id": log_id,
            "tenant_id": str(user["tenant_id"]),
            "farm_id": body.farm_id,
            "logged_at": body.observation_date,
            "rainfall_mm": body.rainfall_mm,
            "temp_min_c": body.temp_min_c,
            "temp_max_c": body.temp_max_c,
            "humidity_pct": body.humidity_pct,
            "wind_speed_kmh": body.wind_speed_kmh,
            "wind_direction": body.wind_direction,
            "weather_condition": condition,
            "notes": body.notes,
            "created_by": str(user["user_id"]),
        })
    return {"data": {"weather_id": log_id, "farm_id": body.farm_id}}


@router.get("/current/{farm_id}")
async def get_current_weather(farm_id: str, user: dict = Depends(get_current_user)):
    """Latest live 'now' conditions for a farm (from cached Open-Meteo fetch)."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        row = (await db.execute(text("""
            SELECT valid_at, temp_c, precip_mm, humidity_pct, wind_kmh, wind_dir,
                   weather_code, source, fetched_at
              FROM tenant.weather_forecast
             WHERE farm_id = :fid AND kind = 'CURRENT'
             ORDER BY fetched_at DESC LIMIT 1
        """), {"fid": farm_id})).mappings().first()
        return {"data": dict(row) if row else None}


@router.get("/forecast/{farm_id}")
async def get_forecast(farm_id: str, range: str = "daily", user: dict = Depends(get_current_user)):
    """Live forecast: range=hourly (next ~48h) or daily (7-day)."""
    kind = "HOURLY" if range.lower() == "hourly" else "DAILY"
    limit = 48 if kind == "HOURLY" else 7
    async with get_rls_db(str(user["tenant_id"])) as db:
        rows = (await db.execute(text(f"""
            SELECT valid_at, temp_c, temp_min_c, temp_max_c, precip_mm, precip_prob_pct,
                   humidity_pct, wind_kmh, wind_dir, weather_code, source, fetched_at
              FROM tenant.weather_forecast
             WHERE farm_id = :fid AND kind = :kind
               AND valid_at >= (now() - interval '2 hours')
             ORDER BY valid_at ASC LIMIT {limit}
        """), {"fid": farm_id, "kind": kind})).mappings().all()
        fetched_at = rows[0]["fetched_at"] if rows else None
        return {"data": [dict(r) for r in rows], "meta": {"kind": kind, "source": "open-meteo", "fetched_at": str(fetched_at) if fetched_at else None}}
