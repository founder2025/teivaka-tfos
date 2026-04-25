"""productions.py — read-only shared.productions catalog.

Routes:
  GET /api/v1/productions  → list catalog with optional filters

Used by the cycle-creation modal to populate the crop selector.
shared.productions is a tenant-agnostic seed table; no tenant scoping
needed. Auth gate kept for consistency with other catalog-style
endpoints (marketplace, kb, etc).
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.rls import get_current_user
from app.db.session import get_db
from app.schemas.envelope import success_envelope

router = APIRouter()


@router.get("", summary="List the production catalog")
async def list_productions(
    category: Optional[str] = Query(None, description="Filter by category (case-insensitive substring)"),
    prefix: Optional[str] = Query(None, description="Filter by production_id prefix (e.g. CRP, FRT, LIV, FOR, AQU, SUP)"),
    search: Optional[str] = Query(None, description="Free-text substring search on production_name"),
    is_active: Optional[bool] = Query(None, description="Filter on is_active_in_system. Default none — returns the full catalog including inactive seed rows."),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filters: list[str] = []
    params: dict = {}

    if is_active is not None:
        filters.append("COALESCE(is_active_in_system, true) = :is_active")
        params["is_active"] = is_active
    if category:
        filters.append("category ILIKE :category")
        params["category"] = f"%{category}%"
    if prefix:
        filters.append("production_id LIKE :prefix")
        params["prefix"] = f"{prefix.upper()}%"
    if search:
        filters.append("production_name ILIKE :search")
        params["search"] = f"%{search}%"

    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""

    rows = (
        await db.execute(
            text(
                f"""
                SELECT production_id,
                       production_name,
                       local_name,
                       category,
                       plant_family,
                       lifecycle,
                       is_perennial,
                       is_livestock,
                       is_forestry,
                       is_aquaculture
                FROM shared.productions
                {where_clause}
                ORDER BY category, production_name
                """
            ),
            params,
        )
    ).mappings().all()

    productions = [dict(r) for r in rows]
    return success_envelope(
        {"productions": productions, "count": len(productions)},
        meta={
            "filters": {
                "category": category,
                "prefix": prefix,
                "search": search,
                "is_active": is_active,
            }
        },
    )
