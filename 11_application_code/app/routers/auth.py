# FILE: app/routers/auth.py
# Teivaka Farm OS -- Authentication Router
#
# POST /login      -- email + password -> JWT access + refresh tokens
# POST /register   -- full registration with fraud guard + privacy acceptance
# GET  /me         -- current user profile
# POST /refresh    -- exchange refresh token for new access token
# POST /logout     -- stateless logout (client discards token)

from __future__ import annotations

import hashlib
import logging
import random
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.account_types import derive_role, normalize_account_type
from app.core.capabilities import compute_capabilities
from app.core.otp import mask_email, request_otp, verify_otp
from app.core.verification_routing import dispatch_verification, resolve_channel
from app.db.session import get_db
from app.middleware.rls import get_current_user, get_tenant_db
from app.utils.email import send_otp_email, send_password_reset_email, send_verification_email
from app.utils.referral import generate_referral_code
from app.utils.sms import send_otp_sms
from app.utils.fraud_guard import (
    CURRENT_PRIVACY_POLICY_VERSION,
    FraudOutcome,
    audit_log,
    run_all_checks,
)

logger = logging.getLogger("teivaka.auth")

# In-memory per-email rate limit for resend-verification.
# Deliberately light: a short cooldown to stop accidental double-clicks, plus a
# high hourly ceiling that only a genuine abuser would reach. A real user who
# didn't get the email must never be wall-blocked. Process-local; resets on
# restart — swap for Redis later.
_RESEND_LIMIT_PER_HOUR = 20
_RESEND_MIN_INTERVAL_SECONDS = 15
_resend_history: dict[str, list[datetime]] = {}

# Same pattern for forgot-password — 3 reset requests per email per hour.
_RESET_LIMIT_PER_HOUR = 3
_reset_history: dict[str, list[datetime]] = {}

# Phone OTP send rate limit — 1 send per 60 seconds per phone.
_OTP_MIN_INTERVAL_SECONDS = 60
_otp_last_sent: dict[str, datetime] = {}

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def _make_access_token(user_id: str, tenant_id: str, role: str, tier: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(
        minutes=settings.jwt_access_token_expire_minutes
    )
    return jwt.encode(
        {"sub": user_id, "tenant_id": tenant_id, "role": role, "tier": tier,
         "exp": exp, "type": "access"},
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )


def _make_refresh_token(user_id: str, tenant_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(
        days=settings.jwt_refresh_token_expire_days
    )
    return jwt.encode(
        {"sub": user_id, "tenant_id": tenant_id, "exp": exp, "type": "refresh"},
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )


# ---------------------------------------------------------------------------
# Request Schemas
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    # Optional: a normal email/password signup supplies this; a Google signup
    # leaves it null and the server generates one after verifying the Google
    # token (the email is then trusted as already-verified).
    password: str | None = None
    google_credential: str | None = None
    phone_number: str | None = None
    whatsapp_number: str | None = None
    date_of_birth: date
    account_type: str = "PRIMARY_PRODUCER"
    country: str = "FJ"
    privacy_accepted: bool
    privacy_policy_version: str = CURRENT_PRIVACY_POLICY_VERSION
    referral_source: str | None = None
    referral_code: str | None = None
    anonymous_id: str | None = None
    # Individual vs Company gateway (capture-only; no heavy KYC at signup).
    is_company: bool = False
    business_name: str | None = None
    operator_name: str | None = None
    region_id: str | None = None
    preferred_verify_channel: str | None = None  # whatsapp | sms | email (CFO-routed)

    @field_validator("first_name", "last_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) < 2:
            raise ValueError("Name must be at least 2 characters")
        return v

    @field_validator("account_type")
    @classmethod
    def valid_account_type(cls, v: str) -> str:
        # 12-tier ecosystem taxonomy; legacy 8-value inputs are up-converted.
        return normalize_account_type(v)

    @field_validator("country")
    @classmethod
    def valid_country(cls, v: str) -> str:
        return v.upper().strip()[:2]

    @field_validator("referral_source")
    @classmethod
    def cap_referral(cls, v: str | None) -> str | None:
        return v[:200] if v else None


class GoogleAuthRequest(BaseModel):
    """The ID-token (JWT 'credential') returned by Google Identity Services."""
    credential: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class SendPhoneOtpRequest(BaseModel):
    phone_number: str


class VerifyPhoneOtpRequest(BaseModel):
    phone_number: str
    code: str

    @field_validator("code")
    @classmethod
    def code_format(cls, v: str) -> str:
        v = v.strip()
        if not v.isdigit() or len(v) != 6:
            raise ValueError("Code must be exactly 6 digits")
        return v


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number")
        return v


def _gen_random_password() -> str:
    """A strong random password for Google-created accounts (the user signs in
    with Google, never with this). Satisfies the fraud-guard complexity rules:
    length >= 8 plus upper/lower/digit/symbol."""
    return secrets.token_urlsafe(24) + "Aa1!"


async def _verify_google_credential(credential: str) -> dict:
    """Verify a Google Identity Services ID token server-side and return the
    trusted claims. Validates the signature/expiry (via Google's tokeninfo
    endpoint), the audience (our OAuth client id), the issuer, and that the
    email is Google-verified. Raises HTTPException on any failure."""
    if not (settings.google_client_id or "").strip():
        raise HTTPException(status_code=503, detail="Google sign-in is not configured.")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": credential},
            )
    except Exception as e:  # noqa: BLE001 — network failure reaching Google
        logger.warning("Google tokeninfo call failed: %s", e)
        raise HTTPException(status_code=502, detail="Couldn't reach Google to verify sign-in. Please try again.") from e

    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Invalid Google sign-in. Please try again.")
    claims = resp.json()

    if claims.get("aud") != settings.google_client_id.strip():
        raise HTTPException(status_code=401, detail="This Google sign-in was issued for a different app.")
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(status_code=401, detail="Untrusted Google token issuer.")
    if str(claims.get("email_verified")).lower() not in ("true", "1"):
        raise HTTPException(status_code=401, detail="Your Google email address is not verified.")
    email = (claims.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=400, detail="Google didn't return an email address.")
    return {
        "email": email,
        "given_name": (claims.get("given_name") or "").strip(),
        "family_name": (claims.get("family_name") or "").strip(),
        "name": (claims.get("name") or "").strip(),
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """Login with email + password. Returns access token (24h) + refresh token (30d)."""
    # Login is a pre-auth, cross-tenant lookup (the tenant is unknown until we
    # find the user). tenant.users has FORCE RLS; on a pooled connection left
    # polluted with some other tenant's app.tenant_id, this SELECT would return
    # NO ROW for a valid user and the handler would wrongly answer "Invalid
    # credentials". Clear the RLS context (transaction-local) so the policy's
    # empty-context branch admits the row regardless of pool state.
    await db.execute(text("SELECT set_config('app.tenant_id', '', true)"))
    result = await db.execute(
        text("""
            SELECT u.user_id, u.tenant_id, u.email, u.full_name,
                   u.first_name, u.last_name, u.role, u.password_hash,
                   u.email_verified, u.account_type,
                   t.subscription_tier, t.tis_daily_limit
            FROM tenant.users u
            JOIN tenant.tenants t ON t.tenant_id = u.tenant_id
            WHERE u.email = :email AND u.is_active = true
        """),
        {"email": form_data.username.lower().strip()}
    )
    user = result.mappings().first()

    if not user or not pwd_context.verify(form_data.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    await db.execute(
        text("UPDATE tenant.users SET last_login = NOW() WHERE user_id = :uid"),
        {"uid": str(user["user_id"])}
    )
    await db.commit()

    uid = str(user["user_id"])
    tid = str(user["tenant_id"])
    role = user["role"]
    tier = user["subscription_tier"]

    return {
        "access_token": _make_access_token(uid, tid, role, tier),
        "refresh_token": _make_refresh_token(uid, tid),
        "token_type": "bearer",
        "role": role,
        "tier": tier,
        "tis_daily_limit": user["tis_daily_limit"],
        "display_name": (
            f"{user['first_name']} {user['last_name']}"
            if user.get("first_name") and user.get("last_name")
            else user["full_name"]
        ),
        "email_unverified": not bool(user.get("email_verified", False)),
        "capabilities": compute_capabilities(
            {"role": role, "tier": tier, "email_verified": user.get("email_verified"),
             "account_type": user.get("account_type")}
        ),
    }


@router.post("/google")
async def google_auth(req: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """
    Google sign-in / sign-up entry point.

    Verifies the Google ID token, then:
      • existing account  -> logs the user in (returns tokens, existing=true)
      • new email         -> returns the verified email + name so the signup
                             wizard can collect profession etc., then finish via
                             POST /register with google_credential.
    """
    g = await _verify_google_credential(req.credential)
    # Same pre-auth cross-tenant lookup as /login — clear any polluted RLS
    # context (transaction-local) so a valid user is never hidden by FORCE RLS.
    await db.execute(text("SELECT set_config('app.tenant_id', '', true)"))
    result = await db.execute(
        text("""
            SELECT u.user_id, u.tenant_id, u.email, u.full_name,
                   u.first_name, u.last_name, u.role,
                   t.subscription_tier, t.tis_daily_limit
            FROM tenant.users u
            JOIN tenant.tenants t ON t.tenant_id = u.tenant_id
            WHERE u.email = :email AND u.is_active = true
        """),
        {"email": g["email"]},
    )
    user = result.mappings().first()

    if not user:
        # No account yet — let the wizard continue with the verified identity.
        return {
            "existing": False,
            "email": g["email"],
            "first_name": g["given_name"],
            "last_name": g["family_name"],
        }

    # Existing account — log in (mark the email verified now that Google vouches).
    await db.execute(
        text("UPDATE tenant.users SET last_login = NOW(), email_verified = true WHERE user_id = :uid"),
        {"uid": str(user["user_id"])},
    )
    await db.commit()

    uid = str(user["user_id"])
    tid = str(user["tenant_id"])
    role = user["role"]
    tier = user["subscription_tier"]
    return {
        "existing": True,
        "access_token": _make_access_token(uid, tid, role, tier),
        "refresh_token": _make_refresh_token(uid, tid),
        "token_type": "bearer",
        "role": role,
        "tier": tier,
        "tis_daily_limit": user["tis_daily_limit"],
        "display_name": (
            f"{user['first_name']} {user['last_name']}"
            if user.get("first_name") and user.get("last_name")
            else user["full_name"]
        ),
        "email": g["email"],
        "email_unverified": False,
        "capabilities": compute_capabilities(
            {"role": role, "tier": tier, "email_verified": True, "account_type": None}
        ),
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    req: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new Teivaka account.

    7-layer fraud guard runs before any DB write.
    Creates tenant (FREE, 5 TIS/day) + user atomically.
    All attempts (success and failure) logged to shared.registration_audit_log.

    Google signups (google_credential present) skip the password — the server
    verifies the Google token, trusts its email as already-verified, and
    generates a random password the user never uses.
    """
    is_google = False
    if req.google_credential:
        ginfo = await _verify_google_credential(req.google_credential)
        req.email = ginfo["email"]                 # authoritative, Google-verified
        req.password = _gen_random_password()      # user signs in with Google, not this
        is_google = True
    elif not (req.password or "").strip():
        raise HTTPException(status_code=422, detail="Password is required.")

    email = req.email.lower().strip()
    phone_raw = (req.phone_number or "").strip().replace(" ", "").replace("-", "")
    phone = phone_raw if phone_raw else None

    # Fraud/validation gates. HTTPExceptions (gate rejections) pass through to the
    # client; any OTHER exception here (e.g. a shared.* write failing on a missing
    # GRANT) must NOT collapse to the generic global handler — surface the reason.
    try:
        ip_address, user_agent = await run_all_checks(
            request=request,
            db=db,
            privacy_accepted=req.privacy_accepted,
            password=req.password,
            date_of_birth=req.date_of_birth,
            email=email,
            phone_number=phone,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Registration pre-check failed for %s: %s", email, e, exc_info=True)
        try:
            await db.rollback()
        except Exception:  # noqa: BLE001
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Something went wrong starting your registration — please try again.",
        ) from e

    # Cross-tenant duplicate-email check — clear any polluted RLS context first
    # (transaction-local) so an existing account is never hidden by FORCE RLS.
    await db.execute(text("SELECT set_config('app.tenant_id', '', true)"))
    dup_email = await db.execute(
        text("SELECT 1 FROM tenant.users WHERE email = :email LIMIT 1"),
        {"email": email}
    )
    if dup_email.scalar():
        await audit_log(
            db, ip_address=ip_address, user_agent=user_agent,
            email=email, phone_number=phone,
            outcome="FAILED_DUPLICATE_EMAIL",
            failure_detail="Email already registered"
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )

    if phone:
        dup_phone = await db.execute(
            text("SELECT 1 FROM tenant.users WHERE phone_number = :phone LIMIT 1"),
            {"phone": phone}
        )
        if dup_phone.scalar():
            await audit_log(
                db, ip_address=ip_address, user_agent=user_agent,
                email=email, phone_number=phone,
                outcome="FAILED_DUPLICATE_PHONE",
                failure_detail="Phone number already registered"
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this phone number already exists.",
            )

    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    full_name = f"{req.first_name.strip()} {req.last_name.strip()}"
    company_name = f"{full_name}'s Farm"
    password_hash = pwd_context.hash(req.password)
    whatsapp_raw = (req.whatsapp_number or phone or "").strip()
    whatsapp_number = whatsapp_raw if whatsapp_raw else None
    privacy_accepted_at = datetime.now(timezone.utc)
    role = derive_role(req.account_type)
    verify_channel = resolve_channel(req.account_type, req.preferred_verify_channel)
    verification_token = secrets.token_urlsafe(32)
    verification_expires = datetime.now(timezone.utc) + timedelta(hours=24)
    referral_code = await generate_referral_code(db)

    # Look up referrer by their referral_code (case-insensitive). Bad/unknown
    # codes are silently ignored — never block signup on attribution.
    referred_by_user_id: str | None = None
    if req.referral_code:
        referrer_row = (await db.execute(
            text("SELECT user_id FROM tenant.users WHERE referral_code = :rc"),
            {"rc": req.referral_code.strip().upper()},
        )).first()
        if referrer_row:
            referred_by_user_id = str(referrer_row[0])

    # Free trials removed (migration 114) — new users are full members, no
    # trial window. trial_started_at / trial_ends_at are left NULL.
    try:
        await db.execute(
            text("""
                INSERT INTO tenant.tenants (
                    tenant_id, company_name, subscription_tier, tis_daily_limit,
                    country, is_active, created_at, updated_at
                ) VALUES (
                    :tenant_id, :company_name, 'BASIC', 20,
                    :country, true, NOW(), NOW()
                )
            """),
            {"tenant_id": tenant_id, "company_name": company_name, "country": req.country}
        )

        # Bind the RLS context to THIS new tenant BEFORE the tenant.users INSERT.
        # tenant.users has FORCE RLS; its policy only admits the row when
        # app.tenant_id is unset/empty OR equals the row's tenant_id. On a pooled
        # connection polluted with another tenant's app.tenant_id, the INSERT would
        # violate the WITH CHECK and the account would be silently discarded
        # ("new row violates row-level security policy for table users"). Set it
        # unconditionally, here, for ALL account types. true = transaction-local
        # (auto-reverts at commit; no pool pollution) — mirrors get_tenant_db.
        await db.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"),
            {"tid": tenant_id},
        )

        await db.execute(
            text("""
                INSERT INTO tenant.users (
                    user_id, tenant_id, email, full_name,
                    first_name, last_name, password_hash, role,
                    phone_number, whatsapp_number,
                    date_of_birth, account_type, country,
                    is_company, region_id, preferred_verify_channel,
                    business_name, operator_name,
                    privacy_accepted_at, privacy_policy_version,
                    registration_ip, registration_user_agent,
                    email_verified, email_verification_token,
                    email_verification_expires,
                    is_active,
                    referral_code, referred_by_user_id, referral_source,
                    created_at, updated_at
                ) VALUES (
                    :user_id, :tenant_id, :email, :full_name,
                    :first_name, :last_name, :password_hash, :role,
                    :phone_number, :whatsapp_number,
                    :date_of_birth, :account_type, :country,
                    :is_company, (SELECT region_id FROM shared.geo_regions WHERE region_id = :region_id), :preferred_verify_channel,
                    :business_name, :operator_name,
                    :privacy_accepted_at, :privacy_policy_version,
                    :reg_ip, :reg_ua,
                    :email_verified, :verification_token,
                    :verification_expires,
                    true,
                    :referral_code, :referred_by_user_id, :referral_source,
                    NOW(), NOW()
                )
            """),
            {
                "user_id": user_id,
                "tenant_id": tenant_id,
                "email": email,
                "full_name": full_name,
                "first_name": req.first_name.strip(),
                "last_name": req.last_name.strip(),
                "password_hash": password_hash,
                "role": role,
                "phone_number": phone,
                "whatsapp_number": whatsapp_number,
                "date_of_birth": req.date_of_birth,
                "account_type": req.account_type,
                "country": req.country,
                "is_company": req.is_company,
                "region_id": req.region_id,
                "preferred_verify_channel": verify_channel,
                "business_name": req.business_name if req.is_company else None,
                "operator_name": req.operator_name if req.is_company else None,
                "privacy_accepted_at": privacy_accepted_at,
                "privacy_policy_version": req.privacy_policy_version,
                "reg_ip": ip_address,
                "reg_ua": user_agent,
                "email_verified": is_google,
                "verification_token": verification_token,
                "verification_expires": verification_expires,
                "referral_code": referral_code,
                "referred_by_user_id": referred_by_user_id,
                "referral_source": req.referral_source,
            }
        )

        # Company / Agribusiness Entity accounts get a business_entities child row
        # (Master-Child). RLS is FORCED on this table, so set the tenant context
        # for this just-created tenant before the WITH CHECK insert. Best-effort.
        if req.is_company and (req.business_name or "").strip():
            # SAVEPOINT-isolated: a failure here must not poison the parent
            # transaction (which already holds the tenant + user). app.tenant_id is
            # already bound to this tenant above. Best-effort.
            try:
                async with db.begin_nested():
                    await db.execute(
                        text("""
                            INSERT INTO tenant.business_entities
                                (tenant_id, user_id, business_name, operator_name, account_type, region_id)
                            VALUES (CAST(:tid AS uuid), CAST(:uid AS uuid), :bn, :op, :at, (SELECT region_id FROM shared.geo_regions WHERE region_id = :rid))
                        """),
                        {
                            "tid": tenant_id, "uid": user_id,
                            "bn": req.business_name.strip(),
                            "op": (req.operator_name or "").strip() or None,
                            "at": req.account_type,
                            "rid": req.region_id,
                        },
                    )
            except Exception as e:
                logger.warning("business_entity insert failed during signup (ignored): %s", e)

        # Attribution: log SIGNUP and backfill prior LANDING_VIEW events for
        # this anonymous_id. Best-effort — do not block signup on failure.
        try:
            async with db.begin_nested():
                await db.execute(
                    text("""
                        INSERT INTO shared.attribution_events
                            (event_type, user_id, anonymous_id, source, properties)
                        VALUES
                            ('SIGNUP', CAST(:user_id AS uuid), :anon, :source,
                             CAST(:props AS jsonb))
                    """),
                    {
                        "user_id": user_id,
                        "anon": req.anonymous_id,
                        "source": req.referral_source,
                        "props": __import__("json").dumps(
                            {"referral_code": req.referral_code} if req.referral_code else {}
                        ),
                    },
                )
                if req.anonymous_id:
                    await db.execute(
                        text("""
                            UPDATE shared.attribution_events
                               SET user_id = CAST(:user_id AS uuid)
                             WHERE anonymous_id = :anon AND user_id IS NULL
                        """),
                        {"user_id": user_id, "anon": req.anonymous_id},
                    )
        except Exception as e:
            logger.warning("Attribution write failed during signup (ignored): %s", e)

        # SAVEPOINT-isolated best-effort audit row — a failure must not poison the
        # parent transaction holding the committed tenant + user.
        try:
            async with db.begin_nested():
                await audit_log(
                    db, ip_address=ip_address, user_agent=user_agent,
                    email=email, phone_number=phone,
                    outcome="SUCCESS",
                    tenant_id=tenant_id, user_id=user_id,
                )
        except Exception as e:
            logger.warning("Signup audit_log failed (ignored): %s", e)
        # Phase I1 — signup telemetry (best-effort, account_type only — no PII)
        try:
            from app.core.analytics import track
            await track(db, pillar="auth", event_type="signup",
                        user={"user_id": user_id, "tenant_id": tenant_id},
                        entity_type="user", entity_id=user_id, region=country,
                        props={"account_type": req.account_type})
        except Exception:  # noqa: BLE001
            pass
        await db.commit()

        # Primary verification = email OTP code (Redis-backed, 6-digit). The link
        # path (/verify-email via verification_token, still stored above) remains a
        # fallback for any already-issued links and if a code can't be issued.
        # WhatsApp/SMS OTP are wired in otp.py but not provisioned (creds empty),
        # so email is the only live channel — never break signup on a send failure.
        # Google accounts are already verified by Google — nothing to dispatch.
        if not is_google:
            try:
                res = await request_otp(email, purpose="email_verify")
                if res.get("ok"):
                    send_otp_email(email, res["code"], full_name)
                else:
                    dispatch_verification(
                        verify_channel, email=email, phone=phone,
                        token=verification_token, name=full_name, logger=logger, uid=user_id,
                    )
            except Exception as e:  # noqa: BLE001 — verification send must never break signup
                logger.warning("Email OTP issue failed for %s (link fallback): %s", email, e)
                dispatch_verification(
                    verify_channel, email=email, phone=phone,
                    token=verification_token, name=full_name, logger=logger, uid=user_id,
                )

    except HTTPException:
        raise
    except Exception as e:
        # Best-effort audit; must NEVER mask the controlled error below. A failed
        # rollback/audit/commit here previously escaped to the generic global
        # handler ("internal_server_error"), hiding the real reason.
        logger.error("Registration failed for %s: %s", email, e, exc_info=True)
        try:
            await db.rollback()
            await audit_log(
                db, ip_address=ip_address, user_agent=user_agent,
                email=email, phone_number=phone,
                outcome="FAILED_SERVER_ERROR",
                failure_detail=str(e)[:500],
            )
            await db.commit()
        except Exception as audit_err:  # noqa: BLE001
            logger.warning("Audit write failed while handling signup error: %s", audit_err)
        # Plain farmer-voice message only — never leak exception types / SQL /
        # table names to the UI. Full detail is logged above (exc_info) and
        # persisted to shared.registration_audit_log.failure_detail.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Something went wrong creating your account — please try again.",
        ) from e

    return {
        "access_token": _make_access_token(user_id, tenant_id, role, "BASIC"),
        "refresh_token": _make_refresh_token(user_id, tenant_id),
        "token_type": "bearer",
        "role": role,
        "tier": "BASIC",
        "tis_daily_limit": 20,
        "display_name": full_name,
        "email": email,
        "email_unverified": not is_google,
        "capabilities": compute_capabilities({"role": role, "tier": "BASIC", "email_verified": is_google, "account_type": req.account_type}),
        # Tells the frontend which verification surface to show next. Email OTP is
        # the live channel; destination is masked so the UI can say where it went.
        "verification": (
            None if is_google else
            {"method": "email_otp", "destination": mask_email(email)}
        ),
        "message": (
            "Account created — your email is verified via Google."
            if is_google else
            "Account created. Enter the 6-digit code we emailed you."
        ),
    }


# ---------------------------------------------------------------------------
# Email verification
# ---------------------------------------------------------------------------

class ResendVerificationRequest(BaseModel):
    email: EmailStr


@router.get("/verify-email")
async def verify_email(token: str, uid: str | None = None, db: AsyncSession = Depends(get_db)):
    """
    Confirm a verification token. Idempotent and link-scanner-proof:
      1. Match by token. If found + unverified + unexpired -> verify (token kept).
         If found + already verified -> success.
      2. If the token row is gone (consumed by an email-provider link pre-fetch,
         or overwritten by a later resend), fall back to `uid`: if that user is
         already verified, still return success. A verified account can therefore
         NEVER read as "invalid/already used".
      3. Only a genuinely unknown token AND a non-verified/unknown uid is an error.
    """
    if not token or len(token) < 10:
        raise HTTPException(status_code=400, detail="Missing or invalid verification token.")

    result = await db.execute(
        text("""
            SELECT user_id, email, email_verification_expires, email_verified
            FROM tenant.users
            WHERE email_verification_token = :token
            LIMIT 1
        """),
        {"token": token},
    )
    row = result.mappings().first()

    if not row:
        # Token not found — recognise an already-verified account via uid so a
        # scanned/old link still lands on success instead of a scary failure.
        if uid:
            try:
                urow = (await db.execute(
                    text("""
                        SELECT email_verified
                        FROM tenant.users
                        WHERE user_id = CAST(:uid AS uuid) AND is_active = true
                        LIMIT 1
                    """),
                    {"uid": uid},
                )).mappings().first()
                if urow and urow["email_verified"]:
                    return {"message": "Email already verified. You can now sign in.", "status": "verified"}
            except Exception:  # noqa: BLE001 — malformed uid, fall through to error
                pass
        raise HTTPException(
            status_code=400,
            detail="This verification link has expired or already been used. Please request a new one from the sign-in page.",
        )

    if row["email_verified"]:
        return {"message": "Email already verified. You can now sign in.", "status": "verified"}

    expires = row["email_verification_expires"]
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires and expires < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=400,
            detail="This verification link has expired. Request a new one from the sign-in page.",
        )

    # Idempotent verify: set email_verified=true but KEEP the token. Email
    # providers (Gmail, Outlook SafeLinks, antivirus, mobile link-preview)
    # pre-fetch links with a GET, which would consume a one-time token before the
    # human clicks -> "invalid or already used". By keeping the token, a repeat
    # GET finds the row, sees email_verified=true (checked above) and returns the
    # friendly "already verified" success instead of an error. No security risk:
    # a verified link performs no sensitive action on re-hit.
    await db.execute(
        text("""
            UPDATE tenant.users
               SET email_verified = true,
                   updated_at = NOW()
             WHERE user_id = :uid
        """),
        {"uid": str(row["user_id"])},
    )
    await db.commit()
    return {"message": "Email verified. You can now sign in."}


@router.post("/resend-verification")
async def resend_verification(
    req: ResendVerificationRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Re-send the verification email, REUSING the account's current token so every
    email already sent stays valid (no stale-link trap). Rate limited with a
    short cooldown + generous hourly cap. Always returns 200 — never leaks
    whether the email exists in our DB.
    """
    email = req.email.lower().strip()
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=1)
    history = [t for t in _resend_history.get(email, []) if t > cutoff]
    # Short cooldown between sends (anti-double-click / anti-spam).
    if history:
        elapsed = (now - max(history)).total_seconds()
        if elapsed < _RESEND_MIN_INTERVAL_SECONDS:
            wait = int(_RESEND_MIN_INTERVAL_SECONDS - elapsed) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {wait}s before requesting another email.",
                headers={"Retry-After": str(wait)},
            )
    # Generous hourly cap.
    if len(history) >= _RESEND_LIMIT_PER_HOUR:
        wait = int((min(history) + timedelta(hours=1) - now).total_seconds()) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You've requested several emails recently. Please wait a little while and try again.",
            headers={"Retry-After": str(max(wait, 1))},
        )
    history.append(now)
    _resend_history[email] = history

    result = await db.execute(
        text("""
            SELECT user_id, full_name, email_verified, email_verification_token
            FROM tenant.users
            WHERE email = :email AND is_active = true
            LIMIT 1
        """),
        {"email": email},
    )
    row = result.mappings().first()

    # Enumeration-safe: always return the same success message
    generic_response = {
        "message": "If that email is registered, a new verification link has been sent.",
    }

    if not row or row["email_verified"]:
        return generic_response

    # REUSE the existing token (don't rotate) so EVERY verification email already
    # sent to this user keeps working — clicking an older email must never read as
    # "expired/already used". Mint a new one only if there isn't one. Always
    # refresh the 24h window so old links are revived.
    token_to_send = row["email_verification_token"] or secrets.token_urlsafe(32)
    new_expires = now + timedelta(hours=24)
    await db.execute(
        text("""
            UPDATE tenant.users
               SET email_verification_token = :tok,
                   email_verification_expires = :exp,
                   updated_at = NOW()
             WHERE user_id = :uid
        """),
        {"tok": token_to_send, "exp": new_expires, "uid": str(row["user_id"])},
    )
    await db.commit()

    send_verification_email(email, token_to_send, row["full_name"] or "there", uid=str(row["user_id"]))
    return generic_response


# ---------------------------------------------------------------------------
# Email OTP verification (primary signup flow)
# ---------------------------------------------------------------------------

class VerifyEmailOtpRequest(BaseModel):
    code: str

    @field_validator("code")
    @classmethod
    def code_format(cls, v: str) -> str:
        v = (v or "").strip()
        if not (v.isdigit() and len(v) == 6):
            raise ValueError("Enter the 6-digit code from your email.")
        return v


# Plain farmer-voice messages keyed off the otp engine's reason codes. We never
# echo back internals — the user just needs to know what to do next.
_OTP_REASON_MESSAGES = {
    "expired": "That code has expired. Tap “Resend code” to get a new one.",
    "too_many_attempts": "Too many tries. Tap “Resend code” to get a new one.",
    "invalid": "That code isn’t right. Check the digits and try again.",
    "cooldown": "Please wait a few seconds before requesting another code.",
    "hourly_cap": "Too many codes requested. Please try again later.",
}


async def _current_user_email(db: AsyncSession, uid: str) -> tuple[str | None, bool]:
    row = (
        await db.execute(
            text("SELECT email, COALESCE(email_verified, false) AS v "
                 "FROM tenant.users WHERE user_id = :uid"),
            {"uid": uid},
        )
    ).first()
    if not row:
        return None, False
    return row.email, bool(row.v)


@router.post("/verify-email-otp")
async def verify_email_otp(
    req: VerifyEmailOtpRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Verify the 6-digit code emailed at signup. Authenticated with the token the
    register/login response already returns, so it's enumeration-safe (we only
    ever check the caller's own email). On success flips email_verified=true."""
    uid = str(user["user_id"])
    email, already = await _current_user_email(db, uid)
    if email is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")
    if already:
        return {"verified": True, "message": "Your email is already verified."}

    res = await verify_otp(email, req.code, purpose="email_verify")
    if not res.get("ok"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_OTP_REASON_MESSAGES.get(res.get("reason", "invalid"),
                                            "That code isn’t right. Please try again."),
        )

    await db.execute(
        text("UPDATE tenant.users SET email_verified = true, updated_at = NOW() "
             "WHERE user_id = :uid"),
        {"uid": uid},
    )
    await db.commit()
    logger.info("Email verified via OTP for user %s", uid)
    return {"verified": True, "message": "Email verified — you’re all set."}


@router.post("/resend-email-otp")
async def resend_email_otp(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Issue a fresh signup OTP to the caller's own email. Rate-limited by the otp
    engine (cooldown + hourly cap). Never reveals anything but the masked address."""
    uid = str(user["user_id"])
    email, already = await _current_user_email(db, uid)
    if email is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")
    if already:
        return {"sent": False, "message": "Your email is already verified."}

    res = await request_otp(email, purpose="email_verify")
    if not res.get("ok"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_OTP_REASON_MESSAGES.get(res.get("reason", "cooldown"),
                                            "Please wait before requesting another code."),
            headers={"Retry-After": str(res.get("retry_after", 30))},
        )
    send_otp_email(email, res["code"], user.get("full_name") or "there")
    return {"sent": True, "destination": mask_email(email),
            "message": f"New code sent to {mask_email(email)}."}


# ---------------------------------------------------------------------------
# Forgot / reset password
# ---------------------------------------------------------------------------

@router.post("/forgot-password")
async def forgot_password(
    req: ForgotPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Request a password reset email. Enumeration-safe: always returns 200
    with the same message regardless of whether the email exists, is
    deactivated, or just hit the rate limit. Rate limited to 3 per hour
    per email (in-memory; fine for prototype).

    The raw token is only ever sent in the email. What gets persisted is
    sha256(token), so a DB compromise does not give attackers usable
    reset links.
    """
    email = req.email.lower().strip()
    now = datetime.now(timezone.utc)
    generic_response = {
        "message": "If that email is registered, a password reset link has been sent.",
    }

    # Rate limit per email (silently — don't leak limit hits to attackers)
    cutoff = now - timedelta(hours=1)
    history = [t for t in _reset_history.get(email, []) if t > cutoff]
    if len(history) >= _RESET_LIMIT_PER_HOUR:
        return generic_response
    history.append(now)
    _reset_history[email] = history

    result = await db.execute(
        text("""
            SELECT user_id, full_name, first_name, is_active
            FROM tenant.users
            WHERE email = :email
            LIMIT 1
        """),
        {"email": email},
    )
    row = result.mappings().first()

    if not row or not row["is_active"]:
        return generic_response

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires = now + timedelta(hours=1)

    await db.execute(
        text("""
            UPDATE tenant.users
               SET password_reset_token_hash = :token_hash,
                   password_reset_expires = :expires,
                   password_reset_requested_at = :requested_at,
                   updated_at = NOW()
             WHERE user_id = :uid
        """),
        {
            "token_hash": token_hash,
            "expires": expires,
            "requested_at": now,
            "uid": str(row["user_id"]),
        },
    )
    await db.commit()

    name = row["first_name"] or row["full_name"] or "there"
    send_password_reset_email(email, raw_token, name)

    logger.info("Password reset requested for %s", email)
    return generic_response


@router.post("/reset-password")
async def reset_password(
    req: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Complete a password reset using a valid token. Hashes the submitted
    token and matches it against the stored hash. On success: writes the
    new bcrypt hash and clears all reset fields. On failure: 400 with a
    generic message (never leaks which step failed).
    """
    if not req.token or len(req.token) < 10:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    token_hash = hashlib.sha256(req.token.encode()).hexdigest()

    result = await db.execute(
        text("""
            SELECT user_id, password_reset_expires, is_active
            FROM tenant.users
            WHERE password_reset_token_hash = :token_hash
            LIMIT 1
        """),
        {"token_hash": token_hash},
    )
    row = result.mappings().first()

    if not row or not row["is_active"]:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    expires = row["password_reset_expires"]
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if not expires or expires < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=400,
            detail="This reset link has expired. Please request a new one.",
        )

    new_hash = pwd_context.hash(req.new_password)
    await db.execute(
        text("""
            UPDATE tenant.users
               SET password_hash = :pw_hash,
                   password_reset_token_hash = NULL,
                   password_reset_expires = NULL,
                   password_reset_requested_at = NULL,
                   updated_at = NOW()
             WHERE user_id = :uid
        """),
        {"pw_hash": new_hash, "uid": str(row["user_id"])},
    )
    await db.commit()

    logger.info("Password reset completed for user %s", row["user_id"])
    return {"message": "Password has been reset. You can now sign in with your new password."}


# ---------------------------------------------------------------------------
# Phone OTP verification
# ---------------------------------------------------------------------------

def _normalize_phone(raw: str) -> str:
    p = (raw or "").strip().replace(" ", "").replace("-", "")
    if p and not p.startswith("+"):
        p = "+" + p
    return p


@router.post("/send-phone-otp")
async def send_phone_otp(
    req: SendPhoneOtpRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Send a 6-digit OTP to the phone number on file. Enumeration-safe:
    always returns 200 with the same message regardless of whether the
    number is registered, is already verified, or just hit the rate limit.

    Rate limit: one send per 60 seconds per phone (in-memory).
    In dev mode (no Vonage key), the code is logged instead of sent.
    """
    phone = _normalize_phone(req.phone_number)
    now = datetime.now(timezone.utc)
    generic = {"message": "If this number is registered, a verification code has been sent."}

    if not phone or len(phone) < 8:
        return generic

    # 60s rate limit per phone
    last = _otp_last_sent.get(phone)
    if last and (now - last).total_seconds() < _OTP_MIN_INTERVAL_SECONDS:
        return generic

    result = await db.execute(
        text("""
            SELECT user_id, email_verified, full_name
            FROM tenant.users
            WHERE phone_number = :phone AND is_active = true
            LIMIT 1
        """),
        {"phone": phone},
    )
    row = result.mappings().first()

    if not row or row["email_verified"]:
        # either no such number, or already verified — still generic
        return generic

    # Cryptographically random 6-digit code
    otp_code = f"{random.SystemRandom().randint(0, 999999):06d}"
    otp_hash = hashlib.sha256(otp_code.encode()).hexdigest()
    expires = now + timedelta(minutes=settings.phone_otp_expire_minutes)

    await db.execute(
        text("""
            UPDATE tenant.users
               SET phone_otp_hash = :h,
                   phone_otp_expires = :exp,
                   phone_otp_attempts = 0,
                   updated_at = NOW()
             WHERE user_id = :uid
        """),
        {"h": otp_hash, "exp": expires, "uid": str(row["user_id"])},
    )
    await db.commit()

    _otp_last_sent[phone] = now
    send_otp_sms(phone, otp_code)
    logger.info("Phone OTP issued for user %s", row["user_id"])
    return generic


@router.post("/verify-phone-otp")
async def verify_phone_otp(
    req: VerifyPhoneOtpRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Verify a 6-digit OTP. On success, flips email_verified=true (reused as
    a general "account verified" flag) and clears all OTP + email-token
    fields. Max attempts (default 3) then the code is invalidated and the
    caller must request a new one.
    """
    phone = _normalize_phone(req.phone_number)
    code = req.code.strip()

    result = await db.execute(
        text("""
            SELECT user_id, phone_otp_hash, phone_otp_expires,
                   phone_otp_attempts, email_verified
            FROM tenant.users
            WHERE phone_number = :phone AND is_active = true
            LIMIT 1
        """),
        {"phone": phone},
    )
    row = result.mappings().first()

    if not row or not row["phone_otp_hash"]:
        raise HTTPException(
            status_code=400,
            detail="No verification code was sent to this number. Please request a new one.",
        )

    if row["email_verified"]:
        return {"message": "Account already verified. You can sign in."}

    attempts = row["phone_otp_attempts"] or 0
    if attempts >= settings.phone_otp_max_attempts:
        await db.execute(
            text("""
                UPDATE tenant.users
                   SET phone_otp_hash = NULL,
                       phone_otp_expires = NULL,
                       phone_otp_attempts = 0,
                       updated_at = NOW()
                 WHERE user_id = :uid
            """),
            {"uid": str(row["user_id"])},
        )
        await db.commit()
        raise HTTPException(
            status_code=400,
            detail="Too many incorrect attempts. Please request a new code.",
        )

    expires = row["phone_otp_expires"]
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if not expires or expires < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=400,
            detail="This code has expired. Please request a new one.",
        )

    submitted_hash = hashlib.sha256(code.encode()).hexdigest()
    if submitted_hash != row["phone_otp_hash"]:
        await db.execute(
            text("""
                UPDATE tenant.users
                   SET phone_otp_attempts = phone_otp_attempts + 1,
                       updated_at = NOW()
                 WHERE user_id = :uid
            """),
            {"uid": str(row["user_id"])},
        )
        await db.commit()
        remaining = settings.phone_otp_max_attempts - (attempts + 1)
        plural = "s" if remaining != 1 else ""
        raise HTTPException(
            status_code=400,
            detail=f"Incorrect code. {remaining} attempt{plural} remaining.",
        )

    # Success — flip verified, clear all ephemeral verification state
    await db.execute(
        text("""
            UPDATE tenant.users
               SET email_verified = true,
                   phone_otp_hash = NULL,
                   phone_otp_expires = NULL,
                   phone_otp_attempts = 0,
                   email_verification_token = NULL,
                   email_verification_expires = NULL,
                   updated_at = NOW()
             WHERE user_id = :uid
        """),
        {"uid": str(row["user_id"])},
    )
    await db.commit()

    logger.info("Phone OTP verified for user %s", row["user_id"])
    return {"message": "Phone verified. You can now sign in."}


@router.get("/me")
async def get_me(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return the current user profile from the validated JWT (+ persona capabilities).

    Solo/Growth/Commercial 'mode' was removed — there is one unified experience for
    every user; persona (account_type) + the capability layer drive what they see.
    """
    return {
        "data": {
            **user,
            "capabilities": compute_capabilities(user),
        }
    }


@router.post("/refresh")
async def refresh_token(
    req: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    """Exchange refresh token for new access token. Re-fetches role/tier from DB."""
    try:
        payload = jwt.decode(
            req.refresh_token,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user_id = payload.get("sub")
    tenant_id = payload.get("tenant_id")

    result = await db.execute(
        text("""
            SELECT u.role, t.subscription_tier, t.tis_daily_limit
            FROM tenant.users u
            JOIN tenant.tenants t ON t.tenant_id = u.tenant_id
            WHERE u.user_id = :uid AND u.is_active = true
        """),
        {"uid": user_id}
    )
    user = result.mappings().first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
        )

    return {
        "access_token": _make_access_token(user_id, tenant_id, user["role"], user["subscription_tier"]),
        "token_type": "bearer",
        "role": user["role"],
        "tier": user["subscription_tier"],
    }


@router.post("/logout")
async def logout(user: dict = Depends(get_current_user)):
    """Stateless logout -- client must discard the token."""
    return {"message": "Logged out successfully"}
