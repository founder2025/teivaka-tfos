"""Agricultural Passport — TATI Phase 1 (read-model).

The Passport is a living professional portfolio that auto-grows from TFOS activity.
GOVERNING PRINCIPLE: the farmer manages their farm once; Teivaka builds the passport
without duplicate entry. So this endpoint is almost entirely a PROJECTION of existing
tables — identity, farm, production, sales, reputation — plus the few manual fields in
tenant.passport_profile (photo / bio / languages).

Phase 1 deliberately does NOT compute trust scores (Phase 2) or expose sharing
(Phase 3). Trust shows an honest "Building" with the real evidence counts behind it.

Routes (mounted at /api/v1):
  GET /passport/me
  GET /passport/me/profile        PUT /passport/me/profile   (the only manual fields)
"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.rls import get_current_user, get_tenant_db
from app.schemas.envelope import success_envelope

router = APIRouter()

_ACTIVE = ("PLANNED", "ACTIVE", "HARVESTING", "CLOSING")


@router.get("/passport/me")
async def get_my_passport(
    db: AsyncSession = Depends(get_tenant_db),
    user: dict = Depends(get_current_user),
):
    """Assemble the Agricultural Passport read-model from existing data (no duplicate
    entry). Honest-empty where a real source doesn't exist yet."""
    uid = str(user["user_id"])

    u = (await db.execute(text(
        "SELECT full_name, email, whatsapp_number, created_at FROM tenant.users WHERE user_id = cast(:u AS uuid)"
    ), {"u": uid})).mappings().first() or {}

    prof = (await db.execute(text(
        "SELECT preferred_name, bio, languages, professional_photo_url FROM tenant.passport_profile WHERE user_id = cast(:u AS uuid)"
    ), {"u": uid})).mappings().first() or {}

    farms = (await db.execute(text("""
        SELECT f.farm_id, f.farm_name, f.location_island, f.created_at,
               COALESCE((SELECT SUM(area_sqm) FROM tenant.production_units pu
                          WHERE pu.farm_id = f.farm_id AND pu.is_active = TRUE), 0) AS area_sqm,
               (SELECT COUNT(*) FROM tenant.production_units pu
                  WHERE pu.farm_id = f.farm_id AND pu.is_active = TRUE) AS block_count
        FROM tenant.farms f
        WHERE f.is_active = TRUE
        ORDER BY f.created_at, f.farm_id
    """))).mappings().all()

    # Reputation — projected counts (the evidence behind "Building").
    seasons = (await db.execute(text(
        "SELECT COUNT(*) FROM tenant.production_cycles WHERE cycle_status = 'CLOSED'"
    ))).scalar() or 0
    active_cycles = (await db.execute(text(
        "SELECT COUNT(*) FROM tenant.production_cycles WHERE cycle_status IN ('ACTIVE','HARVESTING','CLOSING')"
    ))).scalar() or 0
    harvest = (await db.execute(text(
        "SELECT COALESCE(SUM(gross_yield_kg),0) AS kg, COUNT(*) AS n FROM tenant.harvest_log"
    ))).mappings().first() or {}
    sales = (await db.execute(text(
        "SELECT COALESCE(SUM(amount_fjd),0) AS fjd, COUNT(*) AS n FROM tenant.cash_ledger WHERE transaction_type='INCOME'"
    ))).mappings().first() or {}
    photos = (await db.execute(text(
        "SELECT COUNT(*) FROM tenant.field_events WHERE photo_url IS NOT NULL AND deleted_at IS NULL"
    ))).scalar() or 0

    created = u.get("created_at")
    member_since = created.date().isoformat() if created else None

    # Honest verification chips (Phase 1 — real signals only; full claim model is Phase 2/3).
    verifications = {
        "email": bool(u.get("email")),          # email captured at signup
        "phone": bool(u.get("whatsapp_number")),
        "farm": len(farms) > 0,                  # a farm exists
        "identity": False,                       # no third-party KYC yet (Phase 5) — honest false
    }

    return success_envelope({
        "identity": {
            "preferred_name": prof.get("preferred_name") or u.get("full_name"),
            "legal_name": u.get("full_name"),
            "farmer_id": (farms[0]["farm_id"] if farms else uid[:8].upper()),
            "photo_url": prof.get("professional_photo_url"),
            "bio": prof.get("bio"),
            "languages": prof.get("languages") or [],
            "email": u.get("email"),
            "phone": u.get("whatsapp_number"),
            "member_since": member_since,
            "verifications": verifications,
        },
        "farms": [{
            "farm_id": f["farm_id"], "farm_name": f["farm_name"],
            "location": f["location_island"], "area_ha": round(float(f["area_sqm"] or 0) / 10000.0, 2),
            "blocks": int(f["block_count"] or 0),
        } for f in farms],
        "reputation": {
            "seasons_completed": int(seasons),
            "active_cycles": int(active_cycles),
            "verified_production_kg": round(float(harvest.get("kg") or 0), 1),
            "harvest_records": int(harvest.get("n") or 0),
            "total_sales_fjd": round(float(sales.get("fjd") or 0), 2),
            "sales_records": int(sales.get("n") or 0),
            "photo_evidence": int(photos),
        },
        # Phase 2 fills this with the real Trust Engine; Phase 1 is honest "Building".
        "trust": {
            "status": "building",
            "headline": "Your reputation is building from your records",
            "note": "Every season, harvest, sale and photo strengthens your verified reputation. "
                    "Scored trust dimensions arrive as your evidence accumulates.",
        },
    })


class ProfileUpdate(BaseModel):
    preferred_name: Optional[str] = Field(None, max_length=120)
    bio: Optional[str] = Field(None, max_length=1000)
    languages: Optional[list[str]] = None
    professional_photo_url: Optional[str] = Field(None, max_length=500)
    photo_sha256: Optional[str] = Field(None, max_length=64)


@router.get("/passport/me/profile")
async def get_my_profile(
    db: AsyncSession = Depends(get_tenant_db),
    user: dict = Depends(get_current_user),
):
    row = (await db.execute(text(
        "SELECT preferred_name, bio, languages, professional_photo_url FROM tenant.passport_profile "
        "WHERE user_id = cast(:u AS uuid)"
    ), {"u": str(user["user_id"])})).mappings().first()
    return success_envelope(dict(row) if row else {})


@router.put("/passport/me/profile")
async def update_my_profile(
    body: ProfileUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    user: dict = Depends(get_current_user),
):
    """Upsert the few manual passport fields — the ONLY thing the farmer edits here."""
    await db.execute(text("""
        INSERT INTO tenant.passport_profile
            (user_id, tenant_id, preferred_name, bio, languages, professional_photo_url, photo_sha256, updated_at)
        VALUES (cast(:u AS uuid), cast(:t AS uuid), :pn, :bio, :langs, :photo, :sha, now())
        ON CONFLICT (user_id) DO UPDATE SET
            preferred_name = EXCLUDED.preferred_name,
            bio = EXCLUDED.bio,
            languages = EXCLUDED.languages,
            professional_photo_url = COALESCE(EXCLUDED.professional_photo_url, tenant.passport_profile.professional_photo_url),
            photo_sha256 = COALESCE(EXCLUDED.photo_sha256, tenant.passport_profile.photo_sha256),
            updated_at = now()
    """), {"u": str(user["user_id"]), "t": str(user["tenant_id"]),
           "pn": body.preferred_name, "bio": body.bio, "langs": body.languages,
           "photo": body.professional_photo_url, "sha": body.photo_sha256})
    return success_envelope({"updated": True})
