"""reference_library.py — read-only Farm Library reference corpus.

Serves shared.reference_library (the prototype's verbatim Fiji corpus — crops, pests,
diseases, fertilizers, livestock-diseases, vet/vaccines). shared.* reference data,
read-only at runtime (Inviolable #7). Chemicals are served by chemicals.py (the
real WHD-enforcing shared.chemical_library — single source of truth per Inviolable #2).

GET /api/v1/reference-library[?category=CROP|PEST|DISEASE|FERTILIZER|LIVESTOCK_DISEASE|VET]
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.rls import get_current_user

router = APIRouter()

VALID_CATEGORIES = {"CROP", "PEST", "DISEASE", "FERTILIZER", "LIVESTOCK_DISEASE", "VET"}


@router.get("/reference-library")
async def list_reference_library(
    category: str = Query(None, description="One of PEST|DISEASE|FERTILIZER|LIVESTOCK_DISEASE|VET"),
    search: str = Query(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    clauses, params = [], {}
    if category:
        clauses.append("category = :cat")
        params["cat"] = category.upper().strip()
    if search:
        clauses.append("(name ILIKE :q OR attributes::text ILIKE :q)")
        params["q"] = f"%{search.strip()}%"
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    rows = await db.execute(
        text(f"SELECT ref_id, category, name, attributes FROM shared.reference_library{where} ORDER BY name"),
        params,
    )
    return {"data": [dict(r) for r in rows.mappings()]}
