from fastapi import Request, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy import text
import logging
from app.config import settings
from app.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


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
    })

    PUBLIC_PREFIXES: tuple[str, ...] = (
        "/api/v1/webhooks/",
        "/static/",
    )

    async def __call__(self, request: Request, call_next):
        path = request.url.path

        # Skip auth for public paths and prefixes
        if path in self.PUBLIC_PATHS or any(path.startswith(p) for p in self.PUBLIC_PREFIXES):
            return await call_next(request)

        # Extract Bearer token.
        # SSE endpoints (EventSource) cannot set custom headers, so for the
        # TIS advisory stream we also accept ?access_token= as a fallback.
        # This is narrowly scoped by path — no other endpoint reads query auth.
        auth_header = request.headers.get("Authorization", "")
        token: str | None = None
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()
        elif path == "/api/v1/tis/stream":
            token = (request.query_params.get("access_token") or "").strip() or None

        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing or malformed authorization header. Expected: Bearer <token>",
                headers={"WWW-Authenticate": "Bearer"},
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
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing sub claim",
            )

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
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account not found or deactivated",
            )

        if row["subscription_status"] == "SUSPENDED":
            logger.warning(f"Suspended account access attempt: tenant_id={row['tenant_id']}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account suspended. Please contact support.",
            )

        # Attach user to request state for downstream access
        request.state.user = dict(row)
        request.state.tenant_id = str(row["tenant_id"])

        return await call_next(request)
