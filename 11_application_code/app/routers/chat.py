"""
Connections, presence & live chat — mounted at /api/v1/community.

Connection = MUTUAL follow (A→B and B→A in community.follows). Discovery + follow stay
open (see feed.py /people, /follow); presence and chat are CONNECTION-GATED:
  POST /presence/ping                 heartbeat (Redis, TTL 60s)
  GET  /connections                   mutual connections + presence + unread + last msg
  GET  /chat/with/{user_id}           get-or-create thread + messages (must be connected)
  POST /chat/with/{user_id}           send a message (must be connected)
  POST /chat/{thread_id}/read         mark the other side's messages read

Chat is connection-gated, NOT country-gated (cross-border DMs between connections allowed).
Presence is never exposed for non-connections. community.* has no RLS; FKs to tenant.users.
"""
import os
import json
import time
import asyncio
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from pydantic import BaseModel
import redis.asyncio as aioredis
from sse_starlette.sse import EventSourceResponse

from app.db.session import get_db, get_rls_db, get_db_ctx
from app.middleware.rls import get_current_user
from app.config import settings
from app.utils.community_guard import rate_limit_only

# Cold-DM to these account types requires the sender to have a verified email
# (the trust-ladder: a stranger can't cold-message a lender/exporter unverified).
# Replies inside an existing thread, and DMs to farmers/buyers/etc., are open.
_SENSITIVE_RECIPIENTS = {"BANKER", "EXPORTER", "IMPORTER"}

logger = logging.getLogger(__name__)

router = APIRouter()

_redis = None
PRESENCE_TTL = 60


async def _r():
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(os.environ.get("REDIS_URL", "redis://redis:6379/0"), decode_responses=True)
    return _redis


async def _connected(db, a, b) -> bool:
    """Messaging is allowed when there is a relationship signal between the two
    users: EITHER party follows the other (you can DM anyone you follow, and
    reply to anyone who follows you) OR either party has an ACTIVE marketplace
    listing — AND neither party has blocked the other. Recipients always see
    inbound threads via /connections."""
    return bool((await db.execute(text("""
        SELECT (
            EXISTS (SELECT 1 FROM community.follows WHERE follower_user_id=:a AND followed_user_id=:b)
            OR EXISTS (SELECT 1 FROM community.follows WHERE follower_user_id=:b AND followed_user_id=:a)
            OR EXISTS (SELECT 1 FROM community.listings cl
                       WHERE cl.created_by IN (cast(:a AS uuid), cast(:b AS uuid))
                         AND cl.listing_status = 'ACTIVE' AND cl.sold_at IS NULL)
        ) AND NOT EXISTS (
            SELECT 1 FROM community.chat_blocks bk
            WHERE (bk.blocker_user_id=cast(:a AS uuid) AND bk.blocked_user_id=cast(:b AS uuid))
               OR (bk.blocker_user_id=cast(:b AS uuid) AND bk.blocked_user_id=cast(:a AS uuid))
        )
    """), {"a": str(a), "b": str(b)})).scalar())


async def _publish(target_uid, payload: dict):
    """Fire-and-forget Redis pub/sub to a user's chat channel — the SSE stream
    (/chat/stream) subscribes per-user and forwards. Best-effort: a Redis blip
    just means the client falls back to its slow poll."""
    try:
        rc = await _r()
        await rc.publish(f"chat:{target_uid}", json.dumps(payload))
    except Exception:  # noqa: BLE001
        pass


async def _other_in_thread(db, thread_id, uid) -> str | None:
    row = (await db.execute(text(
        "SELECT user_lo::text AS lo, user_hi::text AS hi FROM community.chat_threads WHERE thread_id = :tid"),
        {"tid": thread_id})).mappings().first()
    if not row:
        return None
    return row["hi"] if row["lo"] == str(uid) else row["lo"]


async def _presence_map(user_ids):
    """user_id -> {online, last_seen} from Redis."""
    out = {}
    if not user_ids:
        return out
    rc = await _r()
    try:
        vals = await rc.mget([f"presence:{u}" for u in user_ids])
    except Exception:  # noqa: BLE001
        return {u: {"online": False, "last_seen": None} for u in user_ids}
    for u, v in zip(user_ids, vals):
        out[u] = {"online": v is not None, "last_seen": v}
    return out


class ChatSend(BaseModel):
    body: str | None = None
    message_type: str = "text"        # text | image | video | audio | card
    media_url: str | None = None      # must be one of our own /uploads URLs
    media_meta: dict | None = None    # optional: name / bytes / duration
    reply_to_message_id: str | None = None  # quote/reply to an earlier message


_MSG_TYPES = {"text", "image", "video", "audio", "card"}
_MEDIA_LABEL = {"image": "📷 Photo", "video": "🎬 Video", "audio": "🎙 Voice message", "card": "🔗 Shared item"}

# small curated set; 🙏 doubles as "vinaka / thank you"
_REACTIONS = {"👍", "❤️", "😂", "😮", "😢", "🙏"}


class ReactBody(BaseModel):
    emoji: str


class ReportChatBody(BaseModel):
    reported_user_id: str
    message_id: str | None = None
    reason: str


class PushSub(BaseModel):
    endpoint: str
    keys: dict   # {p256dh, auth}
    user_agent: str | None = None


async def push_to_user(db, user_id, title, body, url="/home"):
    """Best-effort Web Push to all of a user's subscriptions. No-op until VAPID keys
    are configured / pywebpush installed. Prunes expired (404/410) subscriptions."""
    priv = settings.vapid_private_key
    subj = settings.vapid_subject or "mailto:founder@teivaka.com"
    if not priv:
        return
    rows = (await db.execute(text(
        "SELECT subscription_id, endpoint, p256dh, auth FROM community.push_subscriptions WHERE user_id = :u"),
        {"u": str(user_id)})).mappings().all()
    if not rows:
        return
    try:
        from pywebpush import webpush, WebPushException  # noqa: F401
    except Exception:  # noqa: BLE001 — dep not installed yet
        return

    def _send(sub):
        try:
            webpush(
                subscription_info={"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
                data=json.dumps({"title": title, "body": body, "url": url}),
                vapid_private_key=priv,
                vapid_claims={"sub": subj},
            )
            return None
        except WebPushException as e:  # noqa: PERF203
            code = getattr(getattr(e, "response", None), "status_code", None)
            return sub["subscription_id"] if code in (404, 410) else None
        except Exception:  # noqa: BLE001
            return None

    try:
        results = await asyncio.gather(*[asyncio.to_thread(_send, dict(s)) for s in rows])
        dead = [r for r in results if r]
        if dead:
            await db.execute(text("DELETE FROM community.push_subscriptions WHERE subscription_id = ANY(:ids)"), {"ids": dead})
    except Exception as e:  # noqa: BLE001
        logger.warning("push_to_user failed: %s", e)


# ----------------------------------------------------------------------------- push subscriptions
@router.get("/push/vapid-public")
async def vapid_public(user: dict = Depends(get_current_user)):
    return {"data": {"public_key": settings.vapid_public_key or None}}


@router.post("/push/subscribe")
async def push_subscribe(body: PushSub, user: dict = Depends(get_current_user)):
    keys = body.keys or {}
    if not body.endpoint or not keys.get("p256dh") or not keys.get("auth"):
        raise HTTPException(status_code=422, detail="Invalid subscription")
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO community.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
            VALUES (:uid, :ep, :p, :a, :ua)
            ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id,
                p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
        """), {"uid": str(user["user_id"]), "ep": body.endpoint, "p": keys["p256dh"], "a": keys["auth"], "ua": body.user_agent})
    return {"data": {"ok": True}}


@router.delete("/push/subscribe")
async def push_unsubscribe(body: PushSub, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("DELETE FROM community.push_subscriptions WHERE endpoint = :ep AND user_id = :uid"),
                         {"ep": body.endpoint, "uid": str(user["user_id"])})
    return {"data": {"ok": True}}


# ----------------------------------------------------------------------------- presence
@router.post("/presence/ping")
async def presence_ping(user: dict = Depends(get_current_user)):
    rc = await _r()
    now = datetime.now(timezone.utc).isoformat()
    try:
        await rc.set(f"presence:{user['user_id']}", now, ex=PRESENCE_TTL)
    except Exception:  # noqa: BLE001
        pass
    return {"data": {"ok": True, "at": now}}


# ----------------------------------------------------------------------------- realtime (SSE)
@router.get("/chat/stream")
async def chat_stream(request: Request, user: dict = Depends(get_current_user)):
    """Per-user Server-Sent Events stream. Pushes a lightweight signal
    ({type, thread_id, from}) whenever something changes for this user — a new
    message, reaction, typing ping or read receipt — so the client refreshes
    instantly instead of polling every few seconds (Pacific-data friendly).
    EventSource can't set headers; the auth middleware accepts ?access_token=."""
    uid = str(user["user_id"])

    async def gen():
        rc = await _r()
        ps = rc.pubsub()
        await ps.subscribe(f"chat:{uid}")
        last_ka = time.monotonic()
        try:
            yield {"event": "ready", "data": "{}"}
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await ps.get_message(ignore_subscribe_messages=True, timeout=15.0)
                except Exception:  # noqa: BLE001
                    msg = None
                if msg and msg.get("type") == "message":
                    yield {"event": "chat", "data": msg.get("data") or "{}"}
                now = time.monotonic()
                if now - last_ka >= 20:
                    yield {"event": "ping", "data": "{}"}
                    last_ka = now
        finally:
            try:
                await ps.unsubscribe(f"chat:{uid}")
                await ps.close()
            except Exception:  # noqa: BLE001
                pass

    return EventSourceResponse(gen())


# ----------------------------------------------------------------------------- connections
@router.get("/connections")
async def list_connections(user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        rows = (await db.execute(text("""
            WITH peers AS (
                -- mutual follows (show even before any message is exchanged)
                SELECT f1.followed_user_id AS peer_id
                FROM community.follows f1
                JOIN community.follows f2
                  ON f2.follower_user_id = f1.followed_user_id
                 AND f2.followed_user_id = f1.follower_user_id
                WHERE f1.follower_user_id = :uid
                UNION
                -- anyone I already have a thread with, so EVERY inbound message
                -- surfaces here even if the sender isn't a mutual follow
                -- (e.g. a marketplace buyer messaging via listing-consent).
                SELECT CASE WHEN th.user_lo = :uid THEN th.user_hi ELSE th.user_lo END
                FROM community.chat_threads th
                WHERE th.user_lo = :uid OR th.user_hi = :uid
            )
            SELECT u.user_id, u.full_name, u.account_type, u.country, u.avatar_url,
                   th.thread_id, th.last_message_at,
                   (SELECT count(*) FROM community.chat_messages m
                      WHERE m.thread_id = th.thread_id AND m.sender_user_id = u.user_id AND m.read_at IS NULL) AS unread,
                   (SELECT COALESCE(m.body, CASE m.message_type
                              WHEN 'image' THEN '📷 Photo' WHEN 'video' THEN '🎬 Video'
                              WHEN 'audio' THEN '🎙 Voice message' WHEN 'card' THEN '🔗 Shared item'
                              ELSE 'Message' END)
                      FROM community.chat_messages m
                      WHERE m.thread_id = th.thread_id ORDER BY m.created_at DESC LIMIT 1) AS last_body
            FROM peers pr
            JOIN tenant.users u ON u.user_id = pr.peer_id AND u.is_active = TRUE
              AND NOT EXISTS (SELECT 1 FROM community.chat_blocks bk
                              WHERE (bk.blocker_user_id = cast(:uid AS uuid) AND bk.blocked_user_id = u.user_id)
                                 OR (bk.blocker_user_id = u.user_id AND bk.blocked_user_id = cast(:uid AS uuid)))
            LEFT JOIN community.chat_threads th
              ON (th.user_lo = :uid AND th.user_hi = u.user_id)
              OR (th.user_lo = u.user_id AND th.user_hi = :uid)
            ORDER BY th.last_message_at DESC NULLS LAST, u.full_name
        """), {"uid": uid})).mappings().all()
    conns = [dict(r) for r in rows]
    pres = await _presence_map([str(c["user_id"]) for c in conns])
    for c in conns:
        c["user_id"] = str(c["user_id"])
        c["profession"] = (c.pop("account_type") or "FARMER").lower()
        p = pres.get(c["user_id"], {})
        c["online"] = p.get("online", False)
        c["last_seen"] = p.get("last_seen")
        c["unread"] = c.get("unread") or 0
    return {"data": conns}


# ----------------------------------------------------------------------------- chat
def _pair(a, b):
    a, b = str(a), str(b)
    return (a, b) if a < b else (b, a)


async def _thread_id(db, a, b, create=False):
    lo, hi = _pair(a, b)
    row = (await db.execute(text(
        "SELECT thread_id FROM community.chat_threads WHERE user_lo=:lo AND user_hi=:hi"),
        {"lo": lo, "hi": hi})).first()
    if row:
        return str(row[0])
    if not create:
        return None
    row = (await db.execute(text("""
        INSERT INTO community.chat_threads (user_lo, user_hi) VALUES (:lo, :hi)
        ON CONFLICT (user_lo, user_hi) DO UPDATE SET user_lo = EXCLUDED.user_lo
        RETURNING thread_id
    """), {"lo": lo, "hi": hi})).first()
    return str(row[0])


@router.get("/chat/with/{other_id}")
async def chat_with(other_id: str, after: str = Query(None), user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    async with get_rls_db(str(user["tenant_id"])) as db:
        if not await _connected(db, uid, other_id):
            raise HTTPException(status_code=403, detail="Connect first — you can only chat with mutual connections")
        tid = await _thread_id(db, uid, other_id, create=True)
        params = {"tid": tid}
        clause = ""
        if after:
            clause = " AND m.created_at > :after"
            params["after"] = after
        msgs = (await db.execute(text(f"""
            SELECT m.message_id, m.sender_user_id, m.body, m.created_at, m.read_at,
                   m.message_type, m.media_url, m.media_meta, m.reply_to_message_id,
                   rm.body AS reply_body, rm.sender_user_id AS reply_sender, rm.message_type AS reply_type
            FROM community.chat_messages m
            LEFT JOIN community.chat_messages rm ON rm.message_id = m.reply_to_message_id
            WHERE m.thread_id = :tid{clause}
            ORDER BY m.created_at ASC LIMIT 200
        """), params)).mappings().all()
        # mark the other party's messages as read
        marked = (await db.execute(text("""
            UPDATE community.chat_messages SET read_at = now()
            WHERE thread_id = :tid AND sender_user_id = :other AND read_at IS NULL
        """), {"tid": tid, "other": other_id})).rowcount or 0
        # reactions for this page of messages (one query, grouped in python)
        rmap = {}
        ids = [str(m["message_id"]) for m in msgs]
        if ids:
            rrows = (await db.execute(text("""
                SELECT message_id::text AS mid, emoji, count(*) AS n, bool_or(user_id = cast(:uid AS uuid)) AS mine
                FROM community.chat_reactions
                WHERE message_id::text = ANY(:ids)
                GROUP BY message_id, emoji
                ORDER BY emoji
            """), {"ids": ids, "uid": uid})).mappings().all()
            for rr in rrows:
                rmap.setdefault(rr["mid"], []).append({"emoji": rr["emoji"], "count": rr["n"], "mine": bool(rr["mine"])})
    # tell the sender their messages were just seen (instant "Seen")
    if marked:
        await _publish(other_id, {"type": "read", "thread_id": tid, "from": uid})
    # is the other party typing? (ephemeral Redis key on the user pair)
    lo, hi = _pair(uid, other_id)
    other_typing = False
    try:
        rc = await _r()
        other_typing = (await rc.get(f"typing:{lo}:{hi}:{other_id}")) is not None
    except Exception:  # noqa: BLE001
        pass
    def _shape(m):
        d = {**dict(m), "message_id": str(m["message_id"]), "sender_user_id": str(m["sender_user_id"]),
             "mine": str(m["sender_user_id"]) == uid, "reactions": rmap.get(str(m["message_id"]), [])}
        if m["reply_to_message_id"]:
            label = m["reply_body"] or _MEDIA_LABEL.get(m["reply_type"], "Message")
            d["reply"] = {
                "message_id": str(m["reply_to_message_id"]),
                "preview": (label[:120] if label else ""),
                "mine": (str(m["reply_sender"]) == uid) if m["reply_sender"] else False,
            }
        else:
            d["reply"] = None
        for k in ("reply_body", "reply_sender", "reply_type", "reply_to_message_id"):
            d.pop(k, None)
        return d
    return {"data": {"thread_id": tid, "other_typing": other_typing, "messages": [_shape(m) for m in msgs]}}


@router.post("/chat/with/{other_id}")
async def chat_send(other_id: str, body: ChatSend, user: dict = Depends(rate_limit_only("chat", 60))):
    uid = str(user["user_id"])
    mt = (body.message_type or "text").strip().lower()
    if mt not in _MSG_TYPES:
        raise HTTPException(status_code=422, detail="Unsupported message type")
    text_body = (body.body or "").strip() or None
    media_url = (body.media_url or "").strip() or None

    if mt == "text":
        if not text_body:
            raise HTTPException(status_code=422, detail="Message body is required")
    else:
        if not media_url:
            raise HTTPException(status_code=422, detail="media_url is required for a media message")
        # Only ever store our OWN upload URLs — never an arbitrary external link.
        if not media_url.startswith("/api/v1/community/uploads/"):
            raise HTTPException(status_code=422, detail="media_url must be an uploaded Teivaka asset")

    mmeta = json.dumps(body.media_meta) if body.media_meta else None
    reply_to = (body.reply_to_message_id or "").strip() or None
    # what the push notification + connection-list preview shows
    preview = text_body or _MEDIA_LABEL.get(mt, "New message")

    # Trust-ladder cold-DM gate: opening a NEW thread to a lender/exporter/
    # importer requires a verified email. Cross-tenant reads need the non-RLS
    # context (same as /connections). Replies to an existing thread are exempt.
    lo, hi = _pair(uid, other_id)
    async with get_db_ctx() as ck:
        info = (await ck.execute(text("""
            SELECT (SELECT account_type FROM tenant.users WHERE user_id = cast(:other AS uuid)) AS other_type,
                   (SELECT email_verified FROM tenant.users WHERE user_id = cast(:uid AS uuid)) AS sender_verified,
                   (SELECT thread_id FROM community.chat_threads WHERE user_lo = :lo AND user_hi = :hi) AS tid
        """), {"other": other_id, "uid": uid, "lo": lo, "hi": hi})).mappings().first()
    if info and info["tid"] is None and (info["other_type"] or "") in _SENSITIVE_RECIPIENTS and not info["sender_verified"]:
        raise HTTPException(
            status_code=403,
            detail="Verify your email to message a verified banker, exporter or importer directly.",
        )

    async with get_rls_db(str(user["tenant_id"])) as db:
        if not await _connected(db, uid, other_id):
            raise HTTPException(status_code=403, detail="You can't message this person — connect first, or they may have blocked you.")
        tid = await _thread_id(db, uid, other_id, create=True)
        row = (await db.execute(text("""
            INSERT INTO community.chat_messages (thread_id, sender_user_id, body, message_type, media_url, media_meta, reply_to_message_id)
            VALUES (:tid, :uid, :body, :mt, :murl, CAST(:mmeta AS jsonb), CAST(:reply AS uuid))
            RETURNING message_id, created_at
        """), {"tid": tid, "uid": uid, "body": text_body, "mt": mt, "murl": media_url, "mmeta": mmeta, "reply": reply_to})).mappings().first()
        await db.execute(text("UPDATE community.chat_threads SET last_message_at = now() WHERE thread_id = :tid"), {"tid": tid})
        # Web Push to the recipient (best-effort; no-op until VAPID configured)
        await push_to_user(db, other_id, user.get("full_name") or "New message", preview, url="/home")
    # realtime: nudge the recipient's stream to refresh instantly
    await _publish(other_id, {"type": "message", "thread_id": tid, "from": uid})
    return {"data": {"thread_id": tid, "message_id": str(row["message_id"]), "created_at": str(row["created_at"])}}


@router.post("/chat/{thread_id}/read")
async def chat_mark_read(thread_id: str, user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    async with get_rls_db(str(user["tenant_id"])) as db:
        marked = (await db.execute(text("""
            UPDATE community.chat_messages SET read_at = now()
            WHERE thread_id = :tid AND sender_user_id <> :uid AND read_at IS NULL
        """), {"tid": thread_id, "uid": uid})).rowcount or 0
        other = await _other_in_thread(db, thread_id, uid) if marked else None
    if other:
        await _publish(other, {"type": "read", "thread_id": thread_id, "from": uid})
    return {"data": {"ok": True}}


# ----------------------------------------------------------------------------- reactions
@router.put("/chat/message/{message_id}/react")
async def chat_react(message_id: str, body: ReactBody, user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    emoji = (body.emoji or "").strip()
    if emoji not in _REACTIONS:
        raise HTTPException(status_code=422, detail="Unsupported reaction")
    other = None
    async with get_rls_db(str(user["tenant_id"])) as db:
        # only a participant of the message's thread may react
        row = (await db.execute(text("""
            SELECT th.thread_id::text AS tid, th.user_lo::text AS lo, th.user_hi::text AS hi
            FROM community.chat_messages m
            JOIN community.chat_threads th ON th.thread_id = m.thread_id
            WHERE m.message_id = :mid AND (th.user_lo = cast(:uid AS uuid) OR th.user_hi = cast(:uid AS uuid))
        """), {"mid": message_id, "uid": uid})).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Message not found")
        other = row["hi"] if row["lo"] == uid else row["lo"]
        tid = row["tid"]
        await db.execute(text("""
            INSERT INTO community.chat_reactions (message_id, user_id, emoji)
            VALUES (:mid, :uid, :emoji)
            ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now()
        """), {"mid": message_id, "uid": uid, "emoji": emoji})
    if other:
        await _publish(other, {"type": "reaction", "thread_id": tid, "from": uid})
    return {"data": {"message_id": message_id, "emoji": emoji}}


@router.delete("/chat/message/{message_id}/react")
async def chat_unreact(message_id: str, user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    other = None
    tid = None
    async with get_rls_db(str(user["tenant_id"])) as db:
        row = (await db.execute(text("""
            SELECT th.thread_id::text AS tid, th.user_lo::text AS lo, th.user_hi::text AS hi
            FROM community.chat_messages m
            JOIN community.chat_threads th ON th.thread_id = m.thread_id
            WHERE m.message_id = :mid
        """), {"mid": message_id})).mappings().first()
        if row:
            other = row["hi"] if row["lo"] == uid else row["lo"]
            tid = row["tid"]
        await db.execute(text("DELETE FROM community.chat_reactions WHERE message_id = :mid AND user_id = :uid"),
                         {"mid": message_id, "uid": uid})
    if other:
        await _publish(other, {"type": "reaction", "thread_id": tid, "from": uid})
    return {"data": {"ok": True}}


# ----------------------------------------------------------------------------- typing
@router.post("/chat/with/{other_id}/typing")
async def chat_typing(other_id: str, user: dict = Depends(get_current_user)):
    """Set a short-lived 'I am typing' flag on the user pair (Redis, 6s TTL).
    No DB write — cheap enough to call on keystroke (the client throttles)."""
    uid = str(user["user_id"])
    lo, hi = _pair(uid, other_id)
    try:
        rc = await _r()
        await rc.set(f"typing:{lo}:{hi}:{uid}", "1", ex=6)
    except Exception:  # noqa: BLE001
        pass
    await _publish(other_id, {"type": "typing", "from": uid})
    return {"data": {"ok": True}}


# ----------------------------------------------------------------------------- block / report
@router.post("/chat/block/{other_id}")
async def chat_block(other_id: str, user: dict = Depends(get_current_user)):
    me = str(user["user_id"])
    if other_id == me:
        raise HTTPException(status_code=422, detail="You can't block yourself")
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO community.chat_blocks (blocker_user_id, blocked_user_id)
            VALUES (cast(:me AS uuid), cast(:them AS uuid)) ON CONFLICT DO NOTHING
        """), {"me": me, "them": other_id})
    return {"data": {"blocked": other_id}}


@router.delete("/chat/block/{other_id}")
async def chat_unblock(other_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            DELETE FROM community.chat_blocks
            WHERE blocker_user_id = cast(:me AS uuid) AND blocked_user_id = cast(:them AS uuid)
        """), {"me": str(user["user_id"]), "them": other_id})
    return {"data": {"unblocked": other_id}}


@router.get("/chat/blocks")
async def chat_blocks(user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        rows = (await db.execute(text(
            "SELECT blocked_user_id::text AS id FROM community.chat_blocks WHERE blocker_user_id = cast(:me AS uuid)"),
            {"me": str(user["user_id"])})).mappings().all()
    return {"data": [r["id"] for r in rows]}


@router.post("/chat/report")
async def chat_report(body: ReportChatBody, user: dict = Depends(get_current_user)):
    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=422, detail="A reason is required")
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO community.chat_reports (reporter_user_id, reported_user_id, message_id, reason)
            VALUES (cast(:r AS uuid), cast(:t AS uuid), cast(:m AS uuid), :reason)
        """), {"r": str(user["user_id"]), "t": body.reported_user_id,
               "m": body.message_id, "reason": reason})
    return {"data": {"reported": True}}


@router.get("/chat/unread-count")
async def chat_unread_count(user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        n = (await db.execute(text("""
            SELECT count(*) FROM community.chat_messages m
            JOIN community.chat_threads th ON th.thread_id = m.thread_id
            WHERE (th.user_lo = :uid OR th.user_hi = :uid)
              AND m.sender_user_id <> :uid AND m.read_at IS NULL
        """), {"uid": uid})).scalar() or 0
    return {"data": {"unread": n}}


# ----------------------------------------------------------------------------- group chat
async def _is_group_member(db, group_id: str, uid: str) -> bool:
    return bool((await db.execute(text(
        "SELECT 1 FROM community.group_members WHERE group_id = :g AND user_id = cast(:u AS uuid)"),
        {"g": group_id, "u": uid})).first())


@router.get("/groups/{group_id}/chat")
async def group_chat_list(group_id: str, after: str = Query(None), user: dict = Depends(get_current_user)):
    """Recent group messages (members only). Non-RLS context so sender names
    resolve across tenants (members can be from different tenants)."""
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        if not await _is_group_member(db, group_id, uid):
            raise HTTPException(status_code=403, detail="Join the group to see its chat")
        params = {"g": group_id}
        clause = ""
        if after:
            clause = " AND m.created_at > :after"
            params["after"] = after
        rows = (await db.execute(text(f"""
            SELECT m.message_id, m.sender_user_id, m.body, m.created_at,
                   m.message_type, m.media_url, m.media_meta,
                   u.full_name AS sender_name, u.avatar_url AS sender_avatar
            FROM community.group_messages m
            JOIN tenant.users u ON u.user_id = m.sender_user_id
            WHERE m.group_id = :g{clause}
            ORDER BY m.created_at ASC LIMIT 200
        """), params)).mappings().all()
    return {"data": [
        {**dict(m), "message_id": str(m["message_id"]), "sender_user_id": str(m["sender_user_id"]),
         "mine": str(m["sender_user_id"]) == uid} for m in rows]}


@router.post("/groups/{group_id}/chat")
async def group_chat_send(group_id: str, body: ChatSend, user: dict = Depends(rate_limit_only("groupchat", 60))):
    uid = str(user["user_id"])
    mt = (body.message_type or "text").strip().lower()
    if mt not in _MSG_TYPES:
        raise HTTPException(status_code=422, detail="Unsupported message type")
    text_body = (body.body or "").strip() or None
    media_url = (body.media_url or "").strip() or None
    if mt == "text":
        if not text_body:
            raise HTTPException(status_code=422, detail="Message body is required")
    else:
        if not media_url:
            raise HTTPException(status_code=422, detail="media_url is required for a media message")
        if not media_url.startswith("/api/v1/community/uploads/"):
            raise HTTPException(status_code=422, detail="media_url must be an uploaded Teivaka asset")
    mmeta = json.dumps(body.media_meta) if body.media_meta else None

    async with get_rls_db(str(user["tenant_id"])) as db:
        if not await _is_group_member(db, group_id, uid):
            raise HTTPException(status_code=403, detail="Join the group to chat")
        row = (await db.execute(text("""
            INSERT INTO community.group_messages (group_id, sender_user_id, body, message_type, media_url, media_meta)
            VALUES (:g, :uid, :body, :mt, :murl, CAST(:mmeta AS jsonb))
            RETURNING message_id, created_at
        """), {"g": group_id, "uid": uid, "body": text_body, "mt": mt, "murl": media_url, "mmeta": mmeta})).mappings().first()
        members = (await db.execute(text(
            "SELECT user_id::text AS id FROM community.group_members WHERE group_id = :g AND user_id <> cast(:uid AS uuid)"),
            {"g": group_id, "uid": uid})).mappings().all()
    # realtime fan-out to every other member's SSE stream
    for mrow in members:
        await _publish(mrow["id"], {"type": "group_message", "group_id": group_id, "from": uid})
    return {"data": {"message_id": str(row["message_id"]), "created_at": str(row["created_at"])}}
