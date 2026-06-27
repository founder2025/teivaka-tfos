"""
analytics.py — Analytics page data (prototype v13 Analytics surface).

Read-only computed views over real tenant.* tables. NOTHING here computes
decision signals on demand (Inviolable #3) — signal reads come from the
pre-computed tenant.decision_signal_snapshots written by the Decision Engine
worker, joined to tenant.decision_signal_config for thresholds.

Endpoints (all RLS-scoped via get_rls_db):
  GET /analytics/{farm_id}/signals     → all configured signals: latest state,
                                         last-8 history (sparkline), thresholds
  GET /analytics/{farm_id}/fliplog     → signal state transitions (write-once
                                         history derived from snapshots via LAG)
  GET /analytics/{farm_id}/cycles      → per-cycle P&L + outcomes (soil from
                                         zones, crop name from shared.productions)
  GET /analytics/{farm_id}/cashdemand  → cash runway (cash_ledger), revenue by
                                         month, demand-vs-capacity by crop
  GET /analytics/{farm_id}/forecasts   → harvest windows (active cycles) +
                                         cash-gap projection rows
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from app.db.session import get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()

# Same sign convention as cash.py (MBI Part 11).
_BALANCE_SIGN_SQL = """
    CASE
        WHEN transaction_type IN ('INCOME','LOAN','GRANT','TRANSFER') THEN amount_fjd
        WHEN transaction_type IN ('EXPENSE','REPAYMENT') THEN -amount_fjd
        ELSE 0
    END
"""


async def _require_farm(db, farm_id: str, tid: str):
    r = await db.execute(
        text("SELECT farm_id FROM tenant.farms WHERE farm_id = :fid AND tenant_id = :tid"),
        {"fid": farm_id, "tid": tid},
    )
    if not r.mappings().first():
        raise HTTPException(status_code=404, detail="Farm not found")


def _rows(result):
    return [dict(r) for r in result.mappings().all()]


# ── Signals (tiles + detail) ────────────────────────────────────────────────

@router.get("/{farm_id}/signals")
async def analytics_signals(farm_id: str, user: dict = Depends(get_current_user)):
    """Every configured signal with its latest pre-computed state + history.

    A signal with no snapshot yet is returned with status BUILDING — honest
    "building baseline", never a fabricated state.
    """
    tid = str(user["tenant_id"])
    async with get_rls_db(tid) as db:
        await _require_farm(db, farm_id, tid)

        # Two flat SELECTs + Python aggregation — deliberately NO window function,
        # NO correlated LATERAL, NO array COALESCE. The previous single-query form
        # ran a ROW_NUMBER() window over a CTE backed by the decision_signal_snapshots
        # TimescaleDB hypertable and re-scanned that CTE inside a correlated LATERAL —
        # a planner shape that throws on Timescale hypertables at runtime (the Signals
        # 500). This shape can't fail that way.
        cfg = _rows(await db.execute(text("""
            SELECT signal_id, signal_name, signal_category,
                   green_threshold, amber_threshold, red_threshold, threshold_direction
            FROM tenant.decision_signal_config
            WHERE tenant_id = :tid AND is_active = true
            ORDER BY signal_id
        """), {"tid": tid}))

        snaps = _rows(await db.execute(text("""
            SELECT signal_id, snapshot_date, computed_value, signal_status, notes
            FROM tenant.decision_signal_snapshots
            WHERE tenant_id = :tid AND farm_id = :fid
            ORDER BY signal_id, snapshot_date DESC
        """), {"tid": tid, "fid": farm_id}))

        # Group snapshots by signal (already newest-first per signal).
        by_signal: dict = {}
        last_at = None
        for s in snaps:
            by_signal.setdefault(s["signal_id"], []).append(s)
            if s["snapshot_date"] is not None and (last_at is None or s["snapshot_date"] > last_at):
                last_at = s["snapshot_date"]

        def _f(v):
            return float(v) if v is not None else None

        signals = []
        for row in cfg:
            rows_for = by_signal.get(row["signal_id"], [])
            latest = rows_for[0] if rows_for else None
            # last-8 chronological (oldest→newest) for the sparkline
            hist = [_f(x["computed_value"]) for x in reversed(rows_for[:8]) if x["computed_value"] is not None]
            signals.append({
                "signal_id": row["signal_id"],
                "name": row["signal_name"],
                "category": row["signal_category"],
                "status": (latest["signal_status"] if latest else None) or "BUILDING",
                "value": _f(latest["computed_value"]) if latest else None,
                "notes": latest["notes"] if latest else None,
                "computed_at": str(latest["snapshot_date"]) if latest and latest["snapshot_date"] else None,
                "history": hist,
                "threshold": {
                    "green": _f(row["green_threshold"]),
                    "amber": _f(row["amber_threshold"]),
                    "red": _f(row["red_threshold"]),
                    "direction": row["threshold_direction"],
                },
            })
        return {"data": {"signals": signals,
                         "last_snapshot_at": str(last_at) if last_at else None}}


# ── Flip log (state transitions, derived — write-once source rows) ─────────

@router.get("/{farm_id}/fliplog")
async def analytics_fliplog(farm_id: str, limit: int = 100, user: dict = Depends(get_current_user)):
    tid = str(user["tenant_id"])
    cap = max(1, min(limit, 500))
    async with get_rls_db(tid) as db:
        await _require_farm(db, farm_id, tid)

        # Transitions computed in Python from flat rows — NO LAG window over the
        # decision_signal_snapshots hypertable (same Timescale-planner hazard the
        # signals endpoint hit). Names resolved via a small config lookup.
        names = {r["signal_id"]: r["signal_name"] for r in _rows(await db.execute(text("""
            SELECT signal_id, signal_name FROM tenant.decision_signal_config
            WHERE tenant_id = :tid
        """), {"tid": tid}))}

        snaps = _rows(await db.execute(text("""
            SELECT signal_id, snapshot_date, signal_status, computed_value
            FROM tenant.decision_signal_snapshots
            WHERE tenant_id = :tid AND farm_id = :fid
            ORDER BY signal_id, snapshot_date ASC
        """), {"tid": tid, "fid": farm_id}))

        flips = []
        prev_sig = None
        prev_status = None
        for s in snaps:
            if s["signal_id"] != prev_sig:
                prev_sig, prev_status = s["signal_id"], s["signal_status"]
                continue
            if s["signal_status"] is not None and s["signal_status"] != prev_status and prev_status is not None:
                flips.append({
                    "signal_id": s["signal_id"],
                    "signal_name": names.get(s["signal_id"], s["signal_id"]),
                    "at": str(s["snapshot_date"]),
                    "from": str(prev_status).lower(),
                    "to": str(s["signal_status"]).lower(),
                    "value": float(s["computed_value"]) if s["computed_value"] is not None else None,
                    "_sort": s["snapshot_date"],
                })
            prev_status = s["signal_status"]

        # newest-first, capped
        flips.sort(key=lambda f: f["_sort"], reverse=True)
        flips = flips[:cap]
        for f in flips:
            f.pop("_sort", None)
        return {"data": {"flips": flips}}


# ── Per-cycle P&L + outcomes ────────────────────────────────────────────────

@router.get("/{farm_id}/cycles")
async def analytics_cycles(farm_id: str, user: dict = Depends(get_current_user)):
    """Every cycle with cost split, revenue, yield, area, soil — the single
    source for the Profitability / Productivity / Per-unit / Compare /
    Findings tabs (closed cycles = outcomes)."""
    tid = str(user["tenant_id"])
    async with get_rls_db(tid) as db:
        await _require_farm(db, farm_id, tid)
        r = await db.execute(text("""
            SELECT pc.cycle_id, pc.pu_id, pc.cycle_status, pc.planting_date,
                   pc.expected_harvest_date, pc.actual_harvest_end,
                   pc.planned_area_sqm, pc.planned_yield_kg, pc.actual_yield_kg,
                   pc.total_labor_cost_fjd, pc.total_input_cost_fjd,
                   pc.total_other_cost_fjd, pc.total_revenue_fjd,
                   pc.cogk_fjd_per_kg,
                   sp.production_name AS crop, pc.production_id,
                   z.soil_type, z.zone_name, pu.pu_name
            FROM tenant.production_cycles pc
            JOIN shared.productions sp ON sp.production_id = pc.production_id
            LEFT JOIN tenant.zones z ON z.zone_id = pc.zone_id
            LEFT JOIN tenant.production_units pu ON pu.pu_id = pc.pu_id
            WHERE pc.tenant_id = :tid AND pc.farm_id = :fid
            ORDER BY pc.planting_date DESC
        """), {"tid": tid, "fid": farm_id})
        out = []
        for c in _rows(r):
            rev = float(c["total_revenue_fjd"] or 0)
            inp = float(c["total_input_cost_fjd"] or 0)
            lab = float(c["total_labor_cost_fjd"] or 0)
            oth = float(c["total_other_cost_fjd"] or 0)
            cost = inp + lab + oth
            out.append({
                "cycle_id": c["cycle_id"], "pu_id": c["pu_id"], "pu_name": c["pu_name"],
                "crop": c["crop"], "production_id": c["production_id"],
                "status": c["cycle_status"],
                "planting_date": str(c["planting_date"]) if c["planting_date"] else None,
                "expected_harvest_date": str(c["expected_harvest_date"]) if c["expected_harvest_date"] else None,
                "closed_date": str(c["actual_harvest_end"]) if c["actual_harvest_end"] else None,
                "area_sqm": float(c["planned_area_sqm"]) if c["planned_area_sqm"] is not None else None,
                "planned_yield_kg": float(c["planned_yield_kg"]) if c["planned_yield_kg"] is not None else None,
                "actual_yield_kg": float(c["actual_yield_kg"]) if c["actual_yield_kg"] is not None else None,
                "revenue": rev, "input_cost": inp, "labor_cost": lab,
                "other_cost": oth, "total_cost": cost, "margin": rev - cost,
                "margin_pct": round((rev - cost) / rev * 100) if rev > 0 else None,
                "cogk": float(c["cogk_fjd_per_kg"]) if c["cogk_fjd_per_kg"] is not None else None,
                "soil_type": c["soil_type"], "zone_name": c["zone_name"],
            })
        return {"data": {"cycles": out}}


# ── Cash & demand ───────────────────────────────────────────────────────────

@router.get("/{farm_id}/cashdemand")
async def analytics_cashdemand(farm_id: str, user: dict = Depends(get_current_user)):
    tid = str(user["tenant_id"])
    async with get_rls_db(tid) as db:
        await _require_farm(db, farm_id, tid)

        bal = (await db.execute(text(f"""
            SELECT COALESCE(SUM({_BALANCE_SIGN_SQL}), 0) AS balance
            FROM tenant.cash_ledger WHERE tenant_id = :tid AND farm_id = :fid
        """), {"tid": tid, "fid": farm_id})).mappings().first()
        balance = float(bal["balance"] or 0)

        # Average weekly net over the last 8 weeks (only weeks with activity).
        wk = (await db.execute(text(f"""
            SELECT COALESCE(AVG(net), NULL) AS avg_weekly_net, COUNT(*) AS weeks
            FROM (
                SELECT date_trunc('week', transaction_date) AS w,
                       SUM({_BALANCE_SIGN_SQL}) AS net
                FROM tenant.cash_ledger
                WHERE tenant_id = :tid AND farm_id = :fid
                  AND transaction_date >= CURRENT_DATE - INTERVAL '8 weeks'
                GROUP BY 1
            ) t
        """), {"tid": tid, "fid": farm_id})).mappings().first()
        avg_weekly_net = float(wk["avg_weekly_net"]) if wk["avg_weekly_net"] is not None else None
        runway_weeks = None
        if avg_weekly_net is not None and avg_weekly_net < 0 and balance > 0:
            runway_weeks = round(balance / abs(avg_weekly_net), 1)

        months = await db.execute(text("""
            SELECT to_char(date_trunc('month', transaction_date), 'YYYY-MM') AS month,
                   SUM(amount_fjd) AS income
            FROM tenant.cash_ledger
            WHERE tenant_id = :tid AND farm_id = :fid AND transaction_type = 'INCOME'
              AND transaction_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
            GROUP BY 1 ORDER BY 1
        """), {"tid": tid, "fid": farm_id})
        revenue_by_month = [{"month": m["month"], "income": float(m["income"] or 0)}
                            for m in months.mappings().all()]

        # Demand vs capacity by crop: logged buyer demand signals against the
        # planned yield of cycles still in the ground.
        dm = await db.execute(text("""
            SELECT d.crop_type,
                   SUM(d.quantity_kg)    AS demand_kg,
                   COUNT(*)              AS n_signals,
                   COALESCE(cap.capacity_kg, 0) AS capacity_kg,
                   COALESCE(cap.n_cycles, 0)    AS n_cycles
            FROM tenant.buyer_demand_signals d
            LEFT JOIN LATERAL (
                SELECT SUM(pc.planned_yield_kg) AS capacity_kg, COUNT(*) AS n_cycles
                FROM tenant.production_cycles pc
                JOIN shared.productions sp ON sp.production_id = pc.production_id
                WHERE pc.tenant_id = :tid AND pc.farm_id = :fid
                  AND pc.cycle_status IN ('ACTIVE','HARVESTING')
                  AND lower(sp.production_name) = lower(d.crop_type)
            ) cap ON true
            WHERE d.tenant_id = :tid AND (d.farm_id = :fid OR d.farm_id IS NULL)
              AND d.crop_type IS NOT NULL
            GROUP BY d.crop_type, cap.capacity_kg, cap.n_cycles
            ORDER BY SUM(d.quantity_kg) DESC NULLS LAST
        """), {"tid": tid, "fid": farm_id})
        demand = [{"crop": d["crop_type"],
                   "demand_kg": float(d["demand_kg"]) if d["demand_kg"] is not None else None,
                   "n_signals": int(d["n_signals"]),
                   "capacity_kg": float(d["capacity_kg"] or 0),
                   "n_cycles": int(d["n_cycles"])}
                  for d in dm.mappings().all()]

        # Receivables overdue (feeds the "why" line under runway).
        ar = (await db.execute(text("""
            SELECT COALESCE(SUM(outstanding_fjd), 0) AS overdue
            FROM tenant.accounts_receivable
            WHERE tenant_id = :tid AND farm_id = :fid
              AND ar_status NOT IN ('PAID','WRITTEN_OFF') AND due_date < CURRENT_DATE
        """), {"tid": tid, "fid": farm_id})).mappings().first()

        return {"data": {
            "balance_fjd": balance,
            "avg_weekly_net_fjd": avg_weekly_net,
            "runway_weeks": runway_weeks,
            "overdue_receivables_fjd": float(ar["overdue"] or 0),
            "revenue_by_month": revenue_by_month,
            "demand": demand,
        }}


# ── Forecasts ───────────────────────────────────────────────────────────────

@router.get("/{farm_id}/forecasts")
async def analytics_forecasts(farm_id: str, user: dict = Depends(get_current_user)):
    """Projections strictly from current data: harvest windows from live cycle
    dates; cash-gap rows from balance + recent weekly net (plain arithmetic).
    No invented agronomy."""
    tid = str(user["tenant_id"])
    async with get_rls_db(tid) as db:
        await _require_farm(db, farm_id, tid)
        hv = await db.execute(text("""
            SELECT pc.cycle_id, sp.production_name AS crop, pc.pu_id,
                   pc.expected_harvest_date, pc.planned_yield_kg, pc.cycle_status
            FROM tenant.production_cycles pc
            JOIN shared.productions sp ON sp.production_id = pc.production_id
            WHERE pc.tenant_id = :tid AND pc.farm_id = :fid
              AND pc.cycle_status IN ('ACTIVE','HARVESTING')
              AND pc.expected_harvest_date IS NOT NULL
            ORDER BY pc.expected_harvest_date
        """), {"tid": tid, "fid": farm_id})
        harvest = [{"cycle_id": h["cycle_id"], "crop": h["crop"], "pu_id": h["pu_id"],
                    "date": str(h["expected_harvest_date"]),
                    "planned_yield_kg": float(h["planned_yield_kg"]) if h["planned_yield_kg"] is not None else None,
                    "status": h["cycle_status"],
                    "overdue": False}
                   for h in hv.mappings().all()]
        today = (await db.execute(text("SELECT CURRENT_DATE AS d"))).mappings().first()["d"]
        for h in harvest:
            h["overdue"] = h["date"] < str(today)

        bal = (await db.execute(text(f"""
            SELECT COALESCE(SUM({_BALANCE_SIGN_SQL}), 0) AS balance FROM tenant.cash_ledger
            WHERE tenant_id = :tid AND farm_id = :fid
        """), {"tid": tid, "fid": farm_id})).mappings().first()
        wk = await db.execute(text(f"""
            SELECT date_trunc('week', transaction_date)::date AS w, SUM({_BALANCE_SIGN_SQL}) AS net
            FROM tenant.cash_ledger
            WHERE tenant_id = :tid AND farm_id = :fid
              AND transaction_date >= CURRENT_DATE - INTERVAL '8 weeks'
            GROUP BY 1 ORDER BY 1
        """), {"tid": tid, "fid": farm_id})
        weekly = [{"week": str(w["w"]), "net": float(w["net"] or 0)} for w in wk.mappings().all()]
        avg_net = sum(w["net"] for w in weekly) / len(weekly) if weekly else None

        cash_projection = []
        if avg_net is not None:
            running = float(bal["balance"] or 0)
            for i in range(1, 9):
                running += avg_net
                cash_projection.append({"week_offset": i, "projected_balance": round(running, 2)})

        return {"data": {"harvest_windows": harvest,
                         "weekly_net": weekly,
                         "avg_weekly_net_fjd": round(avg_net, 2) if avg_net is not None else None,
                         "cash_projection": cash_projection}}
