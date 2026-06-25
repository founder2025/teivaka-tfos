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


def _logo_url() -> str:
    """Absolute URL to the real Teivaka lockup (teal leaf-mark + TEIVAKA
    wordmark, light variant for dark backgrounds) — the same asset the web app
    and marketing site use. Email clients require an absolute https URL; Caddy
    serves it from the frontend build at /teivaka-lockup.png. This replaces the
    old serif text wordmark so transactional email matches the app's brand."""
    return f"{settings.frontend_url.rstrip('/')}/teivaka-lockup.png"


def _verify_url(token: str, uid: str | None = None) -> str:
    """Build the verification link. Carries the user id alongside the token so the
    verify page can recognise an already-verified account even when the one-time
    token has been consumed by an email-provider link scanner (Gmail, Outlook
    SafeLinks, antivirus, mobile preview) — the link can then never wrongly read
    as 'invalid/already used' for a real, verified user. uid is an opaque uuid."""
    url = f"{settings.frontend_url.rstrip('/')}/verify-email?token={quote(token)}"
    if uid:
        url += f"&uid={quote(str(uid))}"
    return url


def _send_via_resend(to_email: str, token: str, name: str, uid: str | None = None) -> bool:
    """Dispatch via Resend's HTTPS REST API. Uses the same credential (SMTP_PASSWORD)."""
    verify_url = _verify_url(token, uid)
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
        <tr><td style="background:#2C1A0E;padding:24px 40px;">
          <img src="{_logo_url()}" alt="Teivaka" width="170" height="37"
               style="display:block;width:170px;height:37px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;color:#F5EFE0;font-family:Georgia,serif;font-size:24px;font-weight:bold;letter-spacing:0.5px;" />
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


def _otp_html(name: str, code: str, minutes: int) -> str:
    return f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F5EFE0;font-family:Georgia,'Times New Roman',serif;color:#1A1410;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5EFE0;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border:1px solid #E0D5C0;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#2C1A0E;padding:24px 40px;">
          <img src="{_logo_url()}" alt="Teivaka" width="170" height="37"
               style="display:block;width:170px;height:37px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;color:#F5EFE0;font-family:Georgia,serif;font-size:24px;font-weight:bold;letter-spacing:0.5px;" />
        </td></tr>
        <tr><td style="padding:40px;">
          <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:28px;color:#2C1A0E;margin:0 0 20px 0;line-height:1.25;">
            Your verification code
          </h1>
          <p style="font-size:16px;line-height:1.6;color:#1A1410;margin:0 0 24px 0;">Hello {name},</p>
          <p style="font-size:16px;line-height:1.6;color:#1A1410;margin:0 0 28px 0;">
            Enter this code to verify your email and finish setting up your Teivaka account:
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
            <tr><td style="background:#F5EFE0;border:1px solid #E0D5C0;border-radius:8px;padding:18px 32px;">
              <span style="font-family:'Courier New',monospace;font-size:34px;font-weight:bold;letter-spacing:10px;color:#2C1A0E;">{code}</span>
            </td></tr>
          </table>
          <p style="font-size:13px;color:#6b6156;line-height:1.6;margin:0;">
            This code expires in {minutes} minutes. If you didn't create an account,
            you can safely ignore this email — never share this code with anyone.
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


def send_otp_email(to_email: str, code: str, name: str) -> bool:
    """Send a 6-digit signup verification code via Resend's HTTPS API. Never
    raises; returns True on accepted dispatch. The code is rendered in the body
    but is never logged here (callers must not log it either)."""
    minutes = settings.email_otp_expire_minutes
    if not _is_resend():
        # Dev / unconfigured: surface that we couldn't send so the caller can
        # honestly tell the user, but never print the code in a real deployment.
        logger.warning("Email OTP skipped for %s — Resend not configured", to_email)
        return False
    api_key = settings.smtp_password.strip()
    payload = {
        "from": settings.smtp_from,
        "to": [to_email],
        "subject": f"Your Teivaka code: {code}",
        "text": (
            f"Hello {name},\n\n"
            f"Your Teivaka verification code is: {code}\n\n"
            f"It expires in {minutes} minutes. If you didn't create an account, "
            "you can ignore this email. Never share this code with anyone.\n\n"
            "— The Teivaka team\nSuva, Fiji"
        ),
        "html": _otp_html(name, code, minutes),
    }
    try:
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            content=json.dumps(payload),
            timeout=15.0,
        )
        if resp.status_code >= 400:
            logger.error("Resend rejected OTP email for %s: HTTP %d %s",
                         to_email, resp.status_code, resp.text[:400])
            return False
        logger.info("OTP email dispatched via Resend to %s", to_email)
        return True
    except Exception as exc:  # noqa: BLE001 — never break signup on telemetry/email
        logger.exception("Resend OTP call failed for %s: %s", to_email, exc)
        return False


def send_waitlist_notification(name: str, email: str, country: str, role: str | None, total: int) -> bool:
    """Notify the team that someone joined the launch waitlist. Best-effort —
    never raises (a failed notify must not fail the visitor's signup)."""
    if not _is_resend():
        logger.warning("Waitlist notify skipped (Resend not configured) — %s", email)
        return False
    api_key = settings.smtp_password.strip()
    to = settings.waitlist_notify_email
    payload = {
        "from": settings.smtp_from,
        "to": [to],
        "subject": f"New launch-waitlist signup: {name} ({email})",
        "text": (
            f"New Teivaka launch-waitlist signup:\n\n"
            f"Name:    {name}\n"
            f"Email:   {email}\n"
            f"Country: {country or '—'}\n"
            f"Role:    {role or '—'}\n\n"
            f"Total on the waitlist: {total}\n"
        ),
    }
    try:
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            content=json.dumps(payload),
            timeout=15.0,
        )
        if resp.status_code >= 400:
            logger.error("Resend rejected waitlist notify: HTTP %d %s", resp.status_code, resp.text[:300])
            return False
        return True
    except Exception as exc:  # noqa: BLE001
        logger.exception("Resend waitlist notify failed: %s", exc)
        return False


def send_password_reset_email(to_email: str, token: str, name: str) -> bool:
    """
    Send a password reset email via Resend HTTPS API.
    Same pattern as send_verification_email — never raises.
    Only supports Resend for now because DigitalOcean blocks outbound SMTP.
    """
    # Resend is the only live path (DO blocks SMTP). It needs just the API key,
    # so gate on _is_resend() — not _smtp_configured() which requires an
    # smtp_host the key-only prod env doesn't set.
    if not _is_resend():
        reset_url = f"{settings.frontend_url.rstrip('/')}/reset-password?token={quote(token)}"
        logger.warning(
            "Email not configured (no Resend key) — password reset email for %s "
            "not sent. Reset URL: %s",
            to_email, reset_url,
        )
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


def send_task_digest_email(
    to_email: str,
    name: str,
    farm_label: str,
    lines: list[str],
) -> tuple[bool, str | None]:
    """Send an overdue-task digest email via Resend's HTTPS REST API.

    Returns (ok, provider_message_id). Never raises. provider_message_id is
    Resend's message id when available — recorded in tenant.task_notifications
    so the send is auditable and (per PR.2) receipt-verifiable.
    """
    if not _is_resend():
        logger.warning("Task digest email skipped for %s — Resend not configured", to_email)
        return (False, None)

    api_key = settings.smtp_password.strip()
    tasks_url = f"{settings.frontend_url.rstrip('/')}/farm/tasks"
    bullet_text = "\n".join(f"  • {ln}" for ln in lines)
    bullet_html = "".join(
        f'<li style="margin:0 0 8px 0;font-size:15px;line-height:1.5;color:#1A1410;">{ln}</li>'
        for ln in lines
    )
    payload = {
        "from": settings.smtp_from,
        "to": [to_email],
        "subject": f"{len(lines)} task{'s' if len(lines) != 1 else ''} need attention — {farm_label}",
        "text": (
            f"Hello {name},\n\n"
            f"These tasks are due or overdue at {farm_label}:\n\n"
            f"{bullet_text}\n\n"
            f"Open your task list: {tasks_url}\n\n"
            "— Teivaka TFOS\n"
        ),
        "html": _task_digest_html(name, farm_label, bullet_html, tasks_url),
    }
    try:
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            content=json.dumps(payload),
            timeout=15.0,
        )
        if resp.status_code >= 400:
            logger.error(
                "Resend rejected task digest for %s: HTTP %d %s",
                to_email, resp.status_code, resp.text[:400],
            )
            return (False, None)
        msg_id = None
        try:
            msg_id = resp.json().get("id")
        except Exception:
            pass
        logger.info("Task digest dispatched via Resend to %s (id=%s)", to_email, msg_id)
        return (True, msg_id)
    except Exception as exc:
        logger.exception("Resend REST call failed for task digest %s: %s", to_email, exc)
        return (False, None)


def _task_digest_html(name: str, farm_label: str, bullet_html: str, tasks_url: str) -> str:
    return f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F5EFE0;font-family:Georgia,'Times New Roman',serif;color:#1A1410;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5EFE0;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border:1px solid #E0D5C0;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#2C1A0E;padding:24px 40px;">
          <img src="{_logo_url()}" alt="Teivaka" width="170" height="37"
               style="display:block;width:170px;height:37px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;color:#F5EFE0;font-family:Georgia,serif;font-size:24px;font-weight:bold;letter-spacing:0.5px;" />
        </td></tr>
        <tr><td style="padding:40px;">
          <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:26px;color:#2C1A0E;margin:0 0 18px 0;line-height:1.25;">
            Tasks need attention
          </h1>
          <p style="font-size:16px;line-height:1.6;color:#1A1410;margin:0 0 18px 0;">Hello {name},</p>
          <p style="font-size:16px;line-height:1.6;color:#1A1410;margin:0 0 16px 0;">
            These tasks are due or overdue at <strong>{farm_label}</strong>:
          </p>
          <ul style="margin:0 0 28px 0;padding:0 0 0 20px;">{bullet_html}</ul>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">
            <tr><td style="background:#3D8C40;border-radius:8px;">
              <a href="{tasks_url}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;font-family:Georgia,serif;">
                Open task list
              </a>
            </td></tr>
          </table>
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
        <tr><td style="background:#2C1A0E;padding:24px 40px;">
          <img src="{_logo_url()}" alt="Teivaka" width="170" height="37"
               style="display:block;width:170px;height:37px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;color:#F5EFE0;font-family:Georgia,serif;font-size:24px;font-weight:bold;letter-spacing:0.5px;" />
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


def _build_verification_message(to_email: str, token: str, name: str, uid: str | None = None) -> EmailMessage:
    verify_url = _verify_url(token, uid)

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


def send_verification_email(to_email: str, token: str, name: str, uid: str | None = None) -> bool:
    """
    Send an account verification email. Returns True if dispatched, False if
    SMTP is unconfigured (message is logged in that case — not an error).
    Never raises; callers must be able to complete registration regardless.
    """
    # Prefer Resend's HTTPS REST API whenever a Resend key is present — most VPS
    # hosts (DigitalOcean, Linode, etc.) block outbound SMTP ports, so Resend is
    # the live path. It needs only the API key (smtp_password, "re_..."), NOT an
    # smtp_host — so this is checked BEFORE _smtp_configured(), otherwise a
    # key-only prod env (the health-monitor alert path, PR.2) silently skips
    # sending verification mail.
    if _is_resend():
        return _send_via_resend(to_email, token, name, uid)

    if not _smtp_configured():
        verify_url = _verify_url(token, uid)
        logger.warning(
            "Email not configured (no Resend key, no SMTP host) — verification "
            "email for %s not sent. Verification URL: %s",
            to_email, verify_url,
        )
        return False

    try:
        msg = _build_verification_message(to_email, token, name, uid)
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


def send_document_email(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
    attachment_bytes: bytes | None = None,
    attachment_filename: str = "document.pdf",
    attachment_mime: tuple[str, str] = ("application", "pdf"),
) -> bool:
    """Generic transactional email with an optional file attachment.

    Prefers Resend's HTTPS API (most VPS hosts block SMTP); falls back to SMTP
    STARTTLS/SSL. Returns True if dispatched, False if email is unconfigured or
    the send fails (logged, never raised) — callers must keep working regardless.
    """
    import base64

    if _is_resend():
        try:
            payload = {
                "from": settings.smtp_from,
                "to": [to_email],
                "subject": subject,
                "text": text_body,
            }
            if html_body:
                payload["html"] = html_body
            if attachment_bytes is not None:
                payload["attachments"] = [{
                    "filename": attachment_filename,
                    "content": base64.b64encode(attachment_bytes).decode("ascii"),
                }]
            resp = httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.smtp_password.strip()}",
                         "Content-Type": "application/json"},
                content=json.dumps(payload), timeout=20.0,
            )
            if resp.status_code in (200, 201):
                logger.info("Document email sent to %s (%s)", to_email, subject)
                return True
            logger.error("Resend document email failed %s: %s", resp.status_code, resp.text[:300])
            return False
        except Exception as exc:  # noqa: BLE001
            logger.exception("Resend document email error to %s: %s", to_email, exc)
            return False

    if not _smtp_configured():
        logger.warning("Email not configured — document email '%s' for %s not sent.", subject, to_email)
        return False

    try:
        msg = EmailMessage()
        msg["From"] = settings.smtp_from
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.set_content(text_body)
        if html_body:
            msg.add_alternative(html_body, subtype="html")
        if attachment_bytes is not None:
            msg.add_attachment(attachment_bytes, maintype=attachment_mime[0],
                               subtype=attachment_mime[1], filename=attachment_filename)
        context = ssl.create_default_context()
        port = int(settings.smtp_port or 587)
        if port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, port, context=context, timeout=20) as server:
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, port, timeout=20) as server:
                server.ehlo(); server.starttls(context=context); server.ehlo()
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        logger.info("Document email sent to %s (%s)", to_email, subject)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to send document email to %s: %s", to_email, exc)
        return False
