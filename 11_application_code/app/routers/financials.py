from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()

@router.get("/farm/{farm_id}")
async def get_farm_pnl(farm_id: str, period_months: int = 12, user: dict = Depends(get_current_user)):
    """
    Returns P&L summary from the mv_farm_pnl materialized view.
    Includes monthly breakdown of income, labor costs, input costs, and net profit.
    """
    async with get_rls_db(str(user["tenant_id"])) as db:
        # Verify farm belongs to tenant
        farm_check = await db.execute(
            text("SELECT farm_id FROM tenant.farms WHERE farm_id = :farm_id AND tenant_id = :tid"),
            {"farm_id": farm_id, "tid": str(user["tenant_id"])}
        )
        if not farm_check.mappings().first():
            raise HTTPException(status_code=404, detail="Farm not found")

        # Aggregated totals over the REAL tables — this is the summary the
        # Decision Center / Reports rely on. Run it first so it always returns.
        totals = await db.execute(text("""
            SELECT
                COALESCE(SUM(il.net_amount_fjd), 0) AS total_income,
                COALESCE(SUM(la.total_pay_fjd + COALESCE(la.overtime_pay_fjd, 0)), 0) AS total_labor,
                COALESCE(SUM(it.total_cost_fjd), 0) AS total_inputs
            FROM tenant.farms f
            LEFT JOIN tenant.income_log il ON il.farm_id = f.farm_id AND il.tenant_id = f.tenant_id
                AND il.transaction_date >= now() - interval '12 months'
            LEFT JOIN tenant.labor_attendance la ON la.farm_id = f.farm_id AND la.tenant_id = f.tenant_id
                AND la.work_date >= now() - interval '12 months'
            LEFT JOIN tenant.input_transactions it ON it.farm_id = f.farm_id AND it.tenant_id = f.tenant_id
                AND it.transaction_date >= now() - interval '12 months'
                AND it.transaction_type = 'APPLICATION'
            WHERE f.farm_id = :farm_id AND f.tenant_id = :tid
        """), {"farm_id": farm_id, "tid": str(user["tenant_id"])})
        total_row = totals.mappings().first()

        # Monthly P&L from the materialized view (mv_farm_pnl). The MV may not
        # exist in prod (migration 004 MVs were stubbed). Isolate it in a
        # SAVEPOINT so a failure rolls back only this query — the summary above
        # still returns instead of 500'ing the endpoint (which blanks the
        # Decision Center cash signal). interval must use make_interval —
        # ':months' cannot bind inside a quoted string literal.
        monthly_rows = []
        try:
            async with db.begin_nested():
                monthly = await db.execute(text("""
                    SELECT month_year, total_income_fjd, total_labor_cost_fjd,
                           total_input_cost_fjd, total_other_cost_fjd,
                           gross_profit_fjd, net_profit_fjd, profit_margin_pct
                    FROM tenant.mv_farm_pnl
                    WHERE farm_id = :farm_id AND tenant_id = :tid
                      AND month_year >= date_trunc('month', now() - make_interval(months => :months))
                    ORDER BY month_year DESC
                """), {"farm_id": farm_id, "tid": str(user["tenant_id"]), "months": period_months})
                monthly_rows = [dict(r) for r in monthly.mappings().all()]
        except Exception:
            monthly_rows = []  # MV absent / not refreshed — summary still returns

        total_income = float(total_row["total_income"])
        total_labor = float(total_row["total_labor"])
        total_inputs = float(total_row["total_inputs"])
        net_profit = total_income - total_labor - total_inputs

        return {
            "data": {
                "farm_id": farm_id,
                "period_months": period_months,
                "summary": {
                    "total_income_fjd": round(total_income, 2),
                    "total_labor_cost_fjd": round(total_labor, 2),
                    "total_input_cost_fjd": round(total_inputs, 2),
                    "net_profit_fjd": round(net_profit, 2),
                    "profit_margin_pct": round((net_profit / total_income * 100) if total_income > 0 else 0, 2),
                },
                "monthly_breakdown": monthly_rows,
            }
        }

@router.get("/crops/{farm_id}")
async def get_crop_financials(farm_id: str, user: dict = Depends(get_current_user)):
    """Returns per-crop P&L breakdown for the farm across all completed cycles."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        farm_check = await db.execute(
            text("SELECT farm_id FROM tenant.farms WHERE farm_id = :farm_id AND tenant_id = :tid"),
            {"farm_id": farm_id, "tid": str(user["tenant_id"])}
        )
        if not farm_check.mappings().first():
            raise HTTPException(status_code=404, detail="Farm not found")

        # Per-cycle pre-aggregation (CTEs) so the four LEFT JOINs don't fan out
        # and inflate the SUMs. Real tables: production_cycles / harvest_log /
        # income_log / labor_attendance / input_transactions. CoKG = cost per kg
        # (labour + inputs) / harvested kg — cost only, matching the cycle detail.
        result = await db.execute(text("""
            WITH cyc AS (
                SELECT cycle_id, production_id
                FROM   tenant.production_cycles
                WHERE  farm_id = :farm_id AND tenant_id = :tid
                       AND cycle_status <> 'FAILED'
            ),
            inc AS (SELECT cycle_id, SUM(net_amount_fjd) AS v FROM tenant.income_log        WHERE tenant_id = :tid GROUP BY cycle_id),
            lab AS (SELECT cycle_id, SUM(total_pay_fjd)   AS v FROM tenant.labor_attendance  WHERE tenant_id = :tid GROUP BY cycle_id),
            inp AS (SELECT cycle_id, SUM(total_cost_fjd)  AS v FROM tenant.input_transactions WHERE tenant_id = :tid GROUP BY cycle_id),
            hrv AS (SELECT cycle_id, SUM(gross_yield_kg)  AS kg FROM tenant.harvest_log       WHERE tenant_id = :tid GROUP BY cycle_id)
            SELECT
                p.production_id,
                p.production_name,
                p.production_category,
                COUNT(cyc.cycle_id) AS total_cycles,
                COALESCE(SUM(inc.v), 0)  AS total_income_fjd,
                COALESCE(SUM(lab.v), 0)  AS total_labor_fjd,
                COALESCE(SUM(inp.v), 0)  AS total_input_cost_fjd,
                COALESCE(SUM(hrv.kg), 0) AS total_harvest_kg,
                CASE WHEN COALESCE(SUM(hrv.kg), 0) > 0
                     THEN (COALESCE(SUM(lab.v), 0) + COALESCE(SUM(inp.v), 0)) / SUM(hrv.kg)
                     ELSE NULL
                END AS cokg_fjd_per_kg
            FROM cyc
            JOIN      shared.productions p ON p.production_id = cyc.production_id
            LEFT JOIN inc ON inc.cycle_id = cyc.cycle_id
            LEFT JOIN lab ON lab.cycle_id = cyc.cycle_id
            LEFT JOIN inp ON inp.cycle_id = cyc.cycle_id
            LEFT JOIN hrv ON hrv.cycle_id = cyc.cycle_id
            GROUP BY p.production_id, p.production_name, p.production_category
            ORDER BY total_income_fjd DESC
        """), {"farm_id": farm_id, "tid": str(user["tenant_id"])})

        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/cokg/{farm_id}")
async def get_cokg_trend(farm_id: str, production_id: str = None, user: dict = Depends(get_current_user)):
    """Cost of Goods per Kg trend across cycles for a farm."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"farm_id": farm_id, "tid": str(user["tenant_id"])}
        q = """
            SELECT c.cycle_id, c.cycle_name, p.production_name, c.end_date,
                   COALESCE(SUM(h.total_weight_kg), 0) AS harvest_kg,
                   COALESCE(SUM(il.net_amount_fjd), 0) AS income_fjd,
                   COALESCE(SUM(la.total_pay_fjd), 0) AS labor_fjd,
                   COALESCE(SUM(it.total_cost_fjd), 0) AS input_fjd,
                   CASE WHEN COALESCE(SUM(h.total_weight_kg), 0) > 0
                        THEN (COALESCE(SUM(la.total_pay_fjd), 0) + COALESCE(SUM(it.total_cost_fjd), 0)) / SUM(h.total_weight_kg)
                        ELSE NULL
                   END AS cokg_fjd_per_kg
            FROM tenant.cycles c
            JOIN shared.productions p ON p.production_id = c.production_id
            LEFT JOIN tenant.harvests h ON h.cycle_id = c.cycle_id AND h.tenant_id = c.tenant_id
            LEFT JOIN tenant.income_log il ON il.cycle_id = c.cycle_id AND il.tenant_id = c.tenant_id
            LEFT JOIN tenant.labor_attendance la ON la.cycle_id = c.cycle_id AND la.tenant_id = c.tenant_id
            LEFT JOIN tenant.input_transactions it ON it.cycle_id = c.cycle_id AND it.tenant_id = c.tenant_id AND it.transaction_type = 'APPLICATION'
            WHERE c.farm_id = :farm_id AND c.tenant_id = :tid AND c.cycle_status = 'COMPLETED'
        """
        if production_id:
            q += " AND c.production_id = :production_id"
            params["production_id"] = production_id
        q += " GROUP BY c.cycle_id, c.cycle_name, p.production_name, c.end_date ORDER BY c.end_date DESC LIMIT 24"
        result = await db.execute(text(q), params)
        return {"data": [dict(r) for r in result.mappings().all()]}
