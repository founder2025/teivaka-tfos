from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from contextlib import asynccontextmanager
from typing import AsyncGenerator
import logging
from app.config import settings

logger = logging.getLogger(__name__)

engine = create_async_engine(
    settings.async_database_url,
    pool_size=settings.database_pool_size,
    max_overflow=settings.database_max_overflow,
    echo=settings.database_echo,
    pool_pre_ping=True,
    pool_recycle=3600,
    connect_args={
        "server_settings": {
            "application_name": "teivaka-agri-tos",
            "timezone": "Pacific/Fiji",
        }
    },
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency — yields a plain DB session without RLS enforcement.
    Use only for shared-schema queries (e.g. reading tenant/user records during auth).
    For all tenant-scoped data, use get_rls_db() instead.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_rls_db(tenant_id: str) -> AsyncGenerator[AsyncSession, None]:
    """
    Context manager that yields a session with PostgreSQL RLS enforced.

    Sets the session-local GUC `app.tenant_id` so that all RLS policies
    on tenant.* tables automatically filter to the correct tenant.

    Usage:
        async with get_rls_db(tenant_id) as db:
            result = await db.execute(select(Farm))

    IMPORTANT: This wraps in begin(), so the caller must NOT call commit()
    or begin() again. The transaction commits automatically on __aexit__.
    Raise an exception to trigger rollback.
    """
    async with AsyncSessionLocal() as session:
        async with session.begin():
            try:
                await session.execute(
                    text("SET LOCAL app.tenant_id = :tenant_id"),
                    {"tenant_id": str(tenant_id)},
                )
                yield session
            except Exception:
                await session.rollback()
                raise


async def get_rls_db_dependency(tenant_id: str) -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency variant of get_rls_db for use with Depends().
    Caller is responsible for passing tenant_id from request.state.user.

    Example:
        async def get_tenant_db(user: dict = Depends(get_current_user)):
            async with get_rls_db(user["tenant_id"]) as db:
                yield db
    """
    async with AsyncSessionLocal() as session:
        async with session.begin():
            try:
                await session.execute(
                    text("SET LOCAL app.tenant_id = :tenant_id"),
                    {"tenant_id": str(tenant_id)},
                )
                yield session
            except Exception:
                await session.rollback()
                raise


async def check_db_health() -> bool:
    """
    Used by /health endpoint. Returns True if DB is reachable, False otherwise.
    Does NOT raise — callers check the return value.
    """
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.error(f"DB health check failed: {e}")
        return False
