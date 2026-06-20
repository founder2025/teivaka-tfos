from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from app.db.session import get_rls_db, get_db_ctx
from app.middleware.rls import get_current_user
from pydantic import BaseModel
from typing import Optional
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# Subscription tier definitions (aligned with TFOS pricing model)
TIER_DEFINITIONS = {
    "FREE": {
        "name": "Free",
        "price_fjd_monthly": 0,
        "tis_daily_limit": 5,
        "farms_limit": 1,
        "users_limit": 2,
        "features": ["basic_tracking", "tis_chat", "weather_log"],
    },
    "BASIC": {
        "name": "Basic",
        "price_fjd_monthly": 49,
        "tis_daily_limit": 25,
        "farms_limit": 2,
        "users_limit": 5,
        "features": ["basic_tracking", "tis_chat", "weather_log", "community_listings", "financials", "rotation_planner"],
    },
    "PROFESSIONAL": {
        "name": "Professional",
        "price_fjd_monthly": 149,
        "tis_daily_limit": 100,
        "farms_limit": 10,
        "users_limit": 20,
        "features": ["all_basic", "voice_query", "livestock", "apiculture", "profit_share", "nursery", "exports", "decision_engine"],
    },
    "ENTERPRISE": {
        "name": "Enterprise",
        "price_fjd_monthly": 399,
        "tis_daily_limit": 500,
        "farms_limit": -1,  # unlimited
        "users_limit": -1,
        "features": ["all_professional", "custom_reports", "api_access", "dedicated_support", "multi_island"],
    },
}

class UpgradeRequest(BaseModel):
    target_tier: str
    billing_period: str = "MONTHLY"  # MONTHLY, ANNUAL
    payment_method: Optional[str] = None  # STRIPE, FIJI_PAY, BANK_TRANSFER
    notes: Optional[str] = None

@router.get("/current")
async def get_current_subscription(user: dict = Depends(get_current_user)):
    """Return current tenant subscription details including limits and usage."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        result = await db.execute(text("""
            SELECT t.tenant_id, t.subscription_tier, t.subscription_status,
                   t.subscription_start_date, t.subscription_end_date,
                   t.tis_daily_limit, t.tis_calls_today, t.tis_calls_reset_at,
                   t.stripe_customer_id, t.stripe_subscription_id,
                   COUNT(DISTINCT f.farm_id) AS farms_count,
                   COUNT(DISTINCT u.user_id) AS users_count
            FROM tenant.tenants t
            LEFT JOIN tenant.farms f ON f.tenant_id = t.tenant_id AND f.is_active = true
            LEFT JOIN tenant.users u ON u.tenant_id = t.tenant_id AND u.is_active = true
            WHERE t.tenant_id = :tid
            GROUP BY t.tenant_id
        """), {"tid": str(user["tenant_id"])})
        tenant = result.mappings().first()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")

        tenant_dict = dict(tenant)
        tier = tenant_dict.get("subscription_tier", "FREE")
        tier_info = TIER_DEFINITIONS.get(tier, TIER_DEFINITIONS["FREE"])

        return {"data": {
            **tenant_dict,
            "tier_info": tier_info,
            "tis_calls_remaining": max(0, tenant_dict["tis_daily_limit"] - (tenant_dict["tis_calls_today"] or 0)),
        }}

@router.get("/tiers")
async def list_tiers(user: dict = Depends(get_current_user)):
    """Return all available subscription tiers with pricing."""
    return {"data": TIER_DEFINITIONS}

@router.post("/upgrade")
async def request_upgrade(body: UpgradeRequest, user: dict = Depends(get_current_user)):
    """
    Request a subscription upgrade. Only FOUNDER can upgrade.
    For Stripe payments, returns a Stripe checkout URL.
    For manual payments (FijiPay, Bank Transfer), creates a pending upgrade request.
    """
    # Any account holder may REQUEST a tier change for their own tenant —
    # nothing is charged in-app; an admin approves and applies the change.

    if body.target_tier not in TIER_DEFINITIONS:
        raise HTTPException(status_code=400, detail=f"Invalid tier. Must be one of: {list(TIER_DEFINITIONS.keys())}")

    async with get_rls_db(str(user["tenant_id"])) as db:
        current = await db.execute(
            text("SELECT subscription_tier FROM tenant.tenants WHERE tenant_id = :tid"),
            {"tid": str(user["tenant_id"])}
        )
        current_tier = current.mappings().first()["subscription_tier"]
        if current_tier == body.target_tier:
            raise HTTPException(status_code=400, detail="Already on this subscription tier")

        if body.payment_method == "STRIPE":
            # Return Stripe checkout URL
            try:
                import stripe
                from app.config import settings
                stripe.api_key = settings.stripe_secret_key
                # Map tier to Stripe price ID (configure in settings)
                price_id = getattr(settings, f"stripe_price_{body.target_tier.lower()}", None)
                if not price_id:
                    raise HTTPException(status_code=400, detail="Stripe price not configured for this tier")
                session = stripe.checkout.Session.create(
                    mode="subscription",
                    line_items=[{"price": price_id, "quantity": 1}],
                    success_url=f"{settings.frontend_url}/settings/subscription?success=true",
                    cancel_url=f"{settings.frontend_url}/settings/subscription?cancelled=true",
                    metadata={"tenant_id": str(user["tenant_id"]), "target_tier": body.target_tier},
                )
                return {"data": {"checkout_url": session.url, "payment_method": "STRIPE"}}
            except Exception as e:
                logger.error("Stripe checkout session creation failed: %s", e)
                raise HTTPException(status_code=502, detail="Payment provider error. Please try again.")
        else:
            # Log manual upgrade request
            import uuid
            request_id = f"UPG-{uuid.uuid4().hex[:6].upper()}"
            async with get_db_ctx() as cdb:
                pending = (await cdb.execute(text(
                    "SELECT 1 FROM community.tier_change_requests WHERE user_id = cast(:uid AS uuid) AND status = 'PENDING'"),
                    {"uid": str(user["user_id"])})).scalar()
                if pending:
                    raise HTTPException(status_code=409, detail="You already have a tier change request under review")
                await cdb.execute(text("""
                    INSERT INTO community.tier_change_requests
                        (request_id, tenant_id, user_id, current_tier, target_tier, billing_period, payment_method, notes)
                    VALUES
                        (:request_id, cast(:tenant_id AS uuid), cast(:uid AS uuid), :current_tier, :target_tier, :billing_period, :payment_method, :notes)
                """), {
                    "request_id": request_id,
                    "tenant_id": str(user["tenant_id"]),
                    "uid": str(user["user_id"]),
                    "current_tier": current_tier,
                    "target_tier": body.target_tier,
                    "billing_period": body.billing_period,
                    "payment_method": body.payment_method or "MPAISA_MANUAL",
                    "notes": body.notes,
                })
                await cdb.commit()
            return {"data": {
                "request_id": request_id,
                "status": "PENDING",
                "message": f"Tier change request to {body.target_tier} submitted. The Teivaka team will contact you to arrange payment — nothing is charged in-app.",
                "payment_method": body.payment_method or "MPAISA_MANUAL",
            }}


_TIER_ADMIN_ROLES = {"ADMIN", "FOUNDER"}


@router.get("/requests/mine")
async def my_tier_request(user: dict = Depends(get_current_user)):
    """The caller's latest tier change request — drives the picker's
    'requested' state. Migration-tolerant: missing table = no request."""
    async with get_db_ctx() as db:
        has = (await db.execute(text(
            "SELECT to_regclass('community.tier_change_requests') IS NOT NULL"))).scalar()
        if not has:
            return {"data": None}
        row = (await db.execute(text(
            "SELECT request_id, target_tier, status, reason, created_at FROM community.tier_change_requests "
            "WHERE user_id = cast(:uid AS uuid) ORDER BY created_at DESC LIMIT 1"),
            {"uid": str(user["user_id"])})).mappings().first()
        return {"data": dict(row) if row else None}


@router.get("/admin/requests")
async def admin_tier_requests(status_filter: str = "PENDING", user: dict = Depends(get_current_user)):
    if user.get("role") not in _TIER_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        rows = (await db.execute(text(
            "SELECT r.*, u.full_name, u.email FROM community.tier_change_requests r "
            "JOIN tenant.users u ON u.user_id = r.user_id "
            "WHERE r.status = :st ORDER BY r.created_at"),
            {"st": status_filter.upper()})).mappings().all()
        return {"data": [dict(x) for x in rows]}


class TierDecision(BaseModel):
    reason: Optional[str] = ""


@router.post("/admin/requests/{request_id}/approve")
async def approve_tier_request(request_id: str, user: dict = Depends(get_current_user)):
    """Approve = the REAL tier change: sets tenant.tenants.subscription_tier.
    Use after payment is confirmed out-of-band (M-PAiSA receipt etc.)."""
    if user.get("role") not in _TIER_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        row = (await db.execute(text(
            "UPDATE community.tier_change_requests SET status = 'APPROVED', decided_at = now(), decided_by = cast(:by AS uuid) "
            "WHERE request_id = :rid AND status = 'PENDING' RETURNING tenant_id, user_id, target_tier"),
            {"rid": request_id, "by": str(user["user_id"])})).first()
        if not row:
            raise HTTPException(status_code=404, detail="Request not found or already decided")
        res = await db.execute(text(
            "UPDATE tenant.tenants SET subscription_tier = :tier WHERE tenant_id = cast(:tid AS uuid)"),
            {"tier": row[2], "tid": str(row[0])})
        if res.rowcount == 0:
            # surface loudly rather than report a tier change that didn't apply
            raise HTTPException(status_code=500, detail="Request approved but tenant tier update was blocked — apply manually via psql and investigate RLS on tenant.tenants")
        # affiliate commission accrual — best-effort, never blocks the tier change
        try:
            from app.routers.affiliate import accrue_commission_for_tier_change
            tier_def = TIER_DEFINITIONS.get(row[2], {})
            await accrue_commission_for_tier_change(
                db, referee_user_id=str(row[1]), tier=row[2],
                revenue_fjd=float(tier_def.get("price_fjd_monthly") or 0))
        except Exception:  # noqa: BLE001
            pass
        try:
            await db.execute(text(
                "INSERT INTO community.feed_notifications (user_id, actor_user_id, type, body) "
                "VALUES (cast(:uid AS uuid), cast(:actor AS uuid), 'TIER_CHANGED', :msg)"),
                {"uid": str(row[1]), "actor": str(user["user_id"]),
                 "msg": f"Your plan is now {row[2]} — thank you for backing Teivaka."})
        except Exception:  # noqa: BLE001 — best-effort notification
            pass
        await db.commit()
    return {"data": {"request_id": request_id, "status": "APPROVED", "new_tier": row[2]}}


@router.post("/admin/requests/{request_id}/reject")
async def reject_tier_request(request_id: str, body: TierDecision = None, user: dict = Depends(get_current_user)):
    if user.get("role") not in _TIER_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        row = (await db.execute(text(
            "UPDATE community.tier_change_requests SET status = 'REJECTED', reason = :why, decided_at = now(), decided_by = cast(:by AS uuid) "
            "WHERE request_id = :rid AND status = 'PENDING' RETURNING user_id"),
            {"rid": request_id, "why": (body.reason if body else "") or "", "by": str(user["user_id"])})).first()
        if not row:
            raise HTTPException(status_code=404, detail="Request not found or already decided")
        await db.commit()
    return {"data": {"request_id": request_id, "status": "REJECTED"}}
