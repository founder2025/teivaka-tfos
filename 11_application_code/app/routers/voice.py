from fastapi import APIRouter, Depends, UploadFile, File, Form
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from app.services.tis_service import process_voice
from typing import Optional
import redis.asyncio as aioredis
from app.config import settings

router = APIRouter()

@router.post("")
async def voice_query(
    audio: UploadFile = File(..., description="Audio file (webm, mp4, wav, mp3)"),
    farm_id: Optional[str] = Form(None),
    user: dict = Depends(get_current_user),
):
    audio_bytes = await audio.read()
    r = aioredis.from_url(settings.redis_url)
    try:
        async with get_rls_db(str(user["tenant_id"])) as db:
            result = await process_voice(
                audio_bytes=audio_bytes,
                user=user,
                farm_id=farm_id,
                session=db,
                redis_client=r,
                tenant_id=str(user["tenant_id"]),
            )
        return {"data": result}
    finally:
        await r.aclose()
