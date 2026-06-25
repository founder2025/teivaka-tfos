"""payment_lock — second-factor gate for the Payments section.

A dedicated payments PIN (bcrypt-hashed, stored in tenant.payment_security) plus a
short-lived server-enforced "unlock" in Redis. The unlock is checked by a FastAPI
dependency on every sensitive payments endpoint, so the gate is real even against
direct API calls — not just a screen the UI draws. Owner-only is already enforced
by JWT + RLS; this protects an already-logged-in device.
"""
from __future__ import annotations

import logging

import redis.asyncio as redis_async
from fastapi import Depends, HTTPException
from passlib.context import CryptContext

from app.config import settings
from app.middleware.rls import get_current_user

logger = logging.getLogger("teivaka.payment_lock")

pin_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

UNLOCK_TTL_SECONDS = 600        # 10 min of access per unlock
MAX_FAILED = 5                  # attempts before lockout
LOCKOUT_SECONDS = 900           # 15 min lockout


def _unlock_key(user_id: str) -> str:
    return f"pay_unlock:{user_id}"


def hash_pin(pin: str) -> str:
    return pin_context.hash(pin)


def verify_pin(pin: str, pin_hash: str) -> bool:
    try:
        return pin_context.verify(pin, pin_hash)
    except Exception:  # noqa: BLE001
        return False


async def set_unlocked(user_id: str) -> int:
    r = redis_async.from_url(settings.redis_url)
    try:
        await r.set(_unlock_key(str(user_id)), "1", ex=UNLOCK_TTL_SECONDS)
        return UNLOCK_TTL_SECONDS
    finally:
        await r.aclose()


async def is_unlocked(user_id: str) -> bool:
    r = redis_async.from_url(settings.redis_url)
    try:
        return bool(await r.get(_unlock_key(str(user_id))))
    except Exception as e:  # noqa: BLE001
        # Fail CLOSED: if Redis is unreachable, the section stays locked.
        logger.warning("payment unlock check failed: %s", e)
        return False
    finally:
        await r.aclose()


async def clear_unlocked(user_id: str) -> None:
    r = redis_async.from_url(settings.redis_url)
    try:
        await r.delete(_unlock_key(str(user_id)))
    finally:
        await r.aclose()


async def has_pin(tenant_id: str, user_id: str) -> bool:
    """Whether this account has established a payments PIN. Fails OPEN (returns
    False) if the security table is missing or unreadable, so the section degrades
    to 'not yet secured' rather than hard-locking everyone on a deploy lag."""
    from sqlalchemy import text
    from app.db.session import get_rls_db
    try:
        async with get_rls_db(str(tenant_id)) as db:
            return bool((await db.execute(text(
                "SELECT 1 FROM tenant.payment_security WHERE user_id=cast(:u AS uuid)"),
                {"u": str(user_id)})).scalar())
    except Exception as e:  # noqa: BLE001
        logger.warning("has_pin check failed (treating as no PIN): %s", e)
        return False


async def require_payment_unlock(user: dict = Depends(get_current_user)) -> dict:
    """Progressive gate: the section is OPEN until the owner sets a PIN. Once a PIN
    exists, every sensitive call needs an active unlock (423 otherwise). The
    unlock check runs first (fast Redis hit); the PIN-existence check only runs on
    the locked path, so an unlocked session pays no extra query."""
    uid = str(user["user_id"])
    if await is_unlocked(uid):
        return user
    if await has_pin(str(user["tenant_id"]), uid):
        raise HTTPException(status_code=423, detail="PAYMENTS_LOCKED")
    return user  # no PIN established yet → open until the owner secures it
