from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()


class PURename(BaseModel):
    pu_name: Optional[str] = None
    area_sqm: Optional[float] = None

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


@router.patch("/{pu_id}")
async def rename_production_unit(pu_id: str, body: PURename, user: dict = Depends(get_current_user)):
    """Rename a block / adjust its area. Canonical edit — every surface references
    pu_id and joins pu_name, so a rename here propagates everywhere automatically."""
    if body.pu_name is None and body.area_sqm is None:
        raise HTTPException(status_code=422, detail="Nothing to update")
    async with get_rls_db(str(user["tenant_id"])) as db:
        res = await db.execute(
            text("""UPDATE tenant.production_units
                       SET pu_name  = COALESCE(:name, pu_name),
                           area_sqm = COALESCE(:area, area_sqm),
                           updated_at = now()
                     WHERE pu_id = :pid AND tenant_id = :tid
                 RETURNING pu_id, pu_name, area_sqm"""),
            {"name": (body.pu_name.strip() if body.pu_name else None),
             "area": body.area_sqm, "pid": pu_id, "tid": str(user["tenant_id"])},
        )
        row = res.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Production unit not found")
        return {"data": dict(row)}
