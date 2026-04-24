"""
ops.run_health_checks — platform-wide infrastructure health monitor.

Runs in the worker-ai container on Celery Beat every 15 min. Writes one row
per check to ops.health_checks. Fires a CRITICAL alert (email) after 3
consecutive FAILs for any check_name. Auto-resolves when the check passes
again.

Why this exists: on 2026-04-18 the tis-bridge systemd unit stopped and was
not noticed for ~2 days. Monitoring ships before Phase 4 so that outages
are caught in minutes, not days.

Checks (all pure-Python, no host-socket mounts needed):
  a. api_health         — HTTPS GET  /api/v1/health
  b. tis_chat           — HTTPS POST /tis/chat       (exercises bridge + openclaw)
  c. tis_service        — HTTP  POST to bridge /chat (openclaw must execute)
  d. tis_bridge_service — HTTP  GET  to bridge /health
  e. docker_{api,db,redis,caddy,worker_ai}
     — network/DB/Redis reachability (functional equivalent of `docker ps`
       without needing /var/run/docker.sock in the container)

Spec deviation: the original spec said to use subprocess `systemctl
is-active` and `docker ps` for (c)(d)(e). The worker-ai container has
neither systemctl nor docker CLI, and adding host-socket mounts was out of
scope. These proxy checks detect the same failure modes (tis-bridge dying,
a container becoming unreachable) that motivated the task.

Env vars read (flagged in final report):
  - DATABASE_URL       (already in .env) — via settings.database_url
  - REDIS_URL          (already in .env) — via settings.redis_url
  - SMTP_PASSWORD      (already in .env) — reused as Resend API key
  - MONITORING_ALERT_EMAIL (NEW — documented in .env.example)
  - TIS_BRIDGE_TOKEN / OPENCLAW_BRIDGE_TOKEN
        NOT currently exposed to the worker-ai container. The task falls
        back to unauthenticated calls if missing; tis_chat and tis_service
        will then FAIL with HTTP 401 until Cody adds the token to .env.

Alert channels:
  * email (Resend, via raw httpx — master doc: no SDK)
  * whatsapp — TODO next session (OpenClaw push)
"""
from __future__ import annotations

import logging
import os
import socket
import time
from datetime import datetime, timezone

import httpx
import psycopg2
import psycopg2.extras
import redis

from app.config import settings
from app.workers.celery_app import app as celery_app

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CHECKS_IN_ORDER = [
    "api_health",
    "tis_chat",
    "tis_service",
    "tis_bridge_service",
    "docker_api",
    "docker_db",
    "docker_redis",
    "docker_caddy",
    "docker_worker_ai",
]

BRIDGE_TOKEN = (
    os.getenv("OPENCLAW_BRIDGE_TOKEN")
    or os.getenv("TIS_BRIDGE_TOKEN")
    or ""
)

API_HEALTH_URL     = os.getenv("MONITORING_API_URL", "https://teivaka.com/api/v1/health")
TIS_CHAT_URL       = os.getenv("MONITORING_TIS_URL", "https://teivaka.com/tis/chat")
BRIDGE_INTERNAL_URL = os.getenv("MONITORING_BRIDGE_URL", "http://172.20.0.1:18790")
CADDY_PUBLIC_URL   = os.getenv("MONITORING_CADDY_URL", "https://teivaka.com/")
API_INTERNAL_URL   = os.getenv("MONITORING_API_INTERNAL_URL", "http://teivaka_api:8000/api/v1/health")

CONSECUTIVE_FAIL_THRESHOLD = 3


# ---------------------------------------------------------------------------
# DB helper (sync — mirrors maintenance_worker pattern)
# ---------------------------------------------------------------------------

def _get_sync_db():
    db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(db_url, cursor_factory=psycopg2.extras.RealDictCursor)


# ---------------------------------------------------------------------------
# Individual checks — each returns (status, response_time_ms, error_detail)
# ---------------------------------------------------------------------------

def _check_api_health() -> tuple[str, int | None, str | None]:
    start = time.monotonic()
    try:
        r = httpx.get(API_HEALTH_URL, timeout=10.0)
        elapsed = int((time.monotonic() - start) * 1000)
        if r.status_code != 200:
            return "FAIL", elapsed, f"HTTP {r.status_code}: {r.text[:200]}"
        data = r.json()
        if data.get("status") != "healthy":
            return "FAIL", elapsed, f"status={data.get('status')} services={data.get('services')}"
        return "PASS", elapsed, None
    except Exception as e:
        return "FAIL", int((time.monotonic() - start) * 1000), f"{type(e).__name__}: {e}"


def _tis_chat_request(url: str, timeout: float) -> tuple[int, str | None, dict | str | None]:
    """Shared helper — returns (status_code, error, parsed_json_or_text)."""
    headers = {"Content-Type": "application/json"}
    if BRIDGE_TOKEN:
        headers["Authorization"] = f"Bearer {BRIDGE_TOKEN}"
    try:
        r = httpx.post(
            url,
            headers=headers,
            json={
                "message": "ping",
                "user_id": "U-MONITOR",
                "farm_id": "F001",
                "session_id": "tfos-monitor",
            },
            timeout=timeout,
        )
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}", None
    try:
        return r.status_code, None, r.json()
    except Exception:
        return r.status_code, None, r.text


def _check_tis_chat() -> tuple[str, int | None, str | None]:
    start = time.monotonic()
    code, err, body = _tis_chat_request(TIS_CHAT_URL, 120.0)
    elapsed = int((time.monotonic() - start) * 1000)
    if err:
        return "FAIL", elapsed, err
    if code != 200:
        excerpt = (body if isinstance(body, str) else str(body))[:200]
        return "FAIL", elapsed, f"HTTP {code}: {excerpt}"
    return "PASS", elapsed, None


def _check_tis_service() -> tuple[str, int | None, str | None]:
    """
    Proxy check for the `tis` systemd unit. The bridge exec's the openclaw
    CLI which runs under user `tis` — if the chat call returns a non-null
    text payload, the tis service is functioning end-to-end.
    """
    start = time.monotonic()
    code, err, body = _tis_chat_request(f"{BRIDGE_INTERNAL_URL}/chat", 120.0)
    elapsed = int((time.monotonic() - start) * 1000)
    if err:
        return "FAIL", elapsed, err
    if code != 200:
        excerpt = (body if isinstance(body, str) else str(body))[:200]
        return "FAIL", elapsed, f"HTTP {code}: {excerpt}"
    text_out = body.get("text") if isinstance(body, dict) else None
    if not text_out:
        err_field = body.get("error") if isinstance(body, dict) else None
        return "FAIL", elapsed, f"openclaw returned empty text (error={err_field})"
    return "PASS", elapsed, None


def _check_tis_bridge_service() -> tuple[str, int | None, str | None]:
    """HTTP GET to the bridge's own /health endpoint."""
    start = time.monotonic()
    try:
        r = httpx.get(f"{BRIDGE_INTERNAL_URL}/health", timeout=5.0)
        elapsed = int((time.monotonic() - start) * 1000)
        if r.status_code != 200:
            return "FAIL", elapsed, f"HTTP {r.status_code}: {r.text[:200]}"
        data = r.json()
        if data.get("status") != "ok":
            return "FAIL", elapsed, f"bridge status={data.get('status')}"
        return "PASS", elapsed, None
    except Exception as e:
        return "FAIL", int((time.monotonic() - start) * 1000), f"{type(e).__name__}: {e}"


def _check_docker_api() -> tuple[str, int | None, str | None]:
    start = time.monotonic()
    try:
        r = httpx.get(API_INTERNAL_URL, timeout=5.0)
        elapsed = int((time.monotonic() - start) * 1000)
        if r.status_code != 200:
            return "FAIL", elapsed, f"HTTP {r.status_code}"
        data = r.json()
        if data.get("status") != "healthy":
            return "FAIL", elapsed, f"status={data.get('status')}"
        return "PASS", elapsed, None
    except Exception as e:
        return "FAIL", int((time.monotonic() - start) * 1000), f"{type(e).__name__}: {e}"


def _check_docker_db() -> tuple[str, int | None, str | None]:
    start = time.monotonic()
    try:
        conn = _get_sync_db()
        try:
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.fetchone()
        finally:
            conn.close()
        elapsed = int((time.monotonic() - start) * 1000)
        return "PASS", elapsed, None
    except Exception as e:
        return "FAIL", int((time.monotonic() - start) * 1000), f"{type(e).__name__}: {e}"


def _check_docker_redis() -> tuple[str, int | None, str | None]:
    start = time.monotonic()
    try:
        r = redis.from_url(settings.redis_url, socket_connect_timeout=3)
        r.ping()
        r.close()
        elapsed = int((time.monotonic() - start) * 1000)
        return "PASS", elapsed, None
    except Exception as e:
        return "FAIL", int((time.monotonic() - start) * 1000), f"{type(e).__name__}: {e}"


def _check_docker_caddy() -> tuple[str, int | None, str | None]:
    start = time.monotonic()
    try:
        r = httpx.head(CADDY_PUBLIC_URL, timeout=5.0, follow_redirects=True)
        elapsed = int((time.monotonic() - start) * 1000)
        if r.status_code >= 500:
            return "FAIL", elapsed, f"HTTP {r.status_code}"
        return "PASS", elapsed, None
    except Exception as e:
        return "FAIL", int((time.monotonic() - start) * 1000), f"{type(e).__name__}: {e}"


def _check_docker_worker_ai() -> tuple[str, int | None, str | None]:
    """Self-check. The fact that this task is executing proves the container
    is up. Still record a row with hostname for the audit trail."""
    return "PASS", 0, None


# ---------------------------------------------------------------------------
# Alert dispatch (Tier 1 — email via Resend). Tier 2 WhatsApp = TODO.
# ---------------------------------------------------------------------------

def _send_resend_email(check_name: str, recent_errors: list[str]) -> tuple[str, str]:
    """
    Returns (channel, status) where status in {"SENT","FAILED"}.

    Reuses the existing SMTP_PASSWORD (which is the Resend API key; Resend
    accepts the same token for SMTP and REST). No new env var is created.
    """
    api_key = os.getenv("SMTP_PASSWORD", "")
    to_addr = os.getenv("MONITORING_ALERT_EMAIL", "founder@teivaka.com")
    if not api_key:
        logger.error("[health-monitor] SMTP_PASSWORD not set — alert email not sent")
        return "email", "FAILED"

    body_lines = [
        f"Check: {check_name}",
        f"Time (UTC): {datetime.now(timezone.utc).isoformat()}",
        "Last error_details (most recent first):",
    ]
    for i, err in enumerate(recent_errors, 1):
        body_lines.append(f"  {i}. {err or '(no detail)'}")
    body_lines.append("")
    body_lines.append("Dashboard: https://teivaka.com/api/v1/admin/monitoring/health")

    try:
        r = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": os.getenv("SMTP_FROM", "noreply@teivaka.com"),
                "to":   [to_addr],
                "subject": f"[TFOS CRITICAL] {check_name} failed 3x consecutively",
                "text":    "\n".join(body_lines),
            },
            timeout=10.0,
        )
        if r.status_code in (200, 201, 202):
            return "email", "SENT"
        logger.error(f"[health-monitor] Resend returned {r.status_code}: {r.text[:300]}")
        return "email", "FAILED"
    except Exception as e:
        logger.error(f"[health-monitor] Resend call raised: {e}")
        return "email", "FAILED"


# ---------------------------------------------------------------------------
# Check registry + cadence buckets
# ---------------------------------------------------------------------------

CHECK_FUNCS: dict[str, callable] = {
    "api_health":         _check_api_health,
    "tis_chat":           _check_tis_chat,
    "tis_service":        _check_tis_service,
    "tis_bridge_service": _check_tis_bridge_service,
    "docker_api":         _check_docker_api,
    "docker_db":          _check_docker_db,
    "docker_redis":       _check_docker_redis,
    "docker_caddy":       _check_docker_caddy,
    "docker_worker_ai":   _check_docker_worker_ai,
}

# Cheap checks run every 15 min — sub-second HTTP / db / redis probes.
CHEAP_CHECKS = [
    "api_health",
    "tis_bridge_service",
    "docker_api",
    "docker_db",
    "docker_redis",
    "docker_caddy",
    "docker_worker_ai",
]

# Expensive checks run every 4 h — each call pays an OpenClaw cold-start
# (~90 s per ping under `--thinking low`), which blows past any 15-min cadence.
EXPENSIVE_CHECKS = [
    "tis_chat",
    "tis_service",
]


def perform_check(name: str) -> tuple[str, int | None, str | None]:
    """Run one check by name. Returns (status, response_time_ms, error_detail)."""
    fn = CHECK_FUNCS.get(name)
    if fn is None:
        return "FAIL", None, f"unknown check_name: {name}"
    try:
        return fn()
    except Exception as e:
        return "FAIL", None, f"check raised: {type(e).__name__}: {e}"


# ---------------------------------------------------------------------------
# Shared execution: persist rows + alert + auto-resolve
# ---------------------------------------------------------------------------

def _execute_checks(check_names: list[str], run_label: str) -> dict[str, str]:
    run_started = datetime.now(timezone.utc).isoformat()
    logger.info(f"[health-monitor:{run_label}] run started at {run_started}")

    results: list[tuple[str, str, int | None, str | None]] = []
    for name in check_names:
        status, rt, err = perform_check(name)
        results.append((name, status, rt, err))

    conn = _get_sync_db()
    try:
        cur = conn.cursor()

        for check_name, status, rt, err in results:
            cur.execute(
                """
                INSERT INTO ops.health_checks
                    (check_name, status, response_time_ms, error_detail)
                VALUES (%s, %s, %s, %s)
                """,
                (check_name, status, rt, err),
            )

        alerts_sent_in_run = 0
        for check_name, status, _rt, _err in results:
            if status == "FAIL":
                cur.execute(
                    """
                    SELECT status, error_detail
                    FROM ops.health_checks
                    WHERE check_name = %s
                    ORDER BY checked_at DESC
                    LIMIT %s
                    """,
                    (check_name, CONSECUTIVE_FAIL_THRESHOLD),
                )
                last_rows = cur.fetchall()
                if len(last_rows) >= CONSECUTIVE_FAIL_THRESHOLD and \
                   all(row["status"] == "FAIL" for row in last_rows):
                    cur.execute(
                        """
                        SELECT id FROM ops.alert_events
                        WHERE check_name = %s AND resolved_at IS NULL
                        LIMIT 1
                        """,
                        (check_name,),
                    )
                    existing = cur.fetchone()
                    if not existing:
                        recent_errors = [row["error_detail"] for row in last_rows]
                        # Resend allows 2 req/s — pace outgoing alerts so a
                        # simultaneous multi-check failure doesn't drop mails
                        # to 429.
                        if alerts_sent_in_run > 0:
                            time.sleep(0.6)
                        channel, notif_status = _send_resend_email(check_name, recent_errors)
                        alerts_sent_in_run += 1
                        cur.execute(
                            """
                            INSERT INTO ops.alert_events
                                (check_name, severity, consecutive_fails,
                                 notification_channel, notification_status)
                            VALUES (%s, 'CRITICAL', %s, %s, %s)
                            """,
                            (check_name, len(last_rows), channel, notif_status),
                        )
                        logger.error(
                            f"[health-monitor:{run_label}] CRITICAL alert fired for "
                            f"{check_name} (notification={notif_status})"
                        )
            else:
                cur.execute(
                    """
                    UPDATE ops.alert_events
                    SET resolved_at = NOW()
                    WHERE check_name = %s AND resolved_at IS NULL
                    """,
                    (check_name,),
                )
                if cur.rowcount:
                    logger.info(
                        f"[health-monitor:{run_label}] auto-resolved {cur.rowcount} "
                        f"open alert(s) for {check_name}"
                    )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    summary = {r[0]: r[1] for r in results}
    logger.info(f"[health-monitor:{run_label}] run complete: {summary}")
    return summary


# ---------------------------------------------------------------------------
# Celery tasks — two cadences
# ---------------------------------------------------------------------------

@celery_app.task(
    name="ops.run_cheap_checks",
    bind=True,
    queue="ai",
    max_retries=0,
)
def run_cheap_checks(self):
    """Beat: every 15 min (0,15,30,45). 7 sub-second probes."""
    return _execute_checks(CHEAP_CHECKS, "cheap")


@celery_app.task(
    name="ops.run_expensive_checks",
    bind=True,
    queue="ai",
    max_retries=0,
    time_limit=360,
    soft_time_limit=330,
)
def run_expensive_checks(self):
    """Beat: every 4 h (hours 0,4,8,12,16,20). 2 OpenClaw-driven probes."""
    return _execute_checks(EXPENSIVE_CHECKS, "expensive")
