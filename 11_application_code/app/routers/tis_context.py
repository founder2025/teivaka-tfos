"""tis_context — Phase 6: append-only farm activity that TIS reads as grounded memory.

POST /tis-context/teach  — append a "this happened" note (the Teach TIS action).
GET  /tis-context        — recent activity for a farm (optionally one block).

The store is read by tis_service.assemble_farm_context so TIS answers from real
logged activity, never invention (Inviolable #1). Tenant-scoped via RLS.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Any
import json as _json
from sqlalchemy import text

from app.db.session import get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()


class TeachIn(BaseModel):
    farm_id: str
    summary: str
    kind: str = "NOTE"
    pu_id: Optional[str] = None
    cycle_id: Optional[str] = None
    payload: Optional[dict[str, Any]] = None
    source: str = "manual"


@router.post("/teach")
async def teach(body: TeachIn, user: dict = Depends(get_current_user)):
    if not body.summary.strip():
        raise HTTPException(status_code=422, detail="summary required")
    tid = str(user["tenant_id"])
    uid = str(user.get("user_id")) if user.get("user_id") else None
    async with get_rls_db(tid) as db:
        r = await db.execute(
            text("""INSERT INTO tenant.farm_activity_context
                        (tenant_id, farm_id, pu_id, cycle_id, kind, summary, payload, source, created_by)
                    VALUES (:tid, :farm, :pu, :cyc, :kind, :summary,
                            CAST(:payload AS jsonb), :source, CAST(:uid AS uuid))
                 RETURNING activity_id, occurred_at"""),
            {"tid": tid, "farm": body.farm_id, "pu": body.pu_id, "cyc": body.cycle_id,
             "kind": body.kind.strip().upper()[:40], "summary": body.summary.strip()[:500],
             "payload": _json.dumps(body.payload or {}), "source": body.source, "uid": uid},
        )
        row = r.mappings().first()
    return {"ok": True, "activity_id": str(row["activity_id"]), "occurred_at": row["occurred_at"].isoformat()}


@router.get("")
async def list_context(farm_id: str, pu_id: Optional[str] = None, limit: int = 30,
                       user: dict = Depends(get_current_user)):
    tid = str(user["tenant_id"])
    q = """SELECT activity_id, farm_id, pu_id, cycle_id, kind, summary, source, occurred_at
             FROM tenant.farm_activity_context
            WHERE tenant_id = :tid AND farm_id = :farm"""
    params = {"tid": tid, "farm": farm_id, "limit": min(limit, 100)}
    if pu_id:
        q += " AND pu_id = :pu"
        params["pu"] = pu_id
    q += " ORDER BY occurred_at DESC LIMIT :limit"
    async with get_rls_db(tid) as db:
        rows = [dict(r) for r in (await db.execute(text(q), params)).mappings().all()]
    for r in rows:
        r["activity_id"] = str(r["activity_id"])
        if r.get("occurred_at"):
            r["occurred_at"] = r["occurred_at"].isoformat()
    return {"data": rows, "count": len(rows)}
