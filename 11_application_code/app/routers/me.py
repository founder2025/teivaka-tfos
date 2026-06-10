"""Authenticated /me/* endpoints (referral, etc.)."""
from fastapi import APIRouter, Depends, HTTPException, status
from passlib.context import CryptContext
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.rls import get_current_user

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

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


from pydantic import BaseModel  # noqa: E402


class ProfilePatch(BaseModel):
    full_name: str | None = None
    whatsapp_number: str | None = None
    country: str | None = None
    preferred_language: str | None = None
    account_type: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    field_visibility: dict | None = None


_EDITABLE = ("full_name", "whatsapp_number", "country", "preferred_language", "account_type", "bio", "avatar_url")
_ACCOUNT_TYPES = {"FARMER", "BUYER", "SUPPLIER", "SERVICE_PROVIDER", "BANKER", "BUSINESS", "EXPORTER", "IMPORTER"}


@router.patch("")
async def update_me(
    body: ProfilePatch,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the caller's own editable profile fields."""
    sets, params = [], {"uid": str(user["user_id"])}
    data = body.model_dump(exclude_unset=True)
    for k in _EDITABLE:
        if k in data and data[k] is not None:
            v = data[k]
            if k == "account_type":
                v = str(v).upper().strip()
                if v == "OTHER":
                    v = "BUSINESS"
                if v not in _ACCOUNT_TYPES:
                    continue
            if k == "country":
                v = str(v).upper().strip()[:2]
            sets.append(f"{k} = :{k}"); params[k] = v
    if "field_visibility" in data and isinstance(data["field_visibility"], dict):
        import json
        sets.append("field_visibility = cast(:fv AS jsonb)"); params["fv"] = json.dumps(data["field_visibility"])
    if not sets:
        return {"data": {"updated": 0}}
    await db.execute(text(f"UPDATE tenant.users SET {', '.join(sets)} WHERE user_id = :uid"), params)
    await db.commit()
    return {"data": {"updated": len(sets)}}


class DeleteAccountBody(BaseModel):
    password: str
    confirm: bool = False


@router.delete("")
async def delete_my_account(
    body: DeleteAccountBody,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently close the caller's account (Covenant / app-store right-to-delete).

    Re-authenticates with the password, then: anonymises all personal data in
    tenant.users, disables login (is_active=false), and soft-deletes the user's
    community content. The hash-chained audit ledger (audit.events) is RETAINED —
    deleting it would break the chain that makes farm records bank-verifiable;
    those records are de-identified by the user anonymisation above. Farm/tenant
    business data is out of scope of a single-user deletion.
    """
    if not body.confirm:
        raise HTTPException(status_code=400, detail="Account deletion must be confirmed (confirm=true).")
    uid = str(user["user_id"])
    row = (await db.execute(
        text("SELECT password_hash FROM tenant.users WHERE user_id = :uid"), {"uid": uid},
    )).first()
    if not row or not row[0] or not pwd_context.verify(body.password, row[0]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Password is incorrect.")

    # 1) Anonymise PII + disable login. Email gets a unique tombstone so the
    #    UNIQUE(email) constraint holds and the address can never be re-used.
    await db.execute(text("""
        UPDATE tenant.users SET
            full_name = 'Deleted user',
            email = 'deleted+' || :uid || '@deleted.invalid',
            whatsapp_number = NULL,
            bio = NULL,
            avatar_url = NULL,
            field_visibility = NULL,
            email_verified = false,
            is_active = false,
            password_hash = 'DELETED_ACCOUNT_NO_LOGIN'
        WHERE user_id = :uid
    """), {"uid": uid})
    # 2) Soft-delete community content + sever the social graph (best-effort).
    await db.execute(text("""
        UPDATE community.feed_posts SET status = 'deleted', deleted_at = now()
        WHERE author_user_id = :uid AND status = 'active'
    """), {"uid": uid})
    await db.execute(text("""
        DELETE FROM community.follows
        WHERE follower_user_id = :uid OR followed_user_id = :uid
    """), {"uid": uid})
    await db.commit()
    return {"data": {"deleted": True}}


@router.get("/records")
async def my_records(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The caller's hash-chained farm records (audit.events for their tenant)."""
    rows = (await db.execute(text("""
        SELECT event_type, entity_type, occurred_at, audit_hash
        FROM audit.events
        WHERE tenant_id = :tid
        ORDER BY occurred_at DESC
        LIMIT 60
    """), {"tid": str(user["tenant_id"])})).mappings().all()
    return {"data": [{
        "event_type": r["event_type"], "entity_type": r["entity_type"],
        "occurred_at": r["occurred_at"].isoformat() if r["occurred_at"] else None,
        "audit_hash": r["audit_hash"],
    } for r in rows]}
