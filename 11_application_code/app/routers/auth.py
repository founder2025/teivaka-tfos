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

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_db
from app.middleware.rls import get_current_user
from app.utils.email import send_password_reset_email, send_verification_email
from app.utils.referral import generate_referral_code
from app.utils.sms import send_otp_sms
from app.utils.fraud_guard import (
    CURRENT_PRIVACY_POLICY_VERSION,
    FraudOutcome,
    audit_log,
    run_all_checks,
)

logger = logging.getLogger("teivaka.auth")

# In-memory per-email rate limit for resend-verification (3/hour).
# This is intentionally process-local and resets on restart — good enough
# for prototype; swap for Redis later.
_RESEND_LIMIT_PER_HOUR = 3
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
    password: str
    phone_number: str | None = None
    whatsapp_number: str | None = None
    date_of_birth: date
    account_type: str = "FARMER"
    country: str = "FJ"
    privacy_accepted: bool
    privacy_policy_version: str = CURRENT_PRIVACY_POLICY_VERSION
    referral_source: str | None = None
    referral_code: str | None = None
    anonymous_id: str | None = None

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
        allowed = {"FARMER", "SUPPLIER", "BUYER", "OTHER"}
        v = v.upper().strip()
        if v not in allowed:
            raise ValueError(f"account_type must be one of: {', '.join(sorted(allowed))}")
        return v

    @field_validator("country")
    @classmethod
    def valid_country(cls, v: str) -> str:
        return v.upper().strip()[:2]

    @field_validator("referral_source")
    @classmethod
    def cap_referral(cls, v: str | None) -> str | None:
        return v[:200] if v else None


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


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """Login with email + password. Returns access token (24h) + refresh token (30d)."""
    result = await db.execute(
        text("""
            SELECT u.user_id, u.tenant_id, u.email, u.full_name,
                   u.first_name, u.last_name, u.role, u.password_hash,
                   u.email_verified,
                   t.subscription_tier, t.tis_daily_limit, t.mode
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
        "mode": user["mode"],
        "tis_daily_limit": user["tis_daily_limit"],
        "display_name": (
            f"{user['first_name']} {user['last_name']}"
            if user.get("first_name") and user.get("last_name")
            else user["full_name"]
        ),
        "email_unverified": not bool(user.get("email_verified", False)),
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
    """
    email = req.email.lower().strip()
    phone_raw = (req.phone_number or "").strip().replace(" ", "").replace("-", "")
    phone = phone_raw if phone_raw else None

    ip_address, user_agent = await run_all_checks(
        request=request,
        db=db,
        privacy_accepted=req.privacy_accepted,
        password=req.password,
        date_of_birth=req.date_of_birth,
        email=email,
        phone_number=phone,
    )

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
    role = "FARMER" if req.account_type in ("FARMER", "BUYER") else "VIEWER"
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

    trial_started_at = datetime.now(timezone.utc)
    trial_ends_at = trial_started_at + timedelta(days=14)

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

        await db.execute(
            text("""
                INSERT INTO tenant.users (
                    user_id, tenant_id, email, full_name,
                    first_name, last_name, password_hash, role,
                    phone_number, whatsapp_number,
                    date_of_birth, account_type, country,
                    privacy_accepted_at, privacy_policy_version,
                    registration_ip, registration_user_agent,
                    email_verified, email_verification_token,
                    email_verification_expires,
                    is_active,
                    referral_code, referred_by_user_id, referral_source,
                    trial_started_at, trial_ends_at,
                    created_at, updated_at
                ) VALUES (
                    :user_id, :tenant_id, :email, :full_name,
                    :first_name, :last_name, :password_hash, :role,
                    :phone_number, :whatsapp_number,
                    :date_of_birth, :account_type, :country,
                    :privacy_accepted_at, :privacy_policy_version,
                    :reg_ip, :reg_ua,
                    false, :verification_token,
                    :verification_expires,
                    true,
                    :referral_code, :referred_by_user_id, :referral_source,
                    :trial_started_at, :trial_ends_at,
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
                "privacy_accepted_at": privacy_accepted_at,
                "privacy_policy_version": req.privacy_policy_version,
                "reg_ip": ip_address,
                "reg_ua": user_agent,
                "verification_token": verification_token,
                "verification_expires": verification_expires,
                "referral_code": referral_code,
                "referred_by_user_id": referred_by_user_id,
                "referral_source": req.referral_source,
                "trial_started_at": trial_started_at,
                "trial_ends_at": trial_ends_at,
            }
        )

        # Attribution: log SIGNUP and backfill prior LANDING_VIEW events for
        # this anonymous_id. Best-effort — do not block signup on failure.
        try:
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

        await audit_log(
            db, ip_address=ip_address, user_agent=user_agent,
            email=email, phone_number=phone,
            outcome="SUCCESS",
            tenant_id=tenant_id, user_id=user_id,
        )
        await db.commit()

        # Fire-and-forget verification email. Never raises.
        send_verification_email(email, verification_token, full_name)

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        await audit_log(
            db, ip_address=ip_address, user_agent=user_agent,
            email=email, phone_number=phone,
            outcome="FAILED_SERVER_ERROR",
            failure_detail=str(e)[:500],
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed due to a server error. Please try again.",
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
        "email_unverified": True,
        "message": "Account created. Please check your email to verify your address.",
    }


# ---------------------------------------------------------------------------
# Email verification
# ---------------------------------------------------------------------------

class ResendVerificationRequest(BaseModel):
    email: EmailStr


@router.get("/verify-email")
async def verify_email(token: str, db: AsyncSession = Depends(get_db)):
    """
    Confirm a verification token. On success, flip email_verified=true and
    clear the token fields. Returns a simple success/error payload.
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
        raise HTTPException(status_code=400, detail="This verification link is invalid or has already been used.")

    if row["email_verified"]:
        return {"message": "Email already verified. You can now sign in."}

    expires = row["email_verification_expires"]
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires and expires < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=400,
            detail="This verification link has expired. Request a new one from the sign-in page.",
        )

    await db.execute(
        text("""
            UPDATE tenant.users
               SET email_verified = true,
                   email_verification_token = NULL,
                   email_verification_expires = NULL,
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
    Issue a fresh verification token and re-send the email.
    Rate limited to 3 per hour per email. Always returns 200 — never leaks
    whether the email exists in our DB.
    """
    email = req.email.lower().strip()
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=1)
    history = [t for t in _resend_history.get(email, []) if t > cutoff]
    if len(history) >= _RESEND_LIMIT_PER_HOUR:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification emails requested. Please wait an hour and try again.",
        )
    history.append(now)
    _resend_history[email] = history

    result = await db.execute(
        text("""
            SELECT user_id, full_name, email_verified
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

    new_token = secrets.token_urlsafe(32)
    new_expires = now + timedelta(hours=24)
    await db.execute(
        text("""
            UPDATE tenant.users
               SET email_verification_token = :tok,
                   email_verification_expires = :exp,
                   updated_at = NOW()
             WHERE user_id = :uid
        """),
        {"tok": new_token, "exp": new_expires, "uid": str(row["user_id"])},
    )
    await db.commit()

    send_verification_email(email, new_token, row["full_name"] or "there")
    return generic_response


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
async def get_me(user: dict = Depends(get_current_user)):
    """Return current user profile from validated JWT."""
    return {"data": user}


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
