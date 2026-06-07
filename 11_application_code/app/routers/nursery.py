from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime, date
from typing import Optional
import uuid

router = APIRouter()


class TransplantTask(BaseModel):
    pu_id: str

class NurseryBatchCreate(BaseModel):
    farm_id: str
    production_id: str
    batch_code: Optional[str] = None
    variety: Optional[str] = None
    seed_source: Optional[str] = None  # e.g. "FNPF Seed Bank", "Own Saved Seed", "SPC"
    sowing_date: datetime
    germination_medium: Optional[str] = None  # COCOPEAT, SOIL_MIX, SAND_LOAM
    tray_count: Optional[int] = None
    seeds_per_tray: Optional[int] = None
    total_seeds_sown: int
    germination_rate_pct: Optional[Decimal] = None
    seedlings_ready: Optional[int] = None
    expected_transplant_date: Optional[datetime] = None
    actual_transplant_date: Optional[datetime] = None
    seed_cost_fjd: Optional[Decimal] = None
    other_cost_fjd: Optional[Decimal] = None
    notes: Optional[str] = None

@router.get("")
async def list_nursery(farm_id: str = None, production_id: str = None, status: str = None, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"])}
        q = """SELECT nb.*, p.production_name, p.production_category
               FROM tenant.nursery_batches nb
               JOIN shared.productions p ON p.production_id = nb.production_id
               WHERE nb.tenant_id = :tid"""
        if farm_id:
            q += " AND nb.farm_id = :farm_id"
            params["farm_id"] = farm_id
        if production_id:
            q += " AND nb.production_id = :production_id"
            params["production_id"] = production_id
        if status:
            q += " AND nb.batch_status = :status"
            params["status"] = status
        result = await db.execute(text(q + " ORDER BY nb.sowing_date DESC LIMIT 100"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/{batch_id}")
async def get_nursery_batch(batch_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("SELECT nb.*, p.production_name FROM tenant.nursery_batches nb JOIN shared.productions p ON p.production_id = nb.production_id WHERE nb.batch_id = :batch_id AND nb.tenant_id = :tid"),
            {"batch_id": batch_id, "tid": str(user["tenant_id"])}
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Nursery batch not found")
        return {"data": dict(row)}

@router.post("")
async def log_nursery_batch(body: NurseryBatchCreate, user: dict = Depends(get_current_user)):
    batch_id = f"NRS-{uuid.uuid4().hex[:6].upper()}"
    batch_code = body.batch_code or f"{body.production_id[:3].upper()}-{datetime.now().strftime('%y%m%d')}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO tenant.nursery_batches
                (batch_id, tenant_id, farm_id, production_id, batch_code, variety, seed_source,
                 sowing_date, germination_medium, tray_count, seeds_per_tray, total_seeds_sown,
                 germination_rate_pct, seedlings_ready, expected_transplant_date,
                 actual_transplant_date, seed_cost_fjd, other_cost_fjd, notes, created_by)
            VALUES
                (:batch_id, :tenant_id, :farm_id, :production_id, :batch_code, :variety, :seed_source,
                 :sowing_date, :germination_medium, :tray_count, :seeds_per_tray, :total_seeds_sown,
                 :germination_rate_pct, :seedlings_ready, :expected_transplant_date,
                 :actual_transplant_date, :seed_cost_fjd, :other_cost_fjd, :notes, :created_by)
        """), {
            "batch_id": batch_id,
            "tenant_id": str(user["tenant_id"]),
            "farm_id": body.farm_id,
            "production_id": body.production_id,
            "batch_code": batch_code,
            "variety": body.variety,
            "seed_source": body.seed_source,
            "sowing_date": body.sowing_date,
            "germination_medium": body.germination_medium,
            "tray_count": body.tray_count,
            "seeds_per_tray": body.seeds_per_tray,
            "total_seeds_sown": body.total_seeds_sown,
            "germination_rate_pct": body.germination_rate_pct,
            "seedlings_ready": body.seedlings_ready,
            "expected_transplant_date": body.expected_transplant_date,
            "actual_transplant_date": body.actual_transplant_date,
            "seed_cost_fjd": body.seed_cost_fjd,
            "other_cost_fjd": body.other_cost_fjd,
            "notes": body.notes,
            "created_by": str(user["user_id"]),
        })
    return {"data": {"batch_id": batch_id, "batch_code": batch_code}}


@router.get("/{batch_id}/transplant-blocks")
async def transplant_blocks(batch_id: str, user: dict = Depends(get_current_user)):
    """Suggest which blocks to prepare for transplanting this nursery batch.

    Candidates = free blocks (EMPTY / RESTING / IDLE — not currently occupied),
    ranked rotation-safe first (vs the crop's family rest rule from
    shared.family_policies), then by area. No invented agronomy — rotation safety
    comes from the seeded KB; size is the farmer's own mapped area."""
    tid = str(user["tenant_id"])
    async with get_rls_db(tid) as db:
        b = (await db.execute(
            text("""SELECT nb.production_id, nb.farm_id, p.production_name, p.plant_family
                      FROM tenant.nursery_batches nb
                      JOIN shared.productions p ON p.production_id = nb.production_id
                     WHERE nb.batch_id = :bid AND nb.tenant_id = :tid"""),
            {"bid": batch_id, "tid": tid},
        )).mappings().first()
        if not b:
            raise HTTPException(status_code=404, detail="Nursery batch not found")
        fam, farm = b["plant_family"], b["farm_id"]

        min_rest = None
        if fam:
            mr = (await db.execute(
                text("SELECT min_rest_days FROM shared.family_policies WHERE family_name = :fam"),
                {"fam": fam},
            )).first()
            min_rest = mr[0] if mr else None

        rows = (await db.execute(
            text("""
                SELECT pu.pu_id, pu.pu_name, pu.area_sqm,
                       c.cycle_id, c.cycle_status, c.actual_harvest_end, c.closed_at,
                       c.expected_harvest_date, c.planting_date,
                       lp.plant_family AS last_family, lp.production_name AS last_crop
                  FROM tenant.production_units pu
                  LEFT JOIN LATERAL (
                       SELECT pc.* FROM tenant.production_cycles pc
                        WHERE pc.pu_id = pu.pu_id
                        ORDER BY pc.planting_date DESC NULLS LAST, pc.created_at DESC LIMIT 1
                  ) c ON TRUE
                  LEFT JOIN shared.productions lp ON lp.production_id = c.production_id
                 WHERE pu.tenant_id = :tid AND pu.farm_id = :farm AND pu.is_active = true
                   AND (c.cycle_id IS NULL OR c.cycle_status IN ('CLOSED','FAILED'))
            """),
            {"tid": tid, "farm": farm},
        )).mappings().all()

    cands = []
    for r in rows:
        empty = r["cycle_id"] is None
        end = r["actual_harvest_end"] or r["closed_at"] or r["expected_harvest_date"] or r["planting_date"]
        days_idle = None
        if end and not empty:
            d = end.date() if isinstance(end, datetime) else end
            days_idle = (date.today() - d).days
        same = (fam is not None and r["last_family"] == fam)
        if not same or min_rest is None:
            rotation_ok, rest_remaining = True, None
        else:
            rest_remaining = max(0, min_rest - (days_idle or 0))
            rotation_ok = rest_remaining == 0
        state = "EMPTY" if empty else ("IDLE" if (days_idle is not None and days_idle > 60) else "RESTING")
        cands.append({
            "pu_id": r["pu_id"], "pu_name": r["pu_name"],
            "area_sqm": float(r["area_sqm"]) if r["area_sqm"] is not None else None,
            "state": state, "last_crop": r["last_crop"],
            "rotation_ok": rotation_ok, "rest_remaining_days": rest_remaining,
        })
    cands.sort(key=lambda x: (0 if x["rotation_ok"] else 1, -(x["area_sqm"] or 0), x["pu_id"]))
    return {"batch_id": batch_id, "crop": b["production_name"], "plant_family": fam, "candidates": cands}


@router.post("/{batch_id}/transplant-task")
async def transplant_task(batch_id: str, body: TransplantTask, user: dict = Depends(get_current_user)):
    """Raise a 'prepare block for transplant' task tied to the block + batch (idempotent)."""
    tid = str(user["tenant_id"])
    async with get_rls_db(tid) as db:
        b = (await db.execute(
            text("""SELECT nb.farm_id, nb.expected_transplant_date, p.production_name
                      FROM tenant.nursery_batches nb
                      JOIN shared.productions p ON p.production_id = nb.production_id
                     WHERE nb.batch_id = :bid AND nb.tenant_id = :tid"""),
            {"bid": batch_id, "tid": tid},
        )).mappings().first()
        if not b:
            raise HTTPException(status_code=404, detail="Nursery batch not found")
        pu = (await db.execute(
            text("SELECT pu_name FROM tenant.production_units WHERE pu_id = :pid AND tenant_id = :tid"),
            {"pid": body.pu_id, "tid": tid},
        )).mappings().first()
        if not pu:
            raise HTTPException(status_code=404, detail="Production unit not found")
        ex = (await db.execute(
            text("""SELECT task_id FROM tenant.task_queue
                     WHERE tenant_id = :tid AND pu_id = :pid
                       AND status IN ('OPEN','IN_PROGRESS') AND title ILIKE 'Prepare%transplant%'"""),
            {"tid": tid, "pid": body.pu_id},
        )).first()
        if ex:
            return {"ok": True, "existing": True, "task_id": ex[0]}
        due = b["expected_transplant_date"]
        if isinstance(due, datetime):
            due = due.date()
        task_id = f"TSK-{b['farm_id']}-{uuid.uuid4().hex[:8].upper()}"
        await db.execute(
            text("""INSERT INTO tenant.task_queue
                        (task_id, tenant_id, farm_id, task_type, title, description,
                         priority, status, pu_id, due_date)
                    VALUES (:task, :tid, :farm, 'FIELD_TASK', :title, :desc, 'HIGH', 'OPEN', :pid, :due)"""),
            {"task": task_id, "tid": tid, "farm": b["farm_id"],
             "title": f"Prepare {pu['pu_name']} for transplanting {b['production_name']}",
             "desc": f"Seedlings from nursery batch {batch_id} are headed to this block. Clear/prep the bed and transplant when ready.",
             "pid": body.pu_id, "due": due},
        )
        try:
            await db.execute(
                text("""INSERT INTO tenant.farm_activity_context
                            (tenant_id, farm_id, pu_id, kind, summary, source, created_by)
                        VALUES (:tid, :farm, :pid, 'TRANSPLANT_PLANNED', :s, 'auto', CAST(:uid AS uuid))"""),
                {"tid": tid, "farm": b["farm_id"], "pid": body.pu_id,
                 "s": f"Planned to transplant {b['production_name']} into {pu['pu_name']}.",
                 "uid": str(user.get("user_id")) if user.get("user_id") else None},
            )
        except Exception:
            pass
    return {"ok": True, "existing": False, "task_id": task_id}
