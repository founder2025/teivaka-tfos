# FILE: 07_testing/tests/conftest.py
"""
Shared pytest fixtures for Teivaka Agri-TOS test suite.

Platform: Teivaka Agricultural TOS (Agri-TOS), Fiji
Currency: FJD | Timezone: Pacific/Fiji UTC+12

Real identifiers used throughout tests:
  Tenant:  a1b2c3d4-0001-0001-0001-000000000001  (Teivaka PTE LTD)
  Farm F001: Save-A-Lot, Korovou Serua            (mainland, tier=BASIC)
  Farm F002: Viyasiyasi, Kadavu Island             (island, tier=PREMIUM)

All DB calls are mocked — no live PostgreSQL connection required.
Use `make test` from 11_application_code/ to run the full suite.
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Tenant / User identifiers
# ---------------------------------------------------------------------------

TENANT_UUID = "a1b2c3d4-0001-0001-0001-000000000001"
FARM_F001 = "F001"
FARM_F002 = "F002"


@pytest.fixture
def tenant_id() -> str:
    """Fixed tenant UUID for all tests — maps to Teivaka PTE LTD."""
    return TENANT_UUID


@pytest.fixture
def farm_f001() -> str:
    return FARM_F001


@pytest.fixture
def farm_f002() -> str:
    return FARM_F002


# ---------------------------------------------------------------------------
# Mock authenticated user objects
# ---------------------------------------------------------------------------

@pytest.fixture
def founder_user() -> dict:
    """FOUNDER-role user — full access to all endpoints including admin ops."""
    return {
        "user_id": str(uuid.uuid4()),
        "tenant_id": TENANT_UUID,
        "email": "cody@teivaka.com",
        "role": "FOUNDER",
        "tier": "PREMIUM",
        "full_name": "Uraia Koroi Kama",
    }


@pytest.fixture
def manager_user() -> dict:
    """MANAGER-role user — farm management access."""
    return {
        "user_id": str(uuid.uuid4()),
        "tenant_id": TENANT_UUID,
        "email": "manager@teivaka.com",
        "role": "MANAGER",
        "tier": "BASIC",
        "full_name": "Test Manager",
    }


@pytest.fixture
def worker_user() -> dict:
    """WORKER-role user — limited read/write access."""
    return {
        "user_id": str(uuid.uuid4()),
        "tenant_id": TENANT_UUID,
        "email": "worker@teivaka.com",
        "role": "WORKER",
        "tier": "BASIC",
        "full_name": "Test Worker",
    }


# ---------------------------------------------------------------------------
# Mock database session
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_db() -> AsyncMock:
    """
    Async mock of SQLAlchemy AsyncSession.

    Usage in tests:
        result = mock_db.execute.return_value
        result.scalar_one_or_none.return_value = some_model_instance
    """
    db = AsyncMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.close = AsyncMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    return db


@pytest.fixture
def mock_db_result() -> MagicMock:
    """Reusable mock for db.execute() return value."""
    result = MagicMock()
    result.scalars = MagicMock(return_value=result)
    result.all = MagicMock(return_value=[])
    result.first = MagicMock(return_value=None)
    result.scalar_one = MagicMock(return_value=None)
    result.scalar_one_or_none = MagicMock(return_value=None)
    result.fetchall = MagicMock(return_value=[])
    result.fetchone = MagicMock(return_value=None)
    result.mappings = MagicMock(return_value=result)
    return result


# ---------------------------------------------------------------------------
# Mock Redis client
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_redis() -> AsyncMock:
    """Async mock of aioredis client."""
    r = AsyncMock()
    r.get = AsyncMock(return_value=None)
    r.set = AsyncMock(return_value=True)
    r.incr = AsyncMock(return_value=1)
    r.expire = AsyncMock(return_value=True)
    r.delete = AsyncMock(return_value=1)
    r.aclose = AsyncMock()
    return r


# ---------------------------------------------------------------------------
# Mock Celery app
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_celery_task() -> MagicMock:
    """Mock for Celery task .delay() and .apply_async() calls."""
    task = MagicMock()
    task.delay = MagicMock(return_value=MagicMock(id=str(uuid.uuid4())))
    task.apply_async = MagicMock(return_value=MagicMock(id=str(uuid.uuid4())))
    return task


# ---------------------------------------------------------------------------
# Date helpers
# ---------------------------------------------------------------------------

@pytest.fixture
def today() -> date:
    return date.today()


@pytest.fixture
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Sample production cycle data (F001)
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_cycle_f001() -> dict:
    """
    Active production cycle for F001 (Save-A-Lot, Korovou Serua).
    Tomato crop, Zone Z01, PU01.
    CoKG computed once harvest is logged.
    """
    return {
        "cycle_id": "CYC-F001-Z01-PU01-2026-001",
        "farm_id": "F001",
        "zone_id": "Z01",
        "production_unit_id": "PU01",
        "production_id": "TOMATO",
        "stage_code": "VEGETATIVE",
        "planting_date": date(2026, 1, 15),
        "expected_harvest_date": date(2026, 4, 1),
        "status": "ACTIVE",
        "total_labor_cost": Decimal("450.00"),
        "total_input_cost": Decimal("320.00"),
        "total_other_cost": Decimal("80.00"),
        "total_harvest_kg": Decimal("0.00"),  # not yet harvested
        "cogk": None,  # NULL until harvest logged
        "tenant_id": TENANT_UUID,
    }


@pytest.fixture
def sample_cycle_f002() -> dict:
    """
    Active production cycle for F002 (Viyasiyasi, Kadavu — island farm).
    Kava crop, Zone Z03, PU06.
    Kava has a 4-year growth cycle.
    """
    return {
        "cycle_id": "CYC-F002-Z03-PU06-2024-001",
        "farm_id": "F002",
        "zone_id": "Z03",
        "production_unit_id": "PU06",
        "production_id": "KAVA",
        "stage_code": "VEGETATIVE",
        "planting_date": date(2024, 3, 1),
        "expected_harvest_date": date(2028, 3, 1),
        "status": "ACTIVE",
        "total_labor_cost": Decimal("1200.00"),
        "total_input_cost": Decimal("680.00"),
        "total_other_cost": Decimal("200.00"),
        "total_harvest_kg": Decimal("0.00"),
        "cogk": None,
        "tenant_id": TENANT_UUID,
    }


# ---------------------------------------------------------------------------
# Chemical compliance test data
# ---------------------------------------------------------------------------

@pytest.fixture
def chemical_mancozeb() -> dict:
    """
    Mancozeb (fungicide) — 7-day withholding period.
    Most commonly applied chemical on TFOS farms.
    """
    return {
        "chemical_id": "CHEM-002",
        "chemical_name": "Mancozeb 80WP",
        "active_ingredient": "Mancozeb",
        "withholding_days": 7,
        "restricted": False,
        "cap_114_listed": True,
    }


@pytest.fixture
def chemical_dimethoate() -> dict:
    """
    Dimethoate (organophosphate) — 7-day withholding period.
    CHEM-001 in chemical_library. Restricted pesticide.
    """
    return {
        "chemical_id": "CHEM-001",
        "chemical_name": "Dimethoate 400EC",
        "active_ingredient": "Dimethoate",
        "withholding_days": 7,
        "restricted": True,
        "cap_114_listed": True,
    }


# ---------------------------------------------------------------------------
# Rotation fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def rotation_pref_response() -> dict:
    """DB response for a PREF rotation status (ideal follow-on crop)."""
    return {
        "status": "PREF",
        "rule_id": "ROT-001",
        "source_crop": "TOMATO",
        "target_crop": "CASSAVA",
        "notes": "Nightshade to root crop — ideal rotation, breaks disease cycle.",
    }


@pytest.fixture
def rotation_block_response() -> dict:
    """DB response for a BLOCK rotation status (hard stop)."""
    return {
        "status": "BLOCK",
        "rule_id": "ROT-042",
        "source_crop": "TOMATO",
        "target_crop": "EGGPLANT",
        "notes": "Same family (Solanaceae) — BLOCK. Transmits bacterial wilt.",
    }


# ---------------------------------------------------------------------------
# Alert seed data
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_alert_low_stock() -> dict:
    """LOW_STOCK alert for F001 — triggered by RULE-001."""
    return {
        "alert_id": str(uuid.uuid4()),
        "tenant_id": TENANT_UUID,
        "farm_id": "F001",
        "rule_id": "RULE-001",
        "alert_key": "low_stock:F001:NPK-150-2026-04-11",
        "severity": "HIGH",
        "message": "NPK 15-15-15 stock at 12kg — below 20kg reorder threshold.",
        "status": "OPEN",
        "created_at": datetime.now(timezone.utc),
    }


@pytest.fixture
def sample_alert_ferry_buffer() -> dict:
    """FERRY_BUFFER alert for F002 Kadavu — triggered by RULE-034."""
    return {
        "alert_id": str(uuid.uuid4()),
        "tenant_id": TENANT_UUID,
        "farm_id": "F002",
        "rule_id": "RULE-034",
        "alert_key": "ferry_buffer:F002:2026-04-11",
        "severity": "HIGH",
        "message": (
            "F002 Kadavu: harvest expected in 12 days but next Sea Master "
            "Shipping (SUP-012) departure is in 14 days. Order inputs now."
        ),
        "status": "OPEN",
        "created_at": datetime.now(timezone.utc),
    }
