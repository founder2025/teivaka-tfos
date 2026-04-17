from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from app.db.session import get_rls_db
from app.middleware.rls import get_current_user
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

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
    if user["role"] != "FOUNDER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only FOUNDER can upgrade subscription")

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
                raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")
        else:
            # Log manual upgrade request
            import uuid
            request_id = f"UPG-{uuid.uuid4().hex[:6].upper()}"
            await db.execute(text("""
                INSERT INTO tenant.upgrade_requests
                    (request_id, tenant_id, current_tier, target_tier, billing_period,
                     payment_method, status, notes, created_by)
                VALUES
                    (:request_id, :tenant_id, :current_tier, :target_tier, :billing_period,
                     :payment_method, 'PENDING', :notes, :created_by)
            """), {
                "request_id": request_id,
                "tenant_id": str(user["tenant_id"]),
                "current_tier": current_tier,
                "target_tier": body.target_tier,
                "billing_period": body.billing_period,
                "payment_method": body.payment_method or "MANUAL",
                "notes": body.notes,
                "created_by": str(user["user_id"]),
            })
            return {"data": {
                "request_id": request_id,
                "status": "PENDING",
                "message": f"Upgrade request to {body.target_tier} submitted. Teivaka team will contact you within 24 hours to complete payment.",
                "payment_method": body.payment_method or "MANUAL",
            }}
