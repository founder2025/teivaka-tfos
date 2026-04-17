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

class InputTransactionCreate(BaseModel):
    input_id: str
    farm_id: str
    cycle_id: Optional[str] = None
    pu_id: Optional[str] = None
    transaction_type: str  # PURCHASE, APPLICATION, DISPOSAL, ADJUSTMENT
    transaction_date: datetime
    quantity: Decimal
    unit: str
    unit_cost_fjd: Optional[Decimal] = None
    total_cost_fjd: Optional[Decimal] = None
    supplier_id: Optional[str] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[datetime] = None
    notes: Optional[str] = None
    idempotency_key: Optional[str] = None

@router.get("")
async def list_input_transactions(
    farm_id: str = None,
    input_id: str = None,
    transaction_type: str = None,
    user: dict = Depends(get_current_user),
):
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"])}
        q = """SELECT it.*, i.input_name, i.input_category
               FROM tenant.input_transactions it
               JOIN tenant.inputs i ON i.input_id = it.input_id
               WHERE it.tenant_id = :tid"""
        if farm_id:
            q += " AND it.farm_id = :farm_id"
            params["farm_id"] = farm_id
        if input_id:
            q += " AND it.input_id = :input_id"
            params["input_id"] = input_id
        if transaction_type:
            q += " AND it.transaction_type = :txn_type"
            params["txn_type"] = transaction_type
        result = await db.execute(text(q + " ORDER BY it.transaction_date DESC LIMIT 200"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.post("")
async def log_input_transaction(body: InputTransactionCreate, user: dict = Depends(get_current_user)):
    txn_id = f"ITX-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        if body.idempotency_key:
            result = await db.execute(
                text("SELECT txn_id FROM tenant.input_transactions WHERE idempotency_key = :key LIMIT 1"),
                {"key": body.idempotency_key}
            )
            existing = result.mappings().first()
            if existing:
                return {"data": {"txn_id": existing["txn_id"], "duplicate": True}}

        await db.execute(text("""
            INSERT INTO tenant.input_transactions
                (txn_id, tenant_id, input_id, farm_id, cycle_id, pu_id,
                 transaction_type, transaction_date, quantity, unit,
                 unit_cost_fjd, total_cost_fjd, supplier_id, batch_number,
                 expiry_date, notes, created_by, idempotency_key)
            VALUES
                (:txn_id, :tenant_id, :input_id, :farm_id, :cycle_id, :pu_id,
                 :txn_type, :txn_date, :quantity, :unit,
                 :unit_cost_fjd, :total_cost_fjd, :supplier_id, :batch_number,
                 :expiry_date, :notes, :created_by, :idempotency_key)
        """), {
            "txn_id": txn_id,
            "tenant_id": str(user["tenant_id"]),
            "input_id": body.input_id,
            "farm_id": body.farm_id,
            "cycle_id": body.cycle_id,
            "pu_id": body.pu_id,
            "txn_type": body.transaction_type,
            "txn_date": body.transaction_date,
            "quantity": body.quantity,
            "unit": body.unit,
            "unit_cost_fjd": body.unit_cost_fjd,
            "total_cost_fjd": body.total_cost_fjd,
            "supplier_id": body.supplier_id,
            "batch_number": body.batch_number,
            "expiry_date": body.expiry_date,
            "notes": body.notes,
            "created_by": str(user["user_id"]),
            "idempotency_key": body.idempotency_key,
        })
    return {"data": {"txn_id": txn_id, "transaction_type": body.transaction_type}}
