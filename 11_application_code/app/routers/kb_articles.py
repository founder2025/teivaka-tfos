from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from pydantic import BaseModel
from typing import Optional, List
import uuid

router = APIRouter()

class KBArticleCreate(BaseModel):
    title: str
    content: str  # Full article body, minimum 100 words recommended
    category: str  # CROP_MANAGEMENT, PEST_DISEASE, FINANCE, COMPLIANCE, LIVESTOCK, APICULTURE
    production_id: Optional[str] = None
    tags: Optional[List[str]] = []
    language: str = "en"
    source: Optional[str] = None

@router.post("")
async def create_kb_article(body: KBArticleCreate, user: dict = Depends(get_current_user)):
    """
    Create a new KB article. Sets rag_status = PENDING_REVIEW.
    Triggers Celery task to generate embedding once validated.
    Only FOUNDER or AGRONOMIST roles can create articles.
    """
    if user["role"] not in ("FOUNDER", "AGRONOMIST", "MANAGER"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only FOUNDER, MANAGER, or AGRONOMIST can create KB articles")

    kb_entry_id = f"KB-USR-{uuid.uuid4().hex[:6].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO shared.kb_articles
                (kb_entry_id, title, content, category, production_id, rag_status,
                 tags, language, source, version, created_by)
            VALUES
                (:kb_entry_id, :title, :content, :category, :production_id, 'PENDING_REVIEW',
                 :tags, :language, :source, 1, :created_by)
        """), {
            "kb_entry_id": kb_entry_id,
            "title": body.title,
            "content": body.content,
            "category": body.category,
            "production_id": body.production_id,
            "tags": body.tags,
            "language": body.language,
            "source": body.source or f"User Submission by {user.get('full_name', user['user_id'])}",
            "created_by": str(user["user_id"]),
        })

    # Trigger Celery embedding task (fire and forget)
    try:
        from app.workers.ai_worker import embed_kb_article
        embed_kb_article.delay(kb_entry_id)
    except Exception:
        pass  # Celery may not be running; embedding will happen on next worker cycle

    return {"data": {
        "kb_entry_id": kb_entry_id,
        "rag_status": "PENDING_REVIEW",
        "message": "Article submitted for review. Embedding will be generated after validation.",
    }}

@router.get("/{kb_entry_id}")
async def get_kb_article_full(kb_entry_id: str, user: dict = Depends(get_current_user)):
    """Return full article including embedding status. FOUNDER can see all statuses."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"kb_entry_id": kb_entry_id}
        q = "SELECT * FROM shared.kb_articles WHERE kb_entry_id = :kb_entry_id"
        if user["role"] != "FOUNDER":
            q += " AND rag_status = 'VALIDATED'"
        result = await db.execute(text(q), params)
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="KB article not found")
        return {"data": dict(row)}

@router.patch("/{kb_entry_id}/validate")
async def validate_kb_article(kb_entry_id: str, user: dict = Depends(get_current_user)):
    """FOUNDER-only: Mark an article as VALIDATED and trigger embedding."""
    if user["role"] != "FOUNDER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only FOUNDER can validate KB articles")
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(
            text("UPDATE shared.kb_articles SET rag_status = 'VALIDATED', validated_by = :user_id, validated_at = now(), updated_at = now() WHERE kb_entry_id = :kb_entry_id RETURNING kb_entry_id"),
            {"kb_entry_id": kb_entry_id, "user_id": str(user["user_id"])}
        )
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="KB article not found")

    try:
        from app.workers.ai_worker import embed_kb_article
        embed_kb_article.delay(kb_entry_id)
    except Exception:
        pass

    return {"data": {"kb_entry_id": kb_entry_id, "rag_status": "VALIDATED"}}
