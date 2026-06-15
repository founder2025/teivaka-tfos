"""otp.py — Redis-backed one-time-code engine for signup verification.

Channel-agnostic by design: `request_otp`/`verify_otp` only know about a
*destination* (an email today; a phone/WhatsApp number tomorrow) and a *purpose*.
The caller picks the transport (Resend email now; Meta WhatsApp / Vonage SMS once
provisioned + receipt-verified per PR.2).

Why Redis, not the DB: signup OTP is issued BEFORE/around account creation and is
ephemeral. Redis gives us a TTL for free, keeps the hot path off Postgres, and
avoids a migration (the Alembic chain is mid-repair). Codes are stored HASHED
(never plaintext) and never logged.

Defaults (config.py): 6-digit, 10-min expiry, 5 attempts, 30s resend cooldown,
5 sends/hour per destination.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import secrets

import redis.asyncio as redis_async

from app.config import settings

logger = logging.getLogger("teivaka.otp")


def _norm(dest: str) -> str:
    return (dest or "").strip().lower()


def _code_key(purpose: str, dest: str) -> str:
    return f"otp:{purpose}:{_norm(dest)}"


def _cooldown_key(purpose: str, dest: str) -> str:
    return f"otp:cd:{purpose}:{_norm(dest)}"


def _hourly_key(purpose: str, dest: str) -> str:
    return f"otp:hr:{purpose}:{_norm(dest)}"


def _hash(code: str) -> str:
    # Keyed hash so a Redis dump alone can't be brute-forced offline without the
    # app secret. Codes are short, so the secret is what gives this teeth.
    return hmac.new(
        settings.secret_key.encode(), code.encode(), hashlib.sha256
    ).hexdigest()


async def request_otp(dest: str, purpose: str = "email_verify") -> dict:
    """Issue a fresh code for `dest`. Returns a dict; the plaintext `code` is
    present ONLY on success so the caller can dispatch it — it is never persisted
    in plaintext and never logged. Enforces resend cooldown + hourly cap.

    Returns:
      {"ok": True,  "code": "123456", "ttl": 600}
      {"ok": False, "reason": "cooldown",   "retry_after": <secs>}
      {"ok": False, "reason": "hourly_cap", "retry_after": <secs>}
    """
    ttl = settings.email_otp_expire_minutes * 60
    r = redis_async.from_url(settings.redis_url)
    try:
        cd = _cooldown_key(purpose, dest)
        cd_ttl = await r.ttl(cd)
        if cd_ttl and cd_ttl > 0:
            return {"ok": False, "reason": "cooldown", "retry_after": int(cd_ttl)}

        hk = _hourly_key(purpose, dest)
        sent = int(await r.get(hk) or 0)
        if sent >= settings.email_otp_hourly_cap:
            hr_ttl = await r.ttl(hk)
            return {"ok": False, "reason": "hourly_cap",
                    "retry_after": int(hr_ttl if hr_ttl and hr_ttl > 0 else 3600)}

        code = f"{secrets.randbelow(1_000_000):06d}"
        await r.set(
            _code_key(purpose, dest),
            json.dumps({"h": _hash(code), "attempts": 0}),
            ex=ttl,
        )
        await r.set(cd, "1", ex=settings.email_otp_resend_cooldown_seconds)
        pipe = r.pipeline()
        pipe.incr(hk)
        pipe.expire(hk, 3600)
        await pipe.execute()
        return {"ok": True, "code": code, "ttl": ttl}
    finally:
        await r.aclose()


async def verify_otp(dest: str, code: str, purpose: str = "email_verify") -> dict:
    """Check a submitted code (constant-time). Consumes the code on success and
    on exhausting attempts. Never reveals more than necessary.

    Returns:
      {"ok": True}
      {"ok": False, "reason": "expired"}            # no/expired code on file
      {"ok": False, "reason": "too_many_attempts"}
      {"ok": False, "reason": "invalid", "attempts_left": N}
    """
    code = (code or "").strip()
    r = redis_async.from_url(settings.redis_url)
    try:
        key = _code_key(purpose, dest)
        raw = await r.get(key)
        if not raw:
            return {"ok": False, "reason": "expired"}
        data = json.loads(raw)
        attempts = int(data.get("attempts", 0))
        if attempts >= settings.email_otp_max_attempts:
            await r.delete(key)
            return {"ok": False, "reason": "too_many_attempts"}

        if hmac.compare_digest(str(data.get("h", "")), _hash(code)):
            await r.delete(key)
            return {"ok": True}

        data["attempts"] = attempts + 1
        remaining_ttl = await r.ttl(key)
        await r.set(key, json.dumps(data), ex=max(int(remaining_ttl or 1), 1))
        return {"ok": False, "reason": "invalid",
                "attempts_left": max(settings.email_otp_max_attempts - data["attempts"], 0)}
    finally:
        await r.aclose()


def mask_email(email: str) -> str:
    """j***@gmail.com — for honest 'we sent a code to ...' copy without leaking
    the full address into UI/logs."""
    e = (email or "").strip()
    if "@" not in e:
        return e
    local, _, domain = e.partition("@")
    head = local[0] if local else ""
    return f"{head}***@{domain}"
