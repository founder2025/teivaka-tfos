# FILE: 01_architecture/MULTI_TENANCY.md

# Teivaka TFOS — Multi-Tenancy Design

**Platform:** Teivaka Agricultural TOS
**Company:** Teivaka PTE LTD, Fiji
**Last Updated:** 2026-04-07
**Version:** 1.0

---

## 1. Overview

Teivaka TFOS uses a **single-database, dual-schema, Row Level Security (RLS)** multi-tenancy architecture. All tenants share one PostgreSQL 16 database instance. Tenant data is separated by a `tenant_id` UUID column on every operational table, with RLS policies at the PostgreSQL level enforcing isolation. No tenant can ever access another tenant's data — even if application code contains a bug that omits a WHERE clause — because the database itself enforces the filter.

**Design decisions:**
- **Why not separate databases?** At current scale (Hetzner CAX21), separate databases per tenant would be operationally costly (migrations must run N times, connection pooling is harder, backups multiply). A single database with RLS is simpler and sufficient.
- **Why not separate schemas per tenant?** Per-tenant schemas require dynamic schema management and make cross-tenant admin queries complex. The shared-vs-tenant dual-schema approach is cleaner.
- **Why RLS over application-layer filtering?** Application-layer filtering is a soft guarantee — a missed WHERE clause exposes all tenant data. RLS is enforced at the database kernel level and cannot be bypassed by application bugs.

---

## 2. Tenant ID Flow Through Every Layer

The `tenant_id` UUID is the single identity token that flows through all layers of the stack from JWT issuance to database row filtering.

```
[1] User logs in with email + password
         │
         ▼
[2] FastAPI /auth/login validates credentials
    Fetches user record → tenant_id = 'abc123-...'
         │
         ▼
[3] JWT signed and issued:
    {
      "sub": "user-uuid",
      "tenant_id": "abc123-...",
      "farm_ids": ["farm-uuid-1", "farm-uuid-2"],
      "role": "MANAGER",
      "exp": 1744041600
    }
         │
         ▼
[4] Client stores JWT in memory (access token)
    Refresh token stored in httpOnly cookie
         │
         ▼
[5] Client sends request:
    GET /api/v1/farms/farm-uuid-1/dashboard
    Authorization: Bearer <JWT>
         │
         ▼
[6] Caddy forwards request to FastAPI (port 8000)
         │
         ▼
[7] FastAPI JWT Middleware:
    - Decodes JWT with python-jose
    - Validates signature, checks expiry
    - Extracts: user_id, tenant_id, farm_ids, role
    - Stores in request.state.tenant_id = 'abc123-...'
         │
         ▼
[8] FastAPI RLS Middleware:
    - Gets DB connection from pool
    - BEGIN TRANSACTION
    - SET LOCAL app.tenant_id = 'abc123-...'
    - All subsequent queries in this transaction
      are now scoped to tenant 'abc123-...'
         │
         ▼
[9] Route handler executes:
    SELECT * FROM tenant.farms WHERE id = $1
    -- PostgreSQL evaluates RLS policy:
    -- Appends: AND tenant_id = current_setting('app.tenant_id')::UUID
    -- Returns only this tenant's farm
         │
         ▼
[10] COMMIT (releases SET LOCAL scope)
     Connection returned to pool
     tenant_id setting cleared
         │
         ▼
[11] Response returned to client
```

---

## 3. JWT Claim Structure

Every JWT issued by the Teivaka platform carries the following claim structure:

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "tenant_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "farm_ids": [
    "f001-farm-uuid-here",
    "f002-farm-uuid-here"
  ],
  "role": "FOUNDER",
  "iat": 1744038000,
  "exp": 1744038900,
  "jti": "unique-jwt-id-for-revocation"
}
```

**Field definitions:**

| Field | Type | Description |
|-------|------|-------------|
| `sub` | UUID string | User ID — primary identifier for the user record |
| `tenant_id` | UUID string | Tenant identifier — set as `app.tenant_id` in PostgreSQL for RLS |
| `farm_ids` | Array of UUID strings | List of farm UUIDs this user is authorized to access |
| `role` | Enum string | User's role within the tenant (see Role-Based Access section) |
| `iat` | Unix timestamp | Issued At — when this token was created |
| `exp` | Unix timestamp | Expiry — access tokens expire after 15 minutes |
| `jti` | UUID string | JWT ID — used for token revocation blacklist in Redis |

**Token lifetimes:**
- Access token: 15 minutes (`exp - iat = 900 seconds`)
- Refresh token: 7 days (stored as httpOnly Secure cookie, rotated on every use)

**Token revocation:**
- On logout: `jti` added to Redis set `token:blacklist:{jti}` with TTL matching remaining token lifetime
- JWT middleware checks blacklist before accepting any token
- Refresh token rotation: old refresh token hash stored in Redis blacklist on each `/auth/refresh` call

---

## 4. Role-Based Access Within Tenant

Every user has exactly one role within their tenant. Roles are enforced at two levels: the FastAPI subscription/role gate middleware and the database (some tables have role-based write policies in addition to tenant-based RLS).

### FOUNDER
**Who:** Farm owner or business founder (e.g., Uraia Koroi Kama for Teivaka-operated farms)
**Permissions:** Complete access to all operations within the tenant

- All read operations (all farms in `farm_ids`)
- All write operations (create, update, close cycles, log all event types)
- **Rotation gate override:** Can call `POST /cycles/{cycle_id}/override-rotation` — bypasses rotation validation with recorded justification
- Subscription management: Can call `POST /subscriptions/upgrade`
- View and manage all workers, equipment, financials, customers, suppliers
- Access to automation rule management
- Access to full decision engine history
- Admin-level reports (P&L, profit share, budget vs actual)

### MANAGER
**Who:** Farm manager or senior operator
**Permissions:** Full operational access, no override/subscription powers

- All read operations (farms in `farm_ids` only)
- All write operations: cycles, events, harvests, labor, cash, inventory, orders, deliveries
- Worker management (create/update workers in assigned farms)
- Alert management (resolve, dismiss)
- Task assignment and completion
- **Cannot:** override rotation gate, manage subscriptions, or access admin endpoints

### WORKER
**Who:** Field worker, laborer
**Permissions:** Logging only — can record operational facts, cannot manage or configure

- Read: own labor records, assigned tasks, own farm's alerts
- Write (logging only):
  - `POST /production-units/{pu_id}/events` — log field events
  - `POST /production-units/{pu_id}/harvests` — log harvest
  - `POST /farms/{farm_id}/labor` — log attendance (own records)
  - `POST /farms/{farm_id}/cash` — log cash transactions (petty cash)
  - `POST /zones/{zone_id}/weather` — log weather observations
- **Cannot:** create/close cycles, manage inventory, view financial reports, access workers list, manage customers, view decision engine

### VIEWER
**Who:** Stakeholder, silent partner, observer
**Permissions:** Read-only dashboard access

- Read: farm dashboard, active cycles (summary only), alerts (summary only), KPI reports
- **Cannot:** write any records, access detailed financial data, access worker or customer details
- Primarily useful for farm owners who are not operators (e.g., the Nayans family for Farm F001)

### Role Enforcement in FastAPI

```python
# In route handlers, role is checked via dependency:
from app.dependencies.auth import require_role

@router.post("/cycles/{cycle_id}/override-rotation")
async def override_rotation(
    cycle_id: UUID,
    request: RotationOverrideRequest,
    current_user: User = Depends(require_role([Role.FOUNDER]))
):
    ...

# require_role dependency:
def require_role(allowed_roles: list[Role]):
    def _dependency(current_user: User = Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "INSUFFICIENT_ROLE",
                    "message": f"This action requires role: {[r.value for r in allowed_roles]}",
                    "details": {"your_role": current_user.role.value}
                }
            )
        return current_user
    return _dependency
```

---

## 5. Multi-Farm Access

A single user can have access to multiple farms, specified in the `farm_ids` JWT claim array.

**Rules:**
- A FOUNDER or MANAGER user with `farm_ids: [f001-uuid, f002-uuid]` can query either farm's data
- The `farm_id` in the URL path is validated against the user's `farm_ids` list by the route's farm_access dependency
- Farm-level access check happens after tenant-level RLS — the tenant filter applies first, then the farm filter
- WORKER role is typically restricted to a single `farm_id`

**Farm access validation dependency:**

```python
async def validate_farm_access(
    farm_id: UUID,
    current_user: User = Depends(get_current_user)
) -> UUID:
    if farm_id not in current_user.farm_ids:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "FARM_ACCESS_DENIED",
                "message": "You do not have access to this farm.",
                "details": {"farm_id": str(farm_id)}
            }
        )
    return farm_id
```

Applied to all farm-scoped endpoints:
```python
@router.get("/farms/{farm_id}/dashboard")
async def get_dashboard(
    farm_id: UUID = Depends(validate_farm_access),
    current_user: User = Depends(get_current_user)
):
    ...
```

---

## 6. RLS FastAPI Middleware — Complete Implementation

```python
# app/middleware/rls.py

import logging
from typing import Callable
from uuid import UUID

from fastapi import Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# Paths that do not require tenant RLS (public or auth endpoints)
EXCLUDED_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/webhooks/whatsapp",
    "/api/v1/webhooks/stripe",
    "/health",
    "/docs",
    "/openapi.json",
}


class RLSMiddleware(BaseHTTPMiddleware):
    """
    Sets PostgreSQL app.tenant_id for Row Level Security on every request.

    This middleware runs after JWT middleware (which populates request.state.tenant_id).
    It executes SET LOCAL app.tenant_id = '{tenant_id}' within the database transaction
    so that all subsequent queries in the request are automatically filtered to the
    current tenant's data by PostgreSQL RLS policies.

    SET LOCAL is scoped to the current transaction. When the transaction commits or
    rolls back, the setting is cleared. This prevents tenant_id from leaking between
    requests via connection pooling.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip RLS setup for excluded paths
        if request.url.path in EXCLUDED_PATHS:
            return await call_next(request)

        # Skip if tenant_id was not set by JWT middleware
        # (JWT middleware will have already returned 401 if auth fails)
        tenant_id: UUID | None = getattr(request.state, "tenant_id", None)
        if tenant_id is None:
            return await call_next(request)

        # Inject RLS setter into the request's DB session factory
        # The actual SET LOCAL is executed when the session is first used
        request.state.rls_tenant_id = str(tenant_id)

        response = await call_next(request)
        return response


# app/db/session.py — Session factory with RLS injection

from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text

from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=5,
    max_overflow=15,
    pool_pre_ping=True,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autobegin=True,
)


async def get_db(request: Request):
    """
    FastAPI dependency that provides a DB session with RLS configured.

    This is the standard way all route handlers obtain a database session.
    The RLS tenant_id is set as a PostgreSQL local parameter scoped to the
    transaction, ensuring complete isolation between requests.
    """
    tenant_id: str | None = getattr(request.state, "rls_tenant_id", None)

    async with AsyncSessionLocal() as session:
        if tenant_id:
            # SET LOCAL is scoped to the current transaction.
            # It is automatically cleared when the transaction ends (commit/rollback).
            # This is the critical line that activates Row Level Security for this request.
            await session.execute(
                text("SET LOCAL app.tenant_id = :tenant_id"),
                {"tenant_id": tenant_id}
            )
            logger.debug(
                "RLS context set",
                extra={"tenant_id": tenant_id, "path": request.url.path}
            )
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# app/middleware/jwt_auth.py — JWT middleware that populates request.state

import logging
from typing import Callable
from uuid import UUID

from fastapi import Request, Response, HTTPException
from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.redis import redis_client

logger = logging.getLogger(__name__)

# Paths that do not require authentication
PUBLIC_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/webhooks/whatsapp",
    "/api/v1/webhooks/stripe",
    "/health",
    "/docs",
    "/openapi.json",
}


class JWTAuthMiddleware(BaseHTTPMiddleware):
    """
    Validates JWT Bearer tokens and populates request.state with user context.

    Extracted context (available to all route handlers via request.state):
    - request.state.user_id: UUID
    - request.state.tenant_id: UUID
    - request.state.farm_ids: list[UUID]
    - request.state.role: str
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.url.path in PUBLIC_PATHS:
            return await call_next(request)

        # Extract Bearer token
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return Response(
                content='{"success":false,"error":{"code":"MISSING_AUTH","message":"Authorization header required"}}',
                status_code=401,
                media_type="application/json"
            )

        token = auth_header.split(" ", 1)[1]

        try:
            payload = jwt.decode(
                token,
                settings.JWT_SECRET_KEY,
                algorithms=[settings.JWT_ALGORITHM]
            )
        except JWTError as e:
            logger.warning(f"JWT decode failed: {e}")
            return Response(
                content='{"success":false,"error":{"code":"INVALID_TOKEN","message":"Invalid or expired token"}}',
                status_code=401,
                media_type="application/json"
            )

        # Check token revocation blacklist
        jti = payload.get("jti")
        if jti and await redis_client.exists(f"token:blacklist:{jti}"):
            return Response(
                content='{"success":false,"error":{"code":"TOKEN_REVOKED","message":"Token has been revoked"}}',
                status_code=401,
                media_type="application/json"
            )

        # Populate request state
        request.state.user_id = UUID(payload["sub"])
        request.state.tenant_id = UUID(payload["tenant_id"])
        request.state.farm_ids = [UUID(fid) for fid in payload.get("farm_ids", [])]
        request.state.role = payload["role"]

        return await call_next(request)


# app/dependencies/auth.py — Convenience dependencies for route handlers

from fastapi import Depends, Request
from uuid import UUID
from dataclasses import dataclass
from enum import Enum


class Role(str, Enum):
    FOUNDER = "FOUNDER"
    MANAGER = "MANAGER"
    WORKER = "WORKER"
    VIEWER = "VIEWER"


@dataclass
class CurrentUser:
    user_id: UUID
    tenant_id: UUID
    farm_ids: list[UUID]
    role: Role


def get_current_user(request: Request) -> CurrentUser:
    """Dependency: returns current user context from request.state."""
    return CurrentUser(
        user_id=request.state.user_id,
        tenant_id=request.state.tenant_id,
        farm_ids=request.state.farm_ids,
        role=Role(request.state.role),
    )


def require_role(allowed_roles: list[Role]):
    """
    Dependency factory: raises 403 if user's role is not in allowed_roles.

    Usage:
        @router.post("/cycles/{cycle_id}/override-rotation")
        async def override_rotation(
            current_user: CurrentUser = Depends(require_role([Role.FOUNDER]))
        ):
            ...
    """
    def _dependency(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail={
                    "success": False,
                    "error": {
                        "code": "INSUFFICIENT_ROLE",
                        "message": f"This action requires one of: {[r.value for r in allowed_roles]}",
                        "details": {"your_role": current_user.role.value}
                    }
                }
            )
        return current_user
    return _dependency


def require_min_tier(min_tier: str):
    """
    Dependency factory: raises 403 if tenant's subscription tier is below minimum.

    Tier hierarchy: FREE < BASIC < PREMIUM < CUSTOM

    Usage:
        @router.post("/production-units/{pu_id}/harvests")
        async def log_harvest(
            _: None = Depends(require_min_tier("BASIC")),
            ...
        ):
            ...
    """
    TIER_RANK = {"FREE": 0, "BASIC": 1, "PREMIUM": 2, "CUSTOM": 3}

    async def _dependency(
        request: Request,
        redis=Depends(get_redis),
        db: AsyncSession = Depends(get_db),
    ):
        tenant_id = str(request.state.tenant_id)
        cache_key = f"tenant:subscription:{tenant_id}"

        # Check Redis cache first
        cached_tier = await redis.get(cache_key)
        if cached_tier:
            current_tier = cached_tier.decode()
        else:
            # Fetch from DB
            result = await db.execute(
                text("SELECT tier FROM tenant.tenant_subscriptions WHERE tenant_id = :tid AND status = 'active'"),
                {"tid": tenant_id}
            )
            row = result.fetchone()
            current_tier = row[0] if row else "FREE"
            await redis.setex(cache_key, 300, current_tier)

        if TIER_RANK.get(current_tier, 0) < TIER_RANK.get(min_tier, 0):
            raise HTTPException(
                status_code=403,
                detail={
                    "success": False,
                    "error": {
                        "code": "TIER_INSUFFICIENT",
                        "message": f"This feature requires {min_tier} tier or above.",
                        "details": {
                            "current_tier": current_tier,
                            "required_tier": min_tier
                        }
                    }
                }
            )
    return _dependency
```

---

## 7. Complete RLS Policy SQL

The following SQL defines Row Level Security policies for all operational tables in the `tenant.*` schema. These policies enforce that every query — regardless of application code — only returns rows belonging to the current tenant.

**Prerequisites:**
```sql
-- Enable RLS on each table (run once during schema creation)
-- The policy definitions follow below.

-- PostgreSQL local parameter used by all policies
-- Set by application middleware: SET LOCAL app.tenant_id = '{uuid}'
```

### Base Policy Pattern

All policies follow this pattern:
```sql
ALTER TABLE tenant.{table_name} ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.{table_name} FORCE ROW LEVEL SECURITY;

CREATE POLICY {table_name}_tenant_isolation ON tenant.{table_name}
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);
```

The `AS RESTRICTIVE` clause means this policy is AND-combined with any other policies (not OR-combined), making it impossible to bypass even if other permissive policies exist. `FORCE ROW LEVEL SECURITY` ensures the table owner (superuser) also has RLS applied.

### Complete Policy Definitions

```sql
-- ============================================================
-- SCHEMA SETUP
-- ============================================================

-- Application role used by FastAPI connection pool
-- This role does NOT have BYPASSRLS privilege
CREATE ROLE application_role LOGIN PASSWORD 'use_strong_password_from_env';

-- Grant usage on schemas
GRANT USAGE ON SCHEMA tenant TO application_role;
GRANT USAGE ON SCHEMA shared TO application_role;

-- Grant SELECT on all shared tables (read-only)
GRANT SELECT ON ALL TABLES IN SCHEMA shared TO application_role;

-- Grant full DML on tenant tables (RLS will restrict what's visible)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tenant TO application_role;

-- ============================================================
-- farms
-- ============================================================
ALTER TABLE tenant.farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.farms FORCE ROW LEVEL SECURITY;

CREATE POLICY farms_tenant_isolation ON tenant.farms
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- zones
-- ============================================================
ALTER TABLE tenant.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.zones FORCE ROW LEVEL SECURITY;

CREATE POLICY zones_tenant_isolation ON tenant.zones
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- production_units
-- ============================================================
ALTER TABLE tenant.production_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.production_units FORCE ROW LEVEL SECURITY;

CREATE POLICY production_units_tenant_isolation ON tenant.production_units
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- production_cycles
-- ============================================================
ALTER TABLE tenant.production_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.production_cycles FORCE ROW LEVEL SECURITY;

CREATE POLICY production_cycles_tenant_isolation ON tenant.production_cycles
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- field_events  (TimescaleDB hypertable)
-- ============================================================
ALTER TABLE tenant.field_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.field_events FORCE ROW LEVEL SECURITY;

CREATE POLICY field_events_tenant_isolation ON tenant.field_events
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- harvest_log  (TimescaleDB hypertable)
-- ============================================================
ALTER TABLE tenant.harvest_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.harvest_log FORCE ROW LEVEL SECURITY;

CREATE POLICY harvest_log_tenant_isolation ON tenant.harvest_log
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- income_log
-- ============================================================
ALTER TABLE tenant.income_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.income_log FORCE ROW LEVEL SECURITY;

CREATE POLICY income_log_tenant_isolation ON tenant.income_log
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- labor_attendance  (TimescaleDB hypertable)
-- ============================================================
ALTER TABLE tenant.labor_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.labor_attendance FORCE ROW LEVEL SECURITY;

CREATE POLICY labor_attendance_tenant_isolation ON tenant.labor_attendance
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- cash_ledger  (TimescaleDB hypertable)
-- ============================================================
ALTER TABLE tenant.cash_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.cash_ledger FORCE ROW LEVEL SECURITY;

CREATE POLICY cash_ledger_tenant_isolation ON tenant.cash_ledger
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- inputs
-- ============================================================
ALTER TABLE tenant.inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.inputs FORCE ROW LEVEL SECURITY;

CREATE POLICY inputs_tenant_isolation ON tenant.inputs
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- input_transactions
-- ============================================================
ALTER TABLE tenant.input_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.input_transactions FORCE ROW LEVEL SECURITY;

CREATE POLICY input_transactions_tenant_isolation ON tenant.input_transactions
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- orders  (purchase orders)
-- ============================================================
ALTER TABLE tenant.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.orders FORCE ROW LEVEL SECURITY;

CREATE POLICY orders_tenant_isolation ON tenant.orders
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- workers
-- ============================================================
ALTER TABLE tenant.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.workers FORCE ROW LEVEL SECURITY;

CREATE POLICY workers_tenant_isolation ON tenant.workers
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- equipment
-- ============================================================
ALTER TABLE tenant.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.equipment FORCE ROW LEVEL SECURITY;

CREATE POLICY equipment_tenant_isolation ON tenant.equipment
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- alerts
-- ============================================================
ALTER TABLE tenant.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.alerts FORCE ROW LEVEL SECURITY;

CREATE POLICY alerts_tenant_isolation ON tenant.alerts
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- task_queue
-- ============================================================
ALTER TABLE tenant.task_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.task_queue FORCE ROW LEVEL SECURITY;

CREATE POLICY task_queue_tenant_isolation ON tenant.task_queue
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- automation_rules
-- ============================================================
ALTER TABLE tenant.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.automation_rules FORCE ROW LEVEL SECURITY;

CREATE POLICY automation_rules_tenant_isolation ON tenant.automation_rules
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- decision_signals
-- ============================================================
ALTER TABLE tenant.decision_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.decision_signals FORCE ROW LEVEL SECURITY;

CREATE POLICY decision_signals_tenant_isolation ON tenant.decision_signals
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- tis_conversations
-- ============================================================
ALTER TABLE tenant.tis_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.tis_conversations FORCE ROW LEVEL SECURITY;

CREATE POLICY tis_conversations_tenant_isolation ON tenant.tis_conversations
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- tis_voice_logs
-- ============================================================
ALTER TABLE tenant.tis_voice_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.tis_voice_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY tis_voice_logs_tenant_isolation ON tenant.tis_voice_logs
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- ai_commands
-- ============================================================
ALTER TABLE tenant.ai_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.ai_commands FORCE ROW LEVEL SECURITY;

CREATE POLICY ai_commands_tenant_isolation ON tenant.ai_commands
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- ai_insights
-- ============================================================
ALTER TABLE tenant.ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.ai_insights FORCE ROW LEVEL SECURITY;

CREATE POLICY ai_insights_tenant_isolation ON tenant.ai_insights
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- community_profiles
-- ============================================================
ALTER TABLE tenant.community_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.community_profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY community_profiles_tenant_isolation ON tenant.community_profiles
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- EXCEPTION: community listings are visible to all authenticated tenants
-- (marketplace requires cross-tenant visibility for listings)
-- Separate read policy for community_listings:

-- ============================================================
-- marketplace_listings
-- (Special case: SELECT is cross-tenant, write is tenant-scoped)
-- ============================================================
ALTER TABLE tenant.marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.marketplace_listings FORCE ROW LEVEL SECURITY;

-- Write policy: tenant can only INSERT/UPDATE/DELETE their own listings
CREATE POLICY marketplace_listings_write_isolation ON tenant.marketplace_listings
    AS RESTRICTIVE
    FOR INSERT
    TO application_role
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE POLICY marketplace_listings_update_isolation ON tenant.marketplace_listings
    AS RESTRICTIVE
    FOR UPDATE
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

CREATE POLICY marketplace_listings_delete_isolation ON tenant.marketplace_listings
    AS RESTRICTIVE
    FOR DELETE
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- Read policy: any authenticated tenant can view active listings
-- (app.tenant_id being set confirms authentication)
CREATE POLICY marketplace_listings_read_all ON tenant.marketplace_listings
    AS PERMISSIVE
    FOR SELECT
    TO application_role
    USING (
        status = 'active'
        AND current_setting('app.tenant_id', true) IS NOT NULL
        AND current_setting('app.tenant_id', true) != ''
    );

-- ============================================================
-- tenant_subscriptions
-- ============================================================
ALTER TABLE tenant.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.tenant_subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_subscriptions_tenant_isolation ON tenant.tenant_subscriptions
    AS RESTRICTIVE
    FOR ALL
    TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- ============================================================
-- ADDITIONAL OPERATIONAL TABLES
-- ============================================================

-- nursery_batches
ALTER TABLE tenant.nursery_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.nursery_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY nursery_batches_tenant_isolation ON tenant.nursery_batches
    AS RESTRICTIVE FOR ALL TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- deliveries
ALTER TABLE tenant.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY deliveries_tenant_isolation ON tenant.deliveries
    AS RESTRICTIVE FOR ALL TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- customers
ALTER TABLE tenant.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.customers FORCE ROW LEVEL SECURITY;
CREATE POLICY customers_tenant_isolation ON tenant.customers
    AS RESTRICTIVE FOR ALL TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- livestock
ALTER TABLE tenant.livestock ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.livestock FORCE ROW LEVEL SECURITY;
CREATE POLICY livestock_tenant_isolation ON tenant.livestock
    AS RESTRICTIVE FOR ALL TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- hives
ALTER TABLE tenant.hives ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.hives FORCE ROW LEVEL SECURITY;
CREATE POLICY hives_tenant_isolation ON tenant.hives
    AS RESTRICTIVE FOR ALL TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- weather_log (TimescaleDB hypertable)
ALTER TABLE tenant.weather_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.weather_log FORCE ROW LEVEL SECURITY;
CREATE POLICY weather_log_tenant_isolation ON tenant.weather_log
    AS RESTRICTIVE FOR ALL TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);

-- budgets
ALTER TABLE tenant.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.budgets FORCE ROW LEVEL SECURITY;
CREATE POLICY budgets_tenant_isolation ON tenant.budgets
    AS RESTRICTIVE FOR ALL TO application_role
    USING (tenant_id = current_setting('app.tenant_id', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::UUID);
```

---

## 8. Shared vs Tenant Schema — Complete Table Inventory

### shared.* Schema (No tenant_id — Read-Only at Runtime)

| Table | Row Count (approx) | Description |
|-------|-------------------|-------------|
| `shared.productions` | 49 | Supported crop types: id, name, family, latin_name, days_to_maturity_min/max, category |
| `shared.production_stages` | ~250 | Growth stages per crop: production_id, stage_order, name, days_from_planting_start, days_from_planting_end |
| `shared.stage_protocols` | ~1,200 | Recommended tasks per stage: stage_id, protocol_type, description, chemical_id (nullable), input_category |
| `shared.production_thresholds` | ~350 | Min/max threshold values per crop per parameter: production_id, parameter_name, min_value, max_value, unit |
| `shared.rotation_rules` | ~200 | Crop family rotation compatibility matrix: from_family_id, to_family_id, allowed, wait_cycles, notes |
| `shared.actionable_rules` | 43 | Base automation rule templates: rule_code, name, description, condition_template_sql, severity, category |
| `shared.pest_library` | ~120 | Pest catalog: name, scientific_name, affected_crops, symptoms, management, photos |
| `shared.disease_library` | ~80 | Disease catalog: name, pathogen_type, affected_crops, symptoms, management, photos |
| `shared.weed_library` | ~60 | Weed catalog: name, family, identification, control_methods |
| `shared.chemical_library` | ~200 | Chemical products: name, active_ingredient, chemical_class, withholding_period_days, pre_harvest_interval, REI_hours, application_rate_min, application_rate_max, unit, target_pests |
| `shared.kb_articles` | ~300+ | Knowledge Base articles: title, content, category, production_id (nullable), embedding (vector), validated_by, validated_at |
| `shared.kb_stage_links` | ~500 | Links articles to stages: article_id, stage_id, relevance_score |
| `shared.family_policies` | ~30 | Hard rotation policies by crop family: family_id, min_break_cycles, notes |

### tenant.* Schema (tenant_id on every table — RLS enforced)

#### Farm Structure
| Table | Description |
|-------|-------------|
| `tenant.farms` | Farm records: id, tenant_id, farm_code, name, location, total_area_acres, gps_lat, gps_lng, established_date, owner_name, operator_name, status |
| `tenant.zones` | Zones within farms: id, tenant_id, farm_id, name, area_acres, soil_type, irrigation_type, notes |
| `tenant.production_units` | Individual planting beds/plots: id, tenant_id, farm_id, zone_id, pu_code, name, area_sqm, status, current_cycle_id |

#### Crop Lifecycle
| Table | Description |
|-------|-------------|
| `tenant.production_cycles` | Crop cycles: id, tenant_id, pu_id, production_id, cycle_code, planting_date, expected_harvest_date, actual_close_date, status, expected_yield_kg, actual_yield_kg, previous_production_id |
| `tenant.nursery_batches` | Nursery seed/seedling batches: id, tenant_id, farm_id, production_id, batch_code, start_date, transplant_date, qty_started, qty_transplanted, status |

#### Field Operations (TimescaleDB hypertables marked *)
| Table | Description |
|-------|-------------|
| `tenant.field_events` * | All field activity logs: id, tenant_id, pu_id, cycle_id, event_type, logged_at, worker_id, chemical_id (nullable), input_id (nullable), notes, photo_url |
| `tenant.harvest_log` * | Harvest records: id, tenant_id, pu_id, cycle_id, hrv_id, harvest_date, qty_kg, grade, unit_price_fjd, notes, logged_by, compliance_status |
| `tenant.labor_attendance` * | Worker attendance: id, tenant_id, farm_id, worker_id, work_date, hours_worked, task_type, pu_id (nullable), daily_rate_fjd, notes |
| `tenant.weather_log` * | Weather observations: id, tenant_id, zone_id, recorded_at, temp_c, rainfall_mm, humidity_pct, wind_kph, notes |

#### Financial (cash_ledger is TimescaleDB hypertable)
| Table | Description |
|-------|-------------|
| `tenant.income_log` | Income records: id, tenant_id, farm_id, customer_id, harvest_id (nullable), amount_fjd, income_type, transaction_date, invoice_number, payment_status |
| `tenant.cash_ledger` * | Cash transactions: id, tenant_id, farm_id, transaction_date, transaction_type, amount_fjd, direction (INFLOW/OUTFLOW), category, reference_id, notes |
| `tenant.budgets` | Budget plans: id, tenant_id, farm_id, cycle_id (nullable), period_start, period_end, category, budgeted_amount_fjd |
| `tenant.orders` | Purchase orders: id, tenant_id, farm_id, order_code, supplier_id, order_date, expected_delivery, status, total_amount_fjd, approved_by |
| `tenant.order_line_items` | PO line items: id, tenant_id, order_id, input_id, qty, unit_price_fjd, total_price_fjd |

#### Inventory
| Table | Description |
|-------|-------------|
| `tenant.inputs` | Input inventory: id, tenant_id, farm_id, input_code, name, category, unit, current_stock, reorder_threshold, unit_cost_fjd, supplier_id, is_chemical, chemical_library_id (nullable) |
| `tenant.input_transactions` | Stock movements: id, tenant_id, input_id, transaction_type (PURCHASE/USE/ADJUSTMENT), qty, transaction_date, reference_id, notes |

#### People and Assets
| Table | Description |
|-------|-------------|
| `tenant.workers` | Worker profiles: id, tenant_id, farm_id, worker_code, name, phone, role, employment_type, daily_rate_fjd, status, joined_date |
| `tenant.equipment` | Equipment: id, tenant_id, farm_id, equipment_code, name, type, purchase_date, last_service_date, next_service_date, status, notes |
| `tenant.customers` | Customer records: id, tenant_id, customer_code, name, phone, email, address, customer_type, payment_terms_days, outstanding_balance_fjd |
| `tenant.deliveries` | Delivery records: id, tenant_id, farm_id, customer_id, delivery_date, status, total_value_fjd, notes, shortage_flag |

#### Livestock and Apiary
| Table | Description |
|-------|-------------|
| `tenant.livestock` | Animal records: id, tenant_id, farm_id, animal_code, species, breed, sex, birth_date, status, notes |
| `tenant.livestock_events` | Animal health/management events: id, tenant_id, animal_id, event_type, event_date, notes, cost_fjd |
| `tenant.hives` | Beehives: id, tenant_id, farm_id, hive_code, location, queen_age_months, status, last_inspection_date |
| `tenant.hive_inspections` | Hive inspection records: id, tenant_id, hive_id, inspection_date, colony_strength, disease_signs, queen_present, notes |
| `tenant.honey_harvests` | Honey harvest records: id, tenant_id, hive_id, harvest_date, qty_kg, quality_grade, notes |

#### Intelligence and Automation
| Table | Description |
|-------|-------------|
| `tenant.alerts` | System alerts: id, tenant_id, farm_id, rule_id, alert_type, severity, title, body, target_type, target_id, alert_key, status, created_at, resolved_at, resolution_method, whatsapp_status |
| `tenant.task_queue` | Tasks: id, tenant_id, farm_id, alert_id (nullable), task_type, description, assigned_to, due_date, status, completed_at, completed_by |
| `tenant.automation_rules` | Tenant's active automation rules (seeded from shared.actionable_rules): id, tenant_id, rule_code, name, status, condition_sql, severity, auto_create_task, priority, farm_id (nullable for farm-specific rules) |
| `tenant.decision_signals` | Decision engine snapshots: id, tenant_id, farm_id, snapshot_date, signal_name, signal_score, signal_data_json, created_at |
| `tenant.automation_run_log` | Audit log of automation engine runs: id, tenant_id, run_at, rules_evaluated, alerts_created, alerts_resolved, tasks_created, duration_ms |

#### TIS (AI Layer)
| Table | Description |
|-------|-------------|
| `tenant.tis_conversations` | Conversation threads: id, tenant_id, user_id, farm_id, started_at, last_message_at, message_count |
| `tenant.tis_messages` | Individual messages: id, tenant_id, conversation_id, role (user/assistant), content, module_used, created_at |
| `tenant.tis_voice_logs` | Voice command logs: id, tenant_id, user_id, farm_id, audio_url, transcript, status, command_type, response_text, processing_time_ms, created_at |
| `tenant.ai_commands` | Executed AI commands: id, tenant_id, user_id, voice_log_id (nullable), command_type, intent_json, result_record_id, result_record_type, status, error_message, created_at |
| `tenant.ai_insights` | Stored AI-generated insights: id, tenant_id, farm_id, insight_type, title, body, signal_basis, valid_from, valid_until, created_at |

#### Community
| Table | Description |
|-------|-------------|
| `tenant.community_profiles` | Farm/tenant public profiles for community: id, tenant_id, display_name, bio, location, profile_photo_url, is_public |
| `tenant.marketplace_listings` | Produce/input listings: id, tenant_id, listing_type (SELL/BUY/SWAP), title, description, production_id, qty_available, unit, price_per_unit_fjd, currency, status, expires_at |
| `tenant.community_posts` | Community forum posts: id, tenant_id, author_user_id, title, body, category, photo_url, created_at, updated_at |
| `tenant.post_reactions` | Post reactions/likes: id, tenant_id, post_id, user_id, reaction_type |

#### Administration
| Table | Description |
|-------|-------------|
| `tenant.tenant_subscriptions` | Subscription records: id, tenant_id, tier, status, stripe_subscription_id, current_period_start, current_period_end, cancel_at_period_end |
| `tenant.sync_batches` | Offline sync batch tracking: id, tenant_id, user_id, submitted_at, status, total_operations, synced_count, failed_count, result_json |
| `tenant.price_master` | Farm-specific price reference: id, tenant_id, production_id, customer_id (nullable), price_per_kg_fjd, grade, effective_from, effective_to |

---

## 9. New Farm Onboarding — Complete Step-by-Step

This procedure creates a new tenant with one farm, zones, and production units. All steps use the admin role (bypasses RLS via superuser connection).

### Step 1 — Create Tenant Record

```sql
-- Using superuser connection (bypasses RLS)
INSERT INTO public.tenants (
    id,
    name,
    slug,
    contact_phone,
    contact_email,
    timezone,
    currency,
    subscription_tier,
    status,
    created_at
) VALUES (
    gen_random_uuid(),           -- tenant_id (store this UUID)
    'New Farm Name',
    'new-farm-name',             -- URL-safe slug
    '+679XXXXXXXX',
    'contact@example.com',
    'Pacific/Fiji',
    'FJD',
    'FREE',
    'active',
    NOW()
)
RETURNING id;
-- Store returned id as NEW_TENANT_ID
```

### Step 2 — Create Founder User

```sql
-- password_hash = bcrypt.hash('temporary_password', rounds=12)
INSERT INTO public.users (
    id,
    tenant_id,
    email,
    phone,
    full_name,
    role,
    password_hash,
    must_change_password,
    status,
    created_at
) VALUES (
    gen_random_uuid(),
    'NEW_TENANT_ID',
    'founder@example.com',
    '+679XXXXXXXX',
    'Founder Name',
    'FOUNDER',
    '$2b$12$...',                -- bcrypt hash
    true,                        -- force password change on first login
    'active',
    NOW()
);
```

**API equivalent** (used by admin panel):
```
POST /api/v1/admin/tenants
{
  "name": "New Farm Name",
  "contact_phone": "+679XXXXXXXX",
  "contact_email": "founder@example.com",
  "founder_name": "Founder Name",
  "timezone": "Pacific/Fiji"
}
```

### Step 3 — Create Initial Farm Record

```sql
-- Using admin connection with SET LOCAL app.tenant_id = 'NEW_TENANT_ID'
INSERT INTO tenant.farms (
    id,
    tenant_id,
    farm_code,
    name,
    location_description,
    province,
    island,
    total_area_acres,
    gps_lat,
    gps_lng,
    established_date,
    owner_name,
    operator_name,
    status,
    created_at
) VALUES (
    gen_random_uuid(),
    'NEW_TENANT_ID',
    'F001',
    'Farm Name',
    'Location, Province',
    'Province Name',
    'Viti Levu',
    0.0,                         -- update with actual area
    -18.0,                       -- update with actual GPS
    178.0,                       -- update with actual GPS
    CURRENT_DATE,
    'Owner Name',
    'Operator Name',
    'active',
    NOW()
);
```

### Step 4 — Seed Initial Zones

```sql
-- Example: two default zones
INSERT INTO tenant.zones (id, tenant_id, farm_id, name, area_acres, soil_type, irrigation_type, created_at)
VALUES
    (gen_random_uuid(), 'NEW_TENANT_ID', 'FARM_ID', 'Zone A', 0.0, 'Loam', 'Drip', NOW()),
    (gen_random_uuid(), 'NEW_TENANT_ID', 'FARM_ID', 'Zone B', 0.0, 'Clay Loam', 'Sprinkler', NOW());
```

**API equivalent:**
```
POST /api/v1/farms/{farm_id}/zones
Authorization: Bearer <admin_token>
{
  "name": "Zone A",
  "area_acres": 5.0,
  "soil_type": "Loam",
  "irrigation_type": "Drip"
}
```

### Step 5 — Seed Automation Rules from Shared Templates

```sql
-- Copy all active rule templates from shared schema into tenant's automation_rules
INSERT INTO tenant.automation_rules (
    id,
    tenant_id,
    rule_code,
    name,
    description,
    condition_sql,
    severity,
    category,
    auto_create_task,
    priority,
    status,
    farm_id,
    created_at
)
SELECT
    gen_random_uuid(),
    'NEW_TENANT_ID',
    ar.rule_code,
    ar.name,
    ar.description,
    ar.condition_template_sql,
    ar.severity,
    ar.category,
    ar.auto_create_task,
    ar.default_priority,
    'Active',
    NULL,                        -- farm_id NULL = applies to all tenant farms
    NOW()
FROM shared.actionable_rules ar
WHERE ar.is_default = true;
-- This seeds all 43 default automation rules for the new tenant
```

### Step 6 — Apply RLS Policies

RLS policies are defined at the table level, not per-tenant. No per-tenant SQL is required. The moment the tenant record and `tenant_id` exist, RLS automatically applies to all their data.

**Verification query** (run as application_role to confirm isolation):
```sql
-- Set tenant context to new tenant
SET LOCAL app.tenant_id = 'NEW_TENANT_ID';

-- Should return only this tenant's farm
SELECT id, name, farm_code FROM tenant.farms;

-- Should return empty (no other tenant's data visible)
SET LOCAL app.tenant_id = 'OTHER_TENANT_ID';
SELECT id, name FROM tenant.farms WHERE tenant_id = 'NEW_TENANT_ID';
-- Returns 0 rows — isolation confirmed
```

### Step 7 — Send Welcome WhatsApp Message

```python
# Triggered via Celery task after tenant creation
from app.tasks.notifications import send_whatsapp_alert

# Queue welcome message
send_whatsapp_alert.delay(
    phone="+679XXXXXXXX",
    template="welcome_new_tenant",
    variables={
        "farm_name": "New Farm Name",
        "login_url": "https://app.teivaka.com",
        "temp_password": "TEMP_PASSWORD"  # only sent in onboarding
    }
)
```

**WhatsApp welcome message template:**
```
Bula vinaka! Welcome to Teivaka Farm OS.

Your farm account has been created:
Farm: New Farm Name
Login: https://app.teivaka.com
Temp Password: [TEMP_PASSWORD]

Please change your password on first login.

Reply HELP for assistance.
— Teivaka Team
```

---

## 10. KB Propagation — How Shared Updates Reach All Tenants Immediately

The Knowledge Base (`shared.*` schema) is updated by Teivaka's agronomy team via admin-only API endpoints or direct DB access. Because all tenants read from the same `shared.*` schema tables, updates are immediately visible to all tenants without any per-tenant migration.

**Update flow:**
1. Teivaka agronomist updates `shared.kb_articles` (e.g., adds new pest management article)
2. Article is immediately queryable by `GET /api/v1/knowledge/articles` for all tenants
3. TIS Knowledge Broker RAG pipeline queries `shared.kb_articles` on every request — the new article is included in semantic search immediately
4. KB article Redis cache (`kb:article:{article_id}`) is invalidated using the article's ID as cache key
5. No per-tenant migration, deployment, or notification required

**Cache invalidation on KB update:**
```python
# In KB admin update handler:
async def update_kb_article(article_id: UUID, update_data: dict, db: AsyncSession, redis):
    # Update in DB
    await db.execute(
        text("UPDATE shared.kb_articles SET ... WHERE id = :id"),
        {"id": str(article_id), **update_data}
    )
    await db.commit()

    # Invalidate Redis cache for this article (all tenants share the same cache key)
    await redis.delete(f"kb:article:{article_id}")

    # Optionally invalidate embedding cache if content changed
    if "content" in update_data:
        await redis.delete(f"kb:embedding:{article_id}")
```

**Rotation rule updates (shared.rotation_rules):**
- Redis cache key: `rotation:rules:{family_id}` (TTL 3600s)
- On update: invalidate all affected family keys
- All tenants see new rotation rules immediately on next cycle creation (after cache expiry or explicit invalidation)

**Chemical library updates (shared.chemical_library):**
- Critical for withholding period compliance
- No Redis cache for chemical data (always queried fresh from DB for compliance checks)
- Updates take effect immediately for all future compliance checks

---

## 11. Tenant Isolation Guarantees

### Guarantee 1 — Database-Level Enforcement (Independent of Application Code)

RLS policies are enforced by the PostgreSQL query planner, not by the application. Even if a developer writes a query without a WHERE clause:

```python
# This bug in application code — missing tenant filter:
results = await db.execute(text("SELECT * FROM tenant.harvest_log"))
# Returns ONLY the current tenant's rows due to RLS policy
# Not all tenants' data
```

### Guarantee 2 — SET LOCAL Scope (No Cross-Request Leakage)

`SET LOCAL app.tenant_id` is scoped to the current PostgreSQL transaction. When the transaction commits or rolls back:
- The local setting is cleared
- The connection returns to the pool with no tenant_id set
- The next request that checks out this connection starts with no tenant context
- The RLS middleware sets the correct tenant_id before any query runs

```sql
-- Verify this behavior:
BEGIN;
SET LOCAL app.tenant_id = 'tenant-a';
SHOW app.tenant_id;  -- Returns 'tenant-a'
COMMIT;

SHOW app.tenant_id;  -- Returns '' (empty — cleared by COMMIT)
```

### Guarantee 3 — RESTRICTIVE Policy (Cannot Be Bypassed by Other Policies)

All RLS policies are created `AS RESTRICTIVE`. In PostgreSQL, when multiple policies apply to a table:
- PERMISSIVE policies are OR-combined (any one can grant access)
- RESTRICTIVE policies are AND-combined (all must pass)

Our tenant isolation policy is RESTRICTIVE. Even if a developer accidentally creates a permissive policy that opens more access, the restrictive tenant isolation policy still applies as an AND condition. Cross-tenant access is impossible unless the restrictive policy is explicitly dropped.

### Guarantee 4 — FORCE ROW LEVEL SECURITY (No Superuser Bypass)

`ALTER TABLE ... FORCE ROW LEVEL SECURITY` prevents even the table owner (superuser/admin PostgreSQL role) from bypassing RLS when connecting as `application_role`. The FastAPI application connects as `application_role` — this role has no `BYPASSRLS` privilege and no ability to disable RLS, ensuring production application connections always go through RLS.

Admin operations (migrations, seeding, onboarding) use a separate superuser connection that is never available to the FastAPI application process.

### Guarantee 5 — No Tenant_ID in URL Alone

The tenant_id in the URL or request body is never trusted directly. The authoritative tenant_id always comes from the JWT claim. Even if a malicious user sends a request with another tenant's `farm_id` in the URL:
1. Their JWT contains their own `tenant_id`
2. RLS filters all queries to their tenant
3. The other tenant's `farm_id` returns no rows (not a 403 — just no data, preventing tenant enumeration)

---

*End of MULTI_TENANCY.md*
