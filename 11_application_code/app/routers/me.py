"""Authenticated /me/* endpoints (referral, etc.)."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.rls import get_current_user

router = APIRouter()

LANDING_BASE = "https://teivaka.com"


@router.get("/referral")
async def get_my_referral(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = user["user_id"]

    row = (await db.execute(
        text("SELECT referral_code FROM tenant.users WHERE user_id = :uid"),
        {"uid": user_id},
    )).first()
    my_code = row[0] if row else None

    referred_count = (await db.execute(
        text("SELECT COUNT(*) FROM tenant.users WHERE referred_by_user_id = :uid"),
        {"uid": user_id},
    )).scalar() or 0

    share_url = f"{LANDING_BASE}/?ref={my_code}" if my_code else LANDING_BASE
    share_links = {
        "whatsapp": share_url,
        "sms": share_url,
        "copy_text": (
            f"Join Teivaka with my code {my_code} → {share_url}"
            if my_code else f"Join Teivaka → {share_url}"
        ),
    }

    return {
        "my_code": my_code,
        "share_links": share_links,
        "referred_count": int(referred_count),
        "rewards_earned_months": 0,  # placeholder for Phase 3.5b
    }
