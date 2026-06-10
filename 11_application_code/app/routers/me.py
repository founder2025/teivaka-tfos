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


@router.get("/team")
async def my_team(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Members on the caller's tenant (real team). Invites land in the workers phase."""
    rows = (await db.execute(text("""
        SELECT user_id, full_name, email, role, account_type,
               COALESCE(is_active, true) AS is_active, created_at
        FROM tenant.users
        WHERE tenant_id = :tid
        ORDER BY created_at ASC
    """), {"tid": str(user["tenant_id"])})).mappings().all()
    return {"data": [{
        "user_id": str(r["user_id"]), "full_name": r["full_name"], "email": r["email"],
        "role": r["role"], "account_type": r["account_type"], "is_active": r["is_active"],
        "is_you": str(r["user_id"]) == str(user["user_id"]),
    } for r in rows]}


@router.get("/export")
async def export_my_data(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Real, on-demand export of the caller's own data (profile + farms + posts)."""
    from datetime import datetime, timezone
    uid = str(user["user_id"])
    profile = (await db.execute(text("""
        SELECT user_id, full_name, email, role, account_type, country,
               preferred_language, whatsapp_number, referral_code, created_at
        FROM tenant.users WHERE user_id = :uid
    """), {"uid": uid})).mappings().first()
    farms = (await db.execute(text("""
        SELECT farm_id, farm_name, location_island, latitude, longitude, created_at
        FROM tenant.farms WHERE tenant_id = :tid ORDER BY created_at
    """), {"tid": str(user["tenant_id"])})).mappings().all()
    posts = (await db.execute(text("""
        SELECT post_id, body, audience, created_at
        FROM community.feed_posts
        WHERE author_user_id = :uid AND status = 'active'
        ORDER BY created_at DESC LIMIT 500
    """), {"uid": uid})).mappings().all()

    def _ser(rows):
        out = []
        for r in rows:
            d = dict(r)
            for k, v in d.items():
                if hasattr(v, "isoformat"):
                    d[k] = v.isoformat()
                else:
                    d[k] = str(v) if v is not None and not isinstance(v, (int, float, bool, str)) else v
            out.append(d)
        return out

    return {
        "data": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "profile": (_ser([profile])[0] if profile else None),
            "farms": _ser(farms),
            "community_posts": _ser(posts),
        }
    }
