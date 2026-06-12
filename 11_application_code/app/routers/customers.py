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

class CustomerCreate(BaseModel):
    customer_name: str
    customer_type: str = "MARKET_VENDOR"  # MARKET_VENDOR, HOTEL, RESTAURANT, SUPERMARKET, EXPORT, INDIVIDUAL
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    island: Optional[str] = None
    market_location: Optional[str] = None  # e.g. SUVA_MUNICIPAL, NAUSORI, LAUTOKA
    tin_number: Optional[str] = None
    credit_limit_fjd: Optional[str] = None
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
    customer_id = f"CST-{uuid.uuid4().hex[:6].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO tenant.customers
                (customer_id, tenant_id, customer_name, customer_type, contact_person,
                 phone, email, address, island, market_location, tin_number,
                 credit_limit_fjd, payment_terms_days, notes, created_by)
            VALUES
                (:customer_id, :tenant_id, :customer_name, :customer_type, :contact_person,
                 :phone, :email, :address, :island, :market_location, :tin_number,
                 :credit_limit_fjd, :payment_terms_days, :notes, :created_by)
        """), {
            "customer_id": customer_id,
            "tenant_id": str(user["tenant_id"]),
            "customer_name": body.customer_name,
            "customer_type": body.customer_type,
            "contact_person": body.contact_person,
            "phone": body.phone,
            "email": body.email,
            "address": body.address,
            "island": body.island,
            "market_location": body.market_location,
            "tin_number": body.tin_number,
            "credit_limit_fjd": body.credit_limit_fjd,
            "payment_terms_days": body.payment_terms_days,
            "notes": body.notes,
            "created_by": str(user["user_id"]),
        })
    return {"data": {"customer_id": customer_id, "customer_name": body.customer_name}}


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
