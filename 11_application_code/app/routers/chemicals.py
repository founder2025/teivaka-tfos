"""chemicals.py — read-only shared.chemical_library catalog.

GET /api/v1/chemicals
GET /api/v1/chemicals?registered_for=CRP-EGG
GET /api/v1/chemicals?q=glyph
GET /api/v1/chemicals?registered_for=CRP-EGG&q=karate

Used by FieldEventNew.jsx to populate the SPRAY chemical autocomplete.
shared.chemical_library is a platform-wide seed table; no tenant scoping
needed and no RLS context required (lives in shared schema, read-only at
runtime per CLAUDE.md inviolable rule 7).

Filter contract:
  * registered_for — case-insensitive exact-element match against the
    text[] registered_crops column. The data uses production_id codes
    (e.g. 'CRP-EGG'), not crop common names.
  * q — substring search on chem_name, case-insensitive.

Both filters compose with AND.

Response (Part 13 envelope):
  {"status": "success",
   "data":   [{chem_name, active_ingredient, withholding_period_days,
               registered_crops, default_unit}, ...],
   "meta":   {"count": <n>, "filters": {...}}}
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.rls import get_current_user
from app.db.session import get_db
from app.schemas.envelope import success_envelope

router = APIRouter()


@router.get("/chemicals", summary="List the chemical library")
async def list_chemicals(
    registered_for: Optional[str] = Query(
        None,
        description=(
            "Filter to chemicals registered for this production_id "
            "(e.g. CRP-EGG). Case-insensitive exact-element match against "
            "shared.chemical_library.registered_crops[]."
        ),
    ),
    q: Optional[str] = Query(
        None,
        description="Free-text substring search on chem_name, case-insensitive.",
    ),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filters: list[str] = []
    params: dict = {}

    if registered_for:
        filters.append(
            "EXISTS (SELECT 1 FROM unnest(registered_crops) c "
            "WHERE LOWER(c) = LOWER(:crop))"
        )
        params["crop"] = registered_for
    if q:
        filters.append("chem_name ILIKE :q")
        params["q"] = f"%{q}%"

    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""

    rows = (
        await db.execute(
            text(
                f"""
                SELECT chem_name,
                       active_ingredient,
                       withholding_period_days,
                       registered_crops,
                       unit AS default_unit
                FROM   shared.chemical_library
                {where_clause}
                ORDER BY chem_name ASC
                LIMIT  200
                """
            ),
            params,
        )
    ).mappings().all()

    chemicals = [dict(r) for r in rows]
    return success_envelope(
        chemicals,
        meta={
            "count": len(chemicals),
            "filters": {"registered_for": registered_for, "q": q},
        },
    )
