from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()

@router.get("")
async def list_production_units(farm_id: str = None, zone_id: str = None, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        q = """SELECT pu.*, p.production_name
               FROM tenant.production_units pu
               LEFT JOIN shared.productions p ON p.production_id = pu.current_production_id
               WHERE pu.tenant_id = :tid"""
        params = {"tid": str(user["tenant_id"])}
        if farm_id:
            q += " AND pu.farm_id = :farm_id"
            params["farm_id"] = farm_id
        if zone_id:
            q += " AND pu.zone_id = :zone_id"
            params["zone_id"] = zone_id
        result = await db.execute(text(q + " ORDER BY pu.pu_id"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/{pu_id}")
async def get_production_unit(pu_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("SELECT * FROM tenant.production_units WHERE pu_id = :pu_id"),
            {"pu_id": pu_id}
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Production unit not found")
        return {"data": dict(row)}
