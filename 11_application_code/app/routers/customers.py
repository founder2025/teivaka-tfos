from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from app.core.audit_chain import emit_audit_event
from pydantic import BaseModel
from typing import Optional
from datetime import date
import uuid

router = APIRouter()

VALID_CUSTOMER_TYPES = {
    "DIRECT", "WHOLESALE", "RESTAURANT", "SUPERMARKET", "EXPORT", "RELATED_PARTY",
    "HOTEL", "MUNICIPAL", "COOP", "ROADSIDE", "INDIVIDUAL",
}


class CustomerCreate(BaseModel):
    customer_name: str
    customer_type: str = "DIRECT"
    contact_name: Optional[str] = None
    contact_role: Optional[str] = None
    phone: Optional[str] = None
    whatsapp_number: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    island: Optional[str] = None  # city / island
    distance_km: Optional[float] = None
    preferred_channel: Optional[str] = None
    ferry_dependent: bool = False
    payment_terms_days: int = 0  # 0 = cash on delivery
    notes: Optional[str] = None

@router.get("")
async def list_customers(customer_type: str = None, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"])}
        q = "SELECT * FROM tenant.customers WHERE tenant_id = :tid AND is_active = true"
        if customer_type:
            q += " AND customer_type = :customer_type"
            params["customer_type"] = customer_type
        result = await db.execute(text(q + " ORDER BY customer_name"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/{customer_id}")
async def get_customer(customer_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("SELECT * FROM tenant.customers WHERE customer_id = :customer_id AND tenant_id = :tid"),
            {"customer_id": customer_id, "tid": str(user["tenant_id"])}
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Customer not found")
        return {"data": dict(row)}

@router.post("")
async def create_customer(body: CustomerCreate, user: dict = Depends(get_current_user)):
    import uuid
    if body.customer_type not in VALID_CUSTOMER_TYPES:
        raise HTTPException(status_code=400, detail=f"customer_type must be one of {sorted(VALID_CUSTOMER_TYPES)}")
    if not body.customer_name.strip():
        raise HTTPException(status_code=400, detail="customer_name is required")
    customer_id = f"CST-{uuid.uuid4().hex[:6].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO tenant.customers
                (customer_id, tenant_id, customer_name, customer_type, contact_name, contact_role,
                 phone, whatsapp_number, email, address, island, distance_km,
                 preferred_channel, ferry_dependent, payment_terms_days, notes)
            VALUES
                (:customer_id, :tenant_id, :customer_name, :customer_type, :contact_name, :contact_role,
                 :phone, :whatsapp_number, :email, :address, :island, :distance_km,
                 :preferred_channel, :ferry_dependent, :payment_terms_days, :notes)
        """), {
            "customer_id": customer_id,
            "tenant_id": str(user["tenant_id"]),
            "customer_name": body.customer_name.strip(),
            "customer_type": body.customer_type,
            "contact_name": body.contact_name,
            "contact_role": body.contact_role,
            "phone": body.phone,
            "whatsapp_number": body.whatsapp_number,
            "email": body.email,
            "address": body.address,
            "island": body.island,
            "distance_km": body.distance_km,
            "preferred_channel": body.preferred_channel,
            "ferry_dependent": body.ferry_dependent,
            "payment_terms_days": body.payment_terms_days,
            "notes": body.notes,
        })
        # One add -> one audit row (Universal Event Form Contract). Same txn as the INSERT.
        await emit_audit_event(
            db=db,
            tenant_id=uuid.UUID(str(user["tenant_id"])),
            actor_user_id=uuid.UUID(str(user["user_id"])),
            event_type="BUYER_ADDED",
            entity_type="customer",
            entity_id=customer_id,
            payload={
                "customer_id": customer_id,
                "customer_name": body.customer_name.strip(),
                "customer_type": body.customer_type,
                "phone": body.phone,
            },
        )
    return {"data": {"customer_id": customer_id, "customer_name": body.customer_name.strip()}}


class CustomerPatch(BaseModel):
    customer_name: Optional[str] = None
    customer_type: Optional[str] = None
    contact_name: Optional[str] = None
    contact_role: Optional[str] = None
    phone: Optional[str] = None
    whatsapp_number: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    island: Optional[str] = None
    distance_km: Optional[float] = None
    preferred_channel: Optional[str] = None
    ferry_dependent: Optional[bool] = None
    payment_terms_days: Optional[int] = None
    notes: Optional[str] = None


@router.patch("/{customer_id}")
async def update_customer(customer_id: str, body: CustomerPatch, user: dict = Depends(get_current_user)):
    """Correct a buyer's details. Partial — only sent fields change."""
    updates = body.model_dump(exclude_unset=True)
    if "customer_type" in updates and updates["customer_type"] not in VALID_CUSTOMER_TYPES:
        raise HTTPException(400, detail=f"customer_type must be one of {sorted(VALID_CUSTOMER_TYPES)}")
    if "customer_name" in updates and not (updates["customer_name"] or "").strip():
        raise HTTPException(400, detail="customer_name cannot be empty")
    if not updates:
        raise HTTPException(400, detail="No fields to update")
    cols = ", ".join(f"{k} = :{k}" for k in updates)
    params = {**updates, "cid": customer_id, "tid": str(user["tenant_id"])}
    async with get_rls_db(str(user["tenant_id"])) as db:
        r = await db.execute(text(f"UPDATE tenant.customers SET {cols}, updated_at = now() WHERE customer_id = :cid AND tenant_id = :tid RETURNING customer_id"), params)
        if not r.first():
            raise HTTPException(404, detail="Customer not found")
    return {"data": {"customer_id": customer_id}}


_CHANNELS = ("whatsapp", "call", "visit", "email", "sms")
_DIRECTIONS = ("inbound", "outbound")


class CommunicationCreate(BaseModel):
    comm_date: Optional[date] = None
    comm_time: Optional[str] = None
    channel: str = "whatsapp"
    direction: str = "outbound"
    topic: Optional[str] = None
    notes: Optional[str] = None


@router.get("/{customer_id}/communications")
async def list_communications(customer_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        rows = await db.execute(
            text("""SELECT communication_id, customer_id, comm_date, comm_time, channel, direction, topic, notes, created_at
                    FROM tenant.buyer_communications
                    WHERE customer_id = :cid AND tenant_id = :tid
                    ORDER BY comm_date DESC, comm_time DESC NULLS LAST, created_at DESC"""),
            {"cid": customer_id, "tid": str(user["tenant_id"])},
        )
        return {"data": [dict(r) for r in rows.mappings().all()]}


@router.post("/{customer_id}/communications", status_code=201)
async def log_communication(customer_id: str, body: CommunicationCreate, user: dict = Depends(get_current_user)):
    if body.channel not in _CHANNELS:
        raise HTTPException(400, detail=f"channel must be one of {_CHANNELS}")
    if body.direction not in _DIRECTIONS:
        raise HTTPException(400, detail=f"direction must be one of {_DIRECTIONS}")
    tid = str(user["tenant_id"])
    comm_id = f"COM-{uuid.uuid4().hex[:10].upper()}"
    cdate = body.comm_date or date.today()
    async with get_rls_db(tid) as db:
        cust = await db.execute(
            text("SELECT customer_name FROM tenant.customers WHERE customer_id = :cid AND tenant_id = :tid"),
            {"cid": customer_id, "tid": tid},
        )
        if not cust.first():
            raise HTTPException(404, detail="Customer not found")
        await db.execute(
            text("""INSERT INTO tenant.buyer_communications
                        (communication_id, tenant_id, customer_id, comm_date, comm_time, channel, direction, topic, notes, created_by)
                    VALUES (:id, :tid, :cid, :d, :t, :ch, :dir, :topic, :notes, :uid)"""),
            {"id": comm_id, "tid": tid, "cid": customer_id, "d": cdate, "t": body.comm_time,
             "ch": body.channel, "dir": body.direction, "topic": body.topic, "notes": body.notes, "uid": str(user["user_id"])},
        )
        event_id, this_hash = await emit_audit_event(
            db=db, tenant_id=user["tenant_id"], actor_user_id=user["user_id"],
            event_type="COMMUNICATION_LOGGED", entity_type="CUSTOMER", entity_id=customer_id,
            payload={"communication_id": comm_id, "customer_id": customer_id, "channel": body.channel,
                     "direction": body.direction, "topic": body.topic, "comm_date": cdate.isoformat()},
        )
    return {"data": {"communication_id": comm_id, "audit_hash": this_hash}}
