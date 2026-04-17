from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
from typing import Optional

router = APIRouter()

class PriceMasterCreate(BaseModel):
    production_id: str
    grade: str = "A"  # A, B, C, ORGANIC, EXPORT
    market_type: str = "LOCAL_MARKET"  # LOCAL_MARKET, HOTEL, EXPORT, SUPERMARKET
    min_price_fjd: Decimal
    max_price_fjd: Decimal
    recommended_price_fjd: Decimal
    unit: str = "kg"
    effective_from: datetime
    effective_to: Optional[datetime] = None
    notes: Optional[str] = None

@router.get("")
async def list_price_master(
    production_id: str = None,
    market_type: str = None,
    grade: str = None,
    user: dict = Depends(get_current_user),
):
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {}
        q = """SELECT pm.*, p.production_name, p.production_category
               FROM shared.price_master pm
               JOIN shared.productions p ON p.production_id = pm.production_id
               WHERE pm.is_active = true AND (pm.effective_to IS NULL OR pm.effective_to >= now())"""
        if production_id:
            q += " AND pm.production_id = :production_id"
            params["production_id"] = production_id
        if market_type:
            q += " AND pm.market_type = :market_type"
            params["market_type"] = market_type
        if grade:
            q += " AND pm.grade = :grade"
            params["grade"] = grade
        result = await db.execute(text(q + " ORDER BY p.production_name, pm.grade"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.post("")
async def create_price(body: PriceMasterCreate, user: dict = Depends(get_current_user)):
    # Only FOUNDER role can set global price master
    if user["role"] != "FOUNDER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only FOUNDER can manage price master")

    import uuid
    price_id = f"PRC-{uuid.uuid4().hex[:6].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO shared.price_master
                (price_id, production_id, grade, market_type, min_price_fjd, max_price_fjd,
                 recommended_price_fjd, unit, effective_from, effective_to, notes, created_by)
            VALUES
                (:price_id, :production_id, :grade, :market_type, :min_price_fjd, :max_price_fjd,
                 :recommended_price_fjd, :unit, :effective_from, :effective_to, :notes, :created_by)
        """), {
            "price_id": price_id,
            "production_id": body.production_id,
            "grade": body.grade,
            "market_type": body.market_type,
            "min_price_fjd": body.min_price_fjd,
            "max_price_fjd": body.max_price_fjd,
            "recommended_price_fjd": body.recommended_price_fjd,
            "unit": body.unit,
            "effective_from": body.effective_from,
            "effective_to": body.effective_to,
            "notes": body.notes,
            "created_by": str(user["user_id"]),
        })
    return {"data": {"price_id": price_id, "production_id": body.production_id, "recommended_price_fjd": str(body.recommended_price_fjd)}}
