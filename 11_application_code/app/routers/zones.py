from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()

@router.get("")
async def list_zones(farm_id: str = None, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        q = "SELECT * FROM tenant.zones WHERE tenant_id = :tid"
        params = {"tid": str(user["tenant_id"])}
        if farm_id:
            q += " AND farm_id = :farm_id"
            params["farm_id"] = farm_id
        result = await db.execute(text(q + " ORDER BY zone_id"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/{zone_id}")
async def get_zone(zone_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("SELECT * FROM tenant.zones WHERE zone_id = :zone_id"),
            {"zone_id": zone_id}
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Zone not found")
        return {"data": dict(row)}
