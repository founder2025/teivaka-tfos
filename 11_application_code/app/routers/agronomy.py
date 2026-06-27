"""Agronomy lookup endpoints - Phase 10-1.

GET /api/v1/agronomy/nutrition/{crop_key}/{stage}?country=FJI
  Returns NPK protocol for crop x stage x country.
  Falls back to NULL country (global) if specific country not found.
  Returns 404 if neither country nor global match.

GET /api/v1/agronomy/nutrition/{crop_key}/stages?country=FJI
  Returns full stage timeline for a crop in a country.

Strike #62: TIS layer must call this endpoint for any nutrition question
instead of generating dosage values from training data.
Strike #63: every response includes verification_status - TIS must surface
the caveat in user-facing responses.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.rls import get_tenant_db
from app.schemas.envelope import error_envelope


router = APIRouter()


ALLOWED_STAGES = {
    'SEEDLING', 'VEGETATIVE', 'TILLERING', 'PRE_FLOWERING',
    'FLOWERING', 'CORM_DEVELOPMENT', 'FRUIT_SET', 'MATURATION', 'POST_HARVEST',
}
ALLOWED_COUNTRIES = {'FJI', 'PNG', 'SLB', 'VUT', 'WSM', 'TON'}


@router.get("/agronomy/nutrition/crops")
async def list_nutrition_crops(
    country: Optional[str] = Query(None, max_length=3),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Crops that actually have a seeded nutrition protocol.

    The Library Nutrition picker must list only resolvable crops, keyed by the
    real `crop_key` (e.g. 'taro') — not the reference-library `ref_id` ('CRP-TAR'),
    which never matches and 404s. Distinct crop_key + display name, optionally
    scoped to a country (global rows always included).
    """
    country_upper = (country or "").upper().strip() or None
    result = await db.execute(
        text(
            """
            SELECT crop_key, MIN(crop_display_name) AS crop_display_name
            FROM shared.crop_nutrition_protocols
            WHERE (:ci IS NULL OR country_iso = :ci OR country_iso IS NULL)
            GROUP BY crop_key
            ORDER BY MIN(crop_display_name)
            """
        ),
        {"ci": country_upper},
    )
    return {"data": [{"crop_key": r.crop_key, "crop_display_name": r.crop_display_name} for r in result]}


@router.get("/agronomy/nutrition/{crop_key}/stages")
async def get_nutrition_stages(
    crop_key: str,
    country: Optional[str] = Query(None, max_length=3),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return full stage timeline for a crop, country-specific if available."""
    crop_key = crop_key.lower().strip()
    country_upper = country.upper().strip() if country else None

    if country_upper and country_upper not in ALLOWED_COUNTRIES:
        raise HTTPException(
            status_code=400,
            detail=error_envelope(
                "invalid_country",
                f"Country must be one of {sorted(ALLOWED_COUNTRIES)}.",
                data={"received": country_upper},
            ),
        )

    sql = """
        SELECT crop_key, crop_display_name, stage, stage_order, stage_window_text,
               country_iso, n_g_per_plant, p_g_per_plant, k_g_per_plant,
               application_method, application_notes, preferred_unit,
               typical_plants_per_hectare, verification_status, source_citation
        FROM shared.crop_nutrition_protocols
        WHERE crop_key = :ck AND (country_iso = :ci OR country_iso IS NULL)
        ORDER BY
          CASE WHEN country_iso = :ci THEN 1 ELSE 2 END,
          stage_order
    """
    result = await db.execute(text(sql), {"ck": crop_key, "ci": country_upper})
    rows = result.fetchall()

    if not rows:
        raise HTTPException(
            status_code=404,
            detail=error_envelope(
                "crop_not_found",
                f"No nutrition protocols for crop '{crop_key}'. Recommend contacting country extension office.",
                data={"crop_key": crop_key, "country": country_upper},
            ),
        )

    seen_stages = set()
    stages = []
    for row in rows:
        if row.stage in seen_stages:
            continue
        seen_stages.add(row.stage)
        stages.append({
            "stage": row.stage,
            "stage_order": row.stage_order,
            "stage_window": row.stage_window_text,
            "npk": {
                "n_g_per_plant": float(row.n_g_per_plant),
                "p_g_per_plant": float(row.p_g_per_plant),
                "k_g_per_plant": float(row.k_g_per_plant),
            },
            "application_method": row.application_method,
            "application_notes": row.application_notes,
            "preferred_unit": row.preferred_unit,
            "typical_plants_per_hectare": row.typical_plants_per_hectare,
            "verification_status": row.verification_status,
            "source_citation": row.source_citation,
            "country_iso": row.country_iso,
        })

    stages.sort(key=lambda s: s["stage_order"])

    return {
        "data": {
            "crop_key": crop_key,
            "crop_display_name": rows[0].crop_display_name,
            "country": country_upper,
            "stage_count": len(stages),
            "stages": stages,
            "_caveat": (
                "All values seeded from FAO Pacific Crop Nutrition Manual 2018. "
                "Marked SEED_FAO_UNVERIFIED until reviewed by local extension officer. "
                "For site-specific guidance, consult country agriculture extension service."
            ),
        }
    }


@router.get("/agronomy/nutrition/{crop_key}/{stage}")
async def get_nutrition_for_stage(
    crop_key: str,
    stage: str,
    country: Optional[str] = Query(None, max_length=3),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return NPK protocol for crop x stage x country."""
    crop_key = crop_key.lower().strip()
    stage_upper = stage.upper().strip()
    country_upper = country.upper().strip() if country else None

    if stage_upper not in ALLOWED_STAGES:
        raise HTTPException(
            status_code=400,
            detail=error_envelope(
                "invalid_stage",
                f"Stage must be one of {sorted(ALLOWED_STAGES)}.",
                data={"received": stage_upper},
            ),
        )
    if country_upper and country_upper not in ALLOWED_COUNTRIES:
        raise HTTPException(
            status_code=400,
            detail=error_envelope(
                "invalid_country",
                f"Country must be one of {sorted(ALLOWED_COUNTRIES)}.",
                data={"received": country_upper},
            ),
        )

    sql = """
        SELECT crop_display_name, stage_order, stage_window_text,
               country_iso, n_g_per_plant, p_g_per_plant, k_g_per_plant,
               application_method, application_notes, preferred_unit,
               typical_plants_per_hectare, verification_status, source_citation
        FROM shared.crop_nutrition_protocols
        WHERE crop_key = :ck AND stage = :st AND (country_iso = :ci OR country_iso IS NULL)
        ORDER BY
          CASE WHEN country_iso = :ci THEN 1 ELSE 2 END
        LIMIT 1
    """
    result = await db.execute(text(sql), {"ck": crop_key, "st": stage_upper, "ci": country_upper})
    row = result.first()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail=error_envelope(
                "nutrition_not_found",
                f"No verified nutrition guidance for {crop_key} at {stage_upper} in {country_upper or 'global default'}. Recommend contacting country extension office.",
                data={"crop_key": crop_key, "stage": stage_upper, "country": country_upper},
            ),
        )

    return {
        "data": {
            "crop_key": crop_key,
            "crop_display_name": row.crop_display_name,
            "stage": stage_upper,
            "stage_order": row.stage_order,
            "stage_window": row.stage_window_text,
            "country_iso": row.country_iso,
            "npk": {
                "n_g_per_plant": float(row.n_g_per_plant),
                "p_g_per_plant": float(row.p_g_per_plant),
                "k_g_per_plant": float(row.k_g_per_plant),
            },
            "application_method": row.application_method,
            "application_notes": row.application_notes,
            "preferred_unit": row.preferred_unit,
            "typical_plants_per_hectare": row.typical_plants_per_hectare,
            "verification_status": row.verification_status,
            "source_citation": row.source_citation,
            "_caveat": (
                "Values seeded from FAO Pacific Crop Nutrition Manual 2018. "
                "Marked SEED_FAO_UNVERIFIED. For site-specific guidance, consult local extension officer."
            ),
        }
    }
