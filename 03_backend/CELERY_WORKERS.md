# FILE: 03_backend/CELERY_WORKERS.md

# Teivaka TFOS Backend — Celery Workers Reference

Complete specification for all Celery tasks, beat schedule, queue routing, and error handling strategy.

---

## 1. Celery App Configuration

```python
# workers/celery_app.py
from celery import Celery
from celery.schedules import crontab
from config import get_settings

settings = get_settings()

celery_app = Celery(
    "teivaka_tfos",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_RESULT_BACKEND,
)

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    event_serializer="json",

    # Timezone — all tasks run in UTC; Fiji time (UTC+12) handled in scheduling
    timezone="UTC",
    enable_utc=True,

    # Task behavior
    task_always_eager=False,         # Never True in production
    task_acks_late=True,             # Acknowledge after task completes (not on receipt)
    task_reject_on_worker_lost=True, # Requeue if worker dies mid-task
    worker_prefetch_multiplier=1,    # One task at a time per worker slot (avoids starvation)

    # Result backend
    result_expires=86400,            # Results kept 24 hours

    # Dead letter queue
    task_routes={
        "workers.automation_worker.*": {"queue": "automation"},
        "workers.decision_worker.*":   {"queue": "automation"},
        "workers.kpi_worker.*":        {"queue": "reporting"},
        "workers.views_worker.*":      {"queue": "maintenance"},
        "workers.maintenance_worker.*":{"queue": "automation"},
        "workers.whatsapp_worker.*":   {"queue": "notifications"},
        "workers.tis_worker.*":        {"queue": "ai"},
        "workers.voice_worker.*":      {"queue": "ai"},
        "workers.sync_worker.*":       {"queue": "automation"},
    },

    # Dead letter: failed tasks after max_retries exhausted go here
    task_default_queue="default",

    # Autodiscover tasks from all worker modules
    include=[
        "workers.automation_worker",
        "workers.decision_worker",
        "workers.whatsapp_worker",
        "workers.tis_worker",
        "workers.voice_worker",
        "workers.sync_worker",
        "workers.kpi_worker",
        "workers.maintenance_worker",
        "workers.views_worker",
    ],
)
```

---

## 2. Celery Beat Schedule

All cron times are in **UTC**. Fiji Standard Time (FST) is UTC+12. There is no daylight saving in Fiji.

Conversion: 6:00am FST = 18:00 UTC previous calendar day.

```python
# workers/beat_schedule.py
from celery.schedules import crontab
from workers.celery_app import celery_app

celery_app.conf.beat_schedule = {

    # ─── Daily Automation Engine ──────────────────────────────────────────────
    # Runs at 6:00am Fiji time = 18:00 UTC (previous day)
    "run-automation-engine": {
        "task": "workers.automation_worker.run_automation_engine",
        "schedule": crontab(hour=18, minute=0),
        "options": {"queue": "automation"},
    },

    # ─── Daily Decision Engine ────────────────────────────────────────────────
    # Runs at 6:05am Fiji time = 18:05 UTC (staggered 5 min after automation)
    "run-decision-engine": {
        "task": "workers.decision_worker.run_decision_engine",
        "schedule": crontab(hour=18, minute=5),
        "options": {"queue": "automation"},
    },

    # ─── Weekly KPI Snapshot ──────────────────────────────────────────────────
    # Runs every Monday at 6:10am Fiji time = Sunday 18:10 UTC
    "run-weekly-kpi": {
        "task": "workers.kpi_worker.run_weekly_kpi_snapshot",
        "schedule": crontab(hour=18, minute=10, day_of_week=0),  # day_of_week=0 = Sunday UTC = Monday FST
        "options": {"queue": "reporting"},
    },

    # ─── Hourly Materialized View Refresh ─────────────────────────────────────
    "refresh-materialized-views": {
        "task": "workers.views_worker.refresh_materialized_views",
        "schedule": crontab(minute=0),  # Every hour, on the hour
        "options": {"queue": "maintenance"},
    },

    # ─── Daily Equipment Maintenance Check ────────────────────────────────────
    # Runs at 6:15am Fiji time = 18:15 UTC
    "check-equipment-maintenance": {
        "task": "workers.maintenance_worker.check_equipment_maintenance",
        "schedule": crontab(hour=18, minute=15),
        "options": {"queue": "automation"},
    },

    # ─── Weekly Community Price Index Refresh ─────────────────────────────────
    # Runs every Sunday midnight Fiji time = Saturday 12:00 UTC
    "community-price-refresh": {
        "task": "workers.views_worker.refresh_community_price_index",
        "schedule": crontab(hour=12, minute=0, day_of_week=6),  # day_of_week=6 = Saturday UTC = Sunday FST
        "options": {"queue": "maintenance"},
    },
}
```

---

## 3. Queue Configuration and Worker Concurrency

| Queue | Workers (concurrency) | Purpose | Rate Constraint |
|-------|-----------------------|---------|-----------------|
| `automation` | 4 | Rule evaluation, engine runs, sync, maintenance | CPU / DB bound |
| `ai` | 2 | TIS commands, voice transcription | API rate limited (Claude + Whisper) |
| `reporting` | 2 | KPI snapshots, report generation | DB-heavy, non-urgent |
| `maintenance` | 2 | Materialized view refresh, price index | Non-urgent, low priority |
| `notifications` | 4 | WhatsApp and SMS dispatch | Twilio API rate limited |
| `failed_tasks` | 1 | Dead letter queue — human review required | — |

Start workers:

```bash
# Automation workers (4 concurrent)
celery -A workers.celery_app worker --queues=automation --concurrency=4 --loglevel=info

# AI workers (2 concurrent — rate limited)
celery -A workers.celery_app worker --queues=ai --concurrency=2 --loglevel=info

# Reporting workers
celery -A workers.celery_app worker --queues=reporting --concurrency=2 --loglevel=info

# Maintenance workers
celery -A workers.celery_app worker --queues=maintenance --concurrency=2 --loglevel=info

# Notification workers
celery -A workers.celery_app worker --queues=notifications --concurrency=4 --loglevel=info

# Beat scheduler (single process — never run more than one)
celery -A workers.celery_app beat --loglevel=info
```

---

## 4. Task Definitions

---

### 4.1 `run_automation_engine`

**File:** `workers/automation_worker.py`
**Queue:** `automation`
**Trigger:** Daily at 6:00am FST (scheduled), or manually via `POST /admin/automation/trigger`

```python
# workers/automation_worker.py
import structlog
from typing import Optional
from celery import Task
from workers.celery_app import celery_app
from services.automation_service import run_automation_engine as _run_engine
from services.whatsapp_service import send_alert as _send_alert
import sentry_sdk

logger = structlog.get_logger()


@celery_app.task(
    name="workers.automation_worker.run_automation_engine",
    bind=True,
    max_retries=3,
    default_retry_delay=120,  # 2 minutes between retries
    autoretry_for=(Exception,),
    retry_backoff=True,        # Exponential backoff: 120s, 240s, 480s
    retry_jitter=True,
    queue="automation",
    soft_time_limit=900,       # 15 minute soft limit
    time_limit=1200,           # 20 minute hard kill
    acks_late=True,
)
def run_automation_engine(self: Task, tenant_id: Optional[str] = None) -> dict:
    """
    Daily automation engine. Evaluates all 43 active rules for all tenants
    (or a single specified tenant). For each rule:
      1. Evaluates the trigger condition using category-specific logic
      2. Applies deduplication (alert_key check against open alerts)
      3. Creates tasks and alerts if condition met
      4. Queues WhatsApp notifications for new alerts
    At the end of each run:
      5. Runs auto-resolution: re-evaluates conditions for all open alerts;
         resolves any alerts whose triggering condition is no longer true.
      6. Checks escalation: promotes MEDIUM→HIGH (3 days) and HIGH→CRITICAL (7 days).

    Args:
        tenant_id: If provided, only run for this tenant. If None, run for ALL active tenants.

    Returns:
        dict with keys: tenants_processed, rules_evaluated, tasks_created,
                        alerts_created, alerts_resolved, alerts_escalated, duration_seconds
    """
    run_id = self.request.id
    log = logger.bind(task="run_automation_engine", run_id=run_id, tenant_id=tenant_id)
    log.info("automation_engine_start")

    import asyncio
    from database import AsyncSessionLocal
    import time

    start_time = time.time()
    results = {
        "tenants_processed": 0,
        "rules_evaluated": 0,
        "tasks_created": 0,
        "alerts_created": 0,
        "alerts_resolved": 0,
        "alerts_escalated": 0,
        "errors": [],
    }

    async def _run():
        async with AsyncSessionLocal() as db:
            # If tenant_id is None: fetch all active tenants from DB
            if tenant_id is None:
                from sqlalchemy import text
                rows = await db.execute(text("SELECT id FROM tenants WHERE is_active = true"))
                tenant_ids = [row[0] for row in rows.fetchall()]
            else:
                tenant_ids = [tenant_id]

            for tid in tenant_ids:
                try:
                    # Run the automation engine service for this tenant
                    tenant_result = await _run_engine(tid, db)
                    results["tenants_processed"] += 1
                    results["rules_evaluated"] += tenant_result.rules_evaluated
                    results["tasks_created"] += tenant_result.tasks_created
                    results["alerts_created"] += tenant_result.alerts_created
                    results["alerts_resolved"] += tenant_result.alerts_resolved
                    results["alerts_escalated"] += tenant_result.alerts_escalated

                    # Queue WhatsApp notifications for each newly created alert
                    for alert_id in tenant_result.new_alert_ids:
                        alert = await db.get(Alert, alert_id)
                        if alert.severity.value == "Critical":
                            # CRITICAL: immediate dispatch, no countdown
                            send_whatsapp_alert.apply_async(
                                args=[alert_id],
                                queue="notifications",
                            )
                        elif alert.severity.value == "High":
                            # HIGH: within 5 minutes
                            send_whatsapp_alert.apply_async(
                                args=[alert_id],
                                queue="notifications",
                                countdown=300,  # 5 minutes
                            )
                        elif alert.severity.value == "Medium":
                            # MEDIUM: within 30 minutes
                            send_whatsapp_alert.apply_async(
                                args=[alert_id],
                                queue="notifications",
                                countdown=1800,  # 30 minutes
                            )
                        else:
                            # LOW: batched (dispatched on the hour)
                            send_whatsapp_alert.apply_async(
                                args=[alert_id],
                                queue="notifications",
                                eta=_next_hour_utc(),
                            )

                    log.info("tenant_processed", tenant_id=tid, result=tenant_result)

                except Exception as exc:
                    log.error("tenant_processing_failed", tenant_id=tid, error=str(exc))
                    results["errors"].append({"tenant_id": tid, "error": str(exc)})
                    # Continue to next tenant; don't fail the whole job for one tenant

    asyncio.run(_run())
    results["duration_seconds"] = round(time.time() - start_time, 2)
    log.info("automation_engine_complete", **results)
    return results


def _next_hour_utc():
    """Returns the datetime of the next top-of-hour in UTC (for LOW alert batching)."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    return now.replace(minute=0, second=0, microsecond=0) + __import__("datetime").timedelta(hours=1)
```

---

### 4.2 `run_decision_engine`

**File:** `workers/decision_worker.py`
**Queue:** `automation`
**Trigger:** Daily at 6:05am FST (5 minutes after automation engine completes)

```python
# workers/decision_worker.py
import structlog
import asyncio
import time
from typing import Optional
from workers.celery_app import celery_app
from services.decision_service import get_all_signals

logger = structlog.get_logger()


@celery_app.task(
    name="workers.decision_worker.run_decision_engine",
    bind=True,
    max_retries=3,
    default_retry_delay=120,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    queue="automation",
    soft_time_limit=600,
    time_limit=900,
    acks_late=True,
)
def run_decision_engine(self, tenant_id: Optional[str] = None) -> dict:
    """
    Computes all 10 decision signals for every farm owned by all tenants
    (or a specified tenant). Writes snapshot rows to the decision_signals table.
    Signals are then available for the dashboard and TIS Operational Interpreter.

    The 10 signals computed per farm:
      1. CoKG Efficiency         — Current avg CoKG vs target threshold
      2. Cash Position           — Net cash balance vs minimum threshold
      3. Harvest Frequency       — Days since last harvest across all active cycles
      4. Alert Pressure          — Count and severity of open alerts
      5. Task Compliance         — % of tasks completed on time (rolling 30 days)
      6. Labor Efficiency        — Revenue per labor FJD spent
      7. Input Utilization       — Cost of inputs vs revenue generated
      8. Cycle Progress          — Active cycles vs expected harvest windows
      9. Revenue Trend           — Month-over-month revenue change %
      10. Expansion Readiness    — Composite score across financial, labor, soil health signals

    Each signal is stored with: rag_status (GREEN/AMBER/RED), score_0_10,
    value, target_value, unit, action_at_red, computed_at.

    Args:
        tenant_id: If provided, only run for this tenant. If None, run for all.

    Returns:
        dict: farms_processed, signals_computed, errors
    """
    log = logger.bind(task="run_decision_engine", run_id=self.request.id, tenant_id=tenant_id)
    log.info("decision_engine_start")

    start_time = time.time()
    results = {"farms_processed": 0, "signals_computed": 0, "errors": []}

    async def _run():
        from database import AsyncSessionLocal
        from sqlalchemy import text

        async with AsyncSessionLocal() as db:
            if tenant_id is None:
                rows = await db.execute(
                    text("SELECT f.id FROM farms f JOIN tenants t ON t.id = f.tenant_id WHERE t.is_active = true")
                )
                farm_ids = [row[0] for row in rows.fetchall()]
            else:
                rows = await db.execute(
                    text("SELECT id FROM farms WHERE tenant_id = :tid"),
                    {"tid": tenant_id}
                )
                farm_ids = [row[0] for row in rows.fetchall()]

            for farm_id in farm_ids:
                try:
                    signals = await get_all_signals(farm_id, db)
                    results["farms_processed"] += 1
                    results["signals_computed"] += len(signals)
                    log.info("farm_signals_computed", farm_id=farm_id, count=len(signals))
                except Exception as exc:
                    log.error("farm_signal_failed", farm_id=farm_id, error=str(exc))
                    results["errors"].append({"farm_id": farm_id, "error": str(exc)})

    asyncio.run(_run())
    results["duration_seconds"] = round(time.time() - start_time, 2)
    log.info("decision_engine_complete", **results)
    return results
```

---

### 4.3 `run_weekly_kpi_snapshot`

**File:** `workers/kpi_worker.py`
**Queue:** `reporting`
**Trigger:** Every Monday at 6:10am FST (Sunday 18:10 UTC)

```python
# workers/kpi_worker.py
import structlog
import asyncio
import time
from workers.celery_app import celery_app
from services.report_service import generate_weekly_kpi

logger = structlog.get_logger()


@celery_app.task(
    name="workers.kpi_worker.run_weekly_kpi_snapshot",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
    autoretry_for=(Exception,),
    retry_backoff=False,
    queue="reporting",
    soft_time_limit=1800,   # 30 minutes
    time_limit=2400,
    acks_late=True,
)
def run_weekly_kpi_snapshot(self) -> dict:
    """
    Aggregates KPI data for ALL farms across ALL active tenants and writes
    weekly snapshot rows to the kpi_weekly table.

    KPIs captured per farm per week:
      - total_harvest_kg: Total harvest across all active cycles
      - total_revenue_fjd: Total income logged
      - total_labor_cost_fjd: Total labor attendance cost
      - total_input_cost_fjd: Total input usage cost
      - avg_cogk_fjd: Average CoKG across all cycles with harvest data
      - active_cycles: Count of cycles not in CLOSED/FAILED status
      - open_alerts: Count of open alerts at week end
      - tasks_completed: Tasks completed during the week
      - tasks_overdue: Tasks that became overdue during the week
      - week_start: ISO date (Monday)
      - week_end: ISO date (Sunday)

    Runs on Monday so it captures the full previous week (Mon-Sun).

    Returns:
        dict: farms_processed, snapshots_written, errors, duration_seconds
    """
    from datetime import date, timedelta

    log = logger.bind(task="run_weekly_kpi_snapshot", run_id=self.request.id)
    log.info("weekly_kpi_start")

    start_time = time.time()
    results = {"farms_processed": 0, "snapshots_written": 0, "errors": []}

    # Week start = previous Monday (since this runs ON Monday, week_start = today - 7 days)
    today = date.today()
    week_start = today - timedelta(days=7)
    week_end = today - timedelta(days=1)

    async def _run():
        from database import AsyncSessionLocal
        from sqlalchemy import text

        async with AsyncSessionLocal() as db:
            rows = await db.execute(
                text("""
                    SELECT f.id, f.tenant_id
                    FROM farms f
                    JOIN tenants t ON t.id = f.tenant_id
                    WHERE t.is_active = true
                """)
            )
            farms = rows.fetchall()

            for farm_id, tid in farms:
                try:
                    await generate_weekly_kpi(farm_id, week_start, db)
                    results["farms_processed"] += 1
                    results["snapshots_written"] += 1
                    log.info("kpi_snapshot_written", farm_id=farm_id, week_start=str(week_start))
                except Exception as exc:
                    log.error("kpi_snapshot_failed", farm_id=farm_id, error=str(exc))
                    results["errors"].append({"farm_id": farm_id, "error": str(exc)})

    asyncio.run(_run())
    results["duration_seconds"] = round(time.time() - start_time, 2)
    results["week_start"] = str(week_start)
    results["week_end"] = str(week_end)
    log.info("weekly_kpi_complete", **results)
    return results
```

---

### 4.4 `refresh_materialized_views`

**File:** `workers/views_worker.py`
**Queue:** `maintenance`
**Trigger:** Every hour, on the hour

All 11 materialized views are refreshed CONCURRENTLY to avoid blocking reads. Postgres `REFRESH MATERIALIZED VIEW CONCURRENTLY` requires a unique index on each view — these are created in migration `008_materialized_views.py`.

```python
# workers/views_worker.py
import structlog
import asyncio
import time
from workers.celery_app import celery_app

logger = structlog.get_logger()

# Ordered refresh list — dependencies first
MATERIALIZED_VIEWS = [
    "input_balance",              # 1. Raw input stock calculations
    "farm_pnl",                   # 2. Farm-level P&L (depends on cycle data)
    "crop_ranking",               # 3. Crop performance ranking (depends on farm_pnl)
    "labor_weekly_summary",       # 4. Weekly labor aggregation
    "harvest_reconciliation",     # 5. Harvest vs delivery reconciliation
    "worker_performance",         # 6. Worker performance metrics
    "livestock_summary",          # 7. Livestock head count and health summary
    "apiculture_summary",         # 8. Hive count, honey yield summary
    "expansion_readiness",        # 9. Composite expansion readiness score
    "pu_financials",              # 10. Per-PU financial summary
    "decision_signals_current",   # 11. Latest decision signal snapshot per farm
]


@celery_app.task(
    name="workers.views_worker.refresh_materialized_views",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    queue="maintenance",
    soft_time_limit=600,
    time_limit=900,
    acks_late=True,
)
def refresh_materialized_views(self) -> dict:
    """
    Refreshes all 11 materialized views CONCURRENTLY using PostgreSQL's
    REFRESH MATERIALIZED VIEW CONCURRENTLY statement.

    Concurrent refresh means:
      - Reads are not blocked during refresh
      - Requires each view to have a unique index
      - Takes slightly longer than non-concurrent but is production-safe

    Lock contention handling:
      - If a view is already being refreshed (lock contention), the CONCURRENTLY
        clause handles this gracefully via Postgres row-level locks
      - On failure for one view: log the error, continue to next view
      - The task does NOT fail if a single view refresh fails

    View refresh order matters for dependency correctness:
      input_balance → farm_pnl → crop_ranking (must be in this sequence)
      Others can technically be refreshed in parallel but are sequenced for
      simplicity and predictability.

    Returns:
        dict: views_refreshed, views_failed, duration_seconds
    """
    log = logger.bind(task="refresh_materialized_views", run_id=self.request.id)
    log.info("view_refresh_start")

    start_time = time.time()
    results = {"views_refreshed": 0, "views_failed": 0, "failed_views": []}

    async def _run():
        from database import AsyncSessionLocal
        from sqlalchemy import text

        async with AsyncSessionLocal() as db:
            for view_name in MATERIALIZED_VIEWS:
                try:
                    await db.execute(
                        text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {view_name}")
                    )
                    await db.commit()
                    results["views_refreshed"] += 1
                    log.info("view_refreshed", view=view_name)
                except Exception as exc:
                    await db.rollback()
                    results["views_failed"] += 1
                    results["failed_views"].append({"view": view_name, "error": str(exc)})
                    log.error("view_refresh_failed", view=view_name, error=str(exc))
                    # Continue to next view — do not abort the whole task

    asyncio.run(_run())
    results["duration_seconds"] = round(time.time() - start_time, 2)

    if results["views_failed"] > 0:
        log.warning("view_refresh_partial_failure", **results)
    else:
        log.info("view_refresh_complete", **results)

    return results


@celery_app.task(
    name="workers.views_worker.refresh_community_price_index",
    bind=True,
    max_retries=2,
    default_retry_delay=300,
    queue="maintenance",
    soft_time_limit=600,
    acks_late=True,
)
def refresh_community_price_index(self) -> dict:
    """
    Weekly community price index refresh. Aggregates recent delivery/income
    prices per production per market from the last 4 weeks of data.

    Process:
      1. Query delivery_log and income_log for last 28 days
      2. Group by production_id and market
      3. Compute avg_price, min_price, max_price, sample_count
      4. Upsert into price_index table (keyed by production_id + market + week_start)
      5. Update price_master table with suggested prices for TFOS budgeting

    Also triggers the community price_index materialized view refresh.

    Returns:
        dict: productions_updated, markets_updated, duration_seconds
    """
    log = logger.bind(task="refresh_community_price_index", run_id=self.request.id)
    log.info("price_index_refresh_start")

    start_time = time.time()
    results = {"productions_updated": 0, "markets_updated": 0, "errors": []}

    async def _run():
        from database import AsyncSessionLocal
        from services.report_service import aggregate_community_prices

        async with AsyncSessionLocal() as db:
            result = await aggregate_community_prices(db)
            results["productions_updated"] = result.productions_updated
            results["markets_updated"] = result.markets_updated

            # Refresh the price_index materialized view
            from sqlalchemy import text
            await db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY price_index"))
            await db.commit()

    asyncio.run(_run())
    results["duration_seconds"] = round(time.time() - start_time, 2)
    log.info("price_index_refresh_complete", **results)
    return results
```

---

### 4.5 `send_whatsapp_alert`

**File:** `workers/whatsapp_worker.py`
**Queue:** `notifications`
**Triggered by:** `run_automation_engine` immediately after alert creation

Delivery timing based on severity:
- **CRITICAL**: Immediate (no countdown). Escalated to all farm managers and Cody directly.
- **HIGH**: Within 5 minutes (countdown=300).
- **MEDIUM**: Within 30 minutes (countdown=1800).
- **LOW**: Batched hourly (eta=next top-of-hour).

```python
# workers/whatsapp_worker.py
import structlog
import asyncio
from workers.celery_app import celery_app
from services.whatsapp_service import send_text, SMS_FALLBACK_SEND

logger = structlog.get_logger()


@celery_app.task(
    name="workers.whatsapp_worker.send_whatsapp_alert",
    bind=True,
    max_retries=5,
    default_retry_delay=60,      # 1 minute between retries
    autoretry_for=(Exception,),
    retry_backoff=True,          # 60s, 120s, 240s, 480s, 960s
    retry_jitter=True,
    queue="notifications",
    soft_time_limit=30,
    time_limit=60,
    acks_late=True,
)
def send_whatsapp_alert(self, alert_id: str) -> dict:
    """
    Sends a WhatsApp alert message for a given alert_id.

    Process:
      1. Fetch the alert record from the database
      2. Determine target phone number(s) based on farm_id and severity
         - F001 → WHATSAPP_ALERT_PHONE_F001 (Laisenia Waqa / F001 manager)
         - F002 → WHATSAPP_ALERT_PHONE_F002 (F002 farm manager)
         - CRITICAL severity → send to ALL farm managers for that farm + Cody
      3. Format WhatsApp message using template from WHATSAPP_TEMPLATES[rule_id]
         (templates are in core/constants.py, keyed by rule_id)
      4. Send via Twilio WhatsApp API (twilio.rest.Client)
      5. On Twilio WhatsApp failure: attempt SMS fallback via Twilio SMS API
      6. Log delivery status on the alert record:
         - whatsapp_sent_at, whatsapp_sid, sms_fallback_used, delivery_status
      7. On repeated failure (all 5 retries exhausted):
         - Alert goes to 'failed_tasks' dead letter queue
         - Sentry error raised with alert_id context

    Args:
        alert_id: UUID string of the alert to send

    Returns:
        dict: alert_id, sent_to, whatsapp_success, sms_fallback_used, sid
    """
    log = logger.bind(task="send_whatsapp_alert", alert_id=alert_id, attempt=self.request.retries)
    log.info("whatsapp_alert_start")

    result = {"alert_id": alert_id, "whatsapp_success": False, "sms_fallback_used": False}

    async def _run():
        import httpx
        from app.db.session import AsyncSessionLocal
        from app.config import settings
        from sqlalchemy import text

        META_API_URL = f"https://graph.facebook.com/v19.0/{settings.meta_phone_number_id}/messages"
        META_HEADERS = {
            "Authorization": f"Bearer {settings.meta_whatsapp_token}",
            "Content-Type": "application/json",
        }

        async with AsyncSessionLocal() as db:
            # Load alert
            result_row = (await db.execute(
                text("SELECT * FROM tenant.alerts WHERE alert_id = :id"),
                {"id": alert_id}
            )).mappings().first()
            if not result_row:
                log.error("alert_not_found", alert_id=alert_id)
                return

            alert = dict(result_row)

            # Determine recipients — all active FOUNDER/MANAGER users for this farm's tenant
            rows = await db.execute(
                text("""
                SELECT whatsapp_number FROM tenant.users
                WHERE tenant_id = (SELECT tenant_id FROM tenant.farms WHERE farm_id = :fid)
                  AND role IN ('FOUNDER','MANAGER')
                  AND whatsapp_number IS NOT NULL
                  AND is_active = true
                """),
                {"fid": alert["farm_id"]}
            )
            recipients = [r[0] for r in rows.fetchall()]

            message_body = alert["message"]

            # Send via Meta Cloud API
            sent_ids = []
            async with httpx.AsyncClient(timeout=15.0) as http_client:
                for phone in recipients:
                    clean = phone.lstrip("+")
                    payload = {
                        "messaging_product": "whatsapp",
                        "recipient_type": "individual",
                        "to": clean,
                        "type": "text",
                        "text": {"preview_url": False, "body": message_body},
                    }
                    resp = await http_client.post(META_API_URL, json=payload, headers=META_HEADERS)
                    if resp.status_code == 200:
                        msg_id = resp.json().get("messages", [{}])[0].get("id", "unknown")
                        sent_ids.append(msg_id)
                        result["whatsapp_success"] = True
                        log.info("whatsapp_sent", phone=phone, message_id=msg_id)
                    else:
                        log.error("whatsapp_failed", phone=phone, status=resp.status_code, body=resp.text[:200])

            result["sent_to"] = recipients
            result["message_ids"] = sent_ids

            # Update alert delivery stamp
            await db.execute(
                text("""
                UPDATE tenant.alerts
                   SET whatsapp_sent = true, whatsapp_sent_at = NOW()
                 WHERE alert_id = :id
                """),
                {"id": alert_id}
            )
            await db.commit()

    asyncio.run(_run())
    log.info("whatsapp_alert_complete", **result)
    return result
```

---

### 4.6 `process_tis_command`

**File:** `workers/tis_worker.py`
**Queue:** `ai`
**Triggered by:** `POST /tis/chat`, `POST /tis/voice`, or `POST /webhooks/whatsapp`

```python
# workers/tis_worker.py
import structlog
import asyncio
import time
from workers.celery_app import celery_app

logger = structlog.get_logger()


@celery_app.task(
    name="workers.tis_worker.process_tis_command",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
    retry_backoff=False,
    queue="ai",
    soft_time_limit=30,    # 30 second soft limit — must respond before user gives up
    time_limit=45,
    acks_late=True,
)
def process_tis_command(self, command_id: str) -> dict:
    """
    Processes a single TIS command record from the ai_commands table.

    Process:
      1. Fetch ai_commands row by command_id
      2. Mark record as 'processing' with started_at timestamp
      3. Route to correct TIS module based on parsed_intent:
         - KNOWLEDGE_BROKER: if intent is agronomy/protocol/knowledge question
         - OPERATIONAL_INTERPRETER: if intent is "explain my farm's data"
         - COMMAND_EXECUTOR: if intent matches one of 12 VoiceCommandType patterns
      4. Execute the module (calls Claude API or runs DB operations)
      5. Store response_text and execution_result_json on ai_commands record
      6. Mark record as 'completed' with completed_at, tokens_used, latency_ms
      7. If max_retries exhausted: mark record as 'failed', store error message

    Timeout handling:
      - If Claude API call exceeds 25 seconds: raise TimeoutError
      - Task soft_time_limit=30 will raise SoftTimeLimitExceeded
      - On SoftTimeLimitExceeded: mark command as 'timed_out', send error response

    Args:
        command_id: UUID string of the ai_commands record to process

    Returns:
        dict: command_id, tis_module_used, success, latency_ms, tokens_used
    """
    log = logger.bind(task="process_tis_command", command_id=command_id, attempt=self.request.retries)
    log.info("tis_command_start")

    start_time = time.time()
    result = {"command_id": command_id, "success": False}

    async def _run():
        from database import AsyncSessionLocal
        from services.tis_service import route_message
        from models.db.ai import AiCommand
        from datetime import datetime, timezone

        async with AsyncSessionLocal() as db:
            cmd = await db.get(AiCommand, command_id)
            if not cmd:
                log.error("command_not_found", command_id=command_id)
                return

            cmd.status = "processing"
            cmd.started_at = datetime.now(timezone.utc)
            await db.commit()

            try:
                # Reconstruct context for TIS routing
                context = {
                    "farm_id": cmd.farm_id,
                    "user_id": cmd.user_id,
                    "channel": cmd.channel if hasattr(cmd, "channel") else "app",
                    "conversation_id": cmd.conversation_id if hasattr(cmd, "conversation_id") else None,
                }

                tis_response = await route_message(
                    message=cmd.raw_input,
                    context=context,
                    db=db
                )

                cmd.tis_module_used = tis_response.tis_module_used.value
                cmd.response_text = tis_response.response_text
                cmd.execution_result_json = (
                    tis_response.command_result.model_dump() if tis_response.command_result else None
                )
                cmd.tokens_used = tis_response.tokens_used
                cmd.latency_ms = int((time.time() - start_time) * 1000)
                cmd.status = "completed"
                cmd.completed_at = datetime.now(timezone.utc)
                await db.commit()

                result.update({
                    "success": True,
                    "tis_module_used": cmd.tis_module_used,
                    "latency_ms": cmd.latency_ms,
                    "tokens_used": cmd.tokens_used,
                })

            except Exception as exc:
                cmd.status = "failed"
                cmd.error_message = str(exc)
                cmd.completed_at = datetime.now(timezone.utc)
                await db.commit()
                log.error("tis_command_failed", command_id=command_id, error=str(exc))
                raise exc  # Trigger retry

    asyncio.run(_run())
    log.info("tis_command_complete", **result)
    return result
```

---

### 4.7 `process_voice_command`

**File:** `workers/voice_worker.py`
**Queue:** `ai`
**Triggered by:** `POST /tis/voice` or WhatsApp voice note webhook

```python
# workers/voice_worker.py
import structlog
import asyncio
from workers.celery_app import celery_app
from workers.tis_worker import process_tis_command

logger = structlog.get_logger()


@celery_app.task(
    name="workers.voice_worker.process_voice_command",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    autoretry_for=(Exception,),
    retry_backoff=True,
    queue="ai",
    soft_time_limit=60,   # Whisper transcription can take 15-30s for long notes
    time_limit=90,
    acks_late=True,
)
def process_voice_command(self, voice_log_id: str) -> dict:
    """
    Processes a voice note from a farmer. Full pipeline:

      Step 1: Fetch tis_voice_logs record by voice_log_id
      Step 2: Download audio from Supabase Storage using audio_url on record
      Step 3: Send audio to OpenAI Whisper API (whisper-1 model) for transcription
              - Language hint: 'en' (Fijian English)
              - Response format: verbose_json (includes confidence/segments)
      Step 4: Store transcript and whisper_confidence on tis_voice_logs record
      Step 5: Create ai_commands record with raw_input = transcript
      Step 6: Call process_tis_command.delay(command_id) to route through TIS
      Step 7: Update tis_voice_logs with command_id reference and status='completed'

    Failure handling:
      - If Whisper transcription fails (API error, audio format error):
        → Set tis_voice_logs.status = 'transcription_failed'
        → Set tis_voice_logs.error_message = error detail
        → Notify user via WhatsApp: "Voice message received but could not be
          transcribed. Please try again or type your message."
        → Do NOT retry indefinitely — mark as permanently failed after 3 retries
      - If audio download fails: retry up to max_retries
      - If audio format unsupported: fail immediately (no retry)

    Supported audio formats: mp3, mp4, mpeg, mpga, m4a, wav, webm (Whisper supported)
    WhatsApp voice notes arrive as .ogg (opus codec) — pre-converted to mp3 by
    whatsapp_service before storing to Supabase.

    Args:
        voice_log_id: UUID string of the tis_voice_logs record

    Returns:
        dict: voice_log_id, transcript_length, whisper_confidence, command_id, success
    """
    log = logger.bind(task="process_voice_command", voice_log_id=voice_log_id, attempt=self.request.retries)
    log.info("voice_command_start")

    result = {"voice_log_id": voice_log_id, "success": False}

    UNSUPPORTED_FORMAT_ERRORS = ["invalid file format", "audio too short", "no audio content"]

    async def _run():
        from database import AsyncSessionLocal
        from models.db.ai import TisVoiceLog, AiCommand
        from services.voice_service import transcribe_audio
        from services.whatsapp_service import send_text
        from config import get_settings
        from datetime import datetime, timezone
        import uuid

        settings = get_settings()

        async with AsyncSessionLocal() as db:
            voice_log = await db.get(TisVoiceLog, voice_log_id)
            if not voice_log:
                log.error("voice_log_not_found", voice_log_id=voice_log_id)
                return

            voice_log.status = "transcribing"
            await db.commit()

            try:
                transcript, confidence = await transcribe_audio(voice_log.audio_url)

                voice_log.transcript = transcript
                voice_log.whisper_confidence = confidence
                voice_log.status = "transcribed"
                await db.commit()

                # Create ai_commands record
                new_command = AiCommand(
                    id=str(uuid.uuid4()),
                    tenant_id=voice_log.tenant_id if hasattr(voice_log, "tenant_id") else None,
                    farm_id=voice_log.farm_id,
                    user_id=voice_log.user_id,
                    raw_input=transcript,
                    command_source="voice",
                    voice_log_id=voice_log_id,
                    status="queued",
                    created_at=datetime.now(timezone.utc),
                )
                db.add(new_command)
                await db.commit()
                await db.refresh(new_command)

                # Queue TIS processing
                process_tis_command.delay(new_command.id)

                voice_log.command_id = new_command.id
                voice_log.status = "completed"
                await db.commit()

                result.update({
                    "success": True,
                    "transcript_length": len(transcript),
                    "whisper_confidence": confidence,
                    "command_id": new_command.id,
                })

            except Exception as exc:
                err_str = str(exc).lower()
                is_unsupported = any(err in err_str for err in UNSUPPORTED_FORMAT_ERRORS)

                voice_log.status = "transcription_failed"
                voice_log.error_message = str(exc)
                await db.commit()

                # Notify user via WhatsApp
                if voice_log.user_phone:
                    await send_text(
                        voice_log.user_phone,
                        "Voice message received but could not be transcribed. "
                        "Please try again or type your message in TFOS."
                    )

                if is_unsupported:
                    # Do not retry unsupported format errors
                    log.error("voice_unsupported_format", voice_log_id=voice_log_id, error=str(exc))
                    return

                raise exc  # Trigger retry for other errors

    asyncio.run(_run())
    log.info("voice_command_complete", **result)
    return result
```

---

### 4.8 `check_chemical_compliance_scan`

**File:** `workers/automation_worker.py` (additional task)
**Queue:** `automation`
**Note:** This task is triggered as part of `run_automation_engine` when evaluating RULE-038 (ChemicalCompliance). It can also be run standalone by the maintenance check.

```python
@celery_app.task(
    name="workers.automation_worker.check_chemical_compliance_scan",
    bind=True,
    max_retries=3,
    default_retry_delay=120,
    autoretry_for=(Exception,),
    queue="automation",
    soft_time_limit=300,
    acks_late=True,
)
def check_chemical_compliance_scan(self) -> dict:
    """
    Pre-harvest chemical compliance scan. Runs daily alongside the automation engine.

    For every active production cycle in HARVESTING stage across all tenants:
      1. Query field_events for chemical applications in the last 90 days
         on that cycle (event_type = 'spray', chemical_name IS NOT NULL)
      2. For each chemical application:
         a. safe_date = application_date + whd_days
         b. If TODAY < safe_date: violation exists
      3. If violations found:
         a. Create CRITICAL alert via RULE-038 with template populated:
            - chemical_name, application_date, whd_days, safe_date
         b. Set harvest_log.blocking_chemicals_json on any pending harvest_log records
            for this cycle (marks them as blocked)
         c. Queue immediate WhatsApp alert (CRITICAL priority = no countdown)
      4. If no violations: ensure any existing RULE-038 alerts for this cycle
         are auto-resolved (condition no longer met)

    This is the enforcement side of chemical compliance.
    The compliance_service.check_chemical_compliance() function is the
    per-harvest-request side (called at harvest creation time).

    Returns:
        dict: cycles_scanned, violations_found, alerts_created, alerts_resolved
    """
    log = logger.bind(task="check_chemical_compliance_scan", run_id=self.request.id)
    log.info("compliance_scan_start")

    results = {"cycles_scanned": 0, "violations_found": 0, "alerts_created": 0, "alerts_resolved": 0}

    async def _run():
        from database import AsyncSessionLocal
        from services.compliance_service import check_chemical_compliance
        from services.automation_service import create_alert, auto_resolve_alert
        from sqlalchemy import text

        async with AsyncSessionLocal() as db:
            rows = await db.execute(
                text("""
                    SELECT id, pu_id, farm_id, tenant_id
                    FROM production_cycles
                    WHERE cycle_status = 'harvesting'
                """)
            )
            cycles = rows.fetchall()

            for cycle_id, pu_id, farm_id, tenant_id in cycles:
                results["cycles_scanned"] += 1
                from datetime import date
                compliance = await check_chemical_compliance(cycle_id, date.today(), db)

                if not compliance.compliant:
                    results["violations_found"] += 1
                    alert_created = await create_alert(
                        farm_id=farm_id,
                        pu_id=pu_id,
                        rule_id="RULE-038",
                        severity="Critical",
                        message=f"Chemical compliance violation on {pu_id}. Harvest BLOCKED.",
                        raw_data={
                            "cycle_id": cycle_id,
                            "blocking_chemicals": [bc.model_dump() for bc in compliance.blocking_chemicals],
                        },
                        db=db
                    )
                    if alert_created:
                        results["alerts_created"] += 1
                        from workers.whatsapp_worker import send_whatsapp_alert
                        send_whatsapp_alert.apply_async(args=[alert_created.id], queue="notifications")
                else:
                    resolved = await auto_resolve_alert(farm_id, pu_id, "RULE-038", db)
                    if resolved:
                        results["alerts_resolved"] += 1

    asyncio.run(_run())
    log.info("compliance_scan_complete", **results)
    return results
```

---

### 4.9 `sync_offline_entries`

**File:** `workers/sync_worker.py`
**Queue:** `automation`
**Triggered by:** `POST /sync/batch` when app reconnects after offline period

```python
# workers/sync_worker.py
import structlog
import asyncio
from workers.celery_app import celery_app

logger = structlog.get_logger()


@celery_app.task(
    name="workers.sync_worker.sync_offline_entries",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=False,
    queue="automation",
    soft_time_limit=300,
    time_limit=600,
    acks_late=True,
)
def sync_offline_entries(self, sync_batch_id: str) -> dict:
    """
    Processes a batch of entries queued while the device was offline.

    Process:
      1. Fetch sync_batch record by sync_batch_id
         (created by mobile app on reconnect with all queued entries)
      2. For each entry in the batch (ordered by client_timestamp ASC):
         a. Schema validation: validate entry fields against the target model
         b. Duplicate check: query DB for existing record with same
            (client_timestamp, pu_id, entry_type) combination — skip if exists
         c. FK validation: verify referenced IDs (cycle_id, worker_id etc.) exist
         d. Insert in dependency order:
            i.   WeatherLog (no dependencies)
            ii.  FieldEvent (depends on cycle_id)
            iii. HarvestLog (depends on cycle_id; runs compliance check)
            iv.  IncomeLog (depends on cycle_id)
            v.   LaborAttendance (depends on worker_id)
      3. Build per-entry results: {entry_id, success, error, inserted_id}
      4. Update sync_batch record: status='completed', processed_at, results_json
      5. On partial failure: status='partial', list failed entries
      6. Return full results summary

    Deduplication key:
      (client_generated_timestamp, pu_id, entry_type)
      This prevents double-inserts if the sync is retried due to connectivity issues.
      The client must send a stable client_timestamp with each entry.

    Args:
        sync_batch_id: UUID of the sync_batch record

    Returns:
        dict: batch_id, total_entries, succeeded, failed, skipped_duplicates, results
    """
    log = logger.bind(task="sync_offline_entries", batch_id=sync_batch_id, attempt=self.request.retries)
    log.info("sync_batch_start")

    async def _run():
        from database import AsyncSessionLocal
        from services.sync_service import process_sync_batch

        async with AsyncSessionLocal() as db:
            return await process_sync_batch(sync_batch_id, db)

    result = asyncio.run(_run())
    log.info("sync_batch_complete", **result)
    return result
```

---

### 4.10 `check_equipment_maintenance` (Maintenance Worker)

**File:** `workers/maintenance_worker.py`
**Queue:** `automation`
**Trigger:** Daily at 6:15am FST (18:15 UTC)

```python
# workers/maintenance_worker.py
import structlog
import asyncio
from workers.celery_app import celery_app

logger = structlog.get_logger()


@celery_app.task(
    name="workers.maintenance_worker.check_equipment_maintenance",
    bind=True,
    max_retries=3,
    default_retry_delay=120,
    autoretry_for=(Exception,),
    queue="automation",
    soft_time_limit=300,
    acks_late=True,
)
def check_equipment_maintenance(self) -> dict:
    """
    Daily equipment maintenance check. Queries all equipment records across
    all active tenants where maintenance is due or upcoming.

    Logic:
      1. Query equipment WHERE next_maintenance_date IS NOT NULL
         AND next_maintenance_date <= TODAY + 3 days
         AND is_active = true
      2. For each matching equipment:
         a. If next_maintenance_date = TODAY: severity = 'High'
         b. If next_maintenance_date < TODAY: severity = 'Critical' (overdue)
         c. If next_maintenance_date = TODAY + 1 to 3: severity = 'Medium' (advance warning)
      3. Apply deduplication — check for existing open RULE-025 alert for this equipment
      4. Create task_queue entry: 'Equipment Maintenance Due: {equipment_name}'
         due_date = next_maintenance_date
         assigned_to = farm manager
      5. Create alert if not already open for this equipment this week
      6. Queue WhatsApp notification

    Corresponds to automation rules RULE-025 (MaintenanceDue) and RULE-024 (EquipmentAlert).

    Returns:
        dict: equipment_checked, maintenance_due, alerts_created, tasks_created
    """
    log = logger.bind(task="check_equipment_maintenance", run_id=self.request.id)
    log.info("maintenance_check_start")

    results = {"equipment_checked": 0, "maintenance_due": 0, "alerts_created": 0, "tasks_created": 0}

    async def _run():
        from database import AsyncSessionLocal
        from services.automation_service import create_alert, create_task
        from sqlalchemy import text
        from datetime import date, timedelta

        today = date.today()
        lookforward = today + timedelta(days=3)

        async with AsyncSessionLocal() as db:
            rows = await db.execute(
                text("""
                    SELECT e.id, e.farm_id, e.equipment_name, e.next_maintenance_date,
                           f.tenant_id
                    FROM equipment e
                    JOIN farms f ON f.id = e.farm_id
                    JOIN tenants t ON t.id = f.tenant_id
                    WHERE e.next_maintenance_date <= :lookforward
                      AND e.is_active = true
                      AND t.is_active = true
                    ORDER BY e.next_maintenance_date ASC
                """),
                {"lookforward": lookforward}
            )
            equipment_list = rows.fetchall()

            for eq_id, farm_id, eq_name, maint_date, tenant_id in equipment_list:
                results["equipment_checked"] += 1
                results["maintenance_due"] += 1

                if maint_date < today:
                    severity = "Critical"
                elif maint_date == today:
                    severity = "High"
                else:
                    severity = "Medium"

                alert_created = await create_alert(
                    farm_id=farm_id,
                    pu_id=None,
                    rule_id="RULE-025",
                    severity=severity,
                    message=f"Equipment maintenance {'OVERDUE' if maint_date < today else 'DUE'}: {eq_name}. "
                            f"Scheduled: {maint_date.strftime('%d %b %Y')}.",
                    raw_data={"equipment_id": eq_id, "equipment_name": eq_name, "maintenance_date": str(maint_date)},
                    db=db
                )
                if alert_created:
                    results["alerts_created"] += 1

                task_created = await create_task(
                    farm_id=farm_id,
                    task_name=f"Maintenance: {eq_name}",
                    task_type="equipment_maintenance",
                    due_date=maint_date,
                    priority="critical" if severity == "Critical" else "high" if severity == "High" else "medium",
                    rule_id="RULE-025",
                    db=db
                )
                if task_created:
                    results["tasks_created"] += 1

    asyncio.run(_run())
    log.info("maintenance_check_complete", **results)
    return results
```

---

## 5. Error Handling Strategy

### Logging

All tasks use `structlog` with bound context:

```python
log = logger.bind(
    task="task_name",
    run_id=self.request.id,       # Celery task UUID
    tenant_id=tenant_id,          # When processing a specific tenant
    farm_id=farm_id,              # When processing a specific farm
    attempt=self.request.retries, # Retry count (0 = first attempt)
)
```

Structured log fields enable log aggregation and alerting in Grafana/Loki.

### Retry Policy Summary

| Task | max_retries | retry_backoff | Behavior on Exhaustion |
|------|------------|---------------|------------------------|
| `run_automation_engine` | 3 | True (120s, 240s, 480s) | Dead letter, Sentry alert |
| `run_decision_engine` | 3 | True | Dead letter, Sentry alert |
| `run_weekly_kpi_snapshot` | 3 | False (300s fixed) | Dead letter, Sentry alert |
| `refresh_materialized_views` | 2 | False | Dead letter, Sentry warning |
| `send_whatsapp_alert` | 5 | True (60s→960s) | Dead letter, Sentry CRITICAL |
| `process_tis_command` | 2 | False (30s fixed) | Mark command 'failed', user notified |
| `process_voice_command` | 3 | True | Mark voice log 'failed', WhatsApp error sent |
| `check_chemical_compliance_scan` | 3 | False | Dead letter, Sentry alert |
| `sync_offline_entries` | 3 | False | Mark batch 'failed', user notified |
| `check_equipment_maintenance` | 3 | False | Dead letter, Sentry warning |
| `refresh_community_price_index` | 2 | False | Dead letter, Sentry warning |

### Dead Letter Queue

Tasks that have exhausted all retries are routed to the `failed_tasks` queue:

```python
# In celery_app.py
celery_app.conf.task_queues = {
    # ... standard queues ...
    "failed_tasks": {
        "exchange": "failed_tasks",
        "routing_key": "failed_tasks",
    }
}
```

An operations worker monitors `failed_tasks` and sends a Sentry alert for any task landing there.

### Sentry Integration

```python
# In each worker file, at module level:
import sentry_sdk
from config import get_settings

settings = get_settings()
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        traces_sample_rate=0.1,
        profiles_sample_rate=0.1,
    )
```

Sentry alerts are triggered when:
- A task exhausts all retries (any task)
- `send_whatsapp_alert` fails for a CRITICAL severity alert
- `process_tis_command` fails for a second time
- `run_automation_engine` fails with a full retry exhaustion (operations-impacting)

### Task Monitoring

Monitor via Flower (Celery monitoring tool):

```bash
celery -A workers.celery_app flower --port=5555 --basic_auth=admin:password
```

Key metrics to watch:
- Queue depth for `ai` queue — must stay < 50 (API rate limit constraint)
- Failed task count in `failed_tasks` queue — must be 0 in healthy operation
- `run_automation_engine` last success timestamp — alert if > 25 hours old
- `refresh_materialized_views` last success — alert if > 2 hours old
