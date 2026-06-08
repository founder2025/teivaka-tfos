"""CROP Compliance — chemical withholding-period (WHD) blocks per farm.

GET /api/v1/crops/compliance/{farm_id} returns the current chemical-WHD hold
state for every active crop cycle on a farm, mirroring the authoritative
harvest_service.check_chemical_compliance logic (Inviolable #2): a block is
HELD when a chemical application's clearance date (event_date + the chemical's
withholding_period_days from shared.chemical_library) is still in the future.

This is a read-only computed view — it never bypasses the WHD trigger; it
surfaces the same state the trigger and harvest pre-check enforce, so the
Overview Compliance tile and the Farm > Compliance page show real "do not
sell" holds instead of a hard-coded zero.

Tenant-scoped via get_tenant_db (RLS + app.tenant_id). shared.* read-only.
"""

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import text, bindparam
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.rls import get_current_user, get_tenant_db
from app.schemas.envelope import success_envelope


router = APIRouter()

# Active cycle states that can carry a live harvest/sale block.
_ACTIVE_STATES = ("PLANNED", "ACTIVE", "HARVESTING", "CLOSING")


@router.get("/crops/compliance/{farm_id}")
async def get_crop_compliance(
    farm_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
):
    """Per-cycle chemical-WHD hold state for one farm.

    Returns:
        data: {
          blocked_count: int,
          active_blocks: [ {cycle_id, pu_id, block_name, crop, chemical,
                            applied_date, whd_days, clear_date, days_remaining} ],
          upcoming_clearances: [ same shape, days_remaining <= 14 ],
          checked_cycles: int
        }
    """
    # Every chemical application on an active cycle's PU, within the cycle's
    # window (planting_date, else last 180d), joined to the chemical's WHD.
    rows = (await db.execute(
        text(f"""
            SELECT pc.cycle_id                                                   AS cycle_id,
                   pc.pu_id                                                      AS pu_id,
                   pu.pu_name                                                    AS block_name,
                   p.production_name                                             AS crop,
                   cl.chem_name                                                  AS chemical,
                   fe.event_date::DATE                                           AS applied_date,
                   COALESCE(cl.withholding_period_days, 0)                       AS whd_days,
                   (fe.event_date::DATE + COALESCE(cl.withholding_period_days, 0)) AS clear_date
              FROM tenant.production_cycles pc
              JOIN tenant.field_events     fe
                ON fe.pu_id                = pc.pu_id
               AND fe.chemical_application = true
               AND fe.chemical_id IS NOT NULL
               AND fe.deleted_at IS NULL
               AND fe.event_date::DATE   >= COALESCE(pc.planting_date, CURRENT_DATE - 180)
              JOIN shared.chemical_library cl ON cl.chemical_id = fe.chemical_id
              LEFT JOIN tenant.production_units pu ON pu.pu_id = pc.pu_id
              LEFT JOIN shared.productions      p  ON p.production_id = pc.production_id
             WHERE pc.farm_id      = :farm_id
               AND pc.cycle_status IN :states
             ORDER BY clear_date DESC
        """).bindparams(bindparam("states", _ACTIVE_STATES, expanding=True)),
        {"farm_id": farm_id},
    )).mappings().all()

    # Count of distinct active cycles on this farm (denominator for "X of N").
    checked = (await db.execute(
        text("""
            SELECT COUNT(*) FROM tenant.production_cycles
             WHERE farm_id = :farm_id AND cycle_status IN :states
        """).bindparams(bindparam("states", _ACTIVE_STATES, expanding=True)),
        {"farm_id": farm_id},
    )).scalar_one()

    # Per cycle, keep the most-binding application (latest clearance date).
    by_cycle: dict = {}
    for r in rows:
        cid = r["cycle_id"]
        prev = by_cycle.get(cid)
        if prev is None or r["clear_date"] > prev["clear_date"]:
            by_cycle[cid] = r

    today = date.today()
    active_blocks = []
    for r in by_cycle.values():
        clear = r["clear_date"]
        if clear <= today:
            continue  # window elapsed — cleared to harvest
        active_blocks.append({
            "cycle_id": r["cycle_id"],
            "pu_id": r["pu_id"],
            "block_name": r["block_name"],
            "crop": r["crop"],
            "chemical": r["chemical"],
            "applied_date": r["applied_date"].isoformat(),
            "whd_days": int(r["whd_days"]),
            "clear_date": clear.isoformat(),
            "days_remaining": (clear - today).days,
        })

    active_blocks.sort(key=lambda b: b["clear_date"])
    upcoming = [b for b in active_blocks if b["days_remaining"] <= 14]

    return success_envelope({
        "blocked_count": len(active_blocks),
        "active_blocks": active_blocks,
        "upcoming_clearances": upcoming,
        "checked_cycles": int(checked),
    })
