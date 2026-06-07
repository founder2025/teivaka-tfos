from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()


class ZoneRename(BaseModel):
    zone_name: Optional[str] = None
    area_ha: Optional[float] = None

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


@router.patch("/{zone_id}")
async def rename_zone(zone_id: str, body: ZoneRename, user: dict = Depends(get_current_user)):
    """Rename a zone / adjust its area. Canonical — surfaces reference zone_id and
    join zone_name, so a rename here propagates everywhere."""
    if body.zone_name is None and body.area_ha is None:
        raise HTTPException(status_code=422, detail="Nothing to update")
    async with get_rls_db(str(user["tenant_id"])) as db:
        res = await db.execute(
            text("""UPDATE tenant.zones
                       SET zone_name = COALESCE(:name, zone_name),
                           area_ha   = COALESCE(:area, area_ha),
                           updated_at = now()
                     WHERE zone_id = :zid AND tenant_id = :tid
                 RETURNING zone_id, zone_name, area_ha"""),
            {"name": (body.zone_name.strip() if body.zone_name else None),
             "area": body.area_ha, "zid": zone_id, "tid": str(user["tenant_id"])},
        )
        row = res.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Zone not found")
        return {"data": dict(row)}
