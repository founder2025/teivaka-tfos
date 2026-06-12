"""reference_library.py — read-only Farm Library reference corpus.

Serves shared.reference_library (the prototype's verbatim Fiji corpus — crops, pests,
diseases, fertilizers, livestock-diseases, vet/vaccines). shared.* reference data,
read-only at runtime (Inviolable #7). Chemicals are served by chemicals.py (the
real WHD-enforcing shared.chemical_library — single source of truth per Inviolable #2).

GET /api/v1/reference-library[?category=CROP|PEST|DISEASE|FERTILIZER|LIVESTOCK_DISEASE|VET]
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
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


class LibraryUpdateRequest(BaseModel):
    kind: str = Field(..., max_length=80)
    details: str = Field(..., min_length=1, max_length=2000)
    source: str = Field("", max_length=500)


@router.post("/library/request-update", status_code=201)
async def request_library_update(
    payload: LibraryUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Farmer-submitted "Request library update" → shared.kb_article_candidates.

    The library is curated centrally (the WHD/agronomy moat — Inviolable #1); farmers
    contribute *signal*, not edits. Each request lands in the review queue. Writing to
    kb_article_candidates at runtime is explicitly permitted (Inviolable #7). Repeat
    requests for the same text dedupe and bump query_count via the UNIQUE(query_text_hash).
    """
    query_text = f"[Library update · {payload.kind.strip()}] {payload.details.strip()}"
    row = await db.execute(
        text(
            """
            INSERT INTO shared.kb_article_candidates (query_text, farm_id, notes)
            VALUES (:q, :farm_id, NULLIF(:notes, ''))
            ON CONFLICT (query_text_hash) DO UPDATE
                SET query_count = shared.kb_article_candidates.query_count + 1,
                    last_asked  = NOW()
            RETURNING id
            """
        ),
        {"q": query_text, "farm_id": user.get("farm_id"), "notes": (payload.source or "").strip()},
    )
    candidate_id = row.scalar()
    await db.commit()
    return {"status": "success", "data": {"candidate_id": candidate_id}}
