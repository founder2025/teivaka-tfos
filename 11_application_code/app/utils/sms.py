# FILE: app/utils/sms.py
#
# Teivaka Farm OS — SMS OTP dispatch via Vonage
#
# Same defensive pattern as email.py:
#   * Never raise — failed dispatch must never break registration
#   * In dev mode (no API key), log the code and return True
#   * In prod, hit Vonage's HTTPS REST API (/sms/json)

from __future__ import annotations

import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger("teivaka.sms")


def _vonage_configured() -> bool:
    key = (settings.vonage_api_key or "").strip()
    secret = (settings.vonage_api_secret or "").strip()
    return bool(key) and bool(secret) and key != "FILL_IN" and secret != "FILL_IN"


def _build_message(otp_code: str) -> str:
    """
    Build the SMS body. The trailing "@teivaka.com #CODE" line is the WebOTP
    API standard — Android Chrome reads it and offers one-tap auto-fill.
    """
    brand = settings.vonage_brand_name or "Teivaka"
    return (
        f"Your {brand} verification code is: {otp_code}\n\n"
        "This code expires in 5 minutes. Do not share it with anyone.\n\n"
        f"@teivaka.com #{otp_code}"
    )


def send_otp_sms(phone_number: str, otp_code: str) -> bool:
    """
    Send an OTP via Vonage SMS. Returns True on success, False otherwise.
    Never raises.

    In dev mode (Vonage not configured), logs the code at WARNING level and
    returns True so the flow continues end-to-end against a developer.
    """
    # Normalise to E.164 WITHOUT leading +. Vonage expects digits only.
    phone_e164 = phone_number.strip().replace(" ", "").replace("-", "")
    to_digits = phone_e164.lstrip("+")

    if not _vonage_configured():
        logger.warning(
            "Vonage not configured — OTP for %s: %s (dev mode, not sent)",
            phone_e164, otp_code,
        )
        return True

    body = _build_message(otp_code)

    try:
        resp = httpx.post(
            "https://rest.nexmo.com/sms/json",
            data={
                "from": settings.vonage_brand_name,
                "to": to_digits,
                "text": body,
                "api_key": settings.vonage_api_key,
                "api_secret": settings.vonage_api_secret,
            },
            timeout=15.0,
        )
        data = resp.json() if resp.content else {}
        messages = data.get("messages") or []
        first = messages[0] if messages else {}
        status = first.get("status")
        if status == "0":
            logger.info(
                "Vonage SMS sent to %s, message-id=%s",
                phone_e164, first.get("message-id"),
            )
            return True
        err = first.get("error-text") or f"unknown (status={status})"
        logger.error("Vonage SMS failed for %s: %s", phone_e164, err)
        return False
    except Exception as exc:
        logger.exception("Vonage SMS API call failed for %s: %s", phone_e164, exc)
        return False
