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
from datetime import date, datetime, timezone
from app.workers.celery_app import app as celery_app
from app.workers.rls_helpers import with_rls
from app.config import settings
from app.utils.email import send_task_digest_email
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
        # Stage 1: enumerate active tenants (tenant.tenants has no RLS policy).
        cur = conn.cursor()
        cur.execute("""
            SELECT tenant_id::TEXT AS tenant_id
            FROM tenant.tenants
            WHERE subscription_status = 'ACTIVE'
        """)
        tenants = cur.fetchall()
        cur.close()
        conn.commit()

        batches_sent = 0
        farms_checked = 0

        for tenant in tenants:
            tenant_id = tenant["tenant_id"]

            # Stage 2: per-tenant LOW alerts under RLS context.
            with with_rls(conn, tenant_id) as cur:
                cur.execute(
                    """
                    SELECT DISTINCT farm_id
                    FROM tenant.alerts
                    WHERE severity = 'LOW'
                      AND alert_status = 'ACTIVE'
                      AND whatsapp_sent = false
                      AND triggered_at > NOW() - INTERVAL '2 hours'
                    """
                )
                farms = cur.fetchall()

                for farm in farms:
                    farm_id = farm["farm_id"]
                    farms_checked += 1
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
            conn.commit()

        return {"batches_sent": batches_sent, "farms_checked": farms_checked}
    finally:
        conn.close()


# ─── P3b: external task alerts (overdue OPEN tasks → WhatsApp/email) ─────────────
#
# Per Inviolable PR.2 (Alert Path Receipt Verification): the scheduled sweep
# below is a no-op until settings.task_alerts_enabled is flipped True — which an
# Operator does ONLY after receipt-verifying the channel end-to-end via
# send_task_alert_test and recording the receipt in the strike archive. Every
# dispatch is logged to tenant.task_notifications (provider message id + status),
# and SENT is never conflated with "delivered" — only an Operator receipt sets
# receipt_confirmed_at on those rows.

TASK_ALERT_ROLES = ["FOUNDER", "MANAGER"]


def _due_phrase(due) -> str:
    """Human due/overdue phrase from a date (psycopg2 returns datetime.date)."""
    if due is None:
        return "due"
    today = date.today()
    if due < today:
        return f"overdue {(today - due).days}d"
    if due == today:
        return "due today"
    return f"due {due.isoformat()}"


def _record_task_notification(cur, tenant_id, farm_id, task_id, channel,
                              recipient, status, provider_message_id, error,
                              is_test=False):
    """Append one row to the delivery log (under the caller's RLS cursor)."""
    cur.execute(
        """
        INSERT INTO tenant.task_notifications
            (tenant_id, farm_id, task_id, channel, recipient,
             status, provider_message_id, error, is_test)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (tenant_id, farm_id, task_id, channel, recipient,
         status, provider_message_id, error, is_test),
    )


def _dispatch_farm_task_digest(cur, tenant_id, farm_id, items) -> dict:
    """Send one overdue-task digest for a farm. WhatsApp primary, email fallback.

    `items` = list of dicts {task_id, imperative, due_date}. Records one
    task_notifications row per task on the channel actually used. Returns a
    small summary dict. Caller's cursor already has RLS context set.
    """
    # Recipients for this farm's tenant (FOUNDER/MANAGER).
    cur.execute(
        """
        SELECT full_name, whatsapp_number, email
        FROM tenant.users
        WHERE tenant_id = %s
          AND role = ANY(%s)
          AND is_active = true
        """,
        (tenant_id, TASK_ALERT_ROLES),
    )
    recipients = cur.fetchall()
    wa = [r for r in recipients if r.get("whatsapp_number")]
    em = [r for r in recipients if r.get("email")]

    lines = [f"{it['imperative']} ({_due_phrase(it['due_date'])})" for it in items]

    # ---- WhatsApp (primary) -------------------------------------------------
    if wa:
        body = (
            f"You have {len(items)} task(s) due or overdue for {farm_id}:\n\n• "
            + "\n• ".join(lines)
        )
        primary = wa[0]["whatsapp_number"]
        first_status, first_id, first_err = "FAILED", None, None
        for r in wa:
            res = _send_whatsapp_sync(r["whatsapp_number"], body, "HIGH")
            st = {"sent": "SENT", "mock_sent": "MOCK", "failed": "FAILED"}.get(res["status"], "FAILED")
            if r["whatsapp_number"] == primary:
                first_status, first_id, first_err = st, res.get("message_id"), res.get("error")
        for it in items:
            _record_task_notification(
                cur, tenant_id, farm_id, it["task_id"], "whatsapp",
                primary, first_status, first_id, first_err,
            )
        return {"channel": "whatsapp", "recipients": len(wa), "tasks": len(items), "status": first_status}

    # ---- Email (fallback) ---------------------------------------------------
    if em:
        primary = em[0]["email"]
        ok, msg_id = send_task_digest_email(
            primary, em[0].get("full_name") or "there", farm_id, lines,
        )
        st = "SENT" if ok else "FAILED"
        for it in items:
            _record_task_notification(
                cur, tenant_id, farm_id, it["task_id"], "email",
                primary, st, msg_id, None if ok else "resend send failed",
            )
        return {"channel": "email", "recipients": len(em), "tasks": len(items), "status": st}

    return {"channel": "none", "recipients": 0, "tasks": len(items), "status": "SKIPPED"}


@celery_app.task(
    name="app.workers.notification_worker.notify_due_tasks",
    queue="notifications",
)
def notify_due_tasks():
    """Sweep overdue/due-today HIGH+CRITICAL OPEN tasks and alert externally.

    No-op unless settings.task_alerts_enabled (PR.2). Dedupes against
    tenant.task_notifications so a task is not re-pinged within the lookback
    window. Cross-tenant scan is STRUCTURAL (enumerate tenants, then per-tenant
    with_rls) per the worker doctrine.
    """
    if not settings.task_alerts_enabled:
        logger.info("notify_due_tasks: disabled (task_alerts_enabled=False) — "
                    "PR.2 receipt verification pending")
        return {"skipped": "disabled", "reason": "PR.2 receipt verification pending"}

    conn = get_sync_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT tenant_id::TEXT AS tenant_id
            FROM tenant.tenants
            WHERE subscription_status = 'ACTIVE'
        """)
        tenants = cur.fetchall()
        cur.close()
        conn.commit()

        farms_alerted = 0
        tasks_alerted = 0

        for tenant in tenants:
            tenant_id = tenant["tenant_id"]
            with with_rls(conn, tenant_id) as cur:
                cur.execute(
                    """
                    SELECT t.task_id, t.farm_id, t.imperative, t.due_date
                    FROM tenant.task_queue t
                    WHERE t.status = 'OPEN'
                      AND t.task_rank <= %s
                      AND t.due_date IS NOT NULL
                      AND t.due_date <= CURRENT_DATE
                      AND NOT EXISTS (
                          SELECT 1 FROM tenant.task_notifications n
                          WHERE n.task_id = t.task_id
                            AND n.status IN ('SENT','MOCK')
                            AND n.sent_at > NOW() - make_interval(days => %s)
                      )
                    ORDER BY t.farm_id, t.task_rank
                    """,
                    (settings.task_alert_max_rank, settings.task_alert_lookback_days),
                )
                rows = cur.fetchall()

                by_farm: dict = {}
                for r in rows:
                    by_farm.setdefault(r["farm_id"], []).append({
                        "task_id": r["task_id"],
                        "imperative": r["imperative"],
                        "due_date": r["due_date"],
                    })

                for farm_id, items in by_farm.items():
                    res = _dispatch_farm_task_digest(cur, tenant_id, farm_id, items)
                    if res["status"] in ("SENT", "MOCK"):
                        farms_alerted += 1
                        tasks_alerted += len(items)
            conn.commit()

        return {"farms_alerted": farms_alerted, "tasks_alerted": tasks_alerted,
                "tenants_scanned": len(tenants)}
    finally:
        conn.close()


@celery_app.task(
    name="app.workers.notification_worker.send_task_alert_test",
    queue="notifications",
)
def send_task_alert_test(channel: str, recipient: str,
                         tenant_id: str = None, farm_id: str = None):
    """PR.2 receipt-verification path — fire ONE test alert and return the
    delivery id + send timestamp for the strike archive.

    Ignores task_alerts_enabled by design: this is how an Operator proves the
    channel reaches a real inbox BEFORE enabling the scheduled sweep. If both
    tenant_id and farm_id are given the send is also logged to
    tenant.task_notifications with is_test=true.
    """
    msg = ("TFOS test alert — if you can read this, the alert path works. "
           "Please reply to confirm receipt (PR.2 receipt verification).")
    if channel == "whatsapp":
        res = _send_whatsapp_sync(recipient, msg, "INFO")
        status = {"sent": "SENT", "mock_sent": "MOCK", "failed": "FAILED"}.get(res["status"], "FAILED")
        provider_id, error = res.get("message_id"), res.get("error")
    elif channel == "email":
        ok, provider_id = send_task_digest_email(
            recipient, "Operator", "RECEIPT TEST",
            ["This is a PR.2 receipt-verification test alert. Reply to confirm."],
        )
        status, error = ("SENT", None) if ok else ("FAILED", "resend send failed")
    else:
        return {"error": f"unknown channel: {channel}"}

    sent_at = datetime.now(timezone.utc).isoformat()

    if tenant_id and farm_id:
        conn = get_sync_db()
        try:
            with with_rls(conn, tenant_id) as cur:
                _record_task_notification(
                    cur, tenant_id, farm_id, None, channel,
                    recipient, status, provider_id, error, is_test=True,
                )
            conn.commit()
        finally:
            conn.close()

    return {
        "channel": channel, "recipient": recipient, "status": status,
        "provider_message_id": provider_id, "error": error, "sent_at": sent_at,
    }
