"""Authenticated /me/* endpoints (referral, etc.)."""
from fastapi import APIRouter, Depends, HTTPException, status
from passlib.context import CryptContext
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.account_types import normalize_account_type
from app.db.session import get_db
from app.middleware.rls import get_current_user, get_tenant_db

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
    specialty: str | None = None
    also_account_types: list[str] | None = None
    share_location: bool | None = None


_EDITABLE = ("full_name", "whatsapp_number", "country", "preferred_language", "account_type", "bio",
             "avatar_url", "cover_url", "unit_mode", "pref_currency", "pref_weight", "pref_area", "pref_temp",
             "notify_whatsapp", "notify_tasks", "notify_weather", "specialty", "share_location")
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
                # 12-tier ecosystem taxonomy; legacy values up-converted, invalid skipped.
                try:
                    v = normalize_account_type(v)
                except ValueError:
                    continue
            if k == "country":
                v = str(v).upper().strip()[:2]
            sets.append(f"{k} = :{k}"); params[k] = v
    if "field_visibility" in data and isinstance(data["field_visibility"], dict):
        import json
        sets.append("field_visibility = cast(:fv AS jsonb)"); params["fv"] = json.dumps(data["field_visibility"])
    if "also_account_types" in data and data["also_account_types"] is not None:
        from app.core.account_types import clean_also_categories
        sets.append("also_account_types = :also"); params["also"] = clean_also_categories(data["also_account_types"])
    # Any explicit location-sharing choice is the member's one-time consent —
    # stamp it so Slice 3 only ever shows acknowledged members (no silent exposure).
    if "share_location" in data and data["share_location"] is not None:
        sets.append("location_share_ack_at = now()")
    if not sets:
        return {"data": {"updated": 0}}
    await db.execute(text(f"UPDATE tenant.users SET {', '.join(sets)} WHERE user_id = :uid"), params)
    await db.commit()
    return {"data": {"updated": len(sets)}}


class BusinessPatch(BaseModel):
    business_name: str | None = None
    operator_name: str | None = None
    region_id: str | None = None


@router.get("/business")
async def get_my_business(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """The caller's business entity (Company accounts). RLS-scoped to their tenant."""
    is_company = (await db.execute(
        text("SELECT COALESCE(is_company, false) FROM tenant.users WHERE user_id = :uid"),
        {"uid": str(user["user_id"])},
    )).scalar()
    row = (await db.execute(
        text("""
            SELECT entity_id, business_name, operator_name, account_type, region_id
            FROM tenant.business_entities
            WHERE tenant_id = :tid
            ORDER BY created_at LIMIT 1
        """),
        {"tid": str(user["tenant_id"])},
    )).mappings().first()
    return {"data": {"is_company": bool(is_company), "business": dict(row) if row else None}}


@router.patch("/business")
async def update_my_business(
    body: BusinessPatch,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Create or update the caller's business entity (Company accounts only)."""
    is_company = (await db.execute(
        text("SELECT COALESCE(is_company, false) FROM tenant.users WHERE user_id = :uid"),
        {"uid": str(user["user_id"])},
    )).scalar()
    if not is_company:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This is not a company account.")

    data = body.model_dump(exclude_unset=True)
    existing = (await db.execute(
        text("SELECT entity_id FROM tenant.business_entities WHERE tenant_id = :tid ORDER BY created_at LIMIT 1"),
        {"tid": str(user["tenant_id"])},
    )).scalar()

    if existing:
        sets, params = [], {"eid": str(existing)}
        for k in ("business_name", "operator_name", "region_id"):
            if k in data:
                sets.append(f"{k} = :{k}"); params[k] = data[k]
        if not sets:
            return {"data": {"updated": 0}}
        await db.execute(
            text(f"UPDATE tenant.business_entities SET {', '.join(sets)}, updated_at = now() WHERE entity_id = :eid"),
            params,
        )
    else:
        bn = (data.get("business_name") or "").strip()
        if not bn:
            raise HTTPException(status_code=422, detail="Business name is required.")
        at = (await db.execute(
            text("SELECT account_type FROM tenant.users WHERE user_id = :uid"),
            {"uid": str(user["user_id"])},
        )).scalar() or "AGRIBUSINESS_ENTERPRISE"
        await db.execute(
            text("""
                INSERT INTO tenant.business_entities
                    (tenant_id, user_id, business_name, operator_name, account_type, region_id)
                VALUES (CAST(:tid AS uuid), CAST(:uid AS uuid), :bn, :op, :at, :rid)
            """),
            {"tid": str(user["tenant_id"]), "uid": str(user["user_id"]),
             "bn": bn, "op": data.get("operator_name"), "at": at, "rid": data.get("region_id")},
        )
    # Keep the denormalized public-profile copy on tenant.users in sync so the
    # business name/operator show on the PUBLIC profile (business_entities is RLS).
    sync, sparams = [], {"uid": str(user["user_id"])}
    if "business_name" in data:
        sync.append("business_name = :bn"); sparams["bn"] = data.get("business_name")
    if "operator_name" in data:
        sync.append("operator_name = :op"); sparams["op"] = data.get("operator_name")
    if sync:
        await db.execute(text(f"UPDATE tenant.users SET {', '.join(sync)} WHERE user_id = :uid"), sparams)
    await db.commit()
    return {"data": {"updated": 1}}


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
    # pref_* unit columns shipped in migration 095 — probe the same way.
    has_units = (await db.execute(text(
        "SELECT count(*) FROM information_schema.columns WHERE table_schema='tenant' "
        "AND table_name='users' AND column_name IN ('pref_weight','pref_currency')"))).scalar()
    unit_sel = ", pref_weight, pref_currency, whatsapp_number" if int(has_units or 0) >= 2 \
        else ", NULL AS pref_weight, NULL AS pref_currency, whatsapp_number"
    # share_location shipped in migration 164 — probe so pre-164 deployments don't error.
    has_share = (await db.execute(text(
        "SELECT count(*) FROM information_schema.columns WHERE table_schema='tenant' "
        "AND table_name='users' AND column_name='share_location'"))).scalar()
    share_sel = ", share_location, location_share_ack_at" if int(has_share or 0) >= 1 \
        else ", true AS share_location, NULL AS location_share_ack_at"
    row = (await db.execute(text(
        f"SELECT notify_whatsapp, notify_tasks, notify_weather, preferred_language{unit_sel}{share_sel} "
        "FROM tenant.users WHERE user_id = :uid"), {"uid": str(user["user_id"])})).mappings().first()
    d = dict(row) if row else {}
    if "location_share_ack_at" in d:
        d["location_share_ack"] = d.pop("location_share_ack_at") is not None
    return {"data": d}


@router.get("/tours")
async def my_tours(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Tour keys this user has already seen — drives first-visit auto-run.
    Migration-tolerant: if the table isn't there yet, return empty (no tours
    block the UI)."""
    try:
        rows = (await db.execute(text(
            "SELECT tour_key FROM tenant.user_tours WHERE user_id = :uid"),
            {"uid": str(user["user_id"])})).scalars().all()
        return {"data": {"seen": list(rows)}}
    except Exception:
        return {"data": {"seen": []}}


@router.post("/tours/{tour_key}/seen")
async def mark_tour_seen(
    tour_key: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Record that the user finished or dismissed a tour (idempotent)."""
    await db.execute(text("""
        INSERT INTO tenant.user_tours (tenant_id, user_id, tour_key)
        VALUES (cast(:tid AS uuid), :uid, :tk)
        ON CONFLICT (user_id, tour_key) DO NOTHING
    """), {"tid": str(user["tenant_id"]), "uid": str(user["user_id"]), "tk": tour_key[:64]})
    await db.commit()
    return {"data": {"tour_key": tour_key, "seen": True}}


@router.delete("/tours/{tour_key}/seen")
async def replay_tour(
    tour_key: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Clear a tour's seen-state so the farmer can replay it."""
    await db.execute(text(
        "DELETE FROM tenant.user_tours WHERE user_id = :uid AND tour_key = :tk"),
        {"uid": str(user["user_id"]), "tk": tour_key[:64]})
    await db.commit()
    return {"data": {"tour_key": tour_key, "seen": False}}


@router.post("/activity")
async def ping_activity(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Daily-active ping — the frontend fires once per session. One row per
    user per day; the honest DAU/WAU/MAU foundation (measured app opens)."""
    try:
        await db.execute(text(
            "INSERT INTO community.activity_days (user_id, day) VALUES (cast(:uid AS uuid), CURRENT_DATE) ON CONFLICT DO NOTHING"),
            {"uid": str(user["user_id"])})
        await db.commit()
    except Exception:  # noqa: BLE001 — pre-108 deployments no-op, never error
        await db.rollback()
    return {"data": {"ok": True}}


@router.get("/consent")
async def get_consent(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The farmer's current data-sharing consent. Migration-tolerant: pre-111
    deployments report not-consented (the safe default)."""
    has = (await db.execute(text(
        "SELECT 1 FROM information_schema.columns WHERE table_schema='tenant' "
        "AND table_name='users' AND column_name='aggregate_consent'"))).scalar()
    if not has:
        return {"data": {"aggregate_consent": False, "aggregate_consent_at": None, "available": False}}
    row = (await db.execute(text(
        "SELECT aggregate_consent, aggregate_consent_at FROM tenant.users WHERE user_id = cast(:uid AS uuid)"),
        {"uid": str(user["user_id"])})).mappings().first()
    return {"data": {**(dict(row) if row else {}), "available": True}}


class ConsentBody(BaseModel):
    aggregate_consent: bool


@router.post("/consent")
async def set_consent(
    body: ConsentBody,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Farmer grants or withdraws consent for their anonymized, aggregated data
    to inform external reports (ministries/NGOs/banks). Default is OFF; this is
    the ONLY way it turns on. Every change is logged to the consent ledger
    (Covenant §3 + GDPR consent-management + right-to-withdraw)."""
    has = (await db.execute(text(
        "SELECT 1 FROM information_schema.columns WHERE table_schema='tenant' "
        "AND table_name='users' AND column_name='aggregate_consent'"))).scalar()
    if not has:
        raise HTTPException(status_code=503, detail="Consent controls not available yet — run the deploy script")
    await db.execute(text(
        "UPDATE tenant.users SET aggregate_consent = :c, aggregate_consent_at = now() WHERE user_id = cast(:uid AS uuid)"),
        {"c": body.aggregate_consent, "uid": str(user["user_id"])})
    await db.commit()  # the flag is the binding state — persist it before the ledger
    # Append to the consent ledger (best-effort; its own txn so a failure here
    # can never roll back the flag above). asyncpg poisons a txn on error, so we
    # isolate this in a nested savepoint.
    try:
        async with db.begin():
            await db.execute(text(
                "INSERT INTO community.consent_events (user_id, consent_type, granted, source) "
                "VALUES (cast(:uid AS uuid), 'AGGREGATE', :g, 'SELF')"),
                {"uid": str(user["user_id"]), "g": body.aggregate_consent})
    except Exception:  # noqa: BLE001 — ledger best-effort; the flag is the binding state
        await db.rollback()
    return {"data": {"aggregate_consent": body.aggregate_consent}}
