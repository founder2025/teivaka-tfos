from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from app.services.tis_service import execute_tis_query
from pydantic import BaseModel
from typing import Optional
import redis.asyncio as aioredis
from app.config import settings

router = APIRouter()

class TISChatRequest(BaseModel):
    message: str
    farm_id: Optional[str] = None
    conversation_history: list = []

@router.post("/chat")
async def tis_chat(body: TISChatRequest, user: dict = Depends(get_current_user)):
    r = aioredis.from_url(settings.redis_url)
    try:
        async with get_rls_db(str(user["tenant_id"])) as db:
            result = await execute_tis_query(
                session=db,
                redis_client=r,
                user_message=body.message,
                farm_id=body.farm_id,
                conversation_history=body.conversation_history,
                user=user,
                tenant_id=str(user["tenant_id"]),
            )
        return {"data": result}
    finally:
        await r.aclose()

@router.get("/conversations")
async def list_conversations(farm_id: str = None, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"user_id": str(user["user_id"])}
        q = "SELECT * FROM tenant.tis_conversations WHERE user_id = :user_id AND is_active = true"
        if farm_id:
            q += " AND farm_id = :farm_id"
            params["farm_id"] = farm_id
        result = await db.execute(text(q + " ORDER BY last_message_at DESC LIMIT 20"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.get("/rate-status")
async def get_rate_status(user: dict = Depends(get_current_user)):
    from datetime import datetime
    r = aioredis.from_url(settings.redis_url)
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        key = f"tis:rate:{user['tenant_id']}:{today}"
        calls_today = int(await r.get(key) or 0)
        limit = settings.get_tis_limit(user["subscription_tier"])
        return {"data": {"calls_today": calls_today, "limit": limit, "calls_remaining": max(0, limit - calls_today)}}
    finally:
        await r.aclose()
