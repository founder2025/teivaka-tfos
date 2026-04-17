from fastapi import APIRouter, Depends
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
from typing import Optional
import uuid

router = APIRouter()

class IncomeCreate(BaseModel):
    farm_id: str
    cycle_id: Optional[str] = None
    customer_id: Optional[str] = None
    production_id: Optional[str] = None
    transaction_date: datetime
    income_type: str = "HARVEST_SALE"
    quantity_kg: Optional[Decimal] = None
    unit_price_fjd: Optional[Decimal] = None
    gross_amount_fjd: Decimal
    discount_fjd: Decimal = Decimal("0")
    net_amount_fjd: Decimal
    payment_method: Optional[str] = None
    payment_status: str = "PENDING"
    notes: Optional[str] = None

@router.post("")
async def log_income(body: IncomeCreate, user: dict = Depends(get_current_user)):
    income_id = f"INC-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO tenant.income_log
                (income_id, transaction_date, tenant_id, farm_id, cycle_id, customer_id,
                 production_id, income_type, quantity_kg, unit_price_fjd,
                 gross_amount_fjd, discount_fjd, net_amount_fjd, payment_method,
                 payment_status, notes, created_by)
            VALUES
                (:income_id, :txn_date, :tenant_id, :farm_id, :cycle_id, :customer_id,
                 :production_id, :income_type, :quantity_kg, :unit_price_fjd,
                 :gross_amount_fjd, :discount_fjd, :net_amount_fjd, :payment_method,
                 :payment_status, :notes, :created_by)
        """), {
            "income_id": income_id, "txn_date": body.transaction_date,
            "tenant_id": str(user["tenant_id"]), "farm_id": body.farm_id,
            "cycle_id": body.cycle_id, "customer_id": body.customer_id,
            "production_id": body.production_id, "income_type": body.income_type,
            "quantity_kg": body.quantity_kg, "unit_price_fjd": body.unit_price_fjd,
            "gross_amount_fjd": body.gross_amount_fjd, "discount_fjd": body.discount_fjd,
            "net_amount_fjd": body.net_amount_fjd, "payment_method": body.payment_method,
            "payment_status": body.payment_status, "notes": body.notes,
            "created_by": str(user["user_id"]),
        })
    return {"data": {"income_id": income_id, "net_amount_fjd": str(body.net_amount_fjd)}}

@router.get("")
async def list_income(farm_id: str = None, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"])}
        q = "SELECT * FROM tenant.income_log WHERE tenant_id = :tid"
        if farm_id:
            q += " AND farm_id = :farm_id"
            params["farm_id"] = farm_id
        result = await db.execute(text(q + " ORDER BY transaction_date DESC LIMIT 100"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}
