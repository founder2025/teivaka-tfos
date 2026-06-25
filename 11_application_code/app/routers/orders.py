from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from app.core.audit_chain import emit_audit_event
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime, date
from typing import Optional, List
import uuid
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class OrderLineItem(BaseModel):
    production_id: str
    quantity_kg: Decimal
    unit_price_fjd: Decimal
    grade: str = "A"
    notes: Optional[str] = None

class OrderCreate(BaseModel):
    farm_id: str
    customer_id: str
    order_date: datetime
    delivery_date: Optional[datetime] = None
    delivery_address: Optional[str] = None
    line_items: List[OrderLineItem]
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    is_marketplace_sale: bool = False  # platform fee accrues only when true

@router.get("")
async def list_orders(
    farm_id: str = None,
    customer_id: str = None,
    order_status: str = None,
    user: dict = Depends(get_current_user),
):
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"])}
        q = """SELECT o.*, c.customer_name, c.customer_type, c.phone AS customer_phone
               FROM tenant.orders o
               JOIN tenant.customers c ON c.customer_id = o.customer_id
               WHERE o.tenant_id = :tid"""
        if farm_id:
            q += " AND o.farm_id = :farm_id"
            params["farm_id"] = farm_id
        if customer_id:
            q += " AND o.customer_id = :customer_id"
            params["customer_id"] = customer_id
        if order_status:
            q += " AND o.order_status = :order_status"
            params["order_status"] = order_status
        result = await db.execute(text(q + " ORDER BY o.order_date DESC LIMIT 100"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/{order_id}")
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("""SELECT o.*, c.customer_name FROM tenant.orders o
                    JOIN tenant.customers c ON c.customer_id = o.customer_id
                    WHERE o.order_id = :order_id AND o.tenant_id = :tid"""),
            {"order_id": order_id, "tid": str(user["tenant_id"])}
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Order not found")
        # Get line items
        items = await db.execute(
            text("SELECT oli.*, p.production_name FROM tenant.order_line_items oli JOIN shared.productions p ON p.production_id = oli.production_id WHERE oli.order_id = :order_id"),
            {"order_id": order_id}
        )
        return {"data": dict(row), "line_items": [dict(r) for r in items.mappings().all()]}

@router.post("")
async def create_order(body: OrderCreate, user: dict = Depends(get_current_user)):
    order_id = f"ORD-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
    total_amount = sum(item.quantity_kg * item.unit_price_fjd for item in body.line_items)

    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO tenant.orders
                (order_id, tenant_id, farm_id, customer_id, order_date, delivery_date,
                 delivery_address, total_amount_fjd, order_status, payment_method, notes,
                 is_marketplace_sale, created_by)
            VALUES
                (:order_id, :tenant_id, :farm_id, :customer_id, :order_date, :delivery_date,
                 :delivery_address, :total_amount_fjd, 'PENDING', :payment_method, :notes,
                 :is_marketplace_sale, :created_by)
        """), {
            "order_id": order_id,
            "tenant_id": str(user["tenant_id"]),
            "farm_id": body.farm_id,
            "customer_id": body.customer_id,
            "order_date": body.order_date,
            "delivery_date": body.delivery_date,
            "delivery_address": body.delivery_address,
            "total_amount_fjd": total_amount,
            "payment_method": body.payment_method,
            "notes": body.notes,
            "is_marketplace_sale": body.is_marketplace_sale,
            "created_by": str(user["user_id"]),
        })
        for item in body.line_items:
            line_id = f"OLI-{uuid.uuid4().hex[:6].upper()}"
            await db.execute(text("""
                INSERT INTO tenant.order_line_items
                    (line_id, order_id, tenant_id, production_id, quantity_kg, unit_price_fjd, line_total_fjd, grade, notes)
                VALUES
                    (:line_id, :order_id, :tenant_id, :production_id, :quantity_kg, :unit_price_fjd, :line_total, :grade, :notes)
            """), {
                "line_id": line_id,
                "order_id": order_id,
                "tenant_id": str(user["tenant_id"]),
                "production_id": item.production_id,
                "quantity_kg": item.quantity_kg,
                "unit_price_fjd": item.unit_price_fjd,
                "line_total": item.quantity_kg * item.unit_price_fjd,
                "grade": item.grade,
                "notes": item.notes,
            })
    return {"data": {"order_id": order_id, "total_amount_fjd": str(total_amount), "order_status": "PENDING"}}

@router.patch("/{order_id}/status")
async def update_order_status(order_id: str, order_status: str, notes: str = None, user: dict = Depends(get_current_user)):
    valid_statuses = ("PENDING", "CONFIRMED", "PICKING", "DISPATCHED", "DELIVERED", "CANCELLED", "INVOICED", "PAID")
    if order_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"order_status must be one of {valid_statuses}")
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("UPDATE tenant.orders SET order_status = :status, notes = COALESCE(:notes, notes), updated_at = now() WHERE order_id = :order_id AND tenant_id = :tid RETURNING order_id"),
            {"status": order_status, "notes": notes, "order_id": order_id, "tid": str(user["tenant_id"])}
        )
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Order not found")
    return {"data": {"order_id": order_id, "order_status": order_status}}


_PAYMENT_METHODS = ("CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CREDIT", "OTHER")


class PaymentCreate(BaseModel):
    amount_fjd: Decimal
    payment_date: Optional[date] = None
    payment_method: str = "CASH"
    reference: Optional[str] = None
    notes: Optional[str] = None


@router.post("/{order_id}/payment", status_code=201)
async def log_payment(order_id: str, body: PaymentCreate, user: dict = Depends(get_current_user)):
    """Record a buyer payment: a cash_ledger INCOME row (the money source-of-truth Bank
    Evidence reads) + mark the order PAID + a PAYMENT_RECEIVED audit row. Honest single
    source — no parallel payments table."""
    if body.payment_method not in _PAYMENT_METHODS:
        raise HTTPException(400, detail=f"payment_method must be one of {_PAYMENT_METHODS}")
    pay_date = body.payment_date or date.today()
    tid = str(user["tenant_id"])
    ledger_id = f"CL-{uuid.uuid4().hex[:10].upper()}"
    async with get_rls_db(tid) as db:
        order = (await db.execute(
            text("""SELECT o.order_id, o.farm_id, o.customer_id, o.net_amount_fjd, o.total_amount_fjd,
                           o.is_marketplace_sale, c.customer_name
                    FROM tenant.orders o JOIN tenant.customers c ON c.customer_id = o.customer_id
                    WHERE o.order_id = :oid AND o.tenant_id = :tid"""),
            {"oid": order_id, "tid": tid},
        )).mappings().first()
        if not order:
            raise HTTPException(404, detail="Order not found")

        await db.execute(
            text("""
                INSERT INTO tenant.cash_ledger (
                    ledger_id, tenant_id, farm_id, transaction_date,
                    transaction_type, category, description, amount_fjd,
                    payment_method, reference_id, reference_type, created_by
                ) VALUES (
                    :ledger_id, :tid, :farm_id, :tdate,
                    'INCOME', 'SALES', :descr, :amount,
                    :method, :order_id, 'ORDER', :uid
                )
            """),
            {
                "ledger_id": ledger_id, "tid": tid, "farm_id": order["farm_id"], "tdate": pay_date,
                "descr": f"Payment from {order['customer_name']} · order {order_id}" + (f" · {body.reference}" if body.reference else ""),
                "amount": body.amount_fjd, "method": body.payment_method, "order_id": order_id, "uid": str(user["user_id"]),
            },
        )
        await db.execute(
            text("UPDATE tenant.orders SET order_status = 'PAID', updated_at = now() WHERE order_id = :oid AND tenant_id = :tid"),
            {"oid": order_id, "tid": tid},
        )
        event_id, this_hash = await emit_audit_event(
            db=db, tenant_id=user["tenant_id"], actor_user_id=user["user_id"],
            event_type="PAYMENT_RECEIVED", entity_type="ORDER", entity_id=order_id,
            payload={
                "order_id": order_id, "customer_id": order["customer_id"], "ledger_id": ledger_id,
                "amount_fjd": str(body.amount_fjd), "payment_method": body.payment_method,
                "payment_date": pay_date.isoformat(),
            },
        )
        # Marketplace transaction fee — accrue a platform receivable on the
        # payment, but ONLY for flagged marketplace sales. Best-effort: a fee
        # failure must never block the farmer's payment record.
        fee = None
        if order["is_marketplace_sale"]:
            try:
                from app.routers.marketplace_fees import accrue_marketplace_fee
                fee = await accrue_marketplace_fee(
                    db, tenant_id=tid, order_id=order_id,
                    category=(order.get("marketplace_category") or "PRODUCE"),
                    gross_amount_fjd=body.amount_fjd, source_ledger_id=ledger_id)
            except Exception as e:  # noqa: BLE001
                logger.warning("marketplace fee accrual failed for %s: %s", order_id, e)
    return {"data": {"order_id": order_id, "order_status": "PAID", "ledger_id": ledger_id,
                     "audit_hash": this_hash,
                     "marketplace_fee_fjd": (str(fee["fee_amount_fjd"]) if fee else None)}}
