"""Maintenance worker — materialized view refresh and DB housekeeping."""
import psycopg2
import psycopg2.extras
from app.workers.celery_app import app as celery_app
from app.config import settings
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def get_sync_db():
    db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(db_url, cursor_factory=psycopg2.extras.RealDictCursor)


@celery_app.task(
    name="app.workers.maintenance_worker.refresh_materialized_views",
    bind=True,
    max_retries=2,
    queue="maintenance",
)
def refresh_materialized_views(self):
    """
    Refreshes all 11 materialized views via the DB function.
    Runs daily at 06:10 Fiji time (18:10 UTC).
    """
    logger.info(f"[MV REFRESH] Starting at {datetime.now().isoformat()}")
    conn = get_sync_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM tenant.refresh_all_materialized_views()")
        results = cur.fetchall()
        conn.commit()

        failed = [r["view_name"] for r in results if not r["success"]]
        total_ms = sum(r["duration_ms"] for r in results)

        if failed:
            logger.warning(f"[MV REFRESH] Failed views: {failed}")
        else:
            logger.info(f"[MV REFRESH] All {len(results)} views refreshed in {total_ms}ms total.")

        return {
            "views_refreshed": len(results),
            "failed_views": failed,
            "total_duration_ms": total_ms,
        }
    except Exception as e:
        conn.rollback()
        raise self.retry(exc=e)
    finally:
        conn.close()


@celery_app.task(
    name="app.workers.maintenance_worker.cleanup_resolved_alerts",
    queue="maintenance",
)
def cleanup_resolved_alerts():
    """
    Marks alerts as SUPPRESSED if resolved > 7 days ago.
    Keeps DB clean and alert list readable.
    """
    conn = get_sync_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE tenant.alerts
            SET alert_status = 'SUPPRESSED'
            WHERE alert_status = 'RESOLVED'
              AND resolved_at < NOW() - INTERVAL '7 days'
        """)
        updated = cur.rowcount
        conn.commit()
        logger.info(f"[CLEANUP] Suppressed {updated} old resolved alerts")
        return {"suppressed": updated}
    finally:
        conn.close()


@celery_app.task(
    name="app.workers.maintenance_worker.reset_tis_daily_counters",
    queue="maintenance",
)
def reset_tis_daily_counters():
    """
    Resets tis_calls_today to 0 for all tenants at midnight Fiji time.
    Redis keys expire automatically (TTL=86400) but DB column needs reset too.
    """
    conn = get_sync_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE tenant.tenants
            SET tis_calls_today = 0, tis_calls_reset_at = NOW()
        """)
        conn.commit()
        return {"tenants_reset": cur.rowcount}
    finally:
        conn.close()
