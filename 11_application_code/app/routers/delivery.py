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

class DeliveryCreate(BaseModel):
    farm_id: str
    order_id: Optional[str] = None
    customer_id: Optional[str] = None
    delivery_date: datetime
    vehicle_type: Optional[str] = None  # OWN_TRUCK, HIRED_VEHICLE, BOAT, FERRY
    driver_name: Optional[str] = None
    destination: str
    island: Optional[str] = None
    total_weight_kg: Optional[Decimal] = None
    delivery_cost_fjd: Optional[Decimal] = None
    fuel_cost_fjd: Optional[Decimal] = None
    ferry_cost_fjd: Optional[Decimal] = None
    delivery_status: str = "PENDING"  # PENDING, IN_TRANSIT, DELIVERED, FAILED
    notes: Optional[str] = None
    idempotency_key: Optional[str] = None

@router.get("")
async def list_deliveries(farm_id: str = None, delivery_status: str = None, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"])}
        q = """SELECT d.*, c.customer_name
               FROM tenant.deliveries d
               LEFT JOIN tenant.customers c ON c.customer_id = d.customer_id
               WHERE d.tenant_id = :tid"""
        if farm_id:
            q += " AND d.farm_id = :farm_id"
            params["farm_id"] = farm_id
        if delivery_status:
            q += " AND d.delivery_status = :delivery_status"
            params["delivery_status"] = delivery_status
        result = await db.execute(text(q + " ORDER BY d.delivery_date DESC LIMIT 100"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/{delivery_id}")
async def get_delivery(delivery_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("SELECT * FROM tenant.deliveries WHERE delivery_id = :delivery_id AND tenant_id = :tid"),
            {"delivery_id": delivery_id, "tid": str(user["tenant_id"])}
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Delivery not found")
        return {"data": dict(row)}

@router.post("")
async def log_delivery(body: DeliveryCreate, user: dict = Depends(get_current_user)):
    delivery_id = f"DEL-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        if body.idempotency_key:
            result = await db.execute(
                text("SELECT delivery_id FROM tenant.deliveries WHERE idempotency_key = :key LIMIT 1"),
                {"key": body.idempotency_key}
            )
            if result.mappings().first():
                return {"data": {"delivery_id": delivery_id, "duplicate": True}}

        await db.execute(text("""
            INSERT INTO tenant.deliveries
                (delivery_id, tenant_id, farm_id, order_id, customer_id, delivery_date,
                 vehicle_type, driver_name, destination, island, total_weight_kg,
                 delivery_cost_fjd, fuel_cost_fjd, ferry_cost_fjd, delivery_status,
                 notes, created_by, idempotency_key)
            VALUES
                (:delivery_id, :tenant_id, :farm_id, :order_id, :customer_id, :delivery_date,
                 :vehicle_type, :driver_name, :destination, :island, :total_weight_kg,
                 :delivery_cost_fjd, :fuel_cost_fjd, :ferry_cost_fjd, :delivery_status,
                 :notes, :created_by, :idempotency_key)
        """), {
            "delivery_id": delivery_id,
            "tenant_id": str(user["tenant_id"]),
            "farm_id": body.farm_id,
            "order_id": body.order_id,
            "customer_id": body.customer_id,
            "delivery_date": body.delivery_date,
            "vehicle_type": body.vehicle_type,
            "driver_name": body.driver_name,
            "destination": body.destination,
            "island": body.island,
            "total_weight_kg": body.total_weight_kg,
            "delivery_cost_fjd": body.delivery_cost_fjd,
            "fuel_cost_fjd": body.fuel_cost_fjd,
            "ferry_cost_fjd": body.ferry_cost_fjd,
            "delivery_status": body.delivery_status,
            "notes": body.notes,
            "created_by": str(user["user_id"]),
            "idempotency_key": body.idempotency_key,
        })
    return {"data": {"delivery_id": delivery_id, "delivery_status": body.delivery_status}}

@router.patch("/{delivery_id}/status")
async def update_delivery_status(delivery_id: str, delivery_status: str, notes: str = None, user: dict = Depends(get_current_user)):
    valid = ("PENDING", "IN_TRANSIT", "DELIVERED", "FAILED", "RETURNED")
    if delivery_status not in valid:
        raise HTTPException(status_code=400, detail=f"delivery_status must be one of {valid}")
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(
            text("UPDATE tenant.deliveries SET delivery_status = :status, notes = COALESCE(:notes, notes), updated_at = now() WHERE delivery_id = :delivery_id AND tenant_id = :tid"),
            {"status": delivery_status, "notes": notes, "delivery_id": delivery_id, "tid": str(user["tenant_id"])}
        )
    return {"data": {"delivery_id": delivery_id, "delivery_status": delivery_status}}
