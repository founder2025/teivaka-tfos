# FILE: app/utils/email.py
#
# Teivaka Farm OS — Transactional email dispatch
#
# Single-purpose module: send verification emails via SMTP over STARTTLS.
# If SMTP is not configured (settings.smtp_host empty/FILL_IN), log the link
# and return success without sending — registration must never fail because
# email infrastructure isn't wired up.

from __future__ import annotations

import json
import logging
import smtplib
import ssl
from email.message import EmailMessage
from urllib.parse import quote

import httpx

from app.config import settings

logger = logging.getLogger("teivaka.email")


def _smtp_configured() -> bool:
    host = (settings.smtp_host or "").strip()
    return bool(host) and host != "FILL_IN"


def _is_resend() -> bool:
    """True when the configured SMTP is actually Resend — prefer their HTTPS API
    because most VPS providers (DigitalOcean in particular) block outbound
    SMTP ports by default. The SMTP_PASSWORD for Resend is a normal REST
    API key (re_...), so no extra config is needed."""
    host = (settings.smtp_host or "").lower().strip()
    pw   = (settings.smtp_password or "").strip()
    return host == "smtp.resend.com" or pw.startswith("re_")


def _send_via_resend(to_email: str, token: str, name: str) -> bool:
    """Dispatch via Resend's HTTPS REST API. Uses the same credential (SMTP_PASSWORD)."""
    verify_url = f"{settings.frontend_url.rstrip('/')}/verify-email?token={quote(token)}"
    api_key = settings.smtp_password.strip()
    payload = {
        "from": settings.smtp_from,
        "to": [to_email],
        "subject": "Verify your Teivaka account",
        "text": (
            f"Hello {name},\n\n"
            "Thanks for creating a Teivaka account. Please confirm your email "
            "address by opening the link below:\n\n"
            f"{verify_url}\n\n"
            "This link expires in 24 hours. If you didn't create an account, "
            "you can safely ignore this email.\n\n"
            "— The Teivaka team\n"
            "Kadavu, Fiji"
        ),
        "html": _verification_html(name, verify_url),
    }
    try:
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            content=json.dumps(payload),
            timeout=15.0,
        )
        if resp.status_code >= 400:
            logger.error(
                "Resend rejected verification email for %s: HTTP %d %s",
                to_email, resp.status_code, resp.text[:400],
            )
            return False
        logger.info("Verification email dispatched via Resend to %s", to_email)
        return True
    except Exception as exc:
        logger.exception("Resend REST call failed for %s: %s", to_email, exc)
        return False


def _verification_html(name: str, verify_url: str) -> str:
    return f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F5EFE0;font-family:Georgia,'Times New Roman',serif;color:#1A1410;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5EFE0;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border:1px solid #E0D5C0;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#2C1A0E;padding:28px 40px;">
          <div style="font-family:'Playfair Display',Georgia,serif;font-size:26px;color:#F5EFE0;letter-spacing:-0.5px;">
            Teivaka<span style="color:#3D8C40;">.</span>
          </div>
        </td></tr>
        <tr><td style="padding:40px;">
          <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:28px;color:#2C1A0E;margin:0 0 20px 0;line-height:1.25;">
            Verify your email
          </h1>
          <p style="font-size:16px;line-height:1.6;color:#1A1410;margin:0 0 24px 0;">Hello {name},</p>
          <p style="font-size:16px;line-height:1.6;color:#1A1410;margin:0 0 28px 0;">
            Thanks for creating a Teivaka account. Please confirm your email address
            to activate your workspace.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
            <tr><td style="background:#3D8C40;border-radius:8px;">
              <a href="{verify_url}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;font-family:Georgia,serif;">
                Verify email address
              </a>
            </td></tr>
          </table>
          <p style="font-size:13px;color:#6b6156;line-height:1.6;margin:0 0 6px 0;">Or paste this link into your browser:</p>
          <p style="font-size:13px;color:#3D8C40;word-break:break-all;margin:0 0 28px 0;">{verify_url}</p>
          <p style="font-size:13px;color:#6b6156;line-height:1.6;margin:0;">
            This link expires in 24 hours. If you didn't create an account,
            you can safely ignore this email.
          </p>
        </td></tr>
        <tr><td style="background:#F5EFE0;padding:20px 40px;border-top:1px solid #E0D5C0;">
          <p style="font-size:12px;color:#6b6156;margin:0;font-style:italic;">
            Built in Fiji, for the Pacific. Teivaka PTE LTD, Suva, Fiji.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""


def send_password_reset_email(to_email: str, token: str, name: str) -> bool:
    """
    Send a password reset email via Resend HTTPS API.
    Same pattern as send_verification_email — never raises.
    Only supports Resend for now because DigitalOcean blocks outbound SMTP.
    """
    if not _smtp_configured():
        reset_url = f"{settings.frontend_url.rstrip('/')}/reset-password?token={quote(token)}"
        logger.warning(
            "SMTP not configured — password reset email for %s not sent. Reset URL: %s",
            to_email, reset_url,
        )
        return False

    if not _is_resend():
        logger.warning("Password reset email only supports Resend — skipping for %s", to_email)
        return False

    reset_url = f"{settings.frontend_url.rstrip('/')}/reset-password?token={quote(token)}"
    api_key = settings.smtp_password.strip()
    payload = {
        "from": settings.smtp_from,
        "to": [to_email],
        "subject": "Reset your Teivaka password",
        "text": (
            f"Hello {name},\n\n"
            "We received a request to reset your Teivaka password. "
            "Click the link below to set a new password:\n\n"
            f"{reset_url}\n\n"
            "This link expires in 1 hour. If you didn't request this, "
            "you can safely ignore this email — your password won't change.\n\n"
            "— The Teivaka team\n"
            "Kadavu, Fiji"
        ),
        "html": _password_reset_html(name, reset_url),
    }
    try:
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            content=json.dumps(payload),
            timeout=15.0,
        )
        if resp.status_code >= 400:
            logger.error(
                "Resend rejected password reset email for %s: HTTP %d %s",
                to_email, resp.status_code, resp.text[:400],
            )
            return False
        logger.info("Password reset email dispatched via Resend to %s", to_email)
        return True
    except Exception as exc:
        logger.exception("Resend REST call failed for password reset %s: %s", to_email, exc)
        return False


def _password_reset_html(name: str, reset_url: str) -> str:
    return f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F5EFE0;font-family:Georgia,'Times New Roman',serif;color:#1A1410;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5EFE0;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border:1px solid #E0D5C0;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#2C1A0E;padding:28px 40px;">
          <div style="font-family:'Playfair Display',Georgia,serif;font-size:26px;color:#F5EFE0;letter-spacing:-0.5px;">
            Teivaka<span style="color:#3D8C40;">.</span>
          </div>
        </td></tr>
        <tr><td style="padding:40px;">
          <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:28px;color:#2C1A0E;margin:0 0 20px 0;line-height:1.25;">
            Reset your password
          </h1>
          <p style="font-size:16px;line-height:1.6;color:#1A1410;margin:0 0 24px 0;">Hello {name},</p>
          <p style="font-size:16px;line-height:1.6;color:#1A1410;margin:0 0 28px 0;">
            We received a request to reset your Teivaka password. Click the button below
            to choose a new password.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
            <tr><td style="background:#3D8C40;border-radius:8px;">
              <a href="{reset_url}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;font-family:Georgia,serif;">
                Reset password
              </a>
            </td></tr>
          </table>
          <p style="font-size:13px;color:#6b6156;line-height:1.6;margin:0 0 6px 0;">Or paste this link into your browser:</p>
          <p style="font-size:13px;color:#3D8C40;word-break:break-all;margin:0 0 28px 0;">{reset_url}</p>
          <p style="font-size:13px;color:#6b6156;line-height:1.6;margin:0;">
            This link expires in 1 hour. If you didn't request a password reset,
            you can safely ignore this email — your password won't change.
          </p>
        </td></tr>
        <tr><td style="background:#F5EFE0;padding:20px 40px;border-top:1px solid #E0D5C0;">
          <p style="font-size:12px;color:#6b6156;margin:0;font-style:italic;">
            Built in Fiji, for the Pacific. Teivaka PTE LTD, Suva, Fiji.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""


def _build_verification_message(to_email: str, token: str, name: str) -> EmailMessage:
    verify_url = f"{settings.frontend_url.rstrip('/')}/verify-email?token={quote(token)}"

    msg = EmailMessage()
    msg["Subject"] = "Verify your Teivaka account"
    msg["From"] = settings.smtp_from
    msg["To"] = to_email

    plain = (
        f"Hello {name},\n\n"
        "Thanks for creating a Teivaka account. Please confirm your email "
        "address by opening the link below in your browser:\n\n"
        f"{verify_url}\n\n"
        "This link expires in 24 hours. If you didn't create an account, "
        "you can safely ignore this email.\n\n"
        "— The Teivaka team\n"
        "Kadavu, Fiji"
    )
    msg.set_content(plain)
    msg.add_alternative(_verification_html(name, verify_url), subtype="html")
    return msg


def send_verification_email(to_email: str, token: str, name: str) -> bool:
    """
    Send an account verification email. Returns True if dispatched, False if
    SMTP is unconfigured (message is logged in that case — not an error).
    Never raises; callers must be able to complete registration regardless.
    """
    if not _smtp_configured():
        verify_url = f"{settings.frontend_url.rstrip('/')}/verify-email?token={quote(token)}"
        logger.warning(
            "SMTP not configured — verification email for %s not sent. "
            "Verification URL: %s",
            to_email, verify_url,
        )
        return False

    # Prefer Resend's HTTPS REST API when configured — most VPS hosts
    # (DigitalOcean, Linode, etc.) block outbound SMTP ports by default.
    if _is_resend():
        return _send_via_resend(to_email, token, name)

    try:
        msg = _build_verification_message(to_email, token, name)
        context = ssl.create_default_context()
        port = int(settings.smtp_port or 587)
        # Port 465 = SSL-on-connect (smtplib.SMTP_SSL). Anything else = STARTTLS.
        if port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, port, context=context, timeout=20) as server:
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, port, timeout=20) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        logger.info("Verification email sent to %s", to_email)
        return True
    except Exception as exc:
        # Dispatch failure must not block registration.
        logger.exception("Failed to send verification email to %s: %s", to_email, exc)
        return False
