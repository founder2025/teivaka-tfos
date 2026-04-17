from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class SupplierCreate(BaseModel):
    supplier_name: str
    supplier_type: str = "AGRI_INPUT"  # AGRI_INPUT, EQUIPMENT, LOGISTICS, PACKAGING, OTHER
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    island: Optional[str] = None
    tin_number: Optional[str] = None  # Fiji TIN
    payment_terms_days: int = 30
    notes: Optional[str] = None

@router.get("")
async def list_suppliers(supplier_type: str = None, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"])}
        q = "SELECT * FROM tenant.suppliers WHERE tenant_id = :tid AND is_active = true"
        if supplier_type:
            q += " AND supplier_type = :supplier_type"
            params["supplier_type"] = supplier_type
        result = await db.execute(text(q + " ORDER BY supplier_name"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/{supplier_id}")
async def get_supplier(supplier_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("SELECT * FROM tenant.suppliers WHERE supplier_id = :supplier_id AND tenant_id = :tid"),
            {"supplier_id": supplier_id, "tid": str(user["tenant_id"])}
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Supplier not found")
        return {"data": dict(row)}

@router.post("")
async def create_supplier(body: SupplierCreate, user: dict = Depends(get_current_user)):
    import uuid
    supplier_id = f"SUP-{uuid.uuid4().hex[:6].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO tenant.suppliers
                (supplier_id, tenant_id, supplier_name, supplier_type, contact_person,
                 phone, email, address, island, tin_number, payment_terms_days, notes, created_by)
            VALUES
                (:supplier_id, :tenant_id, :supplier_name, :supplier_type, :contact_person,
                 :phone, :email, :address, :island, :tin_number, :payment_terms_days, :notes, :created_by)
        """), {
            "supplier_id": supplier_id,
            "tenant_id": str(user["tenant_id"]),
            "supplier_name": body.supplier_name,
            "supplier_type": body.supplier_type,
            "contact_person": body.contact_person,
            "phone": body.phone,
            "email": body.email,
            "address": body.address,
            "island": body.island,
            "tin_number": body.tin_number,
            "payment_terms_days": body.payment_terms_days,
            "notes": body.notes,
            "created_by": str(user["user_id"]),
        })
    return {"data": {"supplier_id": supplier_id, "supplier_name": body.supplier_name}}
