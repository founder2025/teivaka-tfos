from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from uuid import uuid4
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


@router.get("/{pu_id}/advice")
async def block_advice(pu_id: str, user: dict = Depends(get_current_user)):
    """Rotation + rest advice for a block, sourced ONLY from shared.family_policies
    + shared.productions (no invented agronomy — Inviolable #1). Tells the farmer:
    how long to rest before replanting the same family, what to avoid now, and
    which crops are good to plant next (legumes first, per the seeded KB note)."""
    tid = str(user["tenant_id"])
    async with get_rls_db(tid) as db:
        r = await db.execute(
            text("""
                SELECT pu.pu_id, pu.pu_name,
                       c.cycle_id, c.cycle_status, c.planting_date,
                       c.actual_harvest_end, c.closed_at, c.expected_harvest_date,
                       p.production_name, p.plant_family
                  FROM tenant.production_units pu
                  LEFT JOIN LATERAL (
                       SELECT pc.* FROM tenant.production_cycles pc
                        WHERE pc.pu_id = pu.pu_id
                        ORDER BY pc.planting_date DESC NULLS LAST, pc.created_at DESC LIMIT 1
                  ) c ON TRUE
                  LEFT JOIN shared.productions p ON p.production_id = c.production_id
                 WHERE pu.pu_id = :pid AND pu.tenant_id = :tid
            """),
            {"pid": pu_id, "tid": tid},
        )
        row = r.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Production unit not found")
        state = _derive_state(dict(row))
        fam = row["plant_family"]
        days_idle = state.get("days_idle")

        policy = None
        if fam:
            pr = await db.execute(
                text("""SELECT family_name, min_rest_days, enforce_level, disease_risk,
                               rotation_benefit, notes
                          FROM shared.family_policies WHERE family_name = :fam"""),
                {"fam": fam},
            )
            p = pr.mappings().first()
            policy = dict(p) if p else None

        rest_required = policy["min_rest_days"] if policy else None
        rest_remaining = None
        if rest_required is not None and days_idle is not None:
            rest_remaining = max(0, rest_required - days_idle)

        # Good next crops: active annual crops NOT in the last family; legumes first
        # (family_policies marks Fabaceae 'PREFERRED after heavy feeders').
        sug = await db.execute(
            text("""
                SELECT production_id, production_name, plant_family
                  FROM shared.productions
                 WHERE is_active_in_system = true AND is_perennial = false
                   AND is_livestock = false AND is_forestry = false AND is_aquaculture = false
                   AND (:fam IS NULL OR plant_family IS DISTINCT FROM :fam)
                 ORDER BY (plant_family = 'Fabaceae') DESC, production_name
                 LIMIT 8
            """),
            {"fam": fam},
        )
        suggested = [dict(x) for x in sug.mappings().all()]

        avoid = []
        if fam:
            av = await db.execute(
                text("""SELECT production_id, production_name FROM shared.productions
                         WHERE plant_family = :fam AND is_active_in_system = true"""),
                {"fam": fam},
            )
            avoid = [dict(x) for x in av.mappings().all()]

    rotation_status = "NA"
    if policy and policy["enforce_level"] in ("OVERLAY", "NA"):
        rotation_status = "NA"           # perennial / livestock / forestry
    elif state["state"] in ("EMPTY", "RESTING", "IDLE") and fam:
        rotation_status = "READY" if (rest_remaining == 0) else "REST"

    return {
        "pu_id": row["pu_id"], "pu_name": row["pu_name"],
        **state,
        "last_crop": row["production_name"], "last_family": fam,
        "rotation_status": rotation_status,
        "rest_required_days": rest_required, "rest_remaining_days": rest_remaining,
        "disease_risk": policy["disease_risk"] if policy else None,
        "rotation_benefit": policy["rotation_benefit"] if policy else None,
        "policy_note": policy["notes"] if policy else None,
        "enforce_level": policy["enforce_level"] if policy else None,
        "avoid_next": avoid,
        "suggested_next": suggested,
    }


@router.post("/{pu_id}/rotation-task")
async def create_rotation_task(pu_id: str, user: dict = Depends(get_current_user)):
    """Surface the rotation/idle advice as a real task_queue row (idempotent:
    one OPEN rotation task per block)."""
    tid = str(user["tenant_id"])
    uid = str(user.get("user_id")) if user.get("user_id") else None
    async with get_rls_db(tid) as db:
        pr = await db.execute(
            text("SELECT pu_name, farm_id FROM tenant.production_units WHERE pu_id = :pid AND tenant_id = :tid"),
            {"pid": pu_id, "tid": tid},
        )
        pu = pr.mappings().first()
        if not pu:
            raise HTTPException(status_code=404, detail="Production unit not found")
        ex = await db.execute(
            text("""SELECT task_id FROM tenant.task_queue
                     WHERE tenant_id = :tid AND pu_id = :pid
                       AND status IN ('OPEN','IN_PROGRESS') AND title ILIKE 'Plan rotation%'"""),
            {"tid": tid, "pid": pu_id},
        )
        existing = ex.first()
        if existing:
            return {"ok": True, "existing": True, "task_id": existing[0]}
        task_id = f"TSK-{pu['farm_id']}-{uuid4().hex[:8].upper()}"
        await db.execute(
            text("""INSERT INTO tenant.task_queue
                        (task_id, tenant_id, farm_id, task_type, title, description,
                         priority, status, pu_id)
                    VALUES (:task, :tid, :farm, 'FIELD_TASK', :title, :desc, 'MEDIUM', 'OPEN', :pid)"""),
            {"task": task_id, "tid": tid, "farm": pu["farm_id"],
             "title": f"Plan rotation — {pu['pu_name']}",
             "desc": "Block is resting/idle. Pick the next crop (legumes preferred after heavy feeders) and prepare the bed. See block advice in Locations.",
             "pid": pu_id},
        )
    return {"ok": True, "existing": False, "task_id": task_id}
