"""crop_plan — "Next steps from your crop plan" for the Tasks page.

For each active cycle, matches days-since-planting against shared.crop_growth_plan
(cited, verification-flagged) to surface the current stage's action + ongoing
note. No invented agronomy: actions come from the seeded KB; cycles with no plan
fall back to a generic status milestone. Surfaces verification_status so the UI
can show the extension-officer caveat (Inviolable #1).
"""
from datetime import date, datetime
from fastapi import APIRouter, Depends
from sqlalchemy import text

from app.db.session import get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()


@router.get("/farm-steps")
async def farm_steps(farm_id: str, user: dict = Depends(get_current_user)):
    tid = str(user["tenant_id"])
    today = date.today()
    async with get_rls_db(tid) as db:
        cyc = (await db.execute(
            text("""
                SELECT pc.cycle_id, pc.pu_id, pc.production_id, pc.planting_date,
                       pc.expected_harvest_date, pc.cycle_status,
                       p.production_name, pu.pu_name
                  FROM tenant.production_cycles pc
                  JOIN shared.productions p ON p.production_id = pc.production_id
                  LEFT JOIN tenant.production_units pu ON pu.pu_id = pc.pu_id
                 WHERE pc.tenant_id = :tid AND pc.farm_id = :farm
                   AND pc.cycle_status IN ('PLANNED','ACTIVE','HARVESTING','CLOSING')
                 ORDER BY pc.planting_date DESC NULLS LAST
            """),
            {"tid": tid, "farm": farm_id},
        )).mappings().all()

        keys = list({c["production_id"] for c in cyc if c["production_id"]})
        plans = {}
        if keys:
            pr = await db.execute(
                text("""SELECT crop_key, stage_order, stage, day_from, day_to, action,
                               category, ongoing, verification_status
                          FROM shared.crop_growth_plan
                         WHERE crop_key = ANY(:keys)
                         ORDER BY crop_key, stage_order"""),
                {"keys": keys},
            )
            for row in pr.mappings().all():
                plans.setdefault(row["crop_key"], []).append(dict(row))

    out = []
    for c in cyc:
        pdate = c["planting_date"]
        day_n = (today - (pdate.date() if isinstance(pdate, datetime) else pdate)).days if pdate else None
        stages = plans.get(c["production_id"], [])
        step = None

        if stages and day_n is not None:
            if day_n < stages[0]["day_from"]:
                s0 = stages[0]
                step = {"do_now": True, "stage": s0["stage"], "text": s0["action"], "ongoing": s0["ongoing"],
                        "category": s0["category"], "verification": s0["verification_status"],
                        "when": f"starts in {stages[0]['day_from'] - day_n}d" if day_n >= 0 else "to start"}
            else:
                cur = None
                for s in stages:
                    if s["day_from"] <= day_n <= s["day_to"]:
                        cur = s; break
                if cur:
                    step = {"do_now": True, "stage": cur["stage"], "text": cur["action"], "ongoing": cur["ongoing"],
                            "category": cur["category"], "verification": cur["verification_status"], "when": f"day {day_n}"}
                else:  # past the last seeded stage
                    last = stages[-1]
                    step = {"do_now": True, "stage": last["stage"], "text": last["action"], "ongoing": last["ongoing"],
                            "category": last["category"], "verification": last["verification_status"], "when": f"day {day_n}"}

        if step is None:  # no plan for this crop -> honest generic milestone
            st = c["cycle_status"]; eh = c["expected_harvest_date"]
            if st == "PLANNED":
                step = {"do_now": True, "stage": "Land prep", "text": "Prepare the bed for planting", "ongoing": None, "category": "LAND_PREP", "verification": None, "when": "to start"}
            elif st in ("HARVESTING", "CLOSING") or (eh and eh <= today):
                step = {"do_now": True, "stage": "Harvest", "text": "Harvest and log your picks", "ongoing": None, "category": "HARVEST", "verification": None, "when": f"day {day_n}" if day_n is not None else ""}
            else:
                step = {"do_now": False, "stage": "Growing", "text": "Growing — log field activity (water, spray, scout)", "ongoing": None, "category": "PRODUCTION", "verification": None, "when": f"day {day_n}" if day_n is not None else ""}

        out.append({
            "cycle_id": c["cycle_id"], "pu_id": c["pu_id"],
            "block": c["pu_name"] or c["pu_id"] or "",
            "crop": c["production_name"], "day_n": day_n,
            "has_plan": bool(stages), **step,
        })
    return {"data": out}
