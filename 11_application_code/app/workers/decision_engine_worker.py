"""
Decision Engine Celery worker.
Computes all 10 decision signals daily at 06:05 Fiji time (18:05 UTC).
Stores snapshots — NEVER compute on-demand.
"""
import psycopg2
import psycopg2.extras
from app.workers.celery_app import app as celery_app
from app.config import settings
from datetime import datetime
import logging
import uuid

logger = logging.getLogger(__name__)


def get_sync_db():
    db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(db_url, cursor_factory=psycopg2.extras.RealDictCursor)


SIGNAL_THRESHOLDS = {
    # signal_id: (green, amber, lower_is_better)
    "DS-001": (0.80, 1.20, True),   # CoKG as ratio to market price
    "DS-002": (7, 14, True),         # Inactivity days (CRP-KAV uses 180 override)
    "DS-003": (0, 2, True),          # Active CRITICAL/HIGH alerts
    "DS-004": (80.0, 50.0, False),   # Input stock adequacy %
    "DS-005": (40.0, 60.0, True),    # Labor cost ratio % of revenue
    "DS-006": (30, 60, True),        # AR days outstanding
    "DS-007": (85.0, 70.0, False),   # Harvest yield attainment %
    "DS-008": (3.0, 1.0, False),     # Cash flow months runway
    "DS-009": (90.0, 75.0, False),   # Rotation compliance %
    "DS-010": (14, 7, False),        # Ferry buffer days (F002 only)
}


def value_to_status(signal_id: str, value) -> str:
    if value is None:
        return "NULL"
    value = float(value)
    green, amber, lower_is_better = SIGNAL_THRESHOLDS.get(signal_id, (1, 0.5, True))
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


def compute_signals_sql(cur, farm_id: str, tenant_id: str) -> list:
    """Computes all 10 signals via SQL queries. Returns list of (signal_id, value)."""
    signals = []

    # DS-001: Average CoKG as ratio to avg market price (closed cycles, last 6 months)
    cur.execute("""
        SELECT AVG(cogk_fjd_per_kg) as avg_cogk
        FROM tenant.production_cycles
        WHERE farm_id = %s AND cycle_status = 'CLOSED'
          AND cogk_fjd_per_kg IS NOT NULL
          AND actual_harvest_start >= CURRENT_DATE - 180
    """, (farm_id,))
    row = cur.fetchone()
    signals.append(("DS-001", float(row["avg_cogk"]) if row and row["avg_cogk"] else None))

    # DS-002: Max days inactive across active cycles (CRP-KAV excluded from >7 threshold)
    cur.execute("""
        SELECT MAX(
            CASE WHEN p.production_id = 'CRP-KAV' THEN
                CASE WHEN CURRENT_DATE - COALESCE(MAX(fe.event_date::DATE), pc.planting_date) > 180
                     THEN CURRENT_DATE - COALESCE(MAX(fe.event_date::DATE), pc.planting_date)
                     ELSE 0 END
            ELSE CURRENT_DATE - COALESCE(MAX(fe.event_date::DATE), pc.planting_date)
            END
        ) AS max_inactive_days
        FROM tenant.production_cycles pc
        JOIN shared.productions p ON p.production_id = pc.production_id
        LEFT JOIN tenant.field_events fe ON fe.cycle_id = pc.cycle_id
        WHERE pc.farm_id = %s AND pc.cycle_status = 'ACTIVE'
        GROUP BY pc.cycle_id, pc.planting_date, p.production_id
    """, (farm_id,))
    row = cur.fetchone()
    signals.append(("DS-002", float(row["max_inactive_days"]) if row and row["max_inactive_days"] else 0))

    # DS-003: Count of active CRITICAL/HIGH alerts
    cur.execute("""
        SELECT COUNT(*) as cnt FROM tenant.alerts
        WHERE farm_id = %s AND alert_status = 'ACTIVE' AND severity IN ('CRITICAL','HIGH')
    """, (farm_id,))
    row = cur.fetchone()
    signals.append(("DS-003", float(row["cnt"] or 0)))

    # DS-004: % of inputs with adequate stock (above reorder point)
    cur.execute("""
        SELECT
            COUNT(*) FILTER (WHERE current_stock_qty > COALESCE(reorder_point_qty, 0)) * 100.0
            / NULLIF(COUNT(*), 0) AS adequacy_pct
        FROM tenant.inputs
        WHERE farm_id = %s AND is_active = true AND reorder_point_qty IS NOT NULL
    """, (farm_id,))
    row = cur.fetchone()
    signals.append(("DS-004", float(row["adequacy_pct"]) if row and row["adequacy_pct"] else None))

    # DS-005: Labor cost ratio (labor / revenue %)
    cur.execute("""
        SELECT
            SUM(total_labor_cost_fjd) * 100.0 / NULLIF(SUM(total_revenue_fjd), 0) AS labor_ratio
        FROM tenant.production_cycles
        WHERE farm_id = %s AND cycle_status IN ('ACTIVE','HARVESTING','CLOSED')
          AND planting_date >= CURRENT_DATE - 180
    """, (farm_id,))
    row = cur.fetchone()
    signals.append(("DS-005", float(row["labor_ratio"]) if row and row["labor_ratio"] else None))

    # DS-006: Average AR days outstanding
    cur.execute("""
        SELECT AVG(days_overdue) as avg_overdue
        FROM tenant.accounts_receivable
        WHERE farm_id = %s AND ar_status IN ('OPEN','PARTIAL','OVERDUE')
    """, (farm_id,))
    row = cur.fetchone()
    signals.append(("DS-006", float(row["avg_overdue"]) if row and row["avg_overdue"] else 0))

    # DS-007: Average harvest yield attainment %
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
    signals.append(("DS-007", float(row["attainment_pct"]) if row and row["attainment_pct"] else None))

    # DS-008: Cash flow runway in months (cash / avg monthly spend)
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
    signals.append(("DS-008", float(row["runway_months"]) if row and row["runway_months"] else None))

    # DS-009: Rotation compliance % (PREF+OK+COND cycles / total active)
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
        compliance = (1 - row["overrides"] / row["total"]) * 100
        signals.append(("DS-009", float(compliance)))
    else:
        signals.append(("DS-009", 100.0))

    # DS-010: Ferry buffer days remaining (F002 island farms only)
    cur.execute("SELECT island_logistics FROM tenant.farms WHERE farm_id = %s", (farm_id,))
    farm_row = cur.fetchone()
    if farm_row and farm_row["island_logistics"]:
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
        signals.append(("DS-010", float(row["min_days"]) if row and row["min_days"] else None))
    else:
        signals.append(("DS-010", None))  # Not applicable for mainland farms

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
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT t.tenant_id::TEXT, f.farm_id
            FROM tenant.tenants t
            JOIN tenant.farms f ON f.tenant_id = t.tenant_id
            WHERE t.subscription_status = 'ACTIVE'
              AND t.subscription_tier IN ('PREMIUM','CUSTOM','BASIC')
              AND f.is_active = true
        """)
        farms = cur.fetchall()

        total_snapshots = 0
        for farm in farms:
            tenant_id = farm["tenant_id"]
            farm_id = farm["farm_id"]
            cur.execute("SET LOCAL app.tenant_id = %s", (tenant_id,))
            try:
                signals = compute_signals_sql(cur, farm_id, tenant_id)
                for signal_id, value in signals:
                    status = value_to_status(signal_id, value)
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

        logger.info(f"[DECISION ENGINE] Complete. {total_snapshots} snapshots for {len(farms)} farms.")
        return {"farms_processed": len(farms), "snapshots_stored": total_snapshots}
    except Exception as e:
        conn.rollback()
        raise self.retry(exc=e)
    finally:
        conn.close()
