from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from uuid import uuid4
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from app.core.task_engine import emit_task
from app.core.audit_chain import emit_audit_event

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


@router.get("/unified")
async def list_unified_production_units(
    farm_id: str = None,
    enterprise_type: str = None,
    user: dict = Depends(get_current_user),
):
    """Slice A — every production unit across EVERY enterprise (crop blocks,
    flocks, nursery batches, and future verticals) from tenant.v_production_units.

    This is the enterprise-agnostic read model the Tier-2 dashboards consume in
    Slice D so Overview / Enterprises / Analytics stop being crop-and-flock shaped.
    Optional filters: farm_id, enterprise_type (CROPS|POULTRY|AQUACULTURE|...).
    """
    async with get_rls_db(str(user["tenant_id"])) as db:
        q = "SELECT * FROM tenant.v_production_units WHERE tenant_id = :tid"
        params = {"tid": str(user["tenant_id"])}
        if farm_id:
            q += " AND farm_id = :farm_id"
            params["farm_id"] = farm_id
        if enterprise_type:
            q += " AND enterprise_type = :ent"
            params["ent"] = enterprise_type.upper()
        result = await db.execute(text(q + " ORDER BY enterprise_type, label"), params)
        rows = [dict(r) for r in result.mappings().all()]
        # Lightweight per-enterprise rollup for dashboard headers.
        summary: dict = {}
        for r in rows:
            e = r["enterprise_type"]
            s = summary.setdefault(e, {"enterprise_type": e, "units": 0, "active": 0})
            s["units"] += 1
            if str(r["status"]).upper() not in ("INACTIVE", "CLOSED", "RETIRED", "TRANSPLANTED"):
                s["active"] += 1
        return {"data": {"units": rows, "by_enterprise": list(summary.values())}}

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
        if body.pu_name:
            await _record_activity(db, str(user["tenant_id"]),
                                   await _farm_of_pu(db, pu_id, str(user["tenant_id"])),
                                   pu_id, "BLOCK_RENAMED", f"Block renamed to '{row['pu_name']}'.",
                                   user.get("user_id"))
        # Control-room trust: block edit is hash-chained (migration 128).
        await emit_audit_event(
            db=db, tenant_id=user["tenant_id"], actor_user_id=user["user_id"],
            event_type="BLOCK_UPDATED", entity_type="PRODUCTION_UNIT", entity_id=pu_id,
            payload={"pu_name": row["pu_name"],
                     "area_sqm": float(row["area_sqm"]) if row["area_sqm"] is not None else None})
        return {"data": dict(row)}


async def _farm_of_pu(db, pu_id, tid):
    r = await db.execute(text("SELECT farm_id FROM tenant.production_units WHERE pu_id=:pid AND tenant_id=:tid"),
                         {"pid": pu_id, "tid": tid})
    row = r.first()
    return row[0] if row else None


async def _record_activity(db, tid, farm_id, pu_id, kind, summary, uid):
    """Append a grounded note TIS will read (best-effort — never break the caller)."""
    if not farm_id:
        return
    try:
        await db.execute(
            text("""INSERT INTO tenant.farm_activity_context
                        (tenant_id, farm_id, pu_id, kind, summary, source, created_by)
                    VALUES (:tid, :farm, :pid, :kind, :summary, 'auto', CAST(:uid AS uuid))"""),
            {"tid": tid, "farm": farm_id, "pid": pu_id, "kind": kind,
             "summary": summary, "uid": str(uid) if uid else None},
        )
    except Exception:
        pass


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


@router.get("/{pu_id}/whats-due")
async def whats_due(pu_id: str, user: dict = Depends(get_current_user)):
    """Per-block 'what's due now': harvest readiness (from the cycle's planner
    date, else planting_date + seeded rotation_registry cycle days — flagged as an
    estimate) + the block's real open tasks (rotation, transplant-prep, automation,
    farmer tasks). No invented schedule — only planner dates, the seeded cycle-day
    KB, and tasks that actually exist."""
    tid = str(user["tenant_id"])
    today = date.today()
    async with get_rls_db(tid) as db:
        r = (await db.execute(
            text("""
                SELECT pu.pu_id, pu.pu_name,
                       c.cycle_id, c.cycle_status, c.planting_date, c.expected_harvest_date,
                       c.production_id, p.production_name,
                       rr.min_cycle_days, rr.max_cycle_days
                  FROM tenant.production_units pu
                  LEFT JOIN LATERAL (
                       SELECT pc.* FROM tenant.production_cycles pc
                        WHERE pc.pu_id = pu.pu_id
                          AND pc.cycle_status IN ('PLANNED','ACTIVE','HARVESTING','CLOSING')
                        ORDER BY pc.planting_date DESC NULLS LAST, pc.created_at DESC LIMIT 1
                  ) c ON TRUE
                  LEFT JOIN shared.productions p ON p.production_id = c.production_id
                  LEFT JOIN shared.rotation_registry rr ON rr.production_id = c.production_id
                 WHERE pu.pu_id = :pid AND pu.tenant_id = :tid
            """),
            {"pid": pu_id, "tid": tid},
        )).mappings().first()
        if not r:
            raise HTTPException(status_code=404, detail="Production unit not found")

        tasks_rows = (await db.execute(
            text("""SELECT task_id, COALESCE(imperative, title) AS title, status, task_type, due_date, task_rank
                      FROM tenant.task_queue
                     WHERE tenant_id = :tid AND status = 'OPEN'
                       AND (pu_id = :pid OR (entity_type = 'production_unit' AND entity_id = :pid))
                     ORDER BY (due_date IS NULL), due_date, task_rank ASC"""),
            {"tid": tid, "pid": pu_id},
        )).mappings().all()

    # harvest readiness (only for an occupied block)
    harvest = None
    if r["cycle_id"]:
        st = r["cycle_status"]
        if st in ("HARVESTING", "CLOSING"):
            harvest = {"state": "HARVESTING", "crop": r["production_name"], "target": None, "estimate": False}
        elif st in ("PLANNED", "ACTIVE"):
            planting = r["planting_date"]
            target, estimate = r["expected_harvest_date"], False
            if not target and planting and r["min_cycle_days"]:
                from datetime import timedelta
                target, estimate = planting + timedelta(days=int(r["min_cycle_days"])), True
            window_end = None
            if planting and r["max_cycle_days"]:
                from datetime import timedelta
                window_end = planting + timedelta(days=int(r["max_cycle_days"]))
            days_until = (target - today).days if target else None
            if days_until is not None and days_until <= 0:
                state = "DUE"
            elif days_until is not None and days_until <= 7:
                state = "SOON"
            else:
                state = "GROWING"
            harvest = {
                "state": state, "crop": r["production_name"],
                "target": target.isoformat() if target else None,
                "window_end": window_end.isoformat() if window_end else None,
                "days_until": days_until, "estimate": estimate,
            }

    def _due(t):
        return t["due_date"] is None or t["due_date"] <= today
    tasks = [{
        "task_id": str(t["task_id"]), "title": t["title"], "task_rank": t["task_rank"],
        "task_type": t["task_type"], "status": t["status"],
        "due_date": t["due_date"].isoformat() if t["due_date"] else None,
        "due": _due(t),
    } for t in tasks_rows]

    return {
        "pu_id": r["pu_id"], "pu_name": r["pu_name"],
        "cycle_id": r["cycle_id"], "cycle_status": r["cycle_status"],
        "harvest": harvest,
        "tasks": tasks,
        "due_count": sum(1 for t in tasks if t["due"]) + (1 if (harvest and harvest["state"] in ("DUE", "HARVESTING")) else 0),
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
        # Canonical feeder: emit_task dedupes on (source_module, source_reference)
        # and keeps lifecycle parity with every other engine.
        task_id = await emit_task(
            db=db, tenant_id=user["tenant_id"], farm_id=pu["farm_id"],
            source_module="rotation", source_reference=f"rotation:{pu_id}",
            imperative=f"Plan rotation — {pu['pu_name']}"[:120], rank=450, icon_key="Sprout",
            task_type="FIELD_TASK", entity_type="production_unit", entity_id=pu_id,
            body_md="Block is resting/idle. Pick the next crop (legumes preferred after heavy feeders) and prepare the bed. See block advice in Locations.",
        )
        await _record_activity(db, tid, pu["farm_id"], pu_id, "ROTATION_TASK",
                               f"Rotation task created for {pu['pu_name']} (block resting/idle).",
                               user.get("user_id"))
    return {"ok": True, "task_id": str(task_id)}
