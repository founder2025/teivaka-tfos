"""Authenticated /me/* endpoints (referral, etc.)."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.rls import get_current_user

router = APIRouter()

LANDING_BASE = "https://teivaka.com"


@router.get("/chain-status")
async def get_my_chain_status(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Live audit-chain integrity for the caller's tenant — backs the Overview
    'Verification chain' badge so it reflects a real check, not a hardcoded
    'INTACT' claim. Reads the SECURITY DEFINER audit.verify_chain_for_tenant."""
    row = (await db.execute(text("""
        SELECT total_events, break_count, verified_at
        FROM audit.verify_chain_for_tenant(cast(:tid AS uuid))
    """), {"tid": str(user["tenant_id"])})).first()
    total = int(row.total_events) if row and row.total_events is not None else 0
    breaks = int(row.break_count) if row and row.break_count is not None else 0
    return {
        "data": {
            "integrity_ok": breaks == 0,
            "events_in_chain": total,
            "chain_break_count": breaks,
            "verified_at": (row.verified_at.isoformat() if row and row.verified_at else None),
        }
    }


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
