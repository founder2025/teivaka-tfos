from fastapi import APIRouter, Depends
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
from typing import Optional
import uuid

router = APIRouter()

class LaborCreate(BaseModel):
    worker_id: str
    farm_id: str
    cycle_id: Optional[str] = None
    pu_id: Optional[str] = None
    work_date: datetime
    hours_worked: Decimal = Decimal("8")
    daily_rate_fjd: Decimal
    total_pay_fjd: Decimal
    task_description: Optional[str] = None
    overtime_hours: Decimal = Decimal("0")
    overtime_rate_fjd: Optional[Decimal] = None
    notes: Optional[str] = None
    idempotency_key: Optional[str] = None

@router.post("")
async def log_labor(body: LaborCreate, user: dict = Depends(get_current_user)):
    attendance_id = f"LAB-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        if body.idempotency_key:
            result = await db.execute(
                text("SELECT attendance_id FROM tenant.labor_attendance WHERE idempotency_key = :key LIMIT 1"),
                {"key": body.idempotency_key}
            )
            existing = result.mappings().first()
            if existing:
                return {"data": {"attendance_id": existing["attendance_id"], "duplicate": True}}

        overtime_pay = (body.overtime_hours * body.overtime_rate_fjd) if body.overtime_rate_fjd else Decimal("0")
        await db.execute(text("""
            INSERT INTO tenant.labor_attendance
                (attendance_id, work_date, tenant_id, worker_id, farm_id, cycle_id, pu_id,
                 hours_worked, daily_rate_fjd, total_pay_fjd, task_description,
                 overtime_hours, overtime_rate_fjd, overtime_pay_fjd, created_by, idempotency_key)
            VALUES
                (:attendance_id, :work_date, :tenant_id, :worker_id, :farm_id, :cycle_id, :pu_id,
                 :hours_worked, :daily_rate_fjd, :total_pay_fjd, :task_description,
                 :overtime_hours, :overtime_rate_fjd, :overtime_pay, :created_by, :idempotency_key)
        """), {
            "attendance_id": attendance_id, "work_date": body.work_date,
            "tenant_id": str(user["tenant_id"]), "worker_id": body.worker_id,
            "farm_id": body.farm_id, "cycle_id": body.cycle_id, "pu_id": body.pu_id,
            "hours_worked": body.hours_worked, "daily_rate_fjd": body.daily_rate_fjd,
            "total_pay_fjd": body.total_pay_fjd, "task_description": body.task_description,
            "overtime_hours": body.overtime_hours, "overtime_rate_fjd": body.overtime_rate_fjd,
            "overtime_pay": overtime_pay, "created_by": str(user["user_id"]),
            "idempotency_key": body.idempotency_key,
        })
    return {"data": {"attendance_id": attendance_id}}

@router.get("")
async def list_labor(farm_id: str = None, worker_id: str = None, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"])}
        q = """SELECT la.*, w.full_name AS worker_name
               FROM tenant.labor_attendance la
               JOIN tenant.workers w ON w.worker_id = la.worker_id
               WHERE la.tenant_id = :tid"""
        if farm_id:
            q += " AND la.farm_id = :farm_id"
            params["farm_id"] = farm_id
        if worker_id:
            q += " AND la.worker_id = :worker_id"
            params["worker_id"] = worker_id
        result = await db.execute(text(q + " ORDER BY la.work_date DESC LIMIT 100"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}
