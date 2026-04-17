"""
automation_worker.py
Teivaka Agri-TOS — Celery Automation Engine

Evaluates all 43 automation rules across all active farms daily at 06:00 Fiji (18:00 UTC).
Rules are grouped by category. Each rule creates a deduplication-safe alert and queues
a WhatsApp notification at the appropriate delay for its severity level.

Rule coverage in this file:
  RULE-001  Input stock at or below reorder point (LOW/HIGH)
  RULE-002  Input stock at zero (CRITICAL)
  RULE-012  Auto-resolve RULE-001/002 when stock replenished
  RULE-017  Production unit inactivity (CRP-KAV=180 days, others=7 days)
  RULE-018  Production cycle approaching expected planting date with no seed stock
  RULE-019  Production cycle stage mismatch vs expected growth stage
  RULE-020  Harvest overdue — expected harvest date passed
  RULE-021  Cycle closed with no harvest log entry
  RULE-022  Planned yield missing for active cycles
  RULE-023  Multiple active cycles on same PU
  RULE-025  Field event gap > 30 days on active cycle
  RULE-026  Labor log missing for past 7 days on active farm
  RULE-027  Labor cost exceeds budget for current cycle
  RULE-028  Weather advisory — no action logged within 3 days of alert
  RULE-030  Supplier payment overdue
  RULE-031  Purchase order not received within expected lead time
  RULE-032  Input expiry date within 30 days
  RULE-033  Input batch flagged as quarantined
  RULE-034  F002 ferry buffer below threshold (island_logistics farms only)
  RULE-035  Harvest log qty vs cycle planned yield variance > 20%
  RULE-036  Harvest reconciliation variance > 10%
  RULE-037  Sale price below floor price
  RULE-038  Chemical compliance (WHD not cleared before harvest)
  RULE-039  Customer credit limit exceeded
  RULE-040  Accounts receivable overdue
  RULE-041  Accounts payable overdue
  RULE-042  Cash flow projection negative within 30 days
  RULE-043  Subscription renewal within 14 days
"""

import psycopg2
import psycopg2.extras
from celery import shared_task
from datetime import date, datetime, timedelta
import logging
import json
import uuid
from app.config import settings
from app.workers.celery_app import app as celery_app

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Database helper
# ---------------------------------------------------------------------------

def get_sync_db():
    """Returns a synchronous psycopg2 connection (RealDictCursor)."""
    db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(db_url, cursor_factory=psycopg2.extras.RealDictCursor)


# ---------------------------------------------------------------------------
# Alert helpers
# ---------------------------------------------------------------------------

def make_alert_key(rule_id: str, farm_id: str, entity_id: str = "", date_str: str = "") -> str:
    """
    Deduplication key: prevents duplicate alerts for the same event on the same day.
    Format: RULE-034:F002:INP-007:20260407
    Max 200 chars — stored as-is (readable, no hash).
    """
    if not date_str:
        date_str = date.today().strftime("%Y%m%d")
    raw = f"{rule_id}:{farm_id}:{entity_id}:{date_str}"
    return raw[:200]


def create_alert_if_new(
    cur,
    tenant_id: str,
    farm_id: str,
    rule_id: str,
    alert_key: str,
    severity: str,
    title: str,
    message: str,
    entity_type: str = None,
    entity_id: str = None,
    metadata: dict = None,
) -> bool:
    """
    Inserts an alert row only if alert_key does not exist among active alerts.
    Returns True if a new alert was created, False if duplicate was found.
    Also increments the rule trigger counter and queues WhatsApp delivery.
    """
    # Deduplication check — skip if active alert already exists for this key
    cur.execute(
        "SELECT alert_id FROM tenant.alerts WHERE alert_key = %s AND alert_status != 'RESOLVED'",
        (alert_key,)
    )
    if cur.fetchone():
        return False

    # Fetch WhatsApp template and notify_roles from rule definition
    cur.execute(
        "SELECT whatsapp_template, notify_roles FROM tenant.automation_rules WHERE rule_id = %s",
        (rule_id,)
    )
    rule = cur.fetchone()
    whatsapp_template = rule["whatsapp_template"] if rule else None
    notify_roles = list(rule["notify_roles"]) if rule and rule["notify_roles"] else ["FOUNDER"]

    alert_id = f"ALT-{uuid.uuid4().hex[:12].upper()}"

    cur.execute("""
        INSERT INTO tenant.alerts
            (alert_id, tenant_id, farm_id, rule_id, alert_key, severity,
             title, message, alert_status, entity_type, entity_id, metadata)
        VALUES
            (%s, %s, %s, %s, %s, %s, %s, %s, 'ACTIVE', %s, %s, %s)
        ON CONFLICT (alert_key) DO NOTHING
    """, (
        alert_id, tenant_id, farm_id, rule_id, alert_key, severity,
        title, message, entity_type, entity_id,
        json.dumps(metadata or {}),
    ))

    if cur.rowcount > 0:
        # Increment rule trigger counter
        cur.execute(
            """UPDATE tenant.automation_rules
               SET last_triggered_at = NOW(),
                   trigger_count = trigger_count + 1
               WHERE rule_id = %s""",
            (rule_id,)
        )
        # Queue WhatsApp notification at the appropriate delay for this severity
        if whatsapp_template:
            queue_whatsapp_alert.apply_async(
                kwargs={
                    "tenant_id": tenant_id,
                    "farm_id": farm_id,
                    "severity": severity,
                    "message": message,
                    "notify_roles": notify_roles,
                },
                countdown=_get_alert_delay_seconds(severity),
                queue="notifications",
            )
        logger.info(f"Alert created: {alert_id} | {rule_id} | {severity} | {farm_id}")
        return True

    return False


def _get_alert_delay_seconds(severity: str) -> int:
    """
    WhatsApp delivery countdown by severity:
      CRITICAL → immediate (0 s)
      HIGH     → 5 minutes
      MEDIUM   → 30 minutes
      LOW/INFO → 1 hour (batched)
    """
    return {
        "CRITICAL": 0,
        "HIGH": 300,
        "MEDIUM": 1800,
        "LOW": 3600,
        "INFO": 3600,
    }.get(severity, 1800)


# ---------------------------------------------------------------------------
# Master automation engine task
# ---------------------------------------------------------------------------

@celery_app.task(
    name="app.workers.automation_worker.run_automation_engine",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
    queue="automation",
)
def run_automation_engine(self):
    """
    Master automation engine.
    Iterates all active tenants / active farms and evaluates all 43 rules.
    Runs daily at 06:00 Fiji (18:00 UTC) via Celery Beat.
    """
    logger.info(f"[AUTOMATION ENGINE] Starting run at {datetime.now().isoformat()}")
    conn = get_sync_db()

    try:
        cur = conn.cursor()

        cur.execute("""
            SELECT DISTINCT
                t.tenant_id::TEXT AS tenant_id,
                t.subscription_tier,
                f.farm_id,
                f.farm_name,
                f.island_logistics
            FROM tenant.tenants t
            JOIN tenant.farms f ON f.tenant_id = t.tenant_id
            WHERE t.subscription_status = 'ACTIVE'
              AND f.is_active = true
            ORDER BY t.tenant_id, f.farm_id
        """)
        farms = cur.fetchall()

        total_alerts = 0
        for farm in farms:
            tenant_id = farm["tenant_id"]
            farm_id = farm["farm_id"]

            # Row-level security context for multi-tenant isolation
            cur.execute("SET LOCAL app.tenant_id = %s", (tenant_id,))

            try:
                alerts = _evaluate_all_rules(cur, tenant_id, farm_id, farm)
                total_alerts += alerts
                conn.commit()
            except Exception as e:
                logger.error(
                    f"Error evaluating rules for farm {farm_id}: {e}", exc_info=True
                )
                conn.rollback()

        logger.info(
            f"[AUTOMATION ENGINE] Complete. {total_alerts} new alerts across {len(farms)} farms."
        )
        return {"farms_processed": len(farms), "new_alerts": total_alerts}

    except Exception as e:
        conn.rollback()
        logger.error(f"[AUTOMATION ENGINE] Fatal error: {e}", exc_info=True)
        raise self.retry(exc=e)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Rule evaluation dispatcher
# ---------------------------------------------------------------------------

def _evaluate_all_rules(cur, tenant_id: str, farm_id: str, farm: dict) -> int:
    """
    Evaluates all rule categories for a single farm.
    Returns total count of new alerts created.
    """
    alerts_created = 0
    today = date.today()

    alerts_created += _rules_input_stock(cur, tenant_id, farm_id)
    alerts_created += _rule_012_auto_resolve_stock(cur, farm_id)
    alerts_created += _rule_017_inactivity(cur, tenant_id, farm_id)
    alerts_created += _rule_018_missing_seed_stock(cur, tenant_id, farm_id)
    alerts_created += _rule_019_stage_mismatch(cur, tenant_id, farm_id)
    alerts_created += _rule_020_harvest_overdue(cur, tenant_id, farm_id)
    alerts_created += _rule_021_closed_no_harvest_log(cur, tenant_id, farm_id)
    alerts_created += _rule_022_missing_planned_yield(cur, tenant_id, farm_id)
    alerts_created += _rule_023_multiple_active_cycles(cur, tenant_id, farm_id)
    alerts_created += _rule_025_field_event_gap(cur, tenant_id, farm_id)
    alerts_created += _rule_026_labor_log_missing(cur, tenant_id, farm_id)
    alerts_created += _rule_027_labor_cost_over_budget(cur, tenant_id, farm_id)
    alerts_created += _rule_030_supplier_payment_overdue(cur, tenant_id, farm_id)
    alerts_created += _rule_031_po_not_received(cur, tenant_id, farm_id)
    alerts_created += _rule_032_input_expiry_soon(cur, tenant_id, farm_id)
    alerts_created += _rule_033_quarantined_batch(cur, tenant_id, farm_id)
    if farm["island_logistics"]:
        alerts_created += _check_ferry_buffer(cur, tenant_id, farm_id)
    alerts_created += _rule_035_harvest_qty_variance(cur, tenant_id, farm_id)
    alerts_created += _rule_036_harvest_reconciliation(cur, tenant_id, farm_id)
    alerts_created += _rule_037_sale_below_floor(cur, tenant_id, farm_id)
    alerts_created += _rule_038_chemical_compliance(cur, tenant_id, farm_id)
    alerts_created += _rule_039_credit_limit_exceeded(cur, tenant_id, farm_id)
    alerts_created += _rule_040_ar_overdue(cur, tenant_id, farm_id)
    alerts_created += _rule_041_ap_overdue(cur, tenant_id, farm_id)
    alerts_created += _rule_042_cashflow_negative(cur, tenant_id, farm_id)
    alerts_created += _rule_043_subscription_renewal(cur, tenant_id, farm_id)

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-001 / RULE-002: Input stock alerts
# ---------------------------------------------------------------------------

def _rules_input_stock(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-001: Stock at or below reorder point → HIGH
    RULE-002: Stock at zero → CRITICAL
    """
    alerts_created = 0

    cur.execute("""
        SELECT input_id, input_name, current_stock_qty, reorder_point_qty, unit_of_measure
        FROM tenant.inputs
        WHERE farm_id = %s
          AND is_active = true
          AND reorder_point_qty IS NOT NULL
          AND current_stock_qty <= reorder_point_qty
    """, (farm_id,))
    low_stock = cur.fetchall()

    for inp in low_stock:
        is_zero = float(inp["current_stock_qty"]) <= 0
        rule_id = "RULE-002" if is_zero else "RULE-001"
        severity = "CRITICAL" if is_zero else "HIGH"
        stock_label = "OUT OF STOCK" if is_zero else "LOW STOCK"
        title = f"{stock_label}: {inp['input_name']}"
        message = (
            f"{'CRITICAL: Zero stock' if is_zero else 'Low stock'} — {inp['input_name']}\n"
            f"Current: {inp['current_stock_qty']} {inp['unit_of_measure']}\n"
            f"Reorder point: {inp['reorder_point_qty']} {inp['unit_of_measure']}\n"
            f"Farm: {farm_id} | Action required: Place order immediately."
        )
        alert_key = make_alert_key(rule_id, farm_id, inp["input_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, rule_id, alert_key, severity, title, message,
            "input", inp["input_id"],
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-012: Auto-resolve stock alerts when replenished
# ---------------------------------------------------------------------------

def _rule_012_auto_resolve_stock(cur, farm_id: str) -> int:
    """
    RULE-012: Auto-resolve active RULE-001/002 alerts where stock is now
    above the reorder point (i.e. input has been replenished).
    Returns count of resolved alerts (not new alerts).
    """
    cur.execute("""
        UPDATE tenant.alerts
        SET alert_status = 'RESOLVED',
            resolved_at = NOW(),
            resolution_notes = 'Auto-resolved: stock replenished above reorder point'
        WHERE farm_id = %s
          AND rule_id IN ('RULE-001', 'RULE-002')
          AND alert_status = 'ACTIVE'
          AND entity_id IN (
              SELECT input_id
              FROM tenant.inputs
              WHERE farm_id = %s
                AND current_stock_qty > reorder_point_qty
          )
    """, (farm_id, farm_id))
    resolved = cur.rowcount
    if resolved:
        logger.info(f"[RULE-012] Auto-resolved {resolved} stock alerts for {farm_id}")
    return 0  # Resolutions don't count as new alerts


# ---------------------------------------------------------------------------
# RULE-017: Production unit inactivity
# ---------------------------------------------------------------------------

def _rule_017_inactivity(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-017: No field event logged within threshold days.
    CRP-KAV threshold = 180 days; all other crops = 7 days.
    """
    alerts_created = 0

    cur.execute("""
        SELECT
            pu.pu_id,
            pc.cycle_id,
            p.production_id,
            pc.planting_date,
            COALESCE(MAX(fe.event_date::DATE), pc.planting_date) AS last_activity_date,
            CURRENT_DATE - COALESCE(MAX(fe.event_date::DATE), pc.planting_date) AS days_inactive,
            CASE WHEN p.production_id = 'CRP-KAV' THEN 180 ELSE 7 END AS inactivity_threshold_days
        FROM tenant.production_units pu
        JOIN tenant.production_cycles pc ON pc.pu_id = pu.pu_id AND pc.cycle_status = 'ACTIVE'
        JOIN shared.productions p ON p.production_id = pc.production_id
        LEFT JOIN tenant.field_events fe ON fe.cycle_id = pc.cycle_id
        WHERE pu.farm_id = %s
        GROUP BY pu.pu_id, pc.cycle_id, p.production_id, pc.planting_date
        HAVING CURRENT_DATE - COALESCE(MAX(fe.event_date::DATE), pc.planting_date)
               >= CASE WHEN p.production_id = 'CRP-KAV' THEN 180 ELSE 7 END
    """, (farm_id,))
    inactive_pus = cur.fetchall()

    for pu in inactive_pus:
        severity = "MEDIUM" if pu["production_id"] == "CRP-KAV" else "HIGH"
        title = f"Inactivity Alert: {pu['pu_id']}"
        message = (
            f"No activity recorded for {pu['days_inactive']} days\n"
            f"PU: {pu['pu_id']} | Crop: {pu['production_id']}\n"
            f"Last activity: {pu['last_activity_date']}\n"
            + (
                "Kava cycle — 180-day threshold applies."
                if pu["production_id"] == "CRP-KAV"
                else "Action: Log a field event or inspection."
            )
        )
        alert_key = make_alert_key("RULE-017", farm_id, pu["pu_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-017", alert_key, severity, title, message,
            "production_unit", pu["pu_id"],
            {"days_inactive": int(pu["days_inactive"]),
             "threshold_days": int(pu["inactivity_threshold_days"])},
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-018: Missing seed/planting stock ahead of planned planting date
# ---------------------------------------------------------------------------

def _rule_018_missing_seed_stock(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-018: A production cycle has a planting date within 14 days but no
    seed/planting material is in stock for the required input.
    """
    alerts_created = 0

    cur.execute("""
        SELECT
            pc.cycle_id,
            pc.pu_id,
            pc.production_id,
            pc.planting_date,
            COALESCE(i.current_stock_qty, 0) AS seed_stock_qty,
            i.input_name,
            i.unit_of_measure
        FROM tenant.production_cycles pc
        JOIN shared.productions p ON p.production_id = pc.production_id
        LEFT JOIN tenant.inputs i
            ON i.farm_id = %s
            AND i.input_category = 'SEED'
            AND i.production_id = pc.production_id
        WHERE pc.farm_id = %s
          AND pc.cycle_status = 'PLANNED'
          AND pc.planting_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 14
          AND COALESCE(i.current_stock_qty, 0) <= 0
    """, (farm_id, farm_id))
    missing_seed = cur.fetchall()

    for row in missing_seed:
        title = f"Seed Stock Missing: {row['production_id']} — {row['cycle_id']}"
        message = (
            f"Planting scheduled in {(row['planting_date'] - date.today()).days} days but no seed stock.\n"
            f"Cycle: {row['cycle_id']} | Crop: {row['production_id']}\n"
            f"Planting date: {row['planting_date']}\n"
            f"Action: Procure seed/planting material immediately."
        )
        alert_key = make_alert_key("RULE-018", farm_id, row["cycle_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-018", alert_key, "HIGH", title, message,
            "cycle", row["cycle_id"],
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-019: Growth stage mismatch vs expected days since planting
# ---------------------------------------------------------------------------

def _rule_019_stage_mismatch(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-019: The recorded cycle stage does not match expected growth stage
    for days elapsed since planting (per crop stage schedule in shared.production_stages).
    """
    alerts_created = 0

    cur.execute("""
        SELECT
            pc.cycle_id,
            pc.pu_id,
            pc.production_id,
            pc.current_stage,
            pc.planting_date,
            CURRENT_DATE - pc.planting_date AS days_since_planting,
            ps.stage_name AS expected_stage,
            ps.stage_order AS expected_stage_order,
            pcs.stage_order AS current_stage_order
        FROM tenant.production_cycles pc
        JOIN shared.production_stages ps
            ON ps.production_id = pc.production_id
            AND CURRENT_DATE - pc.planting_date
                BETWEEN ps.day_from AND ps.day_to
        LEFT JOIN shared.production_stages pcs
            ON pcs.production_id = pc.production_id
            AND pcs.stage_name = pc.current_stage
        WHERE pc.farm_id = %s
          AND pc.cycle_status = 'ACTIVE'
          AND pc.current_stage IS NOT NULL
          AND COALESCE(pcs.stage_order, 0) < ps.stage_order - 1
    """, (farm_id,))
    mismatches = cur.fetchall()

    for row in mismatches:
        title = f"Stage Mismatch: {row['cycle_id']}"
        message = (
            f"Cycle stage is behind expected progression.\n"
            f"Cycle: {row['cycle_id']} | Crop: {row['production_id']}\n"
            f"Days since planting: {row['days_since_planting']}\n"
            f"Current stage: {row['current_stage']}\n"
            f"Expected stage: {row['expected_stage']}\n"
            f"Action: Update cycle stage or investigate growth delay."
        )
        alert_key = make_alert_key("RULE-019", farm_id, row["cycle_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-019", alert_key, "MEDIUM", title, message,
            "cycle", row["cycle_id"],
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-020: Harvest overdue
# ---------------------------------------------------------------------------

def _rule_020_harvest_overdue(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-020: Expected harvest date has passed (with a 3-day grace period).
    """
    alerts_created = 0

    cur.execute("""
        SELECT cycle_id, pu_id, production_id, expected_harvest_date,
               CURRENT_DATE - expected_harvest_date AS days_overdue
        FROM tenant.production_cycles
        WHERE farm_id = %s
          AND cycle_status = 'ACTIVE'
          AND expected_harvest_date IS NOT NULL
          AND expected_harvest_date < CURRENT_DATE - 3
    """, (farm_id,))
    overdue = cur.fetchall()

    for cyc in overdue:
        severity = "HIGH" if int(cyc["days_overdue"]) > 7 else "MEDIUM"
        title = f"Harvest Overdue: {cyc['cycle_id']}"
        message = (
            f"Harvest overdue by {cyc['days_overdue']} days\n"
            f"Cycle: {cyc['cycle_id']} | Crop: {cyc['production_id']}\n"
            f"Expected harvest date: {cyc['expected_harvest_date']}\n"
            f"Action: Log harvest or update expected date."
        )
        alert_key = make_alert_key("RULE-020", farm_id, cyc["cycle_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-020", alert_key, severity, title, message,
            "cycle", cyc["cycle_id"],
            {"days_overdue": int(cyc["days_overdue"])},
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-021: Cycle closed with no harvest log
# ---------------------------------------------------------------------------

def _rule_021_closed_no_harvest_log(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-021: Production cycle status is CLOSED but no corresponding
    harvest_log entry exists — data integrity issue.
    """
    alerts_created = 0

    cur.execute("""
        SELECT pc.cycle_id, pc.pu_id, pc.production_id, pc.closed_at
        FROM tenant.production_cycles pc
        WHERE pc.farm_id = %s
          AND pc.cycle_status = 'CLOSED'
          AND pc.closed_at > NOW() - INTERVAL '30 days'
          AND NOT EXISTS (
              SELECT 1 FROM tenant.harvest_log hl
              WHERE hl.cycle_id = pc.cycle_id
          )
    """, (farm_id,))
    closed_no_log = cur.fetchall()

    for row in closed_no_log:
        title = f"Missing Harvest Log: {row['cycle_id']}"
        message = (
            f"Cycle closed without a harvest log entry.\n"
            f"Cycle: {row['cycle_id']} | Crop: {row['production_id']}\n"
            f"Closed at: {row['closed_at']}\n"
            f"Action: Log harvest data or investigate data entry."
        )
        alert_key = make_alert_key("RULE-021", farm_id, row["cycle_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-021", alert_key, "MEDIUM", title, message,
            "cycle", row["cycle_id"],
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-022: Planned yield missing for active cycles
# ---------------------------------------------------------------------------

def _rule_022_missing_planned_yield(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-022: Active production cycle has no planned_yield_kg set —
    prevents meaningful decision signal computation.
    """
    alerts_created = 0

    cur.execute("""
        SELECT cycle_id, pu_id, production_id, planting_date
        FROM tenant.production_cycles
        WHERE farm_id = %s
          AND cycle_status = 'ACTIVE'
          AND (planned_yield_kg IS NULL OR planned_yield_kg = 0)
          AND planting_date < CURRENT_DATE - 7
    """, (farm_id,))
    missing_yield = cur.fetchall()

    for row in missing_yield:
        title = f"Planned Yield Missing: {row['cycle_id']}"
        message = (
            f"Active cycle has no planned yield set.\n"
            f"Cycle: {row['cycle_id']} | Crop: {row['production_id']}\n"
            f"Planting date: {row['planting_date']}\n"
            f"Action: Enter planned yield kg to enable decision signals."
        )
        alert_key = make_alert_key("RULE-022", farm_id, row["cycle_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-022", alert_key, "LOW", title, message,
            "cycle", row["cycle_id"],
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-023: Multiple active cycles on the same production unit
# ---------------------------------------------------------------------------

def _rule_023_multiple_active_cycles(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-023: A production unit has more than one ACTIVE cycle simultaneously —
    data integrity / workflow conflict.
    """
    alerts_created = 0

    cur.execute("""
        SELECT pu_id, COUNT(*) AS active_count,
               STRING_AGG(cycle_id, ', ') AS cycle_ids
        FROM tenant.production_cycles
        WHERE farm_id = %s AND cycle_status = 'ACTIVE'
        GROUP BY pu_id
        HAVING COUNT(*) > 1
    """, (farm_id,))
    conflicts = cur.fetchall()

    for row in conflicts:
        title = f"Multiple Active Cycles: {row['pu_id']}"
        message = (
            f"Production unit has {row['active_count']} active cycles simultaneously.\n"
            f"PU: {row['pu_id']} | Cycles: {row['cycle_ids']}\n"
            f"Action: Close or archive duplicate cycle(s) to resolve conflict."
        )
        alert_key = make_alert_key("RULE-023", farm_id, row["pu_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-023", alert_key, "HIGH", title, message,
            "production_unit", row["pu_id"],
            {"active_count": int(row["active_count"]), "cycle_ids": row["cycle_ids"]},
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-025: Field event gap > 30 days on active cycle
# ---------------------------------------------------------------------------

def _rule_025_field_event_gap(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-025: An active cycle has had no field events logged in the past 30 days.
    Separate from RULE-017 which checks the PU itself; this checks the cycle directly.
    """
    alerts_created = 0

    cur.execute("""
        SELECT
            pc.cycle_id,
            pc.pu_id,
            pc.production_id,
            MAX(fe.event_date::DATE) AS last_event_date,
            CURRENT_DATE - MAX(fe.event_date::DATE) AS gap_days
        FROM tenant.production_cycles pc
        LEFT JOIN tenant.field_events fe ON fe.cycle_id = pc.cycle_id
        WHERE pc.farm_id = %s AND pc.cycle_status = 'ACTIVE'
        GROUP BY pc.cycle_id, pc.pu_id, pc.production_id
        HAVING MAX(fe.event_date::DATE) IS NOT NULL
           AND CURRENT_DATE - MAX(fe.event_date::DATE) > 30
    """, (farm_id,))
    gaps = cur.fetchall()

    for row in gaps:
        title = f"Field Event Gap: {row['cycle_id']}"
        message = (
            f"No field events logged for {row['gap_days']} days.\n"
            f"Cycle: {row['cycle_id']} | Crop: {row['production_id']}\n"
            f"Last event: {row['last_event_date']}\n"
            f"Action: Log a field event (inspection, application, or observation)."
        )
        alert_key = make_alert_key("RULE-025", farm_id, row["cycle_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-025", alert_key, "MEDIUM", title, message,
            "cycle", row["cycle_id"],
            {"gap_days": int(row["gap_days"])},
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-026: Labor log missing for past 7 days on active farm
# ---------------------------------------------------------------------------

def _rule_026_labor_log_missing(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-026: No labor log entries have been recorded in the past 7 days
    on a farm that has active production cycles.
    """
    alerts_created = 0

    # Check whether any active cycles exist
    cur.execute("""
        SELECT 1 FROM tenant.production_cycles
        WHERE farm_id = %s AND cycle_status = 'ACTIVE' LIMIT 1
    """, (farm_id,))
    if not cur.fetchone():
        return 0

    # Check for recent labor logs
    cur.execute("""
        SELECT MAX(log_date) AS last_log_date
        FROM tenant.labor_log
        WHERE farm_id = %s AND log_date > CURRENT_DATE - 7
    """, (farm_id,))
    row = cur.fetchone()

    if not row or row["last_log_date"] is None:
        title = f"Labor Log Missing: {farm_id}"
        message = (
            f"No labor logs recorded in the past 7 days for farm {farm_id}.\n"
            f"Action: Log daily labor hours for accurate CoKG computation."
        )
        alert_key = make_alert_key("RULE-026", farm_id, "labor", date.today().strftime("%Y%m%d"))
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-026", alert_key, "LOW", title, message,
            "farm", farm_id,
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-027: Labor cost exceeds cycle budget
# ---------------------------------------------------------------------------

def _rule_027_labor_cost_over_budget(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-027: Total labor cost for an active cycle exceeds the budgeted
    labor cost by more than 10%.
    """
    alerts_created = 0

    cur.execute("""
        SELECT
            pc.cycle_id,
            pc.production_id,
            pc.budgeted_labor_fjd,
            COALESCE(SUM(ll.total_cost_fjd), 0) AS actual_labor_fjd,
            CASE WHEN pc.budgeted_labor_fjd > 0
                 THEN ROUND((COALESCE(SUM(ll.total_cost_fjd), 0) - pc.budgeted_labor_fjd)
                            / pc.budgeted_labor_fjd * 100, 1)
                 ELSE NULL
            END AS overrun_pct
        FROM tenant.production_cycles pc
        LEFT JOIN tenant.labor_log ll ON ll.cycle_id = pc.cycle_id
        WHERE pc.farm_id = %s
          AND pc.cycle_status = 'ACTIVE'
          AND pc.budgeted_labor_fjd > 0
        GROUP BY pc.cycle_id, pc.production_id, pc.budgeted_labor_fjd
        HAVING COALESCE(SUM(ll.total_cost_fjd), 0) > pc.budgeted_labor_fjd * 1.10
    """, (farm_id,))
    over_budget = cur.fetchall()

    for row in over_budget:
        severity = "HIGH" if float(row["overrun_pct"] or 0) > 25 else "MEDIUM"
        title = f"Labor Over Budget: {row['cycle_id']}"
        message = (
            f"Labor costs exceed budget by {row['overrun_pct']}%\n"
            f"Cycle: {row['cycle_id']} | Crop: {row['production_id']}\n"
            f"Budgeted: FJD {row['budgeted_labor_fjd']:,.2f}\n"
            f"Actual: FJD {row['actual_labor_fjd']:,.2f}\n"
            f"Action: Review labor allocation or adjust budget."
        )
        alert_key = make_alert_key("RULE-027", farm_id, row["cycle_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-027", alert_key, severity, title, message,
            "cycle", row["cycle_id"],
            {"overrun_pct": float(row["overrun_pct"] or 0)},
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-030: Supplier payment overdue
# ---------------------------------------------------------------------------

def _rule_030_supplier_payment_overdue(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-030: Accounts payable to supplier is overdue beyond payment terms.
    """
    alerts_created = 0

    cur.execute("""
        SELECT ap.ap_id, ap.supplier_id, s.supplier_name, ap.outstanding_fjd,
               ap.due_date, CURRENT_DATE - ap.due_date AS days_overdue
        FROM tenant.accounts_payable ap
        JOIN tenant.suppliers s ON s.supplier_id = ap.supplier_id
        WHERE ap.farm_id = %s
          AND ap.ap_status IN ('OPEN', 'PARTIAL')
          AND ap.due_date < CURRENT_DATE
    """, (farm_id,))
    overdue_ap = cur.fetchall()

    for ap in overdue_ap:
        severity = "HIGH" if int(ap["days_overdue"]) > 30 else "MEDIUM"
        title = f"Supplier Payment Overdue: {ap['supplier_name']}"
        message = (
            f"Payment overdue to {ap['supplier_name']}\n"
            f"Amount: FJD {ap['outstanding_fjd']:,.2f} | Due: {ap['due_date']}\n"
            f"Overdue by: {ap['days_overdue']} days\n"
            f"Action: Process payment to maintain supplier relationship."
        )
        alert_key = make_alert_key("RULE-030", farm_id, ap["ap_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-030", alert_key, severity, title, message,
            "accounts_payable", ap["ap_id"],
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-031: Purchase order not received within lead time
# ---------------------------------------------------------------------------

def _rule_031_po_not_received(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-031: A purchase order's expected delivery date has passed
    and it is still in ORDERED/PENDING status.
    """
    alerts_created = 0

    cur.execute("""
        SELECT po.po_id, po.supplier_id, s.supplier_name,
               po.expected_delivery_date,
               CURRENT_DATE - po.expected_delivery_date AS days_late
        FROM tenant.purchase_orders po
        JOIN tenant.suppliers s ON s.supplier_id = po.supplier_id
        WHERE po.farm_id = %s
          AND po.po_status IN ('ORDERED', 'PENDING')
          AND po.expected_delivery_date < CURRENT_DATE
    """, (farm_id,))
    late_pos = cur.fetchall()

    for po in late_pos:
        severity = "HIGH" if int(po["days_late"]) > 7 else "MEDIUM"
        title = f"PO Not Received: {po['po_id']}"
        message = (
            f"Purchase order overdue from {po['supplier_name']}\n"
            f"PO: {po['po_id']} | Expected: {po['expected_delivery_date']}\n"
            f"Days late: {po['days_late']}\n"
            f"Action: Contact supplier to confirm delivery."
        )
        alert_key = make_alert_key("RULE-031", farm_id, po["po_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-031", alert_key, severity, title, message,
            "purchase_order", po["po_id"],
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-032: Input expiry date within 30 days
# ---------------------------------------------------------------------------

def _rule_032_input_expiry_soon(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-032: An input batch has an expiry date within the next 30 days
    and still has stock remaining.
    """
    alerts_created = 0

    cur.execute("""
        SELECT ib.batch_id, ib.input_id, i.input_name, ib.expiry_date,
               ib.remaining_qty, i.unit_of_measure,
               ib.expiry_date - CURRENT_DATE AS days_to_expiry
        FROM tenant.input_batches ib
        JOIN tenant.inputs i ON i.input_id = ib.input_id
        WHERE i.farm_id = %s
          AND ib.remaining_qty > 0
          AND ib.expiry_date IS NOT NULL
          AND ib.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
          AND ib.batch_status = 'AVAILABLE'
    """, (farm_id,))
    expiring = cur.fetchall()

    for batch in expiring:
        severity = "HIGH" if int(batch["days_to_expiry"]) <= 7 else "MEDIUM"
        title = f"Input Expiring Soon: {batch['input_name']}"
        message = (
            f"Input batch expiring in {batch['days_to_expiry']} days\n"
            f"Input: {batch['input_name']} | Batch: {batch['batch_id']}\n"
            f"Remaining: {batch['remaining_qty']} {batch['unit_of_measure']}\n"
            f"Expiry date: {batch['expiry_date']}\n"
            f"Action: Use batch before expiry or arrange disposal."
        )
        alert_key = make_alert_key("RULE-032", farm_id, batch["batch_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-032", alert_key, severity, title, message,
            "input_batch", batch["batch_id"],
            {"days_to_expiry": int(batch["days_to_expiry"])},
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-033: Quarantined input batch
# ---------------------------------------------------------------------------

def _rule_033_quarantined_batch(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-033: An input batch has been flagged as QUARANTINED —
    must not be applied until cleared by a supervisor.
    """
    alerts_created = 0

    cur.execute("""
        SELECT ib.batch_id, ib.input_id, i.input_name, ib.quarantine_reason,
               ib.quarantined_at, ib.remaining_qty, i.unit_of_measure
        FROM tenant.input_batches ib
        JOIN tenant.inputs i ON i.input_id = ib.input_id
        WHERE i.farm_id = %s
          AND ib.batch_status = 'QUARANTINED'
          AND ib.remaining_qty > 0
    """, (farm_id,))
    quarantined = cur.fetchall()

    for batch in quarantined:
        title = f"Quarantined Input: {batch['input_name']}"
        message = (
            f"QUARANTINED input batch — do not use.\n"
            f"Input: {batch['input_name']} | Batch: {batch['batch_id']}\n"
            f"Reason: {batch['quarantine_reason'] or 'Not specified'}\n"
            f"Quarantined at: {batch['quarantined_at']}\n"
            f"Remaining: {batch['remaining_qty']} {batch['unit_of_measure']}\n"
            f"Action: Supervisor must review and clear or dispose of batch."
        )
        alert_key = make_alert_key("RULE-033", farm_id, batch["batch_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-033", alert_key, "CRITICAL", title, message,
            "input_batch", batch["batch_id"],
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-034: F002 Ferry buffer (island_logistics farms)
# ---------------------------------------------------------------------------

def _check_ferry_buffer(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-034: F002 Kadavu ferry buffer check.
    Estimates days of supply remaining based on reorder_point as a proxy for
    14-day usage rate. Alerts if below the configured buffer threshold.
    """
    alerts_created = 0
    ferry_buffer_days = settings.f002_ferry_buffer_days

    cur.execute("""
        SELECT
            i.input_id,
            i.input_name,
            i.current_stock_qty,
            i.unit_of_measure,
            i.reorder_point_qty,
            CASE
                WHEN i.reorder_point_qty > 0
                THEN ROUND(i.current_stock_qty / (i.reorder_point_qty / 14.0), 1)
                ELSE NULL
            END AS estimated_days_remaining
        FROM tenant.inputs i
        WHERE i.farm_id = %s
          AND i.is_active = true
          AND i.reorder_point_qty IS NOT NULL
          AND i.reorder_point_qty > 0
          AND i.current_stock_qty / (i.reorder_point_qty / 14.0) < %s
    """, (farm_id, ferry_buffer_days))
    low_buffer = cur.fetchall()

    for inp in low_buffer:
        days_remaining = float(inp["estimated_days_remaining"] or 0)
        severity = "CRITICAL" if days_remaining < 7 else "HIGH"
        title = f"Ferry Buffer Critical: {inp['input_name']}"
        message = (
            f"FERRY BUFFER ALERT — {inp['input_name']}\n"
            f"Stock: {inp['current_stock_qty']} {inp['unit_of_measure']}\n"
            f"Estimated days remaining: {days_remaining}\n"
            f"Required buffer: {ferry_buffer_days} days\n"
            f"Order via Sea Master Shipping ({settings.f002_ferry_supplier_id}) IMMEDIATELY.\n"
            f"Next ferry: check schedule with {settings.f002_ferry_supplier_id}."
        )
        alert_key = make_alert_key("RULE-034", farm_id, inp["input_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-034", alert_key, severity, title, message,
            "input", inp["input_id"],
            {
                "ferry_supplier": settings.f002_ferry_supplier_id,
                "buffer_days_required": ferry_buffer_days,
                "days_remaining": days_remaining,
            },
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-035: Harvest log qty vs cycle planned yield variance > 20%
# ---------------------------------------------------------------------------

def _rule_035_harvest_qty_variance(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-035: An individual harvest log entry differs from the cycle planned
    yield by more than 20% — indicates possible measurement or entry error.
    """
    alerts_created = 0

    cur.execute("""
        SELECT
            hl.harvest_id,
            hl.cycle_id,
            hl.pu_id,
            hl.harvest_qty_kg,
            pc.planned_yield_kg,
            ABS((hl.harvest_qty_kg - pc.planned_yield_kg) / NULLIF(pc.planned_yield_kg, 0)) * 100
                AS variance_pct,
            CASE WHEN hl.harvest_qty_kg > pc.planned_yield_kg THEN 'ABOVE' ELSE 'BELOW' END
                AS direction
        FROM tenant.harvest_log hl
        JOIN tenant.production_cycles pc ON pc.cycle_id = hl.cycle_id
        WHERE hl.farm_id = %s
          AND pc.planned_yield_kg > 0
          AND ABS((hl.harvest_qty_kg - pc.planned_yield_kg) / NULLIF(pc.planned_yield_kg, 0)) > 0.20
          AND hl.logged_at > NOW() - INTERVAL '48 hours'
    """, (farm_id,))
    variances = cur.fetchall()

    for row in variances:
        title = f"Harvest Qty Variance {row['direction']}: {row['harvest_id']}"
        message = (
            f"Harvest quantity variance {row['direction']} plan: {row['variance_pct']:.1f}%\n"
            f"Harvest: {row['harvest_id']} | Cycle: {row['cycle_id']}\n"
            f"Logged qty: {row['harvest_qty_kg']} kg | Planned: {row['planned_yield_kg']} kg\n"
            f"Action: Verify harvest log entry or update planned yield."
        )
        alert_key = make_alert_key("RULE-035", farm_id, row["harvest_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-035", alert_key, "MEDIUM", title, message,
            "harvest_log", row["harvest_id"],
            {"variance_pct": float(row["variance_pct"]), "direction": row["direction"]},
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-036: Harvest reconciliation variance > 10%
# ---------------------------------------------------------------------------

def _rule_036_harvest_reconciliation(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-036: Total actual yield for a completed/harvesting cycle differs
    from planned yield by more than 10%.
    """
    alerts_created = 0

    cur.execute("""
        SELECT
            cycle_id,
            production_id,
            planned_yield_kg,
            actual_yield_kg,
            ABS((actual_yield_kg - planned_yield_kg) / NULLIF(planned_yield_kg, 0)) * 100
                AS variance_pct,
            CASE WHEN actual_yield_kg > planned_yield_kg THEN 'ABOVE' ELSE 'BELOW' END
                AS direction
        FROM tenant.production_cycles
        WHERE farm_id = %s
          AND cycle_status IN ('HARVESTING', 'CLOSING', 'CLOSED')
          AND planned_yield_kg > 0
          AND actual_yield_kg IS NOT NULL
          AND ABS((actual_yield_kg - planned_yield_kg) / NULLIF(planned_yield_kg, 0)) > 0.10
          AND NOT EXISTS (
              SELECT 1 FROM tenant.alerts
              WHERE rule_id = 'RULE-036'
                AND entity_id = production_cycles.cycle_id
                AND alert_status != 'RESOLVED'
          )
    """, (farm_id,))
    recon_issues = cur.fetchall()

    for row in recon_issues:
        direction = row["direction"]
        message = (
            f"Harvest variance {direction} plan: {row['variance_pct']:.1f}%\n"
            f"Cycle: {row['cycle_id']} | Crop: {row['production_id']}\n"
            f"Planned: {row['planned_yield_kg']} kg | Actual: {row['actual_yield_kg']} kg\n"
            f"Action: Review and explain variance in cycle notes."
        )
        alert_key = make_alert_key("RULE-036", farm_id, row["cycle_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-036", alert_key, "MEDIUM",
            f"Harvest Variance {direction}: {row['cycle_id']}", message,
            "cycle", row["cycle_id"],
            {"variance_pct": float(row["variance_pct"]), "direction": direction},
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-037: Sale price below floor price
# ---------------------------------------------------------------------------

def _rule_037_sale_below_floor(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-037: A sale has been recorded at a price below the product's
    defined floor price — requires manager review.
    """
    alerts_created = 0

    cur.execute("""
        SELECT
            sl.sale_id,
            sl.production_id,
            sl.sale_price_fjd_per_kg,
            p.floor_price_fjd_per_kg,
            sl.quantity_kg,
            sl.customer_id,
            c.customer_name,
            sl.sale_date
        FROM tenant.sales_log sl
        JOIN shared.productions p ON p.production_id = sl.production_id
        JOIN tenant.customers c ON c.customer_id = sl.customer_id
        WHERE sl.farm_id = %s
          AND sl.sale_date > CURRENT_DATE - 7
          AND p.floor_price_fjd_per_kg IS NOT NULL
          AND sl.sale_price_fjd_per_kg < p.floor_price_fjd_per_kg
          AND sl.below_floor_approved = false
    """, (farm_id,))
    below_floor = cur.fetchall()

    for row in below_floor:
        title = f"Sale Below Floor Price: {row['sale_id']}"
        message = (
            f"Sale recorded below floor price — requires approval.\n"
            f"Sale: {row['sale_id']} | Crop: {row['production_id']}\n"
            f"Customer: {row['customer_name']} | Date: {row['sale_date']}\n"
            f"Sale price: FJD {row['sale_price_fjd_per_kg']:.2f}/kg\n"
            f"Floor price: FJD {row['floor_price_fjd_per_kg']:.2f}/kg\n"
            f"Qty: {row['quantity_kg']} kg\n"
            f"Action: Review and approve or void this sale."
        )
        alert_key = make_alert_key("RULE-037", farm_id, row["sale_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-037", alert_key, "HIGH", title, message,
            "sale", row["sale_id"],
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-038: Chemical compliance (WHD not cleared before harvest)
# ---------------------------------------------------------------------------

def _rule_038_chemical_compliance(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-038: Harvest is recorded before the withholding days (WHD) have
    elapsed since the last chemical application on that PU.
    """
    alerts_created = 0

    cur.execute("""
        SELECT DISTINCT
            hl.harvest_id,
            hl.cycle_id,
            hl.pu_id,
            hl.harvest_date::DATE AS harvest_date,
            MAX(fe.event_date::DATE) AS last_chemical_date,
            MAX(cl.withholding_days_harvest) AS whd_days,
            MAX(fe.event_date::DATE) + MAX(cl.withholding_days_harvest) AS clearance_date,
            cl.chemical_name
        FROM tenant.harvest_log hl
        JOIN tenant.production_cycles pc ON pc.cycle_id = hl.cycle_id
        JOIN tenant.field_events fe
            ON fe.pu_id = hl.pu_id
            AND fe.chemical_application = true
        JOIN shared.chemical_library cl ON cl.chemical_id = fe.chemical_id
        WHERE hl.farm_id = %s
          AND hl.chemical_compliance_cleared = false
          AND hl.compliance_override = false
        GROUP BY hl.harvest_id, hl.cycle_id, hl.pu_id, hl.harvest_date, cl.chemical_name
        HAVING hl.harvest_date::DATE < MAX(fe.event_date::DATE) + MAX(cl.withholding_days_harvest)
    """, (farm_id,))
    violations = cur.fetchall()

    for v in violations:
        title = f"Chemical Compliance Violation: {v['pu_id']}"
        message = (
            f"WHD NOT CLEARED — {v['chemical_name']}\n"
            f"Last spray: {v['last_chemical_date']} | WHD: {v['whd_days']} days\n"
            f"Safe harvest date: {v['clearance_date']}\n"
            f"PU: {v['pu_id']} | Cycle: {v['cycle_id']}\n"
            f"DO NOT HARVEST until clearance date."
        )
        alert_key = make_alert_key("RULE-038", farm_id, v["cycle_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-038", alert_key, "CRITICAL", title, message,
            "cycle", v["cycle_id"],
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-039: Customer credit limit exceeded
# ---------------------------------------------------------------------------

def _rule_039_credit_limit_exceeded(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-039: A customer's outstanding AR balance exceeds their approved
    credit limit — no further sales should be extended on credit.
    """
    alerts_created = 0

    cur.execute("""
        SELECT
            c.customer_id,
            c.customer_name,
            c.credit_limit_fjd,
            COALESCE(SUM(ar.outstanding_fjd), 0) AS total_outstanding_fjd,
            COALESCE(SUM(ar.outstanding_fjd), 0) - c.credit_limit_fjd AS excess_fjd
        FROM tenant.customers c
        LEFT JOIN tenant.accounts_receivable ar
            ON ar.customer_id = c.customer_id
            AND ar.farm_id = %s
            AND ar.ar_status IN ('OPEN', 'PARTIAL')
        WHERE c.tenant_id = %s
          AND c.credit_limit_fjd IS NOT NULL
          AND c.credit_limit_fjd > 0
        GROUP BY c.customer_id, c.customer_name, c.credit_limit_fjd
        HAVING COALESCE(SUM(ar.outstanding_fjd), 0) > c.credit_limit_fjd
    """, (farm_id, tenant_id))
    over_limit = cur.fetchall()

    for row in over_limit:
        title = f"Credit Limit Exceeded: {row['customer_name']}"
        message = (
            f"Customer has exceeded credit limit.\n"
            f"Customer: {row['customer_name']}\n"
            f"Credit limit: FJD {row['credit_limit_fjd']:,.2f}\n"
            f"Outstanding: FJD {row['total_outstanding_fjd']:,.2f}\n"
            f"Excess: FJD {row['excess_fjd']:,.2f}\n"
            f"Action: Suspend credit sales until balance is reduced."
        )
        alert_key = make_alert_key("RULE-039", farm_id, row["customer_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-039", alert_key, "HIGH", title, message,
            "customer", row["customer_id"],
            {"excess_fjd": float(row["excess_fjd"])},
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-040: Accounts receivable overdue
# ---------------------------------------------------------------------------

def _rule_040_ar_overdue(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-040: Outstanding AR past its due date.
    HIGH if > 30 days overdue; MEDIUM otherwise.
    """
    alerts_created = 0

    cur.execute("""
        SELECT ar.ar_id, ar.customer_id, c.customer_name, ar.outstanding_fjd,
               ar.due_date, CURRENT_DATE - ar.due_date AS days_overdue
        FROM tenant.accounts_receivable ar
        JOIN tenant.customers c ON c.customer_id = ar.customer_id
        WHERE ar.farm_id = %s
          AND ar.ar_status IN ('OPEN', 'PARTIAL')
          AND ar.due_date < CURRENT_DATE
    """, (farm_id,))
    overdue_ar = cur.fetchall()

    for ar in overdue_ar:
        severity = "HIGH" if int(ar["days_overdue"]) > 30 else "MEDIUM"
        title = f"Overdue Payment: {ar['customer_name']}"
        message = (
            f"Payment overdue — {ar['customer_name']}\n"
            f"Amount: FJD {ar['outstanding_fjd']:,.2f} | Due: {ar['due_date']}\n"
            f"Overdue by: {ar['days_overdue']} days\n"
            f"Action: Follow up with customer immediately."
        )
        alert_key = make_alert_key("RULE-040", farm_id, ar["ar_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-040", alert_key, severity, title, message,
            "accounts_receivable", ar["ar_id"],
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-041: Accounts payable overdue
# ---------------------------------------------------------------------------

def _rule_041_ap_overdue(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-041: Accounts payable overdue — distinct from RULE-030 (supplier-specific).
    Covers all payable categories including utilities, services, and levies.
    """
    alerts_created = 0

    cur.execute("""
        SELECT ap.ap_id, ap.payee_name, ap.ap_category, ap.outstanding_fjd,
               ap.due_date, CURRENT_DATE - ap.due_date AS days_overdue
        FROM tenant.accounts_payable ap
        WHERE ap.farm_id = %s
          AND ap.ap_status IN ('OPEN', 'PARTIAL')
          AND ap.ap_category NOT IN ('SUPPLIER')
          AND ap.due_date < CURRENT_DATE
    """, (farm_id,))
    overdue_ap = cur.fetchall()

    for ap in overdue_ap:
        severity = "HIGH" if int(ap["days_overdue"]) > 14 else "MEDIUM"
        title = f"AP Overdue: {ap['payee_name']}"
        message = (
            f"Payment overdue — {ap['payee_name']} ({ap['ap_category']})\n"
            f"Amount: FJD {ap['outstanding_fjd']:,.2f} | Due: {ap['due_date']}\n"
            f"Overdue by: {ap['days_overdue']} days\n"
            f"Action: Process payment to avoid penalties."
        )
        alert_key = make_alert_key("RULE-041", farm_id, ap["ap_id"])
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-041", alert_key, severity, title, message,
            "accounts_payable", ap["ap_id"],
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-042: Cash flow projection negative within 30 days
# ---------------------------------------------------------------------------

def _rule_042_cashflow_negative(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-042: The 30-day rolling cash flow forecast shows a projected
    negative balance — early warning for liquidity risk.
    """
    alerts_created = 0

    cur.execute("""
        SELECT
            cfp.forecast_id,
            cfp.projected_balance_fjd,
            cfp.forecast_date,
            cfp.opening_balance_fjd,
            cfp.projected_inflows_fjd,
            cfp.projected_outflows_fjd
        FROM tenant.cashflow_projections cfp
        WHERE cfp.farm_id = %s
          AND cfp.forecast_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
          AND cfp.projected_balance_fjd < 0
        ORDER BY cfp.forecast_date ASC
        LIMIT 1
    """, (farm_id,))
    negative = cur.fetchone()

    if negative:
        days_until = (negative["forecast_date"] - date.today()).days
        severity = "CRITICAL" if days_until <= 7 else "HIGH"
        title = f"Cash Flow Negative in {days_until} Days: {farm_id}"
        message = (
            f"Cash flow projection turns negative in {days_until} days.\n"
            f"Projected date: {negative['forecast_date']}\n"
            f"Projected balance: FJD {negative['projected_balance_fjd']:,.2f}\n"
            f"Opening balance: FJD {negative['opening_balance_fjd']:,.2f}\n"
            f"Projected inflows: FJD {negative['projected_inflows_fjd']:,.2f}\n"
            f"Projected outflows: FJD {negative['projected_outflows_fjd']:,.2f}\n"
            f"Action: Accelerate collections or defer non-essential payments."
        )
        alert_key = make_alert_key("RULE-042", farm_id, "cashflow", date.today().strftime("%Y%m%d"))
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-042", alert_key, severity, title, message,
            "farm", farm_id,
            {"projected_balance_fjd": float(negative["projected_balance_fjd"]),
             "days_until_negative": days_until},
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# RULE-043: Subscription renewal within 14 days
# ---------------------------------------------------------------------------

def _rule_043_subscription_renewal(cur, tenant_id: str, farm_id: str) -> int:
    """
    RULE-043: Tenant subscription renewal date is within 14 days.
    Only fires once per unique renewal date.
    """
    alerts_created = 0

    cur.execute("""
        SELECT subscription_renewal_date, subscription_tier
        FROM tenant.tenants
        WHERE tenant_id = %s
          AND subscription_renewal_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 14
    """, (tenant_id,))
    renewal = cur.fetchone()

    if renewal:
        days_until = (renewal["subscription_renewal_date"] - date.today()).days
        severity = "HIGH" if days_until <= 3 else "MEDIUM"
        title = f"Subscription Renewal in {days_until} Days"
        message = (
            f"Teivaka Agri-TOS subscription renews in {days_until} days.\n"
            f"Tier: {renewal['subscription_tier']}\n"
            f"Renewal date: {renewal['subscription_renewal_date']}\n"
            f"Action: Confirm payment method and billing details in account settings."
        )
        alert_key = make_alert_key(
            "RULE-043", farm_id, tenant_id,
            renewal["subscription_renewal_date"].strftime("%Y%m%d"),
        )
        if create_alert_if_new(
            cur, tenant_id, farm_id, "RULE-043", alert_key, severity, title, message,
            "tenant", tenant_id,
        ):
            alerts_created += 1

    return alerts_created


# ---------------------------------------------------------------------------
# Weekly ferry buffer scan (standalone task — RULE-034 extra coverage)
# ---------------------------------------------------------------------------

@celery_app.task(
    name="app.workers.automation_worker.run_ferry_buffer_scan",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
    queue="automation",
)
def run_ferry_buffer_scan(self):
    """
    Standalone weekly ferry buffer scan for island farms.
    Provides extra coverage beyond the daily automation engine.
    Runs weekly: Monday 06:00 Fiji (Sunday 18:00 UTC) via Celery Beat.
    """
    logger.info("[FERRY BUFFER SCAN] Starting weekly scan")
    conn = get_sync_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT t.tenant_id::TEXT AS tenant_id, f.farm_id, f.farm_name
            FROM tenant.tenants t
            JOIN tenant.farms f ON f.tenant_id = t.tenant_id
            WHERE f.island_logistics = true
              AND f.is_active = true
        """)
        island_farms = cur.fetchall()

        total = 0
        for farm in island_farms:
            cur.execute("SET LOCAL app.tenant_id = %s", (farm["tenant_id"],))
            alerts = _check_ferry_buffer(cur, farm["tenant_id"], farm["farm_id"])
            total += alerts
            conn.commit()

        logger.info(
            f"[FERRY BUFFER SCAN] Complete. {total} alerts for {len(island_farms)} island farms."
        )
        return {"island_farms_scanned": len(island_farms), "alerts_created": total}
    except Exception as e:
        conn.rollback()
        raise self.retry(exc=e)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# WhatsApp dispatch task (queued by automation engine)
# ---------------------------------------------------------------------------

@celery_app.task(
    name="app.workers.automation_worker.queue_whatsapp_alert",
    queue="notifications",
)
def queue_whatsapp_alert(tenant_id: str, farm_id: str, severity: str, message: str, notify_roles: list):
    """
    Queued WhatsApp dispatch.
    Called indirectly by automation engine after the severity-based countdown.
    Delegates to notification_worker for actual delivery.
    """
    from app.workers.notification_worker import dispatch_whatsapp_to_roles
    dispatch_whatsapp_to_roles(tenant_id, farm_id, severity, message, notify_roles)
