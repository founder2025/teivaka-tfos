from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()

@router.get("/cogk/{farm_id}")
async def get_cogk_trend(farm_id: str, production_id: str = None, periods: int = 12, user: dict = Depends(get_current_user)):
    """
    Cost of Goods per Kg trend report.
    Returns per-cycle CoKG broken into labor, inputs, overhead components.
    Used to track efficiency improvements over time.
    """
    async with get_rls_db(str(user["tenant_id"])) as db:
        farm_check = await db.execute(
            text("SELECT farm_id FROM tenant.farms WHERE farm_id = :farm_id AND tenant_id = :tid"),
            {"farm_id": farm_id, "tid": str(user["tenant_id"])}
        )
        if not farm_check.mappings().first():
            raise HTTPException(status_code=404, detail="Farm not found")

        params = {"farm_id": farm_id, "tid": str(user["tenant_id"]), "periods": periods}
        q = """
            SELECT
                c.cycle_id, c.cycle_name, p.production_name, p.production_id,
                c.start_date, c.end_date,
                COALESCE(SUM(h.total_weight_kg), 0) AS total_harvest_kg,
                COALESCE(SUM(il.net_amount_fjd), 0) AS total_income_fjd,
                COALESCE(SUM(la.total_pay_fjd + COALESCE(la.overtime_pay_fjd, 0)), 0) AS labor_cost_fjd,
                COALESCE(SUM(it.total_cost_fjd), 0) AS input_cost_fjd,
                CASE WHEN COALESCE(SUM(h.total_weight_kg), 0) > 0
                     THEN ROUND((COALESCE(SUM(la.total_pay_fjd + COALESCE(la.overtime_pay_fjd, 0)), 0) +
                                 COALESCE(SUM(it.total_cost_fjd), 0)) /
                                COALESCE(SUM(h.total_weight_kg), 0), 2)
                     ELSE NULL
                END AS cokg_fjd_per_kg,
                CASE WHEN COALESCE(SUM(h.total_weight_kg), 0) > 0
                     THEN ROUND(COALESCE(SUM(il.net_amount_fjd), 0) /
                                COALESCE(SUM(h.total_weight_kg), 0), 2)
                     ELSE NULL
                END AS revenue_per_kg_fjd
            FROM tenant.cycles c
            JOIN shared.productions p ON p.production_id = c.production_id
            LEFT JOIN tenant.harvests h ON h.cycle_id = c.cycle_id AND h.tenant_id = c.tenant_id
            LEFT JOIN tenant.income_log il ON il.cycle_id = c.cycle_id AND il.tenant_id = c.tenant_id
            LEFT JOIN tenant.labor_attendance la ON la.cycle_id = c.cycle_id AND la.tenant_id = c.tenant_id
            LEFT JOIN tenant.input_transactions it ON it.cycle_id = c.cycle_id AND it.tenant_id = c.tenant_id
                AND it.transaction_type = 'APPLICATION'
            WHERE c.farm_id = :farm_id AND c.tenant_id = :tid
              AND c.cycle_status IN ('COMPLETED', 'HARVESTING')
        """
        if production_id:
            q += " AND c.production_id = :production_id"
            params["production_id"] = production_id
        q += " GROUP BY c.cycle_id, c.cycle_name, p.production_name, p.production_id, c.start_date, c.end_date ORDER BY c.end_date DESC LIMIT :periods"
        result = await db.execute(text(q), params)
        rows = [dict(r) for r in result.mappings().all()]

        # Summary stats
        cokg_values = [float(r["cokg_fjd_per_kg"]) for r in rows if r["cokg_fjd_per_kg"]]
        summary = {
            "avg_cokg": round(sum(cokg_values) / len(cokg_values), 2) if cokg_values else None,
            "best_cokg": round(min(cokg_values), 2) if cokg_values else None,
            "worst_cokg": round(max(cokg_values), 2) if cokg_values else None,
            "cycles_analyzed": len(rows),
        }
        return {"data": rows, "summary": summary}

@router.get("/labor/{farm_id}")
async def get_labor_report(farm_id: str, days: int = 90, worker_id: str = None, user: dict = Depends(get_current_user)):
    """
    Labor cost analysis report.
    Shows per-worker hours, pay, and overtime breakdown over the period.
    """
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"farm_id": farm_id, "tid": str(user["tenant_id"]), "days": days}
        q = """
            SELECT
                w.worker_id, w.full_name AS worker_name, w.worker_type, w.daily_rate_fjd,
                COUNT(la.attendance_id) AS attendance_days,
                COALESCE(SUM(la.hours_worked), 0) AS total_hours,
                COALESCE(SUM(la.overtime_hours), 0) AS total_overtime_hours,
                COALESCE(SUM(la.total_pay_fjd), 0) AS total_pay_fjd,
                COALESCE(SUM(la.overtime_pay_fjd), 0) AS total_overtime_pay_fjd,
                COALESCE(SUM(la.total_pay_fjd + COALESCE(la.overtime_pay_fjd, 0)), 0) AS total_cost_fjd
            FROM tenant.workers w
            LEFT JOIN tenant.labor_attendance la ON la.worker_id = w.worker_id
                AND la.tenant_id = w.tenant_id
                AND la.farm_id = :farm_id
                AND la.work_date >= now() - interval '1 day' * :days
            WHERE w.tenant_id = :tid AND w.farm_id = :farm_id AND w.is_active = true
        """
        if worker_id:
            q += " AND w.worker_id = :worker_id"
            params["worker_id"] = worker_id
        q += " GROUP BY w.worker_id, w.full_name, w.worker_type, w.daily_rate_fjd ORDER BY total_cost_fjd DESC"
        result = await db.execute(text(q), params)
        rows = [dict(r) for r in result.mappings().all()]

        # Overall totals
        total_cost = sum(float(r["total_cost_fjd"]) for r in rows)
        total_hours = sum(float(r["total_hours"]) for r in rows)

        return {"data": rows, "summary": {
            "total_labor_cost_fjd": round(total_cost, 2),
            "total_hours_worked": round(total_hours, 2),
            "avg_cost_per_hour_fjd": round(total_cost / total_hours, 2) if total_hours > 0 else None,
            "worker_count": len(rows),
            "period_days": days,
        }}

@router.get("/harvest/{farm_id}")
async def get_harvest_report(farm_id: str, production_id: str = None, days: int = 180, user: dict = Depends(get_current_user)):
    """Harvest summary by production type and cycle."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"farm_id": farm_id, "tid": str(user["tenant_id"]), "days": days}
        q = """
            SELECT
                p.production_id, p.production_name, p.production_category,
                COUNT(h.harvest_id) AS harvest_events,
                COALESCE(SUM(h.total_weight_kg), 0) AS total_kg,
                COALESCE(AVG(h.total_weight_kg), 0) AS avg_kg_per_harvest,
                COALESCE(SUM(h.rejected_kg), 0) AS total_rejected_kg,
                ROUND(COALESCE(SUM(h.rejected_kg), 0) / NULLIF(COALESCE(SUM(h.total_weight_kg), 0), 0) * 100, 1) AS rejection_rate_pct
            FROM tenant.harvests h
            JOIN tenant.cycles c ON c.cycle_id = h.cycle_id
            JOIN shared.productions p ON p.production_id = c.production_id
            WHERE h.farm_id = :farm_id AND h.tenant_id = :tid
              AND h.harvest_date >= now() - interval '1 day' * :days
        """
        if production_id:
            q += " AND c.production_id = :production_id"
            params["production_id"] = production_id
        q += " GROUP BY p.production_id, p.production_name, p.production_category ORDER BY total_kg DESC"
        result = await db.execute(text(q), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/inputs/{farm_id}")
async def get_input_usage_report(farm_id: str, days: int = 90, user: dict = Depends(get_current_user)):
    """Input chemical usage and cost breakdown for compliance and cost analysis."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"farm_id": farm_id, "tid": str(user["tenant_id"]), "days": days}
        result = await db.execute(text("""
            SELECT
                i.input_id, i.input_name, i.input_category, i.active_ingredient,
                i.chemical_class, i.phi_days,
                COALESCE(SUM(it.quantity), 0) AS total_quantity_applied,
                i.unit AS unit,
                COALESCE(SUM(it.total_cost_fjd), 0) AS total_cost_fjd,
                COUNT(it.txn_id) AS application_count,
                MAX(it.transaction_date) AS last_applied
            FROM tenant.inputs i
            JOIN tenant.input_transactions it ON it.input_id = i.input_id AND it.tenant_id = i.tenant_id
                AND it.transaction_type = 'APPLICATION'
                AND it.farm_id = :farm_id
                AND it.transaction_date >= now() - interval '1 day' * :days
            WHERE i.tenant_id = :tid
            GROUP BY i.input_id, i.input_name, i.input_category, i.active_ingredient, i.chemical_class, i.phi_days, i.unit
            ORDER BY total_cost_fjd DESC
        """), params)
        return {"data": [dict(r) for r in result.mappings().all()]}
