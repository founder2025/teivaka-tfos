from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy import text
import logging
import os
import redis.asyncio as aioredis
from app.config import settings
from app.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)

# SSE endpoints (EventSource can't set an Authorization header). Instead of a JWT
# in the query string (B93 — logged, in history, in proxy logs), these paths
# accept a short-lived, single-use ?ticket= minted via POST .../chat/stream-ticket.
_STREAM_PATHS: frozenset[str] = frozenset({
    "/api/v1/tis/stream",
    "/api/v1/community/chat/stream",
})
_ticket_redis = None


async def _redeem_stream_ticket(ticket: str) -> str | None:
    """Single-use redemption of an SSE auth ticket → the original JWT. GET+DELETE
    so a ticket leaked via a URL/log is useless after one use; tickets also self-
    expire (30s TTL set at mint). Fails closed (→ 401) if Redis is unavailable."""
    global _ticket_redis
    try:
        if _ticket_redis is None:
            _ticket_redis = aioredis.from_url(
                os.environ.get("REDIS_URL", "redis://redis:6379/0"), decode_responses=True
            )
        key = f"stream_ticket:{ticket}"
        val = await _ticket_redis.get(key)
        if val is not None:
            await _ticket_redis.delete(key)
        return val
    except Exception as e:  # redis blip → no auth → 401, never a 500
        logger.warning(f"stream ticket redeem failed: {e}")
        return None


def _auth_deny(status_code: int, detail: str) -> JSONResponse:
    """Return a clean JSON error from the auth middleware.

    A `raise HTTPException` inside Starlette middleware is NOT caught by FastAPI's
    exception handlers — it surfaces as an unhandled ExceptionGroup → HTTP 500 plus
    a full stack trace per request (which also buries real errors in the logs).
    Returning a JSONResponse sends the intended status cleanly: the client gets a
    real 401/403 (so the frontend's on-401 token refresh actually fires) and the
    logs stay quiet. Success path is unchanged.
    """
    headers = {"WWW-Authenticate": "Bearer"} if status_code == status.HTTP_401_UNAUTHORIZED else None
    return JSONResponse(status_code=status_code, content={"detail": detail}, headers=headers)


class AuthMiddleware:
    """
    Starlette-compatible middleware that:
      1. Skips auth for PUBLIC_PATHS (health check, docs, webhooks).
      2. Extracts `Authorization: Bearer <token>` from the request header.
      3. Verifies the JWT using the app's own SECRET_KEY (HS256) — NOT Supabase.
      4. Looks up the user+tenant record in the DB by user_id (sub claim).
      5. Attaches the user dict to request.state.user so route handlers can read it.
      6. Rejects suspended accounts with 403.

    All route handlers that require auth should use `Depends(get_current_user)`
    from app.middleware.rls — NOT read request.state directly.

    Tokens are issued by app.routers.auth (login/register/refresh) and signed with
    settings.secret_key. No Supabase dependency in the auth pipeline.
    """

    PUBLIC_PATHS: frozenset[str] = frozenset({
        "/health",
        "/api/v1/health",
        "/",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/api/v1/auth/login",
        "/api/v1/auth/register",
        "/api/v1/auth/refresh",
        "/api/v1/auth/reset-password",
        "/api/v1/auth/forgot-password",
        "/api/v1/auth/verify-email",
        "/api/v1/auth/resend-verification",
        "/api/v1/auth/send-phone-otp",
        "/api/v1/auth/verify-phone-otp",
        "/api/v1/webhooks/whatsapp",
        "/api/v1/webhooks/stripe",
        "/api/v1/attribution/capture",
        "/api/v1/waitlist/join",
        "/api/v1/waitlist/qr.png",
        "/api/v1/platform/flags",
        "/api/v1/platform/metric",
        "/api/v1/platform/banner",
        "/verify",
    })

    PUBLIC_PREFIXES: tuple[str, ...] = (
        "/api/v1/webhooks/",
        "/static/",
        "/api/v1/verify/",
        "/verify/",
        "/api/v1/tis-public/",
        # public sponsor impact portal — tokenized read-only (no account)
        "/api/v1/sponsor-portal/",
        # Uploaded media (avatars, post photos): browsers fetch <img> with no
        # Authorization header, so the GET must be public or every image 401s.
        # Trailing slash keeps POST /api/v1/community/uploads (no slash) fully
        # authenticated; names are unguessable uuid4 hex (social-CDN model).
        "/api/v1/community/uploads/",
        # team invite accept flow: token-gated public preview + account creation
        "/api/v1/team/invites/",
    )

    async def __call__(self, request: Request, call_next):
        path = request.url.path

        # Skip auth for public paths and prefixes
        if path in self.PUBLIC_PATHS or any(path.startswith(p) for p in self.PUBLIC_PREFIXES):
            return await call_next(request)

        # Extract Bearer token. SSE endpoints can't set headers, so the stream
        # paths instead accept a single-use ?ticket= (redeemed to the JWT) — the
        # JWT itself never travels in a URL/log (B93).
        auth_header = request.headers.get("Authorization", "")
        token: str | None = None
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()
        elif path in _STREAM_PATHS:
            ticket = (request.query_params.get("ticket") or "").strip() or None
            if ticket:
                token = await _redeem_stream_ticket(ticket)

        if not token:
            return _auth_deny(
                status.HTTP_401_UNAUTHORIZED,
                "Missing or malformed authorization header. Expected: Bearer <token>",
            )

        # Verify JWT — signed with settings.secret_key (HS256), issued by /api/v1/auth/login
        try:
            payload = jwt.decode(
                token,
                settings.secret_key,
                algorithms=[settings.jwt_algorithm],
            )
        except JWTError as e:
            logger.warning(f"JWT verification failed for path={path}: {e}")
            return _auth_deny(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")

        user_id = payload.get("sub")
        if not user_id:
            return _auth_deny(status.HTTP_401_UNAUTHORIZED, "Invalid token: missing sub claim")

        # Fetch user + tenant from DB
        # Uses AsyncSessionLocal (no RLS context) since this is a bootstrap lookup
        # by user_id — tenant context is set AFTER we know who the user is.
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    SELECT
                        u.user_id,
                        u.tenant_id,
                        u.full_name,
                        u.email,
                        u.role,
                        u.account_type,
                        u.country,
                        u.bio,
                        u.avatar_url,
                        u.field_visibility,
                        u.email_verified,
                        u.kyc_verified,
                        u.cover_url,
                        u.unit_mode,
                        u.pref_currency,
                        u.pref_weight,
                        u.pref_area,
                        u.pref_temp,
                        u.preferred_language,
                        u.whatsapp_number,
                        t.subscription_tier,
                        t.subscription_status,
                        t.tis_calls_today,
                        t.tis_daily_limit,
                        t.tis_calls_reset_at,
                        t.farm_count_limit,
                        t.worker_count_limit,
                        u.trial_started_at,
                        u.trial_ends_at
                    FROM tenant.users u
                    JOIN tenant.tenants t ON t.tenant_id = u.tenant_id
                    WHERE u.user_id = :user_id
                      AND u.is_active = true
                """),
                {"user_id": user_id},
            )
            row = result.mappings().first()

        if not row:
            logger.warning(f"Auth failed: no active user for user_id={user_id}")
            return _auth_deny(status.HTTP_401_UNAUTHORIZED, "User account not found or deactivated")

        if row["subscription_status"] == "SUSPENDED":
            logger.warning(f"Suspended account access attempt: tenant_id={row['tenant_id']}")
            return _auth_deny(status.HTTP_403_FORBIDDEN, "Account suspended. Please contact support.")

        # Attach user to request state for downstream access
        udict = dict(row)
        # Canonical profession = account_type lower-cased (single source of truth)
        udict["profession"] = (udict.get("account_type") or "FARMER").lower()
        request.state.user = udict
        request.state.tenant_id = str(row["tenant_id"])

        return await call_next(request)
