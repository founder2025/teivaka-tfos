from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from decimal import Decimal
import uuid
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()

VALID_INPUT_CATEGORIES = {"FERTILIZER", "PESTICIDE", "HERBICIDE", "FUNGICIDE", "SEED", "SEEDLING", "TOOL", "PACKAGING", "FUEL", "OTHER"}


class InputCreate(BaseModel):
    farm_id: str
    input_name: str
    input_category: str = "OTHER"
    unit_of_measure: str = "unit"
    current_stock_qty: Decimal = Decimal("0")
    reorder_point_qty: Optional[Decimal] = None
    reorder_qty: Optional[Decimal] = None
    unit_cost_fjd: Optional[Decimal] = None
    preferred_supplier_id: Optional[str] = None
    storage_location: Optional[str] = None
    notes: Optional[str] = None


@router.post("", status_code=201)
async def create_input(body: InputCreate, user: dict = Depends(get_current_user)):
    if body.input_category not in VALID_INPUT_CATEGORIES:
        raise HTTPException(400, detail=f"input_category must be one of {sorted(VALID_INPUT_CATEGORIES)}")
    if not body.input_name.strip():
        raise HTTPException(400, detail="input_name is required")
    input_id = f"INP-{uuid.uuid4().hex[:6].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO tenant.inputs
                (input_id, tenant_id, farm_id, input_name, input_category, unit_of_measure,
                 current_stock_qty, reorder_point_qty, reorder_qty, unit_cost_fjd,
                 preferred_supplier_id, storage_location, notes)
            VALUES
                (:id, :tid, :farm_id, :name, :cat, :uom,
                 :stock, :rop, :roq, :cost, :sup, :loc, :notes)
        """), {
            "id": input_id, "tid": str(user["tenant_id"]), "farm_id": body.farm_id,
            "name": body.input_name.strip(), "cat": body.input_category, "uom": body.unit_of_measure,
            "stock": body.current_stock_qty, "rop": body.reorder_point_qty, "roq": body.reorder_qty,
            "cost": body.unit_cost_fjd, "sup": body.preferred_supplier_id or None,
            "loc": body.storage_location, "notes": body.notes,
        })
    return {"data": {"input_id": input_id, "input_name": body.input_name.strip()}}


class InputPatch(BaseModel):
    input_name: Optional[str] = None
    input_category: Optional[str] = None
    unit_of_measure: Optional[str] = None
    reorder_point_qty: Optional[Decimal] = None
    reorder_qty: Optional[Decimal] = None
    unit_cost_fjd: Optional[Decimal] = None
    preferred_supplier_id: Optional[str] = None
    storage_location: Optional[str] = None
    notes: Optional[str] = None


@router.patch("/{input_id}")
async def update_input(input_id: str, body: InputPatch, user: dict = Depends(get_current_user)):
    """Correct an item's details. current_stock_qty is NOT editable here — it's
    maintained by the input-transactions trigger; adjust stock via a movement."""
    updates = body.model_dump(exclude_unset=True)
    if "input_category" in updates and updates["input_category"] not in VALID_INPUT_CATEGORIES:
        raise HTTPException(400, detail=f"input_category must be one of {sorted(VALID_INPUT_CATEGORIES)}")
    if not updates:
        raise HTTPException(400, detail="No fields to update")
    if updates.get("preferred_supplier_id") == "":
        updates["preferred_supplier_id"] = None
    cols = ", ".join(f"{k} = :{k}" for k in updates)
    params = {**updates, "iid": input_id, "tid": str(user["tenant_id"])}
    async with get_rls_db(str(user["tenant_id"])) as db:
        r = await db.execute(text(f"UPDATE tenant.inputs SET {cols}, updated_at = now() WHERE input_id = :iid AND tenant_id = :tid RETURNING input_id"), params)
        if not r.first():
            raise HTTPException(404, detail="Input not found")
    return {"data": {"input_id": input_id}}


@router.get("")
async def list_inputs(farm_id: str = None, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"])}
        # stock_status / expiring_soon are pure derivations over tenant.inputs —
        # compute them inline instead of joining mv_input_balance (an MV that was
        # never built; the LEFT JOIN 500'd the whole endpoint → blanked the
        # Analytics inputs panel / Decision Center inventory / Inventory page).
        q = """SELECT i.*,
                      CASE
                          WHEN i.reorder_point_qty IS NULL THEN 'NO_REORDER_SET'
                          WHEN i.current_stock_qty <= 0 THEN 'OUT_OF_STOCK'
                          WHEN i.current_stock_qty <= i.reorder_point_qty THEN 'REORDER_NOW'
                          WHEN i.current_stock_qty <= i.reorder_point_qty * 1.5 THEN 'LOW_STOCK'
                          ELSE 'ADEQUATE'
                      END AS stock_status,
                      (i.expiry_date IS NOT NULL AND i.expiry_date < CURRENT_DATE + 30) AS expiring_soon
               FROM tenant.inputs i
               WHERE i.tenant_id = :tid AND i.is_active = true"""
        if farm_id:
            q += " AND i.farm_id = :farm_id"
            params["farm_id"] = farm_id
        result = await db.execute(text(q + " ORDER BY i.input_name"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/{input_id}")
async def get_input(input_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("SELECT * FROM tenant.inputs WHERE input_id = :input_id"),
            {"input_id": input_id}
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Input not found")
        return {"data": dict(row)}
