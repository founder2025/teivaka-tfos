import csv
import io
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()

def make_csv_response(rows: list, filename: str) -> Response:
    """Convert a list of dicts to a CSV response."""
    if not rows:
        content = ""
    else:
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
        content = output.getvalue()
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

@router.get("/cycles/{farm_id}.csv")
async def export_cycles_csv(farm_id: str, production_id: str = None, user: dict = Depends(get_current_user)):
    """
    Export all cycles for a farm as CSV.
    Includes cycle name, crop, dates, status, harvest kg, income, costs, and CoKG.
    """
    async with get_rls_db(str(user["tenant_id"])) as db:
        farm_check = await db.execute(
            text("SELECT farm_id, farm_name FROM tenant.farms WHERE farm_id = :farm_id AND tenant_id = :tid"),
            {"farm_id": farm_id, "tid": str(user["tenant_id"])}
        )
        farm = farm_check.mappings().first()
        if not farm:
            raise HTTPException(status_code=404, detail="Farm not found")

        params = {"farm_id": farm_id, "tid": str(user["tenant_id"])}
        # Real tables + per-cycle CTE pre-aggregation (no fan-out). production_cycles
        # has no cycle_name/start_date/end_date/area_m2/seedlings_count — use
        # farmer_label, planting_date, actual_harvest_end, planned_area_sqm.
        prod_filter = ""
        if production_id:
            prod_filter = " AND c.production_id = :production_id"
            params["production_id"] = production_id
        q = f"""
            WITH cyc AS (
                SELECT c.cycle_id, c.production_id, c.farmer_label, c.cycle_status,
                       c.planting_date AS start_date,
                       COALESCE(c.actual_harvest_end, c.expected_harvest_date) AS end_date,
                       c.planned_area_sqm, c.planned_yield_kg
                FROM tenant.production_cycles c
                WHERE c.farm_id = :farm_id AND c.tenant_id = :tid{prod_filter}
            ),
            hrv AS (SELECT cycle_id, SUM(gross_yield_kg) AS kg, SUM(waste_kg) AS waste FROM tenant.harvest_log WHERE tenant_id = :tid GROUP BY cycle_id),
            inc AS (SELECT cycle_id, SUM(net_amount_fjd) AS v FROM tenant.income_log WHERE tenant_id = :tid GROUP BY cycle_id),
            lab AS (SELECT cycle_id, SUM(total_pay_fjd + COALESCE(overtime_pay_fjd, 0)) AS v FROM tenant.labor_attendance WHERE tenant_id = :tid GROUP BY cycle_id),
            inp AS (SELECT cycle_id, SUM(total_cost_fjd) AS v FROM tenant.input_transactions WHERE tenant_id = :tid AND txn_type = 'USAGE' GROUP BY cycle_id)
            SELECT cyc.cycle_id,
                   COALESCE(cyc.farmer_label, p.production_name) AS cycle_name,
                   p.production_name, p.production_category,
                   cyc.start_date, cyc.end_date, cyc.cycle_status,
                   cyc.planned_area_sqm AS area_sqm, cyc.planned_yield_kg,
                   COALESCE(hrv.kg, 0)    AS harvest_kg,
                   COALESCE(hrv.waste, 0) AS rejected_kg,
                   COALESCE(inc.v, 0)     AS income_fjd,
                   COALESCE(lab.v, 0)     AS labor_cost_fjd,
                   COALESCE(inp.v, 0)     AS input_cost_fjd,
                   CASE WHEN COALESCE(hrv.kg, 0) > 0
                        THEN ROUND((COALESCE(lab.v, 0) + COALESCE(inp.v, 0)) / hrv.kg, 2)
                        ELSE NULL END AS cokg_fjd_per_kg
            FROM cyc
            JOIN      shared.productions p ON p.production_id = cyc.production_id
            LEFT JOIN hrv ON hrv.cycle_id = cyc.cycle_id
            LEFT JOIN inc ON inc.cycle_id = cyc.cycle_id
            LEFT JOIN lab ON lab.cycle_id = cyc.cycle_id
            LEFT JOIN inp ON inp.cycle_id = cyc.cycle_id
            ORDER BY cyc.start_date DESC
        """
        result = await db.execute(text(q), params)
        rows = [dict(r) for r in result.mappings().all()]

    farm_name = farm["farm_name"].replace(" ", "_")
    return make_csv_response(rows, f"{farm_name}_cycles.csv")

@router.get("/financials/{farm_id}.csv")
async def export_financials_csv(farm_id: str, days: int = 365, user: dict = Depends(get_current_user)):
    """
    Export financial transactions (income + expenses) for a farm as CSV.
    Useful for accountant handoff, FRA compliance, or external analysis.
    """
    async with get_rls_db(str(user["tenant_id"])) as db:
        farm_check = await db.execute(
            text("SELECT farm_id, farm_name FROM tenant.farms WHERE farm_id = :farm_id AND tenant_id = :tid"),
            {"farm_id": farm_id, "tid": str(user["tenant_id"])}
        )
        farm = farm_check.mappings().first()
        if not farm:
            raise HTTPException(status_code=404, detail="Farm not found")

        params = {"farm_id": farm_id, "tid": str(user["tenant_id"]), "days": days}

        # Income rows
        income_result = await db.execute(text("""
            SELECT
                transaction_date AS date,
                'INCOME' AS record_type,
                income_type AS sub_type,
                p.production_name AS description,
                quantity_kg,
                unit_price_fjd,
                gross_amount_fjd,
                discount_fjd,
                net_amount_fjd AS amount_fjd,
                payment_status,
                payment_method,
                cycle_id,
                notes
            FROM tenant.income_log il
            LEFT JOIN shared.productions p ON p.production_id = il.production_id
            WHERE il.farm_id = :farm_id AND il.tenant_id = :tid
              AND il.transaction_date >= now() - interval '1 day' * :days
            ORDER BY il.transaction_date DESC
        """), params)

        # Labor rows
        labor_result = await db.execute(text("""
            SELECT
                work_date AS date,
                'EXPENSE' AS record_type,
                'LABOR' AS sub_type,
                w.full_name AS description,
                hours_worked AS quantity_kg,
                daily_rate_fjd AS unit_price_fjd,
                total_pay_fjd AS gross_amount_fjd,
                overtime_pay_fjd AS discount_fjd,
                (total_pay_fjd + COALESCE(overtime_pay_fjd, 0)) AS amount_fjd,
                'PAID' AS payment_status,
                'CASH' AS payment_method,
                cycle_id,
                task_description AS notes
            FROM tenant.labor_attendance la
            JOIN tenant.workers w ON w.worker_id = la.worker_id
            WHERE la.farm_id = :farm_id AND la.tenant_id = :tid
              AND la.work_date >= now() - interval '1 day' * :days
            ORDER BY la.work_date DESC
        """), params)

        # Input purchase rows
        input_result = await db.execute(text("""
            SELECT
                transaction_date AS date,
                'EXPENSE' AS record_type,
                'INPUT_' || txn_type AS sub_type,
                i.input_name AS description,
                quantity AS quantity_kg,
                unit_cost_fjd AS unit_price_fjd,
                total_cost_fjd AS gross_amount_fjd,
                0 AS discount_fjd,
                total_cost_fjd AS amount_fjd,
                'PAID' AS payment_status,
                NULL AS payment_method,
                cycle_id,
                notes
            FROM tenant.input_transactions it
            JOIN tenant.inputs i ON i.input_id = it.input_id
            WHERE it.farm_id = :farm_id AND it.tenant_id = :tid
              AND it.txn_date >= now() - interval '1 day' * :days
              AND it.txn_type IN ('PURCHASE', 'APPLICATION')
            ORDER BY it.txn_date DESC
        """), params)

        rows = (
            [dict(r) for r in income_result.mappings().all()] +
            [dict(r) for r in labor_result.mappings().all()] +
            [dict(r) for r in input_result.mappings().all()]
        )
        rows.sort(key=lambda r: r["date"] if r["date"] else "", reverse=True)

    farm_name = farm["farm_name"].replace(" ", "_")
    return make_csv_response(rows, f"{farm_name}_financials_{days}d.csv")

@router.get("/labor/{farm_id}.csv")
async def export_labor_csv(farm_id: str, days: int = 90, user: dict = Depends(get_current_user)):
    """Export labor attendance records as CSV for payroll processing."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"farm_id": farm_id, "tid": str(user["tenant_id"]), "days": days}
        result = await db.execute(text("""
            SELECT
                la.attendance_id, la.work_date, w.full_name AS worker_name,
                w.worker_type, w.daily_rate_fjd AS contracted_rate_fjd,
                la.hours_worked, la.daily_rate_fjd AS paid_rate_fjd,
                la.total_pay_fjd, la.overtime_hours, la.overtime_rate_fjd,
                la.overtime_pay_fjd,
                (la.total_pay_fjd + COALESCE(la.overtime_pay_fjd, 0)) AS total_cost_fjd,
                la.task_description, la.cycle_id, la.pu_id, la.notes
            FROM tenant.labor_attendance la
            JOIN tenant.workers w ON w.worker_id = la.worker_id
            WHERE la.farm_id = :farm_id AND la.tenant_id = :tid
              AND la.work_date >= now() - interval '1 day' * :days
            ORDER BY la.work_date DESC, w.full_name
        """), params)
        rows = [dict(r) for r in result.mappings().all()]

    farm_id_clean = farm_id.replace("-", "_")
    return make_csv_response(rows, f"{farm_id_clean}_labor_{days}d.csv")

@router.get("/inputs/{farm_id}.csv")
async def export_inputs_csv(farm_id: str, days: int = 90, user: dict = Depends(get_current_user)):
    """Export input transactions as CSV for chemical compliance audit trail."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"farm_id": farm_id, "tid": str(user["tenant_id"]), "days": days}
        result = await db.execute(text("""
            SELECT
                it.txn_id, it.txn_date, it.txn_type,
                i.input_name, i.active_ingredient, i.chemical_class,
                i.registration_number AS chemical_registration, i.phi_days,
                it.quantity, i.unit, it.unit_cost_fjd, it.total_cost_fjd,
                it.batch_number, it.expiry_date, it.cycle_id, it.pu_id,
                it.notes
            FROM tenant.input_transactions it
            JOIN tenant.inputs i ON i.input_id = it.input_id
            WHERE it.farm_id = :farm_id AND it.tenant_id = :tid
              AND it.txn_date >= now() - interval '1 day' * :days
            ORDER BY it.txn_date DESC
        """), params)
        rows = [dict(r) for r in result.mappings().all()]

    farm_id_clean = farm_id.replace("-", "_")
    return make_csv_response(rows, f"{farm_id_clean}_inputs_{days}d.csv")
