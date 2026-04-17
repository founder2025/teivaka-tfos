from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
from typing import Optional
import uuid

router = APIRouter()

class ProfitShareCalculateRequest(BaseModel):
    farm_id: str
    notes: Optional[str] = None

@router.get("")
async def list_profit_share(farm_id: str = None, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"])}
        q = """SELECT ps.*, c.cycle_name, c.production_id, p.production_name
               FROM tenant.profit_share_records ps
               JOIN tenant.cycles c ON c.cycle_id = ps.cycle_id
               LEFT JOIN shared.productions p ON p.production_id = c.production_id
               WHERE ps.tenant_id = :tid"""
        if farm_id:
            q += " AND ps.farm_id = :farm_id"
            params["farm_id"] = farm_id
        result = await db.execute(text(q + " ORDER BY ps.calculated_at DESC LIMIT 50"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.post("/calculate/{cycle_id}")
async def calculate_profit_share(cycle_id: str, body: ProfitShareCalculateRequest, user: dict = Depends(get_current_user)):
    """
    Calculates profit share for a completed cycle.
    Formula: Net Revenue - Direct Costs - Overhead Allocation = Net Profit
    Distributed by worker contribution hours as a percentage of total labor hours.
    """
    async with get_rls_db(str(user["tenant_id"])) as db:
        # Get cycle details
        cycle_result = await db.execute(
            text("SELECT * FROM tenant.cycles WHERE cycle_id = :cycle_id AND tenant_id = :tid"),
            {"cycle_id": cycle_id, "tid": str(user["tenant_id"])}
        )
        cycle = cycle_result.mappings().first()
        if not cycle:
            raise HTTPException(status_code=404, detail="Cycle not found")

        # Get total income for cycle
        income_result = await db.execute(
            text("SELECT COALESCE(SUM(net_amount_fjd), 0) AS total_income FROM tenant.income_log WHERE cycle_id = :cycle_id AND tenant_id = :tid"),
            {"cycle_id": cycle_id, "tid": str(user["tenant_id"])}
        )
        total_income = income_result.mappings().first()["total_income"]

        # Get total costs: labor + inputs
        labor_result = await db.execute(
            text("SELECT COALESCE(SUM(total_pay_fjd + COALESCE(overtime_pay_fjd, 0)), 0) AS total_labor FROM tenant.labor_attendance WHERE cycle_id = :cycle_id AND tenant_id = :tid"),
            {"cycle_id": cycle_id, "tid": str(user["tenant_id"])}
        )
        total_labor = labor_result.mappings().first()["total_labor"]

        input_result = await db.execute(
            text("SELECT COALESCE(SUM(total_cost_fjd), 0) AS total_inputs FROM tenant.input_transactions WHERE cycle_id = :cycle_id AND transaction_type = 'APPLICATION' AND tenant_id = :tid"),
            {"cycle_id": cycle_id, "tid": str(user["tenant_id"])}
        )
        total_inputs = input_result.mappings().first()["total_inputs"]

        net_profit = Decimal(str(total_income)) - Decimal(str(total_labor)) - Decimal(str(total_inputs))

        # Get per-worker hours breakdown
        worker_hours = await db.execute(
            text("""SELECT worker_id, SUM(hours_worked + COALESCE(overtime_hours, 0)) AS total_hours
                    FROM tenant.labor_attendance
                    WHERE cycle_id = :cycle_id AND tenant_id = :tid
                    GROUP BY worker_id"""),
            {"cycle_id": cycle_id, "tid": str(user["tenant_id"])}
        )
        workers = worker_hours.mappings().all()
        total_hours = sum(Decimal(str(w["total_hours"])) for w in workers)

        # Calculate 20% of net profit goes to worker pool (remaining 80% to farm owner)
        worker_pool = net_profit * Decimal("0.20") if net_profit > 0 else Decimal("0")
        shares = []
        for w in workers:
            worker_hours_share = Decimal(str(w["total_hours"])) / total_hours if total_hours > 0 else Decimal("0")
            worker_share = worker_pool * worker_hours_share
            shares.append({"worker_id": w["worker_id"], "hours": str(w["total_hours"]), "share_fjd": str(worker_share.quantize(Decimal("0.01")))})

        record_id = f"PSR-{uuid.uuid4().hex[:6].upper()}"
        await db.execute(text("""
            INSERT INTO tenant.profit_share_records
                (record_id, tenant_id, cycle_id, farm_id, total_income_fjd, total_labor_fjd,
                 total_input_cost_fjd, net_profit_fjd, worker_pool_fjd, calculated_at, notes, created_by)
            VALUES
                (:record_id, :tenant_id, :cycle_id, :farm_id, :total_income, :total_labor,
                 :total_inputs, :net_profit, :worker_pool, now(), :notes, :created_by)
        """), {
            "record_id": record_id,
            "tenant_id": str(user["tenant_id"]),
            "cycle_id": cycle_id,
            "farm_id": body.farm_id,
            "total_income": total_income,
            "total_labor": total_labor,
            "total_inputs": total_inputs,
            "net_profit": net_profit,
            "worker_pool": worker_pool,
            "notes": body.notes,
            "created_by": str(user["user_id"]),
        })

    return {"data": {
        "record_id": record_id,
        "cycle_id": cycle_id,
        "total_income_fjd": str(total_income),
        "total_labor_fjd": str(total_labor),
        "total_input_cost_fjd": str(total_inputs),
        "net_profit_fjd": str(net_profit),
        "worker_pool_fjd": str(worker_pool),
        "worker_shares": shares,
    }}
