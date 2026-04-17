from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class CustomerCreate(BaseModel):
    customer_name: str
    customer_type: str = "MARKET_VENDOR"  # MARKET_VENDOR, HOTEL, RESTAURANT, SUPERMARKET, EXPORT, INDIVIDUAL
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    island: Optional[str] = None
    market_location: Optional[str] = None  # e.g. SUVA_MUNICIPAL, NAUSORI, LAUTOKA
    tin_number: Optional[str] = None
    credit_limit_fjd: Optional[str] = None
    payment_terms_days: int = 0  # 0 = cash on delivery
    notes: Optional[str] = None

@router.get("")
async def list_customers(customer_type: str = None, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"])}
        q = "SELECT * FROM tenant.customers WHERE tenant_id = :tid AND is_active = true"
        if customer_type:
            q += " AND customer_type = :customer_type"
            params["customer_type"] = customer_type
        result = await db.execute(text(q + " ORDER BY customer_name"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/{customer_id}")
async def get_customer(customer_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("SELECT * FROM tenant.customers WHERE customer_id = :customer_id AND tenant_id = :tid"),
            {"customer_id": customer_id, "tid": str(user["tenant_id"])}
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Customer not found")
        return {"data": dict(row)}

@router.post("")
async def create_customer(body: CustomerCreate, user: dict = Depends(get_current_user)):
    import uuid
    customer_id = f"CST-{uuid.uuid4().hex[:6].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO tenant.customers
                (customer_id, tenant_id, customer_name, customer_type, contact_person,
                 phone, email, address, island, market_location, tin_number,
                 credit_limit_fjd, payment_terms_days, notes, created_by)
            VALUES
                (:customer_id, :tenant_id, :customer_name, :customer_type, :contact_person,
                 :phone, :email, :address, :island, :market_location, :tin_number,
                 :credit_limit_fjd, :payment_terms_days, :notes, :created_by)
        """), {
            "customer_id": customer_id,
            "tenant_id": str(user["tenant_id"]),
            "customer_name": body.customer_name,
            "customer_type": body.customer_type,
            "contact_person": body.contact_person,
            "phone": body.phone,
            "email": body.email,
            "address": body.address,
            "island": body.island,
            "market_location": body.market_location,
            "tin_number": body.tin_number,
            "credit_limit_fjd": body.credit_limit_fjd,
            "payment_terms_days": body.payment_terms_days,
            "notes": body.notes,
            "created_by": str(user["user_id"]),
        })
    return {"data": {"customer_id": customer_id, "customer_name": body.customer_name}}
