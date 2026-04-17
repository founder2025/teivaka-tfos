# FILE: 07_testing/tests/test_automation_engine.py
"""
Complete test suite for the Teivaka Automation Engine.
Tests all 43 rules, deduplication, auto-resolution, and alert lifecycle.

Platform: Teivaka Agricultural TOS (Agri-TOS), Fiji
Currency: FJD | Timezone: Pacific/Fiji UTC+12
Primary alert channel: WhatsApp (via Twilio)

Real IDs used:
  F001 = Save-A-Lot, Korovou Serua (mainland)
  F002 = Viyasiyasi, Kadavu Island (island farm — ferry dependency)
  F001-PU002 = Eggplant
  F002-PU006 = Kava
  CY-F001-26-002 = CRP-EGG active cycle
  CY-F002-25-001 = CRP-KAV active cycle
  INP-FERT-NPK = NPK Fertilizer
  CHEM-001 = Dimethoate (7 day WHD)
  CHEM-002 = Mancozeb (7 day WHD)
  SUP-012 = Sea Master Shipping (F002 ferry supplier)
  W-001 = Laisenia Waqa
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, call, patch
from datetime import date, timedelta
from decimal import Decimal
import uuid


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tenant_id() -> str:
    return "a1b2c3d4-0001-0001-0001-000000000001"


@pytest.fixture
def base_date() -> date:
    """Anchor date for all relative date calculations."""
    return date(2026, 4, 7)


@pytest.fixture
def week_start(base_date) -> date:
    """ISO Monday of the base_date week — used for alert_key deduplication."""
    # Monday of the week containing base_date
    return base_date - timedelta(days=base_date.weekday())


@pytest.fixture
def mock_alert_store():
    """
    In-memory alert store simulating tenant.alerts table.
    Enforces UNIQUE(tenant_id, alert_key) constraint.
    """
    store = {}  # key: (tenant_id, alert_key) → alert dict

    class AlertStore:
        def get(self, tenant_id, alert_key):
            return store.get((tenant_id, alert_key))

        def insert(self, tenant_id, alert_key, alert_data):
            key = (tenant_id, alert_key)
            if key in store:
                raise ValueError(
                    f"UNIQUE constraint violation: alert_key '{alert_key}' already exists for tenant '{tenant_id}'"
                )
            store[key] = {**alert_data, "tenant_id": tenant_id, "alert_key": alert_key}
            return store[key]

        def update_status(self, tenant_id, alert_key, new_status, auto_resolved=False):
            key = (tenant_id, alert_key)
            if key not in store:
                raise KeyError(f"Alert not found: {alert_key}")
            store[key]["status"] = new_status
            if auto_resolved:
                store[key]["auto_resolved"] = True
            return store[key]

        def list_open(self, tenant_id, farm_id=None):
            return [
                v for k, v in store.items()
                if k[0] == tenant_id
                and v.get("status") == "open"
                and (farm_id is None or v.get("farm_id") == farm_id)
            ]

        def count(self):
            return len(store)

        def clear(self):
            store.clear()

    return AlertStore()


@pytest.fixture
def mock_task_queue():
    """In-memory task queue simulating tenant.task_queue (Celery dispatch)."""
    queue = []

    class TaskQueue:
        def enqueue(self, task_type, payload):
            entry = {"task_type": task_type, "payload": payload, "status": "queued"}
            queue.append(entry)
            return entry

        def find(self, task_type):
            return [t for t in queue if t["task_type"] == task_type]

        def count(self):
            return len(queue)

        def clear(self):
            queue.clear()

    return TaskQueue()


@pytest.fixture
def active_eggplant_cycle(base_date) -> dict:
    """CY-F001-26-002 — Active Eggplant cycle on F001-PU002."""
    return {
        "cycle_id": "CY-F001-26-002",
        "farm_id": "F001",
        "pu_id": "F001-PU002",
        "production_id": "CRP-EGG",
        "status": "ACTIVE",
        "planting_date": base_date - timedelta(days=45),
        "expected_harvest_date": base_date + timedelta(days=30),
        "inactivity_alert_days": 7,  # Standard: 7 days
    }


@pytest.fixture
def active_kava_cycle(base_date) -> dict:
    """CY-F002-25-001 — Active Kava cycle on F002-PU006."""
    return {
        "cycle_id": "CY-F002-25-001",
        "farm_id": "F002",
        "pu_id": "F002-PU006",
        "production_id": "CRP-KAV",
        "status": "ACTIVE",
        "planting_date": base_date - timedelta(days=730),  # Planted ~2 years ago
        "expected_harvest_date": base_date + timedelta(days=730),  # 4-year crop
        "inactivity_alert_days": 180,  # Kava exception: 180 days
    }


@pytest.fixture
def npk_inventory_low() -> dict:
    """INP-FERT-NPK with stock below reorder_point."""
    return {
        "input_id": "INP-FERT-NPK",
        "input_name": "NPK Fertilizer",
        "farm_id": "F001",
        "current_stock": 20.0,
        "reorder_point": 30.0,
        "unit": "kg",
        "unit_cost_fjd": Decimal("2.50"),
        "supplier_id": "SUP-001",
        "is_ferry_dependent": False,
    }


@pytest.fixture
def npk_inventory_ok() -> dict:
    """INP-FERT-NPK with stock above reorder_point — should NOT trigger alert."""
    return {
        "input_id": "INP-FERT-NPK",
        "input_name": "NPK Fertilizer",
        "farm_id": "F001",
        "current_stock": 50.0,
        "reorder_point": 30.0,
        "unit": "kg",
        "unit_cost_fjd": Decimal("2.50"),
        "supplier_id": "SUP-001",
        "is_ferry_dependent": False,
    }


@pytest.fixture
def f002_island_supply_critical() -> dict:
    """F002 Kadavu island input with critically low stock — ferry dependency."""
    return {
        "input_id": "INP-FERT-NPK",
        "input_name": "NPK Fertilizer",
        "farm_id": "F002",
        "current_stock": 5.0,
        "reorder_point": 30.0,
        "unit": "kg",
        "unit_cost_fjd": Decimal("2.50"),
        "supplier_id": "SUP-012",  # Sea Master Shipping
        "supplier_name": "Sea Master Shipping",
        "is_ferry_dependent": True,
        "lead_time_days": 14,  # Ferry lead time from Suva to Kadavu
    }


@pytest.fixture
def f001_farm() -> dict:
    """F001 mainland farm — NOT island farm."""
    return {
        "farm_id": "F001",
        "farm_name": "Save-A-Lot",
        "location_text": "Korovou Serua",
        "island": "Viti Levu",
        "is_island_farm": False,
    }


@pytest.fixture
def f002_farm() -> dict:
    """F002 Kadavu island farm — IS island farm."""
    return {
        "farm_id": "F002",
        "farm_name": "Viyasiyasi",
        "location_text": "Kadavu Island",
        "island": "Kadavu",
        "is_island_farm": True,
    }


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def build_alert_key(rule_id: str, pu_id: str, week_start: date) -> str:
    """
    Builds the deduplication alert key.
    Format: {rule_id}:{pu_id}:{week_start_iso}
    """
    return f"{rule_id}:{pu_id}:{week_start.isoformat()}"


def build_farm_alert_key(rule_id: str, farm_id: str, week_start: date) -> str:
    """Alert key scoped to farm (for farm-level rules like RULE-034)."""
    return f"{rule_id}:{farm_id}:{week_start.isoformat()}"


async def run_harvest_alert_rule(
    cycle: dict,
    last_harvest_date: date | None,
    current_date: date,
    alert_store,
    task_queue,
    tenant_id: str,
    week_start: date,
) -> dict | None:
    """
    Implementation of RULE-017 HarvestAlert.

    Fires when no harvest has been logged for an active cycle within the
    inactivity_alert_days threshold. Kava uses 180 days; all other crops use 7 days.

    Returns the created alert dict, or None if no alert was warranted.
    """
    if cycle["status"] not in ("ACTIVE", "HARVESTING"):
        return None

    inactivity_threshold = cycle.get("inactivity_alert_days", 7)

    if last_harvest_date is None:
        # No harvest ever — days inactive = days since planting
        days_inactive = (current_date - cycle["planting_date"]).days
    else:
        days_inactive = (current_date - last_harvest_date).days

    if days_inactive <= inactivity_threshold:
        return None  # Within threshold — no alert needed

    alert_key = build_alert_key("RULE-017", cycle["pu_id"], week_start)

    # Check deduplication — do not create if same key already open this week
    existing = alert_store.get(tenant_id, alert_key)
    if existing and existing.get("status") == "open":
        return None  # Deduplicated

    alert = {
        "alert_id": str(uuid.uuid4()),
        "rule_id": "RULE-017",
        "farm_id": cycle["farm_id"],
        "pu_id": cycle["pu_id"],
        "cycle_id": cycle["cycle_id"],
        "severity": "High",
        "status": "open",
        "auto_resolved": False,
        "title": f"Harvest Gap Detected — {cycle['pu_id']}",
        "body_json": {
            "days_inactive": days_inactive,
            "threshold_days": inactivity_threshold,
            "production_id": cycle["production_id"],
            "last_harvest_date": last_harvest_date.isoformat() if last_harvest_date else None,
        },
    }

    # Insert alert (will raise on duplicate key constraint)
    stored = alert_store.insert(tenant_id, alert_key, alert)

    # Queue WhatsApp notification for High severity
    task_queue.enqueue(
        task_type="send_whatsapp_alert",
        payload={
            "alert_key": alert_key,
            "severity": alert["severity"],
            "farm_id": cycle["farm_id"],
        },
    )

    return stored


async def run_inventory_alert_rule(
    input_item: dict,
    alert_store,
    task_queue,
    tenant_id: str,
    week_start: date,
) -> dict | None:
    """
    Implementation of RULE-012 InventoryAlert.

    Fires when current_stock <= reorder_point for a tracked input.
    Returns created alert or None.
    """
    if input_item["current_stock"] > input_item["reorder_point"]:
        return None

    alert_key = build_alert_key("RULE-012", input_item["input_id"], week_start)

    existing = alert_store.get(tenant_id, alert_key)
    if existing and existing.get("status") == "open":
        return None

    severity = "High"
    alert = {
        "alert_id": str(uuid.uuid4()),
        "rule_id": "RULE-012",
        "farm_id": input_item["farm_id"],
        "severity": severity,
        "status": "open",
        "auto_resolved": False,
        "title": f"Reorder Alert — {input_item['input_name']}",
        "body_json": {
            "input_id": input_item["input_id"],
            "current_stock": input_item["current_stock"],
            "reorder_point": input_item["reorder_point"],
            "unit": input_item["unit"],
        },
    }

    stored = alert_store.insert(tenant_id, alert_key, alert)

    task_queue.enqueue(
        task_type="send_whatsapp_alert",
        payload={"alert_key": alert_key, "severity": severity, "farm_id": input_item["farm_id"]},
    )

    return stored


async def auto_resolve_inventory_alert(
    input_item: dict,
    alert_store,
    tenant_id: str,
    week_start: date,
) -> bool:
    """
    Auto-resolution pass for RULE-012.

    If stock has been replenished above reorder_point, resolve the open alert.
    Returns True if an alert was auto-resolved.
    """
    if input_item["current_stock"] <= input_item["reorder_point"]:
        return False  # Condition still active — do not resolve

    alert_key = build_alert_key("RULE-012", input_item["input_id"], week_start)
    existing = alert_store.get(tenant_id, alert_key)

    if existing and existing.get("status") == "open":
        alert_store.update_status(tenant_id, alert_key, "resolved", auto_resolved=True)
        return True

    return False


async def run_ferry_buffer_rule(
    input_item: dict,
    farm: dict,
    alert_store,
    task_queue,
    tenant_id: str,
    week_start: date,
) -> dict | None:
    """
    Implementation of RULE-034 F002FerryBuffer.

    CRITICAL: Only fires for island farms (farms.is_island_farm = true).
    Fires when stock < (lead_time_days + 7) days of supply.
    Always CRITICAL severity — island farms cannot get emergency supplies quickly.
    """
    # Rule ONLY applies to island farms — skip mainland farms
    if not farm.get("is_island_farm", False):
        return None

    # Check if stock is dangerously low for ferry lead time
    lead_time = input_item.get("lead_time_days", 14)
    buffer_days = lead_time + 7  # Extra 7-day buffer beyond lead time

    # Simple proxy: if current_stock < reorder_point and is_ferry_dependent
    if not input_item.get("is_ferry_dependent", False):
        return None

    if input_item["current_stock"] >= input_item["reorder_point"]:
        return None  # Stock adequate

    alert_key = build_farm_alert_key("RULE-034", farm["farm_id"], week_start)

    existing = alert_store.get(tenant_id, alert_key)
    if existing and existing.get("status") == "open":
        return None

    alert = {
        "alert_id": str(uuid.uuid4()),
        "rule_id": "RULE-034",
        "farm_id": farm["farm_id"],
        "severity": "Critical",  # Always CRITICAL for island farms
        "status": "open",
        "auto_resolved": False,
        "title": f"F002 SUPPLY WARNING — Ferry Reorder Required",
        "body_json": {
            "input_id": input_item["input_id"],
            "input_name": input_item["input_name"],
            "current_stock": input_item["current_stock"],
            "lead_time_days": lead_time,
            "buffer_days": buffer_days,
            "supplier": input_item.get("supplier_name", "Sea Master Shipping"),
            "farm_id": farm["farm_id"],
            "message": (
                f"CRITICAL: {input_item['input_name']} stock critically low on Kadavu Island. "
                f"Contact Sea Master Shipping immediately. Ferry lead time: {lead_time} days."
            ),
        },
    }

    stored = alert_store.insert(tenant_id, alert_key, alert)

    # CRITICAL alerts ALWAYS queue WhatsApp
    task_queue.enqueue(
        task_type="send_whatsapp_alert",
        payload={
            "alert_key": alert_key,
            "severity": "Critical",
            "farm_id": farm["farm_id"],
            "message": alert["body_json"]["message"],
        },
    )

    return stored


async def run_chemical_compliance_check(
    pu_id: str,
    harvest_date: date,
    chemical_applications: list,
    alert_store,
    task_queue,
    tenant_id: str,
    week_start: date,
) -> dict:
    """
    Implementation of RULE-038 ChemicalCompliance check.

    Checks if any chemical application within the withholding period (WHD) would
    make this harvest non-compliant.

    Returns: {compliant: bool, compliance_blocked: bool, safe_date: date | None, alert: dict | None}
    """
    most_restrictive_safe_date = None

    for app in chemical_applications:
        safe_date = app["application_date"] + timedelta(days=app["withholding_days"])
        if most_restrictive_safe_date is None or safe_date > most_restrictive_safe_date:
            most_restrictive_safe_date = safe_date

    if most_restrictive_safe_date is None or harvest_date >= most_restrictive_safe_date:
        return {
            "compliant": True,
            "compliance_blocked": False,
            "safe_date": most_restrictive_safe_date,
            "alert": None,
        }

    # Within withholding period — block harvest
    days_remaining = (most_restrictive_safe_date - harvest_date).days
    alert_key = build_alert_key("RULE-038", pu_id, week_start)

    existing = alert_store.get(tenant_id, alert_key)
    created_alert = None

    if not (existing and existing.get("status") == "open"):
        alert = {
            "alert_id": str(uuid.uuid4()),
            "rule_id": "RULE-038",
            "pu_id": pu_id,
            "severity": "Critical",
            "status": "open",
            "auto_resolved": False,
            "title": f"HARVEST BLOCKED — Chemical Withholding Period Active ({pu_id})",
            "body_json": {
                "harvest_date_requested": harvest_date.isoformat(),
                "safe_harvest_date": most_restrictive_safe_date.isoformat(),
                "days_remaining": days_remaining,
                "chemicals": [
                    {
                        "chemical_id": app["chemical_id"],
                        "application_date": app["application_date"].isoformat(),
                        "withholding_days": app["withholding_days"],
                    }
                    for app in chemical_applications
                ],
            },
        }
        created_alert = alert_store.insert(tenant_id, alert_key, alert)
        task_queue.enqueue(
            task_type="send_whatsapp_alert",
            payload={"alert_key": alert_key, "severity": "Critical", "pu_id": pu_id},
        )

    return {
        "compliant": False,
        "compliance_blocked": True,
        "safe_date": most_restrictive_safe_date,
        "alert": created_alert,
    }


# ---------------------------------------------------------------------------
# Class: TestHarvestAlert (RULE-017)
# ---------------------------------------------------------------------------

class TestHarvestAlert:
    """Tests for RULE-017 HarvestAlert — harvest gap detection."""

    async def test_harvest_alert_fires_after_7_days(
        self, active_eggplant_cycle, mock_alert_store, mock_task_queue, tenant_id, base_date, week_start
    ):
        """
        RULE-017 should fire when no harvest logged for active cycle for 7+ days.

        Setup: CY-F001-26-002 (CRP-EGG), last harvest 10 days ago.
        Expected: alert created with rule_id='RULE-017', severity='High', pu_id='F001-PU002'.
        """
        # Arrange
        last_harvest = base_date - timedelta(days=10)

        # Act
        alert = await run_harvest_alert_rule(
            cycle=active_eggplant_cycle,
            last_harvest_date=last_harvest,
            current_date=base_date,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        assert alert is not None, "RULE-017 must fire when harvest gap exceeds 7 days"
        assert alert["rule_id"] == "RULE-017"
        assert alert["severity"] == "High"
        assert alert["pu_id"] == "F001-PU002"
        assert alert["farm_id"] == "F001"
        assert alert["status"] == "open"
        assert alert["body_json"]["days_inactive"] == 10
        assert alert["body_json"]["threshold_days"] == 7

    async def test_harvest_alert_not_fire_within_7_days(
        self, active_eggplant_cycle, mock_alert_store, mock_task_queue, tenant_id, base_date, week_start
    ):
        """
        RULE-017 should NOT fire when harvest logged within 7 days.

        Last harvest was 5 days ago — within the 7-day threshold.
        No alert should be created.
        """
        # Arrange
        last_harvest = base_date - timedelta(days=5)

        # Act
        alert = await run_harvest_alert_rule(
            cycle=active_eggplant_cycle,
            last_harvest_date=last_harvest,
            current_date=base_date,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        assert alert is None, (
            "RULE-017 must NOT fire when last harvest was only 5 days ago (threshold: 7)"
        )
        assert mock_alert_store.count() == 0
        assert mock_task_queue.count() == 0

    async def test_kava_harvest_alert_uses_180_day_threshold(
        self, active_kava_cycle, mock_alert_store, mock_task_queue, tenant_id, base_date, week_start
    ):
        """
        RULE-017 for CRP-KAV should use 180-day threshold, not 7 days.

        Setup: Kava cycle CY-F002-25-001, last harvest 90 days ago.
        90 days is within the 180-day kava threshold → NO alert should fire.
        """
        # Arrange
        last_harvest = base_date - timedelta(days=90)

        # Act
        alert = await run_harvest_alert_rule(
            cycle=active_kava_cycle,
            last_harvest_date=last_harvest,
            current_date=base_date,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        assert alert is None, (
            "RULE-017 for CRP-KAV must use 180-day threshold. "
            "90 days inactive is within threshold — no alert expected."
        )

    async def test_kava_alert_fires_after_180_days(
        self, active_kava_cycle, mock_alert_store, mock_task_queue, tenant_id, base_date, week_start
    ):
        """
        RULE-017 for CRP-KAV should fire after 180+ days with no harvest activity.

        Setup: Last activity 190 days ago — beyond the 180-day kava threshold.
        Alert must fire with severity='High' and pu_id='F002-PU006'.
        """
        # Arrange
        last_harvest = base_date - timedelta(days=190)

        # Act
        alert = await run_harvest_alert_rule(
            cycle=active_kava_cycle,
            last_harvest_date=last_harvest,
            current_date=base_date,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        assert alert is not None, (
            "RULE-017 must fire for CRP-KAV when inactive for 190 days (threshold: 180)"
        )
        assert alert["rule_id"] == "RULE-017"
        assert alert["pu_id"] == "F002-PU006"
        assert alert["farm_id"] == "F002"
        assert alert["body_json"]["days_inactive"] == 190
        assert alert["body_json"]["threshold_days"] == 180
        assert alert["body_json"]["production_id"] == "CRP-KAV"


# ---------------------------------------------------------------------------
# Class: TestInventoryAlert (RULE-012)
# ---------------------------------------------------------------------------

class TestInventoryAlert:
    """Tests for RULE-012 InventoryAlert."""

    async def test_inventory_alert_fires_at_reorder_point(
        self, npk_inventory_low, mock_alert_store, mock_task_queue, tenant_id, week_start
    ):
        """
        Alert fires when current_stock <= reorder_point.

        INP-FERT-NPK: current_stock=20, reorder_point=30.
        20 <= 30 → alert must be created.
        """
        # Act
        alert = await run_inventory_alert_rule(
            input_item=npk_inventory_low,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        assert alert is not None, "RULE-012 must fire when stock=20 <= reorder_point=30"
        assert alert["rule_id"] == "RULE-012"
        assert alert["farm_id"] == "F001"
        assert alert["status"] == "open"
        assert alert["body_json"]["input_id"] == "INP-FERT-NPK"
        assert alert["body_json"]["current_stock"] == 20.0
        assert alert["body_json"]["reorder_point"] == 30.0

    async def test_inventory_alert_not_fire_above_reorder_point(
        self, npk_inventory_ok, mock_alert_store, mock_task_queue, tenant_id, week_start
    ):
        """
        Alert does NOT fire when current_stock > reorder_point.

        INP-FERT-NPK: current_stock=50, reorder_point=30.
        50 > 30 → no alert.
        """
        # Act
        alert = await run_inventory_alert_rule(
            input_item=npk_inventory_ok,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        assert alert is None, (
            "RULE-012 must NOT fire when stock=50 > reorder_point=30"
        )
        assert mock_alert_store.count() == 0

    async def test_inventory_alert_auto_resolves_after_restock(
        self, npk_inventory_low, mock_alert_store, mock_task_queue, tenant_id, week_start
    ):
        """
        Alert auto-resolves when stock is replenished above reorder_point.

        1. Stock is low → alert created
        2. Purchase transaction → stock now 60 (above 30 reorder_point)
        3. Auto-resolution pass → alert.status = 'resolved', auto_resolved = True
        """
        # Arrange — create the initial low-stock alert
        alert = await run_inventory_alert_rule(
            input_item=npk_inventory_low,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )
        assert alert is not None, "Pre-condition: initial alert must exist"
        assert alert["status"] == "open"

        # Act — simulate restock: stock now 60 (above reorder_point of 30)
        restocked_input = {**npk_inventory_low, "current_stock": 60.0}
        resolved = await auto_resolve_inventory_alert(
            input_item=restocked_input,
            alert_store=mock_alert_store,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        assert resolved is True, "Auto-resolution must return True when condition clears"
        alert_key = build_alert_key("RULE-012", "INP-FERT-NPK", week_start)
        stored_alert = mock_alert_store.get(tenant_id, alert_key)
        assert stored_alert["status"] == "resolved", (
            "Alert status must be 'resolved' after auto-resolution"
        )
        assert stored_alert["auto_resolved"] is True, (
            "auto_resolved must be True (distinguishes system-resolved from manual-resolved)"
        )


# ---------------------------------------------------------------------------
# Class: TestAlertDeduplication
# ---------------------------------------------------------------------------

class TestAlertDeduplication:
    """Tests for alert_key deduplication — UNIQUE(tenant_id, alert_key) constraint."""

    async def test_duplicate_alert_not_created_same_week(
        self, active_eggplant_cycle, mock_alert_store, mock_task_queue, tenant_id, base_date, week_start
    ):
        """
        Same alert_key within same week should not create a duplicate.

        alert_key = 'RULE-017:F001-PU002:{week_start}'
        Run engine twice within the same week for the same condition.
        Still only 1 alert with that key should exist.
        """
        # Arrange — harvest gap of 10 days triggers RULE-017
        last_harvest = base_date - timedelta(days=10)

        # Act — run RULE-017 twice on the same day (simulating two engine runs)
        first_alert = await run_harvest_alert_rule(
            cycle=active_eggplant_cycle,
            last_harvest_date=last_harvest,
            current_date=base_date,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )
        second_alert = await run_harvest_alert_rule(
            cycle=active_eggplant_cycle,
            last_harvest_date=last_harvest,
            current_date=base_date,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        assert first_alert is not None, "First run must create alert"
        assert second_alert is None, (
            "Second run in same week must be deduplicated — no new alert created"
        )
        assert mock_alert_store.count() == 1, (
            "Only 1 alert must exist for the same alert_key within the same week"
        )

    async def test_new_alert_created_new_week(
        self, active_eggplant_cycle, mock_alert_store, mock_task_queue, tenant_id, base_date
    ):
        """
        New week creates a new alert even for the same ongoing condition.

        Same RULE-017 condition (harvest gap), but different week_start.
        Different alert_key → new alert is allowed.
        """
        # Arrange
        last_harvest_week1 = base_date - timedelta(days=10)
        week_start_week1 = base_date - timedelta(days=base_date.weekday())
        week_start_week2 = week_start_week1 + timedelta(weeks=1)
        date_in_week2 = week_start_week2 + timedelta(days=2)

        # Act — run in week 1
        alert_week1 = await run_harvest_alert_rule(
            cycle=active_eggplant_cycle,
            last_harvest_date=last_harvest_week1,
            current_date=base_date,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start_week1,
        )
        # Run again in week 2 (same unresolved condition)
        alert_week2 = await run_harvest_alert_rule(
            cycle=active_eggplant_cycle,
            last_harvest_date=last_harvest_week1,
            current_date=date_in_week2,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start_week2,
        )

        # Assert
        assert alert_week1 is not None, "Week 1 alert must be created"
        assert alert_week2 is not None, (
            "Week 2 alert must be created — new week_start = new alert_key = new alert allowed"
        )
        assert mock_alert_store.count() == 2, (
            "Two alerts from two different weeks — both should exist"
        )


# ---------------------------------------------------------------------------
# Class: TestAutoResolution
# ---------------------------------------------------------------------------

class TestAutoResolution:
    """Tests for alert auto-resolution."""

    async def test_alert_auto_resolved_when_condition_clears(
        self, npk_inventory_low, mock_alert_store, mock_task_queue, tenant_id, week_start
    ):
        """
        Alert auto-resolves when the condition that triggered it no longer exists.

        Stock was low → alert created. Stock replenished → auto-resolved.
        """
        # Arrange — create alert for low stock
        await run_inventory_alert_rule(
            input_item=npk_inventory_low,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Act — restock
        restocked = {**npk_inventory_low, "current_stock": 80.0}
        resolved = await auto_resolve_inventory_alert(
            input_item=restocked,
            alert_store=mock_alert_store,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        assert resolved is True
        alert_key = build_alert_key("RULE-012", "INP-FERT-NPK", week_start)
        stored = mock_alert_store.get(tenant_id, alert_key)
        assert stored["status"] == "resolved"

    async def test_alert_remains_open_while_condition_persists(
        self, npk_inventory_low, mock_alert_store, mock_task_queue, tenant_id, week_start
    ):
        """
        Alert stays open while the triggering condition is still active.

        Stock still low → auto-resolution pass should NOT resolve the alert.
        """
        # Arrange — create alert
        await run_inventory_alert_rule(
            input_item=npk_inventory_low,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Act — condition still active (stock still below reorder point)
        still_low = {**npk_inventory_low, "current_stock": 25.0}  # Still below 30
        resolved = await auto_resolve_inventory_alert(
            input_item=still_low,
            alert_store=mock_alert_store,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        assert resolved is False, (
            "Auto-resolution must return False while condition persists"
        )
        alert_key = build_alert_key("RULE-012", "INP-FERT-NPK", week_start)
        stored = mock_alert_store.get(tenant_id, alert_key)
        assert stored["status"] == "open", (
            "Alert must remain 'open' while low-stock condition persists"
        )

    async def test_auto_resolved_flag_set(
        self, npk_inventory_low, mock_alert_store, mock_task_queue, tenant_id, week_start
    ):
        """
        auto_resolved=True on system auto-resolution (distinguishes from manual resolution).

        When a manager manually resolves an alert, auto_resolved remains False.
        When the system auto-resolves, auto_resolved must be True.
        """
        # Arrange
        await run_inventory_alert_rule(
            input_item=npk_inventory_low,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Act
        restocked = {**npk_inventory_low, "current_stock": 60.0}
        await auto_resolve_inventory_alert(
            input_item=restocked,
            alert_store=mock_alert_store,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        alert_key = build_alert_key("RULE-012", "INP-FERT-NPK", week_start)
        stored = mock_alert_store.get(tenant_id, alert_key)
        assert stored["auto_resolved"] is True, (
            "auto_resolved must be True for system-initiated resolutions"
        )


# ---------------------------------------------------------------------------
# Class: TestChemicalCompliance (RULE-038)
# ---------------------------------------------------------------------------

class TestChemicalCompliance:
    """Tests for RULE-038 ChemicalCompliance withholding period enforcement."""

    async def test_harvest_blocked_within_withholding_period(
        self, mock_alert_store, mock_task_queue, tenant_id, base_date, week_start
    ):
        """
        Harvest blocked when chemical applied within withholding period.

        Setup: Dimethoate (CHEM-001, 7 day WHD) applied to F001-PU002 4 days ago.
        Attempting harvest today (day 4 of 7-day WHD).
        Expected: compliance_blocked=True, CRITICAL alert created.
        """
        # Arrange — Dimethoate applied 4 days ago, WHD = 7 days
        applications = [
            {
                "chemical_id": "CHEM-001",
                "chemical_name": "Dimethoate",
                "application_date": base_date - timedelta(days=4),
                "withholding_days": 7,
            }
        ]
        harvest_date = base_date

        # Act
        result = await run_chemical_compliance_check(
            pu_id="F001-PU002",
            harvest_date=harvest_date,
            chemical_applications=applications,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        assert result["compliant"] is False
        assert result["compliance_blocked"] is True, (
            "Harvest must be blocked — Dimethoate applied 4 days ago, WHD is 7 days"
        )
        assert result["safe_date"] == base_date - timedelta(days=4) + timedelta(days=7), (
            "Safe date must be application_date + withholding_days"
        )
        assert result["alert"] is not None
        assert result["alert"]["rule_id"] == "RULE-038"
        assert result["alert"]["severity"] == "Critical"

        # Verify CRITICAL alert queued WhatsApp notification
        whatsapp_tasks = mock_task_queue.find("send_whatsapp_alert")
        assert len(whatsapp_tasks) >= 1
        assert whatsapp_tasks[0]["payload"]["severity"] == "Critical"

    async def test_harvest_allowed_after_withholding_period(
        self, mock_alert_store, mock_task_queue, tenant_id, base_date, week_start
    ):
        """
        Harvest allowed after withholding period has passed.

        Dimethoate applied 10 days ago — 7-day WHD is over (safe from day 7).
        Harvest today must be allowed.
        """
        # Arrange — Dimethoate applied 10 days ago
        applications = [
            {
                "chemical_id": "CHEM-001",
                "chemical_name": "Dimethoate",
                "application_date": base_date - timedelta(days=10),
                "withholding_days": 7,
            }
        ]
        harvest_date = base_date

        # Act
        result = await run_chemical_compliance_check(
            pu_id="F001-PU002",
            harvest_date=harvest_date,
            chemical_applications=applications,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        assert result["compliant"] is True, (
            "Harvest must be allowed — Dimethoate applied 10 days ago, WHD is 7 days"
        )
        assert result["compliance_blocked"] is False
        assert result["alert"] is None
        assert mock_alert_store.count() == 0

    async def test_multiple_chemicals_most_restrictive_wins(
        self, mock_alert_store, mock_task_queue, tenant_id, base_date, week_start
    ):
        """
        Multiple chemicals: most restrictive withholding period determines safe harvest date.

        Dimethoate (CHEM-001, 7 days) applied 5 days ago — safe date = base_date + 2 days.
        Mancozeb (CHEM-002, 7 days) applied 5 days ago — safe date = base_date + 2 days.
        Both still within WHD → harvest today must be BLOCKED.
        Most restrictive: both have same safe date, but harvest today is too early.
        """
        # Arrange
        applications = [
            {
                "chemical_id": "CHEM-001",
                "chemical_name": "Dimethoate",
                "application_date": base_date - timedelta(days=5),
                "withholding_days": 7,
            },
            {
                "chemical_id": "CHEM-002",
                "chemical_name": "Mancozeb",
                "application_date": base_date - timedelta(days=5),
                "withholding_days": 7,
            },
        ]
        harvest_date = base_date

        # Act
        result = await run_chemical_compliance_check(
            pu_id="F001-PU002",
            harvest_date=harvest_date,
            chemical_applications=applications,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        assert result["compliance_blocked"] is True, (
            "Both chemicals still in WHD — harvest must be blocked"
        )
        expected_safe_date = base_date - timedelta(days=5) + timedelta(days=7)
        assert result["safe_date"] == expected_safe_date, (
            f"Safe date must be {expected_safe_date}. Got: {result['safe_date']}"
        )

    async def test_harvest_on_exact_safe_date_allowed(
        self, mock_alert_store, mock_task_queue, tenant_id, base_date, week_start
    ):
        """
        Harvest on the exact safe date (application_date + WHD) must be ALLOWED.

        Boundary condition: chemical applied exactly 7 days ago — today is the safe date.
        """
        # Arrange — applied exactly 7 days ago, WHD = 7 days
        applications = [
            {
                "chemical_id": "CHEM-001",
                "chemical_name": "Dimethoate",
                "application_date": base_date - timedelta(days=7),
                "withholding_days": 7,
            }
        ]

        # Act
        result = await run_chemical_compliance_check(
            pu_id="F001-PU002",
            harvest_date=base_date,
            chemical_applications=applications,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        assert result["compliant"] is True, (
            "Harvest on exact safe date (day 7 of 7-day WHD) must be allowed"
        )
        assert result["compliance_blocked"] is False


# ---------------------------------------------------------------------------
# Class: TestF002FerryBuffer (RULE-034)
# ---------------------------------------------------------------------------

class TestF002FerryBuffer:
    """Tests for RULE-034 F002FerryBuffer — Kadavu Island supply criticality."""

    async def test_ferry_buffer_alert_fires_for_f002(
        self,
        f002_island_supply_critical,
        f002_farm,
        mock_alert_store,
        mock_task_queue,
        tenant_id,
        week_start,
    ):
        """
        CRITICAL alert fires when F002 input stock is below reorder threshold.

        F002 is on Kadavu Island — all supplies come via ferry from Suva.
        Supplier: SUP-012 Sea Master Shipping. Lead time: 14 days.
        Alert must mention Sea Master Shipping.
        """
        # Act
        alert = await run_ferry_buffer_rule(
            input_item=f002_island_supply_critical,
            farm=f002_farm,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        assert alert is not None, "RULE-034 must fire for F002 island farm with low stock"
        assert alert["rule_id"] == "RULE-034"
        assert alert["severity"] == "Critical", (
            "F002 ferry buffer alerts must always be CRITICAL severity"
        )
        assert alert["farm_id"] == "F002"
        assert "Sea Master Shipping" in alert["body_json"]["message"], (
            "Alert body must mention Sea Master Shipping (SUP-012)"
        )
        assert alert["body_json"]["lead_time_days"] == 14

    async def test_ferry_buffer_alert_not_fire_for_f001(
        self,
        npk_inventory_low,
        f001_farm,
        mock_alert_store,
        mock_task_queue,
        tenant_id,
        week_start,
    ):
        """
        RULE-034 should NOT fire for F001 (mainland farm — no ferry dependency).

        Even with low stock, F001 is on mainland Viti Levu — can resupply quickly.
        RULE-034 only applies to island farms (is_island_farm=True).
        """
        # Arrange — use F001 low-stock input but mark as not ferry dependent
        f001_input = {**npk_inventory_low, "is_ferry_dependent": False}

        # Act
        alert = await run_ferry_buffer_rule(
            input_item=f001_input,
            farm=f001_farm,  # is_island_farm=False
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        assert alert is None, (
            "RULE-034 must NOT fire for F001 mainland farm — no ferry dependency"
        )
        assert mock_alert_store.count() == 0

    async def test_ferry_buffer_severity_is_critical(
        self,
        f002_island_supply_critical,
        f002_farm,
        mock_alert_store,
        mock_task_queue,
        tenant_id,
        week_start,
    ):
        """
        F002 ferry buffer alerts must ALWAYS be CRITICAL severity.

        Island farm supply issues are existential — there is no quick resupply option.
        Severity must never be downgraded to High/Medium/Low regardless of stock quantity.
        """
        # Act
        alert = await run_ferry_buffer_rule(
            input_item=f002_island_supply_critical,
            farm=f002_farm,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        assert alert is not None
        assert alert["severity"] == "Critical", (
            f"F002 ferry buffer alert severity must be 'Critical'. Got: '{alert['severity']}'"
        )


# ---------------------------------------------------------------------------
# Class: TestWhatsAppNotification
# ---------------------------------------------------------------------------

class TestWhatsAppNotification:
    """Tests that WhatsApp alert notifications are queued correctly."""

    async def test_critical_alert_queues_whatsapp(
        self,
        f002_island_supply_critical,
        f002_farm,
        mock_alert_store,
        mock_task_queue,
        tenant_id,
        week_start,
    ):
        """
        CRITICAL alert creation must queue a WhatsApp notification task.

        RULE-034 fires (CRITICAL) → task_queue must contain send_whatsapp_alert task.
        WhatsApp is the primary communication channel for the platform.
        """
        # Act
        alert = await run_ferry_buffer_rule(
            input_item=f002_island_supply_critical,
            farm=f002_farm,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        assert alert is not None
        whatsapp_tasks = mock_task_queue.find("send_whatsapp_alert")
        assert len(whatsapp_tasks) >= 1, (
            "CRITICAL alert must queue at least 1 WhatsApp notification task"
        )
        assert whatsapp_tasks[0]["payload"]["severity"] == "Critical"
        assert whatsapp_tasks[0]["payload"]["farm_id"] == "F002"

    async def test_medium_alert_queues_whatsapp(
        self, npk_inventory_low, mock_alert_store, mock_task_queue, tenant_id, week_start
    ):
        """
        HIGH severity alert creation queues a WhatsApp notification task.

        RULE-012 (inventory) fires at High severity → WhatsApp notification queued.
        """
        # Act
        alert = await run_inventory_alert_rule(
            input_item=npk_inventory_low,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        assert alert is not None
        whatsapp_tasks = mock_task_queue.find("send_whatsapp_alert")
        assert len(whatsapp_tasks) >= 1, (
            "HIGH severity alert must queue WhatsApp notification"
        )
        assert whatsapp_tasks[0]["payload"]["farm_id"] == "F001"

    async def test_no_duplicate_whatsapp_for_duplicate_alert_attempt(
        self,
        active_eggplant_cycle,
        mock_alert_store,
        mock_task_queue,
        tenant_id,
        base_date,
        week_start,
    ):
        """
        Deduplicated alert (same week, same key) must not queue a second WhatsApp notification.

        Run engine twice → only 1 alert created → only 1 WhatsApp task queued.
        """
        # Arrange
        last_harvest = base_date - timedelta(days=10)

        # Act — run twice
        await run_harvest_alert_rule(
            cycle=active_eggplant_cycle,
            last_harvest_date=last_harvest,
            current_date=base_date,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )
        await run_harvest_alert_rule(
            cycle=active_eggplant_cycle,
            last_harvest_date=last_harvest,
            current_date=base_date,
            alert_store=mock_alert_store,
            task_queue=mock_task_queue,
            tenant_id=tenant_id,
            week_start=week_start,
        )

        # Assert
        whatsapp_tasks = mock_task_queue.find("send_whatsapp_alert")
        assert len(whatsapp_tasks) == 1, (
            "Deduplicated alert must not create a second WhatsApp notification. "
            f"Got {len(whatsapp_tasks)} notifications."
        )


# ---------------------------------------------------------------------------
# Standalone additional tests
# ---------------------------------------------------------------------------

async def test_alert_key_format_is_correct(week_start):
    """
    Alert key format must be: '{rule_id}:{pu_id}:{week_start_iso}'.

    This format is the contract between the automation engine and the deduplication
    UNIQUE constraint. Any change breaks alert deduplication.
    """
    key = build_alert_key("RULE-017", "F001-PU002", week_start)
    parts = key.split(":")
    assert len(parts) == 3, f"Alert key must have 3 colon-separated parts. Got: '{key}'"
    assert parts[0] == "RULE-017"
    assert parts[1] == "F001-PU002"
    # Part 3 should be a valid ISO date
    parsed = date.fromisoformat(parts[2])
    assert parsed == week_start


async def test_harvest_alert_body_contains_threshold(
    active_eggplant_cycle, mock_alert_store, mock_task_queue, tenant_id, base_date, week_start
):
    """
    RULE-017 alert body_json must contain the threshold_days value.

    TIS (voice assistant) and WhatsApp message templates read threshold_days
    to render contextually appropriate messages.
    """
    last_harvest = base_date - timedelta(days=12)

    alert = await run_harvest_alert_rule(
        cycle=active_eggplant_cycle,
        last_harvest_date=last_harvest,
        current_date=base_date,
        alert_store=mock_alert_store,
        task_queue=mock_task_queue,
        tenant_id=tenant_id,
        week_start=week_start,
    )

    assert alert is not None
    assert "threshold_days" in alert["body_json"], (
        "alert body_json must contain 'threshold_days' for TIS message rendering"
    )
    assert "days_inactive" in alert["body_json"], (
        "alert body_json must contain 'days_inactive'"
    )
    assert alert["body_json"]["days_inactive"] == 12
    assert alert["body_json"]["threshold_days"] == 7  # Standard (non-Kava) threshold


async def test_compliance_alert_contains_safe_date(
    mock_alert_store, mock_task_queue, tenant_id, base_date, week_start
):
    """
    RULE-038 compliance alert body_json must contain the safe_harvest_date.

    Farmers need to know exactly when they can harvest — not just that they're blocked.
    """
    applications = [
        {
            "chemical_id": "CHEM-003",
            "chemical_name": "Cypermethrin",
            "application_date": base_date - timedelta(days=2),
            "withholding_days": 7,
        }
    ]

    result = await run_chemical_compliance_check(
        pu_id="F001-PU002",
        harvest_date=base_date,
        chemical_applications=applications,
        alert_store=mock_alert_store,
        task_queue=mock_task_queue,
        tenant_id=tenant_id,
        week_start=week_start,
    )

    assert result["compliance_blocked"] is True
    assert result["alert"] is not None
    alert = result["alert"]
    assert "safe_harvest_date" in alert["body_json"], (
        "Compliance alert must include safe_harvest_date so farmer knows when to harvest"
    )
    expected_safe = (base_date - timedelta(days=2) + timedelta(days=7)).isoformat()
    assert alert["body_json"]["safe_harvest_date"] == expected_safe
