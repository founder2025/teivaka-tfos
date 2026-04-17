"""
Notification worker — WhatsApp dispatch via Meta Cloud API.
Handles severity-based delivery timing and batched LOW alerts.

Provider: Meta WhatsApp Cloud API (not Twilio).
Required env vars:
  META_WHATSAPP_TOKEN    — Permanent system user access token from Meta dashboard
  META_PHONE_NUMBER_ID   — Phone Number ID (from Meta → WhatsApp → API Setup)

Falls back to console mock when META_WHATSAPP_TOKEN is empty (dev/test mode).
"""
import psycopg2
import psycopg2.extras
import httpx
from app.workers.celery_app import app as celery_app
from app.config import settings
import logging

logger = logging.getLogger(__name__)

# Meta Cloud API endpoint — send message to a single recipient
META_API_URL = "https://graph.facebook.com/v19.0/{phone_number_id}/messages"

# Severity → emoji prefix for WhatsApp message readability
SEVERITY_PREFIX = {
    "CRITICAL": "🚨 CRITICAL",
    "HIGH":     "⚠ HIGH",
    "MEDIUM":   "📋 MEDIUM",
    "LOW":      "ℹ LOW",
    "INFO":     "💬 INFO",
}


def get_sync_db():
    """Returns a synchronous psycopg2 connection (for Celery workers)."""
    db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(db_url, cursor_factory=psycopg2.extras.RealDictCursor)


def _send_whatsapp_sync(to_number: str, message: str, severity: str) -> dict:
    """
    Sends a WhatsApp text message via Meta Cloud API.

    Falls back to mock (console log) when META_WHATSAPP_TOKEN or
    META_PHONE_NUMBER_ID is not configured — safe for dev environments.

    Args:
        to_number: Recipient phone number in E.164 format, e.g. "+6798730866"
        message:   Message body text (max 4096 chars)
        severity:  CRITICAL | HIGH | MEDIUM | LOW | INFO

    Returns:
        dict with status ("sent" | "mock_sent" | "failed") and message_id or error
    """
    if not settings.meta_whatsapp_token or not settings.meta_phone_number_id:
        logger.info(
            "[MOCK WA] %s -> %s: %s...",
            severity, to_number, message[:80]
        )
        return {"status": "mock_sent", "message_id": "MOCK_MSG_ID"}

    prefix = SEVERITY_PREFIX.get(severity, "📣 ALERT")
    body = f"{prefix} — Teivaka TFOS\n\n{message}"

    # Ensure number is in E.164 without leading '+' for Meta API
    clean_number = to_number.lstrip("+")

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": clean_number,
        "type": "text",
        "text": {
            "preview_url": False,
            "body": body,
        },
    }

    url = META_API_URL.format(phone_number_id=settings.meta_phone_number_id)
    headers = {
        "Authorization": f"Bearer {settings.meta_whatsapp_token}",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.post(url, json=payload, headers=headers)

        if response.status_code == 200:
            data = response.json()
            message_id = data.get("messages", [{}])[0].get("id", "unknown")
            logger.info(
                "WA sent via Meta API: %s -> %s (msg_id=%s)",
                severity, to_number, message_id
            )
            return {"status": "sent", "message_id": message_id}
        else:
            error_detail = response.text[:300]
            logger.error(
                "Meta API error %s sending to %s: %s",
                response.status_code, to_number, error_detail
            )
            return {
                "status": "failed",
                "error": f"HTTP {response.status_code}: {error_detail}",
            }

    except httpx.TimeoutException:
        logger.error("Meta API timeout sending to %s", to_number)
        return {"status": "failed", "error": "timeout"}
    except httpx.RequestError as e:
        logger.error("Meta API request error sending to %s: %s", to_number, e)
        return {"status": "failed", "error": str(e)}


def dispatch_whatsapp_to_roles(
    tenant_id: str,
    farm_id: str,
    severity: str,
    message: str,
    notify_roles: list,
) -> int:
    """
    Looks up all active users in `notify_roles` for this tenant and
    sends each one a WhatsApp message via Meta Cloud API.

    Returns the count of successfully dispatched messages.
    """
    conn = get_sync_db()
    sent = 0
    try:
        cur = conn.cursor()
        # Set RLS context so the query only sees this tenant's users
        cur.execute("SET LOCAL app.tenant_id = %s", (tenant_id,))
        cur.execute(
            """
            SELECT whatsapp_number, full_name, role
            FROM tenant.users
            WHERE tenant_id = %s
              AND role = ANY(%s)
              AND whatsapp_number IS NOT NULL
              AND is_active = true
            """,
            (tenant_id, notify_roles),
        )
        recipients = cur.fetchall()

        for r in recipients:
            result = _send_whatsapp_sync(r["whatsapp_number"], message, severity)
            if result["status"] in ("sent", "mock_sent"):
                sent += 1
                logger.info(
                    "WA dispatched to %s (%s): %s",
                    r["full_name"], r["role"], result.get("message_id")
                )

        # Stamp matching open alerts as dispatched
        if sent > 0:
            cur.execute(
                """
                UPDATE tenant.alerts
                   SET whatsapp_sent = true,
                       whatsapp_sent_at = NOW()
                 WHERE farm_id = %s
                   AND whatsapp_sent = false
                   AND triggered_at > NOW() - INTERVAL '15 minutes'
                   AND severity = %s
                """,
                (farm_id, severity),
            )
            conn.commit()

        return sent

    except Exception as e:
        conn.rollback()
        logger.error("dispatch_whatsapp_to_roles error: %s", e, exc_info=True)
        return 0
    finally:
        conn.close()


# ─── Celery Tasks ──────────────────────────────────────────────────────────────

@celery_app.task(
    name="app.workers.notification_worker.send_whatsapp_alert",
    bind=True,
    max_retries=5,
    default_retry_delay=60,
    queue="notifications",
)
def send_whatsapp_alert(
    self,
    tenant_id: str,
    farm_id: str,
    severity: str,
    message: str,
    notify_roles: list,
):
    """
    Dispatches a single WhatsApp alert to all users in notify_roles.
    Retries up to 5 times on failure (60-second backoff).
    """
    try:
        sent = dispatch_whatsapp_to_roles(
            tenant_id, farm_id, severity, message, notify_roles
        )
        return {"sent": sent, "severity": severity, "farm_id": farm_id}
    except Exception as e:
        raise self.retry(exc=e)


@celery_app.task(
    name="app.workers.notification_worker.send_whatsapp_direct",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    queue="notifications",
)
def send_whatsapp_direct(
    self,
    to_number: str,
    message: str,
    severity: str = "INFO",
):
    """
    Sends a WhatsApp message directly to a single phone number.
    Used for CRITICAL alerts (RULE-034, RULE-038, RULE-021) where
    a specific number must be reached regardless of role lookup.

    Args:
        to_number: E.164 format, e.g. "+6798730866"
        message:   Message body
        severity:  Severity prefix label
    """
    try:
        result = _send_whatsapp_sync(to_number, message, severity)
        if result["status"] == "failed":
            raise RuntimeError(f"WhatsApp send failed: {result.get('error')}")
        return result
    except Exception as e:
        raise self.retry(exc=e)


@celery_app.task(
    name="app.workers.notification_worker.send_batched_low_alerts",
    queue="notifications",
)
def send_batched_low_alerts():
    """
    Hourly digest of LOW severity alerts.
    Groups all pending LOW alerts per farm into a single WhatsApp message
    to avoid notification fatigue from individual LOW-level pings.
    """
    conn = get_sync_db()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT DISTINCT tenant_id::TEXT, farm_id
            FROM tenant.alerts
            WHERE severity = 'LOW'
              AND alert_status = 'ACTIVE'
              AND whatsapp_sent = false
              AND triggered_at > NOW() - INTERVAL '2 hours'
            """
        )
        farms = cur.fetchall()
        batches_sent = 0

        for farm in farms:
            tenant_id = farm["tenant_id"]
            farm_id = farm["farm_id"]
            cur.execute("SET LOCAL app.tenant_id = %s", (tenant_id,))
            cur.execute(
                """
                SELECT title, message FROM tenant.alerts
                WHERE farm_id = %s
                  AND severity = 'LOW'
                  AND alert_status = 'ACTIVE'
                  AND whatsapp_sent = false
                ORDER BY triggered_at DESC
                LIMIT 5
                """,
                (farm_id,),
            )
            alerts = cur.fetchall()
            if alerts:
                digest = (
                    f"📋 Daily digest — {len(alerts)} LOW alert(s) for {farm_id}:\n\n"
                    + "\n• ".join([a["title"] for a in alerts])
                )
                dispatch_whatsapp_to_roles(
                    tenant_id, farm_id, "LOW", digest, ["FOUNDER", "MANAGER"]
                )
                batches_sent += 1

        return {"batches_sent": batches_sent, "farms_checked": len(farms)}
    finally:
        conn.close()
