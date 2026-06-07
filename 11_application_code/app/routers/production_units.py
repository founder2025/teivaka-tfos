from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()

IDLE_DAYS = 60  # a rested block past this is flagged IDLE (Phase 3 surfaces a task)


class PURename(BaseModel):
    pu_name: Optional[str] = None
    area_sqm: Optional[float] = None


def _derive_state(c: dict):
    """Block state machine derived from the latest cycle (no stored column → no drift).
    EMPTY · PREPARING · ACTIVE · HARVESTING · RESTING · IDLE."""
    if not c or not c.get("cycle_id"):
        return {"state": "EMPTY", "label": "Empty", "days_idle": None}
    st = c.get("cycle_status")
    if st == "PLANNED":
        return {"state": "PREPARING", "label": "Preparing", "days_idle": None}
    if st == "ACTIVE":
        return {"state": "ACTIVE", "label": "Planted / growing", "days_idle": None}
    if st in ("HARVESTING", "CLOSING"):
        return {"state": "HARVESTING", "label": "Harvesting", "days_idle": None}
    # CLOSED / FAILED → resting; idle if rested too long
    end = c.get("actual_harvest_end") or c.get("closed_at") or c.get("expected_harvest_date") or c.get("planting_date")
    days = None
    if end:
        d = end.date() if isinstance(end, datetime) else end
        days = (date.today() - d).days
    if days is not None and days > IDLE_DAYS:
        return {"state": "IDLE", "label": f"Idle {days}d", "days_idle": days}
    return {"state": "RESTING", "label": "Resting" + (f" {days}d" if days is not None else ""), "days_idle": days}


@router.get("/status")
async def block_status(farm_id: str, user: dict = Depends(get_current_user)):
    """Per-block derived state (+ current/last crop) for Locations + Phase 3/5."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        res = await db.execute(
            text("""
                SELECT pu.pu_id, pu.pu_name, pu.zone_id,
                       c.cycle_id, c.cycle_status, c.production_id, c.planting_date,
                       c.actual_harvest_end, c.closed_at, c.expected_harvest_date,
                       p.production_name, p.plant_family
                  FROM tenant.production_units pu
                  LEFT JOIN LATERAL (
                       SELECT pc.* FROM tenant.production_cycles pc
                        WHERE pc.pu_id = pu.pu_id
                        ORDER BY pc.planting_date DESC NULLS LAST, pc.created_at DESC
                        LIMIT 1
                  ) c ON TRUE
                  LEFT JOIN shared.productions p ON p.production_id = c.production_id
                 WHERE pu.tenant_id = :tid AND pu.farm_id = :farm
                 ORDER BY pu.pu_id
            """),
            {"tid": str(user["tenant_id"]), "farm": farm_id},
        )
        rows = [dict(r) for r in res.mappings().all()]
    out = []
    for r in rows:
        d = _derive_state(r)
        active = r.get("cycle_status") in ("PLANNED", "ACTIVE", "HARVESTING", "CLOSING")
        out.append({
            "pu_id": r["pu_id"], "pu_name": r["pu_name"], "zone_id": r["zone_id"],
            **d,
            "crop": r["production_name"] if active else None,
            "last_crop": r["production_name"],
            "plant_family": r.get("plant_family"),
            "cycle_id": r.get("cycle_id"), "cycle_status": r.get("cycle_status"),
        })
    return {"data": out}


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
