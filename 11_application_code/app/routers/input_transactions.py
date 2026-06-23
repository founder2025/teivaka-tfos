from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from app.core.audit_chain import emit_audit_event
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
            q += " AND it.txn_type = :txn_type"
            params["txn_type"] = transaction_type
        result = await db.execute(text(q + " ORDER BY it.txn_date DESC LIMIT 200"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.post("")
async def log_input_transaction(body: InputTransactionCreate, user: dict = Depends(get_current_user)):
    txn_id = f"ITX-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
    # Stock-movement sign: USAGE/WASTE/TRANSFER decrease on-hand, the rest increase it.
    # The update_input_stock trigger applies NEW.qty_change to tenant.inputs and
    # check_stock_not_negative guards the decrease, so qty_change MUST be signed.
    decreases = body.transaction_type in ("USAGE", "WASTE", "TRANSFER")
    qty_change = (-abs(body.quantity)) if decreases else abs(body.quantity)
    async with get_rls_db(str(user["tenant_id"])) as db:
        cur = (await db.execute(
            text("SELECT current_stock_qty FROM tenant.inputs WHERE input_id = :iid AND tenant_id = :tid"),
            {"iid": body.input_id, "tid": str(user["tenant_id"])},
        )).scalar()
        if cur is None:
            raise HTTPException(404, detail="input_id not found")
        qty_before = cur
        qty_after = qty_before + qty_change
        await db.execute(text("""
            INSERT INTO tenant.input_transactions
                (txn_id, tenant_id, input_id, farm_id, txn_type, txn_date,
                 qty_change, qty_before, qty_after,
                 unit_cost_fjd, total_cost_fjd, cycle_id, pu_id, supplier_id, notes, performed_by)
            VALUES
                (:txn_id, :tenant_id, :input_id, :farm_id, :txn_type, :txn_date,
                 :qty_change, :qty_before, :qty_after,
                 :unit_cost_fjd, :total_cost_fjd, :cycle_id, :pu_id, :supplier_id, :notes, :performed_by)
        """), {
            "txn_id": txn_id,
            "tenant_id": str(user["tenant_id"]),
            "input_id": body.input_id,
            "farm_id": body.farm_id,
            "txn_type": body.transaction_type,
            "txn_date": body.transaction_date,
            "qty_change": qty_change,
            "qty_before": qty_before,
            "qty_after": qty_after,
            "unit_cost_fjd": body.unit_cost_fjd,
            "total_cost_fjd": body.total_cost_fjd,
            "cycle_id": body.cycle_id,
            "pu_id": body.pu_id,
            "supplier_id": body.supplier_id,
            "notes": body.notes,
            "performed_by": str(user["user_id"]),
        })
        # One movement -> one audit row (Universal Event Form Contract). Same txn as the INSERT.
        await emit_audit_event(
            db=db,
            tenant_id=uuid.UUID(str(user["tenant_id"])),
            actor_user_id=uuid.UUID(str(user["user_id"])),
            event_type="INPUT_USED_ADJUSTMENT",
            entity_type="input_transaction",
            entity_id=txn_id,
            occurred_at=body.transaction_date,
            payload={
                "txn_id": txn_id,
                "farm_id": body.farm_id,
                "input_id": body.input_id,
                "transaction_type": body.transaction_type,
                "quantity": str(body.quantity) if body.quantity is not None else None,
            },
        )
    return {"data": {"txn_id": txn_id, "transaction_type": body.transaction_type}}
