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

class HiveCreate(BaseModel):
    farm_id: str
    hive_code: str  # e.g. HIVE-001
    hive_type: str = "LANGSTROTH"  # LANGSTROTH, TOP_BAR, LOG_HIVE
    zone_id: Optional[str] = None
    installation_date: Optional[datetime] = None
    queen_age_months: Optional[int] = None
    colony_strength: str = "MEDIUM"  # WEAK, MEDIUM, STRONG
    notes: Optional[str] = None

class HiveInspectionUpdate(BaseModel):
    inspection_date: datetime
    colony_strength: Optional[str] = None  # WEAK, MEDIUM, STRONG
    queen_present: Optional[bool] = None
    brood_pattern: Optional[str] = None  # GOOD, SPOTTY, POOR
    honey_frames: Optional[int] = None
    pest_signs: Optional[bool] = None
    pest_description: Optional[str] = None
    honey_extracted_kg: Optional[Decimal] = None
    honey_value_fjd: Optional[Decimal] = None
    treatment_applied: Optional[str] = None
    next_inspection_due: Optional[datetime] = None
    notes: Optional[str] = None

@router.get("")
async def list_hives(farm_id: str = None, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"])}
        q = """SELECT h.*, z.zone_name,
                      COUNT(hi.inspection_id) AS total_inspections,
                      MAX(hi.inspection_date) AS last_inspection_date
               FROM tenant.apiculture_hives h
               LEFT JOIN tenant.zones z ON z.zone_id = h.zone_id
               LEFT JOIN tenant.apiculture_inspections hi ON hi.hive_id = h.hive_id
               WHERE h.tenant_id = :tid AND h.is_active = true"""
        if farm_id:
            q += " AND h.farm_id = :farm_id"
            params["farm_id"] = farm_id
        q += " GROUP BY h.hive_id, z.zone_name ORDER BY h.hive_code"
        result = await db.execute(text(q), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/{hive_id}")
async def get_hive(hive_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("SELECT * FROM tenant.apiculture_hives WHERE hive_id = :hive_id AND tenant_id = :tid"),
            {"hive_id": hive_id, "tid": str(user["tenant_id"])}
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Hive not found")
        # Also fetch last 5 inspections
        insp = await db.execute(
            text("SELECT * FROM tenant.apiculture_inspections WHERE hive_id = :hive_id ORDER BY inspection_date DESC LIMIT 5"),
            {"hive_id": hive_id}
        )
        return {"data": dict(row), "inspections": [dict(r) for r in insp.mappings().all()]}

@router.post("")
async def create_hive(body: HiveCreate, user: dict = Depends(get_current_user)):
    hive_id = f"HIV-{uuid.uuid4().hex[:6].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO tenant.apiculture_hives
                (hive_id, tenant_id, farm_id, hive_code, hive_type, zone_id,
                 installation_date, queen_age_months, colony_strength, notes, created_by)
            VALUES
                (:hive_id, :tenant_id, :farm_id, :hive_code, :hive_type, :zone_id,
                 :installation_date, :queen_age_months, :colony_strength, :notes, :created_by)
        """), {
            "hive_id": hive_id,
            "tenant_id": str(user["tenant_id"]),
            "farm_id": body.farm_id,
            "hive_code": body.hive_code,
            "hive_type": body.hive_type,
            "zone_id": body.zone_id,
            "installation_date": body.installation_date,
            "queen_age_months": body.queen_age_months,
            "colony_strength": body.colony_strength,
            "notes": body.notes,
            "created_by": str(user["user_id"]),
        })
    return {"data": {"hive_id": hive_id, "hive_code": body.hive_code}}

@router.patch("/{hive_id}")
async def update_hive_inspection(hive_id: str, body: HiveInspectionUpdate, user: dict = Depends(get_current_user)):
    inspection_id = f"INS-{uuid.uuid4().hex[:6].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        # Verify hive belongs to tenant
        result = await db.execute(
            text("SELECT hive_id FROM tenant.apiculture_hives WHERE hive_id = :hive_id AND tenant_id = :tid"),
            {"hive_id": hive_id, "tid": str(user["tenant_id"])}
        )
        if not result.mappings().first():
            raise HTTPException(status_code=404, detail="Hive not found")

        await db.execute(text("""
            INSERT INTO tenant.apiculture_inspections
                (inspection_id, tenant_id, hive_id, inspection_date, colony_strength,
                 queen_present, brood_pattern, honey_frames, pest_signs, pest_description,
                 honey_extracted_kg, honey_value_fjd, treatment_applied,
                 next_inspection_due, notes, created_by)
            VALUES
                (:inspection_id, :tenant_id, :hive_id, :inspection_date, :colony_strength,
                 :queen_present, :brood_pattern, :honey_frames, :pest_signs, :pest_description,
                 :honey_extracted_kg, :honey_value_fjd, :treatment_applied,
                 :next_inspection_due, :notes, :created_by)
        """), {
            "inspection_id": inspection_id,
            "tenant_id": str(user["tenant_id"]),
            "hive_id": hive_id,
            "inspection_date": body.inspection_date,
            "colony_strength": body.colony_strength,
            "queen_present": body.queen_present,
            "brood_pattern": body.brood_pattern,
            "honey_frames": body.honey_frames,
            "pest_signs": body.pest_signs,
            "pest_description": body.pest_description,
            "honey_extracted_kg": body.honey_extracted_kg,
            "honey_value_fjd": body.honey_value_fjd,
            "treatment_applied": body.treatment_applied,
            "next_inspection_due": body.next_inspection_due,
            "notes": body.notes,
            "created_by": str(user["user_id"]),
        })
        # Update hive's colony_strength and last inspection date
        if body.colony_strength:
            await db.execute(
                text("UPDATE tenant.apiculture_hives SET colony_strength = :cs, last_inspection_date = :lid, updated_at = now() WHERE hive_id = :hive_id"),
                {"cs": body.colony_strength, "lid": body.inspection_date, "hive_id": hive_id}
            )
    return {"data": {"inspection_id": inspection_id, "hive_id": hive_id}}
