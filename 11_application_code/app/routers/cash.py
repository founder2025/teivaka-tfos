"""Phase CashUI-1a — cash ledger CRUD endpoints with audit chain emission.

Mirrors the labor.py shape for session/auth handling, but unlike labor every
mutation here lands in audit.events via app.core.audit_chain.emit_audit_event
(CASH_LOGGED / CASH_UPDATED / CASH_DELETED). Cash is the line item the bank
reads — chain coverage is the bank-credibility primitive.

Endpoints:
  POST   /api/v1/cash-ledger          → log a transaction (CASH_LOGGED)
  GET    /api/v1/cash-ledger          → list w/ filters + lifetime balance
  PATCH  /api/v1/cash-ledger/{id}     → mutable-field update (CASH_UPDATED)
  DELETE /api/v1/cash-ledger/{id}     → hard delete; audit row carries
                                        the snapshot (CASH_DELETED)

Per MBI Part 11: cash_balance_fjd is computed from a SUM over the entire
tenant+farm scope on every list call — never cached, never read from the
nullable running_balance_fjd column.

Per MBI Part 13: every response uses the {status, data, meta} envelope.

Each handler runs inside `get_rls_db(...)` which sets `app.tenant_id` and
wraps the work in a single transaction. Inserts/updates and the audit
emission commit atomically on context exit.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.core.audit_chain import emit_audit_event
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user


router = APIRouter()


# --- Constants ------------------------------------------------------------

# transaction_type CHECK constraint values (tenant.cash_ledger).
TransactionType = Literal["INCOME", "EXPENSE", "TRANSFER", "LOAN", "REPAYMENT", "GRANT"]

# payment_method CHECK constraint values.
PaymentMethod = Literal["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CREDIT", "OTHER"]

# Lifetime cash balance: positive flow vs negative flow. TRANSFER, LOAN,
# GRANT increase cash; EXPENSE, REPAYMENT decrease it. Schema today has
# no direction column on TRANSFER — treat as inflow for v1; revisit if
# inter-account transfers need a direction flag.
_BALANCE_SIGN_SQL = """
    CASE
        WHEN transaction_type IN ('INCOME','LOAN','GRANT','TRANSFER') THEN amount_fjd
        WHEN transaction_type IN ('EXPENSE','REPAYMENT') THEN -amount_fjd
        ELSE 0
    END
"""


# --- Helpers --------------------------------------------------------------

def _envelope_ok(data, meta_extra: dict | None = None) -> dict:
    meta = {"timestamp": datetime.now(timezone.utc).isoformat()}
    if meta_extra:
        meta.update(meta_extra)
    return {"status": "success", "data": data, "meta": meta}


def _row_to_dict(row) -> dict:
    """Cast a SQLAlchemy mapping row to a JSON-friendly dict."""
    out = dict(row)
    for k, v in list(out.items()):
        if isinstance(v, Decimal):
            out[k] = str(v)
        elif isinstance(v, (date, datetime)):
            out[k] = v.isoformat()
    return out


def _new_ledger_id() -> str:
    return f"CSH-{date.today():%Y%m%d}-{uuid4().hex[:4].upper()}"


# --- Pydantic bodies ------------------------------------------------------

class CashLedgerCreate(BaseModel):
    farm_id: str = Field(..., min_length=1)
    transaction_date: date
    transaction_type: TransactionType
    category: str = Field(..., min_length=1, max_length=64)
    description: str = Field(..., min_length=1, max_length=500)
    amount_fjd: Decimal = Field(..., gt=Decimal("0"))
    payment_method: Optional[PaymentMethod] = None
    reference_id: Optional[str] = Field(None, max_length=128)
    reference_type: Optional[str] = Field(None, max_length=64)
    bank_account: Optional[str] = Field(None, max_length=128)
    # P-Doctrine-2: Block + Crop anchors. Both optional — generic farm
    # expenses (utilities, fuel, whole-farm fertilizer purchase before
    # allocation) genuinely don't tie to a single block.
    pu_id: Optional[str] = Field(None, max_length=64)
    production_id: Optional[str] = Field(None, max_length=64)


class CashLedgerUpdate(BaseModel):
    """All fields optional — partial PATCH. Immutable fields (transaction_type,
    transaction_date, ledger_id, tenant_id, farm_id, created_by, created_at)
    are intentionally excluded so the audit chain integrity is preserved.

    pu_id + production_id ARE mutable: a farmer may correct block/crop
    attribution after the fact (e.g. expense was logged before the
    block was identified). The CASH_UPDATED audit row records the swap.
    """
    description: Optional[str] = Field(None, min_length=1, max_length=500)
    category: Optional[str] = Field(None, min_length=1, max_length=64)
    amount_fjd: Optional[Decimal] = Field(None, gt=Decimal("0"))
    payment_method: Optional[PaymentMethod] = None
    reference_id: Optional[str] = Field(None, max_length=128)
    reference_type: Optional[str] = Field(None, max_length=64)
    bank_account: Optional[str] = Field(None, max_length=128)
    pu_id: Optional[str] = Field(None, max_length=64)
    production_id: Optional[str] = Field(None, max_length=64)


_PATCH_FIELDS = (
    "description", "category", "amount_fjd", "payment_method",
    "reference_id", "reference_type", "bank_account",
    "pu_id", "production_id",
)


# --- POST ----------------------------------------------------------------

@router.post("", status_code=status.HTTP_201_CREATED, summary="Log a cash transaction")
async def log_cash(
    body: CashLedgerCreate,
    user: dict = Depends(get_current_user),
):
    ledger_id = _new_ledger_id()

    async with get_rls_db(str(user["tenant_id"])) as db:
        farm_check = await db.execute(
            text("SELECT 1 FROM tenant.farms WHERE farm_id = :fid LIMIT 1"),
            {"fid": body.farm_id},
        )
        if not farm_check.first():
            raise HTTPException(status_code=404, detail="farm_id not found for tenant")

        # P-Doctrine-2: validate Block anchor belongs to the farm.
        # 404 only on hard mismatch; production_id is accepted as-given
        # (retro logging of an expense for a previous crop on the same
        # block is a real workflow — don't 422 the farmer for it).
        if body.pu_id:
            pu_check = await db.execute(
                text("""
                    SELECT 1 FROM tenant.production_units
                    WHERE pu_id = :pu_id AND farm_id = :farm_id
                    LIMIT 1
                """),
                {"pu_id": body.pu_id, "farm_id": body.farm_id},
            )
            if not pu_check.first():
                raise HTTPException(status_code=404, detail="pu_id not found on farm")

        await db.execute(
            text("""
                INSERT INTO tenant.cash_ledger (
                    ledger_id, tenant_id, farm_id, transaction_date,
                    transaction_type, category, description, amount_fjd,
                    payment_method, reference_id, reference_type, bank_account,
                    created_by, pu_id, production_id
                ) VALUES (
                    :ledger_id, :tenant_id, :farm_id, :transaction_date,
                    :transaction_type, :category, :description, :amount_fjd,
                    :payment_method, :reference_id, :reference_type, :bank_account,
                    :created_by, :pu_id, :production_id
                )
            """),
            {
                "ledger_id": ledger_id,
                "tenant_id": str(user["tenant_id"]),
                "farm_id": body.farm_id,
                "transaction_date": body.transaction_date,
                "transaction_type": body.transaction_type,
                "category": body.category,
                "description": body.description,
                "amount_fjd": body.amount_fjd,
                "payment_method": body.payment_method,
                "reference_id": body.reference_id,
                "reference_type": body.reference_type,
                "bank_account": body.bank_account,
                "created_by": str(user["user_id"]),
                "pu_id": body.pu_id,
                "production_id": body.production_id,
            },
        )

        event_id, this_hash = await emit_audit_event(
            db=db,
            tenant_id=user["tenant_id"],
            actor_user_id=user["user_id"],
            event_type="CASH_LOGGED",
            entity_type="CASH_LEDGER",
            entity_id=ledger_id,
            payload={
                "ledger_id": ledger_id,
                "farm_id": body.farm_id,
                "pu_id": body.pu_id,
                "production_id": body.production_id,
                "transaction_date": body.transaction_date.isoformat(),
                "transaction_type": body.transaction_type,
                "category": body.category,
                "amount_fjd": str(body.amount_fjd),
                "payment_method": body.payment_method,
            },
        )

        row = (
            await db.execute(
                text("SELECT * FROM tenant.cash_ledger WHERE ledger_id = :id"),
                {"id": ledger_id},
            )
        ).mappings().first()

    return _envelope_ok(
        _row_to_dict(row),
        meta_extra={"audit_event_id": str(event_id), "audit_this_hash": this_hash},
    )


# --- GET -----------------------------------------------------------------

@router.get("", summary="List cash transactions + lifetime balance")
async def list_cash(
    farm_id: Optional[str] = None,
    period_start: Optional[date] = None,
    period_end: Optional[date] = None,
    transaction_type: Optional[TransactionType] = None,
    pu_id: Optional[str] = None,
    production_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    async with get_rls_db(str(user["tenant_id"])) as db:
        # Filter for the paginated entries query.
        where = ["tenant_id = :tid"]
        params: dict = {"tid": str(user["tenant_id"])}
        if farm_id:
            where.append("farm_id = :farm_id")
            params["farm_id"] = farm_id
        if period_start:
            where.append("transaction_date >= :pstart")
            params["pstart"] = period_start
        if period_end:
            where.append("transaction_date <= :pend")
            params["pend"] = period_end
        if transaction_type:
            where.append("transaction_type = :ttype")
            params["ttype"] = transaction_type
        if pu_id:
            where.append("pu_id = :pu_id")
            params["pu_id"] = pu_id
        if production_id:
            where.append("production_id = :production_id")
            params["production_id"] = production_id
        where_sql = " AND ".join(where)

        rows = (
            await db.execute(
                text(f"""
                    SELECT * FROM tenant.cash_ledger
                    WHERE {where_sql}
                    ORDER BY transaction_date DESC, created_at DESC
                    LIMIT :lim OFFSET :off
                """),
                {**params, "lim": limit, "off": offset},
            )
        ).mappings().all()

        count_row = (
            await db.execute(
                text(f"SELECT COUNT(*) AS n FROM tenant.cash_ledger WHERE {where_sql}"),
                params,
            )
        ).mappings().first()

        # Lifetime balance: tenant + (optional) farm scope ONLY — not
        # constrained by date or type filters (Part 11: real-time
        # cash position, not a filtered slice).
        bal_where = ["tenant_id = :tid"]
        bal_params: dict = {"tid": str(user["tenant_id"])}
        if farm_id:
            bal_where.append("farm_id = :farm_id")
            bal_params["farm_id"] = farm_id
        bal_row = (
            await db.execute(
                text(f"""
                    SELECT COALESCE(SUM({_BALANCE_SIGN_SQL}), 0) AS bal
                    FROM tenant.cash_ledger
                    WHERE {' AND '.join(bal_where)}
                """),
                bal_params,
            )
        ).mappings().first()

    return _envelope_ok({
        "entries": [_row_to_dict(r) for r in rows],
        "count": int(count_row["n"]),
        "cash_balance_fjd": str(bal_row["bal"]),
        "period": {
            "start": period_start.isoformat() if period_start else None,
            "end": period_end.isoformat() if period_end else None,
        },
        "filters": {
            "farm_id": farm_id,
            "transaction_type": transaction_type,
            "pu_id": pu_id,
            "production_id": production_id,
        },
        "pagination": {"limit": limit, "offset": offset},
    })


# --- PATCH ---------------------------------------------------------------

@router.patch("/{ledger_id}", summary="Update mutable cash fields")
async def update_cash(
    ledger_id: str,
    body: CashLedgerUpdate,
    user: dict = Depends(get_current_user),
):
    updates = body.model_dump(exclude_unset=True)
    # Ignore any keys outside the allow-list (defence-in-depth; Pydantic
    # already rejects unknowns by default).
    updates = {k: v for k, v in updates.items() if k in _PATCH_FIELDS}

    async with get_rls_db(str(user["tenant_id"])) as db:
        existing = (
            await db.execute(
                text("SELECT * FROM tenant.cash_ledger WHERE ledger_id = :id"),
                {"id": ledger_id},
            )
        ).mappings().first()
        if not existing:
            raise HTTPException(status_code=404, detail="ledger entry not found")

        # P-Doctrine-2: if PATCH is moving the row to a different Block,
        # the new pu_id must belong to the row's existing farm_id (farm_id
        # itself is immutable). Skip the check on no-op or NULL re-assigns.
        new_pu = updates.get("pu_id")
        if "pu_id" in updates and new_pu and new_pu != existing["pu_id"]:
            pu_check = await db.execute(
                text("""
                    SELECT 1 FROM tenant.production_units
                    WHERE pu_id = :pu_id AND farm_id = :farm_id
                    LIMIT 1
                """),
                {"pu_id": new_pu, "farm_id": existing["farm_id"]},
            )
            if not pu_check.first():
                raise HTTPException(status_code=404, detail="pu_id not found on this entry's farm")

        # Compute actual changes (skip no-ops, e.g. PATCH that resends
        # the same value). Decimal/str coercion is intentional — Postgres
        # gives Decimal back; the body may send Decimal too.
        changed: dict = {}
        for k, v in updates.items():
            if existing[k] != v:
                changed[k] = {"old": str(existing[k]) if existing[k] is not None else None,
                              "new": str(v) if v is not None else None}

        if not changed:
            return _envelope_ok(_row_to_dict(existing), meta_extra={"changed": False})

        set_clauses = ", ".join(f"{k} = :{k}" for k in updates.keys())
        await db.execute(
            text(f"UPDATE tenant.cash_ledger SET {set_clauses} WHERE ledger_id = :id"),
            {**updates, "id": ledger_id},
        )

        event_id, this_hash = await emit_audit_event(
            db=db,
            tenant_id=user["tenant_id"],
            actor_user_id=user["user_id"],
            event_type="CASH_UPDATED",
            entity_type="CASH_LEDGER",
            entity_id=ledger_id,
            payload={
                "ledger_id": ledger_id,
                "changed_fields": changed,
            },
        )

        updated = (
            await db.execute(
                text("SELECT * FROM tenant.cash_ledger WHERE ledger_id = :id"),
                {"id": ledger_id},
            )
        ).mappings().first()

    return _envelope_ok(
        _row_to_dict(updated),
        meta_extra={
            "changed": True,
            "audit_event_id": str(event_id),
            "audit_this_hash": this_hash,
        },
    )


# --- DELETE --------------------------------------------------------------

@router.delete("/{ledger_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a cash entry")
async def delete_cash(
    ledger_id: str,
    user: dict = Depends(get_current_user),
):
    async with get_rls_db(str(user["tenant_id"])) as db:
        existing = (
            await db.execute(
                text("SELECT * FROM tenant.cash_ledger WHERE ledger_id = :id"),
                {"id": ledger_id},
            )
        ).mappings().first()
        if not existing:
            raise HTTPException(status_code=404, detail="ledger entry not found")

        # Audit row first — captures the full pre-delete snapshot so the
        # chain is the only durable record of what was deleted.
        await emit_audit_event(
            db=db,
            tenant_id=user["tenant_id"],
            actor_user_id=user["user_id"],
            event_type="CASH_DELETED",
            entity_type="CASH_LEDGER",
            entity_id=ledger_id,
            payload={
                "ledger_id": ledger_id,
                "snapshot": _row_to_dict(existing),
                "deleted_at": datetime.now(timezone.utc).isoformat(),
            },
        )

        await db.execute(
            text("DELETE FROM tenant.cash_ledger WHERE ledger_id = :id"),
            {"id": ledger_id},
        )

    # 204 No Content — FastAPI requires a None body for this status.
    return None
