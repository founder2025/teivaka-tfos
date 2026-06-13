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


@router.get("/crops/compliance/{farm_id}/register")
async def get_chemical_register(
    farm_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
):
    """Chemical-application register for the Compliance > Chemical register tab.
    Every chemical event on the farm joined to its WHD, newest first. Read-only."""
    rows = (await db.execute(
        text("""
            SELECT fe.event_id::text                                          AS event_id,
                   fe.event_date::date                                        AS applied_date,
                   cl.chem_name                                               AS chemical,
                   fe.pu_id                                                   AS block_id,
                   pu.pu_name                                                 AS block_name,
                   p.production_name                                          AS crop,
                   COALESCE(cl.withholding_period_days, 0)                    AS whd_days,
                   (fe.event_date::date + COALESCE(cl.withholding_period_days,0)) AS clear_date,
                   fe.chemical_dose_per_liter                                 AS dose,
                   fe.audit_hash                                              AS hash
            FROM tenant.field_events fe
            JOIN shared.chemical_library cl ON cl.chemical_id = fe.chemical_id
            LEFT JOIN tenant.production_units pu ON pu.pu_id = fe.pu_id
            LEFT JOIN tenant.production_cycles pc ON pc.cycle_id = fe.cycle_id
            LEFT JOIN shared.productions p ON p.production_id = pc.production_id
            WHERE fe.farm_id = :fid
              AND fe.chemical_application = true
              AND fe.chemical_id IS NOT NULL
            ORDER BY fe.event_date DESC
            LIMIT 500
        """),
        {"fid": farm_id},
    )).mappings().all()
    today = date.today()
    out = []
    for r in rows:
        d = dict(r)
        clear = d["clear_date"]
        d["applied_date"] = str(d["applied_date"]) if d["applied_date"] else None
        d["clear_date"] = str(clear) if clear else None
        d["active"] = bool(clear and clear > today)
        d["hash"] = (d["hash"] or "")[-8:]
        out.append(d)
    return success_envelope({"applications": out, "count": len(out)})


@router.get("/crops/compliance/{farm_id}/overrides")
async def get_compliance_overrides(
    farm_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
):
    """FOUNDER override ledger for the Compliance > Overrides tab. Real rows from
    tenant.harvest_compliance_overrides (write-once; each is a permanent ding)."""
    rows = (await db.execute(
        text("""
            SELECT o.override_id::text          AS override_id,
                   o.reason                     AS reason,
                   o.attempted_at               AS attempted_at,
                   o.approved                   AS approved,
                   o.harvest_id::text           AS harvest_id,
                   u.full_name                  AS authorized_by
            FROM tenant.harvest_compliance_overrides o
            LEFT JOIN tenant.users u ON u.user_id = o.attempted_by_user_id
            ORDER BY o.attempted_at DESC
            LIMIT 200
        """),
    )).mappings().all()
    out = []
    for r in rows:
        d = dict(r)
        d["attempted_at"] = d["attempted_at"].isoformat() if d["attempted_at"] else None
        out.append(d)
    ytd = sum(1 for d in out if (d["attempted_at"] or "") >= "2026-01-01")
    return success_envelope({"overrides": out, "total": len(out), "ytd": ytd})
