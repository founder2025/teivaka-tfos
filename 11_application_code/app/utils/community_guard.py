"""Community write hardening — verification gating + per-user rate limiting.

Applied only to WRITE / broadcast actions (create post, reply, repost, share,
follow, upload). Reads, likes, saves, reactions and *reports* stay open — we
never want to stop an unverified user from reading or from flagging abuse.

Two protections, composed by `community_write(...)`:
  1. require_verified_email — a verified email is required to broadcast. New
     users can browse immediately; they verify before they can post.
  2. rate_limit — fixed-window per-user cap, Redis-backed. FAIL-OPEN: if Redis
     is unreachable we log and allow, so a cache hiccup never locks out a
     legitimate farmer (abuse tolerance > false lockout for a smallholder app).
"""
import logging
import time

import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, status

from app.config import settings
from app.middleware.rls import get_current_user

logger = logging.getLogger("teivaka.community")

_redis = None


def _get_redis():
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


def require_verified_email(user: dict = Depends(get_current_user)) -> dict:
    """Soft helper, kept for any future action that genuinely needs it. NOT used
    by community_write anymore (2026-06-13): a hard email wall on basic
    self-expression blocked new farmers from day one, and verification email
    often never delivers (SMTP unconfigured / +679 SMS broken), making the gate
    unpassable. Verification is now a dismissible UI nudge, never a 403."""
    return user


async def rate_limit(user: dict, action: str, limit: int, window_seconds: int) -> None:
    """Fixed-window per-user limiter. Raises 429 when over the cap; fail-open on
    any Redis error."""
    try:
        r = _get_redis()
        bucket = int(time.time()) // window_seconds
        key = f"crl:{action}:{user['user_id']}:{bucket}"
        n = await r.incr(key)
        if n == 1:
            await r.expire(key, window_seconds)
        if n > limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="You're doing that too quickly. Please wait a moment and try again.",
                headers={"Retry-After": str(window_seconds)},
            )
    except HTTPException:
        raise
    except Exception as e:  # Redis down / network blip — never block a real user
        logger.warning("community rate_limit fail-open (action=%s): %s", action, e)


def community_write(action: str, limit: int, window_seconds: int = 60):
    """Dependency factory for community WRITE actions. As of 2026-06-13 this is
    rate-limit-ONLY — the email-verification hard gate was removed so a new,
    unverified farmer can post, comment, upload a profile pic/cover, share a
    story and list produce from day one. Spam defense is the per-action rate
    limit (+ auth + RLS + file validation), not an unpassable wall."""
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        await rate_limit(user, action, limit, window_seconds)
        return user
    return dep


def rate_limit_only(action: str, limit: int, window_seconds: int = 60):
    """Rate-limit WITHOUT the email-verification gate. For low-abuse relationship
    actions (e.g. follow) that every authenticated user should be able to do —
    so a new/unverified user can still build their graph. Still abuse-capped."""
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        await rate_limit(user, action, limit, window_seconds)
        return user
    return dep
