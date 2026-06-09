from fastapi import APIRouter, Depends
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()

@router.get("")
async def list_kb_articles(
    production_id: str = None,
    category: str = None,
    language: str = "en",
    search: str = None,
    user: dict = Depends(get_current_user),
):
    """
    List validated KB articles from the shared knowledge base.
    Optionally filter by production_id, category, language, or full-text search term.
    Returns articles ordered by relevance (search) or creation date.
    """
    async with get_rls_db(str(user["tenant_id"])) as db:
        params: dict = {}
        # Real shared.kb_articles columns: article_id (PK), article_type, title,
        # content_md, content_summary, published, production_id, created_at.
        # (No kb_entry_id/category/tags/language/source/version/rag_status.)
        # Alias to the keys the UI consumes.
        q = """SELECT article_id AS kb_entry_id, title, article_type AS category,
                      production_id, content_summary, created_at
               FROM shared.kb_articles
               WHERE published = true"""
        if production_id:
            q += " AND production_id = :production_id"
            params["production_id"] = production_id
        if category:
            q += " AND article_type = :category"
            params["category"] = category
        if search:
            q += " AND (title ILIKE :search OR content_md ILIKE :search)"
            params["search"] = f"%{search}%"
        result = await db.execute(text(q + " ORDER BY created_at DESC LIMIT 50"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/{kb_entry_id}")
async def get_kb_article(kb_entry_id: str, user: dict = Depends(get_current_user)):
    """Return full article content including body text."""
    from fastapi import HTTPException
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("SELECT * FROM shared.kb_articles WHERE article_id = cast(:kb_entry_id AS uuid) AND published = true"),
            {"kb_entry_id": kb_entry_id}
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="KB article not found or not validated")
        return {"data": dict(row)}
