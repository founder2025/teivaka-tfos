# FILE: app/middleware/rls.py
# Teivaka Farm OS -- RLS session + role/tier enforcement dependencies

from fastapi import Request, Depends, HTTPException, status
from app.db.session import AsyncSessionLocal
from sqlalchemy import text
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession

# Role constants -- single source of truth used across all route files
ROLE_ADMIN   = "ADMIN"
ROLE_FOUNDER = "FOUNDER"
ROLE_MANAGER = "MANAGER"
ROLE_WORKER  = "WORKER"
ROLE_VIEWER  = "VIEWER"
ROLE_FARMER  = "FARMER"

ALL_ROLES = {ROLE_ADMIN, ROLE_FOUNDER, ROLE_MANAGER, ROLE_WORKER, ROLE_VIEWER, ROLE_FARMER}


# -- Core auth dependency ------------------------------------------------------

def get_current_user(request: Request) -> dict:
    """
    FastAPI dependency: returns the authenticated user dict from request.state.
    Populated by AuthMiddleware.
    Raises 401 if not present.
    """
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


# -- RLS-enabled DB session dependency ----------------------------------------

async def get_tenant_db(
    user: dict = Depends(get_current_user),
) -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency: yields an AsyncSession with RLS enforced for the
    current user's tenant. Use this in route handlers instead of get_db().

    Usage:
        @router.get("/farms")
        async def list_farms(db: AsyncSession = Depends(get_tenant_db)):
    """
    async with AsyncSessionLocal() as session:
        async with session.begin():
            # asyncpg can't bind parameters to SET — use set_config(name, value, is_local)
            await session.execute(
                text("SELECT set_config('app.tenant_id', :tenant_id, true)"),
                {"tenant_id": str(user["tenant_id"])},
            )
            try:
                yield session
            except Exception:
                await session.rollback()
                raise


# -- Role enforcement ----------------------------------------------------------

def require_role(*roles: str):
    """
    Dependency factory: raises 403 if the user does not have one of the
    specified roles.

    Usage:
        @router.patch("/farms/{farm_id}")
        async def update_farm(
            farm_id: str,
            user: dict = Depends(require_role("FOUNDER", "MANAGER")),
        ):
    """
    def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires one of these roles: {', '.join(roles)}. "
                       f"Your role: {user['role']}",
            )
        return user
    return checker


# -- Admin-only enforcement ---------------------------------------------------

def require_admin():
    """
    Strict guard for platform admin routes (/api/v1/admin/*).
    Only accounts with role = 'ADMIN' may pass.
    Returns 403 for all other roles -- does not leak admin route existence.

    Usage:
        @router.get("/admin/users")
        async def list_all_users(user: dict = Depends(require_admin())):
    """
    def checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") != ROLE_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied.",
            )
        return user
    return checker


# -- Subscription tier enforcement --------------------------------------------

TIER_ORDER: dict[str, int] = {
    "FREE": 0,
    "BASIC": 1,
    "PROFESSIONAL": 2,
    "ENTERPRISE": 3,
}


def require_tier(*tiers: str):
    """
    Dependency factory: raises 402 if the user's subscription tier is below
    the minimum required tier.

    Usage:
        @router.post("/tis/chat")
        async def tis_chat(
            user: dict = Depends(require_tier("BASIC")),
        ):
    """
    min_tier_level = min(TIER_ORDER.get(t.upper(), 0) for t in tiers)
    min_tier_name = next(
        (t for t, level in TIER_ORDER.items() if level == min_tier_level), tiers[0]
    )

    def checker(user: dict = Depends(get_current_user)) -> dict:
        user_tier_level = TIER_ORDER.get(user.get("subscription_tier", "FREE").upper(), 0)
        if user_tier_level < min_tier_level:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=(
                    f"This feature requires a {min_tier_name} subscription or higher. "
                    f"Current plan: {user.get('subscription_tier')}. "
                    f"Upgrade at /api/v1/subscriptions/upgrade"
                ),
            )
        return user
    return checker


def require_role_and_tier(*roles: str, min_tier: str = "FREE"):
    """
    Combined dependency: requires BOTH a matching role AND minimum tier.

    Usage:
        @router.post("/reports/export")
        async def export_report(
            user: dict = Depends(require_role_and_tier("FOUNDER", "MANAGER", min_tier="BASIC")),
        ):
    """
    min_tier_level = TIER_ORDER.get(min_tier.upper(), 0)

    def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role: {', '.join(roles)}",
            )
        user_tier_level = TIER_ORDER.get(user.get("subscription_tier", "FREE").upper(), 0)
        if user_tier_level < min_tier_level:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Requires {min_tier} subscription or higher",
            )
        return user
    return checker
