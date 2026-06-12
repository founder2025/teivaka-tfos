"""
partners.py — Farm partner network + land & profit-share agreement
(Partnerships page, prototype corePartnershipsView).

  GET    /partners?farm_id=            → all network partners for the farm
  POST   /partners                     → add partner (PARTNER_ADDED, hash-chained)
  PATCH  /partners/{partner_id}        → correct partner details (edit pencil)
  GET    /partnerships/agreement?farm_id= → the farm's land & profit-share
         agreement (farms.profit_share_* — display only when a rate is on
         record, per Inviolable #9: never invent a contractual figure)
  POST   /partnerships/agreement       → ratify/update the agreement on the
         farm record (PARTNERSHIP_CREATED, hash-chained)
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text

from app.core.audit_chain import emit_audit_event
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()

VALID_GROUPS = {"government", "commercial", "finance", "support", "development"}


def _rows(result):
    return [dict(r) for r in result.mappings().all()]


class PartnerCreate(BaseModel):
    farm_id: str
    partner_group: str
    partner_type: str
    name: str
    phone: Optional[str] = None
    notes: Optional[str] = None


class PartnerPatch(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class AgreementUpsert(BaseModel):
    farm_id: str
    profit_share_party: str
    profit_share_rate_pct: float
    notes: Optional[str] = None


@router.get("/partners")
async def list_partners(farm_id: str = Query(...), user: dict = Depends(get_current_user)):
    tid = str(user["tenant_id"])
    async with get_rls_db(tid) as db:
        r = await db.execute(text("""
            SELECT partner_id, farm_id, partner_group, partner_type, name, phone, notes,
                   is_active, created_at
            FROM tenant.farm_partners
            WHERE tenant_id = :tid AND farm_id = :fid AND is_active = TRUE
            ORDER BY partner_type, created_at
        """), {"tid": tid, "fid": farm_id})
        return {"data": _rows(r)}


@router.post("/partners", status_code=201)
async def add_partner(body: PartnerCreate, user: dict = Depends(get_current_user)):
    if body.partner_group not in VALID_GROUPS:
        raise HTTPException(400, detail=f"partner_group must be one of {sorted(VALID_GROUPS)}")
    if not body.name.strip():
        raise HTTPException(422, detail="A name is required")
    tid = str(user["tenant_id"])
    pid = f"PTR-{uuid.uuid4().hex[:8].upper()}"
    async with get_rls_db(tid) as db:
        farm = (await db.execute(text(
            "SELECT farm_id FROM tenant.farms WHERE farm_id = :fid AND tenant_id = :tid"),
            {"fid": body.farm_id, "tid": tid})).mappings().first()
        if not farm:
            raise HTTPException(404, detail="Farm not found")
        await db.execute(text("""
            INSERT INTO tenant.farm_partners
                (partner_id, tenant_id, farm_id, partner_group, partner_type, name, phone, notes, created_by)
            VALUES (:pid, :tid, :fid, :grp, :typ, :name, :phone, :notes, :uid)
        """), {"pid": pid, "tid": tid, "fid": body.farm_id, "grp": body.partner_group,
               "typ": body.partner_type, "name": body.name.strip(), "phone": body.phone,
               "notes": body.notes, "uid": str(user["user_id"])})
        await emit_audit_event(
            db=db, tenant_id=user["tenant_id"], actor_user_id=user["user_id"],
            event_type="PARTNER_ADDED", entity_type="FARM", entity_id=body.farm_id,
            payload={"partner_id": pid, "partner_group": body.partner_group,
                     "partner_type": body.partner_type, "name": body.name.strip()})
    return {"data": {"partner_id": pid}}


@router.patch("/partners/{partner_id}")
async def update_partner(partner_id: str, body: PartnerPatch, user: dict = Depends(get_current_user)):
    tid = str(user["tenant_id"])
    data = body.model_dump(exclude_unset=True)
    if not data:
        return {"data": {"updated": 0}}
    sets = ", ".join(f"{k} = :{k}" for k in data)  # keys fixed by PartnerPatch model
    data.update({"pid": partner_id, "tid": tid})
    async with get_rls_db(tid) as db:
        r = await db.execute(text(f"""
            UPDATE tenant.farm_partners SET {sets}, updated_at = now()
            WHERE partner_id = :pid AND tenant_id = :tid
            RETURNING partner_id
        """), data)
        if not r.mappings().first():
            raise HTTPException(404, detail="Partner not found")
    return {"data": {"partner_id": partner_id, "updated": len(data) - 2}}


@router.get("/partnerships/agreement")
async def get_agreement(farm_id: str = Query(...), user: dict = Depends(get_current_user)):
    tid = str(user["tenant_id"])
    async with get_rls_db(tid) as db:
        farm = (await db.execute(text("""
            SELECT farm_id, farm_name, profit_share_enabled, profit_share_rate_pct, profit_share_party
            FROM tenant.farms WHERE farm_id = :fid AND tenant_id = :tid
        """), {"fid": farm_id, "tid": tid})).mappings().first()
        if not farm:
            raise HTTPException(404, detail="Farm not found")
        # Inviolable #9: if no rate is on record there IS no agreement to show.
        if farm["profit_share_rate_pct"] is None or not farm["profit_share_enabled"]:
            return {"data": {"agreement": None}}
        return {"data": {"agreement": {
            "farm_id": farm["farm_id"],
            "party": farm["profit_share_party"],
            "rate_pct": float(farm["profit_share_rate_pct"]),
        }}}


@router.post("/partnerships/agreement")
async def upsert_agreement(body: AgreementUpsert, user: dict = Depends(get_current_user)):
    if not (0 < body.profit_share_rate_pct < 100):
        raise HTTPException(422, detail="Rate must be between 0 and 100")
    if not body.profit_share_party.strip():
        raise HTTPException(422, detail="Partner name is required")
    tid = str(user["tenant_id"])
    async with get_rls_db(tid) as db:
        r = await db.execute(text("""
            UPDATE tenant.farms
            SET profit_share_enabled = TRUE,
                profit_share_rate_pct = :rate,
                profit_share_party = :party,
                updated_at = now()
            WHERE farm_id = :fid AND tenant_id = :tid
            RETURNING farm_id
        """), {"rate": body.profit_share_rate_pct, "party": body.profit_share_party.strip(),
               "fid": body.farm_id, "tid": tid})
        if not r.mappings().first():
            raise HTTPException(404, detail="Farm not found")
        await emit_audit_event(
            db=db, tenant_id=user["tenant_id"], actor_user_id=user["user_id"],
            event_type="PARTNERSHIP_CREATED", entity_type="FARM", entity_id=body.farm_id,
            payload={"party": body.profit_share_party.strip(),
                     "rate_pct": body.profit_share_rate_pct,
                     "notes": body.notes})
    return {"data": {"farm_id": body.farm_id, "rate_pct": body.profit_share_rate_pct}}
