from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from app.db.session import get_rls_db, get_db
from app.middleware.rls import get_current_user
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
from typing import Optional
import uuid

router = APIRouter()

class MarketPriceCreate(BaseModel):
    production_id: str
    market_name: str  # e.g. "Suva Municipal Market", "Nausori Market", "Lautoka Market"
    island: str
    grade: str = "A"
    price_per_kg_fjd: Decimal
    quantity_seen_kg: Optional[Decimal] = None
    observation_date: datetime
    source: str = "FARMER_REPORT"  # FARMER_REPORT, BUYER_REPORT, MINISTRY_DATA
    notes: Optional[str] = None

@router.get("/market-prices/{production_id}")
async def get_market_prices(
    production_id: str,
    island: str = None,
    market_name: str = None,
    days: int = 30,
    user: dict = Depends(get_current_user),
):
    """
    Returns crowdsourced market price observations for a production type.
    Useful for farmers to benchmark their selling price against current market rates.
    """
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"production_id": production_id, "days": days}
        q = """SELECT mp.*, p.production_name, p.production_category
               FROM community.market_price_reports mp
               JOIN shared.productions p ON p.production_id = mp.production_id
               WHERE mp.production_id = :production_id
               AND mp.observation_date >= now() - interval '1 day' * :days
               AND mp.is_validated = true"""
        if island:
            q += " AND mp.island = :island"
            params["island"] = island
        if market_name:
            q += " AND mp.market_name ILIKE :market_name"
            params["market_name"] = f"%{market_name}%"
        result = await db.execute(text(q + " ORDER BY mp.observation_date DESC LIMIT 50"), params)
        rows = [dict(r) for r in result.mappings().all()]

        # Calculate price statistics
        if rows:
            prices = [float(r["price_per_kg_fjd"]) for r in rows]
            stats = {
                "min_price_fjd": round(min(prices), 2),
                "max_price_fjd": round(max(prices), 2),
                "avg_price_fjd": round(sum(prices) / len(prices), 2),
                "observation_count": len(rows),
            }
        else:
            stats = {"min_price_fjd": None, "max_price_fjd": None, "avg_price_fjd": None, "observation_count": 0}

        return {"data": rows, "stats": stats}

@router.post("/market-prices")
async def report_market_price(body: MarketPriceCreate, user: dict = Depends(get_current_user)):
    """
    Submit a market price observation. Crowdsourced data from farmers and buyers.
    Reports are validated by FOUNDER before becoming visible in the aggregate.
    """
    report_id = f"MPR-{uuid.uuid4().hex[:6].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO community.market_price_reports
                (report_id, tenant_id, reporter_user_id, production_id, market_name, island,
                 grade, price_per_kg_fjd, quantity_seen_kg, observation_date, source,
                 notes, is_validated)
            VALUES
                (:report_id, :tenant_id, :reporter_user_id, :production_id, :market_name, :island,
                 :grade, :price_per_kg_fjd, :quantity_seen_kg, :observation_date, :source,
                 :notes, false)
        """), {
            "report_id": report_id,
            "tenant_id": str(user["tenant_id"]),
            "reporter_user_id": str(user["user_id"]),
            "production_id": body.production_id,
            "market_name": body.market_name,
            "island": body.island,
            "grade": body.grade,
            "price_per_kg_fjd": body.price_per_kg_fjd,
            "quantity_seen_kg": body.quantity_seen_kg,
            "observation_date": body.observation_date,
            "source": body.source,
            "notes": body.notes,
        })
    return {"data": {"report_id": report_id, "is_validated": False, "message": "Price report submitted. Will appear in aggregates after validation."}}

@router.get("/market-prices/{production_id}/trend")
async def get_price_trend(production_id: str, island: str = None, days: int = 90, user: dict = Depends(get_current_user)):
    """Weekly average price trend for a production over the last N days."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"production_id": production_id, "days": days}
        q = """
            SELECT date_trunc('week', observation_date) AS week_start,
                   ROUND(AVG(price_per_kg_fjd)::numeric, 2) AS avg_price_fjd,
                   MIN(price_per_kg_fjd) AS min_price_fjd,
                   MAX(price_per_kg_fjd) AS max_price_fjd,
                   COUNT(*) AS reports
            FROM community.market_price_reports
            WHERE production_id = :production_id
              AND observation_date >= now() - interval '1 day' * :days
              AND is_validated = true
        """
        if island:
            q += " AND island = :island"
            params["island"] = island
        q += " GROUP BY week_start ORDER BY week_start DESC"
        result = await db.execute(text(q), params)
        return {"data": [dict(r) for r in result.mappings().all()]}
