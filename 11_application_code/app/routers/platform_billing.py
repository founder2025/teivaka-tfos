"""Platform billing — turn accrued platform fees into collectible invoices.

Two receivables roll up per billing account (tenant):
  • marketplace fees  (community.marketplace_fee_ledger, status ACCRUED)
  • sponsor placements (community.sponsor_placements, payment_status UNPAID)

An invoice groups a tenant's outstanding charges; generating one marks the source
rows INVOICED + stamps invoice_id, paying flips them to PAID, voiding releases
them. All endpoints are FOUNDER/ADMIN only and operate on the platform-level
community.* tables (no tenant RLS).

Routes (mounted at /api/v1):
  GET   /admin/billing/outstanding            per-account uninvoiced totals
  GET   /admin/billing/invoices               list invoices (?status=)
  GET   /admin/billing/invoices/{id}          invoice + lines
  POST  /admin/billing/invoices/generate      build an invoice for a tenant
  POST  /admin/billing/invoices/{id}/send     DRAFT -> SENT
  POST  /admin/billing/invoices/{id}/pay      -> PAID (flips source rows)
  POST  /admin/billing/invoices/{id}/void     -> VOID (releases source rows)
"""
import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from pydantic import BaseModel

from app.db.session import get_db_ctx
from app.middleware.rls import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)
_ADMIN = {"ADMIN", "FOUNDER"}


def _require_admin(user: dict):
    if user.get("role") not in _ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")


def _f(v):
    return float(v) if v is not None else 0.0


@router.get("/admin/billing/outstanding")
async def outstanding(user: dict = Depends(get_current_user)):
    """Per-account uninvoiced charges: accrued marketplace fees + unpaid sponsor
    placements, grouped by tenant."""
    _require_admin(user)
    async with get_db_ctx() as db:
        rows = (await db.execute(text("""
            WITH mf AS (
                SELECT tenant_id, SUM(fee_amount_fjd) AS amt, COUNT(*) AS cnt
                FROM community.marketplace_fee_ledger
                WHERE status='ACCRUED' AND invoice_id IS NULL
                GROUP BY tenant_id
            ),
            sp AS (
                SELECT u.tenant_id, SUM(p.price_fjd) AS amt, COUNT(*) AS cnt
                FROM community.sponsor_placements p
                JOIN tenant.users u ON u.user_id = p.owner_user_id
                WHERE p.payment_status='UNPAID' AND p.invoice_id IS NULL
                  AND p.price_fjd IS NOT NULL
                GROUP BY u.tenant_id
            )
            SELECT t.tenant_id, t.company_name AS account_label,
                   COALESCE(mf.amt,0) AS marketplace_fjd, COALESCE(mf.cnt,0) AS fee_count,
                   COALESCE(sp.amt,0) AS sponsor_fjd,      COALESCE(sp.cnt,0) AS sponsor_count,
                   COALESCE(mf.amt,0) + COALESCE(sp.amt,0) AS total_fjd
            FROM tenant.tenants t
            LEFT JOIN mf ON mf.tenant_id = t.tenant_id
            LEFT JOIN sp ON sp.tenant_id = t.tenant_id
            WHERE COALESCE(mf.amt,0) + COALESCE(sp.amt,0) > 0
            ORDER BY total_fjd DESC
        """))).mappings().all()
    return {"data": [{
        "tenant_id": str(r["tenant_id"]), "account_label": r["account_label"],
        "marketplace_fjd": _f(r["marketplace_fjd"]), "fee_count": r["fee_count"],
        "sponsor_fjd": _f(r["sponsor_fjd"]), "sponsor_count": r["sponsor_count"],
        "total_fjd": _f(r["total_fjd"]),
    } for r in rows]}


@router.get("/admin/billing/invoices")
async def list_invoices(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    _require_admin(user)
    async with get_db_ctx() as db:
        q = ("SELECT invoice_id, tenant_id, account_label, status, total_fjd, currency, "
             "due_date, issued_at, sent_at, paid_at, payment_ref FROM community.platform_invoices ")
        params = {}
        if status:
            q += "WHERE status = :s "
            params["s"] = status.upper()
        q += "ORDER BY issued_at DESC LIMIT 200"
        rows = (await db.execute(text(q), params)).mappings().all()
    return {"data": [{**dict(r), "tenant_id": str(r["tenant_id"]), "total_fjd": _f(r["total_fjd"])} for r in rows]}


@router.get("/admin/billing/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    _require_admin(user)
    async with get_db_ctx() as db:
        inv = (await db.execute(text(
            "SELECT * FROM community.platform_invoices WHERE invoice_id = :i"),
            {"i": invoice_id})).mappings().first()
        if not inv:
            raise HTTPException(status_code=404, detail="Invoice not found")
        lines = (await db.execute(text(
            "SELECT source_type, source_id, description, amount_fjd "
            "FROM community.platform_invoice_lines WHERE invoice_id = :i ORDER BY id"),
            {"i": invoice_id})).mappings().all()
    return {"data": {
        "invoice": {**dict(inv), "tenant_id": str(inv["tenant_id"]),
                    "subtotal_fjd": _f(inv["subtotal_fjd"]), "total_fjd": _f(inv["total_fjd"])},
        "lines": [{**dict(l), "amount_fjd": _f(l["amount_fjd"])} for l in lines],
    }}


class GenerateInvoice(BaseModel):
    tenant_id: str
    due_days: int = 14
    note: Optional[str] = None


@router.post("/admin/billing/invoices/generate")
async def generate_invoice(body: GenerateInvoice, user: dict = Depends(get_current_user)):
    _require_admin(user)
    tid = body.tenant_id
    async with get_db_ctx() as db:
        fees = (await db.execute(text("""
            SELECT id, category, order_id, fee_pct, fee_amount_fjd
            FROM community.marketplace_fee_ledger
            WHERE tenant_id = cast(:t AS uuid) AND status='ACCRUED' AND invoice_id IS NULL
            ORDER BY created_at
        """), {"t": tid})).mappings().all()
        sponsors = (await db.execute(text("""
            SELECT p.placement_id, p.title, p.billing_period, p.price_fjd
            FROM community.sponsor_placements p
            JOIN tenant.users u ON u.user_id = p.owner_user_id
            WHERE u.tenant_id = cast(:t AS uuid) AND p.payment_status='UNPAID'
              AND p.invoice_id IS NULL AND p.price_fjd IS NOT NULL
            ORDER BY p.created_at
        """), {"t": tid})).mappings().all()
        if not fees and not sponsors:
            raise HTTPException(status_code=400, detail="No outstanding charges for this account")

        label = (await db.execute(text(
            "SELECT company_name FROM tenant.tenants WHERE tenant_id = cast(:t AS uuid)"),
            {"t": tid})).scalar()
        total = sum(_f(f["fee_amount_fjd"]) for f in fees) + sum(_f(s["price_fjd"]) for s in sponsors)
        now = datetime.now()
        invoice_id = f"INV-{now.strftime('%Y%m')}-{uuid.uuid4().hex[:4].upper()}"
        due = (now + timedelta(days=max(0, body.due_days))).date()

        await db.execute(text("""
            INSERT INTO community.platform_invoices
                (invoice_id, tenant_id, account_label, status, subtotal_fjd, total_fjd,
                 due_date, note, created_by)
            VALUES (:i, cast(:t AS uuid), :label, 'DRAFT', :tot, :tot, :due, :note, cast(:by AS uuid))
        """), {"i": invoice_id, "t": tid, "label": label, "tot": total, "due": due,
               "note": body.note, "by": str(user["user_id"])})

        for f in fees:
            desc = f"Marketplace fee · {f['category']}" + (f" · order {f['order_id']}" if f["order_id"] else "") + f" ({_f(f['fee_pct'])}%)"
            await db.execute(text(
                "INSERT INTO community.platform_invoice_lines (invoice_id, source_type, source_id, description, amount_fjd) "
                "VALUES (:i, 'MARKETPLACE_FEE', :sid, :d, :a)"),
                {"i": invoice_id, "sid": str(f["id"]), "d": desc, "a": f["fee_amount_fjd"]})
        for s in sponsors:
            desc = f"Sponsorship · {s['title']}" + (f" · {s['billing_period']}" if s["billing_period"] and s["billing_period"] != "NONE" else "")
            await db.execute(text(
                "INSERT INTO community.platform_invoice_lines (invoice_id, source_type, source_id, description, amount_fjd) "
                "VALUES (:i, 'SPONSOR_PLACEMENT', :sid, :d, :a)"),
                {"i": invoice_id, "sid": str(s["placement_id"]), "d": desc, "a": s["price_fjd"]})

        if fees:
            await db.execute(text(
                "UPDATE community.marketplace_fee_ledger SET status='INVOICED', invoice_id=:i "
                "WHERE id = ANY(:ids)"),
                {"i": invoice_id, "ids": [f["id"] for f in fees]})
        if sponsors:
            await db.execute(text(
                "UPDATE community.sponsor_placements SET invoice_id=:i WHERE placement_id = ANY(:ids)"),
                {"i": invoice_id, "ids": [s["placement_id"] for s in sponsors]})
        await db.commit()
    return {"data": {"invoice_id": invoice_id, "total_fjd": total, "status": "DRAFT",
                     "line_count": len(fees) + len(sponsors), "due_date": str(due)}}


@router.post("/admin/billing/invoices/{invoice_id}/send")
async def send_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    _require_admin(user)
    async with get_db_ctx() as db:
        st = (await db.execute(text(
            "SELECT status FROM community.platform_invoices WHERE invoice_id = :i"),
            {"i": invoice_id})).scalar()
        if st is None:
            raise HTTPException(status_code=404, detail="Invoice not found")
        if st != "DRAFT":
            raise HTTPException(status_code=409, detail=f"Only a DRAFT invoice can be sent (is {st})")
        await db.execute(text(
            "UPDATE community.platform_invoices SET status='SENT', sent_at=now() WHERE invoice_id=:i"),
            {"i": invoice_id})
        await db.commit()
    return {"data": {"invoice_id": invoice_id, "status": "SENT"}}


class PayInvoice(BaseModel):
    payment_ref: Optional[str] = None


@router.post("/admin/billing/invoices/{invoice_id}/pay")
async def pay_invoice(invoice_id: str, body: PayInvoice, user: dict = Depends(get_current_user)):
    _require_admin(user)
    async with get_db_ctx() as db:
        st = (await db.execute(text(
            "SELECT status FROM community.platform_invoices WHERE invoice_id = :i"),
            {"i": invoice_id})).scalar()
        if st is None:
            raise HTTPException(status_code=404, detail="Invoice not found")
        if st in ("PAID", "VOID"):
            raise HTTPException(status_code=409, detail=f"Invoice is already {st}")
        await db.execute(text(
            "UPDATE community.platform_invoices SET status='PAID', paid_at=now(), payment_ref=:r WHERE invoice_id=:i"),
            {"i": invoice_id, "r": body.payment_ref})
        await db.execute(text(
            "UPDATE community.marketplace_fee_ledger SET status='PAID' WHERE invoice_id=:i AND status='INVOICED'"),
            {"i": invoice_id})
        await db.execute(text(
            "UPDATE community.sponsor_placements SET payment_status='PAID' WHERE invoice_id=:i AND payment_status='UNPAID'"),
            {"i": invoice_id})
        await db.commit()
    return {"data": {"invoice_id": invoice_id, "status": "PAID"}}


@router.post("/admin/billing/invoices/{invoice_id}/void")
async def void_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    _require_admin(user)
    async with get_db_ctx() as db:
        st = (await db.execute(text(
            "SELECT status FROM community.platform_invoices WHERE invoice_id = :i"),
            {"i": invoice_id})).scalar()
        if st is None:
            raise HTTPException(status_code=404, detail="Invoice not found")
        if st == "PAID":
            raise HTTPException(status_code=409, detail="A paid invoice cannot be voided")
        await db.execute(text(
            "UPDATE community.platform_invoices SET status='VOID' WHERE invoice_id=:i"), {"i": invoice_id})
        # Release source rows back to outstanding.
        await db.execute(text(
            "UPDATE community.marketplace_fee_ledger SET status='ACCRUED', invoice_id=NULL "
            "WHERE invoice_id=:i AND status='INVOICED'"), {"i": invoice_id})
        await db.execute(text(
            "UPDATE community.sponsor_placements SET invoice_id=NULL "
            "WHERE invoice_id=:i AND payment_status='UNPAID'"), {"i": invoice_id})
        await db.commit()
    return {"data": {"invoice_id": invoice_id, "status": "VOID"}}
