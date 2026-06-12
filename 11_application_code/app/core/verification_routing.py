"""verification_routing.py — omnichannel OTP routing (CFO cost-optimized).

The platform keeps password auth; this module decides WHICH channel a user's
verification message goes out on, to protect the lean software budget from carrier
SMS charges.

THE CFO OVERHEAD ROUTING RULE
  - Corporate / banking / regulatory profiles  -> default EMAIL (free SMTP relay).
  - Producer / field profiles                  -> default WHATSAPP (API token block).
  - Telco SMS                                   -> NEVER a default; explicit user
                                                  fallback only.

HONESTY (PR.2 — verified-loud beats assumed-quiet): only EMAIL delivers reliably
today. WhatsApp delivery awaits Meta API provisioning (Q8) and +679 SMS is a known
dead route. Until those are receipt-verified, dispatch on a non-email channel falls
back to EMAIL so no account is ever left un-verifiable. When a channel is provisioned,
add its real sender in dispatch_verification() — no caller changes.
"""
from __future__ import annotations

import logging

VALID_CHANNELS = {"whatsapp", "sms", "email"}

# Profiles whose verification defaults to free corporate SMTP (email).
_EMAIL_DEFAULT_PROFILES = {
    "BANKER_COMMERCIAL", "DONOR_DEVELOPMENT", "COMMODITY_EXPORTER", "TRADE_IMPORTER",
    "AGRIBUSINESS_ENTERPRISE", "GOVERNMENT_REGULATOR", "QUALITY_AUDITOR",
    "MATAQALI_TRUSTEE", "COMMERCIAL_BUYER",
}

# Channels that actually deliver right now. Everything else falls back to email.
_LIVE_CHANNELS = {"email"}


def default_channel(account_type: str) -> str:
    """Cost-optimized default channel for a profile. Never returns 'sms'."""
    return "email" if account_type in _EMAIL_DEFAULT_PROFILES else "whatsapp"


def resolve_channel(account_type: str, requested: str | None) -> str:
    """Honour an explicit, valid user choice; otherwise apply the CFO default."""
    r = (requested or "").lower().strip()
    return r if r in VALID_CHANNELS else default_channel(account_type)


def dispatch_verification(
    channel: str, *, email: str, phone: str | None, token: str, name: str,
    logger: logging.Logger | None = None,
) -> bool:
    """Send the verification on `channel`. Returns True if something was sent.

    Email is live. WhatsApp/SMS are wired here but not yet provisioned, so they fall
    back to email (which is always collected at signup) and log the intended channel.
    """
    log = logger or logging.getLogger("teivaka.verification_routing")
    from app.utils.email import send_verification_email

    if channel == "email" or channel not in _LIVE_CHANNELS:
        if channel != "email":
            log.warning(
                "verification channel '%s' requested but not provisioned (Q8); "
                "falling back to email for %s", channel, email,
            )
        return send_verification_email(email, token, name)

    # (Future) live non-email channels would dispatch here.
    return send_verification_email(email, token, name)
