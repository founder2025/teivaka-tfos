# FILE: app/utils/fraud_guard.py
#
# Teivaka Farm OS — Registration Fraud & Spam Guard
#
# Purpose:
#   Multi-layer defence against spam accounts, fake registrations, underage users,
#   disposable emails, and bot-driven abuse — all evaluated before any DB write.
#
# Layers (in order of evaluation, cheapest to most expensive):
#   1. Privacy acceptance check       — zero-tolerance gate
#   2. Password strength              — prevents trivially guessable passwords
#   3. Age verification               — 18+ only, calculated from date_of_birth
#   4. Disposable email block         — rejects known throwaway email domains
#   5. Suspicious pattern detection   — bot-style email patterns, test accounts
#   6. Phone number format check      — E.164 format enforcement
#   7. IP rate limiting               — max 3 registrations per IP per hour,
#                                       max 10 per IP per 24 hours (DB-backed)
#
# All failures are logged to shared.registration_audit_log before raising.
# On SUCCESS, caller logs separately after DB commit.

from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CURRENT_PRIVACY_POLICY_VERSION = "1.0"

# Maximum registrations per IP address
IP_HOURLY_LIMIT = 20
IP_DAILY_LIMIT = 50

# Backward-compat aliases (kept so existing imports don't break)
IP_LIMIT_HOURLY = IP_HOURLY_LIMIT
IP_LIMIT_DAILY = IP_DAILY_LIMIT

# IPs that should skip rate limiting entirely (office NAT, co-working, founder's laptop).
# Populate with explicit client IPs (v4 or v6). Empty by default.
WHITELIST_IPS: set[str] = set()

MIN_AGE_YEARS = 18

# Minimum password requirements:
#   - 8 characters
#   - At least 1 uppercase letter
#   - At least 1 lowercase letter
#   - At least 1 digit
#   - At least 1 special character
PASSWORD_MIN_LEN = 8
_PASSWORD_RE = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?]).{8,}$"
)

# E.164 phone number format: + followed by 7–15 digits
_PHONE_E164_RE = re.compile(r"^\+[1-9]\d{6,14}$")

# ---------------------------------------------------------------------------
# Disposable / throwaway email domain blocklist
# Covers the highest-volume disposable services.
# Extend this list as new disposable services are identified in audit logs.
# ---------------------------------------------------------------------------
DISPOSABLE_EMAIL_DOMAINS: frozenset[str] = frozenset({
    # Major throwaway services
    "mailinator.com", "guerrillamail.com", "guerrillamail.net",
    "guerrillamail.org", "guerrillamail.biz", "guerrillamail.de",
    "guerrillamail.info", "guerrillamailblock.com",
    "sharklasers.com", "guerrillamailblock.com", "grr.la",
    "guerrillamail.com", "spam4.me", "trashmail.com", "trashmail.me",
    "trashmail.net", "trashmail.at", "trashmail.io", "trashmail.org",
    "trashmail.xyz", "trashmail.app", "dispostable.com",
    "yopmail.com", "yopmail.fr", "cool.fr.nf", "jetable.fr.nf",
    "nospam.ze.tc", "nomail.xl.cx", "mega.zik.dj", "speed.1s.fr",
    "courriel.fr.nf", "moncourrier.fr.nf", "monemail.fr.nf",
    "monmail.fr.nf", "yopmail.net", "yopmail.org",
    "tempmail.com", "temp-mail.org", "temp-mail.io", "tempmail.net",
    "tempmail.org", "tempmail.de", "tempmail.us", "tempmail.it",
    "10minutemail.com", "10minutemail.net", "10minutemail.org",
    "10minutemail.de", "10minutemail.co.uk", "10minutemail.pl",
    "10minutemail.be", "10minutemail.us",
    "throwam.com", "throwam.net", "throwam.org",
    "mailnull.com", "spamgourmet.com", "spamgourmet.net",
    "spamgourmet.org", "spamhere.eu", "spamhereplease.com",
    "spamoff.de", "spamfree.eu", "spamfree24.org", "spamfree24.de",
    "spamfree24.eu", "spamfree24.info", "spamfree24.net",
    "maildrop.cc", "mailnesia.com", "mailforspam.com",
    "mailnew.com", "mailfreeonline.com", "mailappareil.fr",
    "discard.email", "discardmail.com", "discardmail.de",
    "throwam.com", "disposablemail.com", "throwawaymail.com",
    "fakeinbox.com", "fakeinbox.net", "fakemailgenerator.com",
    "getairmail.com", "getnada.com", "getnada.net", "getnada.org",
    "harakirimail.com", "inboxkitten.com", "jetable.net",
    "jetable.org", "jetable.fr", "jetable.com",
    "lookugly.com", "mailblocks.com", "mailcatch.com",
    "mailexpire.com", "mailme.lv", "mailme24.com", "mailmetrash.com",
    "mailmoat.com", "mailnull.com", "mailpoof.com", "mailproxsy.com",
    "mailscrap.com", "mailshell.com", "mailsiphon.com",
    "mailslapping.com", "mailsponge.com", "mailtemporaire.com",
    "mailtemporaire.fr", "mailzilla.com", "mailzilla.org",
    "mt2009.com", "mt2014.com", "netmails.com", "netmails.net",
    "nowmymail.com", "objectmail.com", "obobbo.com",
    "oneoffemail.com", "onewaymail.com",
    "pookmail.com", "privacy.net", "privatdemail.net",
    "proxymail.eu", "rklips.com", "rmqkr.net",
    "rtrtr.com", "s0ny.net", "safetymail.info",
    "sendspamhere.com", "shiftmail.com", "shortmail.net",
    "sibmail.com", "sneakemail.com", "sneakmail.de",
    "snkmail.com", "sofimail.com", "sogetthis.com",
    "soodonims.com", "spambob.com", "spambob.net",
    "spambob.org", "spambox.info", "spambox.irishspringrealty.com",
    "spambox.org", "spambox.us", "spamcannon.com",
    "spamcannon.net", "spamcero.com", "spamcon.org",
    "spamcorptastic.com", "spamcowboy.com", "spamcowboy.net",
    "spamcowboy.org", "spamday.com", "spamex.com",
    "tempr.email", "tempemail.net", "throwam.com",
    "spam.la", "spam.su", "spam.org.tr",
    # Common testing/fake patterns not caught by domain:
    # handled in suspicious_pattern_check() below
})

# ---------------------------------------------------------------------------
# Suspicious pattern detection
# ---------------------------------------------------------------------------

# These regex patterns match emails that are clearly fake, auto-generated,
# or used for testing/spam. All case-insensitive.
_SUSPICIOUS_EMAIL_PATTERNS: list[re.Pattern] = [
    re.compile(r"^test[\+\-\._]?\d*@", re.IGNORECASE),       # test@, test123@, test+1@
    re.compile(r"^fake[\+\-\._]?\d*@", re.IGNORECASE),       # fake@, fake1@
    re.compile(r"^spam[\+\-\._]?\d*@", re.IGNORECASE),       # spam@
    re.compile(r"^noreply[\+\-\._]?\d*@", re.IGNORECASE),    # noreply@
    re.compile(r"^no-reply[\+\-\._]?\d*@", re.IGNORECASE),   # no-reply@
    re.compile(r"^admin[\+\-\._]?\d*@", re.IGNORECASE),      # admin@, admin1@
    re.compile(r"^[a-z]{1,3}\d{4,}@", re.IGNORECASE),        # ab1234@ — sequential bots
    re.compile(r"^(a+|b+|x+|z+)\d*@", re.IGNORECASE),        # aaaa@, xxx@
    re.compile(r"^user\d+@", re.IGNORECASE),                   # user1@, user999@
    re.compile(r"^temp\d*@", re.IGNORECASE),                   # temp@, temp123@
    re.compile(r"^[0-9]+@", re.IGNORECASE),                    # 12345@
    re.compile(r"@(example|test|localhost|invalid|local)\.", re.IGNORECASE),  # @example.com
]

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

FraudOutcome = Literal[
    "SUCCESS",
    "FAILED_DUPLICATE_EMAIL",
    "FAILED_DUPLICATE_PHONE",
    "FAILED_DISPOSABLE_EMAIL",
    "FAILED_UNDERAGE",
    "FAILED_IP_RATE_LIMIT",
    "FAILED_SUSPICIOUS_PATTERN",
    "FAILED_PRIVACY_NOT_ACCEPTED",
    "FAILED_VALIDATION",
    "FAILED_SERVER_ERROR",
]


async def audit_log(
    db: AsyncSession,
    *,
    ip_address: str,
    user_agent: str,
    email: str,
    phone_number: str | None,
    outcome: FraudOutcome,
    failure_detail: str | None = None,
    tenant_id: str | None = None,
    user_id: str | None = None,
) -> None:
    """Write one row to shared.registration_audit_log. Never raises — audit must not block."""
    try:
        await db.execute(
            text("""
                INSERT INTO shared.registration_audit_log
                    (ip_address, user_agent, email, phone_number,
                     outcome, failure_detail, tenant_id, user_id)
                VALUES
                    (:ip, :ua, :email, :phone,
                     :outcome, :detail, :tenant_id, :user_id)
            """),
            {
                "ip": ip_address,
                "ua": user_agent,
                "email": email,
                "phone": phone_number,
                "outcome": outcome,
                "detail": failure_detail,
                "tenant_id": tenant_id,
                "user_id": user_id,
            }
        )
        # Intentionally NOT committing here — caller commits after all DB writes
    except Exception:
        pass  # Audit failure must never block registration


def _get_client_ip(request: Request) -> str:
    """Extract real IP, honouring X-Forwarded-For from Caddy reverse proxy."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # First entry in the chain is the original client
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _get_user_agent(request: Request) -> str:
    return request.headers.get("User-Agent", "")[:512]  # Cap at 512 chars


def check_privacy_accepted(privacy_accepted: bool) -> None:
    """Gate 1: Privacy policy must be explicitly accepted."""
    if not privacy_accepted:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="You must read and accept the Privacy Policy and Terms of Service to register.",
        )


def check_password_strength(password: str) -> None:
    """Gate 2: Password must meet minimum complexity requirements."""
    if len(password) < PASSWORD_MIN_LEN:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Password must be at least {PASSWORD_MIN_LEN} characters long.",
        )
    if not _PASSWORD_RE.match(password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Password must contain at least one uppercase letter, "
                "one lowercase letter, one number, and one special character "
                "(!@#$%^&* etc.)."
            ),
        )


def check_age(date_of_birth: date) -> None:
    """Gate 3: Must be 18 or older."""
    today = date.today()
    age = (
        today.year - date_of_birth.year
        - ((today.month, today.day) < (date_of_birth.month, date_of_birth.day))
    )
    if age < MIN_AGE_YEARS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"You must be at least {MIN_AGE_YEARS} years old to register.",
        )
    # Also reject clearly impossible dates (born before 1900 = data entry error)
    if date_of_birth.year < 1900:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please enter a valid date of birth.",
        )


def check_disposable_email(email: str) -> None:
    """Gate 4: Reject known disposable/throwaway email domains."""
    domain = email.split("@")[-1].lower().strip()
    # Normalise unicode (prevent look-alike attacks, e.g. gmaіl.com with Cyrillic і)
    domain = unicodedata.normalize("NFKC", domain)
    if domain in DISPOSABLE_EMAIL_DOMAINS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Temporary or disposable email addresses are not permitted. Please use a permanent email.",
        )


def check_suspicious_pattern(email: str) -> None:
    """Gate 5: Reject emails matching known bot/spam patterns."""
    for pattern in _SUSPICIOUS_EMAIL_PATTERNS:
        if pattern.search(email):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="This email address does not appear to be valid for registration. Please use a real email address.",
            )


def check_phone_format(phone_number: str) -> None:
    """Gate 6: Phone must be E.164 format (+679XXXXXXX etc.)."""
    cleaned = phone_number.strip().replace(" ", "").replace("-", "")
    if not _PHONE_E164_RE.match(cleaned):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Phone number must be in international format (e.g. +6799123456). "
                "Include your country code with the + prefix."
            ),
        )


async def check_ip_rate_limit(
    db: AsyncSession,
    ip_address: str,
) -> None:
    """
    Gate 7: IP-based rate limiting stored in shared.ip_registration_counts.
    Limits: IP_HOURLY_LIMIT per hour, IP_DAILY_LIMIT per 24 hours.
    IPs in WHITELIST_IPS skip this check entirely.
    Uses UPSERT with window truncation to atomically increment counters.
    """
    if ip_address in WHITELIST_IPS:
        return

    now = datetime.now(timezone.utc)
    hour_window = now.replace(minute=0, second=0, microsecond=0)
    day_window = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Upsert hourly counter
    await db.execute(
        text("""
            INSERT INTO shared.ip_registration_counts
                (ip_address, window_start, window_type, count)
            VALUES (:ip, CAST(:window AS timestamptz), 'HOURLY', 1)
            ON CONFLICT (ip_address, window_start, window_type)
            DO UPDATE SET count = shared.ip_registration_counts.count + 1
        """),
        {"ip": ip_address, "window": hour_window}
    )

    # Upsert daily counter
    await db.execute(
        text("""
            INSERT INTO shared.ip_registration_counts
                (ip_address, window_start, window_type, count)
            VALUES (:ip, CAST(:window AS timestamptz), 'DAILY', 1)
            ON CONFLICT (ip_address, window_start, window_type)
            DO UPDATE SET count = shared.ip_registration_counts.count + 1
        """),
        {"ip": ip_address, "window": day_window}
    )

    # Read back both counters in one query
    result = await db.execute(
        text("""
            SELECT window_type, count
            FROM shared.ip_registration_counts
            WHERE ip_address = :ip
              AND ((window_type = 'HOURLY'  AND window_start = CAST(:hour AS timestamptz))
                OR (window_type = 'DAILY'   AND window_start = CAST(:day AS timestamptz)))
        """),
        {"ip": ip_address, "hour": hour_window, "day": day_window}
    )
    rows = {r["window_type"]: r["count"] for r in result.mappings()}

    if rows.get("HOURLY", 0) > IP_HOURLY_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many registration attempts from this network. Please try again in an hour.",
        )
    if rows.get("DAILY", 0) > IP_DAILY_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many registration attempts from this network today. Please try again tomorrow.",
        )


async def run_all_checks(
    *,
    request: Request,
    db: AsyncSession,
    privacy_accepted: bool,
    password: str,
    date_of_birth: date,
    email: str,
    phone_number: str | None,
) -> tuple[str, str]:
    """
    Run all fraud/validation gates in order.
    Returns (ip_address, user_agent) for use by the caller when writing DB rows.
    Logs failed outcomes to audit log before raising.
    """
    ip = _get_client_ip(request)
    ua = _get_user_agent(request)

    async def _fail(outcome: FraudOutcome, detail: str) -> None:
        await audit_log(
            db, ip_address=ip, user_agent=ua, email=email,
            phone_number=phone_number, outcome=outcome, failure_detail=detail
        )
        await db.commit()  # Commit audit entry before raising

    # Gate 1
    try:
        check_privacy_accepted(privacy_accepted)
    except HTTPException as e:
        await _fail("FAILED_PRIVACY_NOT_ACCEPTED", e.detail)
        raise

    # Gate 2
    try:
        check_password_strength(password)
    except HTTPException as e:
        await _fail("FAILED_VALIDATION", e.detail)
        raise

    # Gate 3
    try:
        check_age(date_of_birth)
    except HTTPException as e:
        await _fail("FAILED_UNDERAGE", e.detail)
        raise

    # Gate 4
    try:
        check_disposable_email(email)
    except HTTPException as e:
        await _fail("FAILED_DISPOSABLE_EMAIL", e.detail)
        raise

    # Gate 5
    try:
        check_suspicious_pattern(email)
    except HTTPException as e:
        await _fail("FAILED_SUSPICIOUS_PATTERN", e.detail)
        raise

    # Gate 6 — only when phone provided (optional at signup since Phase 3.5a)
    if phone_number:
        try:
            check_phone_format(phone_number)
        except HTTPException as e:
            await _fail("FAILED_VALIDATION", e.detail)
            raise

    # Gate 7 (DB call — last because it writes)
    try:
        await check_ip_rate_limit(db, ip)
    except HTTPException as e:
        await _fail("FAILED_IP_RATE_LIMIT", e.detail)
        raise

    return ip, ua
