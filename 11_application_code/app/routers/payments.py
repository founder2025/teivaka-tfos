"""Payments — Phase 0 non-custodial orchestration (manual-first).

A farmer captures an obligation (pay a supplier/worker = COLLECT; money owed to
them = RECEIVE), generates a manual payment instruction, and confirms it once paid
out-of-band. Confirmation writes exactly one tenant.cash_ledger row (INCOME/
EXPENSE) + one CASH_LOGGED audit event — so payments flow straight into farm cash
flow and the hash-chained Bank Evidence record. Teivaka never holds or moves funds.

Routes (mounted at /api/v1/payments):
  GET   /providers                       enabled adapters (MANUAL live; rest off)
  GET   /methods            POST /methods            DELETE /methods/{id}
  GET   /counterparties     POST /counterparties
  GET   /payables           POST /payables           POST /payables/{id}/cancel
  POST  /payables/{id}/instruct          create a manual instruction
  POST  /transactions/{id}/confirm       settle → cash_ledger + audit
  GET   /summary                         hub totals
"""
import json
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from pydantic import BaseModel, Field

from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from app.core.audit_chain import emit_audit_event
from app.services.payment_providers import get_provider
from app.core.payment_lock import (
    pin_context, hash_pin, verify_pin, set_unlocked, is_unlocked, clear_unlocked,
    require_payment_unlock, MAX_FAILED, LOCKOUT_SECONDS, UNLOCK_TTL_SECONDS,
)


def _now():
    return datetime.now(timezone.utc)

router = APIRouter()
logger = logging.getLogger(__name__)

_DIRECTIONS = {"COLLECT", "RECEIVE"}


def _nid(prefix: str) -> str:
    return f"{prefix}-{datetime.now().strftime('%y%m%d')}-{uuid.uuid4().hex[:6].upper()}"


def _f(v):
    return float(v) if v is not None else 0.0


# ───────────────────────────── providers ──────────────────────────────────
@router.get("/providers")
async def list_providers(user: dict = Depends(require_payment_unlock)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        rows = (await db.execute(text(
            "SELECT code, display, is_manual, can_collect, can_request, can_disburse, can_qr, enabled "
            "FROM shared.payment_providers ORDER BY sort_order"))).mappings().all()
    return {"data": [dict(r) for r in rows]}


# ───────────────────────────── methods ────────────────────────────────────
class MethodCreate(BaseModel):
    provider: str = "MANUAL"
    method_type: str = Field(..., pattern="^(WALLET|BANK|CARD)$")
    label: str = Field(..., min_length=1, max_length=120)
    masked_identifier: Optional[str] = Field(None, max_length=60)
    is_default: bool = False


@router.get("/methods")
async def list_methods(user: dict = Depends(require_payment_unlock)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        rows = (await db.execute(text(
            "SELECT method_id, provider, method_type, label, masked_identifier, is_default, status "
            "FROM tenant.payment_methods WHERE status='ACTIVE' ORDER BY is_default DESC, created_at"))).mappings().all()
    return {"data": [dict(r) for r in rows]}


@router.post("/methods")
async def add_method(body: MethodCreate, user: dict = Depends(require_payment_unlock)):
    mid = _nid("PM")
    async with get_rls_db(str(user["tenant_id"])) as db:
        if body.is_default:
            await db.execute(text("UPDATE tenant.payment_methods SET is_default=false WHERE tenant_id=cast(:t AS uuid)"),
                             {"t": str(user["tenant_id"])})
        await db.execute(text("""
            INSERT INTO tenant.payment_methods
                (method_id, tenant_id, owner_user_id, provider, method_type, label, masked_identifier, is_default)
            VALUES (:m, cast(:t AS uuid), cast(:u AS uuid), :p, :mt, :l, :mi, :d)
        """), {"m": mid, "t": str(user["tenant_id"]), "u": str(user["user_id"]),
               "p": body.provider.upper(), "mt": body.method_type, "l": body.label.strip(),
               "mi": body.masked_identifier, "d": body.is_default})
    return {"data": {"method_id": mid}}


@router.delete("/methods/{method_id}")
async def archive_method(method_id: str, user: dict = Depends(require_payment_unlock)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        res = await db.execute(text(
            "UPDATE tenant.payment_methods SET status='ARCHIVED', updated_at=now() WHERE method_id=:m"),
            {"m": method_id})
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Method not found")
    return {"data": {"method_id": method_id, "status": "ARCHIVED"}}


# ─────────────────────────── counterparties ───────────────────────────────
class CounterpartyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    kind: str = Field("OTHER", pattern="^(SUPPLIER|WORKER|BUYER|OTHER)$")
    provider: Optional[str] = None
    masked_handle: Optional[str] = Field(None, max_length=60)


@router.get("/counterparties")
async def list_counterparties(user: dict = Depends(require_payment_unlock)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        rows = (await db.execute(text(
            "SELECT counterparty_id, name, kind, provider, masked_handle "
            "FROM tenant.payment_counterparties ORDER BY name"))).mappings().all()
    return {"data": [dict(r) for r in rows]}


@router.post("/counterparties")
async def add_counterparty(body: CounterpartyCreate, user: dict = Depends(require_payment_unlock)):
    cid = _nid("CP")
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO tenant.payment_counterparties
                (counterparty_id, tenant_id, name, kind, provider, masked_handle, created_by)
            VALUES (:c, cast(:t AS uuid), :n, :k, :p, :h, cast(:u AS uuid))
        """), {"c": cid, "t": str(user["tenant_id"]), "n": body.name.strip(), "k": body.kind,
               "p": (body.provider or None), "h": body.masked_handle, "u": str(user["user_id"])})
    return {"data": {"counterparty_id": cid}}


# ───────────────────────────── payables ───────────────────────────────────
class PayableCreate(BaseModel):
    direction: str = Field(..., pattern="^(COLLECT|RECEIVE)$")
    amount_fjd: Decimal = Field(..., gt=0)
    category: str = Field("OTHER", min_length=1, max_length=64)
    counterparty_id: Optional[str] = None
    counterparty_label: Optional[str] = Field(None, max_length=120)
    farm_id: Optional[str] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None


@router.get("/payables")
async def list_payables(status: Optional[str] = None, direction: Optional[str] = None,
                        user: dict = Depends(require_payment_unlock)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        q = ("SELECT obligation_id, direction, category, counterparty_label, amount_fjd, currency, "
             "status, due_date, source_type, source_id, farm_id, notes, created_at "
             "FROM tenant.payables WHERE 1=1 ")
        params = {}
        if status:
            q += "AND status = :s "; params["s"] = status.upper()
        if direction:
            q += "AND direction = :d "; params["d"] = direction.upper()
        q += "ORDER BY (status='OPEN') DESC, created_at DESC LIMIT 300"
        rows = (await db.execute(text(q), params)).mappings().all()
    return {"data": [{**dict(r), "amount_fjd": _f(r["amount_fjd"])} for r in rows]}


@router.post("/payables")
async def create_payable(body: PayableCreate, user: dict = Depends(require_payment_unlock)):
    oid = _nid("OBL")
    async with get_rls_db(str(user["tenant_id"])) as db:
        if body.farm_id:
            ok = (await db.execute(text("SELECT 1 FROM tenant.farms WHERE farm_id=:f LIMIT 1"),
                                   {"f": body.farm_id})).scalar()
            if not ok:
                raise HTTPException(status_code=404, detail="farm_id not found for tenant")
        label = body.counterparty_label
        if not label and body.counterparty_id:
            label = (await db.execute(text(
                "SELECT name FROM tenant.payment_counterparties WHERE counterparty_id=:c"),
                {"c": body.counterparty_id})).scalar()
        await db.execute(text("""
            INSERT INTO tenant.payables
                (obligation_id, tenant_id, farm_id, direction, counterparty_id, counterparty_label,
                 category, amount_fjd, source_type, status, due_date, notes, created_by)
            VALUES (:o, cast(:t AS uuid), :farm, :dir, :cid, :clabel, :cat, :amt, 'ADHOC', 'OPEN',
                    :due, :notes, cast(:u AS uuid))
        """), {"o": oid, "t": str(user["tenant_id"]), "farm": body.farm_id, "dir": body.direction,
               "cid": body.counterparty_id, "clabel": label, "cat": body.category.strip(),
               "amt": body.amount_fjd, "due": body.due_date, "notes": body.notes, "u": str(user["user_id"])})
    return {"data": {"obligation_id": oid, "status": "OPEN"}}


@router.post("/payables/{obligation_id}/cancel")
async def cancel_payable(obligation_id: str, user: dict = Depends(require_payment_unlock)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        res = await db.execute(text(
            "UPDATE tenant.payables SET status='CANCELLED', updated_at=now() "
            "WHERE obligation_id=:o AND status IN ('OPEN','INSTRUCTED')"), {"o": obligation_id})
        if res.rowcount == 0:
            raise HTTPException(status_code=409, detail="Only an open/instructed payable can be cancelled")
    return {"data": {"obligation_id": obligation_id, "status": "CANCELLED"}}


class Instruct(BaseModel):
    payment_method_id: Optional[str] = None


@router.post("/payables/{obligation_id}/instruct")
async def instruct(obligation_id: str, body: Instruct, user: dict = Depends(require_payment_unlock)):
    """Generate a (manual) payment instruction for an obligation and open a
    transaction in INITIATED state."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        ob = (await db.execute(text(
            "SELECT direction, amount_fjd, counterparty_label, status FROM tenant.payables WHERE obligation_id=:o"),
            {"o": obligation_id})).mappings().first()
        if not ob:
            raise HTTPException(status_code=404, detail="Obligation not found")
        if ob["status"] not in ("OPEN", "INSTRUCTED"):
            raise HTTPException(status_code=409, detail=f"Obligation is {ob['status']}")
        method = None
        provider_code = "MANUAL"
        if body.payment_method_id:
            method = (await db.execute(text(
                "SELECT method_id, provider, label FROM tenant.payment_methods WHERE method_id=:m AND status='ACTIVE'"),
                {"m": body.payment_method_id})).mappings().first()
            if not method:
                raise HTTPException(status_code=404, detail="Payment method not found")
            provider_code = method["provider"]

        adapter = get_provider(provider_code)
        instr = adapter.create_instruction(
            direction=ob["direction"], amount_fjd=ob["amount_fjd"],
            method=dict(method) if method else None,
            counterparty_label=ob["counterparty_label"], obligation_id=obligation_id)

        txn_id = _nid("PT")
        await db.execute(text("""
            INSERT INTO tenant.payment_transactions
                (txn_id, tenant_id, obligation_id, payment_method_id, provider, direction, amount_fjd,
                 provider_ref, state, instruction_payload, created_by)
            VALUES (:x, cast(:t AS uuid), :o, :m, :p, :dir, :amt, :ref, 'INITIATED',
                    cast(:instr AS jsonb), cast(:u AS uuid))
        """), {"x": txn_id, "t": str(user["tenant_id"]), "o": obligation_id,
               "m": body.payment_method_id, "p": adapter.code, "dir": ob["direction"],
               "amt": ob["amount_fjd"], "ref": instr["provider_ref"],
               "instr": json.dumps(instr["instruction_payload"]), "u": str(user["user_id"])})
        await db.execute(text("UPDATE tenant.payables SET status='INSTRUCTED', updated_at=now() WHERE obligation_id=:o"),
                         {"o": obligation_id})
    return {"data": {"txn_id": txn_id, "provider": adapter.code, "provider_ref": instr["provider_ref"],
                     "instruction": instr["instruction_payload"]}}


class Confirm(BaseModel):
    confirmation_ref: Optional[str] = None


@router.post("/transactions/{txn_id}/confirm")
async def confirm_transaction(txn_id: str, body: Confirm, user: dict = Depends(require_payment_unlock)):
    """Mark a transaction CONFIRMED and record it in cash flow: one cash_ledger
    row (EXPENSE for COLLECT, INCOME for RECEIVE) + one CASH_LOGGED audit event.
    Idempotent — a confirmed transaction never writes a second ledger row."""
    tid = str(user["tenant_id"])
    async with get_rls_db(tid) as db:
        tx = (await db.execute(text("""
            SELECT t.txn_id, t.obligation_id, t.direction, t.amount_fjd, t.state, t.provider, t.provider_ref,
                   p.category, p.farm_id, p.counterparty_label, m.label AS method_label
            FROM tenant.payment_transactions t
            JOIN tenant.payables p ON p.obligation_id = t.obligation_id
            LEFT JOIN tenant.payment_methods m ON m.method_id = t.payment_method_id
            WHERE t.txn_id = :x
        """), {"x": txn_id})).mappings().first()
        if not tx:
            raise HTTPException(status_code=404, detail="Transaction not found")
        if tx["state"] == "CONFIRMED":
            raise HTTPException(status_code=409, detail="Transaction already confirmed")
        if tx["state"] in ("REVERSED", "FAILED"):
            raise HTTPException(status_code=409, detail=f"Transaction is {tx['state']}")

        # Cash-flow link is for farm managers: if the account has a farm, record a
        # cash_ledger row; otherwise (buyer/creator/provider with no farm) the
        # payment + audit row IS the record. Universal — works for every role.
        farm_id = tx["farm_id"] or (await db.execute(text(
            "SELECT farm_id FROM tenant.farms ORDER BY created_at LIMIT 1"))).scalar()

        # Single-writer guard: never double-post a ledger row for this payment.
        existing = (await db.execute(text(
            "SELECT 1 FROM tenant.cash_ledger WHERE reference_type='PAYMENT' AND reference_id=:r LIMIT 1"),
            {"r": txn_id})).scalar()
        ttype = "EXPENSE" if tx["direction"] == "COLLECT" else "INCOME"
        who = tx["counterparty_label"] or ("payee" if tx["direction"] == "COLLECT" else "payer")
        descr = f"{'Payment to' if ttype == 'EXPENSE' else 'Payment from'} {who} · {tx['provider']} {body.confirmation_ref or tx['provider_ref'] or ''}".strip()
        ledger_id = None
        if farm_id and not existing:
            ledger_id = f"CSH-{date.today():%Y%m%d}-{uuid.uuid4().hex[:4].upper()}"
            await db.execute(text("""
                INSERT INTO tenant.cash_ledger
                    (ledger_id, tenant_id, farm_id, transaction_date, transaction_type, category,
                     description, amount_fjd, payment_method, reference_id, reference_type, created_by)
                VALUES (:l, cast(:t AS uuid), :farm, :d, :tt, :cat, :descr, :amt, :pm, :rid, 'PAYMENT', cast(:u AS uuid))
            """), {"l": ledger_id, "t": tid, "farm": farm_id, "d": date.today(), "tt": ttype,
                   "cat": tx["category"], "descr": descr, "amt": tx["amount_fjd"],
                   "pm": tx["method_label"] or tx["provider"], "rid": txn_id, "u": str(user["user_id"])})

        _, this_hash = await emit_audit_event(
            db=db, tenant_id=user["tenant_id"], actor_user_id=user["user_id"],
            event_type="CASH_LOGGED", entity_type="PAYMENT", entity_id=txn_id,
            payload={"txn_id": txn_id, "obligation_id": tx["obligation_id"], "direction": tx["direction"],
                     "transaction_type": ttype, "amount_fjd": str(tx["amount_fjd"]),
                     "category": tx["category"], "ledger_id": ledger_id,
                     "confirmation_ref": body.confirmation_ref or tx["provider_ref"]})

        await db.execute(text("""
            UPDATE tenant.payment_transactions
               SET state='CONFIRMED', confirmation_ref=:r, confirmed_via='USER',
                   cash_ledger_id=:l, updated_at=now()
             WHERE txn_id=:x
        """), {"r": body.confirmation_ref, "l": ledger_id, "x": txn_id})
        await db.execute(text("UPDATE tenant.payables SET status='SETTLED', updated_at=now() WHERE obligation_id=:o"),
                         {"o": tx["obligation_id"]})
    return {"data": {"txn_id": txn_id, "state": "CONFIRMED", "ledger_id": ledger_id,
                     "recorded_in_cashflow": ledger_id is not None, "audit_hash": this_hash}}


@router.get("/transactions")
async def list_transactions(obligation_id: Optional[str] = None, user: dict = Depends(require_payment_unlock)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        q = ("SELECT txn_id, obligation_id, provider, provider_ref, state, amount_fjd, "
             "instruction_payload, confirmation_ref, created_at FROM tenant.payment_transactions WHERE 1=1 ")
        params = {}
        if obligation_id:
            q += "AND obligation_id = :o "; params["o"] = obligation_id
        q += "ORDER BY created_at DESC LIMIT 200"
        rows = (await db.execute(text(q), params)).mappings().all()
    return {"data": [{**dict(r), "amount_fjd": _f(r["amount_fjd"])} for r in rows]}


# ───────────────────── suggestions from existing rails ────────────────────
# Surface unpaid obligations from other Teivaka systems without duplicating rows:
# each is shown only until adopted into tenant.payables. Sources that already
# self-settle into cash_ledger (orders → log_payment) are deliberately excluded
# to avoid double-counting.
@router.get("/suggestions")
async def suggestions(user: dict = Depends(require_payment_unlock)):
    tid = str(user["tenant_id"])
    uid = str(user["user_id"])
    async with get_rls_db(tid) as db:
        inv = (await db.execute(text("""
            SELECT 'INVOICE' AS source_type, i.invoice_id AS source_id, i.total_fjd AS amount_fjd,
                   'COLLECT' AS direction, 'SUBSCRIPTION' AS category, 'Teivaka' AS counterparty_label,
                   ('Invoice ' || i.invoice_id) AS detail
            FROM community.platform_invoices i
            WHERE i.tenant_id = cast(:t AS uuid) AND i.status IN ('DRAFT','SENT')
              AND NOT EXISTS (SELECT 1 FROM tenant.payables p
                              WHERE p.source_type='INVOICE' AND p.source_id = i.invoice_id)
        """), {"t": tid})).mappings().all()
        jobs = (await db.execute(text("""
            SELECT 'SERVICE_JOB' AS source_type, j.job_id AS source_id, j.agreed_price_fjd AS amount_fjd,
                   'RECEIVE' AS direction, 'SERVICE' AS category, COALESCE(j.title,'Service job') AS counterparty_label,
                   ('Job ' || j.job_id) AS detail
            FROM community.service_jobs j
            WHERE j.claimed_by_tenant_id = cast(:t AS uuid) AND j.status='COMPLETED'
              AND j.agreed_price_fjd IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM tenant.payables p
                              WHERE p.source_type='SERVICE_JOB' AND p.source_id = j.job_id)
        """), {"t": tid})).mappings().all()
        aff = (await db.execute(text("""
            SELECT 'AFFILIATE' AS source_type, c.commission_id AS source_id, c.amount_fjd AS amount_fjd,
                   'RECEIVE' AS direction, 'COMMISSION' AS category,
                   COALESCE(NULLIF(c.referee_name,''),'Referral') AS counterparty_label,
                   ('Commission · ' || c.tier) AS detail
            FROM community.affiliate_commissions c
            WHERE c.affiliate_user_id = cast(:u AS uuid) AND c.status='ACCRUED' AND c.amount_fjd > 0
              AND NOT EXISTS (SELECT 1 FROM tenant.payables p
                              WHERE p.source_type='AFFILIATE' AND p.source_id = c.commission_id)
        """), {"u": uid})).mappings().all()
    items = [{**dict(r), "amount_fjd": _f(r["amount_fjd"])} for r in (list(inv) + list(jobs) + list(aff))]
    return {"data": items}


class Adopt(BaseModel):
    source_type: str
    source_id: str


@router.post("/payables/adopt")
async def adopt(body: Adopt, user: dict = Depends(require_payment_unlock)):
    """Materialize a derived obligation into tenant.payables (idempotent), so it
    can run through the normal instruct/confirm flow. Records the farmer's cash
    movement only — it does NOT mark the source paid in its native system (AR/
    commission settlement stays with the system of record)."""
    tid = str(user["tenant_id"])
    uid = str(user["user_id"])
    st = body.source_type.upper()
    async with get_rls_db(tid) as db:
        existing = (await db.execute(text(
            "SELECT obligation_id FROM tenant.payables WHERE source_type=:st AND source_id=:sid LIMIT 1"),
            {"st": st, "sid": body.source_id})).scalar()
        if existing:
            return {"data": {"obligation_id": existing, "adopted": False}}
        if st == "INVOICE":
            row = (await db.execute(text(
                "SELECT total_fjd FROM community.platform_invoices WHERE invoice_id=:i AND tenant_id=cast(:t AS uuid)"),
                {"i": body.source_id, "t": tid})).mappings().first()
            direction, category, label, amount = "COLLECT", "SUBSCRIPTION", "Teivaka", (row and row["total_fjd"])
        elif st == "SERVICE_JOB":
            row = (await db.execute(text(
                "SELECT agreed_price_fjd, title FROM community.service_jobs WHERE job_id=:i AND claimed_by_tenant_id=cast(:t AS uuid)"),
                {"i": body.source_id, "t": tid})).mappings().first()
            direction, category, amount = "RECEIVE", "SERVICE", (row and row["agreed_price_fjd"])
            label = (row and row["title"]) or "Service job"
        elif st == "AFFILIATE":
            row = (await db.execute(text(
                "SELECT amount_fjd, referee_name FROM community.affiliate_commissions WHERE commission_id=:i AND affiliate_user_id=cast(:u AS uuid)"),
                {"i": body.source_id, "u": uid})).mappings().first()
            direction, category, amount = "RECEIVE", "COMMISSION", (row and row["amount_fjd"])
            label = (row and (row["referee_name"] or None)) or "Referral"
        else:
            raise HTTPException(status_code=400, detail="Unsupported source type")
        if not row or amount is None:
            raise HTTPException(status_code=404, detail="Source obligation not found")
        oid = _nid("OBL")
        await db.execute(text("""
            INSERT INTO tenant.payables
                (obligation_id, tenant_id, direction, counterparty_label, category, amount_fjd,
                 source_type, source_id, status, created_by)
            VALUES (:o, cast(:t AS uuid), :dir, :label, :cat, :amt, :st, :sid, 'OPEN', cast(:u AS uuid))
        """), {"o": oid, "t": tid, "dir": direction, "label": label, "cat": category,
               "amt": amount, "st": st, "sid": body.source_id, "u": uid})
    return {"data": {"obligation_id": oid, "adopted": True, "direction": direction}}


@router.get("/summary")
async def summary(user: dict = Depends(require_payment_unlock)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        rows = (await db.execute(text("""
            SELECT direction,
                   COALESCE(SUM(amount_fjd) FILTER (WHERE status IN ('OPEN','INSTRUCTED')),0) AS outstanding,
                   COALESCE(SUM(amount_fjd) FILTER (WHERE status='SETTLED'),0)                AS settled
            FROM tenant.payables GROUP BY direction
        """))).mappings().all()
    out = {d: {"outstanding": 0.0, "settled": 0.0} for d in _DIRECTIONS}
    for r in rows:
        out[r["direction"]] = {"outstanding": _f(r["outstanding"]), "settled": _f(r["settled"])}
    return {"data": {"to_pay": out["COLLECT"], "to_receive": out["RECEIVE"]}}


# ════════════════════════════════════════════════════════════════════════════
# Security: payments PIN gate. These routes are intentionally NOT behind
# require_payment_unlock (they're how you unlock). Data is already owner-only via
# JWT + RLS; the PIN protects an already-logged-in device. Verified loud, fail closed.
# ════════════════════════════════════════════════════════════════════════════
def _validate_pin(pin: str):
    if not (pin and pin.isdigit() and 4 <= len(pin) <= 6):
        raise HTTPException(status_code=400, detail="PIN must be 4–6 digits")
    if len(set(pin)) == 1:
        raise HTTPException(status_code=400, detail="Choose a less obvious PIN")


@router.get("/security/status")
async def security_status(user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    async with get_rls_db(str(user["tenant_id"])) as db:
        row = (await db.execute(text(
            "SELECT pin_hash, locked_until FROM tenant.payment_security WHERE user_id=cast(:u AS uuid)"),
            {"u": uid})).mappings().first()
    locked = bool(row and row["locked_until"] and row["locked_until"] > _now())
    return {"data": {"pin_set": bool(row), "locked": locked,
                     "locked_until": (row["locked_until"].isoformat() if locked else None),
                     "unlocked": await is_unlocked(uid)}}


class SetPin(BaseModel):
    pin: str
    current_pin: Optional[str] = None


@router.post("/security/set-pin")
async def set_pin(body: SetPin, user: dict = Depends(get_current_user)):
    _validate_pin(body.pin)
    uid = str(user["user_id"]); tid = str(user["tenant_id"])
    async with get_rls_db(tid) as db:
        row = (await db.execute(text(
            "SELECT pin_hash FROM tenant.payment_security WHERE user_id=cast(:u AS uuid)"),
            {"u": uid})).mappings().first()
        if row:
            if not (body.current_pin and verify_pin(body.current_pin, row["pin_hash"])):
                raise HTTPException(status_code=403, detail="Current PIN is incorrect")
            await db.execute(text(
                "UPDATE tenant.payment_security SET pin_hash=:h, failed_attempts=0, locked_until=NULL, "
                "updated_at=now() WHERE user_id=cast(:u AS uuid)"), {"h": hash_pin(body.pin), "u": uid})
        else:
            await db.execute(text(
                "INSERT INTO tenant.payment_security (user_id, tenant_id, pin_hash) "
                "VALUES (cast(:u AS uuid), cast(:t AS uuid), :h)"),
                {"u": uid, "t": tid, "h": hash_pin(body.pin)})
    ttl = await set_unlocked(uid)
    return {"data": {"pin_set": True, "unlocked": True, "ttl": ttl}}


class Unlock(BaseModel):
    pin: str


@router.post("/security/unlock")
async def unlock(body: Unlock, user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    async with get_rls_db(str(user["tenant_id"])) as db:
        row = (await db.execute(text(
            "SELECT pin_hash, failed_attempts, locked_until FROM tenant.payment_security "
            "WHERE user_id=cast(:u AS uuid)"), {"u": uid})).mappings().first()
        if not row:
            raise HTTPException(status_code=409, detail="No payments PIN set yet")
        if row["locked_until"] and row["locked_until"] > _now():
            raise HTTPException(status_code=423, detail="Too many attempts — locked. Try again later.")
        if verify_pin(body.pin, row["pin_hash"]):
            await db.execute(text(
                "UPDATE tenant.payment_security SET failed_attempts=0, locked_until=NULL, updated_at=now() "
                "WHERE user_id=cast(:u AS uuid)"), {"u": uid})
            ttl = await set_unlocked(uid)
            return {"data": {"unlocked": True, "ttl": ttl}}
        attempts = (row["failed_attempts"] or 0) + 1
        locked_until = None
        if attempts >= MAX_FAILED:
            locked_until = _now() + timedelta(seconds=LOCKOUT_SECONDS)
            attempts = 0
        await db.execute(text(
            "UPDATE tenant.payment_security SET failed_attempts=:a, locked_until=:lu, updated_at=now() "
            "WHERE user_id=cast(:u AS uuid)"), {"a": attempts, "lu": locked_until, "u": uid})
    if locked_until:
        raise HTTPException(status_code=423, detail="Too many attempts — locked for 15 minutes.")
    raise HTTPException(status_code=401, detail=f"Incorrect PIN · {MAX_FAILED - attempts} attempts left")


@router.post("/security/lock")
async def lock(user: dict = Depends(get_current_user)):
    await clear_unlocked(str(user["user_id"]))
    return {"data": {"unlocked": False}}


class ResetPin(BaseModel):
    password: str
    new_pin: str


@router.post("/security/reset")
async def reset_pin(body: ResetPin, user: dict = Depends(get_current_user)):
    """Forgot-PIN: re-authenticate with the account password, then set a new PIN."""
    _validate_pin(body.new_pin)
    uid = str(user["user_id"]); tid = str(user["tenant_id"])
    async with get_rls_db(tid) as db:
        ph = (await db.execute(text(
            "SELECT password_hash FROM tenant.users WHERE user_id=cast(:u AS uuid)"),
            {"u": uid})).scalar()
        if not ph or not pin_context.verify(body.password, ph):
            raise HTTPException(status_code=403, detail="Password is incorrect")
        exists = (await db.execute(text(
            "SELECT 1 FROM tenant.payment_security WHERE user_id=cast(:u AS uuid)"), {"u": uid})).scalar()
        if exists:
            await db.execute(text(
                "UPDATE tenant.payment_security SET pin_hash=:h, failed_attempts=0, locked_until=NULL, "
                "updated_at=now() WHERE user_id=cast(:u AS uuid)"), {"h": hash_pin(body.new_pin), "u": uid})
        else:
            await db.execute(text(
                "INSERT INTO tenant.payment_security (user_id, tenant_id, pin_hash) "
                "VALUES (cast(:u AS uuid), cast(:t AS uuid), :h)"),
                {"u": uid, "t": tid, "h": hash_pin(body.new_pin)})
    await set_unlocked(uid)
    return {"data": {"pin_set": True, "unlocked": True}}
