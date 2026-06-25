"""Marketplace transaction fees (Product 4) — mounted at /api/v1.

Fees ACCRUE as a platform receivable on flagged marketplace sales (the platform
doesn't hold the money). Rates are admin-editable per category; the ledger is the
platform's revenue record, collected out-of-band.

  GET   /marketplace-fees/rates                 active rates (auth, for display)
  GET   /admin/marketplace-fees/rates           all rates (admin)
  PUT   /admin/marketplace-fees/rates/{cat}     edit a rate (admin)
  GET   /admin/marketplace-fees/ledger          summary + recent rows (admin)
  PATCH /admin/marketplace-fees/ledger/{id}     set status (admin)

`accrue_marketplace_fee` is called from the order PAID path.
"""
import logging
from decimal import Decimal
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


async def accrue_marketplace_fee(db, tenant_id, order_id: str, category: str,
                                 gross_amount_fjd, source_ledger_id: Optional[str] = None):
    """Record a platform fee for a marketplace payment. Best-effort: returns the
    fee row dict, or None if no active rate / zero fee. Runs inside the caller's
    transaction (community.* has no RLS; the caller's session may carry tenant
    context, which these tables ignore)."""
    cat = (category or "PRODUCE").upper()
    if not (await db.execute(text(
            "SELECT to_regclass('community.marketplace_fee_rates') IS NOT NULL"))).scalar():
        return None
    rate = (await db.execute(text(
        "SELECT fee_pct, is_active FROM community.marketplace_fee_rates WHERE category = :c"),
        {"c": cat})).mappings().first()
    if not rate or not rate["is_active"]:
        return None
    pct = Decimal(str(rate["fee_pct"] or 0))
    if pct <= 0:
        return None
    gross = Decimal(str(gross_amount_fjd or 0))
    fee = (gross * pct / Decimal("100")).quantize(Decimal("0.01"))
    if fee <= 0:
        return None
    row = (await db.execute(text("""
        INSERT INTO community.marketplace_fee_ledger
            (tenant_id, order_id, category, gross_amount_fjd, fee_pct, fee_amount_fjd, source_ledger_id)
        VALUES (cast(:tid AS uuid), :oid, :cat, :gross, :pct, :fee, :slid)
        RETURNING id, fee_amount_fjd, fee_pct, category
    """), {"tid": str(tenant_id), "oid": order_id, "cat": cat,
           "gross": gross, "pct": pct, "fee": fee, "slid": source_ledger_id})).mappings().first()
    return dict(row) if row else None


# ── Rates ────────────────────────────────────────────────────────────────────
@router.get("/marketplace-fees/rates")
async def list_active_rates(user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        if not (await db.execute(text(
                "SELECT to_regclass('community.marketplace_fee_rates') IS NOT NULL"))).scalar():
            return {"data": []}
        rows = (await db.execute(text(
            "SELECT category, label, fee_pct FROM community.marketplace_fee_rates "
            "WHERE is_active = true ORDER BY category"))).mappings().all()
    return {"data": [dict(r) for r in rows]}


@router.get("/admin/marketplace-fees/rates")
async def admin_list_rates(user: dict = Depends(get_current_user)):
    _require_admin(user)
    async with get_db_ctx() as db:
        if not (await db.execute(text(
                "SELECT to_regclass('community.marketplace_fee_rates') IS NOT NULL"))).scalar():
            return {"data": []}
        rows = (await db.execute(text(
            "SELECT category, label, fee_pct, is_active FROM community.marketplace_fee_rates "
            "ORDER BY category"))).mappings().all()
    return {"data": [dict(r) for r in rows]}


class RateUpdate(BaseModel):
    label: Optional[str] = None
    fee_pct: Optional[float] = None
    is_active: Optional[bool] = None


@router.put("/admin/marketplace-fees/rates/{category}")
async def admin_update_rate(category: str, body: RateUpdate, user: dict = Depends(get_current_user)):
    _require_admin(user)
    cat = category.strip().upper()
    fields = {k: v for k, v in body.dict().items() if v is not None}
    async with get_db_ctx() as db:
        exists = (await db.execute(text(
            "SELECT 1 FROM community.marketplace_fee_rates WHERE category = :c"), {"c": cat})).scalar()
        if not exists:
            await db.execute(text(
                "INSERT INTO community.marketplace_fee_rates (category, label) VALUES (:c, :l)"),
                {"c": cat, "l": fields.get("label", cat.title())})
        if fields:
            sets, params = [], {"c": cat, "by": str(user["user_id"])}
            for k, v in fields.items():
                sets.append(f"{k} = :{k}")
                params[k] = v
            sets.append("updated_at = now()")
            sets.append("updated_by = cast(:by AS uuid)")
            await db.execute(text(
                f"UPDATE community.marketplace_fee_rates SET {', '.join(sets)} WHERE category = :c"), params)
        await db.commit()
    return {"data": {"category": cat, "updated": True}}


# ── Ledger ───────────────────────────────────────────────────────────────────
@router.get("/admin/marketplace-fees/ledger")
async def admin_ledger(status_filter: Optional[str] = None, user: dict = Depends(get_current_user)):
    _require_admin(user)
    async with get_db_ctx() as db:
        if not (await db.execute(text(
                "SELECT to_regclass('community.marketplace_fee_ledger') IS NOT NULL"))).scalar():
            return {"data": {"summary": {}, "rows": []}}
        summary = (await db.execute(text("""
            SELECT
              COALESCE(SUM(fee_amount_fjd),0)                                        AS total_fjd,
              COALESCE(SUM(fee_amount_fjd) FILTER (WHERE status='ACCRUED'),0)         AS accrued_fjd,
              COALESCE(SUM(fee_amount_fjd) FILTER (WHERE status='INVOICED'),0)        AS invoiced_fjd,
              COALESCE(SUM(fee_amount_fjd) FILTER (WHERE status='PAID'),0)            AS paid_fjd,
              COALESCE(SUM(fee_amount_fjd) FILTER (
                  WHERE date_trunc('month', created_at) = date_trunc('month', now())),0) AS this_month_fjd,
              COUNT(*)                                                               AS count
            FROM community.marketplace_fee_ledger
        """))).mappings().first()
        q = ("SELECT id, tenant_id, order_id, category, gross_amount_fjd, fee_pct, "
             "fee_amount_fjd, status, source_ledger_id, created_at "
             "FROM community.marketplace_fee_ledger ")
        params = {}
        if status_filter:
            q += "WHERE status = :st "
            params["st"] = status_filter.upper()
        q += "ORDER BY created_at DESC LIMIT 200"
        rows = (await db.execute(text(q), params)).mappings().all()
    return {"data": {"summary": dict(summary), "rows": [dict(r) for r in rows]}}


class LedgerPatch(BaseModel):
    status: str


@router.patch("/admin/marketplace-fees/ledger/{fee_id}")
async def admin_update_ledger(fee_id: int, body: LedgerPatch, user: dict = Depends(get_current_user)):
    _require_admin(user)
    st = (body.status or "").upper()
    if st not in ("ACCRUED", "INVOICED", "PAID", "WAIVED"):
        raise HTTPException(status_code=400, detail="Invalid status")
    async with get_db_ctx() as db:
        res = await db.execute(text(
            "UPDATE community.marketplace_fee_ledger SET status = :s WHERE id = :id"),
            {"s": st, "id": fee_id})
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Fee row not found")
        await db.commit()
    return {"data": {"id": fee_id, "status": st}}
