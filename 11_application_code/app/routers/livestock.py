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

class LivestockCreate(BaseModel):
    farm_id: str
    species: str  # CATTLE, GOAT, PIG, CHICKEN, DUCK, SHEEP, OTHER
    breed: Optional[str] = None
    tag_number: Optional[str] = None
    sex: str = "UNKNOWN"  # MALE, FEMALE, UNKNOWN
    dob: Optional[datetime] = None
    acquisition_date: datetime
    acquisition_type: str = "PURCHASE"  # PURCHASE, BIRTH, TRANSFER
    acquisition_cost_fjd: Optional[Decimal] = None
    weight_kg_at_acquisition: Optional[Decimal] = None
    current_weight_kg: Optional[Decimal] = None
    health_status: str = "HEALTHY"  # HEALTHY, SICK, QUARANTINE, DECEASED
    zone_id: Optional[str] = None
    notes: Optional[str] = None

@router.get("")
async def list_livestock(
    farm_id: str = None,
    species: str = None,
    health_status: str = None,
    user: dict = Depends(get_current_user),
):
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"tid": str(user["tenant_id"])}
        q = """SELECT l.*, z.zone_name
               FROM tenant.livestock l
               LEFT JOIN tenant.zones z ON z.zone_id = l.zone_id
               WHERE l.tenant_id = :tid AND l.is_active = true"""
        if farm_id:
            q += " AND l.farm_id = :farm_id"
            params["farm_id"] = farm_id
        if species:
            q += " AND l.species = :species"
            params["species"] = species
        if health_status:
            q += " AND l.health_status = :health_status"
            params["health_status"] = health_status
        result = await db.execute(text(q + " ORDER BY l.species, l.tag_number"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/{animal_id}")
async def get_animal(animal_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("SELECT * FROM tenant.livestock WHERE animal_id = :animal_id AND tenant_id = :tid"),
            {"animal_id": animal_id, "tid": str(user["tenant_id"])}
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Animal not found")
        return {"data": dict(row)}

@router.post("")
async def register_animal(body: LivestockCreate, user: dict = Depends(get_current_user)):
    animal_id = f"ANM-{body.species[:3].upper()}-{uuid.uuid4().hex[:5].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO tenant.livestock
                (animal_id, tenant_id, farm_id, species, breed, tag_number, sex, dob,
                 acquisition_date, acquisition_type, acquisition_cost_fjd,
                 weight_kg_at_acquisition, current_weight_kg, health_status, zone_id, notes, created_by)
            VALUES
                (:animal_id, :tenant_id, :farm_id, :species, :breed, :tag_number, :sex, :dob,
                 :acquisition_date, :acquisition_type, :acquisition_cost_fjd,
                 :weight_kg_at_acq, :current_weight_kg, :health_status, :zone_id, :notes, :created_by)
        """), {
            "animal_id": animal_id,
            "tenant_id": str(user["tenant_id"]),
            "farm_id": body.farm_id,
            "species": body.species,
            "breed": body.breed,
            "tag_number": body.tag_number,
            "sex": body.sex,
            "dob": body.dob,
            "acquisition_date": body.acquisition_date,
            "acquisition_type": body.acquisition_type,
            "acquisition_cost_fjd": body.acquisition_cost_fjd,
            "weight_kg_at_acq": body.weight_kg_at_acquisition,
            "current_weight_kg": body.current_weight_kg,
            "health_status": body.health_status,
            "zone_id": body.zone_id,
            "notes": body.notes,
            "created_by": str(user["user_id"]),
        })
    return {"data": {"animal_id": animal_id, "species": body.species, "tag_number": body.tag_number}}

@router.patch("/{animal_id}/health")
async def update_health_status(animal_id: str, health_status: str, notes: str = None, user: dict = Depends(get_current_user)):
    valid_statuses = ("HEALTHY", "SICK", "QUARANTINE", "DECEASED", "SOLD", "SLAUGHTERED")
    if health_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"health_status must be one of {valid_statuses}")
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(
            text("UPDATE tenant.livestock SET health_status = :status, notes = COALESCE(:notes, notes), updated_at = now() WHERE animal_id = :animal_id AND tenant_id = :tid"),
            {"status": health_status, "notes": notes, "animal_id": animal_id, "tid": str(user["tenant_id"])}
        )
    return {"data": {"animal_id": animal_id, "health_status": health_status}}
