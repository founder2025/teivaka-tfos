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

    # The people you brought in — real attribution from registration
    # (tenant.users.referred_by_user_id). Status is honest: verified email =
    # active member; activity = they have posted or logged at least once.
    referred = (await db.execute(text("""
        SELECT u.user_id, u.full_name, u.created_at, u.email_verified,
               EXISTS (SELECT 1 FROM community.feed_posts fp WHERE fp.author_user_id = u.user_id) AS has_posted,
               EXISTS (SELECT 1 FROM audit.events ae WHERE ae.actor_user_id = u.user_id) AS has_logged
        FROM tenant.users u
        WHERE u.referred_by_user_id = :uid
        ORDER BY u.created_at DESC LIMIT 100
    """), {"uid": user_id})).mappings().all()
    people = [{
        "full_name": r["full_name"],
        "joined_at": r["created_at"].isoformat() if r["created_at"] else None,
        "verified": bool(r["email_verified"]),
        "farming_now": bool(r["has_posted"] or r["has_logged"]),
    } for r in referred]

    return {
        "my_code": my_code,
        "share_links": share_links,
        "referred_count": int(referred_count),
        "verified_count": sum(1 for p in people if p["verified"]),
        "farming_count": sum(1 for p in people if p["farming_now"]),
        "rewards_earned_months": 0,  # rewards launch with payments — never faked
        "referred": people,
    }


@router.get("/referral/qr")
async def referral_qr(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """QR PNG of the caller's referral link — scan to join (prototype parity)."""
    import io
    import qrcode
    import qrcode.constants
    from fastapi import Response
    row = (await db.execute(
        text("SELECT referral_code FROM tenant.users WHERE user_id = :uid"),
        {"uid": user["user_id"]},
    )).first()
    code = row[0] if row else None
    url = f"{LANDING_BASE}/?ref={code}" if code else LANDING_BASE
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=5, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    buf = io.BytesIO()
    qr.make_image(fill_color="#3E7B1F", back_color="white").save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png",
                    headers={"Cache-Control": "private, max-age=3600"})


@router.get("/team")
async def my_team(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Members on the caller's tenant (real team). Invites land in the workers phase."""
    has_tr = bool((await db.execute(text(
        "SELECT 1 FROM information_schema.columns WHERE table_schema='tenant' AND table_name='users' AND column_name='team_role'"))).scalar())
    tr_sel = ", team_role, farm_scope" if has_tr else ", NULL AS team_role, NULL AS farm_scope"
    rows = (await db.execute(text(f"""
        SELECT user_id, full_name, email, role, account_type,
               COALESCE(is_active, true) AS is_active, created_at{tr_sel}
        FROM tenant.users
        WHERE tenant_id = :tid
        ORDER BY created_at ASC
    """), {"tid": str(user["tenant_id"])})).mappings().all()
    return {"data": [{
        "user_id": str(r["user_id"]), "full_name": r["full_name"], "email": r["email"],
        "role": r["role"], "account_type": r["account_type"], "is_active": r["is_active"],
        "team_role": r["team_role"], "farm_scope": r["farm_scope"],
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

    async def _rows(sql, params, label):
        """Best-effort export section — a missing table yields an honest empty
        list, never a failed export (migration-tolerant like the feed)."""
        try:
            return (await db.execute(text(sql), params)).mappings().all()
        except Exception:  # noqa: BLE001
            await db.rollback()
            return []

    replies = await _rows(
        "SELECT reply_id, post_id, body, created_at FROM community.feed_replies "
        "WHERE author_user_id = :uid ORDER BY created_at DESC LIMIT 1000", {"uid": uid}, "replies")
    reactions = await _rows(
        "SELECT post_id, reaction, created_at FROM community.feed_reactions "
        "WHERE user_id = :uid ORDER BY created_at DESC LIMIT 2000", {"uid": uid}, "reactions")
    likes = await _rows(
        "SELECT post_id, created_at FROM community.feed_likes "
        "WHERE user_id = :uid ORDER BY created_at DESC LIMIT 2000", {"uid": uid}, "likes")
    saved = await _rows(
        "SELECT post_id, created_at FROM community.feed_saves "
        "WHERE user_id = :uid ORDER BY created_at DESC LIMIT 1000", {"uid": uid}, "saved")
    following = await _rows(
        "SELECT followed_user_id, created_at FROM community.follows "
        "WHERE follower_user_id = :uid", {"uid": uid}, "following")
    followers = await _rows(
        "SELECT follower_user_id, created_at FROM community.follows "
        "WHERE followed_user_id = :uid", {"uid": uid}, "followers")
    farm_events = await _rows(
        "SELECT event_id, event_type, occurred_at FROM audit.events "
        "WHERE tenant_id = cast(:tid AS uuid) ORDER BY occurred_at DESC LIMIT 2000",
        {"tid": str(user["tenant_id"])}, "farm_events")
    cycles = await _rows(
        "SELECT cycle_id, production_id, cycle_status, planting_date FROM tenant.production_cycles "
        "WHERE tenant_id = cast(:tid AS uuid) ORDER BY planting_date DESC NULLS LAST LIMIT 500",
        {"tid": str(user["tenant_id"])}, "cycles")
    tasks = await _rows(
        "SELECT task_id, status, created_at FROM tenant.task_queue "
        "WHERE tenant_id = cast(:tid AS uuid) ORDER BY created_at DESC LIMIT 1000",
        {"tid": str(user["tenant_id"])}, "tasks")
    lessons = await _rows(
        "SELECT lesson_id, course_id, completed_at FROM community.lesson_progress "
        "WHERE user_id = cast(:uid AS uuid)", {"uid": uid}, "lessons")

    # best-effort audit trail of the export itself (Covenant §1 receipt)
    try:
        from app.core.audit_chain import emit_audit_event
        await emit_audit_event(
            db=db, tenant_id=user["tenant_id"], actor_user_id=user["user_id"],
            event_type="DATA_EXPORTED", entity_type="user", entity_id=uid,
            payload={"export_type": "personal_data_export", "format": "json"})
        await db.commit()
    except Exception:  # noqa: BLE001
        await db.rollback()

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
            "manifest": {
                "app": "Teivaka Farm OS",
                "export_type": "personal_data_export",
                "format": "json",
                "version": 2,
                "exported_at": datetime.now(timezone.utc).isoformat(),
                "user_id": uid,
                "note": ("Your records are yours. This is a copy of the data linked to "
                         "your account, exported on request (Data Ownership Covenant, "
                         "Section 1). Photos and videos are listed by reference; the "
                         "original files remain retrievable from your account."),
            },
            "profile": (_ser([profile])[0] if profile else None),
            "farms": _ser(farms),
            "community_posts": _ser(posts),
            "replies": _ser(replies),
            "reactions": _ser(reactions),
            "likes": _ser(likes),
            "saved_posts": _ser(saved),
            "following": _ser(following),
            "followers": _ser(followers),
            "farm_events": _ser(farm_events),
            "cycles": _ser(cycles),
            "tasks": _ser(tasks),
            "lessons_completed": _ser(lessons),
        }
    }


@router.get("/me/export/inventory")
async def export_inventory(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """What an export will contain — per-category counts shown before download
    (prototype exportMyData inventory). Migration-tolerant: missing tables
    count as 0, never error."""
    uid = str(user["user_id"])
    tid = str(user["tenant_id"])

    async def _count(sql, params):
        try:
            return int((await db.execute(text(sql), params)).scalar() or 0)
        except Exception:  # noqa: BLE001
            await db.rollback()
            return 0

    return {"data": {
        "profile": 1,
        "posts": await _count("SELECT count(*) FROM community.feed_posts WHERE author_user_id = :uid AND status = 'active'", {"uid": uid}),
        "replies": await _count("SELECT count(*) FROM community.feed_replies WHERE author_user_id = :uid", {"uid": uid}),
        "reactions_likes": (await _count("SELECT count(*) FROM community.feed_reactions WHERE user_id = :uid", {"uid": uid}))
                          + (await _count("SELECT count(*) FROM community.feed_likes WHERE user_id = :uid", {"uid": uid})),
        "saved_posts": await _count("SELECT count(*) FROM community.feed_saves WHERE user_id = :uid", {"uid": uid}),
        "following": await _count("SELECT count(*) FROM community.follows WHERE follower_user_id = :uid", {"uid": uid}),
        "followers": await _count("SELECT count(*) FROM community.follows WHERE followed_user_id = :uid", {"uid": uid}),
        "farm_events": await _count("SELECT count(*) FROM audit.events WHERE tenant_id = cast(:tid AS uuid)", {"tid": tid}),
        "cycles": await _count("SELECT count(*) FROM tenant.production_cycles WHERE tenant_id = cast(:tid AS uuid)", {"tid": tid}),
        "tasks": await _count("SELECT count(*) FROM tenant.task_queue WHERE tenant_id = cast(:tid AS uuid)", {"tid": tid}),
        "lessons_completed": await _count("SELECT count(*) FROM community.lesson_progress WHERE user_id = cast(:uid AS uuid)", {"uid": uid}),
        "farms": await _count("SELECT count(*) FROM tenant.farms WHERE tenant_id = cast(:tid AS uuid)", {"tid": tid}),
    }}


from pydantic import BaseModel  # noqa: E402


class ProfilePatch(BaseModel):
    full_name: str | None = None
    whatsapp_number: str | None = None
    country: str | None = None
    preferred_language: str | None = None
    account_type: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    cover_url: str | None = None
    unit_mode: str | None = None
    pref_currency: str | None = None
    pref_weight: str | None = None
    pref_area: str | None = None
    pref_temp: str | None = None
    notify_whatsapp: bool | None = None
    notify_tasks: bool | None = None
    notify_weather: bool | None = None
    field_visibility: dict | None = None


_EDITABLE = ("full_name", "whatsapp_number", "country", "preferred_language", "account_type", "bio",
             "avatar_url", "cover_url", "unit_mode", "pref_currency", "pref_weight", "pref_area", "pref_temp",
             "notify_whatsapp", "notify_tasks", "notify_weather")
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


@router.get("/prefs")
async def my_prefs(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Notification + language prefs for the Settings page. Migration-tolerant:
    pre-105 deployments return defaults instead of erroring."""
    has = (await db.execute(text(
        "SELECT count(*) FROM information_schema.columns WHERE table_schema='tenant' "
        "AND table_name='users' AND column_name IN ('notify_whatsapp','notify_tasks','notify_weather')"))).scalar()
    if int(has or 0) < 3:
        return {"data": {"notify_whatsapp": True, "notify_tasks": True, "notify_weather": True,
                         "preferred_language": user.get("preferred_language") or "en", "degraded": True}}
    row = (await db.execute(text(
        "SELECT notify_whatsapp, notify_tasks, notify_weather, preferred_language "
        "FROM tenant.users WHERE user_id = :uid"), {"uid": str(user["user_id"])})).mappings().first()
    return {"data": dict(row) if row else {}}
