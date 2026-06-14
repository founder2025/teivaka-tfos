"""
Community Feed router — mounted at /api/v1/community.

Full social loop on the clean community.feed_* schema (migration 089):
  GET    /feed                       list posts (filter, verified_only, viewer state)
  POST   /feed                       create a post
  DELETE /feed/{post_id}             soft-delete own post
  POST   /feed/{post_id}/like        like        DELETE = unlike
  PUT    /feed/{post_id}/react       set emoji reaction {reaction}   DELETE = remove
  POST   /feed/{post_id}/repost      repost to own feed {body?}
  POST   /feed/{post_id}/save        save        DELETE = unsave
  POST   /feed/{post_id}/share       share to another TFOS user {to_user_id, note?}
  GET    /feed/{post_id}/replies     reply tree
  POST   /feed/{post_id}/replies     add reply {body, parent_reply_id?, photos?}
  POST   /feed/replies/{id}/like     like reply  DELETE = unlike
  POST   /feed/{post_id}/best/{rid}  mark best answer (question author)
  GET    /feed/shared                posts shared with me
  POST   /follow/{user_id}           follow      DELETE = unfollow
  GET    /topics  POST /topics {topic}  DELETE /topics/{topic}   followed topics

Counts (likes/replies/reposts/reactions) are computed on read — never denormalised,
so they can't drift. Reads are authenticated (feed is a logged-in surface) so we can
compute per-viewer state and honour audience visibility. Writes set tenant_id for
provenance (community.* has no RLS). FKs to tenant.users.
"""
import os
import re
import pathlib
import shutil
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy import text
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
import uuid

from app.db.session import get_db, get_rls_db, get_db_ctx
from app.middleware.rls import get_current_user
from app.utils.community_guard import community_write, rate_limit_only

router = APIRouter()

REACTIONS = {"strong_crop", "good_harvest", "vinaka", "hoping_rain", "learning"}
# Canonical profession = account_type lower-cased (8-profession taxonomy).
_AUDIENCES = ("everyone", "followers",
              # persona-group audiences (current taxonomy)
              "PRODUCER", "TRADE", "CAPITAL", "GOVERNANCE", "SERVICE",
              # legacy 8-profession audiences (pre-migration posts) — still accepted
              "farmer", "buyer", "supplier", "service_provider",
              "banker", "business", "exporter", "importer")


def _viewer_audiences(account_type):
    """Audience values that should reach a viewer: their persona group (current
    taxonomy) plus any legacy old-profession audience that maps to that group, so
    pre-migration posts still reach the right people."""
    from app.core.account_types import persona_group, LEGACY_ACCOUNT_TYPE_MAP
    g = persona_group(account_type)
    if not g:
        return []
    auds = [g]
    for old_key, new_val in LEGACY_ACCOUNT_TYPE_MAP.items():
        ok = old_key.lower()  # stored legacy audiences are lowercase ('farmer', …)
        if ok != "other" and persona_group(new_val) == g and ok not in auds:
            auds.append(ok)
    return auds

# Upload storage — served back through /api/v1/community/uploads/{name} (Caddy proxies
# /api/* to the API). Mount a volume at this path in compose to survive rebuilds.
MEDIA_DIR = pathlib.Path(os.environ.get("TFOS_MEDIA_DIR", "/app/uploads"))
try:
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
except Exception:  # noqa: BLE001 — never let upload-dir setup block API boot
    pass
_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm", ".mov",
                # audio (chat voice notes — MediaRecorder emits webm/mp4; others for Safari/iOS)
                ".m4a", ".mp3", ".ogg", ".oga", ".wav", ".aac", ".weba"}
_MAX_BYTES = 15 * 1024 * 1024  # 15 MB
_MENTION_RE = re.compile(r"@\[([^\]]+)\]")


def _pid():
    return "CPST-" + uuid.uuid4().hex[:8].upper()


# Runtime feature detection — so a not-yet-applied migration can NEVER 500 a
# hot path again. Each flag is probed once and cached; queries include the
# migration-dependent pieces only when the object actually exists.
_FEAT_CACHE: dict = {}


async def _has(db, key, check_sql) -> bool:
    if key in _FEAT_CACHE:
        return _FEAT_CACHE[key]
    try:
        v = bool((await db.execute(text(check_sql))).scalar())
    except Exception:  # noqa: BLE001 — never let a probe break the request
        v = False
    _FEAT_CACHE[key] = v
    return v


async def _comments_enabled_col(db):
    return await _has(db, "comments_enabled", "SELECT 1 FROM information_schema.columns WHERE table_schema='community' AND table_name='feed_posts' AND column_name='comments_enabled'")


async def _verified_expr(db, alias="u"):
    """Green tick = KYC-verified (government ID + selfie, admin-reviewed) — a
    stronger claim than email_verified. Migration-tolerant: before 097 lands
    the expression is honest FALSE (nobody is KYC-verified yet), never a 500."""
    has = await _has(db, "kyc_col", "SELECT 1 FROM information_schema.columns WHERE table_schema='tenant' AND table_name='users' AND column_name='kyc_verified'")
    return f"COALESCE({alias}.kyc_verified, FALSE)" if has else "FALSE"


async def _has_table(db, name, cols=()):
    # Existence AND permission AND required-column probe. Forensically earned,
    # twice: (1) a table created by the owner but ungranted 500s with
    # InsufficientPrivilege; (2) a PRE-EXISTING table with different columns
    # (094's CREATE IF NOT EXISTS silently no-ops on it) makes an unqualified
    # column in a subquery resolve to the OUTER query -> AmbiguousColumnError.
    # The feature is only "on" when the table is readable AND has every column
    # the query needs.
    colcheck = ""
    if cols:
        col_list = ", ".join(f"'{c}'" for c in cols)
        colcheck = f"""
            AND (SELECT count(*) FROM information_schema.columns
                 WHERE table_schema = 'community' AND table_name = '{name}'
                   AND column_name IN ({col_list})) = {len(cols)}"""
    return await _has(db, f"tbl_{name}", f"""
        SELECT COALESCE((SELECT has_table_privilege(current_user, c.oid, 'SELECT')
                         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                         WHERE n.nspname = 'community' AND c.relname = '{name}'), false)
        {colcheck}
    """)


def _rid():
    return "CRPL-" + uuid.uuid4().hex[:8].upper()


async def _profile_of(db, user_id):
    """(profession, country) snapshot for a user."""
    row = (await db.execute(text(
        "SELECT account_type, country FROM tenant.users WHERE user_id = :uid"),
        {"uid": str(user_id)})).mappings().first() or {}
    return (row.get("account_type") or "FARMER").lower(), (row.get("country") or "FJ")


async def _profession_of(db, user_id) -> str:
    prof, _ = await _profile_of(db, user_id)
    return prof


async def _notify(db, recipient, actor, ntype, post_id=None, reply_id=None, body=None):
    """Insert a notification (skips self-actions). Best-effort — never blocks the action."""
    if not recipient or str(recipient) == str(actor):
        return
    try:
        # SAVEPOINT-isolated: a failed notification insert must not poison the
        # caller's transaction (it would abort the actual follow/reply/post).
        async with db.begin_nested():
            await db.execute(text("""
                INSERT INTO community.feed_notifications
                    (user_id, actor_user_id, type, post_id, reply_id, body)
                VALUES (:uid, :actor, :t, :pid, :rid, :body)
            """), {"uid": str(recipient), "actor": str(actor), "t": ntype,
                   "pid": post_id, "rid": reply_id, "body": body})
    except Exception:  # noqa: BLE001 — notifications are non-critical
        pass
    # Web Push for the same event (best-effort; no-op until VAPID configured)
    try:
        from app.routers.chat import push_to_user
        async with db.begin_nested():
            await push_to_user(db, recipient, "Teivaka", body or "New activity", url="/home")
    except Exception:  # noqa: BLE001
        pass


async def _post_author(db, post_id):
    r = (await db.execute(text(
        "SELECT author_user_id FROM community.feed_posts WHERE post_id = :p"), {"p": post_id})).first()
    return r[0] if r else None


# ----------------------------------------------------------------------------- models
class PostCreate(BaseModel):
    body: str
    audience: str = "everyone"
    location: Optional[str] = None
    vertical: Optional[str] = None
    photos: Optional[List[str]] = []
    mentions: Optional[List[str]] = []
    is_question: bool = False
    link_audit_hash: Optional[str] = None
    reach: str = "LOCAL"          # LOCAL | GLOBAL (exporter/importer global trade)
    kind: str = "POST"           # POST | EDU_REEL (educational reel — global reach)
    group_id: Optional[str] = None  # post into a group (members only; rides full feed infra)


class PostEdit(BaseModel):
    body: Optional[str] = None
    audience: Optional[str] = None
    comments_enabled: Optional[bool] = None


class ReportBody(BaseModel):
    reason: str


class ReplyCreate(BaseModel):
    body: str
    parent_reply_id: Optional[str] = None
    photos: Optional[List[str]] = []


class ReactBody(BaseModel):
    reaction: str


class RepostBody(BaseModel):
    body: Optional[str] = None


class ShareBody(BaseModel):
    to_user_id: str
    note: Optional[str] = None


# ----------------------------------------------------------------------------- list feed
@router.get("/feed")
async def list_feed(
    filter: str = Query("all"),
    verified_only: bool = Query(False),
    author: str = Query(None),
    post_id: str = Query(None),
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        if post_id:
            # Direct permalink fetch (notification deep-links land here). One post
            # by id, NO feed filters — it may be old, in a group, or another
            # user's. Same projection as the feed so the card renders identically.
            comments_col = "fp.comments_enabled," if await _comments_enabled_col(db) else "TRUE AS comments_enabled,"
            vexpr = await _verified_expr(db)
            rows = (await db.execute(text(f"""
                SELECT fp.post_id, fp.author_user_id, fp.author_profession, fp.body, fp.post_type,
                       fp.is_question, fp.audience, fp.location, fp.vertical, fp.photos, fp.mentions,
                       fp.link_audit_hash, fp.is_repost, fp.repost_of_id, fp.pinned,
                       {comments_col}
                       fp.best_answer_reply_id, fp.audit_hash, fp.created_at, fp.edited_at,
                       u.full_name AS author_name, u.avatar_url AS author_avatar, {vexpr} AS author_verified,
                       orig.body AS repost_body, ou.full_name AS repost_author_name, ou.avatar_url AS repost_author_avatar,
                       orig.author_profession AS repost_author_profession,
                       (SELECT count(*) FROM community.feed_likes fl WHERE fl.post_id = fp.post_id) AS like_count,
                       (SELECT count(*) FROM community.feed_replies fr WHERE fr.post_id = fp.post_id AND fr.status = 'active') AS reply_count,
                       (SELECT count(*) FROM community.feed_posts rp WHERE rp.repost_of_id = fp.post_id AND rp.status = 'active') AS repost_count,
                       EXISTS (SELECT 1 FROM community.feed_likes fl WHERE fl.post_id = fp.post_id AND fl.user_id = :uid) AS liked,
                       EXISTS (SELECT 1 FROM community.feed_saves fs WHERE fs.post_id = fp.post_id AND fs.user_id = :uid) AS saved,
                       (SELECT reaction FROM community.feed_reactions rx WHERE rx.target_type = 'post' AND rx.target_id = fp.post_id AND rx.user_id = :uid) AS my_reaction
                FROM community.feed_posts fp
                JOIN tenant.users u ON u.user_id = fp.author_user_id
                LEFT JOIN community.feed_posts orig ON orig.post_id = fp.repost_of_id
                LEFT JOIN tenant.users ou ON ou.user_id = orig.author_user_id
                WHERE fp.post_id = :pid AND fp.status = 'active'
                LIMIT 1
            """), {"uid": uid, "pid": post_id})).mappings().all()
            posts = [dict(r) for r in rows]
            if posts:
                rsum = {}
                for rr in (await db.execute(text("""
                    SELECT reaction, count(*) AS n FROM community.feed_reactions
                    WHERE target_type = 'post' AND target_id = :pid GROUP BY reaction
                """), {"pid": post_id})).mappings().all():
                    rsum[rr["reaction"]] = rr["n"]
                posts[0]["reactions"] = rsum
            return {"data": posts}
        viewer_prof, viewer_country = await _profile_of(db, uid)
        params = {"uid": uid, "limit": limit, "offset": offset, "vprof": viewer_prof, "vcountry": viewer_country}
        where = ["fp.status = 'active'"]

        # country wall: same-country only, EXCEPT educational reels + exporter/importer
        # GLOBAL posts reach every country. (Own posts always visible.)
        where.append("""(
            fp.author_user_id = :uid
            OR fp.kind = 'EDU_REEL'
            OR fp.reach = 'GLOBAL'
            OR fp.country IS NULL
            OR fp.country = :vcountry
        )""")

        # audience visibility (NOT follow-gated — persona-group/everyone within country)
        _vauds = _viewer_audiences(viewer_prof)
        _aud_or = ""
        if _vauds:
            _ph = ", ".join(f":va{i}" for i in range(len(_vauds)))
            _aud_or = f" OR fp.audience IN ({_ph})"
            for i, a in enumerate(_vauds):
                params[f"va{i}"] = a
        where.append(f"""(
            fp.author_user_id = :uid
            OR fp.audience = 'everyone'
            OR (fp.audience = 'followers' AND EXISTS (SELECT 1 FROM community.follows f
                    WHERE f.follower_user_id = :uid AND f.followed_user_id = fp.author_user_id))
            {_aud_or}
        )""")

        has_groups_col = await _has(db, "col_fp_group", "SELECT 1 FROM information_schema.columns WHERE table_schema='community' AND table_name='feed_posts' AND column_name='group_id'")
        if filter.startswith("group_"):
            if not has_groups_col:
                return {"data": []}
            where.append("fp.group_id = :gid")
            params["gid"] = filter.replace("group_", "", 1)
        elif has_groups_col:
            # group posts live ONLY inside their group view
            where.append("fp.group_id IS NULL")

        if filter == "following":
            where.append("""(fp.author_user_id = :uid OR fp.author_user_id IN
                (SELECT followed_user_id FROM community.follows WHERE follower_user_id = :uid))""")
        elif filter == "saved":
            where.append("EXISTS (SELECT 1 FROM community.feed_saves s WHERE s.post_id = fp.post_id AND s.user_id = :uid)")
        elif filter == "questions":
            where.append("fp.is_question = TRUE")
        elif filter == "topics":
            where.append("""(fp.vertical IS NOT NULL AND fp.vertical IN
                (SELECT topic FROM community.topic_follows WHERE user_id = :uid))""")
        elif filter.startswith("profession_"):
            where.append("fp.author_profession = :prof")
            params["prof"] = filter.replace("profession_", "")
        elif filter.startswith("group_"):
            from app.core.account_types import PERSONA_GROUPS
            grp = filter.replace("group_", "").upper()
            gtypes = [k.lower() for k, v in PERSONA_GROUPS.items() if v == grp]
            if gtypes:
                ph = ", ".join(f":fg{i}" for i in range(len(gtypes)))
                where.append(f"fp.author_profession IN ({ph})")
                for i, t in enumerate(gtypes):
                    params[f"fg{i}"] = t

        if verified_only:
            where.append(f"{await _verified_expr(db)} = TRUE")
        if author:
            where.append("fp.author_user_id = :author")
            params["author"] = author

        # viewer-level suppression — only if migration 094's tables exist (degrade
        # gracefully if not yet applied, rather than 500 the whole feed).
        if await _has_table(db, "feed_hidden", ("user_id", "post_id")):
            where.append("NOT EXISTS (SELECT 1 FROM community.feed_hidden h WHERE h.post_id = fp.post_id AND h.user_id = :uid)")
        if await _has_table(db, "user_mutes", ("user_id", "muted_user_id")):
            where.append("fp.author_user_id NOT IN (SELECT m.muted_user_id FROM community.user_mutes m WHERE m.user_id = :uid)")
        if await _has_table(db, "user_blocks", ("user_id", "blocked_user_id")):
            where.append("fp.author_user_id NOT IN (SELECT b1.blocked_user_id FROM community.user_blocks b1 WHERE b1.user_id = :uid)")
            where.append("NOT EXISTS (SELECT 1 FROM community.user_blocks b2 WHERE b2.user_id = fp.author_user_id AND b2.blocked_user_id = :uid)")
        comments_col = "fp.comments_enabled," if await _comments_enabled_col(db) else "TRUE AS comments_enabled,"
        vexpr = await _verified_expr(db)

        rows = (await db.execute(text(f"""
            SELECT fp.post_id, fp.author_user_id, fp.author_profession, fp.body, fp.post_type,
                   fp.is_question, fp.audience, fp.location, fp.vertical, fp.photos, fp.mentions,
                   fp.link_audit_hash, fp.is_repost, fp.repost_of_id, fp.pinned,
                   {comments_col}
                   fp.best_answer_reply_id, fp.audit_hash, fp.created_at, fp.edited_at,
                   u.full_name AS author_name, u.avatar_url AS author_avatar, {vexpr} AS author_verified,
                   orig.body AS repost_body, ou.full_name AS repost_author_name, ou.avatar_url AS repost_author_avatar,
                   orig.author_profession AS repost_author_profession,
                   (SELECT count(*) FROM community.feed_likes fl WHERE fl.post_id = fp.post_id) AS like_count,
                   (SELECT count(*) FROM community.feed_replies fr WHERE fr.post_id = fp.post_id AND fr.status = 'active') AS reply_count,
                   (SELECT count(*) FROM community.feed_posts rp WHERE rp.repost_of_id = fp.post_id AND rp.status = 'active') AS repost_count,
                   EXISTS (SELECT 1 FROM community.feed_likes fl WHERE fl.post_id = fp.post_id AND fl.user_id = :uid) AS liked,
                   EXISTS (SELECT 1 FROM community.feed_saves fs WHERE fs.post_id = fp.post_id AND fs.user_id = :uid) AS saved,
                   (SELECT reaction FROM community.feed_reactions rx WHERE rx.target_type = 'post' AND rx.target_id = fp.post_id AND rx.user_id = :uid) AS my_reaction
            FROM community.feed_posts fp
            JOIN tenant.users u ON u.user_id = fp.author_user_id
            LEFT JOIN community.feed_posts orig ON orig.post_id = fp.repost_of_id
            LEFT JOIN tenant.users ou ON ou.user_id = orig.author_user_id
            WHERE {' AND '.join(where)}
            ORDER BY fp.pinned DESC, fp.created_at DESC
            LIMIT :limit OFFSET :offset
        """), params)).mappings().all()

        posts = [dict(r) for r in rows]
        ids = [p["post_id"] for p in posts]
        summ = {}
        if ids:
            for rr in (await db.execute(text("""
                SELECT target_id, reaction, count(*) AS n FROM community.feed_reactions
                WHERE target_type = 'post' AND target_id = ANY(:ids)
                GROUP BY target_id, reaction
            """), {"ids": ids})).mappings().all():
                summ.setdefault(rr["target_id"], {})[rr["reaction"]] = rr["n"]
        for p in posts:
            p["reactions"] = summ.get(p["post_id"], {})
    return {"data": posts}


# ----------------------------------------------------------------------------- create / delete
@router.post("/feed")
async def create_feed_post(body: PostCreate, user: dict = Depends(community_write("post", 10))):
    if not (body.body and body.body.strip()):
        raise HTTPException(status_code=422, detail="Post body is required")
    post_id = _pid()
    mentions = body.mentions or _MENTION_RE.findall(body.body)
    reach = "GLOBAL" if str(body.reach).upper() == "GLOBAL" else "LOCAL"
    kind = "EDU_REEL" if str(body.kind).upper() == "EDU_REEL" else "POST"
    async with get_rls_db(str(user["tenant_id"])) as db:
        prof, country = await _profile_of(db, user["user_id"])
        # Global reach is reserved for exporters/importers (cross-border trade).
        if reach == "GLOBAL" and prof not in ("exporter", "importer"):
            reach = "LOCAL"
        group_id = None
        if body.group_id:
            has_g = await _has(db, "col_fp_group", "SELECT 1 FROM information_schema.columns WHERE table_schema='community' AND table_name='feed_posts' AND column_name='group_id'")
            if not has_g:
                raise HTTPException(status_code=503, detail="Groups not available yet — run the deploy script")
            from app.routers.groups import is_group_member
            if not await is_group_member(db, body.group_id, user["user_id"]):
                raise HTTPException(status_code=403, detail="Join the group to post in it")
            group_id = body.group_id
        g_col = ", group_id" if group_id else ""
        g_val = ", :group_id" if group_id else ""
        await db.execute(text(f"""
            INSERT INTO community.feed_posts
                (post_id, tenant_id, author_user_id, author_profession, country, reach, kind,
                 body, post_type, is_question, audience, location, vertical, photos, mentions,
                 link_audit_hash, audit_hash{g_col})
            VALUES
                (:post_id, :tenant_id, :author_user_id, :prof, :country, :reach, :kind,
                 :body, :post_type, :is_question, :audience, :location, :vertical, :photos, :mentions,
                 :link, :audit_hash{g_val})
        """), {
            **({"group_id": group_id} if group_id else {}),
            "post_id": post_id,
            "tenant_id": str(user["tenant_id"]),
            "author_user_id": str(user["user_id"]),
            "prof": prof,
            "country": country,
            "reach": reach,
            "kind": kind,
            "body": body.body.strip(),
            "post_type": "QUESTION" if body.is_question else ("PHOTO" if body.photos else "UPDATE"),
            "is_question": body.is_question,
            "audience": body.audience if body.audience in _AUDIENCES else "everyone",
            "location": body.location,
            "vertical": body.vertical,
            "photos": body.photos or [],
            "mentions": mentions,
            "link": body.link_audit_hash,
            "audit_hash": uuid.uuid4().hex[:12],
        })
        # notify mentioned users (resolve names → user_ids)
        for name in mentions[:10]:
            r = (await db.execute(text(
                "SELECT user_id FROM tenant.users WHERE full_name = :n AND is_active = TRUE LIMIT 1"),
                {"n": name})).first()
            if r:
                await _notify(db, r[0], user["user_id"], "MENTION", post_id=post_id,
                              body=f"{user.get('full_name','Someone')} mentioned you")
        # Phase I1 — behavioural telemetry (best-effort, PII-gated in track())
        from app.core.analytics import track
        await track(db, pillar="home", event_type="post_created", user=user,
                    entity_type="post", entity_id=post_id, region=country,
                    props={"has_photo": bool(body.photos), "is_question": body.is_question,
                           "group_id": group_id, "audience": body.audience, "reach": reach})
    return {"data": {"post_id": post_id}}


@router.patch("/feed/{post_id}")
async def edit_feed_post(post_id: str, body: PostEdit, user: dict = Depends(get_current_user)):
    """Partial edit of own post — body, audience, and/or comments on/off."""
    sets, params = [], {"pid": post_id, "uid": str(user["user_id"])}
    if body.body is not None:
        if not body.body.strip():
            raise HTTPException(status_code=422, detail="Post body cannot be empty")
        sets.append("body = :body"); params["body"] = body.body.strip()
        sets.append("edited_at = now()")
    if body.audience is not None:
        if body.audience not in _AUDIENCES:
            raise HTTPException(status_code=422, detail="Invalid audience")
        sets.append("audience = :audience"); params["audience"] = body.audience
    if body.comments_enabled is not None:
        sets.append("comments_enabled = :ce"); params["ce"] = body.comments_enabled
    if not sets:
        return {"data": {"post_id": post_id, "edited": False}}
    async with get_rls_db(str(user["tenant_id"])) as db:
        res = await db.execute(text(f"""
            UPDATE community.feed_posts SET {', '.join(sets)}
            WHERE post_id = :pid AND author_user_id = :uid AND status IN ('active','hidden')
        """), params)
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Post not found or not yours")
    return {"data": {"post_id": post_id, "edited": True}}


@router.post("/feed/{post_id}/pin")
async def toggle_pin(post_id: str, user: dict = Depends(get_current_user)):
    """Pin/unpin own post (pinned posts sort first on the feed + profile)."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        row = (await db.execute(text("""
            UPDATE community.feed_posts SET pinned = NOT pinned
            WHERE post_id = :pid AND author_user_id = :uid AND status = 'active'
            RETURNING pinned
        """), {"pid": post_id, "uid": str(user["user_id"])})).first()
        if not row:
            raise HTTPException(status_code=404, detail="Post not found or not yours")
    return {"data": {"post_id": post_id, "pinned": row[0]}}


@router.post("/feed/{post_id}/archive")
async def archive_post(post_id: str, user: dict = Depends(get_current_user)):
    """Hide own post from the feed without deleting it (status=hidden)."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        res = await db.execute(text("UPDATE community.feed_posts SET status='hidden' WHERE post_id=:pid AND author_user_id=:uid AND status='active'"),
                               {"pid": post_id, "uid": str(user["user_id"])})
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Post not found or not yours")
    return {"data": {"post_id": post_id, "status": "hidden"}}


@router.post("/feed/{post_id}/unarchive")
async def unarchive_post(post_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        res = await db.execute(text("UPDATE community.feed_posts SET status='active' WHERE post_id=:pid AND author_user_id=:uid AND status='hidden'"),
                               {"pid": post_id, "uid": str(user["user_id"])})
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Post not found or not yours")
    return {"data": {"post_id": post_id, "status": "active"}}


@router.post("/feed/{post_id}/hide-for-me")
async def hide_for_me(post_id: str, user: dict = Depends(get_current_user)):
    """Per-viewer hide ("show fewer like this") — removes it from MY feed only."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("INSERT INTO community.feed_hidden (post_id, user_id) VALUES (:pid,:uid) ON CONFLICT DO NOTHING"),
                         {"pid": post_id, "uid": str(user["user_id"])})
    return {"data": {"post_id": post_id, "hidden": True}}


@router.delete("/feed/{post_id}/hide-for-me")
async def unhide_for_me(post_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("DELETE FROM community.feed_hidden WHERE post_id=:pid AND user_id=:uid"),
                         {"pid": post_id, "uid": str(user["user_id"])})
    return {"data": {"post_id": post_id, "hidden": False}}


@router.delete("/feed/{post_id}")
async def delete_feed_post(post_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        res = await db.execute(text("""
            UPDATE community.feed_posts SET status = 'deleted', deleted_at = now()
            WHERE post_id = :pid AND author_user_id = :uid AND status = 'active'
        """), {"pid": post_id, "uid": str(user["user_id"])})
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Post not found or not yours")
    return {"data": {"post_id": post_id, "status": "deleted"}}


# ----------------------------------------------------------------------------- like
@router.post("/feed/{post_id}/like")
async def like_post(post_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO community.feed_likes (post_id, user_id) VALUES (:pid, :uid)
            ON CONFLICT DO NOTHING
        """), {"pid": post_id, "uid": str(user["user_id"])})
        await _notify(db, await _post_author(db, post_id), user["user_id"], "LIKE",
                      post_id=post_id, body=f"{user.get('full_name','Someone')} liked your post")
    return {"data": {"post_id": post_id, "liked": True}}


@router.delete("/feed/{post_id}/like")
async def unlike_post(post_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("DELETE FROM community.feed_likes WHERE post_id = :pid AND user_id = :uid"),
                         {"pid": post_id, "uid": str(user["user_id"])})
    return {"data": {"post_id": post_id, "liked": False}}


# ----------------------------------------------------------------------------- react
@router.put("/feed/{post_id}/react")
async def react_post(post_id: str, body: ReactBody, user: dict = Depends(get_current_user)):
    if body.reaction not in REACTIONS:
        raise HTTPException(status_code=422, detail="Unknown reaction")
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO community.feed_reactions (user_id, target_type, target_id, reaction)
            VALUES (:uid, 'post', :pid, :rx)
            ON CONFLICT (user_id, target_type, target_id) DO UPDATE SET reaction = EXCLUDED.reaction
        """), {"uid": str(user["user_id"]), "pid": post_id, "rx": body.reaction})
        await _notify(db, await _post_author(db, post_id), user["user_id"], "REACT",
                      post_id=post_id, body=f"{user.get('full_name','Someone')} reacted to your post")
    return {"data": {"post_id": post_id, "reaction": body.reaction}}


@router.delete("/feed/{post_id}/react")
async def unreact_post(post_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("DELETE FROM community.feed_reactions WHERE target_type='post' AND target_id=:pid AND user_id=:uid"),
                         {"pid": post_id, "uid": str(user["user_id"])})
    return {"data": {"post_id": post_id, "reaction": None}}


# ----------------------------------------------------------------------------- repost
@router.post("/feed/{post_id}/repost")
async def repost(post_id: str, body: RepostBody, user: dict = Depends(community_write("repost", 10))):
    async with get_rls_db(str(user["tenant_id"])) as db:
        orig = (await db.execute(text("SELECT post_id FROM community.feed_posts WHERE post_id=:pid AND status='active'"),
                                 {"pid": post_id})).first()
        if not orig:
            raise HTTPException(status_code=404, detail="Original post not found")
        prof = await _profession_of(db, user["user_id"])
        new_id = _pid()
        await db.execute(text("""
            INSERT INTO community.feed_posts
                (post_id, tenant_id, author_user_id, author_profession, body, post_type,
                 is_repost, repost_of_id, audit_hash)
            VALUES (:pid, :tid, :uid, :prof, :body, 'UPDATE', TRUE, :orig, :audit_hash)
        """), {
            "pid": new_id, "tid": str(user["tenant_id"]), "uid": str(user["user_id"]), "prof": prof,
            "body": (body.body or "").strip() or "Reposted", "orig": post_id, "audit_hash": uuid.uuid4().hex[:12],
        })
        await _notify(db, await _post_author(db, post_id), user["user_id"], "REPOST",
                      post_id=post_id, body=f"{user.get('full_name','Someone')} reposted your post")
    return {"data": {"post_id": new_id, "repost_of_id": post_id}}


# ----------------------------------------------------------------------------- save
@router.post("/feed/{post_id}/save")
async def save_post(post_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("INSERT INTO community.feed_saves (post_id, user_id) VALUES (:pid,:uid) ON CONFLICT DO NOTHING"),
                         {"pid": post_id, "uid": str(user["user_id"])})
    return {"data": {"post_id": post_id, "saved": True}}


@router.delete("/feed/{post_id}/save")
async def unsave_post(post_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("DELETE FROM community.feed_saves WHERE post_id=:pid AND user_id=:uid"),
                         {"pid": post_id, "uid": str(user["user_id"])})
    return {"data": {"post_id": post_id, "saved": False}}


# ----------------------------------------------------------------------------- share
@router.post("/feed/{post_id}/share")
async def share_post(post_id: str, body: ShareBody, user: dict = Depends(community_write("share", 15))):
    async with get_rls_db(str(user["tenant_id"])) as db:
        ok = (await db.execute(text("SELECT 1 FROM community.feed_posts WHERE post_id=:pid AND status='active'"),
                               {"pid": post_id})).first()
        if not ok:
            raise HTTPException(status_code=404, detail="Post not found")
        recipient = (await db.execute(text("SELECT 1 FROM tenant.users WHERE user_id=:to"),
                                      {"to": body.to_user_id})).first()
        if not recipient:
            raise HTTPException(status_code=404, detail="Recipient not found")
        await db.execute(text("""
            INSERT INTO community.feed_shares (post_id, from_user_id, to_user_id, note)
            VALUES (:pid, :from_id, :to_id, :note)
        """), {"pid": post_id, "from_id": str(user["user_id"]), "to_id": body.to_user_id, "note": body.note})
        await _notify(db, body.to_user_id, user["user_id"], "SHARE", post_id=post_id,
                      body=f"{user.get('full_name','Someone')} shared a post with you")
    return {"data": {"post_id": post_id, "shared_with": body.to_user_id}}


@router.get("/feed/shared")
async def shared_with_me(user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        rows = (await db.execute(text("""
            SELECT sh.share_id, sh.note, sh.created_at, sh.from_user_id,
                   fu.full_name AS from_name, fp.post_id, fp.body, fp.author_profession,
                   au.full_name AS author_name
            FROM community.feed_shares sh
            JOIN community.feed_posts fp ON fp.post_id = sh.post_id AND fp.status='active'
            JOIN tenant.users fu ON fu.user_id = sh.from_user_id
            JOIN tenant.users au ON au.user_id = fp.author_user_id
            WHERE sh.to_user_id = :uid
            ORDER BY sh.created_at DESC LIMIT 50
        """), {"uid": uid})).mappings().all()
    return {"data": [dict(r) for r in rows]}


# ----------------------------------------------------------------------------- replies
@router.get("/feed/{post_id}/replies")
async def list_replies(post_id: str, user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        vexpr = await _verified_expr(db)
        rows = (await db.execute(text(f"""
            SELECT fr.reply_id, fr.post_id, fr.parent_reply_id, fr.author_user_id,
                   fr.author_profession, fr.body, fr.photos, fr.created_at,
                   u.full_name AS author_name, u.avatar_url AS author_avatar, {vexpr} AS author_verified,
                   (SELECT count(*) FROM community.feed_reply_likes rl WHERE rl.reply_id = fr.reply_id) AS like_count,
                   EXISTS (SELECT 1 FROM community.feed_reply_likes rl WHERE rl.reply_id = fr.reply_id AND rl.user_id = :uid) AS liked
            FROM community.feed_replies fr
            JOIN tenant.users u ON u.user_id = fr.author_user_id
            WHERE fr.post_id = :pid AND fr.status = 'active'
            ORDER BY fr.created_at ASC
        """), {"pid": post_id, "uid": uid})).mappings().all()
    return {"data": [dict(r) for r in rows]}


@router.post("/feed/{post_id}/replies")
async def add_reply(post_id: str, body: ReplyCreate, user: dict = Depends(community_write("reply", 20))):
    if not (body.body and body.body.strip()):
        raise HTTPException(status_code=422, detail="Reply body is required")
    reply_id = _rid()
    async with get_rls_db(str(user["tenant_id"])) as db:
        if await _comments_enabled_col(db):
            prow = (await db.execute(text("SELECT comments_enabled FROM community.feed_posts WHERE post_id=:pid AND status='active'"),
                                     {"pid": post_id})).first()
            if not prow:
                raise HTTPException(status_code=404, detail="Post not found")
            if prow[0] is False:
                raise HTTPException(status_code=403, detail="Comments are turned off for this post")
        else:
            prow = (await db.execute(text("SELECT 1 FROM community.feed_posts WHERE post_id=:pid AND status='active'"),
                                     {"pid": post_id})).first()
            if not prow:
                raise HTTPException(status_code=404, detail="Post not found")
        prof = await _profession_of(db, user["user_id"])
        await db.execute(text("""
            INSERT INTO community.feed_replies
                (reply_id, post_id, parent_reply_id, tenant_id, author_user_id, author_profession, body, photos)
            VALUES (:rid, :pid, :parent, :tid, :uid, :prof, :body, :photos)
        """), {
            "rid": reply_id, "pid": post_id, "parent": body.parent_reply_id,
            "tid": str(user["tenant_id"]), "uid": str(user["user_id"]), "prof": prof,
            "body": body.body.strip(), "photos": body.photos or [],
        })
        await _notify(db, await _post_author(db, post_id), user["user_id"], "REPLY",
                      post_id=post_id, reply_id=reply_id,
                      body=f"{user.get('full_name','Someone')} replied to your post")
    return {"data": {"reply_id": reply_id, "post_id": post_id}}


@router.post("/feed/replies/{reply_id}/like")
async def like_reply(reply_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("INSERT INTO community.feed_reply_likes (reply_id, user_id) VALUES (:rid,:uid) ON CONFLICT DO NOTHING"),
                         {"rid": reply_id, "uid": str(user["user_id"])})
    return {"data": {"reply_id": reply_id, "liked": True}}


@router.delete("/feed/replies/{reply_id}/like")
async def unlike_reply(reply_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("DELETE FROM community.feed_reply_likes WHERE reply_id=:rid AND user_id=:uid"),
                         {"rid": reply_id, "uid": str(user["user_id"])})
    return {"data": {"reply_id": reply_id, "liked": False}}


@router.post("/feed/{post_id}/best/{reply_id}")
async def mark_best_answer(post_id: str, reply_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        post = (await db.execute(text(
            "SELECT author_user_id, is_question, best_answer_reply_id FROM community.feed_posts WHERE post_id=:pid"),
            {"pid": post_id})).mappings().first()
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")
        if str(post["author_user_id"]) != str(user["user_id"]) or not post["is_question"]:
            raise HTTPException(status_code=403, detail="Only the question author can mark a best answer")
        new_val = None if post["best_answer_reply_id"] == reply_id else reply_id
        await db.execute(text("UPDATE community.feed_posts SET best_answer_reply_id=:rid WHERE post_id=:pid"),
                         {"rid": new_val, "pid": post_id})
    return {"data": {"post_id": post_id, "best_answer_reply_id": new_val}}


# ----------------------------------------------------------------------------- follow
@router.post("/follow/{target_user_id}")
async def follow(target_user_id: str, user: dict = Depends(rate_limit_only("follow", 30))):
    # Following is core social-graph, not abuse-broadcast — available to every
    # authenticated user (verified or not), rate-limited only.
    if target_user_id == str(user["user_id"]):
        raise HTTPException(status_code=422, detail="Cannot follow yourself")
    async with get_rls_db(str(user["tenant_id"])) as db:
        blocked = None
        try:
            # SAVEPOINT-isolated: if this check can't run (e.g. migration 094 not
            # yet applied / grant missing on a given environment), degrade to
            # not-blocked rather than 500ing the core follow action.
            async with db.begin_nested():
                blocked = (await db.execute(text("""
                    SELECT 1 FROM community.user_blocks
                    WHERE (user_id=:me AND blocked_user_id=:them) OR (user_id=:them AND blocked_user_id=:me)
                """), {"me": str(user["user_id"]), "them": target_user_id})).first()
        except Exception:  # noqa: BLE001
            blocked = None
        if blocked:
            raise HTTPException(status_code=403, detail="You can't follow this person.")
        await db.execute(text("""
            INSERT INTO community.follows (follower_user_id, followed_user_id)
            VALUES (:me, :them) ON CONFLICT DO NOTHING
        """), {"me": str(user["user_id"]), "them": target_user_id})
        await _notify(db, target_user_id, user["user_id"], "FOLLOW",
                      body=f"{user.get('full_name','Someone')} started following you")
    return {"data": {"following": target_user_id}}


@router.delete("/follow/{target_user_id}")
async def unfollow(target_user_id: str, user: dict = Depends(rate_limit_only("unfollow", 30))):
    # Symmetric with follow: capping only the follow side leaves the
    # follow/unfollow CHURN loop (mass-follow → notify-spam → mass-unfollow →
    # repeat) running uncapped. Same 30/min, verification-free — a human never
    # hits it, a churn script does.
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("DELETE FROM community.follows WHERE follower_user_id=:me AND followed_user_id=:them"),
                         {"me": str(user["user_id"]), "them": target_user_id})
    return {"data": {"following": None}}


# ----------------------------------------------------------------------------- mute / block
@router.post("/mute/{target_user_id}")
async def mute_user(target_user_id: str, user: dict = Depends(get_current_user)):
    """Hide an author's posts from MY feed (I stay following them)."""
    if target_user_id == str(user["user_id"]):
        raise HTTPException(status_code=400, detail="You can't mute yourself")
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("INSERT INTO community.user_mutes (user_id, muted_user_id) VALUES (:uid,:t) ON CONFLICT DO NOTHING"),
                         {"uid": str(user["user_id"]), "t": target_user_id})
    return {"data": {"muted": target_user_id}}


@router.delete("/mute/{target_user_id}")
async def unmute_user(target_user_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("DELETE FROM community.user_mutes WHERE user_id=:uid AND muted_user_id=:t"),
                         {"uid": str(user["user_id"]), "t": target_user_id})
    return {"data": {"muted": None}}


@router.post("/block/{target_user_id}")
async def block_user(target_user_id: str, user: dict = Depends(get_current_user)):
    """Two-way block: neither of us sees the other's posts. Also drops any follow edges."""
    if target_user_id == str(user["user_id"]):
        raise HTTPException(status_code=400, detail="You can't block yourself")
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("INSERT INTO community.user_blocks (user_id, blocked_user_id) VALUES (:uid,:t) ON CONFLICT DO NOTHING"),
                         {"uid": str(user["user_id"]), "t": target_user_id})
        await db.execute(text("DELETE FROM community.follows WHERE (follower_user_id=:uid AND followed_user_id=:t) OR (follower_user_id=:t AND followed_user_id=:uid)"),
                         {"uid": str(user["user_id"]), "t": target_user_id})
    return {"data": {"blocked": target_user_id}}


@router.delete("/block/{target_user_id}")
async def unblock_user(target_user_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("DELETE FROM community.user_blocks WHERE user_id=:uid AND blocked_user_id=:t"),
                         {"uid": str(user["user_id"]), "t": target_user_id})
    return {"data": {"blocked": None}}


# ----------------------------------------------------------------------------- people
@router.get("/people")
async def list_people(search: str = Query(None), following: bool = Query(False),
                      profession: str = Query(None), group: str = Query(None), sort: str = Query("verified"),
                      user: dict = Depends(get_current_user)):
    """Directory: rich person cards — identity, tick, bio, member-since,
    presence, and marketplace context (active listings / wanted counts).
    following=true restricts to people YOU follow (the mention/tag set)."""
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        vexpr = await _verified_expr(db)
        # marketplace context only if listings table is readable (probe, cached)
        has_listings = await _has(db, "tbl_listings_dir", "SELECT COALESCE((SELECT has_table_privilege(current_user, c.oid, 'SELECT') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='community' AND c.relname='listings'), false)")
        lst_expr = ("""(SELECT count(*) FROM community.listings cl WHERE cl.created_by = u.user_id AND cl.listing_status='ACTIVE') AS active_listings,
                   (SELECT count(*) FROM community.listings cw WHERE cw.created_by = u.user_id AND cw.listing_status='ACTIVE' AND cw.category='WANTED') AS wanted_count,"""
                    if has_listings and await _has(db, "col_listings_cat", "SELECT 1 FROM information_schema.columns WHERE table_schema='community' AND table_name='listings' AND column_name='category'")
                    else "0 AS active_listings, 0 AS wanted_count,")
        params = {"uid": uid}
        clause = ""
        if search:
            clause += " AND u.full_name ILIKE :q"
            params["q"] = f"%{search}%"
        if profession and profession.lower() != "all":
            clause += " AND LOWER(u.account_type) = :prof"
            params["prof"] = profession.lower()
        if group and group.lower() != "all":
            # persona-group filter → all account_types in that group
            from app.core.account_types import PERSONA_GROUPS
            gtypes = [k.lower() for k, v in PERSONA_GROUPS.items() if v == group.upper()]
            if gtypes:
                ph = ", ".join(f":g{i}" for i in range(len(gtypes)))
                clause += f" AND LOWER(u.account_type) IN ({ph})"
                for i, t in enumerate(gtypes):
                    params[f"g{i}"] = t
        if following:
            clause += """ AND EXISTS (SELECT 1 FROM community.follows mf
                          WHERE mf.follower_user_id = :uid AND mf.followed_user_id = u.user_id)"""
        order = "verified DESC, u.created_at DESC" if sort == "verified" else "u.created_at DESC"
        rows = (await db.execute(text(f"""
            SELECT u.user_id, u.full_name, u.account_type, u.country, u.avatar_url,
                   u.bio, u.created_at AS member_since,
                   {vexpr} AS verified,
                   {lst_expr}
                   EXISTS (SELECT 1 FROM community.follows f
                           WHERE f.follower_user_id = :uid AND f.followed_user_id = u.user_id) AS is_following,
                   EXISTS (SELECT 1 FROM community.follows f2
                           WHERE f2.follower_user_id = u.user_id AND f2.followed_user_id = :uid) AS follows_me
            FROM tenant.users u
            WHERE u.user_id <> :uid AND u.is_active = TRUE{clause}
              AND u.user_id NOT IN (SELECT blocked_user_id FROM community.user_blocks WHERE user_id = :uid)
              AND u.user_id NOT IN (SELECT user_id FROM community.user_blocks WHERE blocked_user_id = :uid)
            ORDER BY follows_me DESC, {order}
            LIMIT 100
        """), params)).mappings().all()
        totals = (await db.execute(text(f"""
            SELECT count(*) AS members, count(*) FILTER (WHERE {vexpr}) AS verified
            FROM tenant.users u WHERE u.is_active = TRUE
        """))).mappings().first()
    # presence (best-effort)
    pres = {}
    try:
        from app.routers.chat import _presence_map
        pres = await _presence_map([str(r["user_id"]) for r in rows])
    except Exception:  # noqa: BLE001
        pres = {}
    return {"data": [{
        "user_id": str(r["user_id"]), "full_name": r["full_name"],
        "profession": (r["account_type"] or "FARMER").lower(),
        "country": r["country"], "verified": r["verified"], "avatar_url": r["avatar_url"],
        "bio": (r["bio"] or "")[:120] or None,
        "member_since": r["member_since"].isoformat() if r["member_since"] else None,
        "active_listings": int(r["active_listings"] or 0),
        "wanted_count": int(r["wanted_count"] or 0),
        "online": pres.get(str(r["user_id"]), {}).get("online", False),
        "is_following": r["is_following"],
        "is_connected": bool(r["is_following"] and r["follows_me"]),
    } for r in rows],
        "meta": {"members": int(totals["members"] or 0) + 1, "verified": int(totals["verified"] or 0)}}


# ----------------------------------------------------------------------------- topics
@router.get("/topics")
async def list_topics(user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        rows = (await db.execute(text("SELECT topic FROM community.topic_follows WHERE user_id=:uid ORDER BY topic"),
                                 {"uid": str(user["user_id"])})).mappings().all()
    return {"data": [r["topic"] for r in rows]}


@router.post("/topics")
async def follow_topic(body: dict, user: dict = Depends(get_current_user)):
    topic = (body.get("topic") or "").strip()
    if not topic:
        raise HTTPException(status_code=422, detail="topic is required")
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("INSERT INTO community.topic_follows (user_id, topic) VALUES (:uid,:t) ON CONFLICT DO NOTHING"),
                         {"uid": str(user["user_id"]), "t": topic})
    return {"data": {"topic": topic, "following": True}}


@router.delete("/topics/{topic}")
async def unfollow_topic(topic: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("DELETE FROM community.topic_follows WHERE user_id=:uid AND topic=:t"),
                         {"uid": str(user["user_id"]), "t": topic})
    return {"data": {"topic": topic, "following": False}}


# ----------------------------------------------------------------------------- notifications
@router.get("/notifications")
async def list_notifications(limit: int = Query(30, ge=1, le=100), user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        rows = (await db.execute(text("""
            SELECT n.notification_id, n.type, n.post_id, n.reply_id, n.body, n.read_at, n.created_at,
                   n.actor_user_id, a.full_name AS actor_name, a.avatar_url AS actor_avatar
            FROM community.feed_notifications n
            LEFT JOIN tenant.users a ON a.user_id = n.actor_user_id
            WHERE n.user_id = :uid
            ORDER BY n.created_at DESC LIMIT :lim
        """), {"uid": uid, "lim": limit})).mappings().all()
        unread = (await db.execute(text(
            "SELECT count(*) FROM community.feed_notifications WHERE user_id = :uid AND read_at IS NULL"),
            {"uid": uid})).scalar() or 0
    return {"data": [dict(r) for r in rows], "unread": unread}


@router.get("/notifications/count")
async def notifications_count(user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        unread = (await db.execute(text(
            "SELECT count(*) FROM community.feed_notifications WHERE user_id = :uid AND read_at IS NULL"),
            {"uid": str(user["user_id"])})).scalar() or 0
    return {"data": {"unread": unread}}


@router.post("/notifications/read")
async def mark_notifications_read(user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text(
            "UPDATE community.feed_notifications SET read_at = now() WHERE user_id = :uid AND read_at IS NULL"),
            {"uid": str(user["user_id"])})
    return {"data": {"ok": True}}


# ----------------------------------------------------------------------------- report / moderation
@router.post("/feed/{post_id}/report")
async def report_post(post_id: str, body: ReportBody, user: dict = Depends(get_current_user)):
    if not (body.reason and body.reason.strip()):
        raise HTTPException(status_code=422, detail="A reason is required")
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO community.feed_flags (post_id, reporter_user_id, reason)
            VALUES (:pid, :uid, :reason)
        """), {"pid": post_id, "uid": str(user["user_id"]), "reason": body.reason.strip()})
    return {"data": {"post_id": post_id, "reported": True}}


# ----------------------------------------------------------------------------- uploads
@router.post("/uploads")
async def upload_media(file: UploadFile = File(...), user: dict = Depends(community_write("upload", 20))):
    """Store an image/short video and return a URL served back through this API
    (Caddy proxies /api/* → API, so no web-server change needed)."""
    ext = pathlib.Path(file.filename or "").suffix.lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(status_code=415, detail=f"Unsupported file type {ext or '?'}")
    name = f"{uuid.uuid4().hex}{ext}"
    dest = MEDIA_DIR / name
    size = 0
    try:
        with dest.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > _MAX_BYTES:
                    out.close()
                    dest.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail="File too large (max 15 MB)")
                out.write(chunk)
    finally:
        await file.close()
    return {"data": {"url": f"/api/v1/community/uploads/{name}", "name": name, "bytes": size}}


@router.get("/uploads/{name}")
async def get_media(name: str):
    """Public read of an uploaded asset. Names are uuid-unique and content never
    changes at a name, so aggressive immutable caching is safe — repeat views
    cost zero bytes on Pacific connections."""
    safe = pathlib.Path(name).name  # strip any path traversal
    path = MEDIA_DIR / safe
    if not path.exists():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path, headers={"Cache-Control": "public, max-age=31536000, immutable"})


# ----------------------------------------------------------------------------- per-photo reactions (lightbox)
@router.get("/feed/{post_id}/photos/reactions")
async def photo_reactions(post_id: str, user: dict = Depends(get_current_user)):
    """Reaction counts + my reaction per photo index (target_id = '<post_id>#<idx>')."""
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        rows = (await db.execute(text("""
            SELECT target_id, reaction, count(*) AS n,
                   bool_or(user_id = cast(:uid AS uuid)) AS mine
            FROM community.feed_reactions
            WHERE target_type = 'photo' AND target_id LIKE :pfx
            GROUP BY target_id, reaction
        """), {"uid": uid, "pfx": f"{post_id}#%"})).mappings().all()
    out: dict = {}
    for r in rows:
        idx = r["target_id"].split("#", 1)[1]
        slot = out.setdefault(idx, {"counts": {}, "mine": None})
        slot["counts"][r["reaction"]] = r["n"]
        if r["mine"]:
            slot["mine"] = r["reaction"]
    return {"data": out}


@router.put("/feed/{post_id}/photos/{idx}/react")
async def react_photo(post_id: str, idx: int, body: ReactBody, user: dict = Depends(get_current_user)):
    if body.reaction not in REACTIONS:
        raise HTTPException(status_code=422, detail="Unknown reaction")
    tid = f"{post_id}#{idx}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO community.feed_reactions (user_id, target_type, target_id, reaction)
            VALUES (:uid, 'photo', :tid, :r)
            ON CONFLICT (user_id, target_type, target_id) DO UPDATE SET reaction = EXCLUDED.reaction
        """), {"uid": str(user["user_id"]), "tid": tid, "r": body.reaction})
    return {"data": {"target": tid, "reaction": body.reaction}}


@router.delete("/feed/{post_id}/photos/{idx}/react")
async def unreact_photo(post_id: str, idx: int, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("DELETE FROM community.feed_reactions WHERE user_id=:uid AND target_type='photo' AND target_id=:tid"),
                         {"uid": str(user["user_id"]), "tid": f"{post_id}#{idx}"})
    return {"data": {"reaction": None}}


# ----------------------------------------------------------------------------- stories (24h)
class StoryCreate(BaseModel):
    media_url: str
    media_type: str = "image"
    caption: Optional[str] = None


@router.get("/stories")
async def list_stories(user: dict = Depends(get_current_user)):
    """Active (unexpired) stories grouped by author, own first; viewer's seen-state."""
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        if not await _has_table(db, "stories", ("story_id", "author_user_id", "media_url", "expires_at")):
            return {"data": []}  # migration 096 not applied yet — honest empty, never 500
        rows = (await db.execute(text("""
            SELECT s.story_id, s.author_user_id, s.media_url, s.media_type, s.caption,
                   s.created_at, u.full_name AS author_name, u.avatar_url AS author_avatar,
                   EXISTS (SELECT 1 FROM community.story_views v
                           WHERE v.story_id = s.story_id AND v.viewer_user_id = :uid) AS seen
            FROM community.stories s
            JOIN tenant.users u ON u.user_id = s.author_user_id
            WHERE s.expires_at > now() AND u.is_active = TRUE
            ORDER BY (s.author_user_id = cast(:uid AS uuid)) DESC, s.created_at ASC
        """), {"uid": uid})).mappings().all()
    groups: dict = {}
    for r in rows:
        k = str(r["author_user_id"])
        g = groups.setdefault(k, {"author_user_id": k, "author_name": r["author_name"],
                                  "author_avatar": r["author_avatar"], "is_you": k == uid,
                                  "all_seen": True, "stories": []})
        g["stories"].append({"story_id": r["story_id"], "media_url": r["media_url"],
                             "media_type": r["media_type"], "caption": r["caption"],
                             "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                             "seen": bool(r["seen"])})
        if not r["seen"]:
            g["all_seen"] = False
    return {"data": list(groups.values())}


@router.post("/stories")
async def create_story(body: StoryCreate, user: dict = Depends(community_write("story", 10))):
    if not (body.media_url or "").strip():
        raise HTTPException(status_code=422, detail="media_url is required")
    sid = "STRY-" + uuid.uuid4().hex[:8].upper()
    mtype = "video" if body.media_type == "video" else "image"
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO community.stories (story_id, tenant_id, author_user_id, media_url, media_type, caption)
            VALUES (:sid, :tid, :uid, :url, :mt, :cap)
        """), {"sid": sid, "tid": str(user["tenant_id"]), "uid": str(user["user_id"]),
               "url": body.media_url.strip(), "mt": mtype, "cap": (body.caption or "").strip() or None})
    return {"data": {"story_id": sid}}


@router.delete("/stories/{story_id}")
async def delete_story(story_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        res = await db.execute(text("DELETE FROM community.stories WHERE story_id=:sid AND author_user_id=:uid"),
                               {"sid": story_id, "uid": str(user["user_id"])})
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Story not found or not yours")
    return {"data": {"deleted": True}}


@router.post("/stories/{story_id}/view")
async def view_story(story_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("INSERT INTO community.story_views (story_id, viewer_user_id) VALUES (:sid,:uid) ON CONFLICT DO NOTHING"),
                         {"sid": story_id, "uid": str(user["user_id"])})
    return {"data": {"seen": True}}


# ----------------------------------------------------------------------------- moderation (admin)
_ADMIN_ROLES = {"ADMIN", "FOUNDER"}


@router.get("/flags")
async def list_flags(status_filter: str = Query("OPEN"), user: dict = Depends(get_current_user)):
    """Moderation queue — admin/founder only."""
    if user.get("role") not in _ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Moderators only")
    async with get_db_ctx() as db:
        params = {}
        clause = ""
        if status_filter and status_filter.upper() != "ALL":
            clause = "WHERE fl.status = :st"
            params["st"] = status_filter.upper()
        rows = (await db.execute(text(f"""
            SELECT fl.flag_id, fl.post_id, fl.reply_id, fl.reason, fl.status, fl.created_at,
                   r.full_name AS reporter_name,
                   fp.body AS post_body, fp.status AS post_status, fp.author_profession,
                   au.full_name AS author_name
            FROM community.feed_flags fl
            LEFT JOIN tenant.users r ON r.user_id = fl.reporter_user_id
            LEFT JOIN community.feed_posts fp ON fp.post_id = fl.post_id
            LEFT JOIN tenant.users au ON au.user_id = fp.author_user_id
            {clause}
            ORDER BY fl.created_at DESC LIMIT 100
        """), params)).mappings().all()
    return {"data": [dict(r) for r in rows]}


class FlagAction(BaseModel):
    action: str  # HIDE | DISMISS | RESTORE


@router.post("/flags/{flag_id}/action")
async def action_flag(flag_id: str, body: FlagAction, user: dict = Depends(get_current_user)):
    if user.get("role") not in _ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Moderators only")
    act = (body.action or "").upper()
    async with get_rls_db(str(user["tenant_id"])) as db:
        flag = (await db.execute(text(
            "SELECT post_id FROM community.feed_flags WHERE flag_id = :f"), {"f": flag_id})).mappings().first()
        if not flag:
            raise HTTPException(status_code=404, detail="Flag not found")
        if act == "HIDE" and flag["post_id"]:
            await db.execute(text("UPDATE community.feed_posts SET status='hidden' WHERE post_id=:p"), {"p": flag["post_id"]})
            new_status = "ACTIONED"
        elif act == "RESTORE" and flag["post_id"]:
            await db.execute(text("UPDATE community.feed_posts SET status='active' WHERE post_id=:p"), {"p": flag["post_id"]})
            new_status = "DISMISSED"
        elif act == "DISMISS":
            new_status = "DISMISSED"
        else:
            raise HTTPException(status_code=422, detail="Unknown action")
        await db.execute(text("""
            UPDATE community.feed_flags
               SET status=:s, reviewed_by=:by, reviewed_at=now()
             WHERE flag_id=:f
        """), {"s": new_status, "by": str(user["user_id"]), "f": flag_id})
    return {"data": {"flag_id": flag_id, "status": new_status}}


# ----------------------------------------------------------------------------- public profile
_VIS_LEVEL = {"public": 0, "followers": 1, "connections": 2, "private": 3}
_DEFAULT_VIS = {"phone": "connections"}  # everything else public by default


@router.get("/profile/{target_id}")
async def get_profile(target_id: str, user: dict = Depends(get_current_user)):
    """Public-safe profile: only visibility-allowed fields + that user's visible posts +
    real stats + the viewer's follow/connection state."""
    viewer = str(user["user_id"])
    async with get_db_ctx() as db:
        vexpr = await _verified_expr(db, alias="tenant.users")
        u = (await db.execute(text(f"""
            SELECT user_id, tenant_id, full_name, email, role, account_type, country,
                   bio, avatar_url, cover_url, whatsapp_number, field_visibility, created_at,
                   is_company, business_name, operator_name,
                   {vexpr} AS verified
            FROM tenant.users WHERE user_id = cast(:id AS uuid) AND is_active = TRUE
        """), {"id": target_id})).mappings().first()
        if not u:
            raise HTTPException(status_code=404, detail="Profile not found")

        is_you = viewer == str(u["user_id"])
        i_follow = bool((await db.execute(text(
            "SELECT 1 FROM community.follows WHERE follower_user_id=cast(:v AS uuid) AND followed_user_id=cast(:t AS uuid)"),
            {"v": viewer, "t": target_id})).first())
        they_follow = bool((await db.execute(text(
            "SELECT 1 FROM community.follows WHERE follower_user_id=cast(:t AS uuid) AND followed_user_id=cast(:v AS uuid)"),
            {"v": viewer, "t": target_id})).first())
        connected = i_follow and they_follow
        level = 3 if is_you else (2 if connected else (1 if i_follow else 0))

        vis = dict(_DEFAULT_VIS)
        try:
            vis.update(u["field_visibility"] or {})
        except Exception:  # noqa: BLE001
            pass

        def allowed(field):
            return level >= _VIS_LEVEL.get(vis.get(field, "public"), 0)

        # stats
        posts_n = (await db.execute(text("SELECT count(*) FROM community.feed_posts WHERE author_user_id=cast(:t AS uuid) AND status='active'"), {"t": target_id})).scalar() or 0
        followers_n = (await db.execute(text("SELECT count(*) FROM community.follows WHERE followed_user_id=cast(:t AS uuid)"), {"t": target_id})).scalar() or 0
        following_n = (await db.execute(text("SELECT count(*) FROM community.follows WHERE follower_user_id=cast(:t AS uuid)"), {"t": target_id})).scalar() or 0
        records_n = 0
        try:
            # SAVEPOINT-isolated (Strike #113 pattern): if the app role can't read
            # audit.events, the failure must not poison the outer transaction —
            # without this, every later query in the handler dies with
            # InFailedSQLTransactionError and the whole profile 500s.
            async with db.begin_nested():
                records_n = (await db.execute(text("SELECT count(*) FROM audit.events WHERE tenant_id = cast(:tid AS uuid)"), {"tid": str(u["tenant_id"])})).scalar() or 0
        except Exception:  # noqa: BLE001
            records_n = 0
        # Verified-record panel stats — crop runs = production cycles; attestations
        # has no backing table yet, so honest 0 (never faked). Savepoint-isolated.
        crop_runs = 0
        try:
            async with db.begin_nested():
                crop_runs = (await db.execute(text("SELECT count(*) FROM tenant.production_cycles WHERE tenant_id = cast(:tid AS uuid)"), {"tid": str(u["tenant_id"])})).scalar() or 0
        except Exception:  # noqa: BLE001
            crop_runs = 0
        attestations = 0

        # visible posts
        vprof, _ = await _profile_of(db, viewer)
        if is_you:
            pwhere = "fp.author_user_id = cast(:t AS uuid) AND fp.status='active'"
            pparams = {"t": target_id}
        else:
            _vauds = _viewer_audiences(vprof)
            pparams = {"t": target_id, "ifollow": i_follow}
            _aud_or = ""
            if _vauds:
                _ph = ", ".join(f":va{i}" for i in range(len(_vauds)))
                _aud_or = f" OR fp.audience IN ({_ph})"
                for i, a in enumerate(_vauds):
                    pparams[f"va{i}"] = a
            pwhere = f"""fp.author_user_id = cast(:t AS uuid) AND fp.status='active' AND (
                fp.audience='everyone'
                OR (fp.audience='followers' AND :ifollow){_aud_or})"""
        posts = (await db.execute(text(f"""
            SELECT fp.post_id, fp.body, fp.audience, fp.photos, fp.is_repost, fp.created_at,
                   (SELECT count(*) FROM community.feed_likes l WHERE l.post_id=fp.post_id) AS like_count,
                   (SELECT count(*) FROM community.feed_replies r WHERE r.post_id=fp.post_id AND r.status='active') AS reply_count
            FROM community.feed_posts fp WHERE {pwhere}
            ORDER BY fp.created_at DESC LIMIT 30
        """), pparams)).mappings().all()

        prof = (u["account_type"] or "FARMER").lower()
        return {"data": {
            "user_id": str(u["user_id"]), "full_name": u["full_name"],
            "profession": prof, "role": u["role"],
            "is_company": bool(u["is_company"]), "business_name": u["business_name"], "operator_name": u["operator_name"],
            "country": (u["country"] if allowed("location") else None),
            "bio": (u["bio"] if allowed("bio") else None),
            "avatar_url": u["avatar_url"], "cover_url": u["cover_url"], "verified": u["verified"],
            "joined": (u["created_at"].isoformat() if (u["created_at"] and allowed("joined")) else None),
            "phone": (u["whatsapp_number"] if allowed("phone") else None),
            "is_you": is_you, "is_following": i_follow, "is_connected": connected,
            "field_visibility": (vis if is_you else None),
            "stats": {"posts": posts_n, "followers": followers_n, "following": following_n,
                      "records": (records_n if allowed("records") else None),
                      "crop_runs": crop_runs, "attestations": attestations},
            "posts": [{**dict(p), "post_id": p["post_id"], "created_at": p["created_at"].isoformat() if p["created_at"] else None} for p in posts],
        }}


@router.get("/profile/{target_id}/activity")
async def profile_activity(target_id: str, user: dict = Depends(get_current_user)):
    """A user's own community activity (likes, reactions, replies). Private to the owner."""
    if str(user["user_id"]) != str(target_id):
        return {"data": []}  # activity is personal
    async with get_db_ctx() as db:
        rows = (await db.execute(text("""
            SELECT kind, created_at, post_id, snippet FROM (
              SELECT 'liked' AS kind, fl.created_at, fp.post_id, left(fp.body, 120) AS snippet
                FROM community.feed_likes fl JOIN community.feed_posts fp ON fp.post_id = fl.post_id
               WHERE fl.user_id = :id
              UNION ALL
              SELECT 'reacted', rx.created_at, fp2.post_id, left(fp2.body, 120)
                FROM community.feed_reactions rx JOIN community.feed_posts fp2
                  ON fp2.post_id = rx.target_id AND rx.target_type = 'post'
               WHERE rx.user_id = :id
              UNION ALL
              SELECT 'replied', r.created_at, r.post_id, left(r.body, 120)
                FROM community.feed_replies r
               WHERE r.author_user_id = :id AND r.status = 'active'
            ) a ORDER BY created_at DESC LIMIT 50
        """), {"id": str(target_id)})).mappings().all()
    return {"data": [{
        "kind": r["kind"], "post_id": r["post_id"], "snippet": r["snippet"],
        "created_at": r["created_at"].isoformat() if r["created_at"] else None,
    } for r in rows]}
