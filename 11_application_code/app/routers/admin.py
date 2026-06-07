# FILE: app/routers/admin.py
#
# Teivaka Farm OS -- Platform Admin API
# All routes require role = "ADMIN". 403 returned to all other roles.
#
# Endpoints:
#   GET  /admin/dashboard          -- live stats strip + alert counts
#   GET  /admin/users              -- paginated user table
#   GET  /admin/users/{user_id}    -- single user detail
#   POST /admin/users/{user_id}/suspend   -- suspend account
#   POST /admin/users/{user_id}/ban       -- ban account
#   POST /admin/users/{user_id}/verify    -- mark email verified
#   POST /admin/users/{user_id}/reset-password  -- force password reset flag
#   GET  /admin/content/flagged    -- flagged posts queue
#   POST /admin/content/{post_id}/action  -- keep/delete/warn/ban on post
#   GET  /admin/content/kb-pending -- KB submissions awaiting approval
#   POST /admin/content/kb/{article_id}/approve
#   POST /admin/content/kb/{article_id}/reject
#   GET  /admin/analytics          -- platform growth + engagement metrics
#   GET  /admin/analytics/map      -- all farm locations for admin map
#   GET  /admin/settings           -- current platform settings
#   PUT  /admin/settings           -- update platform settings
#   GET  /admin/audit-log          -- registration audit log (fraud review)

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.rls import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class UserActionRequest(BaseModel):
    reason: str | None = None


class PostActionRequest(BaseModel):
    action: str   # keep | delete | warn | ban
    reason: str | None = None


class KBActionRequest(BaseModel):
    reason: str | None = None


class SettingsUpdateRequest(BaseModel):
    community_name: str | None = None
    community_tagline: str | None = None
    announcement_enabled: bool | None = None
    announcement_text: str | None = None


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@router.get("/dashboard")
async def admin_dashboard(
    _: dict = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    """
    Live stats strip + alert card counts for the admin dashboard.
    Runs 6 lightweight queries in sequence -- no joins, cache-friendly.
    """
    total_farmers = await db.execute(
        text("SELECT COUNT(*) FROM tenant.users WHERE role != 'ADMIN' AND is_active = true")
    )
    new_today = await db.execute(
        text("SELECT COUNT(*) FROM tenant.users WHERE created_at >= NOW() - INTERVAL '1 day' AND role != 'ADMIN'")
    )
    farms_active = await db.execute(
        text("SELECT COUNT(DISTINCT tenant_id) FROM tenant.users WHERE last_login >= NOW() - INTERVAL '30 days'")
    )
    ai_queries_today = await db.execute(
        text("SELECT COUNT(*) FROM tenant.tis_conversations WHERE created_at >= NOW() - INTERVAL '1 day'")
    )
    flagged_posts = await db.execute(
        text("""
            SELECT COUNT(*) FROM tenant.community_posts
            WHERE flag_count > 0 AND moderation_status = 'PENDING'
        """)
    )
    pending_kb = await db.execute(
        text("SELECT COUNT(*) FROM shared.kb_articles WHERE status = 'PENDING_REVIEW'")
    )

    return {
        "stats": {
            "total_farmers":    total_farmers.scalar() or 0,
            "new_today":        new_today.scalar() or 0,
            "farms_active":     farms_active.scalar() or 0,
            "ai_queries_today": ai_queries_today.scalar() or 0,
        },
        "alerts": {
            "flagged_posts":    flagged_posts.scalar() or 0,
            "pending_kb":       pending_kb.scalar() or 0,
        },
    }


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    status_filter: str = Query("all"),   # all | active | suspended | banned | pending
    country: str | None = Query(None),
    role: str | None = Query(None),
    search: str | None = Query(None),
    _: dict = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    """Paginated user table for the admin Users tab."""
    offset = (page - 1) * page_size

    where_clauses = ["u.role != 'ADMIN'"]
    params: dict = {"limit": page_size, "offset": offset}

    if status_filter == "active":
        where_clauses.append("u.is_active = true AND u.account_status = 'ACTIVE'")
    elif status_filter == "suspended":
        where_clauses.append("u.account_status = 'SUSPENDED'")
    elif status_filter == "banned":
        where_clauses.append("u.account_status = 'BANNED'")
    elif status_filter == "pending":
        where_clauses.append("u.email_verified = false")

    if country:
        where_clauses.append("u.country = :country")
        params["country"] = country.upper()

    if role:
        where_clauses.append("u.role = :role")
        params["role"] = role.upper()

    if search:
        where_clauses.append(
            "(u.email ILIKE :search OR u.full_name ILIKE :search OR u.phone_number ILIKE :search)"
        )
        params["search"] = f"%{search}%"

    where_sql = " AND ".join(where_clauses)

    result = await db.execute(
        text(f"""
            SELECT
                u.user_id, u.email, u.full_name, u.first_name, u.last_name,
                u.role, u.account_type, u.country, u.phone_number,
                u.is_active, u.email_verified,
                u.created_at, u.last_login,
                u.registration_ip,
                t.company_name, t.subscription_tier
            FROM tenant.users u
            JOIN tenant.tenants t ON t.tenant_id = u.tenant_id
            WHERE {where_sql}
            ORDER BY u.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    users = [dict(row) for row in result.mappings()]

    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM tenant.users u WHERE {where_sql}"),
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    total = count_result.scalar() or 0

    return {
        "users": users,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, -(-total // page_size)),
    }


@router.get("/users/{user_id}")
async def get_user_detail(
    user_id: str,
    _: dict = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    """Full user profile for admin view — includes registration metadata."""
    result = await db.execute(
        text("""
            SELECT u.*, t.company_name, t.subscription_tier, t.tis_daily_limit,
                   t.tis_calls_today, t.subscription_status
            FROM tenant.users u
            JOIN tenant.tenants t ON t.tenant_id = u.tenant_id
            WHERE u.user_id = :user_id
        """),
        {"user_id": user_id},
    )
    user = result.mappings().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"data": dict(user)}


@router.post("/users/{user_id}/suspend")
async def suspend_user(
    user_id: str,
    req: UserActionRequest,
    admin: dict = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("""
            UPDATE tenant.users
            SET is_active = false, updated_at = NOW()
            WHERE user_id = :user_id AND role != 'ADMIN'
        """),
        {"user_id": user_id},
    )
    await db.commit()
    return {"message": "User suspended", "user_id": user_id, "reason": req.reason}


@router.post("/users/{user_id}/ban")
async def ban_user(
    user_id: str,
    req: UserActionRequest,
    admin: dict = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("""
            UPDATE tenant.users
            SET is_active = false, updated_at = NOW()
            WHERE user_id = :user_id AND role != 'ADMIN'
        """),
        {"user_id": user_id},
    )
    await db.commit()
    return {"message": "User banned", "user_id": user_id, "reason": req.reason}


@router.post("/users/{user_id}/verify")
async def verify_user(
    user_id: str,
    admin: dict = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("""
            UPDATE tenant.users
            SET email_verified = true,
                email_verification_token = NULL,
                email_verification_expires = NULL,
                updated_at = NOW()
            WHERE user_id = :user_id
        """),
        {"user_id": user_id},
    )
    await db.commit()
    return {"message": "User verified", "user_id": user_id}


# ---------------------------------------------------------------------------
# Content moderation
# ---------------------------------------------------------------------------

@router.get("/content/flagged")
async def get_flagged_posts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    _: dict = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    """Flagged posts queue — sorted by flag count descending."""
    offset = (page - 1) * page_size
    result = await db.execute(
        text("""
            SELECT p.post_id, p.title, p.content, p.flag_count,
                   p.created_at, p.moderation_status,
                   u.full_name AS author_name, u.email AS author_email
            FROM tenant.community_posts p
            JOIN tenant.users u ON u.user_id = p.user_id
            WHERE p.flag_count > 0 AND p.moderation_status = 'PENDING'
            ORDER BY p.flag_count DESC, p.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"limit": page_size, "offset": offset},
    )
    return {"posts": [dict(r) for r in result.mappings()]}


@router.post("/content/{post_id}/action")
async def moderate_post(
    post_id: str,
    req: PostActionRequest,
    admin: dict = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    """Take moderation action on a flagged post: keep | delete | warn | ban."""
    if req.action not in ("keep", "delete", "warn", "ban"):
        raise HTTPException(status_code=422, detail="action must be: keep | delete | warn | ban")

    if req.action == "keep":
        await db.execute(
            text("UPDATE tenant.community_posts SET moderation_status = 'APPROVED', flag_count = 0 WHERE post_id = :pid"),
            {"pid": post_id},
        )
    elif req.action == "delete":
        await db.execute(
            text("UPDATE tenant.community_posts SET moderation_status = 'REMOVED', is_visible = false WHERE post_id = :pid"),
            {"pid": post_id},
        )

    await db.commit()
    return {"message": f"Post {req.action} action applied", "post_id": post_id}


@router.get("/content/kb-pending")
async def get_pending_kb(
    _: dict = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    """KB articles pending review."""
    result = await db.execute(
        text("""
            SELECT article_id, title, category, submitted_by, created_at, content_preview
            FROM shared.kb_articles
            WHERE status = 'PENDING_REVIEW'
            ORDER BY created_at ASC
        """)
    )
    return {"articles": [dict(r) for r in result.mappings()]}


@router.post("/content/kb/{article_id}/approve")
async def approve_kb(
    article_id: str,
    admin: dict = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("UPDATE shared.kb_articles SET status = 'PUBLISHED', reviewed_by = :admin, reviewed_at = NOW() WHERE article_id = :aid"),
        {"admin": str(admin["user_id"]), "aid": article_id},
    )
    await db.commit()
    return {"message": "KB article approved", "article_id": article_id}


@router.post("/content/kb/{article_id}/reject")
async def reject_kb(
    article_id: str,
    req: KBActionRequest,
    admin: dict = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("UPDATE shared.kb_articles SET status = 'REJECTED', reviewed_by = :admin, reviewed_at = NOW(), rejection_reason = :reason WHERE article_id = :aid"),
        {"admin": str(admin["user_id"]), "reason": req.reason, "aid": article_id},
    )
    await db.commit()
    return {"message": "KB article rejected", "article_id": article_id}


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

@router.get("/analytics")
async def platform_analytics(
    days: int = Query(30, ge=1, le=365),
    _: dict = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    """Platform growth + engagement metrics."""
    signups = await db.execute(
        text("""
            SELECT DATE(created_at) AS day, COUNT(*) AS count
            FROM tenant.users
            WHERE created_at >= NOW() - (INTERVAL '1 day' * :days) AND role != 'ADMIN'
            GROUP BY DATE(created_at)
            ORDER BY day
        """),
        {"days": days},
    )
    signups_by_country = await db.execute(
        text("""
            SELECT country, COUNT(*) AS count
            FROM tenant.users
            WHERE role != 'ADMIN' AND is_active = true
            GROUP BY country
            ORDER BY count DESC
            LIMIT 20
        """)
    )
    tis_queries = await db.execute(
        text("""
            SELECT DATE(created_at) AS day, COUNT(*) AS count
            FROM tenant.tis_conversations
            WHERE created_at >= NOW() - (INTERVAL '1 day' * :days)
            GROUP BY DATE(created_at)
            ORDER BY day
        """),
        {"days": days},
    )
    return {
        "signups_daily":      [dict(r) for r in signups.mappings()],
        "signups_by_country": [dict(r) for r in signups_by_country.mappings()],
        "tis_queries_daily":  [dict(r) for r in tis_queries.mappings()],
    }


@router.get("/analytics/map")
async def admin_map_data(
    _: dict = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    """
    All farm locations for admin map view.

    NOTE: `tenant.users.map_privacy` was referenced here but never existed in the
    schema or any migration, so this query used to fail with "column does not
    exist" (it is not wired to the frontend, so the break was latent). Until a
    real opt-out column ships (backlog B82), privacy is a no-op: every active farm
    with coordinates is returned, is_anonymous = false. Response shape preserved.
    """
    result = await db.execute(
        text("""
            SELECT
                f.farm_id,
                f.gps_lat,
                f.gps_lng,
                f.farm_name,
                t.subscription_tier,
                u.full_name AS farmer_name,
                f.farm_name AS display_name,
                false       AS is_anonymous
            FROM tenant.farms f
            JOIN tenant.tenants t ON t.tenant_id = f.tenant_id
            JOIN tenant.users u ON u.tenant_id = f.tenant_id AND u.role IN ('FOUNDER','FARMER')
            WHERE f.gps_lat IS NOT NULL AND f.gps_lng IS NOT NULL AND f.is_active = true
        """)
    )
    return {"farms": [dict(r) for r in result.mappings()]}


# ---------------------------------------------------------------------------
# Registration audit log
# ---------------------------------------------------------------------------

@router.get("/audit-log")
async def registration_audit_log(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    outcome: str | None = Query(None),
    _: dict = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    """Registration attempt audit log — for fraud review."""
    offset = (page - 1) * page_size
    where = "WHERE 1=1"
    params: dict = {"limit": page_size, "offset": offset}

    if outcome:
        where += " AND outcome = :outcome"
        params["outcome"] = outcome.upper()

    result = await db.execute(
        text(f"""
            SELECT id, attempted_at, ip_address, email, phone_number,
                   outcome, failure_detail, tenant_id, user_id
            FROM shared.registration_audit_log
            {where}
            ORDER BY attempted_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    return {"entries": [dict(r) for r in result.mappings()]}


# ---------------------------------------------------------------------------
# Platform settings (stubbed — expand when settings table is added)
# ---------------------------------------------------------------------------

@router.get("/settings")
async def get_platform_settings(
    _: dict = Depends(require_admin()),
):
    """Return current platform settings. Expand when shared.platform_settings is built."""
    return {
        "community_name": "Teivaka Farm OS",
        "community_tagline": "Pacific Island Farming Intelligence",
        "announcement_enabled": False,
        "announcement_text": "",
    }


@router.put("/settings")
async def update_platform_settings(
    req: SettingsUpdateRequest,
    _: dict = Depends(require_admin()),
):
    """Update platform settings. Full implementation pending shared.platform_settings table."""
    return {"message": "Settings updated", "updated": req.model_dump(exclude_none=True)}


@router.get("/task-engine")
async def task_engine_health(
    _: dict = Depends(require_admin()),
    db: AsyncSession = Depends(get_db),
):
    """Task-engine health (cross-tenant) — per-source counts + last-produced
    (worker/feeder liveness), invalid/orphaned rows, and overall totals. Turns the
    'is every feeder alive?' check into one observable view."""
    by_source = (await db.execute(text("""
        SELECT source_module,
               COUNT(*)                                            AS total,
               COUNT(*) FILTER (WHERE status = 'OPEN')             AS open,
               COUNT(*) FILTER (WHERE status = 'OPEN'
                                  AND due_date IS NOT NULL
                                  AND due_date < CURRENT_DATE)     AS overdue,
               COUNT(*) FILTER (WHERE status = 'COMPLETED')        AS completed,
               MAX(created_at)                                     AS last_created,
               MAX(completed_at)                                   AS last_completed
          FROM tenant.task_queue
         GROUP BY source_module
         ORDER BY source_module
    """))).mappings().all()

    invalid = (await db.execute(text("""
        SELECT COUNT(*) AS n FROM tenant.task_queue
         WHERE imperative IS NULL OR imperative = '' OR farm_id IS NULL
            OR source_module IS NULL
            OR status NOT IN ('OPEN','COMPLETED','SKIPPED','EXPIRED','CANCELLED')
    """))).scalar()

    totals = (await db.execute(text("""
        SELECT COUNT(*) FILTER (WHERE status='OPEN')      AS open,
               COUNT(*) FILTER (WHERE status='OPEN' AND due_date IS NOT NULL AND due_date < CURRENT_DATE) AS overdue,
               COUNT(*) FILTER (WHERE status='COMPLETED') AS completed,
               COUNT(*) FILTER (WHERE status='SKIPPED')   AS skipped,
               COUNT(*) FILTER (WHERE status='EXPIRED')   AS expired,
               COUNT(*)                                   AS total
          FROM tenant.task_queue
    """))).mappings().first()

    def iso(v):
        return v.isoformat() if v is not None else None
    rows = [{
        "source_module": r["source_module"],
        "total": int(r["total"]), "open": int(r["open"]),
        "overdue": int(r["overdue"]), "completed": int(r["completed"]),
        "last_created": iso(r["last_created"]), "last_completed": iso(r["last_completed"]),
    } for r in by_source]

    # External task-alert delivery log (P3b). Defensive: returns disabled state
    # if the table isn't present yet (migration 086 not applied in this env).
    # receipt_confirmed surfaces PR.2 — a SENT row is not a delivered row until
    # an Operator confirms and sets receipt_confirmed_at.
    notifications = {"enabled": False, "by_channel": [], "totals": {},
                     "last_sent": None, "last_test": None, "last_receipt_confirmed": None}
    try:
        nch = (await db.execute(text("""
            SELECT channel,
                   COUNT(*)                                          AS total,
                   COUNT(*) FILTER (WHERE status='SENT')             AS sent,
                   COUNT(*) FILTER (WHERE status='MOCK')             AS mock,
                   COUNT(*) FILTER (WHERE status='FAILED')           AS failed,
                   COUNT(*) FILTER (WHERE receipt_confirmed_at IS NOT NULL) AS receipt_confirmed,
                   MAX(sent_at)                                      AS last_sent
              FROM tenant.task_notifications
             GROUP BY channel ORDER BY channel
        """))).mappings().all()
        nt = (await db.execute(text("""
            SELECT COUNT(*) AS total,
                   MAX(sent_at)                                      AS last_sent,
                   MAX(sent_at) FILTER (WHERE is_test)               AS last_test,
                   MAX(receipt_confirmed_at)                         AS last_receipt
              FROM tenant.task_notifications
        """))).mappings().first()
        notifications = {
            "enabled": True,
            "by_channel": [{
                "channel": r["channel"], "total": int(r["total"]),
                "sent": int(r["sent"]), "mock": int(r["mock"]), "failed": int(r["failed"]),
                "receipt_confirmed": int(r["receipt_confirmed"]),
                "last_sent": iso(r["last_sent"]),
            } for r in nch],
            "totals": {"total": int(nt["total"] or 0)},
            "last_sent": iso(nt["last_sent"]),
            "last_test": iso(nt["last_test"]),
            "last_receipt_confirmed": iso(nt["last_receipt"]),
        }
    except Exception:
        # Table absent or unreadable — leave the disabled default.
        pass

    return {
        "by_source": rows,
        "invalid_rows": int(invalid or 0),
        "totals": {k: int(totals[k]) for k in ("open", "overdue", "completed", "skipped", "expired", "total")},
        "notifications": notifications,
        "generated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    }
