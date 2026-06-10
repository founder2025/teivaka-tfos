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
import asyncio
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from pydantic import BaseModel
import redis.asyncio as aioredis

from app.db.session import get_db, get_rls_db, get_db_ctx
from app.middleware.rls import get_current_user
from app.config import settings

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
    return bool((await db.execute(text("""
        SELECT EXISTS (SELECT 1 FROM community.follows WHERE follower_user_id=:a AND followed_user_id=:b)
           AND EXISTS (SELECT 1 FROM community.follows WHERE follower_user_id=:b AND followed_user_id=:a)
    """), {"a": str(a), "b": str(b)})).scalar())


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
    body: str


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


# ----------------------------------------------------------------------------- connections
@router.get("/connections")
async def list_connections(user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        rows = (await db.execute(text("""
            SELECT u.user_id, u.full_name, u.account_type, u.country,
                   th.thread_id, th.last_message_at,
                   (SELECT count(*) FROM community.chat_messages m
                      WHERE m.thread_id = th.thread_id AND m.sender_user_id = u.user_id AND m.read_at IS NULL) AS unread,
                   (SELECT body FROM community.chat_messages m
                      WHERE m.thread_id = th.thread_id ORDER BY m.created_at DESC LIMIT 1) AS last_body
            FROM community.follows f1
            JOIN community.follows f2
              ON f2.follower_user_id = f1.followed_user_id AND f2.followed_user_id = f1.follower_user_id
            JOIN tenant.users u ON u.user_id = f1.followed_user_id
            LEFT JOIN community.chat_threads th
              ON (th.user_lo = :uid AND th.user_hi = u.user_id::text)
              OR (th.user_lo = u.user_id::text AND th.user_hi = :uid)
            WHERE f1.follower_user_id = :uid AND u.is_active = TRUE
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
            SELECT m.message_id, m.sender_user_id, m.body, m.created_at, m.read_at
            FROM community.chat_messages m
            WHERE m.thread_id = :tid{clause}
            ORDER BY m.created_at ASC LIMIT 200
        """), params)).mappings().all()
        # mark the other party's messages as read
        await db.execute(text("""
            UPDATE community.chat_messages SET read_at = now()
            WHERE thread_id = :tid AND sender_user_id = :other AND read_at IS NULL
        """), {"tid": tid, "other": other_id})
    return {"data": {"thread_id": tid, "messages": [
        {**dict(m), "message_id": str(m["message_id"]), "sender_user_id": str(m["sender_user_id"]),
         "mine": str(m["sender_user_id"]) == uid} for m in msgs]}}


@router.post("/chat/with/{other_id}")
async def chat_send(other_id: str, body: ChatSend, user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    if not (body.body and body.body.strip()):
        raise HTTPException(status_code=422, detail="Message body is required")
    async with get_rls_db(str(user["tenant_id"])) as db:
        if not await _connected(db, uid, other_id):
            raise HTTPException(status_code=403, detail="Connect first — you can only chat with mutual connections")
        tid = await _thread_id(db, uid, other_id, create=True)
        row = (await db.execute(text("""
            INSERT INTO community.chat_messages (thread_id, sender_user_id, body)
            VALUES (:tid, :uid, :body) RETURNING message_id, created_at
        """), {"tid": tid, "uid": uid, "body": body.body.strip()})).mappings().first()
        await db.execute(text("UPDATE community.chat_threads SET last_message_at = now() WHERE thread_id = :tid"), {"tid": tid})
        # Web Push to the recipient (best-effort; no-op until VAPID configured)
        await push_to_user(db, other_id, user.get("full_name") or "New message", body.body.strip(), url="/home")
    return {"data": {"thread_id": tid, "message_id": str(row["message_id"]), "created_at": str(row["created_at"])}}


@router.post("/chat/{thread_id}/read")
async def chat_mark_read(thread_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            UPDATE community.chat_messages SET read_at = now()
            WHERE thread_id = :tid AND sender_user_id <> :uid AND read_at IS NULL
        """), {"tid": thread_id, "uid": str(user["user_id"])})
    return {"data": {"ok": True}}


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
