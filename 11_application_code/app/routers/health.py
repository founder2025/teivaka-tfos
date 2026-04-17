from fastapi import APIRouter
from sqlalchemy import text
from app.db.session import get_db
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/db")
async def health_db():
    """Check PostgreSQL database connectivity."""
    try:
        async with get_db() as db:
            result = await db.execute(text("SELECT 1 AS ok, now() AS server_time, current_database() AS db_name"))
            row = result.mappings().first()
            return {
                "status": "healthy",
                "db": "postgresql",
                "server_time": str(row["server_time"]),
                "db_name": row["db_name"],
            }
    except Exception as e:
        logger.error(f"DB health check failed: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail={"status": "unhealthy", "error": str(e)})

@router.get("/celery")
async def health_celery():
    """Check Celery worker connectivity by pinging the default queue."""
    try:
        from app.workers.celery_app import celery_app
        inspect = celery_app.control.inspect(timeout=2.0)
        stats = inspect.stats()
        if stats:
            worker_names = list(stats.keys())
            return {"status": "healthy", "workers": worker_names, "worker_count": len(worker_names)}
        else:
            return {"status": "degraded", "workers": [], "message": "No Celery workers responding"}
    except Exception as e:
        logger.error(f"Celery health check failed: {e}")
        return {"status": "unhealthy", "error": str(e)}

@router.get("/redis")
async def health_redis():
    """Check Redis connectivity and memory usage."""
    try:
        import redis.asyncio as aioredis
        from app.config import settings
        r = aioredis.from_url(settings.redis_url)
        try:
            pong = await r.ping()
            info = await r.info("memory")
            used_memory_mb = round(info.get("used_memory", 0) / 1024 / 1024, 2)
            return {
                "status": "healthy" if pong else "unhealthy",
                "ping": pong,
                "used_memory_mb": used_memory_mb,
                "redis_url": settings.redis_url.split("@")[-1],  # hide credentials
            }
        finally:
            await r.aclose()
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        return {"status": "unhealthy", "error": str(e)}

@router.get("")
async def health_all():
    """Composite health check — returns status of all services."""
    results = {}

    # DB check
    try:
        async with get_db() as db:
            await db.execute(text("SELECT 1"))
        results["db"] = "healthy"
    except Exception as e:
        results["db"] = f"unhealthy: {str(e)}"

    # Redis check
    try:
        import redis.asyncio as aioredis
        from app.config import settings
        r = aioredis.from_url(settings.redis_url)
        try:
            pong = await r.ping()
            results["redis"] = "healthy" if pong else "unhealthy"
        finally:
            await r.aclose()
    except Exception as e:
        results["redis"] = f"unhealthy: {str(e)}"

    # Celery check
    try:
        from app.workers.celery_app import celery_app
        inspect = celery_app.control.inspect(timeout=1.5)
        stats = inspect.stats()
        results["celery"] = f"healthy ({len(stats)} workers)" if stats else "degraded (no workers)"
    except Exception as e:
        results["celery"] = f"unhealthy: {str(e)}"

    overall = "healthy" if all("unhealthy" not in v for v in results.values()) else "degraded"
    return {"status": overall, "services": results}
