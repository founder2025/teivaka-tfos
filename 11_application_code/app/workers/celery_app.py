from celery import Celery
from celery.schedules import crontab
from kombu import Queue
from app.config import settings

app = Celery(
    "teivaka_agrios",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.workers.automation_worker",
        "app.workers.decision_engine_worker",
        "app.workers.notification_worker",
        "app.workers.ai_worker",
        "app.workers.maintenance_worker",
        "app.tasks.health_monitor",
    ]
)

app.conf.update(
    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # Timezone — all schedules defined in UTC, displayed in Fiji
    timezone="UTC",
    enable_utc=True,

    # Task behavior
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_track_started=True,
    task_time_limit=600,       # 10 min hard limit
    task_soft_time_limit=540,  # 9 min soft limit (triggers SoftTimeLimitExceeded)

    # Result expiry
    result_expires=86400,  # 24 hours

    # Queues
    task_queues=(
        Queue("automation",     routing_key="automation"),
        Queue("decision",       routing_key="decision"),
        Queue("notifications",  routing_key="notifications"),
        Queue("ai",             routing_key="ai"),
        Queue("maintenance",    routing_key="maintenance"),
        Queue("default",        routing_key="default"),
    ),
    task_default_queue="default",
    task_routes={
        "app.workers.automation_worker.*":      {"queue": "automation"},
        "app.workers.decision_engine_worker.*": {"queue": "decision"},
        "app.workers.notification_worker.*":    {"queue": "notifications"},
        "app.workers.ai_worker.*":              {"queue": "ai"},
        "app.workers.maintenance_worker.*":     {"queue": "maintenance"},
    },

    # Beat schedule (all times UTC, Fiji = UTC+12)
    beat_schedule={
        # Automation Engine: 06:00 Fiji = 18:00 UTC
        "automation-engine-daily": {
            "task": "app.workers.automation_worker.run_automation_engine",
            "schedule": crontab(hour=18, minute=0),
            "options": {"queue": "automation"},
        },
        # Decision Engine: 06:05 Fiji = 18:05 UTC
        "decision-engine-daily": {
            "task": "app.workers.decision_engine_worker.run_decision_engine",
            "schedule": crontab(hour=18, minute=5),
            "options": {"queue": "decision"},
        },
        # Materialized view refresh: 06:10 Fiji = 18:10 UTC
        "mv-refresh-daily": {
            "task": "app.workers.maintenance_worker.refresh_materialized_views",
            "schedule": crontab(hour=18, minute=10),
            "options": {"queue": "maintenance"},
        },
        # Ferry buffer scan: weekly Monday 06:00 Fiji = 18:00 UTC Sunday
        "ferry-buffer-weekly": {
            "task": "app.workers.automation_worker.run_ferry_buffer_scan",
            "schedule": crontab(hour=18, minute=0, day_of_week=0),  # Sunday UTC = Monday Fiji
            "options": {"queue": "automation"},
        },
        # Batch low-priority alerts: every hour
        "batch-low-alerts": {
            "task": "app.workers.notification_worker.send_batched_low_alerts",
            "schedule": crontab(minute=0),
            "options": {"queue": "notifications"},
        },
        # AI insights weekly: Sunday 06:00 Fiji = Saturday 18:00 UTC
        "ai-insights-weekly": {
            "task": "app.workers.ai_worker.generate_weekly_insights",
            "schedule": crontab(hour=18, minute=0, day_of_week=6),
            "options": {"queue": "ai"},
        },
        # Infra health monitor — cheap probes every 15 min at :00 :15 :30 :45
        "ops-run-cheap-checks": {
            "task": "ops.run_cheap_checks",
            "schedule": crontab(minute="0,15,30,45"),
            "options": {"queue": "ai"},
        },
        # Infra health monitor — expensive (OpenClaw) probes every 4 h
        "ops-run-expensive-checks": {
            "task": "ops.run_expensive_checks",
            "schedule": crontab(minute=0, hour="0,4,8,12,16,20"),
            "options": {"queue": "ai"},
        },
    },
)
