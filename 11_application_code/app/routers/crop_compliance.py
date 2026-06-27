"""CROP Compliance — chemical withholding-period (WHD) blocks per farm.

GET /api/v1/crops/compliance/{farm_id} returns the current chemical-WHD hold
state for every active crop cycle on a farm, mirroring the authoritative
harvest_service.check_chemical_compliance logic (Inviolable #2): a block is
HELD when a chemical application's clearance date is still in the future.

Read-only computed view — it never bypasses the WHD trigger; it surfaces the
same state the trigger and harvest pre-check enforce. Redesign (CO18/CO4/CO12/
CO19/CO20): LEFT JOIN the chemical library + read the STORED whd_clearance_date
(trigger-computed) so an application that is mislogged (chemical_application=true
with no chemical picked) is shown as "WHD unknown" rather than silently hidden,
and off-label use (chemical not registered for the crop) is flagged.

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

    Each active block resolves to one of:
      blocked   — an application's clearance date is still in the future (real WHD hold)
      unknown   — chemical_application=true but no chemical identified → WHD can't be
                  computed → NOT safe to assume clear (CO18/CO4)
      off_label — applied a chemical not registered for this crop (CO19)
    Anything else is clear. We never drop a chemical application (LEFT JOIN), and we
    read the stored whd_clearance_date the trigger computed at insert (CO12/CO20).
    """
    rows = (await db.execute(
        text(f"""
            SELECT pc.cycle_id                                                   AS cycle_id,
                   pc.pu_id                                                      AS pu_id,
                   pc.production_id                                              AS production_id,
                   pu.pu_name                                                    AS block_name,
                   p.production_name                                             AS crop,
                   cl.chem_name                                                  AS chemical,
                   fe.event_date::DATE                                           AS applied_date,
                   cl.withholding_period_days                                    AS whd_days,
                   COALESCE(
                       fe.whd_clearance_date,
                       CASE WHEN cl.withholding_period_days IS NOT NULL
                            THEN fe.event_date::DATE + cl.withholding_period_days END
                   )                                                             AS clear_date,
                   (fe.chemical_id IS NULL)                                      AS unspecified,
                   CASE WHEN cl.registered_crops IS NOT NULL AND pc.production_id IS NOT NULL
                        THEN NOT (pc.production_id = ANY(cl.registered_crops))
                        ELSE false END                                          AS off_label
              FROM tenant.production_cycles pc
              JOIN tenant.field_events     fe
                ON fe.pu_id                = pc.pu_id
               AND fe.chemical_application = true
               AND fe.deleted_at IS NULL
               AND fe.event_date::DATE   >= COALESCE(pc.planting_date, CURRENT_DATE - 180)
              LEFT JOIN shared.chemical_library cl ON cl.chemical_id = fe.chemical_id
              LEFT JOIN tenant.production_units pu ON pu.pu_id = pc.pu_id
              LEFT JOIN shared.productions      p  ON p.production_id = pc.production_id
             WHERE pc.farm_id      = :farm_id
               AND pc.cycle_status IN :states
             ORDER BY clear_date DESC NULLS LAST
        """).bindparams(bindparam("states", _ACTIVE_STATES, expanding=True)),
        {"farm_id": farm_id},
    )).mappings().all()

    checked = (await db.execute(
        text("""
            SELECT COUNT(*) FROM tenant.production_cycles
             WHERE farm_id = :farm_id AND cycle_status IN :states
        """).bindparams(bindparam("states", _ACTIVE_STATES, expanding=True)),
        {"farm_id": farm_id},
    )).scalar_one()

    today = date.today()
    # Collapse per cycle to the single most-concerning signal: blocked > unknown > off_label.
    by_cycle: dict = {}
    for r in rows:
        cid = r["cycle_id"]
        clear = r["clear_date"]
        is_blocked = clear is not None and clear > today
        rec = by_cycle.setdefault(cid, {"row": r, "blocked_clear": None, "blocked_row": None,
                                        "unspecified": False, "off_label": False})
        if is_blocked and (rec["blocked_clear"] is None or clear > rec["blocked_clear"]):
            rec["blocked_clear"] = clear
            rec["blocked_row"] = r
        if r["unspecified"]:
            rec["unspecified"] = True
        if r["off_label"]:
            rec["off_label"] = True

    def _common(r):
        return {"cycle_id": r["cycle_id"], "pu_id": r["pu_id"], "block_name": r["block_name"],
                "crop": r["crop"]}

    active_blocks = []
    for rec in by_cycle.values():
        if rec["blocked_clear"] is not None:
            r = rec["blocked_row"]; clear = rec["blocked_clear"]
            active_blocks.append({**_common(r), "state": "blocked",
                                  "chemical": r["chemical"] or "Chemical",
                                  "applied_date": r["applied_date"].isoformat() if r["applied_date"] else None,
                                  "whd_days": int(r["whd_days"]) if r["whd_days"] is not None else None,
                                  "clear_date": clear.isoformat(),
                                  "days_remaining": (clear - today).days,
                                  "off_label": rec["off_label"]})
        elif rec["unspecified"]:
            r = rec["row"]
            active_blocks.append({**_common(r), "state": "unknown",
                                  "chemical": None, "applied_date": r["applied_date"].isoformat() if r["applied_date"] else None,
                                  "whd_days": None, "clear_date": None, "days_remaining": None,
                                  "off_label": rec["off_label"]})
        elif rec["off_label"]:
            r = rec["row"]
            active_blocks.append({**_common(r), "state": "off_label",
                                  "chemical": r["chemical"] or "Chemical",
                                  "applied_date": r["applied_date"].isoformat() if r["applied_date"] else None,
                                  "whd_days": int(r["whd_days"]) if r["whd_days"] is not None else None,
                                  "clear_date": r["clear_date"].isoformat() if r["clear_date"] else None,
                                  "days_remaining": None, "off_label": True})

    # blocked first, then by soonest clear date
    active_blocks.sort(key=lambda b: (b["state"] != "blocked", b["clear_date"] or "9999"))
    blocked_only = [b for b in active_blocks if b["state"] == "blocked"]
    upcoming = [b for b in blocked_only if b["days_remaining"] is not None and b["days_remaining"] <= 14]

    return success_envelope({
        "blocked_count": len(blocked_only),
        "attention_count": len(active_blocks),
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
    EVERY chemical application on the farm (LEFT JOIN — CO18: never hide a mislogged
    one), with dose, who applied it (CO24), off-label flag (CO19) and the WHD. Read-only."""
    rows = (await db.execute(
        text("""
            SELECT fe.event_id::text                                          AS event_id,
                   fe.event_date::date                                        AS applied_date,
                   cl.chem_name                                               AS chemical,
                   fe.pu_id                                                   AS block_id,
                   pu.pu_name                                                 AS block_name,
                   p.production_name                                          AS crop,
                   pc.production_id                                           AS production_id,
                   cl.withholding_period_days                                 AS whd_days,
                   COALESCE(
                       fe.whd_clearance_date,
                       CASE WHEN cl.withholding_period_days IS NOT NULL
                            THEN fe.event_date::date + cl.withholding_period_days END
                   )                                                          AS clear_date,
                   fe.chemical_dose_per_liter                                 AS dose,
                   (fe.chemical_id IS NULL)                                   AS unspecified,
                   CASE WHEN cl.registered_crops IS NOT NULL AND pc.production_id IS NOT NULL
                        THEN NOT (pc.production_id = ANY(cl.registered_crops))
                        ELSE false END                                       AS off_label,
                   u.full_name                                               AS applied_by,
                   fe.audit_hash                                             AS hash
            FROM tenant.field_events fe
            LEFT JOIN shared.chemical_library cl ON cl.chemical_id = fe.chemical_id
            LEFT JOIN tenant.production_units pu ON pu.pu_id = fe.pu_id
            LEFT JOIN tenant.production_cycles pc ON pc.cycle_id = fe.cycle_id
            LEFT JOIN shared.productions p ON p.production_id = pc.production_id
            LEFT JOIN tenant.users u ON u.user_id = fe.created_by
            WHERE fe.farm_id = :fid
              AND fe.chemical_application = true
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
        d["unspecified"] = bool(d["unspecified"])
        d["off_label"] = bool(d["off_label"])
        d["dose"] = float(d["dose"]) if d["dose"] is not None else None
        d["chemical"] = d["chemical"] or ("Not identified" if d["unspecified"] else "Chemical")
        d["hash"] = (d["hash"] or "")[-8:]
        out.append(d)
    return success_envelope({"applications": out, "count": len(out), "capped": len(out) >= 500})


@router.get("/crops/compliance/{farm_id}/overrides")
async def get_compliance_overrides(
    farm_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
):
    """FOUNDER override ledger for the Compliance > Overrides tab. Real rows from
    tenant.harvest_compliance_overrides (write-once; each is a permanent ding).

    NOTE (CO5, filed): this table has no farm_id, so the ledger is tenant-wide, not
    farm-specific — the UI labels it honestly until a farm_id column is added + populated
    at override-write time. RLS still scopes it to the tenant."""
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
    year_start = f"{date.today().year}-01-01"
    ytd = sum(1 for d in out if (d["attempted_at"] or "") >= year_start)
    return success_envelope({"overrides": out, "total": len(out), "ytd": ytd, "farm_scoped": False})
