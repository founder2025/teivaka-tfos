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
import io
import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import text
from pydantic import BaseModel
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from app.db.session import get_db_ctx
from app.middleware.rls import get_current_user
from app.utils.email import send_document_email

router = APIRouter()
logger = logging.getLogger(__name__)
_ADMIN = {"ADMIN", "FOUNDER"}


def _require_admin(user: dict):
    if user.get("role") not in _ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")


def _f(v):
    return float(v) if v is not None else 0.0


async def _load_invoice(db, invoice_id: str):
    inv = (await db.execute(text(
        "SELECT * FROM community.platform_invoices WHERE invoice_id = :i"),
        {"i": invoice_id})).mappings().first()
    if not inv:
        return None, None
    lines = (await db.execute(text(
        "SELECT source_type, source_id, description, amount_fjd "
        "FROM community.platform_invoice_lines WHERE invoice_id = :i ORDER BY id"),
        {"i": invoice_id})).mappings().all()
    return inv, lines


async def _tenants_has_billing_email(db) -> bool:
    return bool((await db.execute(text(
        "SELECT 1 FROM information_schema.columns WHERE table_schema='tenant' "
        "AND table_name='tenants' AND column_name='billing_email'"))).scalar())


async def _billing_email(db, tenant_id) -> Optional[str]:
    """Billing recipient — the account's explicit billing_email override
    (migration 182) if set, else the owner/founder user email."""
    if await _tenants_has_billing_email(db):
        override = (await db.execute(text(
            "SELECT billing_email FROM tenant.tenants WHERE tenant_id = cast(:t AS uuid)"),
            {"t": str(tenant_id)})).scalar()
        if override and override.strip():
            return override.strip()
    return (await db.execute(text(
        "SELECT email FROM tenant.users WHERE tenant_id = cast(:t AS uuid) AND email IS NOT NULL "
        "ORDER BY CASE WHEN role IN ('OWNER','FOUNDER') THEN 0 ELSE 1 END, created_at LIMIT 1"),
        {"t": str(tenant_id)})).scalar()


def _build_invoice_pdf(inv, lines) -> bytes:
    """Render a clean A4 tax invoice. inv is a row mapping, lines a list of them."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=2 * cm, bottomMargin=2 * cm, title=inv["invoice_id"])
    s = getSampleStyleSheet()
    soil = colors.HexColor("#3d3326")
    green = colors.HexColor("#2f6b3a")
    el = [
        Paragraph("Teivaka PTE LTD", s["Title"]),
        Paragraph("Tax Invoice", s["Heading2"]),
        Spacer(1, 0.3 * cm),
    ]
    meta = [
        ["Invoice", inv["invoice_id"]],
        ["Account", inv["account_label"] or "—"],
        ["Issued", str(inv["issued_at"])[:10]],
        ["Due", str(inv["due_date"]) if inv["due_date"] else "—"],
        ["Status", inv["status"]],
    ]
    mt = Table(meta, colWidths=[3.5 * cm, 12 * cm])
    mt.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), soil),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    el += [mt, Spacer(1, 0.5 * cm)]

    data = [["Description", "Amount (FJD)"]]
    for ln in lines:
        data.append([Paragraph(ln["description"], s["Normal"]), f"{_f(ln['amount_fjd']):,.2f}"])
    data.append(["", ""])
    data.append(["Total due (FJD)", f"{_f(inv['total_fjd']):,.2f}"])
    lt = Table(data, colWidths=[12.5 * cm, 3 * cm])
    lt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), green),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LINEBELOW", (0, 1), (-1, -3), 0.4, colors.HexColor("#e0d9c8")),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, soil),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    el += [lt, Spacer(1, 0.6 * cm),
           Paragraph("Payment by M-PAiSA or bank transfer. Please quote the invoice "
                     "number as your payment reference.", s["Normal"])]
    doc.build(el)
    return buf.getvalue()


@router.get("/admin/billing/outstanding")
async def outstanding(user: dict = Depends(get_current_user)):
    """Per-account uninvoiced charges: accrued marketplace fees + unpaid sponsor
    placements, grouped by tenant."""
    _require_admin(user)
    async with get_db_ctx() as db:
        bcol = "t.billing_email" if await _tenants_has_billing_email(db) else "NULL::text"
        rows = (await db.execute(text(f"""
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
                   {bcol} AS billing_email_override,
                   COALESCE({bcol}, (
                       SELECT email FROM tenant.users u2
                       WHERE u2.tenant_id = t.tenant_id AND u2.email IS NOT NULL
                       ORDER BY CASE WHEN u2.role IN ('OWNER','FOUNDER') THEN 0 ELSE 1 END, u2.created_at
                       LIMIT 1)) AS effective_email,
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
        "billing_email_override": r["billing_email_override"], "effective_email": r["effective_email"],
        "marketplace_fjd": _f(r["marketplace_fjd"]), "fee_count": r["fee_count"],
        "sponsor_fjd": _f(r["sponsor_fjd"]), "sponsor_count": r["sponsor_count"],
        "total_fjd": _f(r["total_fjd"]),
    } for r in rows]}


class AccountEmail(BaseModel):
    email: Optional[str] = None


@router.put("/admin/billing/accounts/{tenant_id}/email")
async def set_billing_email(tenant_id: str, body: AccountEmail, user: dict = Depends(get_current_user)):
    """Set (or clear, with null/empty) an account's billing email override."""
    _require_admin(user)
    email = (body.email or "").strip() or None
    if email and ("@" not in email or "." not in email.split("@")[-1]):
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    async with get_db_ctx() as db:
        if not await _tenants_has_billing_email(db):
            raise HTTPException(status_code=409, detail="billing_email column missing — run migration 182")
        res = await db.execute(text(
            "UPDATE tenant.tenants SET billing_email = :e WHERE tenant_id = cast(:t AS uuid)"),
            {"e": email, "t": tenant_id})
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Account not found")
        await db.commit()
    return {"data": {"tenant_id": tenant_id, "billing_email": email}}


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


@router.get("/admin/billing/invoices/{invoice_id}/pdf")
async def invoice_pdf(invoice_id: str, user: dict = Depends(get_current_user)):
    _require_admin(user)
    async with get_db_ctx() as db:
        inv, lines = await _load_invoice(db, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    pdf = _build_invoice_pdf(inv, lines)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{invoice_id}.pdf"'})


@router.post("/admin/billing/invoices/{invoice_id}/send")
async def send_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    """Mark SENT and email the PDF to the account's billing contact. Email is
    best-effort — the status flips regardless, and the response reports honestly
    whether the email actually dispatched (PR.2: a 200 here is not a receipt)."""
    _require_admin(user)
    async with get_db_ctx() as db:
        inv, lines = await _load_invoice(db, invoice_id)
        if not inv:
            raise HTTPException(status_code=404, detail="Invoice not found")
        if inv["status"] != "DRAFT":
            raise HTTPException(status_code=409, detail=f"Only a DRAFT invoice can be sent (is {inv['status']})")
        to_email = await _billing_email(db, inv["tenant_id"])
        await db.execute(text(
            "UPDATE community.platform_invoices SET status='SENT', sent_at=now() WHERE invoice_id=:i"),
            {"i": invoice_id})
        await db.commit()

    emailed, reason = False, None
    if not to_email:
        reason = "no billing email on file for this account"
    else:
        try:
            pdf = _build_invoice_pdf(inv, lines)
            body = (f"Dear {inv['account_label'] or 'customer'},\n\n"
                    f"Please find attached Teivaka invoice {invoice_id} for {inv['currency']} "
                    f"{_f(inv['total_fjd']):,.2f}, due {inv['due_date'] or 'on receipt'}.\n\n"
                    "Pay by M-PAiSA or bank transfer, quoting the invoice number as reference.\n\n"
                    "— Teivaka PTE LTD")
            emailed = send_document_email(
                to_email, f"Teivaka invoice {invoice_id}", body,
                attachment_bytes=pdf, attachment_filename=f"{invoice_id}.pdf")
            if not emailed:
                reason = "email not configured or dispatch failed (see logs)"
        except Exception as e:  # noqa: BLE001
            logger.exception("invoice email build/send failed for %s: %s", invoice_id, e)
            reason = "email build/send error"
    return {"data": {"invoice_id": invoice_id, "status": "SENT",
                     "emailed": emailed, "email_to": to_email, "reason": reason}}


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
