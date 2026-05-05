"""crop_varieties.py — read-only shared.crop_varieties catalog.

Routes:
  GET /api/v1/crop-varieties?production_id={id}  → varieties + synthetic OTHER

Used by the Strike #100 PLANTING + TRANSPLANT_LOGGED forms to populate
the VARIETY dropdown. shared.crop_varieties is a tenant-agnostic seed
table; auth gate kept for consistency with other catalog endpoints
(productions, chemicals).

Response always appends a synthetic {variety_id: "OTHER", variety_name:
"Other (specify)"} entry so the frontend can offer a free-text fallback
without a separate API contract.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.rls import get_current_user
from app.db.session import get_db
from app.schemas.envelope import success_envelope

router = APIRouter()


@router.get("", summary="List crop varieties for a given production_id")
async def list_crop_varieties(
    production_id: str = Query(..., description="FK to shared.productions"),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            text(
                """
                SELECT variety_id,
                       production_id,
                       variety_name,
                       local_name
                FROM shared.crop_varieties
                WHERE production_id = :production_id
                  AND is_active = TRUE
                ORDER BY variety_name
                """
            ),
            {"production_id": production_id},
        )
    ).mappings().all()
    varieties = [dict(r) for r in rows]
    varieties.append({
        "variety_id": "OTHER",
        "production_id": production_id,
        "variety_name": "Other (specify)",
        "local_name": None,
    })
    return success_envelope(
        {"varieties": varieties, "count": len(varieties)},
        meta={"production_id": production_id},
    )
