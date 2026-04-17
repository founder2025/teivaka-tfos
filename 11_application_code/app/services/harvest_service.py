"""harvest_service.py — Harvest logging + chemical compliance pre-check.

The HARD enforcement of inviolable rule #2 (chemical WHD) lives in the DB
trigger `tenant.enforce_harvest_compliance` (migration 015a). The pre-check
here is a UX convenience so the API can return a clean HTTP 409 with full
detail BEFORE the trigger raises a generic exception.

Schema column names (DRIFT from master spec — these are the REAL names):
  shared.chemical_library.chem_name
  shared.chemical_library.withholding_period_days
  tenant.harvest_log.pu_id
  tenant.harvest_log.chemical_compliance_cleared
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Window fallback when a cycle has no planting_date (kava, cassava etc.)
_WINDOW_FALLBACK_DAYS = 180


# ─── Compliance pre-check ────────────────────────────────────────────────────

async def check_chemical_compliance(
    session: AsyncSession,
    *,
    cycle_id: str,
    pu_id: str,
    harvest_date: date,
) -> dict:
    """API-layer pre-check that mirrors the DB trigger logic (015a).

    Returns:
        {
          "compliant": bool,
          "clearance_date": date | None,
          "last_chemical_date": date | None,
          "days_remaining": int,
          "blocking_chemicals": [
              {"chem_name": str, "event_date": date,
               "whd_days": int, "clearance_date": date}
          ]
        }
    """
    # 1. Resolve window start (cycle planting_date, else harvest_date - 180d)
    cycle_row = (await session.execute(
        text("SELECT planting_date FROM tenant.production_cycles WHERE cycle_id = :cid"),
        {"cid": cycle_id},
    )).first()
    planting_date: Optional[date] = cycle_row[0] if cycle_row else None
    window_start = planting_date or (harvest_date - timedelta(days=_WINDOW_FALLBACK_DAYS))

    # 2. Pull every chemical application on this PU since window_start; compute
    #    per-chemical clearance_date. Anything with clearance > harvest_date blocks.
    rows = (await session.execute(
        text("""
            SELECT
                cl.chem_name                                                              AS chem_name,
                fe.event_date::DATE                                                       AS event_date,
                COALESCE(cl.withholding_period_days, 0)                                   AS whd_days,
                (fe.event_date::DATE + COALESCE(cl.withholding_period_days, 0))           AS clearance_date
            FROM tenant.field_events     fe
            JOIN shared.chemical_library cl ON cl.chemical_id = fe.chemical_id
            WHERE fe.pu_id                = :pu_id
              AND fe.chemical_application = true
              AND fe.event_date::DATE    >= :window_start
            ORDER BY clearance_date DESC
        """),
        {"pu_id": pu_id, "window_start": window_start},
    )).mappings().all()

    if not rows:
        return {
            "compliant": True,
            "clearance_date": None,
            "last_chemical_date": None,
            "days_remaining": 0,
            "blocking_chemicals": [],
        }

    last_chemical_date = max(r["event_date"] for r in rows)
    overall_clearance = max(r["clearance_date"] for r in rows)
    blocking = [
        {
            "chem_name": r["chem_name"],
            "event_date": r["event_date"].isoformat(),
            "whd_days": int(r["whd_days"]),
            "clearance_date": r["clearance_date"].isoformat(),
        }
        for r in rows
        if r["clearance_date"] > harvest_date
    ]
    compliant = not blocking
    days_remaining = max(0, (overall_clearance - harvest_date).days) if not compliant else 0

    return {
        "compliant": compliant,
        "clearance_date": overall_clearance.isoformat(),
        "last_chemical_date": last_chemical_date.isoformat(),
        "days_remaining": days_remaining,
        "blocking_chemicals": blocking,
    }


# ─── Harvest insert ──────────────────────────────────────────────────────────

_GRADE_COL = {"A": "grade_a_kg", "B": "grade_b_kg", "C": "grade_c_kg"}


async def log_harvest(
    session: AsyncSession,
    *,
    tenant_id: str,
    recorded_by: str,
    cycle_id: str,
    pu_id: str,
    harvest_date: date,
    qty_kg: Decimal,
    grade: Optional[str] = None,
    destination: Optional[str] = None,
    compliance_override: bool = False,
    override_reason: Optional[str] = None,
    idempotency_key: Optional[str] = None,
) -> dict:
    """Insert a harvest row. Pre-checks compliance for clean 409, then INSERTs;
    DB trigger `enforce_harvest_compliance` is the authoritative gate.

    Raises:
        HTTPException 404 if cycle/pu not found
        HTTPException 409 on compliance violation (without override)
                          or invalid cycle status
        HTTPException 422 if override=True without reason
    """
    if compliance_override and not (override_reason and override_reason.strip()):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="override_reason is required when compliance_override is true",
        )

    # 1. Resolve cycle: gives us farm_id, production_id, status sanity-check
    cycle = (await session.execute(
        text("""
            SELECT cycle_id, farm_id, pu_id, production_id, cycle_status
            FROM   tenant.production_cycles
            WHERE  cycle_id = :cid
        """),
        {"cid": cycle_id},
    )).mappings().first()
    if not cycle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Cycle '{cycle_id}' not found")
    if cycle["pu_id"] != pu_id:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail=f"Cycle '{cycle_id}' is not on PU '{pu_id}'")
    if cycle["cycle_status"] not in ("ACTIVE", "HARVESTING"):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"Cycle status is '{cycle['cycle_status']}'. Harvest only allowed when ACTIVE or HARVESTING.",
        )

    # 2. Compliance pre-check (Layer 1) — clean 409 with full payload
    compliance = await check_chemical_compliance(
        session, cycle_id=cycle_id, pu_id=pu_id, harvest_date=harvest_date,
    )
    if not compliance["compliant"] and not compliance_override:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "status": "error",
                "error": {
                    "code": "CHEMICAL_COMPLIANCE_VIOLATION",
                    "message": (
                        f"Cannot harvest on {harvest_date}: clearance date is "
                        f"{compliance['clearance_date']} ({compliance['days_remaining']} days remaining)."
                    ),
                    "data": compliance,
                },
            },
        )

    # 3. Generate harvest_id: HRV-YYYYMMDD-NNN
    date_tag = harvest_date.strftime("%Y%m%d")
    seq_row = (await session.execute(
        text("""
            SELECT COUNT(*) FROM tenant.harvest_log
            WHERE harvest_id LIKE :pat
        """),
        {"pat": f"HRV-{date_tag}-%"},
    )).first()
    next_seq = int(seq_row[0]) + 1 if seq_row else 1
    harvest_id = f"HRV-{date_tag}-{next_seq:03d}"

    # 4. Map qty_kg → gross/marketable + optional grade bucket
    grade_col_value = ""
    grade_param = {}
    if grade and grade.upper() in _GRADE_COL:
        col = _GRADE_COL[grade.upper()]
        grade_col_value = f", {col}"
        grade_param = {"grade_kg": qty_kg}
        grade_value_sql = ", :grade_kg"
    else:
        grade_value_sql = ""

    # destination → quality_notes (no dedicated column on harvest_log)
    notes = None
    if destination:
        notes = f"destination={destination}"

    # 5. INSERT — DB trigger sets chemical_compliance_cleared, last_chemical_date,
    #    whd_clearance_date. We set compliance_override fields if applicable.
    insert_sql = f"""
        INSERT INTO tenant.harvest_log (
            harvest_id, tenant_id, cycle_id, pu_id, farm_id, production_id,
            harvest_date, gross_yield_kg, marketable_yield_kg, waste_kg
            {grade_col_value},
            quality_notes,
            compliance_override, compliance_override_by, compliance_override_reason,
            created_by, idempotency_key
        ) VALUES (
            :harvest_id, :tenant_id, :cycle_id, :pu_id, :farm_id, :production_id,
            :harvest_date, :qty_kg, :qty_kg, 0
            {grade_value_sql},
            :notes,
            :override, :override_by, :override_reason,
            :created_by, :idempotency_key
        )
        RETURNING harvest_id, harvest_date, gross_yield_kg, marketable_yield_kg,
                  chemical_compliance_cleared, last_chemical_date, whd_clearance_date,
                  compliance_override, created_at
    """
    try:
        result = await session.execute(
            text(insert_sql),
            {
                "harvest_id": harvest_id,
                "tenant_id": tenant_id,
                "cycle_id": cycle_id,
                "pu_id": pu_id,
                "farm_id": cycle["farm_id"],
                "production_id": cycle["production_id"],
                "harvest_date": harvest_date,
                "qty_kg": qty_kg,
                "notes": notes,
                "override": compliance_override,
                "override_by": recorded_by if compliance_override else None,
                "override_reason": override_reason if compliance_override else None,
                "created_by": recorded_by,
                "idempotency_key": idempotency_key,
                **grade_param,
            },
        )
        row = result.mappings().first()
    except Exception as e:
        msg = str(e)
        if "CHEMICAL_COMPLIANCE_VIOLATION" in msg:
            # Trigger raised — surface as 409 with raw trigger detail.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "status": "error",
                    "error": {
                        "code": "CHEMICAL_COMPLIANCE_VIOLATION",
                        "message": "DB trigger blocked harvest (Layer 2 enforcement).",
                        "data": {"db_message": msg.split("\n")[0]},
                    },
                },
            )
        logger.exception("harvest_log insert failed")
        raise

    if compliance_override:
        logger.critical(
            "COMPLIANCE_OVERRIDE applied: harvest_id=%s by user_id=%s reason=%r "
            "(no separate audit table — stored on harvest_log columns)",
            harvest_id, recorded_by, override_reason,
        )

    return {
        "harvest_id": row["harvest_id"],
        "harvest_date": row["harvest_date"].isoformat() if hasattr(row["harvest_date"], "isoformat") else str(row["harvest_date"]),
        "gross_yield_kg": float(row["gross_yield_kg"]),
        "marketable_yield_kg": float(row["marketable_yield_kg"]),
        "chemical_compliance_cleared": bool(row["chemical_compliance_cleared"]),
        "last_chemical_date": row["last_chemical_date"].isoformat() if row["last_chemical_date"] else None,
        "whd_clearance_date": row["whd_clearance_date"].isoformat() if row["whd_clearance_date"] else None,
        "compliance_override": bool(row["compliance_override"]),
        "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
    }


# ─── List + detail (used by router GET endpoints) ────────────────────────────

async def list_harvests(
    session: AsyncSession,
    *,
    farm_id: Optional[str] = None,
    pu_id: Optional[str] = None,
    cycle_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    filters = []
    params: dict = {"limit": limit, "offset": offset}
    if farm_id:   filters.append("h.farm_id = :farm_id");   params["farm_id"] = farm_id
    if pu_id:     filters.append("h.pu_id = :pu_id");       params["pu_id"] = pu_id
    if cycle_id:  filters.append("h.cycle_id = :cycle_id"); params["cycle_id"] = cycle_id
    if date_from: filters.append("h.harvest_date >= :date_from"); params["date_from"] = date_from
    if date_to:   filters.append("h.harvest_date <= :date_to");   params["date_to"] = date_to
    where = f"WHERE {' AND '.join(filters)}" if filters else ""

    rows = (await session.execute(
        text(f"""
            SELECT h.harvest_id, h.cycle_id, h.farm_id, h.pu_id, h.production_id,
                   h.harvest_date, h.gross_yield_kg, h.marketable_yield_kg, h.waste_kg,
                   h.chemical_compliance_cleared, h.last_chemical_date, h.whd_clearance_date,
                   h.compliance_override, h.created_at
            FROM   tenant.harvest_log h
            {where}
            ORDER BY h.harvest_date DESC, h.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )).mappings().all()
    return [dict(r) for r in rows]


async def get_harvest(session: AsyncSession, *, harvest_id: str) -> Optional[dict]:
    row = (await session.execute(
        text("""
            SELECT h.*
            FROM   tenant.harvest_log h
            WHERE  h.harvest_id = :hid
        """),
        {"hid": harvest_id},
    )).mappings().first()
    return dict(row) if row else None
