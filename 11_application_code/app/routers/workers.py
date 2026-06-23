from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from app.core.audit_chain import emit_audit_event
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
from typing import Optional
import uuid

router = APIRouter()

class WorkerCreate(BaseModel):
    farm_id: str
    full_name: str
    contact_number: Optional[str] = None
    whatsapp_number: Optional[str] = None
    id_type: Optional[str] = None  # FJ_PASSPORT, FJ_NATIONAL_ID, WORK_PERMIT
    id_number: Optional[str] = None
    daily_rate_fjd: Decimal
    worker_type: str = "CASUAL"  # DB CHECK: PERMANENT | CASUAL | CONTRACT | FAMILY
    start_date: Optional[datetime] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    next_of_kin_name: Optional[str] = None
    next_of_kin_contact: Optional[str] = None
    notes: Optional[str] = None

@router.get("")
async def list_workers(farm_id: str = None, worker_type: str = None, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"])}
        q = """SELECT w.worker_id, w.full_name, w.phone AS contact_number, w.whatsapp_number,
                      w.daily_rate_fjd, w.worker_type, w.farm_id, w.is_active,
                      w.start_date, w.end_date
               FROM tenant.workers w
               WHERE w.tenant_id = :tid AND w.is_active = true"""
        if farm_id:
            q += " AND w.farm_id = :farm_id"
            params["farm_id"] = farm_id
        if worker_type:
            q += " AND w.worker_type = :worker_type"
            params["worker_type"] = worker_type
        result = await db.execute(text(q + " ORDER BY w.full_name"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/{worker_id}")
async def get_worker(worker_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("SELECT * FROM tenant.workers WHERE worker_id = :worker_id AND tenant_id = :tid"),
            {"worker_id": worker_id, "tid": str(user["tenant_id"])}
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Worker not found")
        return {"data": dict(row)}

@router.post("")
async def create_worker(body: WorkerCreate, user: dict = Depends(get_current_user)):
    # FOUNDER or MANAGER can create workers
    if user["role"] not in ("FOUNDER", "MANAGER", "AGRONOMIST"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions to create workers")

    # Normalise worker_type onto the DB CHECK set (PERMANENT|CASUAL|CONTRACT|
    # FAMILY). Legacy/UI aliases are mapped rather than 500'd on the constraint.
    _WT = {"PERMANENT": "PERMANENT", "CASUAL": "CASUAL", "CONTRACT": "CONTRACT",
           "FAMILY": "FAMILY", "CONTRACTOR": "CONTRACT", "SEASONAL": "CASUAL"}
    worker_type = _WT.get((body.worker_type or "").upper())
    if worker_type is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"worker_type must be one of {sorted(set(_WT.values()))}",
        )

    worker_id = f"WRK-{uuid.uuid4().hex[:6].upper()}"
    # Map request fields onto the real tenant.workers columns. The table has
    # phone / emergency_contact (no contact_number / id_* / bank_* / next_of_kin_*
    # / created_by columns) — writing those previously 500'd the endpoint.
    emergency_contact = " — ".join(
        x for x in (body.next_of_kin_name, body.next_of_kin_contact) if x
    ) or None
    start_date = body.start_date.date() if body.start_date else None
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO tenant.workers
                (worker_id, tenant_id, farm_id, full_name, worker_type,
                 daily_rate_fjd, phone, whatsapp_number, emergency_contact,
                 start_date, notes)
            VALUES
                (:worker_id, :tenant_id, :farm_id, :full_name, :worker_type,
                 :daily_rate_fjd, :phone, :whatsapp_number, :emergency_contact,
                 :start_date, :notes)
        """), {
            "worker_id": worker_id,
            "tenant_id": str(user["tenant_id"]),
            "farm_id": body.farm_id,
            "full_name": body.full_name,
            "worker_type": worker_type,
            "daily_rate_fjd": body.daily_rate_fjd,
            "phone": body.contact_number,
            "whatsapp_number": body.whatsapp_number,
            "emergency_contact": emergency_contact,
            "start_date": start_date,
            "notes": body.notes,
        })
        # One add -> one audit row (Universal Event Form Contract). Same txn as the INSERT.
        await emit_audit_event(
            db=db,
            tenant_id=uuid.UUID(str(user["tenant_id"])),
            actor_user_id=uuid.UUID(str(user["user_id"])),
            event_type="WORKER_ADDED",
            entity_type="worker",
            entity_id=worker_id,
            payload={
                "worker_id": worker_id,
                "farm_id": body.farm_id,
                "full_name": body.full_name,
                "worker_type": worker_type,
            },
        )
    return {"data": {"worker_id": worker_id, "full_name": body.full_name, "daily_rate_fjd": str(body.daily_rate_fjd)}}

@router.patch("/{worker_id}/rate")
async def update_worker_rate(worker_id: str, daily_rate_fjd: Decimal, user: dict = Depends(get_current_user)):
    if user["role"] not in ("FOUNDER", "MANAGER"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only FOUNDER or MANAGER can update rates")
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(
            text("UPDATE tenant.workers SET daily_rate_fjd = :rate, updated_at = now() WHERE worker_id = :worker_id AND tenant_id = :tid"),
            {"rate": daily_rate_fjd, "worker_id": worker_id, "tid": str(user["tenant_id"])}
        )
    return {"data": {"worker_id": worker_id, "daily_rate_fjd": str(daily_rate_fjd)}}


_WORKER_TYPES = {"PERMANENT", "CASUAL", "CONTRACT", "FAMILY"}


class WorkerPatch(BaseModel):
    full_name: Optional[str] = None
    worker_type: Optional[str] = None
    daily_rate_fjd: Optional[Decimal] = None
    contact_number: Optional[str] = None   # → phone column
    whatsapp_number: Optional[str] = None


@router.patch("/{worker_id}")
async def update_worker(worker_id: str, body: WorkerPatch, user: dict = Depends(get_current_user)):
    """Correct a worker's details (name, type, rate, contacts)."""
    sent = body.model_dump(exclude_unset=True)
    if "worker_type" in sent and sent["worker_type"] not in _WORKER_TYPES:
        raise HTTPException(400, detail=f"worker_type must be one of {sorted(_WORKER_TYPES)}")
    # map API field → DB column
    colmap = {"full_name": "full_name", "worker_type": "worker_type", "daily_rate_fjd": "daily_rate_fjd",
              "contact_number": "phone", "whatsapp_number": "whatsapp_number"}
    updates = {colmap[k]: v for k, v in sent.items() if k in colmap}
    if not updates:
        raise HTTPException(400, detail="No fields to update")
    cols = ", ".join(f"{k} = :{k}" for k in updates)
    params = {**updates, "wid": worker_id, "tid": str(user["tenant_id"])}
    async with get_rls_db(str(user["tenant_id"])) as db:
        r = await db.execute(text(f"UPDATE tenant.workers SET {cols}, updated_at = now() WHERE worker_id = :wid AND tenant_id = :tid RETURNING worker_id"), params)
        if not r.first():
            raise HTTPException(404, detail="Worker not found")
    return {"data": {"worker_id": worker_id}}
