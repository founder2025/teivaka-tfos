from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
from typing import Optional

router = APIRouter()

class EquipmentCreate(BaseModel):
    farm_id: str
    equipment_name: str
    equipment_type: str  # TRACTOR, IRRIGATION, SPRAYER, HAND_TOOL, VEHICLE, OTHER
    make: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    purchase_date: Optional[datetime] = None
    purchase_cost_fjd: Optional[Decimal] = None
    current_value_fjd: Optional[Decimal] = None
    last_service_date: Optional[datetime] = None
    next_service_due: Optional[datetime] = None
    notes: Optional[str] = None

@router.get("")
async def list_equipment(farm_id: str = None, equipment_type: str = None, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"])}
        q = "SELECT * FROM tenant.equipment WHERE tenant_id = :tid AND is_active = true"
        if farm_id:
            q += " AND farm_id = :farm_id"
            params["farm_id"] = farm_id
        if equipment_type:
            q += " AND equipment_type = :equipment_type"
            params["equipment_type"] = equipment_type
        result = await db.execute(text(q + " ORDER BY equipment_name"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/{equipment_id}")
async def get_equipment(equipment_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("SELECT * FROM tenant.equipment WHERE equipment_id = :equipment_id AND tenant_id = :tid"),
            {"equipment_id": equipment_id, "tid": str(user["tenant_id"])}
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Equipment not found")
        return {"data": dict(row)}

@router.post("")
async def create_equipment(body: EquipmentCreate, user: dict = Depends(get_current_user)):
    import uuid
    equipment_id = f"EQP-{uuid.uuid4().hex[:6].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO tenant.equipment
                (equipment_id, tenant_id, farm_id, equipment_name, equipment_type,
                 make, model, serial_number, purchase_date, purchase_cost_fjd,
                 current_value_fjd, last_service_date, next_service_due, notes, created_by)
            VALUES
                (:equipment_id, :tenant_id, :farm_id, :equipment_name, :equipment_type,
                 :make, :model, :serial_number, :purchase_date, :purchase_cost_fjd,
                 :current_value_fjd, :last_service_date, :next_service_due, :notes, :created_by)
        """), {
            "equipment_id": equipment_id,
            "tenant_id": str(user["tenant_id"]),
            "farm_id": body.farm_id,
            "equipment_name": body.equipment_name,
            "equipment_type": body.equipment_type,
            "make": body.make,
            "model": body.model,
            "serial_number": body.serial_number,
            "purchase_date": body.purchase_date,
            "purchase_cost_fjd": body.purchase_cost_fjd,
            "current_value_fjd": body.current_value_fjd,
            "last_service_date": body.last_service_date,
            "next_service_due": body.next_service_due,
            "notes": body.notes,
            "created_by": str(user["user_id"]),
        })
    return {"data": {"equipment_id": equipment_id}}
