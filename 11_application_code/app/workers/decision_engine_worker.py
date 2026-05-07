"""
Decision Engine Celery worker.
Computes all 10 decision signals daily at 06:05 Fiji time (18:05 UTC).
Stores snapshots — NEVER compute on-demand.
"""
import psycopg2
import psycopg2.extras
from app.workers.celery_app import app as celery_app
from app.workers.rls_helpers import with_rls
from app.config import settings
from datetime import datetime
import logging
import uuid

logger = logging.getLogger(__name__)


def get_sync_db():
    db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(db_url, cursor_factory=psycopg2.extras.RealDictCursor)


# SIGNAL_THRESHOLDS dict deleted in Strike #116. Thresholds now read from
# tenant.decision_signal_config (per-tenant). _threshold_to_status takes
# explicit thresholds passed in by the caller — no module-level lookup.


def _threshold_to_status(value, green, amber, lower_is_better: bool) -> str:
    """Map a computed signal value to GREEN/AMBER/RED/NULL using explicit thresholds.

    Thresholds passed in by caller (read from tenant.decision_signal_config under
    RLS context). No fallback dict; if caller passes None for any threshold,
    returns NULL (loud-but-safe — schema gap should not produce credible-looking
    status from a default).
    """
    if value is None or green is None or amber is None or lower_is_better is None:
        return "NULL"
    value = float(value)
    green = float(green)
    amber = float(amber)
    if lower_is_better:
        if value <= green:
            return "GREEN"
        elif value <= amber:
            return "AMBER"
        return "RED"
    else:
        if value >= green:
            return "GREEN"
        elif value >= amber:
            return "AMBER"
        return "RED"


def compute_signals_sql(cur, farm_id: str, tenant_id: str, failed_signals: list = None) -> list:
    """Computes all 10 signals via SQL queries. Returns list of (signal_id, value).

    Each signal wrapped in SAVEPOINT for per-signal isolation (Strike #113).
    On psycopg2.Error: rollback to savepoint, log, append (sig, default), record
    failure in `failed_signals` if provided.
    """
    signals = []
    if failed_signals is None:
        failed_signals = []

    def _try_signal(signal_id, fn, default=None):
        """Run a signal compute under SAVEPOINT isolation."""
        sp_name = f"sig_{signal_id.replace('-', '_')}"
        cur.execute(f"SAVEPOINT {sp_name}")
        try:
            value = fn()
            cur.execute(f"RELEASE SAVEPOINT {sp_name}")
            signals.append((signal_id, value))
        except psycopg2.Error as e:
            cur.execute(f"ROLLBACK TO SAVEPOINT {sp_name}")
            logger.warning(f"{signal_id} compute skipped for {farm_id}: {type(e).__name__}: {str(e).strip()[:200]}")
            failed_signals.append((farm_id, signal_id))
            signals.append((signal_id, default))

    # DS-001: Average CoKG as ratio to avg market price (closed cycles, last 6 months)
    def _compute_ds_001():
        cur.execute("""
            SELECT AVG(cogk_fjd_per_kg) as avg_cogk
            FROM tenant.production_cycles
            WHERE farm_id = %s AND cycle_status = 'CLOSED'
              AND cogk_fjd_per_kg IS NOT NULL
              AND actual_harvest_start >= CURRENT_DATE - 180
        """, (farm_id,))
        row = cur.fetchone()
        return float(row["avg_cogk"]) if row and row["avg_cogk"] else None
    _try_signal("DS-001", _compute_ds_001, default=None)

    # DS-002: Max days inactive across active cycles (CRP-KAV excluded from >7 threshold)
    # CTE pattern: per-cycle inactivity inside, farm-level aggregation outside.
    # Avoids nested-aggregate error (Strike #112).
    def _compute_ds_002():
        cur.execute("""
            WITH cycle_inactivity AS (
                SELECT
                    pc.cycle_id,
                    p.production_id,
                    CURRENT_DATE - COALESCE(MAX(fe.event_date::DATE), pc.planting_date) AS days_inactive
                FROM tenant.production_cycles pc
                JOIN shared.productions p ON p.production_id = pc.production_id
                LEFT JOIN tenant.field_events fe ON fe.cycle_id = pc.cycle_id
                WHERE pc.farm_id = %s AND pc.cycle_status = 'ACTIVE'
                GROUP BY pc.cycle_id, pc.planting_date, p.production_id
            )
            SELECT MAX(
                CASE WHEN production_id = 'CRP-KAV' AND days_inactive <= 180 THEN 0
                     ELSE days_inactive
                END
            ) AS max_inactive_days
            FROM cycle_inactivity
        """, (farm_id,))
        row = cur.fetchone()
        return float(row["max_inactive_days"]) if row and row["max_inactive_days"] else 0
    _try_signal("DS-002", _compute_ds_002, default=0)

    # DS-003: Count of active CRITICAL/HIGH alerts
    def _compute_ds_003():
        cur.execute("""
            SELECT COUNT(*) as cnt FROM tenant.alerts
            WHERE farm_id = %s AND alert_status = 'ACTIVE' AND severity IN ('CRITICAL','HIGH')
        """, (farm_id,))
        row = cur.fetchone()
        return float(row["cnt"] or 0)
    _try_signal("DS-003", _compute_ds_003, default=0)

    # DS-004: % of inputs with adequate stock (above reorder point)
    def _compute_ds_004():
        cur.execute("""
            SELECT
                COUNT(*) FILTER (WHERE current_stock_qty > COALESCE(reorder_point_qty, 0)) * 100.0
                / NULLIF(COUNT(*), 0) AS adequacy_pct
            FROM tenant.inputs
            WHERE farm_id = %s AND is_active = true AND reorder_point_qty IS NOT NULL
        """, (farm_id,))
        row = cur.fetchone()
        return float(row["adequacy_pct"]) if row and row["adequacy_pct"] else None
    _try_signal("DS-004", _compute_ds_004, default=None)

    # DS-005: Labor cost ratio (labor / revenue %)
    def _compute_ds_005():
        cur.execute("""
            SELECT
                SUM(total_labor_cost_fjd) * 100.0 / NULLIF(SUM(total_revenue_fjd), 0) AS labor_ratio
            FROM tenant.production_cycles
            WHERE farm_id = %s AND cycle_status IN ('ACTIVE','HARVESTING','CLOSED')
              AND planting_date >= CURRENT_DATE - 180
        """, (farm_id,))
        row = cur.fetchone()
        return float(row["labor_ratio"]) if row and row["labor_ratio"] else None
    _try_signal("DS-005", _compute_ds_005, default=None)

    # DS-006: Average AR days outstanding
    def _compute_ds_006():
        cur.execute("""
            SELECT AVG(days_overdue) as avg_overdue
            FROM tenant.accounts_receivable
            WHERE farm_id = %s AND ar_status IN ('OPEN','PARTIAL','OVERDUE')
        """, (farm_id,))
        row = cur.fetchone()
        return float(row["avg_overdue"]) if row and row["avg_overdue"] else 0
    _try_signal("DS-006", _compute_ds_006, default=0)

    # DS-007: Average harvest yield attainment %
    def _compute_ds_007():
        cur.execute("""
            SELECT AVG(
                actual_yield_kg * 100.0 / NULLIF(planned_yield_kg, 0)
            ) AS attainment_pct
            FROM tenant.production_cycles
            WHERE farm_id = %s AND actual_yield_kg IS NOT NULL AND planned_yield_kg > 0
              AND cycle_status IN ('CLOSED','HARVESTING')
              AND actual_harvest_start >= CURRENT_DATE - 180
        """, (farm_id,))
        row = cur.fetchone()
        return float(row["attainment_pct"]) if row and row["attainment_pct"] else None
    _try_signal("DS-007", _compute_ds_007, default=None)

    # DS-008: Cash flow runway in months (cash / avg monthly spend)
    def _compute_ds_008():
        cur.execute("""
            WITH monthly_spend AS (
                SELECT AVG(monthly) AS avg_monthly FROM (
                    SELECT DATE_TRUNC('month', transaction_date) AS m,
                           SUM(CASE WHEN transaction_type = 'EXPENSE' THEN amount_fjd ELSE 0 END) AS monthly
                    FROM tenant.cash_ledger
                    WHERE farm_id = %s AND transaction_date >= CURRENT_DATE - 90
                    GROUP BY 1
                ) sub
            ),
            cash_balance AS (
                SELECT SUM(CASE WHEN transaction_type = 'INCOME' THEN amount_fjd
                                WHEN transaction_type = 'EXPENSE' THEN -amount_fjd ELSE 0 END) AS balance
                FROM tenant.cash_ledger
                WHERE farm_id = %s
            )
            SELECT cb.balance / NULLIF(ms.avg_monthly, 0) AS runway_months
            FROM cash_balance cb, monthly_spend ms
        """, (farm_id, farm_id))
        row = cur.fetchone()
        return float(row["runway_months"]) if row and row["runway_months"] else None
    _try_signal("DS-008", _compute_ds_008, default=None)

    # DS-009: Rotation compliance % (PREF+OK+COND cycles / total active)
    def _compute_ds_009():
        cur.execute("""
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE EXISTS (
                       SELECT 1 FROM tenant.rotation_override_log rol
                       WHERE rol.cycle_id = pc.cycle_id
                   )) AS overrides
            FROM tenant.production_cycles pc
            WHERE pc.farm_id = %s AND pc.cycle_status = 'ACTIVE'
        """, (farm_id,))
        row = cur.fetchone()
        if row and row["total"] > 0:
            return float((1 - row["overrides"] / row["total"]) * 100)
        return 100.0
    _try_signal("DS-009", _compute_ds_009, default=100.0)

    # DS-010: Ferry buffer days remaining (F002 island farms only)
    def _compute_ds_010():
        cur.execute("SELECT island_logistics FROM tenant.farms WHERE farm_id = %s", (farm_id,))
        farm_row = cur.fetchone()
        if not (farm_row and farm_row["island_logistics"]):
            return None
        cur.execute("""
            SELECT MIN(
                CASE WHEN reorder_point_qty > 0
                THEN current_stock_qty / (reorder_point_qty / 14.0)
                ELSE 999 END
            ) AS min_days
            FROM tenant.inputs
            WHERE farm_id = %s AND is_active = true AND reorder_point_qty IS NOT NULL
        """, (farm_id,))
        row = cur.fetchone()
        return float(row["min_days"]) if row and row["min_days"] else None
    _try_signal("DS-010", _compute_ds_010, default=None)  # Not applicable for mainland farms

    return signals


@celery_app.task(
    name="app.workers.decision_engine_worker.run_decision_engine",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    queue="decision",
)
def run_decision_engine(self):
    """
    Computes all 10 decision signals for all active farms.
    Stores snapshots in decision_signal_snapshots (TimescaleDB hypertable).
    Runs daily at 06:05 Fiji time (18:05 UTC).
    NEVER expose on-demand computation — always read mv_decision_signals_current.
    """
    logger.info(f"[DECISION ENGINE] Starting at {datetime.now().isoformat()}")
    conn = get_sync_db()
    try:
        # Stage 1: enumerate active tenants. tenant.tenants has no RLS policy
        # so this scan does not need a tenant context.
        cur = conn.cursor()
        cur.execute("""
            SELECT tenant_id::TEXT AS tenant_id
            FROM tenant.tenants
            WHERE subscription_status = 'ACTIVE'
              AND subscription_tier IN ('PREMIUM','CUSTOM','BASIC')
        """)
        tenants = cur.fetchall()
        cur.close()
        conn.commit()

        total_snapshots = 0
        farms_processed = 0
        failed_signals = []

        for tenant in tenants:
            tenant_id = tenant["tenant_id"]

            # Stage 2a: list this tenant's active farms + fetch threshold config
            # under per-tenant RLS. Single SELECT per tenant covers all farms;
            # threshold dict passed into compute_signals_sql for per-signal use.
            with with_rls(conn, tenant_id) as cur:
                cur.execute("""
                    SELECT farm_id
                    FROM tenant.farms
                    WHERE is_active = true
                """)
                farms = cur.fetchall()
                cur.execute("""
                    SELECT signal_id, green_threshold, amber_threshold, threshold_direction
                    FROM tenant.decision_signal_config
                    WHERE is_active = true
                """)
                thresholds = {
                    r["signal_id"]: (
                        r["green_threshold"],
                        r["amber_threshold"],
                        r["threshold_direction"] == "LOWER_IS_BETTER",
                    )
                    for r in cur.fetchall()
                }
            conn.commit()

            farms_processed += len(farms)

            # Stage 2b: per-farm signal compute + INSERT under same RLS context.
            # Each farm its own transaction so one farm's failure doesn't roll
            # back its tenant siblings.
            for farm_row in farms:
                farm_id = farm_row["farm_id"]
                with with_rls(conn, tenant_id) as cur:
                    try:
                        signals = compute_signals_sql(cur, farm_id, tenant_id, failed_signals)
                        for signal_id, value in signals:
                            green, amber, lower_is_better = thresholds.get(
                                signal_id, (None, None, None)
                            )
                            status = _threshold_to_status(value, green, amber, lower_is_better)
                            snapshot_id = f"DSS-{uuid.uuid4().hex[:12].upper()}"
                            cur.execute("""
                                INSERT INTO tenant.decision_signal_snapshots
                                    (snapshot_id, snapshot_date, tenant_id, farm_id, signal_id, computed_value, signal_status)
                                VALUES (%s, NOW(), %s, %s, %s, %s, %s)
                            """, (snapshot_id, tenant_id, farm_id, signal_id, value, status))
                            total_snapshots += 1
                        conn.commit()
                        logger.info(f"[DECISION ENGINE] {farm_id}: {len(signals)} signals stored")
                    except Exception as e:
                        logger.error(f"Signal compute error for {farm_id}: {e}", exc_info=True)
                        conn.rollback()

        logger.info(f"[DECISION ENGINE] Complete. {total_snapshots} snapshots across {farms_processed} farms in {len(tenants)} tenants. {len(failed_signals)} per-signal failures.")
        return {"tenants_processed": len(tenants), "farms_processed": farms_processed, "snapshots_stored": total_snapshots, "signals_failed": failed_signals}
    except Exception as e:
        conn.rollback()
        raise self.retry(exc=e)
    finally:
        conn.close()
