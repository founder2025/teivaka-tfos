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

from app.db.session import get_db, get_rls_db
from app.middleware.rls import get_current_user

router = APIRouter()

REACTIONS = {"strong_crop", "good_harvest", "vinaka", "hoping_rain", "learning"}
# Canonical profession = account_type lower-cased (8-profession taxonomy).
_AUDIENCES = ("everyone", "followers", "farmer", "buyer", "supplier", "service_provider",
              "banker", "business", "exporter", "importer")

# Upload storage — served back through /api/v1/community/uploads/{name} (Caddy proxies
# /api/* to the API). Mount a volume at this path in compose to survive rebuilds.
MEDIA_DIR = pathlib.Path(os.environ.get("TFOS_MEDIA_DIR", "/app/uploads"))
try:
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
except Exception:  # noqa: BLE001 — never let upload-dir setup block API boot
    pass
_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm", ".mov"}
_MAX_BYTES = 15 * 1024 * 1024  # 15 MB
_MENTION_RE = re.compile(r"@\[([^\]]+)\]")


def _pid():
    return "CPST-" + uuid.uuid4().hex[:8].upper()


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


class PostEdit(BaseModel):
    body: str


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
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    uid = str(user["user_id"])
    async with get_db() as db:
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

        # audience visibility (NOT follow-gated — profession/everyone within country)
        where.append("""(
            fp.author_user_id = :uid
            OR fp.audience = 'everyone'
            OR (fp.audience = 'followers' AND EXISTS (SELECT 1 FROM community.follows f
                    WHERE f.follower_user_id = :uid AND f.followed_user_id = fp.author_user_id))
            OR fp.audience = :vprof
        )""")

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

        if verified_only:
            where.append("u.email_verified = TRUE")

        rows = (await db.execute(text(f"""
            SELECT fp.post_id, fp.author_user_id, fp.author_profession, fp.body, fp.post_type,
                   fp.is_question, fp.audience, fp.location, fp.vertical, fp.photos, fp.mentions,
                   fp.link_audit_hash, fp.is_repost, fp.repost_of_id, fp.pinned,
                   fp.best_answer_reply_id, fp.audit_hash, fp.created_at, fp.edited_at,
                   u.full_name AS author_name, COALESCE(u.email_verified, FALSE) AS author_verified,
                   orig.body AS repost_body, ou.full_name AS repost_author_name,
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
async def create_feed_post(body: PostCreate, user: dict = Depends(get_current_user)):
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
        await db.execute(text("""
            INSERT INTO community.feed_posts
                (post_id, tenant_id, author_user_id, author_profession, country, reach, kind,
                 body, post_type, is_question, audience, location, vertical, photos, mentions,
                 link_audit_hash, audit_hash)
            VALUES
                (:post_id, :tenant_id, :author_user_id, :prof, :country, :reach, :kind,
                 :body, :post_type, :is_question, :audience, :location, :vertical, :photos, :mentions,
                 :link, :audit_hash)
        """), {
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
    return {"data": {"post_id": post_id}}


@router.patch("/feed/{post_id}")
async def edit_feed_post(post_id: str, body: PostEdit, user: dict = Depends(get_current_user)):
    if not (body.body and body.body.strip()):
        raise HTTPException(status_code=422, detail="Post body is required")
    async with get_rls_db(str(user["tenant_id"])) as db:
        res = await db.execute(text("""
            UPDATE community.feed_posts SET body = :body, edited_at = now()
            WHERE post_id = :pid AND author_user_id = :uid AND status = 'active'
        """), {"body": body.body.strip(), "pid": post_id, "uid": str(user["user_id"])})
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Post not found or not yours")
    return {"data": {"post_id": post_id, "edited": True}}


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
async def repost(post_id: str, body: RepostBody, user: dict = Depends(get_current_user)):
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
async def share_post(post_id: str, body: ShareBody, user: dict = Depends(get_current_user)):
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
    async with get_db() as db:
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
    async with get_db() as db:
        rows = (await db.execute(text("""
            SELECT fr.reply_id, fr.post_id, fr.parent_reply_id, fr.author_user_id,
                   fr.author_profession, fr.body, fr.photos, fr.created_at,
                   u.full_name AS author_name, COALESCE(u.email_verified, FALSE) AS author_verified,
                   (SELECT count(*) FROM community.feed_reply_likes rl WHERE rl.reply_id = fr.reply_id) AS like_count,
                   EXISTS (SELECT 1 FROM community.feed_reply_likes rl WHERE rl.reply_id = fr.reply_id AND rl.user_id = :uid) AS liked
            FROM community.feed_replies fr
            JOIN tenant.users u ON u.user_id = fr.author_user_id
            WHERE fr.post_id = :pid AND fr.status = 'active'
            ORDER BY fr.created_at ASC
        """), {"pid": post_id, "uid": uid})).mappings().all()
    return {"data": [dict(r) for r in rows]}


@router.post("/feed/{post_id}/replies")
async def add_reply(post_id: str, body: ReplyCreate, user: dict = Depends(get_current_user)):
    if not (body.body and body.body.strip()):
        raise HTTPException(status_code=422, detail="Reply body is required")
    reply_id = _rid()
    async with get_rls_db(str(user["tenant_id"])) as db:
        ok = (await db.execute(text("SELECT 1 FROM community.feed_posts WHERE post_id=:pid AND status='active'"),
                               {"pid": post_id})).first()
        if not ok:
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
async def follow(target_user_id: str, user: dict = Depends(get_current_user)):
    if target_user_id == str(user["user_id"]):
        raise HTTPException(status_code=422, detail="Cannot follow yourself")
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO community.follows (follower_user_id, followed_user_id)
            VALUES (:me, :them) ON CONFLICT DO NOTHING
        """), {"me": str(user["user_id"]), "them": target_user_id})
        await _notify(db, target_user_id, user["user_id"], "FOLLOW",
                      body=f"{user.get('full_name','Someone')} started following you")
    return {"data": {"following": target_user_id}}


@router.delete("/follow/{target_user_id}")
async def unfollow(target_user_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("DELETE FROM community.follows WHERE follower_user_id=:me AND followed_user_id=:them"),
                         {"me": str(user["user_id"]), "them": target_user_id})
    return {"data": {"following": None}}


# ----------------------------------------------------------------------------- people
@router.get("/people")
async def list_people(search: str = Query(None), user: dict = Depends(get_current_user)):
    """People you can follow / share to. Cross-tenant directory of active users."""
    uid = str(user["user_id"])
    async with get_db() as db:
        params = {"uid": uid}
        clause = ""
        if search:
            clause = " AND u.full_name ILIKE :q"
            params["q"] = f"%{search}%"
        rows = (await db.execute(text(f"""
            SELECT u.user_id, u.full_name, u.account_type, u.country,
                   COALESCE(u.email_verified, FALSE) AS verified,
                   EXISTS (SELECT 1 FROM community.follows f
                           WHERE f.follower_user_id = :uid AND f.followed_user_id = u.user_id) AS is_following,
                   EXISTS (SELECT 1 FROM community.follows f2
                           WHERE f2.follower_user_id = u.user_id AND f2.followed_user_id = :uid) AS follows_me
            FROM tenant.users u
            WHERE u.user_id <> :uid AND u.is_active = TRUE{clause}
            ORDER BY u.full_name
            LIMIT 50
        """), params)).mappings().all()
    return {"data": [{
        "user_id": str(r["user_id"]), "full_name": r["full_name"],
        "profession": (r["account_type"] or "FARMER").lower(),
        "country": r["country"], "verified": r["verified"],
        "is_following": r["is_following"],
        "is_connected": bool(r["is_following"] and r["follows_me"]),
    } for r in rows]}


# ----------------------------------------------------------------------------- topics
@router.get("/topics")
async def list_topics(user: dict = Depends(get_current_user)):
    async with get_db() as db:
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
    async with get_db() as db:
        rows = (await db.execute(text("""
            SELECT n.notification_id, n.type, n.post_id, n.reply_id, n.body, n.read_at, n.created_at,
                   a.full_name AS actor_name
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
    async with get_db() as db:
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
async def upload_media(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
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
    """Public read of an uploaded asset."""
    safe = pathlib.Path(name).name  # strip any path traversal
    path = MEDIA_DIR / safe
    if not path.exists():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path)


# ----------------------------------------------------------------------------- moderation (admin)
_ADMIN_ROLES = {"ADMIN", "FOUNDER"}


@router.get("/flags")
async def list_flags(status_filter: str = Query("OPEN"), user: dict = Depends(get_current_user)):
    """Moderation queue — admin/founder only."""
    if user.get("role") not in _ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Moderators only")
    async with get_db() as db:
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
