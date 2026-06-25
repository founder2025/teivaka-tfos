from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from app.db.session import get_rls_db, get_db_ctx
from app.middleware.rls import get_current_user
from pydantic import BaseModel
from typing import Optional
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# Subscription tier definitions — fallback/seed only; the live source of truth is
# community.subscription_plans (migrations 170–172). Prices mirror the ratified
# Hormozi monetization restructure (2026-06-25): Free / Farm Pro $19 / Farm
# Business $69. NO Enterprise on the farmer side (institutional Verified/
# Intelligence territory). Internal tier CODES kept stable (BASIC=Farm Pro,
# PROFESSIONAL=Farm Business) to avoid churning the tenant.subscription_tier
# PK/CHECK; only display `name` carries the brand label. TIS caps are per-MONTH
# in the spec; the live limiter still counts per-day until a dedicated slice.
TIER_DEFINITIONS = {
    "FREE": {
        "name": "Free",
        "description": "One farm · essentials · try the platform",
        "price_fjd_monthly": 0,
        "price_fjd_annual": 0,
        "tis_daily_limit": 5,
        "tis_monthly_limit": 50,
        "farms_limit": 1,
        "users_limit": 2,
        "badge": None,
        "is_active": True,
        "features": ["unlimited_records", "verification", "community", "marketplace", "classroom", "trust_score", "basic_tis", "basic_reports", "offline"],
    },
    "BASIC": {
        "name": "Farm Pro",
        "description": "Every serious farmer",
        "price_fjd_monthly": 19,
        "price_fjd_annual": 180,
        "tis_daily_limit": 50,
        "tis_monthly_limit": 500,
        "farms_limit": 5,
        "users_limit": 20,
        "badge": "Most popular",
        "is_active": True,
        "features": ["everything_in_free", "advanced_reports", "loan_readiness_pack", "buyer_matching", "inventory", "labour_management", "season_analytics"],
    },
    "PROFESSIONAL": {
        "name": "Farm Business",
        "description": "Commercial growers, managers, contractors",
        "price_fjd_monthly": 69,
        "price_fjd_annual": 690,
        "tis_daily_limit": 500,
        "tis_monthly_limit": 5000,
        "farms_limit": 25,
        "users_limit": 100,
        "badge": None,
        "is_active": True,
        "features": ["everything_in_pro", "forecasting", "cashflow_planning", "automation", "advanced_dashboards", "branded_reports", "priority_support", "advanced_verification"],
    },
    # Enterprise removed from the farmer side (kept inactive for back-compat with
    # any tenant still stamped ENTERPRISE; not offered as an upgrade target).
    "ENTERPRISE": {
        "name": "Enterprise (legacy)",
        "description": "Retired on the farmer side",
        "price_fjd_monthly": 299,
        "price_fjd_annual": None,
        "tis_daily_limit": 500,
        "tis_monthly_limit": 5000,
        "farms_limit": -1,
        "users_limit": -1,
        "badge": None,
        "is_active": False,
        "features": ["legacy"],
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
        _plans = await _load_plans_db(db) or TIER_DEFINITIONS
        tier_info = _plans.get(tier) or _plans.get("FREE") or TIER_DEFINITIONS["FREE"]

        return {"data": {
            **tenant_dict,
            "tier_info": tier_info,
            "tis_calls_remaining": max(0, tenant_dict["tis_daily_limit"] - (tenant_dict["tis_calls_today"] or 0)),
        }}

@router.get("/tiers")
async def list_tiers(user: dict = Depends(get_current_user)):
    """Return all available subscription tiers with pricing (DB source of truth)."""
    async with get_db_ctx() as db:
        plans = await get_active_plans(db)
    return {"data": plans}

@router.post("/upgrade")
async def request_upgrade(body: UpgradeRequest, user: dict = Depends(get_current_user)):
    """
    Request a subscription upgrade. Only FOUNDER can upgrade.
    For Stripe payments, returns a Stripe checkout URL.
    For manual payments (FijiPay, Bank Transfer), creates a pending upgrade request.
    """
    # Any account holder may REQUEST a tier change for their own tenant —
    # nothing is charged in-app; an admin approves and applies the change.

    async with get_db_ctx() as _pdb:
        _plans = await get_active_plans(_pdb)
    if body.target_tier not in _plans:
        raise HTTPException(status_code=400, detail=f"Invalid tier. Must be one of: {list(_plans.keys())}")

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
            _pl = await _load_plans_db(db) or TIER_DEFINITIONS
            tier_def = _pl.get(row[2], {})
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


# ════════════════════════════════════════════════════════════════════════════
# Admin-editable monetization (Migration 170): plans + discount codes.
# Prices/limits/features live in community.subscription_plans (editable from
# Admin Settings, no deploy). TIER_DEFINITIONS above is now only the seed/
# fallback for a DB that hasn't been migrated yet.
# ════════════════════════════════════════════════════════════════════════════
import json as _json
from datetime import datetime as _dt


async def _load_plans_db(db):
    """community.subscription_plans → dict keyed by tier, shaped like
    TIER_DEFINITIONS. None if the table is absent/empty (caller falls back)."""
    has = (await db.execute(text(
        "SELECT to_regclass('community.subscription_plans') IS NOT NULL"))).scalar()
    if not has:
        return None
    cols = (await db.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema='community' AND table_name='subscription_plans'"))).scalars().all()
    colset = set(cols)
    has_monthly = "tis_monthly_limit" in colset
    has_desc = "description" in colset
    monthly_sel = "tis_monthly_limit, " if has_monthly else ""
    desc_sel = "description, " if has_desc else ""
    rows = (await db.execute(text(
        f"SELECT tier, name, {desc_sel}price_fjd_monthly, price_fjd_annual, tis_daily_limit, {monthly_sel}"
        "farms_limit, users_limit, features, badge, sort_order, is_active "
        "FROM community.subscription_plans ORDER BY sort_order, tier"))).mappings().all()
    if not rows:
        return None
    out = {}
    for r in rows:
        feats = r["features"]
        if isinstance(feats, str):
            try: feats = _json.loads(feats)
            except Exception: feats = []
        out[r["tier"]] = {
            "name": r["name"],
            "description": (r["description"] if has_desc else None),
            "price_fjd_monthly": float(r["price_fjd_monthly"] or 0),
            "price_fjd_annual": (float(r["price_fjd_annual"]) if r["price_fjd_annual"] is not None else None),
            "tis_daily_limit": r["tis_daily_limit"],
            "tis_monthly_limit": (r["tis_monthly_limit"] if has_monthly else None),
            "farms_limit": r["farms_limit"],
            "users_limit": r["users_limit"],
            "features": feats or [],
            "badge": r["badge"],
            "sort_order": r["sort_order"],
            "is_active": r["is_active"],
        }
    return out


async def get_active_plans(db):
    """Active plans for display/validation; DB source of truth, dict fallback."""
    plans = await _load_plans_db(db)
    src = plans or TIER_DEFINITIONS
    return {k: v for k, v in src.items() if v.get("is_active", True)}


class PlanUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price_fjd_monthly: Optional[float] = None
    price_fjd_annual: Optional[float] = None
    tis_daily_limit: Optional[int] = None
    tis_monthly_limit: Optional[int] = None
    farms_limit: Optional[int] = None
    users_limit: Optional[int] = None
    features: Optional[list] = None
    badge: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


@router.get("/admin/plans")
async def admin_list_plans(user: dict = Depends(get_current_user)):
    """All plans incl. inactive — drives the Admin Settings pricing editor."""
    if user.get("role") not in _TIER_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        plans = await _load_plans_db(db)
    return {"data": plans or TIER_DEFINITIONS}


@router.put("/admin/plans/{tier}")
async def admin_upsert_plan(tier: str, body: PlanUpdate, user: dict = Depends(get_current_user)):
    """Create/edit a plan's price, limits, features, badge, ordering, active."""
    if user.get("role") not in _TIER_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin only")
    tier = tier.upper()
    fields = {k: v for k, v in body.dict().items() if v is not None}
    async with get_db_ctx() as db:
        exists = (await db.execute(text(
            "SELECT 1 FROM community.subscription_plans WHERE tier = :t"), {"t": tier})).scalar()
        if not exists:
            await db.execute(text(
                "INSERT INTO community.subscription_plans (tier, name) VALUES (:t, :n)"),
                {"t": tier, "n": fields.get("name", tier.title())})
        if fields:
            sets, params = [], {"t": tier, "by": str(user["user_id"])}
            for k, v in fields.items():
                if k == "features":
                    sets.append("features = cast(:features AS jsonb)")
                    params["features"] = _json.dumps(v)
                else:
                    sets.append(f"{k} = :{k}")
                    params[k] = v
            sets.append("updated_at = now()")
            sets.append("updated_by = cast(:by AS uuid)")
            await db.execute(text(
                f"UPDATE community.subscription_plans SET {', '.join(sets)} WHERE tier = :t"), params)
        await db.commit()
    return {"data": {"tier": tier, "updated": True}}


# ── Discount codes ───────────────────────────────────────────────────────────
class DiscountBody(BaseModel):
    code: Optional[str] = None
    kind: str = "PERCENT"          # PERCENT | FLAT
    value: float = 0
    applies_to: Optional[list] = None   # tier codes; empty/None = all
    max_uses: Optional[int] = None
    starts_at: Optional[str] = None
    expires_at: Optional[str] = None
    is_active: bool = True
    note: Optional[str] = None


async def _discounts_table(db) -> bool:
    return bool((await db.execute(text(
        "SELECT to_regclass('community.discount_codes') IS NOT NULL"))).scalar())


@router.get("/admin/discounts")
async def admin_list_discounts(user: dict = Depends(get_current_user)):
    if user.get("role") not in _TIER_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        if not await _discounts_table(db):
            return {"data": []}
        rows = (await db.execute(text(
            "SELECT code, kind, value, applies_to, max_uses, used_count, starts_at, "
            "expires_at, is_active, note, created_at FROM community.discount_codes "
            "ORDER BY created_at DESC"))).mappings().all()
    return {"data": [dict(r) for r in rows]}


@router.post("/admin/discounts")
async def admin_create_discount(body: DiscountBody, user: dict = Depends(get_current_user)):
    if user.get("role") not in _TIER_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin only")
    if not body.code or not body.code.strip():
        raise HTTPException(status_code=400, detail="Code is required")
    if body.kind not in ("PERCENT", "FLAT"):
        raise HTTPException(status_code=400, detail="kind must be PERCENT or FLAT")
    code = body.code.strip().upper()
    async with get_db_ctx() as db:
        await db.execute(text("""
            INSERT INTO community.discount_codes
                (code, kind, value, applies_to, max_uses, starts_at, expires_at, is_active, note, created_by)
            VALUES
                (:code, :kind, :value, :applies_to, :max_uses,
                 cast(:starts_at AS timestamptz), cast(:expires_at AS timestamptz),
                 :is_active, :note, cast(:by AS uuid))
            ON CONFLICT (code) DO UPDATE SET
                kind = EXCLUDED.kind, value = EXCLUDED.value, applies_to = EXCLUDED.applies_to,
                max_uses = EXCLUDED.max_uses, starts_at = EXCLUDED.starts_at,
                expires_at = EXCLUDED.expires_at, is_active = EXCLUDED.is_active, note = EXCLUDED.note
        """), {
            "code": code, "kind": body.kind, "value": body.value,
            "applies_to": body.applies_to or [], "max_uses": body.max_uses,
            "starts_at": body.starts_at or None, "expires_at": body.expires_at or None,
            "is_active": body.is_active, "note": body.note, "by": str(user["user_id"]),
        })
        await db.commit()
    return {"data": {"code": code, "saved": True}}


@router.delete("/admin/discounts/{code}")
async def admin_delete_discount(code: str, user: dict = Depends(get_current_user)):
    if user.get("role") not in _TIER_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        await db.execute(text("DELETE FROM community.discount_codes WHERE code = :c"),
                         {"c": code.strip().upper()})
        await db.commit()
    return {"data": {"code": code.strip().upper(), "deleted": True}}


class ValidateBody(BaseModel):
    code: str
    tier: str
    billing_period: str = "MONTHLY"


@router.post("/discounts/validate")
async def validate_discount(body: ValidateBody, user: dict = Depends(get_current_user)):
    """Validate a code against a tier and return the discounted price. Read-only
    (does not consume a use — that happens on a confirmed upgrade)."""
    code = (body.code or "").strip().upper()
    tier = (body.tier or "").upper()
    if not code:
        return {"data": {"valid": False, "reason": "Enter a code"}}
    async with get_db_ctx() as db:
        plans = await get_active_plans(db)
        if not await _discounts_table(db):
            return {"data": {"valid": False, "reason": "No discount programme is active"}}
        row = (await db.execute(text(
            "SELECT code, kind, value, applies_to, max_uses, used_count, starts_at, expires_at, is_active "
            "FROM community.discount_codes WHERE code = :c"), {"c": code})).mappings().first()
    plan = plans.get(tier)
    if not plan:
        return {"data": {"valid": False, "reason": "Unknown plan"}}
    if not row or not row["is_active"]:
        return {"data": {"valid": False, "reason": "Invalid code"}}
    now = _dt.utcnow()
    if row["starts_at"] and row["starts_at"].replace(tzinfo=None) > now:
        return {"data": {"valid": False, "reason": "Code not active yet"}}
    if row["expires_at"] and row["expires_at"].replace(tzinfo=None) < now:
        return {"data": {"valid": False, "reason": "Code expired"}}
    if row["max_uses"] is not None and (row["used_count"] or 0) >= row["max_uses"]:
        return {"data": {"valid": False, "reason": "Code fully redeemed"}}
    if row["applies_to"] and tier not in row["applies_to"]:
        return {"data": {"valid": False, "reason": "Code does not apply to this plan"}}
    annual = body.billing_period.upper() == "ANNUAL"
    base = plan.get("price_fjd_annual") if annual else plan.get("price_fjd_monthly")
    base = float(base or 0)
    if row["kind"] == "PERCENT":
        amount = round(base * float(row["value"]) / 100.0, 2)
    else:
        amount = min(base, float(row["value"]))
    return {"data": {
        "valid": True, "code": code, "kind": row["kind"], "value": float(row["value"]),
        "base_price": base, "discount_amount": amount,
        "final_price": round(max(0.0, base - amount), 2),
        "billing_period": "ANNUAL" if annual else "MONTHLY",
    }}


# ════════════════════════════════════════════════════════════════════════════
# Product catalog (Migration 172): institutional + other revenue lines —
# Sponsored Farmers, Verified, Intelligence, Market Access, Compliance, Academy,
# Advertising. Admin-editable catalog/config; billing + institution accounts are
# NOT wired yet (no checkout) — this is the sales/management surface.
# ════════════════════════════════════════════════════════════════════════════
async def _products_table(db) -> bool:
    return bool((await db.execute(text(
        "SELECT to_regclass('community.product_catalog') IS NOT NULL"))).scalar())


def _product_row(r):
    return {
        "id": r["id"], "product": r["product"], "name": r["name"],
        "audience": r["audience"],
        "price_fjd_monthly": (float(r["price_fjd_monthly"]) if r["price_fjd_monthly"] is not None else None),
        "price_fjd_annual": (float(r["price_fjd_annual"]) if r["price_fjd_annual"] is not None else None),
        "price_note": r["price_note"],
        "features": (r["features"] if not isinstance(r["features"], str) else _json.loads(r["features"] or "[]")),
        "sort_order": r["sort_order"], "is_active": r["is_active"],
    }


@router.get("/products")
async def list_products(user: dict = Depends(get_current_user)):
    """Active product catalog, grouped by product family (for the institutions
    / 'sell sheet' surface). DB source of truth; empty list if not migrated."""
    async with get_db_ctx() as db:
        if not await _products_table(db):
            return {"data": {}}
        rows = (await db.execute(text(
            "SELECT * FROM community.product_catalog WHERE is_active = true "
            "ORDER BY sort_order, id"))).mappings().all()
    grouped: dict = {}
    for r in rows:
        grouped.setdefault(r["product"], []).append(_product_row(r))
    return {"data": grouped}


@router.get("/admin/products")
async def admin_list_products(user: dict = Depends(get_current_user)):
    if user.get("role") not in _TIER_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        if not await _products_table(db):
            return {"data": []}
        rows = (await db.execute(text(
            "SELECT * FROM community.product_catalog ORDER BY sort_order, id"))).mappings().all()
    return {"data": [_product_row(r) for r in rows]}


class ProductUpdate(BaseModel):
    product: Optional[str] = None
    name: Optional[str] = None
    audience: Optional[str] = None
    price_fjd_monthly: Optional[float] = None
    price_fjd_annual: Optional[float] = None
    price_note: Optional[str] = None
    features: Optional[list] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


@router.put("/admin/products/{product_id}")
async def admin_upsert_product(product_id: str, body: ProductUpdate, user: dict = Depends(get_current_user)):
    """Create/edit a catalog product's price, audience, features, ordering, active."""
    if user.get("role") not in _TIER_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin only")
    pid = product_id.strip().upper()
    fields = {k: v for k, v in body.dict().items() if v is not None}
    async with get_db_ctx() as db:
        exists = (await db.execute(text(
            "SELECT 1 FROM community.product_catalog WHERE id = :i"), {"i": pid})).scalar()
        if not exists:
            await db.execute(text(
                "INSERT INTO community.product_catalog (id, product, name) VALUES (:i, :p, :n)"),
                {"i": pid, "p": fields.get("product", "CUSTOM"), "n": fields.get("name", pid.title())})
        if fields:
            sets, params = [], {"i": pid, "by": str(user["user_id"])}
            for k, v in fields.items():
                if k == "features":
                    sets.append("features = cast(:features AS jsonb)")
                    params["features"] = _json.dumps(v)
                else:
                    sets.append(f"{k} = :{k}")
                    params[k] = v
            sets.append("updated_at = now()")
            sets.append("updated_by = cast(:by AS uuid)")
            await db.execute(text(
                f"UPDATE community.product_catalog SET {', '.join(sets)} WHERE id = :i"), params)
        await db.commit()
    return {"data": {"id": pid, "updated": True}}
