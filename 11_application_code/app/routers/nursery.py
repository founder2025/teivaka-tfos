from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
from typing import Optional
import uuid

router = APIRouter()

class NurseryBatchCreate(BaseModel):
    farm_id: str
    production_id: str
    batch_code: Optional[str] = None
    variety: Optional[str] = None
    seed_source: Optional[str] = None  # e.g. "FNPF Seed Bank", "Own Saved Seed", "SPC"
    sowing_date: datetime
    germination_medium: Optional[str] = None  # COCOPEAT, SOIL_MIX, SAND_LOAM
    tray_count: Optional[int] = None
    seeds_per_tray: Optional[int] = None
    total_seeds_sown: int
    germination_rate_pct: Optional[Decimal] = None
    seedlings_ready: Optional[int] = None
    expected_transplant_date: Optional[datetime] = None
    actual_transplant_date: Optional[datetime] = None
    seed_cost_fjd: Optional[Decimal] = None
    other_cost_fjd: Optional[Decimal] = None
    notes: Optional[str] = None

@router.get("")
async def list_nursery(farm_id: str = None, production_id: str = None, status: str = None, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"])}
        q = """SELECT nb.*, p.production_name, p.production_category
               FROM tenant.nursery_batches nb
               JOIN shared.productions p ON p.production_id = nb.production_id
               WHERE nb.tenant_id = :tid"""
        if farm_id:
            q += " AND nb.farm_id = :farm_id"
            params["farm_id"] = farm_id
        if production_id:
            q += " AND nb.production_id = :production_id"
            params["production_id"] = production_id
        if status:
            q += " AND nb.batch_status = :status"
            params["status"] = status
        result = await db.execute(text(q + " ORDER BY nb.sowing_date DESC LIMIT 100"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/{batch_id}")
async def get_nursery_batch(batch_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("SELECT nb.*, p.production_name FROM tenant.nursery_batches nb JOIN shared.productions p ON p.production_id = nb.production_id WHERE nb.batch_id = :batch_id AND nb.tenant_id = :tid"),
            {"batch_id": batch_id, "tid": str(user["tenant_id"])}
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Nursery batch not found")
        return {"data": dict(row)}

@router.post("")
async def log_nursery_batch(body: NurseryBatchCreate, user: dict = Depends(get_current_user)):
    batch_id = f"NRS-{uuid.uuid4().hex[:6].upper()}"
    batch_code = body.batch_code or f"{body.production_id[:3].upper()}-{datetime.now().strftime('%y%m%d')}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO tenant.nursery_batches
                (batch_id, tenant_id, farm_id, production_id, batch_code, variety, seed_source,
                 sowing_date, germination_medium, tray_count, seeds_per_tray, total_seeds_sown,
                 germination_rate_pct, seedlings_ready, expected_transplant_date,
                 actual_transplant_date, seed_cost_fjd, other_cost_fjd, notes, created_by)
            VALUES
                (:batch_id, :tenant_id, :farm_id, :production_id, :batch_code, :variety, :seed_source,
                 :sowing_date, :germination_medium, :tray_count, :seeds_per_tray, :total_seeds_sown,
                 :germination_rate_pct, :seedlings_ready, :expected_transplant_date,
                 :actual_transplant_date, :seed_cost_fjd, :other_cost_fjd, :notes, :created_by)
        """), {
            "batch_id": batch_id,
            "tenant_id": str(user["tenant_id"]),
            "farm_id": body.farm_id,
            "production_id": body.production_id,
            "batch_code": batch_code,
            "variety": body.variety,
            "seed_source": body.seed_source,
            "sowing_date": body.sowing_date,
            "germination_medium": body.germination_medium,
            "tray_count": body.tray_count,
            "seeds_per_tray": body.seeds_per_tray,
            "total_seeds_sown": body.total_seeds_sown,
            "germination_rate_pct": body.germination_rate_pct,
            "seedlings_ready": body.seedlings_ready,
            "expected_transplant_date": body.expected_transplant_date,
            "actual_transplant_date": body.actual_transplant_date,
            "seed_cost_fjd": body.seed_cost_fjd,
            "other_cost_fjd": body.other_cost_fjd,
            "notes": body.notes,
            "created_by": str(user["user_id"]),
        })
    return {"data": {"batch_id": batch_id, "batch_code": batch_code}}
