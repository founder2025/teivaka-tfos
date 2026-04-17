from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()

@router.get("")
async def list_inputs(farm_id: str = None, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"])}
        q = """SELECT i.*, mv.stock_status, mv.expiring_soon
               FROM tenant.inputs i
               LEFT JOIN tenant.mv_input_balance mv ON mv.input_id = i.input_id
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
