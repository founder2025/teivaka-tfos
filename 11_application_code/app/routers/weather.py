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
    """List weather observations for a farm for the last N days."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"]), "days": days}
        q = """SELECT * FROM tenant.weather_log
               WHERE tenant_id = :tid
               AND observation_date >= now() - interval '1 day' * :days"""
        if farm_id:
            q += " AND farm_id = :farm_id"
            params["farm_id"] = farm_id
        result = await db.execute(text(q + " ORDER BY observation_date DESC LIMIT 200"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/summary/{farm_id}")
async def get_weather_summary(farm_id: str, days: int = 30, user: dict = Depends(get_current_user)):
    """Aggregated weather summary: total rainfall, avg temp, max temp for the period."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(text("""
            SELECT
                COUNT(*) AS observations,
                COALESCE(SUM(rainfall_mm), 0) AS total_rainfall_mm,
                ROUND(AVG(temp_avg_c)::numeric, 1) AS avg_temp_c,
                MAX(temp_max_c) AS max_temp_c,
                MIN(temp_min_c) AS min_temp_c,
                ROUND(AVG(humidity_pct)::numeric, 1) AS avg_humidity_pct,
                MIN(observation_date) AS period_start,
                MAX(observation_date) AS period_end
            FROM tenant.weather_log
            WHERE farm_id = :farm_id AND tenant_id = :tid
              AND observation_date >= now() - interval '1 day' * :days
        """), {"farm_id": farm_id, "tid": str(user["tenant_id"]), "days": days})
        row = result.mappings().first()
        return {"data": dict(row)}

@router.post("")
async def log_weather(body: WeatherLogCreate, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        if body.idempotency_key:
            result = await db.execute(
                text("SELECT weather_id FROM tenant.weather_log WHERE idempotency_key = :key LIMIT 1"),
                {"key": body.idempotency_key}
            )
            existing = result.mappings().first()
            if existing:
                return {"data": {"weather_id": existing["weather_id"], "duplicate": True}}

        weather_id = f"WTH-{uuid.uuid4().hex[:6].upper()}"
        await db.execute(text("""
            INSERT INTO tenant.weather_log
                (weather_id, tenant_id, farm_id, observation_date, observation_time,
                 rainfall_mm, temp_min_c, temp_max_c, temp_avg_c, humidity_pct,
                 wind_speed_kmh, wind_direction, cloud_cover, weather_event,
                 notes, created_by, idempotency_key)
            VALUES
                (:weather_id, :tenant_id, :farm_id, :observation_date, :observation_time,
                 :rainfall_mm, :temp_min_c, :temp_max_c, :temp_avg_c, :humidity_pct,
                 :wind_speed_kmh, :wind_direction, :cloud_cover, :weather_event,
                 :notes, :created_by, :idempotency_key)
        """), {
            "weather_id": weather_id,
            "tenant_id": str(user["tenant_id"]),
            "farm_id": body.farm_id,
            "observation_date": body.observation_date,
            "observation_time": body.observation_time,
            "rainfall_mm": body.rainfall_mm,
            "temp_min_c": body.temp_min_c,
            "temp_max_c": body.temp_max_c,
            "temp_avg_c": body.temp_avg_c,
            "humidity_pct": body.humidity_pct,
            "wind_speed_kmh": body.wind_speed_kmh,
            "wind_direction": body.wind_direction,
            "cloud_cover": body.cloud_cover,
            "weather_event": body.weather_event,
            "notes": body.notes,
            "created_by": str(user["user_id"]),
            "idempotency_key": body.idempotency_key,
        })
    return {"data": {"weather_id": weather_id, "farm_id": body.farm_id}}
