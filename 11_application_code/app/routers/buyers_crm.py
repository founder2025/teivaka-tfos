"""buyers_crm.py — Buyers CRM: demand signals, sales pipeline (leads), disputes.

Backs the prototype's Demand / Pipeline views + per-buyer Disputes with real, RLS-scoped,
hash-chained records (Buyers S3). Mounted under /api/v1.

  GET/POST   /demand-signals[?farm_id=&customer_id=]   PATCH /demand-signals/{id}/status
  GET/POST   /leads[?farm_id=]                          PATCH /leads/{id}/stage
  GET/POST   /disputes[?farm_id=&customer_id=]          PATCH /disputes/{id}/resolve
"""
import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text

from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from app.core.audit_chain import emit_audit_event

router = APIRouter()


def _rows(result):
    return [dict(r) for r in result.mappings().all()]


# ───────────────────────── demand signals ─────────────────────────
class DemandSignalCreate(BaseModel):
    customer_id: str
    farm_id: Optional[str] = None
    crop_type: Optional[str] = None
    grade: Optional[str] = None
    quantity_kg: Optional[float] = None
    avg_price_fjd: Optional[float] = None
    frequency: Optional[str] = None
    preferred_day: Optional[str] = None
    confidence: str = "medium"
    notes: Optional[str] = None


@router.get("/demand-signals")
async def list_demand_signals(farm_id: str = Query(None), customer_id: str = Query(None), user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        clauses, params = ["tenant_id = :tid"], {"tid": str(user["tenant_id"])}
        if farm_id: clauses.append("farm_id = :fid"); params["fid"] = farm_id
        if customer_id: clauses.append("customer_id = :cid"); params["cid"] = customer_id
        r = await db.execute(text(f"SELECT * FROM tenant.buyer_demand_signals WHERE {' AND '.join(clauses)} ORDER BY created_at DESC"), params)
        return {"data": _rows(r)}


@router.post("/demand-signals", status_code=201)
async def create_demand_signal(body: DemandSignalCreate, user: dict = Depends(get_current_user)):
    if body.confidence not in ("high", "medium", "low"):
        raise HTTPException(400, detail="confidence must be high|medium|low")
    tid = str(user["tenant_id"]); sid = f"DMD-{uuid.uuid4().hex[:8].upper()}"
    async with get_rls_db(tid) as db:
        await db.execute(text("""
            INSERT INTO tenant.buyer_demand_signals
                (signal_id, tenant_id, farm_id, customer_id, crop_type, grade, quantity_kg, avg_price_fjd,
                 frequency, preferred_day, confidence, notes, created_by)
            VALUES (:id, :tid, :fid, :cid, :crop, :grade, :qty, :price, :freq, :day, :conf, :notes, :uid)
        """), {"id": sid, "tid": tid, "fid": body.farm_id, "cid": body.customer_id, "crop": body.crop_type,
               "grade": body.grade, "qty": body.quantity_kg, "price": body.avg_price_fjd, "freq": body.frequency,
               "day": body.preferred_day, "conf": body.confidence, "notes": body.notes, "uid": str(user["user_id"])})
        await emit_audit_event(db=db, tenant_id=user["tenant_id"], actor_user_id=user["user_id"],
                               event_type="DEMAND_SIGNAL_LOGGED", entity_type="CUSTOMER", entity_id=body.customer_id,
                               payload={"signal_id": sid, "customer_id": body.customer_id, "crop_type": body.crop_type, "confidence": body.confidence})
    return {"data": {"signal_id": sid}}


@router.patch("/demand-signals/{signal_id}/status")
async def set_demand_status(signal_id: str, status: str = Query(...), user: dict = Depends(get_current_user)):
    if status not in ("active", "paused"):
        raise HTTPException(400, detail="status must be active|paused")
    async with get_rls_db(str(user["tenant_id"])) as db:
        r = await db.execute(text("UPDATE tenant.buyer_demand_signals SET status=:s WHERE signal_id=:id AND tenant_id=:tid RETURNING signal_id"),
                             {"s": status, "id": signal_id, "tid": str(user["tenant_id"])})
        if not r.first(): raise HTTPException(404, detail="signal not found")
    return {"data": {"signal_id": signal_id, "status": status}}


# ───────────────────────── pipeline / leads ─────────────────────────
class LeadCreate(BaseModel):
    prospect_name: str
    farm_id: Optional[str] = None
    prospect_type: Optional[str] = None
    city: Optional[str] = None
    potential_monthly_fjd: Optional[float] = None
    stage: str = "lead"
    next_action: Optional[str] = None
    next_action_date: Optional[date] = None
    notes: Optional[str] = None


_STAGES = ("lead", "qualified", "negotiating", "won", "lost")


@router.get("/leads")
async def list_leads(farm_id: str = Query(None), user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        clauses, params = ["tenant_id = :tid"], {"tid": str(user["tenant_id"])}
        if farm_id: clauses.append("farm_id = :fid"); params["fid"] = farm_id
        r = await db.execute(text(f"SELECT * FROM tenant.buyer_leads WHERE {' AND '.join(clauses)} ORDER BY updated_at DESC"), params)
        return {"data": _rows(r)}


@router.post("/leads", status_code=201)
async def create_lead(body: LeadCreate, user: dict = Depends(get_current_user)):
    if body.stage not in _STAGES:
        raise HTTPException(400, detail=f"stage must be one of {_STAGES}")
    tid = str(user["tenant_id"]); lid = f"LEAD-{uuid.uuid4().hex[:8].upper()}"
    async with get_rls_db(tid) as db:
        await db.execute(text("""
            INSERT INTO tenant.buyer_leads
                (lead_id, tenant_id, farm_id, prospect_name, prospect_type, city, potential_monthly_fjd,
                 stage, next_action, next_action_date, notes, created_by)
            VALUES (:id, :tid, :fid, :name, :type, :city, :pot, :stage, :na, :nad, :notes, :uid)
        """), {"id": lid, "tid": tid, "fid": body.farm_id, "name": body.prospect_name.strip(), "type": body.prospect_type,
               "city": body.city, "pot": body.potential_monthly_fjd, "stage": body.stage, "na": body.next_action,
               "nad": body.next_action_date, "notes": body.notes, "uid": str(user["user_id"])})
        await emit_audit_event(db=db, tenant_id=user["tenant_id"], actor_user_id=user["user_id"],
                               event_type="LEAD_LOGGED", entity_type="LEAD", entity_id=lid,
                               payload={"lead_id": lid, "prospect_name": body.prospect_name, "stage": body.stage})
    return {"data": {"lead_id": lid}}


@router.patch("/leads/{lead_id}/stage")
async def set_lead_stage(lead_id: str, stage: str = Query(...), user: dict = Depends(get_current_user)):
    if stage not in _STAGES:
        raise HTTPException(400, detail=f"stage must be one of {_STAGES}")
    async with get_rls_db(str(user["tenant_id"])) as db:
        r = await db.execute(text("UPDATE tenant.buyer_leads SET stage=:s, updated_at=now() WHERE lead_id=:id AND tenant_id=:tid RETURNING lead_id"),
                             {"s": stage, "id": lead_id, "tid": str(user["tenant_id"])})
        if not r.first(): raise HTTPException(404, detail="lead not found")
    return {"data": {"lead_id": lead_id, "stage": stage}}


# ───────────────────────── disputes ─────────────────────────
class DisputeCreate(BaseModel):
    customer_id: str
    farm_id: Optional[str] = None
    order_id: Optional[str] = None
    dispute_date: Optional[date] = None
    reason: Optional[str] = None
    description: Optional[str] = None
    quantity_kg: Optional[float] = None
    financial_impact_fjd: Optional[float] = None


@router.get("/disputes")
async def list_disputes(farm_id: str = Query(None), customer_id: str = Query(None), user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        clauses, params = ["tenant_id = :tid"], {"tid": str(user["tenant_id"])}
        if farm_id: clauses.append("farm_id = :fid"); params["fid"] = farm_id
        if customer_id: clauses.append("customer_id = :cid"); params["cid"] = customer_id
        r = await db.execute(text(f"SELECT * FROM tenant.buyer_disputes WHERE {' AND '.join(clauses)} ORDER BY dispute_date DESC"), params)
        return {"data": _rows(r)}


@router.post("/disputes", status_code=201)
async def create_dispute(body: DisputeCreate, user: dict = Depends(get_current_user)):
    tid = str(user["tenant_id"]); did = f"DIS-{uuid.uuid4().hex[:8].upper()}"
    ddate = body.dispute_date or date.today()
    async with get_rls_db(tid) as db:
        await db.execute(text("""
            INSERT INTO tenant.buyer_disputes
                (dispute_id, tenant_id, farm_id, customer_id, order_id, dispute_date, reason, description,
                 quantity_kg, financial_impact_fjd, created_by)
            VALUES (:id, :tid, :fid, :cid, :oid, :d, :reason, :descr, :qty, :impact, :uid)
        """), {"id": did, "tid": tid, "fid": body.farm_id, "cid": body.customer_id, "oid": body.order_id, "d": ddate,
               "reason": body.reason, "descr": body.description, "qty": body.quantity_kg,
               "impact": body.financial_impact_fjd, "uid": str(user["user_id"])})
        await emit_audit_event(db=db, tenant_id=user["tenant_id"], actor_user_id=user["user_id"],
                               event_type="DISPUTE_LOGGED", entity_type="CUSTOMER", entity_id=body.customer_id,
                               payload={"dispute_id": did, "customer_id": body.customer_id, "reason": body.reason, "order_id": body.order_id})
    return {"data": {"dispute_id": did}}


class DisputeResolve(BaseModel):
    resolution: str
    resolution_amount_fjd: Optional[float] = None


@router.patch("/disputes/{dispute_id}/resolve")
async def resolve_dispute(dispute_id: str, body: DisputeResolve, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        r = await db.execute(text("""
            UPDATE tenant.buyer_disputes
               SET status='resolved', resolution=:res, resolution_amount_fjd=:amt, resolved_at=now()
             WHERE dispute_id=:id AND tenant_id=:tid RETURNING dispute_id
        """), {"res": body.resolution, "amt": body.resolution_amount_fjd, "id": dispute_id, "tid": str(user["tenant_id"])})
        if not r.first(): raise HTTPException(404, detail="dispute not found")
    return {"data": {"dispute_id": dispute_id, "status": "resolved"}}
