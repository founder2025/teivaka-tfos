from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

from app.config import settings
from app.db.session import engine, check_db_health
from app.middleware.auth import AuthMiddleware

# ─── Import all 39 routers ────────────────────────────────────────────────────
from app.routers import (
    auth,
    admin,
    farms,
    zones,
    production_units,
    cycles,
    rotation,
    harvests,
    income,
    labor,
    inputs,
    input_transactions,
    equipment,
    workers,
    suppliers,
    customers,
    alerts,
    tasks,
    automation_rules,
    decision_engine,
    tis,
    voice,
    livestock,
    apiculture,
    price_master,
    orders,
    profit_share,
    financials,
    nursery,
    delivery,
    weather,
    kb,
    kb_articles,
    community,
    marketplace,
    subscriptions,
    webhooks,
    reports,
    exports,
    attribution,
    me as me_router,
    health as health_router,
)

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    logger.info(
        f"Starting {settings.app_name} v{settings.app_version} "
        f"[{settings.environment}] TZ=Pacific/Fiji"
    )

    # Initialise Sentry in production
    if settings.sentry_dsn and settings.is_production:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            integrations=[
                FastApiIntegration(),
                SqlalchemyIntegration(),
            ],
            traces_sample_rate=settings.sentry_traces_sample_rate,
            environment=settings.environment,
            release=settings.app_version,
        )
        logger.info("Sentry initialised")

    # Verify database connectivity before accepting traffic
    db_ok = await check_db_health()
    if not db_ok:
        logger.critical("Database connection failed on startup — aborting")
        raise RuntimeError("Cannot connect to database")

    logger.info("Database connection verified")
    logger.info(f"Teivaka Agri-TOS ready — {len(app.routes)} routes registered")

    yield  # Application is running

    # ── Graceful shutdown ──────────────────────────────────────────────────────
    await engine.dispose()
    logger.info("Database connection pool closed — shutdown complete")


# ─── FastAPI application ───────────────────────────────────────────────────────
app = FastAPI(
    title="Teivaka Agri-TOS API",
    description="""
## Teivaka Agricultural Transformation Operating System — API v1

### 4 Pillars
- **Knowledge Base (KB)** — Articles, guides, crop data, regulatory content
- **Farm OS (TFOS)** — Farms, zones, production cycles, harvests, labor, inputs
- **AI Intelligence (TIS)** — Chat assistant, voice pipeline, decision engine
- **Community** — Marketplace, community posts, profit sharing

### Primary Metric
> **CoKG** = (LaborCost + InputCost + OtherCost) / HarvestQty_kg

All financial queries expose CoKG. The rotation engine uses CoKG history to score zone-crop-timing combinations.

### Authentication
All endpoints (except `/health`, `/docs`, and `/api/v1/auth/*`) require:
```
Authorization: Bearer <Supabase JWT>
```

### Multi-Tenancy
Every request sets `SET LOCAL app.tenant_id = '{uuid}'` — PostgreSQL RLS
enforces data isolation at the row level across all `tenant.*` tables.

### Subscription Tiers
| Tier | TIS Daily Calls | Features |
|------|----------------|----------|
| FREE | 5 | Basic TFOS, read-only KB |
| BASIC | 20 | Full TFOS, TIS chat |
| PREMIUM | Unlimited | All features, voice, exports |
| CUSTOM | Unlimited | Enterprise, custom limits |
    """,
    version=settings.app_version,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    openapi_url="/openapi.json" if not settings.is_production else None,
    lifespan=lifespan,
)

# ─── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Tenant-ID"],
)

# ─── Auth middleware (JWT verification + user lookup) ──────────────────────────
app.middleware("http")(AuthMiddleware())


# ─── System endpoints (no auth) ────────────────────────────────────────────────

@app.get("/health", tags=["System"], summary="Health check")
async def health_check():
    """
    Returns service health. Checks DB and Redis connectivity.
    Used by Docker health checks, load balancers, and monitoring.
    """
    import redis.asyncio as redis_async

    db_ok = await check_db_health()

    try:
        r = redis_async.from_url(settings.redis_url, socket_connect_timeout=2)
        await r.ping()
        redis_ok = True
        await r.aclose()
    except Exception as e:
        logger.warning(f"Redis health check failed: {e}")
        redis_ok = False

    overall = "healthy" if (db_ok and redis_ok) else "degraded"

    return {
        "status": overall,
        "version": settings.app_version,
        "environment": settings.environment,
        "services": {
            "database": "connected" if db_ok else "error",
            "redis": "connected" if redis_ok else "error",
        },
    }


# Prefixed alias for reverse proxies (Caddy health_uri expects /api/v1/health)
app.get("/api/v1/health", tags=["System"], include_in_schema=False)(health_check)


@app.get("/", tags=["System"], summary="API root")
async def root():
    return {
        "message": "Teivaka Agri-TOS API",
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/health",
    }


# ─── Mount all 39 routers ─────────────────────────────────────────────────────
PREFIX = "/api/v1"

# Auth
app.include_router(auth.router,               prefix=f"{PREFIX}/auth",               tags=["Auth"])
app.include_router(attribution.router,        prefix=f"{PREFIX}/attribution",        tags=["attribution"])
app.include_router(me_router.router,          prefix=f"{PREFIX}/me",                 tags=["Me"])

# Admin (ADMIN role only — require_admin() enforced inside each route)
app.include_router(admin.router,              prefix=f"{PREFIX}/admin",              tags=["Admin"])

# Farm OS — core
app.include_router(farms.router,              prefix=f"{PREFIX}/farms",              tags=["Farms"])
app.include_router(zones.router,              prefix=f"{PREFIX}/zones",              tags=["Zones"])
app.include_router(production_units.router,   prefix=f"{PREFIX}/production-units",   tags=["Production Units"])
app.include_router(cycles.router,             prefix=f"{PREFIX}/cycles",             tags=["Production Cycles"])
app.include_router(rotation.router,           prefix=f"{PREFIX}/rotation",           tags=["Rotation Engine"])
app.include_router(harvests.router,           prefix=f"{PREFIX}/harvests",           tags=["Harvests"])

# Farm OS — financials
app.include_router(income.router,             prefix=f"{PREFIX}/income",             tags=["Income"])
app.include_router(labor.router,              prefix=f"{PREFIX}/labor",              tags=["Labor"])
app.include_router(inputs.router,             prefix=f"{PREFIX}/inputs",             tags=["Inputs & Inventory"])
app.include_router(input_transactions.router, prefix=f"{PREFIX}/input-transactions", tags=["Input Transactions"])

# Farm OS — resources
app.include_router(equipment.router,          prefix=f"{PREFIX}/equipment",          tags=["Equipment"])
app.include_router(workers.router,            prefix=f"{PREFIX}/workers",            tags=["Workers"])
app.include_router(suppliers.router,          prefix=f"{PREFIX}/suppliers",          tags=["Suppliers"])
app.include_router(customers.router,          prefix=f"{PREFIX}/customers",          tags=["Customers"])

# Farm OS — operations
app.include_router(alerts.router,             prefix=f"{PREFIX}/alerts",             tags=["Alerts"])
app.include_router(tasks.router,              prefix=f"{PREFIX}/tasks",              tags=["Task Queue"])
app.include_router(automation_rules.router,   prefix=f"{PREFIX}/automation-rules",   tags=["Automation"])

# Intelligence
app.include_router(decision_engine.router,    prefix=f"{PREFIX}/decision-engine",    tags=["Decision Engine"])
app.include_router(tis.router,                prefix=f"{PREFIX}/tis",                tags=["TIS — AI Assistant"])
app.include_router(voice.router,              prefix=f"{PREFIX}/voice",              tags=["Voice Pipeline"])

# Specialised farm types
app.include_router(livestock.router,          prefix=f"{PREFIX}/livestock",          tags=["Livestock"])
app.include_router(apiculture.router,         prefix=f"{PREFIX}/apiculture",         tags=["Apiculture"])

# Commerce
app.include_router(price_master.router,       prefix=f"{PREFIX}/price-master",       tags=["Price Master"])
app.include_router(orders.router,             prefix=f"{PREFIX}/orders",             tags=["Orders"])
app.include_router(profit_share.router,       prefix=f"{PREFIX}/profit-share",       tags=["Profit Share"])
app.include_router(financials.router,         prefix=f"{PREFIX}/financials",         tags=["Financial Reports"])

# Logistics
app.include_router(nursery.router,            prefix=f"{PREFIX}/nursery",            tags=["Nursery"])
app.include_router(delivery.router,           prefix=f"{PREFIX}/delivery",           tags=["Delivery Log"])
app.include_router(weather.router,            prefix=f"{PREFIX}/weather",            tags=["Weather"])

# Knowledge Base
app.include_router(kb.router,                 prefix=f"{PREFIX}/kb",                 tags=["Knowledge Base"])
app.include_router(kb_articles.router,        prefix=f"{PREFIX}/kb/articles",        tags=["KB Articles"])

# Community & marketplace
app.include_router(community.router,          prefix=f"{PREFIX}/community",          tags=["Community"])
app.include_router(marketplace.router,        prefix=f"{PREFIX}/marketplace",        tags=["Marketplace"])

# Platform
app.include_router(subscriptions.router,      prefix=f"{PREFIX}/subscriptions",      tags=["Subscriptions"])
app.include_router(webhooks.router,           prefix=f"{PREFIX}/webhooks",           tags=["Webhooks"])
app.include_router(reports.router,            prefix=f"{PREFIX}/reports",            tags=["Reports"])
app.include_router(exports.router,            prefix=f"{PREFIX}/exports",            tags=["Exports"])

# Health router (additional detailed endpoint)
app.include_router(health_router.router,      prefix=f"{PREFIX}/system",             tags=["System"])


# ─── Global exception handlers ─────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        f"Unhandled exception on {request.method} {request.url.path}: {exc}",
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "message": "An unexpected error occurred. Our team has been notified.",
        },
    )
