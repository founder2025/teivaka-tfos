from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()

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
