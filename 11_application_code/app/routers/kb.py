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
        params: dict = {"language": language}
        q = """SELECT kb_entry_id, title, category, production_id, tags,
                      language, source, version, created_at
               FROM shared.kb_articles
               WHERE rag_status = 'VALIDATED' AND language = :language"""
        if production_id:
            q += " AND production_id = :production_id"
            params["production_id"] = production_id
        if category:
            q += " AND category = :category"
            params["category"] = category
        if search:
            q += " AND (title ILIKE :search OR content ILIKE :search)"
            params["search"] = f"%{search}%"
        result = await db.execute(text(q + " ORDER BY created_at DESC LIMIT 50"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/{kb_entry_id}")
async def get_kb_article(kb_entry_id: str, user: dict = Depends(get_current_user)):
    """Return full article content including body text."""
    from fastapi import HTTPException
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("SELECT * FROM shared.kb_articles WHERE kb_entry_id = :kb_entry_id AND rag_status = 'VALIDATED'"),
            {"kb_entry_id": kb_entry_id}
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="KB article not found or not validated")
        return {"data": dict(row)}
