"""equipment_records.py — Equipment usage, maintenance log, and parts (mounted /api/v1).

Backs the Equipment Usage / Maintenance / Costs / Parts tabs + per-asset detail with real
records, every write hash-chained:
  GET/POST /equipment-usage       (logging hours/fuel → bumps equipment.current_hours)
  GET/POST /equipment-maintenance (service/repair → resets service date, clears 'down')
  GET/POST/PATCH /equipment-parts (spares inventory)
"""
import uuid
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text

from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from app.core.audit_chain import emit_audit_event

router = APIRouter()


def _rows(r):
    return [dict(x) for x in r.mappings().all()]


# ───────────────────────── usage ─────────────────────────
class UsageCreate(BaseModel):
    equipment_id: str
    farm_id: Optional[str] = None
    usage_date: Optional[date] = None
    hours_run: Decimal = Decimal("0")
    km_run: Optional[Decimal] = None
    fuel_litres: Optional[Decimal] = None
    fuel_cost_fjd: Optional[Decimal] = None
    cycle_id: Optional[str] = None
    task: Optional[str] = None
    operator: Optional[str] = None
    notes: Optional[str] = None


@router.get("/equipment-usage")
async def list_usage(farm_id: str = Query(None), equipment_id: str = Query(None), user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        cl, p = ["u.tenant_id = :tid"], {"tid": str(user["tenant_id"])}
        if farm_id: cl.append("u.farm_id = :fid"); p["fid"] = farm_id
        if equipment_id: cl.append("u.equipment_id = :eid"); p["eid"] = equipment_id
        r = await db.execute(text(f"""SELECT u.*, e.equipment_name FROM tenant.equipment_usage u
            JOIN tenant.equipment e ON e.equipment_id = u.equipment_id
            WHERE {' AND '.join(cl)} ORDER BY u.usage_date DESC LIMIT 200"""), p)
        return {"data": _rows(r)}


@router.post("/equipment-usage", status_code=201)
async def create_usage(body: UsageCreate, user: dict = Depends(get_current_user)):
    tid = str(user["tenant_id"]); uid = f"EQU-{uuid.uuid4().hex[:8].upper()}"
    udate = body.usage_date or date.today()
    async with get_rls_db(tid) as db:
        ok = await db.execute(text("SELECT hours_unit FROM tenant.equipment WHERE equipment_id = :e AND tenant_id = :t"), {"e": body.equipment_id, "t": tid})
        row = ok.first()
        if not row:
            raise HTTPException(404, detail="Equipment not found")
        await db.execute(text("""
            INSERT INTO tenant.equipment_usage
                (usage_id, tenant_id, farm_id, equipment_id, usage_date, hours_run, km_run,
                 fuel_litres, fuel_cost_fjd, cycle_id, task, operator, notes, created_by)
            VALUES (:id,:tid,:fid,:eid,:d,:hr,:km,:fl,:fc,:cyc,:task,:op,:notes,:by)
        """), {"id": uid, "tid": tid, "fid": body.farm_id, "eid": body.equipment_id, "d": udate,
               "hr": body.hours_run, "km": body.km_run, "fl": body.fuel_litres, "fc": body.fuel_cost_fjd,
               "cyc": body.cycle_id, "task": body.task, "op": body.operator, "notes": body.notes, "by": str(user["user_id"])})
        # bump running hours/distance
        bump = body.km_run if (row[0] == "km" and body.km_run) else body.hours_run
        if bump:
            await db.execute(text("UPDATE tenant.equipment SET current_hours = current_hours + :b, updated_at = now() WHERE equipment_id = :e AND tenant_id = :t"),
                             {"b": bump, "e": body.equipment_id, "t": tid})
        await emit_audit_event(db=db, tenant_id=user["tenant_id"], actor_user_id=user["user_id"],
                               event_type="EQUIPMENT_USAGE_LOGGED", entity_type="EQUIPMENT", entity_id=body.equipment_id,
                               payload={"usage_id": uid, "equipment_id": body.equipment_id, "hours_run": str(body.hours_run), "cycle_id": body.cycle_id})
    return {"data": {"usage_id": uid}}


# ───────────────────────── maintenance ─────────────────────────
class MaintCreate(BaseModel):
    equipment_id: str
    farm_id: Optional[str] = None
    maint_date: Optional[date] = None
    maint_type: str = "service"
    description: Optional[str] = None
    parts_cost_fjd: Decimal = Decimal("0")
    labor_cost_fjd: Decimal = Decimal("0")
    downtime_hours: Decimal = Decimal("0")
    performed_by: Optional[str] = None
    next_service_date: Optional[date] = None
    clear_down: bool = False


@router.get("/equipment-maintenance")
async def list_maint(farm_id: str = Query(None), equipment_id: str = Query(None), user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        cl, p = ["m.tenant_id = :tid"], {"tid": str(user["tenant_id"])}
        if farm_id: cl.append("m.farm_id = :fid"); p["fid"] = farm_id
        if equipment_id: cl.append("m.equipment_id = :eid"); p["eid"] = equipment_id
        r = await db.execute(text(f"""SELECT m.*, e.equipment_name FROM tenant.equipment_maintenance m
            JOIN tenant.equipment e ON e.equipment_id = m.equipment_id
            WHERE {' AND '.join(cl)} ORDER BY m.maint_date DESC LIMIT 200"""), p)
        return {"data": _rows(r)}


@router.post("/equipment-maintenance", status_code=201)
async def create_maint(body: MaintCreate, user: dict = Depends(get_current_user)):
    if body.maint_type not in ("service", "repair"):
        raise HTTPException(400, detail="maint_type must be service|repair")
    tid = str(user["tenant_id"]); mid = f"EQM-{uuid.uuid4().hex[:8].upper()}"
    mdate = body.maint_date or date.today()
    total = (body.parts_cost_fjd or 0) + (body.labor_cost_fjd or 0)
    async with get_rls_db(tid) as db:
        ok = await db.execute(text("SELECT 1 FROM tenant.equipment WHERE equipment_id = :e AND tenant_id = :t"), {"e": body.equipment_id, "t": tid})
        if not ok.first():
            raise HTTPException(404, detail="Equipment not found")
        await db.execute(text("""
            INSERT INTO tenant.equipment_maintenance
                (maint_id, tenant_id, farm_id, equipment_id, maint_date, maint_type, description,
                 parts_cost_fjd, labor_cost_fjd, total_cost_fjd, downtime_hours, performed_by, next_service_date, created_by)
            VALUES (:id,:tid,:fid,:eid,:d,:ty,:desc,:pc,:lc,:tc,:dt,:by,:nsd,:cby)
        """), {"id": mid, "tid": tid, "fid": body.farm_id, "eid": body.equipment_id, "d": mdate, "ty": body.maint_type,
               "desc": body.description, "pc": body.parts_cost_fjd, "lc": body.labor_cost_fjd, "tc": total,
               "dt": body.downtime_hours, "by": body.performed_by, "nsd": body.next_service_date, "cby": str(user["user_id"])})
        # reset service countdown + optionally clear DOWN
        sets = ["last_service_date = :d", "updated_at = now()"]
        params = {"d": mdate, "e": body.equipment_id, "t": tid}
        if body.next_service_date:
            sets.append("next_service_date = :nsd"); params["nsd"] = body.next_service_date
        if body.clear_down:
            sets.append("condition = 'GOOD'")
        await db.execute(text(f"UPDATE tenant.equipment SET {', '.join(sets)} WHERE equipment_id = :e AND tenant_id = :t"), params)
        await emit_audit_event(db=db, tenant_id=user["tenant_id"], actor_user_id=user["user_id"],
                               event_type="EQUIPMENT_MAINTAINED", entity_type="EQUIPMENT", entity_id=body.equipment_id,
                               payload={"maint_id": mid, "equipment_id": body.equipment_id, "maint_type": body.maint_type, "total_cost_fjd": str(total)})
    return {"data": {"maint_id": mid, "total_cost_fjd": str(total)}}


# ───────────────────────── parts ─────────────────────────
class PartCreate(BaseModel):
    part_name: str
    farm_id: Optional[str] = None
    equipment_id: Optional[str] = None
    on_hand: Decimal = Decimal("0")
    reorder_point: Optional[Decimal] = None
    unit_cost_fjd: Optional[Decimal] = None
    lead_time_days: Optional[int] = None
    ferry_dependent: bool = False
    supplier_id: Optional[str] = None
    notes: Optional[str] = None


class PartPatch(BaseModel):
    on_hand: Optional[Decimal] = None
    reorder_point: Optional[Decimal] = None
    unit_cost_fjd: Optional[Decimal] = None
    lead_time_days: Optional[int] = None
    ferry_dependent: Optional[bool] = None


@router.get("/equipment-parts")
async def list_parts(farm_id: str = Query(None), user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        cl, p = ["tenant_id = :tid"], {"tid": str(user["tenant_id"])}
        if farm_id: cl.append("farm_id = :fid"); p["fid"] = farm_id
        r = await db.execute(text(f"SELECT * FROM tenant.equipment_parts WHERE {' AND '.join(cl)} ORDER BY part_name"), p)
        return {"data": _rows(r)}


@router.post("/equipment-parts", status_code=201)
async def create_part(body: PartCreate, user: dict = Depends(get_current_user)):
    if not body.part_name.strip():
        raise HTTPException(400, detail="part_name is required")
    tid = str(user["tenant_id"]); pid = f"PRT-{uuid.uuid4().hex[:8].upper()}"
    async with get_rls_db(tid) as db:
        await db.execute(text("""
            INSERT INTO tenant.equipment_parts
                (part_id, tenant_id, farm_id, part_name, equipment_id, on_hand, reorder_point,
                 unit_cost_fjd, lead_time_days, ferry_dependent, supplier_id, notes, created_by)
            VALUES (:id,:tid,:fid,:n,:eid,:oh,:rp,:uc,:lt,:fd,:sup,:notes,:by)
        """), {"id": pid, "tid": tid, "fid": body.farm_id, "n": body.part_name.strip(), "eid": body.equipment_id or None,
               "oh": body.on_hand, "rp": body.reorder_point, "uc": body.unit_cost_fjd, "lt": body.lead_time_days,
               "fd": body.ferry_dependent, "sup": body.supplier_id or None, "notes": body.notes, "by": str(user["user_id"])})
        await emit_audit_event(db=db, tenant_id=user["tenant_id"], actor_user_id=user["user_id"],
                               event_type="EQUIPMENT_PART_LOGGED", entity_type="EQUIPMENT_PART", entity_id=pid,
                               payload={"part_id": pid, "part_name": body.part_name.strip()})
    return {"data": {"part_id": pid}}


@router.patch("/equipment-parts/{part_id}")
async def update_part(part_id: str, body: PartPatch, user: dict = Depends(get_current_user)):
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, detail="No fields to update")
    cols = ", ".join(f"{k} = :{k}" for k in updates)
    params = {**updates, "pid": part_id, "tid": str(user["tenant_id"])}
    async with get_rls_db(str(user["tenant_id"])) as db:
        r = await db.execute(text(f"UPDATE tenant.equipment_parts SET {cols} WHERE part_id = :pid AND tenant_id = :tid RETURNING part_id"), params)
        if not r.first():
            raise HTTPException(404, detail="Part not found")
    return {"data": {"part_id": part_id}}
