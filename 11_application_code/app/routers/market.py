"""
Market Intelligence router — /api/v1/market

Folds into the community Marketplace. V1 surfaces:
  GET  /prices    weighted/avg market prices per crop (computed from community.price_records)
  POST /prices    submit a price observation (auth)
  GET  /demand    buyer demand board (community.demand_records, OPEN)
  POST /demand    post buyer demand (auth)
  GET  /supply    supply board / projected harvests (community.supply_forecasts)
  POST /supply    post a supply forecast (auth)  — projected_supply_kg computed if absent
  GET  /signals   market balance + opportunity score per crop (computed)
  GET  /snapshot  dashboard card: top demanded/supplied crops, latest prices, new requests

Honesty: prices are real submitted/admin-reference observations only — never fabricated.
Boards are honest-empty until users submit. The transaction-weighted engine uses
is_actual_sale rows (Σ price*qty / Σ qty); reference/spot prices fall back to a simple
average with lower confidence. Forecasting (per the Operator spec) is architected in the
schema but NOT activated here.

Reads are public (get_db, cross-tenant) like community listings; writes are authenticated
(get_rls_db sets tenant_id for provenance; community.* has no RLS).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from pydantic import BaseModel
from decimal import Decimal
from datetime import date, datetime
from typing import Optional

from app.db.session import get_db, get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()

_ADMIN_ROLES = {"ADMIN", "FOUNDER"}


# ----------------------------------------------------------------------------- models
class PriceSubmit(BaseModel):
    production_id: str
    variety_id: Optional[str] = None
    grade: Optional[str] = None
    price_per_kg_fjd: Decimal
    quantity_kg: Optional[Decimal] = None
    location_region: Optional[str] = None
    island: Optional[str] = None
    buyer_type: Optional[str] = None
    seller_type: Optional[str] = None
    is_actual_sale: bool = False
    observed_at: Optional[datetime] = None
    notes: Optional[str] = None
    farm_id: Optional[str] = None
    as_reference: bool = False  # admins only — mark as ADMIN_REFERENCE baseline


class DemandSubmit(BaseModel):
    production_id: str
    variety_id: Optional[str] = None
    grade: Optional[str] = None
    quantity_kg: Decimal
    frequency: str = "ONE_OFF"  # ONE_OFF | WEEKLY | MONTHLY | QUARTERLY | RECURRING
    buyer_name: Optional[str] = None
    buyer_type: Optional[str] = None
    location_region: Optional[str] = None
    island: Optional[str] = None
    required_by: Optional[date] = None
    price_offered_fjd: Optional[Decimal] = None
    contact_whatsapp: Optional[str] = None
    notes: Optional[str] = None
    farm_id: Optional[str] = None


class SupplySubmit(BaseModel):
    production_id: str
    variety_id: Optional[str] = None
    grade: Optional[str] = None
    area_ha: Optional[Decimal] = None
    plants: Optional[int] = None
    expected_yield_per_unit_kg: Optional[Decimal] = None
    yield_basis: str = "PER_PLANT"  # PER_PLANT | PER_HA
    success_probability: Decimal = Decimal("0.85")
    projected_supply_kg: Optional[Decimal] = None
    harvest_date: Optional[date] = None
    location_region: Optional[str] = None
    island: Optional[str] = None
    cycle_id: Optional[str] = None
    notes: Optional[str] = None
    farm_id: Optional[str] = None


# ----------------------------------------------------------------------------- helpers
def _confidence(n: int) -> str:
    if n >= 100:
        return "VERY_HIGH"
    if n >= 26:
        return "HIGH"
    if n >= 6:
        return "MEDIUM"
    return "LOW"


def _trend(recent, prior) -> str:
    if recent is None or prior is None or prior == 0:
        return "STABLE"
    r, p = float(recent), float(prior)
    if r > p * 1.03:
        return "UP"
    if r < p * 0.97:
        return "DOWN"
    return "STABLE"


def _balance_status(balance) -> str:
    if balance is None:
        return "BALANCED"
    if balance < 0.8:
        return "SHORTAGE"
    if balance > 1.2:
        return "OVERSUPPLY"
    return "BALANCED"


def _opportunity_band(score: int) -> str:
    if score >= 80:
        return "EXCELLENT"
    if score >= 60:
        return "GOOD"
    if score >= 40:
        return "MODERATE"
    return "HIGH_RISK"


# ----------------------------------------------------------------------------- prices
@router.get("/prices")
async def list_prices(production_id: str = None, island: str = None):
    """Market price board — one row per crop, computed from the last 90 days of
    observations. Weighted price uses actual sales (Σ price*qty / Σ qty); otherwise
    falls back to the simple average. Public, cross-tenant."""
    async with get_db() as db:
        params = {}
        where = ["pr.observed_at >= now() - interval '90 days'"]
        if production_id:
            where.append("pr.production_id = :pid"); params["pid"] = production_id
        if island:
            where.append("pr.island = :island"); params["island"] = island
        q = f"""
            SELECT pr.production_id,
                   p.production_name,
                   COUNT(*)                                                        AS sample_count,
                   COUNT(*) FILTER (WHERE pr.is_actual_sale)                       AS sale_count,
                   MIN(pr.price_per_kg_fjd)                                        AS price_low,
                   MAX(pr.price_per_kg_fjd)                                        AS price_high,
                   AVG(pr.price_per_kg_fjd)                                        AS price_avg,
                   SUM(pr.price_per_kg_fjd * pr.quantity_kg)
                       FILTER (WHERE pr.is_actual_sale AND pr.quantity_kg IS NOT NULL) AS w_num,
                   SUM(pr.quantity_kg)
                       FILTER (WHERE pr.is_actual_sale AND pr.quantity_kg IS NOT NULL) AS w_den,
                   AVG(pr.price_per_kg_fjd)
                       FILTER (WHERE pr.observed_at >= now() - interval '14 days') AS recent_avg,
                   AVG(pr.price_per_kg_fjd)
                       FILTER (WHERE pr.observed_at >= now() - interval '28 days'
                               AND pr.observed_at < now() - interval '14 days')    AS prior_avg,
                   MAX(pr.observed_at)                                             AS last_observed
            FROM community.price_records pr
            LEFT JOIN shared.productions p ON p.production_id = pr.production_id
            WHERE {' AND '.join(where)}
            GROUP BY pr.production_id, p.production_name
            ORDER BY last_observed DESC
        """
        rows = (await db.execute(text(q), params)).mappings().all()

    out = []
    for r in rows:
        w_den = r["w_den"]
        weighted = (float(r["w_num"]) / float(w_den)) if w_den else (float(r["price_avg"]) if r["price_avg"] is not None else None)
        out.append({
            "production_id": r["production_id"],
            "production_name": r["production_name"] or r["production_id"],
            "weighted_price_fjd": round(weighted, 2) if weighted is not None else None,
            "price_avg_fjd": round(float(r["price_avg"]), 2) if r["price_avg"] is not None else None,
            "price_low_fjd": round(float(r["price_low"]), 2) if r["price_low"] is not None else None,
            "price_high_fjd": round(float(r["price_high"]), 2) if r["price_high"] is not None else None,
            "trend": _trend(r["recent_avg"], r["prior_avg"]),
            "sample_count": r["sample_count"],
            "sale_count": r["sale_count"],
            "confidence": _confidence(r["sample_count"]),
            "weighted_from_sales": bool(w_den),
            "last_updated": r["last_observed"].isoformat() if r["last_observed"] else None,
        })
    return {"data": out}


@router.post("/prices")
async def submit_price(body: PriceSubmit, user: dict = Depends(get_current_user)):
    """Submit a price observation. Any authenticated user may submit (builds the data
    moat). Admins/founders may flag a row as ADMIN_REFERENCE."""
    source = "USER_SUBMITTED"
    if body.is_actual_sale:
        source = "TRANSACTION"
    elif body.as_reference and user.get("role") in _ADMIN_ROLES:
        source = "ADMIN_REFERENCE"
    async with get_rls_db(str(user["tenant_id"])) as db:
        row = (await db.execute(text("""
            INSERT INTO community.price_records
                (tenant_id, farm_id, created_by, production_id, variety_id, grade,
                 location_region, island, quantity_kg, price_per_kg_fjd, buyer_type,
                 seller_type, source, is_actual_sale, observed_at, notes)
            VALUES
                (:tenant_id, :farm_id, :created_by, :production_id, :variety_id, :grade,
                 :location_region, :island, :quantity_kg, :price, :buyer_type,
                 :seller_type, :source, :is_actual_sale, COALESCE(:observed_at, now()), :notes)
            RETURNING price_record_id
        """), {
            "tenant_id": str(user["tenant_id"]),
            "farm_id": body.farm_id,
            "created_by": str(user["user_id"]),
            "production_id": body.production_id,
            "variety_id": body.variety_id,
            "grade": body.grade,
            "location_region": body.location_region,
            "island": body.island,
            "quantity_kg": body.quantity_kg,
            "price": body.price_per_kg_fjd,
            "buyer_type": body.buyer_type,
            "seller_type": body.seller_type,
            "source": source,
            "is_actual_sale": body.is_actual_sale,
            "observed_at": body.observed_at,
            "notes": body.notes,
        })).mappings().first()
    return {"data": {"price_record_id": str(row["price_record_id"]), "source": source}}


# ----------------------------------------------------------------------------- demand
@router.get("/demand")
async def list_demand(production_id: str = None, island: str = None, status_filter: str = "OPEN"):
    async with get_db() as db:
        params = {}
        where = []
        if status_filter and status_filter.upper() != "ALL":
            where.append("d.status = :st"); params["st"] = status_filter.upper()
        if production_id:
            where.append("d.production_id = :pid"); params["pid"] = production_id
        if island:
            where.append("d.island = :island"); params["island"] = island
        clause = ("WHERE " + " AND ".join(where)) if where else ""
        rows = (await db.execute(text(f"""
            SELECT d.demand_record_id, d.production_id, p.production_name, d.variety_id, d.grade,
                   d.quantity_kg, d.frequency, d.is_recurring, d.buyer_name, d.buyer_type,
                   d.location_region, d.island, d.required_by, d.price_offered_fjd, d.status,
                   d.contact_whatsapp, d.notes, d.created_at
            FROM community.demand_records d
            LEFT JOIN shared.productions p ON p.production_id = d.production_id
            {clause}
            ORDER BY d.created_at DESC
            LIMIT 100
        """), params)).mappings().all()
    return {"data": [dict(r) for r in rows]}


@router.post("/demand")
async def submit_demand(body: DemandSubmit, user: dict = Depends(get_current_user)):
    is_recurring = body.frequency.upper() in ("WEEKLY", "MONTHLY", "QUARTERLY", "RECURRING")
    async with get_rls_db(str(user["tenant_id"])) as db:
        row = (await db.execute(text("""
            INSERT INTO community.demand_records
                (tenant_id, farm_id, created_by, production_id, variety_id, grade, quantity_kg,
                 frequency, is_recurring, buyer_name, buyer_type, location_region, island,
                 required_by, price_offered_fjd, contact_whatsapp, notes)
            VALUES
                (:tenant_id, :farm_id, :created_by, :production_id, :variety_id, :grade, :quantity_kg,
                 :frequency, :is_recurring, :buyer_name, :buyer_type, :location_region, :island,
                 :required_by, :price_offered_fjd, :contact_whatsapp, :notes)
            RETURNING demand_record_id
        """), {
            "tenant_id": str(user["tenant_id"]),
            "farm_id": body.farm_id,
            "created_by": str(user["user_id"]),
            "production_id": body.production_id,
            "variety_id": body.variety_id,
            "grade": body.grade,
            "quantity_kg": body.quantity_kg,
            "frequency": body.frequency.upper(),
            "is_recurring": is_recurring,
            "buyer_name": body.buyer_name or user.get("full_name"),
            "buyer_type": body.buyer_type,
            "location_region": body.location_region,
            "island": body.island,
            "required_by": body.required_by,
            "price_offered_fjd": body.price_offered_fjd,
            "contact_whatsapp": body.contact_whatsapp,
            "notes": body.notes,
        })).mappings().first()
    return {"data": {"demand_record_id": str(row["demand_record_id"]), "is_recurring": is_recurring}}


# ----------------------------------------------------------------------------- supply
@router.get("/supply")
async def list_supply(production_id: str = None, island: str = None):
    async with get_db() as db:
        params = {}
        where = ["s.status IN ('PLANNED','GROWING')"]
        if production_id:
            where.append("s.production_id = :pid"); params["pid"] = production_id
        if island:
            where.append("s.island = :island"); params["island"] = island
        rows = (await db.execute(text(f"""
            SELECT s.supply_forecast_id, s.production_id, p.production_name, s.variety_id, s.grade,
                   s.area_ha, s.plants, s.expected_yield_per_unit_kg, s.yield_basis,
                   s.success_probability, s.projected_supply_kg, s.harvest_date,
                   s.location_region, s.island, s.status, s.notes, s.created_at
            FROM community.supply_forecasts s
            LEFT JOIN shared.productions p ON p.production_id = s.production_id
            WHERE {' AND '.join(where)}
            ORDER BY s.harvest_date NULLS LAST, s.created_at DESC
            LIMIT 100
        """), params)).mappings().all()
    return {"data": [dict(r) for r in rows]}


@router.post("/supply")
async def submit_supply(body: SupplySubmit, user: dict = Depends(get_current_user)):
    # Projected supply = units * yield * success_probability (per spec) if not supplied.
    projected = body.projected_supply_kg
    if projected is None and body.expected_yield_per_unit_kg is not None:
        try:
            prob = float(body.success_probability or 0.85)
            yld = float(body.expected_yield_per_unit_kg)
            if body.yield_basis == "PER_HA" and body.area_ha is not None:
                projected = Decimal(str(round(float(body.area_ha) * yld * prob, 2)))
            elif body.plants is not None:
                projected = Decimal(str(round(body.plants * yld * prob, 2)))
        except (TypeError, ValueError):
            projected = None
    async with get_rls_db(str(user["tenant_id"])) as db:
        row = (await db.execute(text("""
            INSERT INTO community.supply_forecasts
                (tenant_id, farm_id, created_by, production_id, variety_id, grade, area_ha, plants,
                 expected_yield_per_unit_kg, yield_basis, success_probability, projected_supply_kg,
                 harvest_date, location_region, island, cycle_id, notes)
            VALUES
                (:tenant_id, :farm_id, :created_by, :production_id, :variety_id, :grade, :area_ha, :plants,
                 :yield_per_unit, :yield_basis, :success_probability, :projected_supply_kg,
                 :harvest_date, :location_region, :island, :cycle_id, :notes)
            RETURNING supply_forecast_id, projected_supply_kg
        """), {
            "tenant_id": str(user["tenant_id"]),
            "farm_id": body.farm_id,
            "created_by": str(user["user_id"]),
            "production_id": body.production_id,
            "variety_id": body.variety_id,
            "grade": body.grade,
            "area_ha": body.area_ha,
            "plants": body.plants,
            "yield_per_unit": body.expected_yield_per_unit_kg,
            "yield_basis": body.yield_basis,
            "success_probability": body.success_probability,
            "projected_supply_kg": projected,
            "harvest_date": body.harvest_date,
            "location_region": body.location_region,
            "island": body.island,
            "cycle_id": body.cycle_id,
            "notes": body.notes,
        })).mappings().first()
    return {"data": {"supply_forecast_id": str(row["supply_forecast_id"]),
                     "projected_supply_kg": float(row["projected_supply_kg"]) if row["projected_supply_kg"] is not None else None}}


# ----------------------------------------------------------------------------- signals
async def _compute_signals(db):
    """Per-crop supply index, demand index, balance, price trend and opportunity score.
    Demand recurring quantities are normalised to a monthly figure so one-off and
    recurring demand are comparable."""
    supply = (await db.execute(text("""
        SELECT production_id, COALESCE(SUM(projected_supply_kg),0) AS supply_kg
        FROM community.supply_forecasts
        WHERE status IN ('PLANNED','GROWING')
        GROUP BY production_id
    """))).mappings().all()
    demand = (await db.execute(text("""
        SELECT production_id,
               COALESCE(SUM(CASE frequency
                    WHEN 'WEEKLY'    THEN quantity_kg * 4.33
                    WHEN 'MONTHLY'   THEN quantity_kg
                    WHEN 'QUARTERLY' THEN quantity_kg / 3.0
                    WHEN 'RECURRING' THEN quantity_kg
                    ELSE quantity_kg END), 0) AS demand_kg
        FROM community.demand_records
        WHERE status = 'OPEN'
        GROUP BY production_id
    """))).mappings().all()
    trends = (await db.execute(text("""
        SELECT pr.production_id,
               AVG(price_per_kg_fjd) FILTER (WHERE observed_at >= now() - interval '14 days') AS recent_avg,
               AVG(price_per_kg_fjd) FILTER (WHERE observed_at >= now() - interval '28 days'
                                             AND observed_at < now() - interval '14 days')    AS prior_avg
        FROM community.price_records pr
        WHERE observed_at >= now() - interval '90 days'
        GROUP BY pr.production_id
    """))).mappings().all()
    names = (await db.execute(text("SELECT production_id, production_name FROM shared.productions"))).mappings().all()

    name_map = {n["production_id"]: n["production_name"] for n in names}
    supply_map = {s["production_id"]: float(s["supply_kg"]) for s in supply}
    demand_map = {d["production_id"]: float(d["demand_kg"]) for d in demand}
    trend_map = {t["production_id"]: _trend(t["recent_avg"], t["prior_avg"]) for t in trends}

    pids = set(supply_map) | set(demand_map) | set(trend_map)
    max_demand = max([demand_map.get(p, 0.0) for p in pids], default=0.0) or 1.0

    rows = []
    for pid in pids:
        s = supply_map.get(pid, 0.0)
        d = demand_map.get(pid, 0.0)
        trend = trend_map.get(pid, "STABLE")
        balance = (s / d) if d > 0 else (None if s == 0 else 999.0)
        # Opportunity: 40% demand strength + 30% supply gap + 20% trend + 10% historical(neutral)
        demand_score = 40.0 * (d / max_demand) if d > 0 else 0.0
        gap_score = 30.0 * max(0.0, min(1.0, (d - s) / d)) if d > 0 else 0.0
        trend_score = {"UP": 20.0, "STABLE": 10.0, "DOWN": 0.0}[trend]
        score = int(round(demand_score + gap_score + trend_score + 10.0))
        score = max(0, min(100, score))
        rows.append({
            "production_id": pid,
            "production_name": name_map.get(pid, pid),
            "supply_index_kg": round(s, 2),
            "demand_index_kg": round(d, 2),
            "market_balance": round(balance, 3) if balance is not None else None,
            "balance_status": _balance_status(balance),
            "price_trend": trend,
            "opportunity_score": score,
            "opportunity_band": _opportunity_band(score),
        })
    rows.sort(key=lambda r: r["opportunity_score"], reverse=True)
    return rows


@router.get("/signals")
async def market_signals():
    async with get_db() as db:
        return {"data": await _compute_signals(db)}


# ----------------------------------------------------------------------------- snapshot
@router.get("/snapshot")
async def market_snapshot():
    """Compact dashboard card: top demanded crops, top supplied crops, latest prices,
    newest buyer requests."""
    async with get_db() as db:
        top_demand = (await db.execute(text("""
            SELECT d.production_id, p.production_name, SUM(d.quantity_kg) AS qty
            FROM community.demand_records d
            LEFT JOIN shared.productions p ON p.production_id = d.production_id
            WHERE d.status = 'OPEN'
            GROUP BY d.production_id, p.production_name
            ORDER BY qty DESC LIMIT 5
        """))).mappings().all()
        top_supply = (await db.execute(text("""
            SELECT s.production_id, p.production_name, SUM(s.projected_supply_kg) AS qty
            FROM community.supply_forecasts s
            LEFT JOIN shared.productions p ON p.production_id = s.production_id
            WHERE s.status IN ('PLANNED','GROWING')
            GROUP BY s.production_id, p.production_name
            ORDER BY qty DESC NULLS LAST LIMIT 5
        """))).mappings().all()
        latest_prices = (await db.execute(text("""
            SELECT pr.production_id, p.production_name, pr.price_per_kg_fjd, pr.observed_at
            FROM community.price_records pr
            LEFT JOIN shared.productions p ON p.production_id = pr.production_id
            ORDER BY pr.observed_at DESC LIMIT 5
        """))).mappings().all()
        new_requests = (await db.execute(text("""
            SELECT d.demand_record_id, d.production_id, p.production_name, d.quantity_kg,
                   d.frequency, d.buyer_name, d.created_at
            FROM community.demand_records d
            LEFT JOIN shared.productions p ON p.production_id = d.production_id
            WHERE d.status = 'OPEN'
            ORDER BY d.created_at DESC LIMIT 5
        """))).mappings().all()
    return {"data": {
        "top_demand": [dict(r) for r in top_demand],
        "top_supply": [dict(r) for r in top_supply],
        "latest_prices": [dict(r) for r in latest_prices],
        "new_requests": [dict(r) for r in new_requests],
    }}
