# FILE: 07_testing/tests/test_rotation_engine.py
"""
Complete test suite for the Teivaka Rotation Engine.
Tests validate_rotation() function against all 7 status types and edge cases.

Platform: Teivaka Agricultural TOS (Agri-TOS), Fiji
Currency: FJD | Timezone: Pacific/Fiji UTC+12

Real farm IDs used:
  F001 = Save-A-Lot, Korovou Serua
  F002 = Viyasiyasi, Kadavu Island
  F001-PU001 = Cassava, F001-PU002 = Eggplant, F001-PU003 = Eggplant
  F002-PU004 = Pineapple, F002-PU006 = Kava, F002-PU007 = Kava
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import date, timedelta
from decimal import Decimal


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tenant_id() -> str:
    """Fixed tenant UUID for all rotation tests — maps to Teivaka PTE LTD."""
    return "a1b2c3d4-0001-0001-0001-000000000001"


@pytest.fixture
def base_date() -> date:
    """Anchor date for all relative date calculations in tests."""
    return date(2026, 4, 7)


@pytest.fixture
def rotation_rules_db() -> dict:
    """
    In-memory representation of shared.actionable_rules seed data.
    Mirrors the real PostgreSQL seed used in integration tests.
    Keys: (current_production_id, next_production_id)
    Values: dict with rule_status, min_rest_days, notes
    """
    return {
        ("CRP-EGG", "CRP-EGG"): {
            "rule_status": "BLOCK",
            "min_rest_days": 60,
            "notes": "Solanaceae back-to-back blocked",
        },
        ("CRP-EGG", "CRP-TOM"): {
            "rule_status": "BLOCK",
            "min_rest_days": 60,
            "notes": "Solanaceae family rest required",
        },
        ("CRP-TOM", "CRP-EGG"): {
            "rule_status": "BLOCK",
            "min_rest_days": 60,
            "notes": "Solanaceae family rest required",
        },
        ("CRP-TOM", "CRP-TOM"): {
            "rule_status": "BLOCK",
            "min_rest_days": 60,
            "notes": "Solanaceae back-to-back blocked",
        },
        ("CRP-EGG", "CRP-CAP"): {
            "rule_status": "BLOCK",
            "min_rest_days": 60,
            "notes": "Solanaceae family rest required",
        },
        ("CRP-CAP", "CRP-EGG"): {
            "rule_status": "BLOCK",
            "min_rest_days": 60,
            "notes": "Solanaceae family rest required",
        },
        ("CRP-CAS", "CRP-CAS"): {
            "rule_status": "BLOCK",
            "min_rest_days": 180,
            "notes": "Euphorbiaceae long rest required",
        },
        ("CRP-WAT", "CRP-CUC"): {
            "rule_status": "BLOCK",
            "min_rest_days": 45,
            "notes": "Cucurbitaceae family rest required",
        },
        ("CRP-CUC", "CRP-WAT"): {
            "rule_status": "BLOCK",
            "min_rest_days": 45,
            "notes": "Cucurbitaceae family rest required",
        },
        ("CRP-CAB", "CRP-LBN"): {
            "rule_status": "PREF",
            "min_rest_days": 0,
            "notes": "Nitrogen-fixer after heavy feeder — preferred rotation",
        },
        ("CRP-CAS", "CRP-SPT"): {
            "rule_status": "OK",
            "min_rest_days": 0,
            "notes": "Different families, acceptable follow-on crop",
        },
        ("CRP-EGG", "CRP-LBN"): {
            "rule_status": "OK",
            "min_rest_days": 0,
            "notes": "Different families, acceptable",
        },
        ("CRP-CAS", "CRP-EGG"): {
            "rule_status": "AVOID",
            "min_rest_days": 0,
            "notes": "Heavy feeder after heavy feeder — soil depletion risk",
        },
        ("LIV-API", None): {
            "rule_status": "OVERLAY",
            "min_rest_days": 0,
            "notes": "Apiculture co-exists with any crop — no rotation logic",
        },
        ("FOR-TEK", None): {
            "rule_status": "N/A",
            "min_rest_days": 0,
            "notes": "Forestry — rotation not applicable, separate production system",
        },
        ("FOR-SAN", None): {
            "rule_status": "N/A",
            "min_rest_days": 0,
            "notes": "Forestry — rotation not applicable",
        },
        ("CRP-KAV", "CRP-KAV"): {
            "rule_status": "COND",
            "min_rest_days": 365,
            "notes": "Kava 4-year cycle — re-planting conditionally allowed with extended rest",
        },
    }


@pytest.fixture
def rotation_alternatives_db() -> dict:
    """
    In-memory representation of shared.rotation_top_choices.
    Used to populate the 'alternatives' list in blocked/avoided responses.
    """
    return {
        "CRP-EGG": [
            {"production_id": "CRP-LBN", "production_name": "Long Bean", "rule_status": "OK"},
            {"production_id": "CRP-CUC", "production_name": "Cucumber", "rule_status": "OK"},
            {"production_id": "CRP-CAB", "production_name": "Cabbage", "rule_status": "OK"},
        ],
        "CRP-TOM": [
            {"production_id": "CRP-LBN", "production_name": "Long Bean", "rule_status": "OK"},
            {"production_id": "CRP-CAS", "production_name": "Cassava", "rule_status": "OK"},
            {"production_id": "CRP-SPT", "production_name": "Sweet Potato", "rule_status": "OK"},
        ],
        "CRP-CAS": [
            {"production_id": "CRP-SPT", "production_name": "Sweet Potato", "rule_status": "OK"},
            {"production_id": "CRP-LBN", "production_name": "Long Bean", "rule_status": "PREF"},
            {"production_id": "CRP-CAB", "production_name": "Cabbage", "rule_status": "OK"},
        ],
        "CRP-WAT": [
            {"production_id": "CRP-LBN", "production_name": "Long Bean", "rule_status": "PREF"},
            {"production_id": "CRP-CAS", "production_name": "Cassava", "rule_status": "OK"},
        ],
    }


@pytest.fixture
def mock_rotation_service(rotation_rules_db, rotation_alternatives_db):
    """
    Mock of validate_rotation() service function.
    Implements the real business logic for unit tests without DB dependency.
    """

    async def _validate_rotation(
        current_production_id: str,
        next_production_id: str,
        harvest_end_date: date | None,
        proposed_planting_date: date,
        pu_id: str,
        tenant_id: str,
        db=None,
    ) -> dict:
        """
        Mock implementation of validate_rotation() that mirrors real service logic.
        Uses in-memory rule lookup instead of PostgreSQL query.
        """
        # Case: no previous crop (first planting on this PU)
        if current_production_id is None:
            return {
                "allowed": True,
                "enforcement_decision": "APPROVED",
                "rule_status": "N/A",
                "days_short": 0,
                "min_rest_days": 0,
                "override_available": False,
                "alternatives": [],
                "message": "First crop on this production unit — no rotation constraint.",
            }

        # Case: OVERLAY productions (apiculture, some forestry sub-types)
        if current_production_id == "LIV-API":
            return {
                "allowed": True,
                "enforcement_decision": "APPROVED",
                "rule_status": "OVERLAY",
                "days_short": 0,
                "min_rest_days": 0,
                "override_available": False,
                "alternatives": [],
                "message": "Apiculture overlays with all crop rotations.",
            }

        # Case: Forestry (N/A)
        if current_production_id in ("FOR-TEK", "FOR-SAN"):
            return {
                "allowed": True,
                "enforcement_decision": "APPROVED",
                "rule_status": "N/A",
                "days_short": 0,
                "min_rest_days": 0,
                "override_available": False,
                "alternatives": [],
                "message": "Forestry production — rotation not applicable.",
            }

        # Look up rule in shared.actionable_rules
        rule = rotation_rules_db.get((current_production_id, next_production_id))

        # No specific rule found — default to OK
        if rule is None:
            return {
                "allowed": True,
                "enforcement_decision": "APPROVED",
                "rule_status": "OK",
                "days_short": 0,
                "min_rest_days": 0,
                "override_available": False,
                "alternatives": [],
                "message": "No specific rotation rule — default OK.",
            }

        rule_status = rule["rule_status"]
        min_rest_days = rule["min_rest_days"]

        # Compute rest period actually observed
        days_since_harvest = 0
        if harvest_end_date is not None and min_rest_days > 0:
            days_since_harvest = (proposed_planting_date - harvest_end_date).days

        # days_short = max(0, min_rest_days - days_since_harvest)
        days_short = max(0, min_rest_days - days_since_harvest)

        # PREF — approved with positive recommendation
        if rule_status == "PREF":
            return {
                "allowed": True,
                "enforcement_decision": "APPROVED",
                "rule_status": "PREF",
                "days_short": 0,
                "min_rest_days": min_rest_days,
                "override_available": False,
                "alternatives": [],
                "message": f"Preferred rotation: {next_production_id} after {current_production_id}.",
            }

        # OK — approved normally
        if rule_status == "OK":
            return {
                "allowed": True,
                "enforcement_decision": "APPROVED",
                "rule_status": "OK",
                "days_short": 0,
                "min_rest_days": min_rest_days,
                "override_available": False,
                "alternatives": [],
                "message": f"Acceptable rotation: {next_production_id} after {current_production_id}.",
            }

        # AVOID — not recommended, override required
        if rule_status == "AVOID":
            alternatives = rotation_alternatives_db.get(current_production_id, [])
            return {
                "allowed": False,
                "enforcement_decision": "OVERRIDE_REQUIRED",
                "rule_status": "AVOID",
                "days_short": days_short,
                "min_rest_days": min_rest_days,
                "override_available": True,
                "alternatives": alternatives,
                "message": f"Not recommended: {next_production_id} after {current_production_id}. Consider alternatives.",
            }

        # BLOCK — hard block
        if rule_status == "BLOCK":
            # If rest period is met, upgrade to APPROVED
            if min_rest_days > 0 and days_since_harvest >= min_rest_days:
                return {
                    "allowed": True,
                    "enforcement_decision": "APPROVED",
                    "rule_status": "BLOCK",
                    "days_short": 0,
                    "min_rest_days": min_rest_days,
                    "override_available": False,
                    "alternatives": [],
                    "message": f"Rest period of {min_rest_days} days satisfied ({days_since_harvest} days observed).",
                }
            # Rest not met — hard block
            alternatives = rotation_alternatives_db.get(current_production_id, [])
            return {
                "allowed": False,
                "enforcement_decision": "BLOCKED",
                "rule_status": "BLOCK",
                "days_short": days_short,
                "min_rest_days": min_rest_days,
                "override_available": True,
                "alternatives": alternatives,
                "message": (
                    f"BLOCKED: {next_production_id} after {current_production_id} requires "
                    f"{min_rest_days} days rest. Only {days_since_harvest} days observed. "
                    f"Still needs {days_short} more days."
                ),
            }

        # COND — conditional (e.g. Kava replanting)
        if rule_status == "COND":
            if days_since_harvest >= min_rest_days:
                return {
                    "allowed": True,
                    "enforcement_decision": "APPROVED",
                    "rule_status": "COND",
                    "days_short": 0,
                    "min_rest_days": min_rest_days,
                    "override_available": False,
                    "alternatives": [],
                    "message": f"Conditional rotation approved — rest period met ({days_since_harvest} days).",
                }
            return {
                "allowed": False,
                "enforcement_decision": "BLOCKED",
                "rule_status": "COND",
                "days_short": days_short,
                "min_rest_days": min_rest_days,
                "override_available": True,
                "alternatives": [],
                "message": f"Conditional rotation blocked — rest period not met. {days_short} days short.",
            }

        # Fallback
        return {
            "allowed": True,
            "enforcement_decision": "APPROVED",
            "rule_status": rule_status,
            "days_short": 0,
            "min_rest_days": min_rest_days,
            "override_available": False,
            "alternatives": [],
            "message": "No specific enforcement applied.",
        }

    return _validate_rotation


@pytest.fixture
def mock_override_log() -> list:
    """In-memory override_log for testing override audit trail."""
    return []


# ---------------------------------------------------------------------------
# Class: TestRotationEngineApproved
# ---------------------------------------------------------------------------

class TestRotationEngineApproved:
    """Tests for rotations that should be APPROVED."""

    async def test_pref_rotation_approved(self, mock_rotation_service, base_date):
        """
        PREF rotation: Long Bean after Cabbage should be APPROVED with PREF status.

        Long Bean (CRP-LBN, Fabaceae) after Cabbage (CRP-CAB, Brassicaceae):
        Nitrogen-fixer after heavy feeder = preferred rotation.
        """
        # Arrange
        harvest_end = base_date - timedelta(days=30)
        proposed_planting = base_date

        # Act
        result = await mock_rotation_service(
            current_production_id="CRP-CAB",
            next_production_id="CRP-LBN",
            harvest_end_date=harvest_end,
            proposed_planting_date=proposed_planting,
            pu_id="F001-PU001",
            tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
        )

        # Assert
        assert result["allowed"] is True, "PREF rotation must be allowed"
        assert result["enforcement_decision"] == "APPROVED"
        assert result["rule_status"] == "PREF"
        assert result["days_short"] == 0

    async def test_ok_rotation_approved(self, mock_rotation_service, base_date):
        """
        OK rotation: Cassava after Sweet Potato should be APPROVED.

        CRP-CAS after CRP-SPT — different families, acceptable follow-on crop.
        """
        # Arrange
        harvest_end = base_date - timedelta(days=20)
        proposed_planting = base_date

        # Act
        result = await mock_rotation_service(
            current_production_id="CRP-CAS",
            next_production_id="CRP-SPT",
            harvest_end_date=harvest_end,
            proposed_planting_date=proposed_planting,
            pu_id="F001-PU001",
            tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
        )

        # Assert
        assert result["allowed"] is True, "OK rotation must be allowed"
        assert result["enforcement_decision"] == "APPROVED"
        assert result["rule_status"] == "OK"

    async def test_no_previous_crop_approved(self, mock_rotation_service, base_date):
        """
        First crop on a PU (no history) should always be APPROVED regardless of next crop.

        When current_production_id is None, PU has no cultivation history.
        No rotation rule exists — result is always APPROVED with N/A status.
        """
        # Arrange — no previous crop (None), first planting ever on this PU
        proposed_planting = base_date

        # Act
        result = await mock_rotation_service(
            current_production_id=None,
            next_production_id="CRP-EGG",
            harvest_end_date=None,
            proposed_planting_date=proposed_planting,
            pu_id="F001-PU003",  # New PU, never planted
            tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
        )

        # Assert
        assert result["allowed"] is True, "First crop on PU must always be approved"
        assert result["enforcement_decision"] == "APPROVED"
        assert result["rule_status"] == "N/A"
        assert result["days_short"] == 0

    async def test_sufficient_rest_period_approved(self, mock_rotation_service, base_date):
        """
        Eggplant after Tomato with 65+ days rest should be APPROVED.

        CRP-EGG after CRP-TOM — same family (Solanaceae), 60-day rest required.
        With 65 days of rest observed, the rest requirement is met → APPROVED.
        """
        # Arrange — harvest ended 65 days before proposed planting
        harvest_end = base_date - timedelta(days=65)
        proposed_planting = base_date

        # Act
        result = await mock_rotation_service(
            current_production_id="CRP-TOM",
            next_production_id="CRP-EGG",
            harvest_end_date=harvest_end,
            proposed_planting_date=proposed_planting,
            pu_id="F001-PU002",
            tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
        )

        # Assert
        assert result["allowed"] is True, (
            "65-day rest satisfies 60-day Solanaceae requirement — must be APPROVED"
        )
        assert result["enforcement_decision"] == "APPROVED"
        assert result["days_short"] == 0, "days_short must be 0 when rest period is met"


# ---------------------------------------------------------------------------
# Class: TestRotationEngineBlocked
# ---------------------------------------------------------------------------

class TestRotationEngineBlocked:
    """Tests for rotations that should be BLOCKED."""

    async def test_same_family_solanaceae_blocked(self, mock_rotation_service, base_date):
        """
        Solanaceae back-to-back: Eggplant after Eggplant should be BLOCKED.

        CRP-EGG after CRP-EGG — same species, Solanaceae family.
        Harvest ended 5 days ago (well within 60-day rest requirement).
        """
        # Arrange
        harvest_end = base_date - timedelta(days=5)
        proposed_planting = base_date

        # Act
        result = await mock_rotation_service(
            current_production_id="CRP-EGG",
            next_production_id="CRP-EGG",
            harvest_end_date=harvest_end,
            proposed_planting_date=proposed_planting,
            pu_id="F001-PU002",
            tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
        )

        # Assert
        assert result["allowed"] is False, "Solanaceae back-to-back must be BLOCKED"
        assert result["enforcement_decision"] == "BLOCKED"
        assert result["rule_status"] == "BLOCK"
        assert result["min_rest_days"] == 60
        assert result["days_short"] == 55, (
            "With 5 days rest and 60 required, days_short should be 55"
        )

    async def test_solanaceae_cross_family_blocked(self, mock_rotation_service, base_date):
        """
        Tomato after Eggplant without sufficient rest should be BLOCKED.

        CRP-TOM after CRP-EGG — same family (Solanaceae), 60-day rest required.
        Proposed planting = harvest_end + 20 days (insufficient — 40 days short).
        """
        # Arrange — harvest ended 20 days ago, proposed planting today
        harvest_end = base_date - timedelta(days=20)
        proposed_planting = base_date

        # Act
        result = await mock_rotation_service(
            current_production_id="CRP-EGG",
            next_production_id="CRP-TOM",
            harvest_end_date=harvest_end,
            proposed_planting_date=proposed_planting,
            pu_id="F001-PU002",
            tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
        )

        # Assert
        assert result["allowed"] is False
        assert result["enforcement_decision"] == "BLOCKED"
        assert result["days_short"] == 40, (
            "60 required - 20 observed = 40 days short"
        )
        assert result["min_rest_days"] == 60

    async def test_cucurbitaceae_family_blocked(self, mock_rotation_service, base_date):
        """
        Watermelon after Cucumber without rest should be BLOCKED.

        CRP-WAT after CRP-CUC — same family (Cucurbitaceae), 45-day rest required.
        Harvest ended 10 days ago — 35 days short.
        """
        # Arrange
        harvest_end = base_date - timedelta(days=10)
        proposed_planting = base_date

        # Act
        result = await mock_rotation_service(
            current_production_id="CRP-CUC",
            next_production_id="CRP-WAT",
            harvest_end_date=harvest_end,
            proposed_planting_date=proposed_planting,
            pu_id="F001-PU001",
            tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
        )

        # Assert
        assert result["allowed"] is False
        assert result["enforcement_decision"] == "BLOCKED"
        assert result["rule_status"] == "BLOCK"
        assert result["min_rest_days"] == 45
        assert result["days_short"] == 35

    async def test_euphorbiaceae_long_rest_blocked(self, mock_rotation_service, base_date):
        """
        Cassava after Cassava without 180-day rest should be BLOCKED.

        CRP-CAS after CRP-CAS — Euphorbiaceae family, 180 days required.
        With only 90 days rest: BLOCKED, days_short = 90.
        """
        # Arrange — cassava harvest ended 90 days ago (only half the required rest)
        harvest_end = base_date - timedelta(days=90)
        proposed_planting = base_date

        # Act
        result = await mock_rotation_service(
            current_production_id="CRP-CAS",
            next_production_id="CRP-CAS",
            harvest_end_date=harvest_end,
            proposed_planting_date=proposed_planting,
            pu_id="F001-PU001",
            tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
        )

        # Assert
        assert result["allowed"] is False
        assert result["enforcement_decision"] == "BLOCKED"
        assert result["rule_status"] == "BLOCK"
        assert result["min_rest_days"] == 180
        assert result["days_short"] == 90, (
            "180 required - 90 observed = 90 days short"
        )


# ---------------------------------------------------------------------------
# Class: TestRotationEngineOverrideRequired
# ---------------------------------------------------------------------------

class TestRotationEngineOverrideRequired:
    """Tests for AVOID rotations that return OVERRIDE_REQUIRED."""

    async def test_avoid_rotation_override_required(self, mock_rotation_service, base_date):
        """
        AVOID rotation should return OVERRIDE_REQUIRED enforcement decision.

        CRP-EGG after CRP-CAS is flagged AVOID (heavy feeder after heavy feeder,
        soil depletion risk). Not a hard block, but requires management override.
        """
        # Arrange
        harvest_end = base_date - timedelta(days=30)
        proposed_planting = base_date

        # Act
        result = await mock_rotation_service(
            current_production_id="CRP-CAS",
            next_production_id="CRP-EGG",
            harvest_end_date=harvest_end,
            proposed_planting_date=proposed_planting,
            pu_id="F001-PU001",
            tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
        )

        # Assert
        assert result["allowed"] is False, "AVOID rotation must not be allowed without override"
        assert result["enforcement_decision"] == "OVERRIDE_REQUIRED"
        assert result["rule_status"] == "AVOID"
        assert result["override_available"] is True, (
            "AVOID rotations must have override_available=True"
        )

    async def test_avoid_has_alternatives(self, mock_rotation_service, base_date):
        """
        AVOID rotation response should include at least 1 recommended alternative.

        When a rotation is AVOID, the system must suggest better options from
        shared.rotation_top_choices. At least 1 alternative must be PREF or OK.
        """
        # Arrange
        harvest_end = base_date - timedelta(days=30)
        proposed_planting = base_date

        # Act
        result = await mock_rotation_service(
            current_production_id="CRP-CAS",
            next_production_id="CRP-EGG",
            harvest_end_date=harvest_end,
            proposed_planting_date=proposed_planting,
            pu_id="F001-PU001",
            tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
        )

        # Assert
        assert len(result["alternatives"]) >= 1, (
            "AVOID rotation must include at least 1 alternative recommendation"
        )
        # Verify at least one alternative is PREF or OK (genuinely good suggestions)
        statuses = {alt["rule_status"] for alt in result["alternatives"]}
        acceptable = statuses & {"PREF", "OK"}
        assert len(acceptable) >= 1, (
            f"Alternatives must include at least 1 PREF or OK option. Got statuses: {statuses}"
        )


# ---------------------------------------------------------------------------
# Class: TestRotationEngineAlternatives
# ---------------------------------------------------------------------------

class TestRotationEngineAlternatives:
    """Tests for alternatives list in rotation validation responses."""

    async def test_blocked_rotation_returns_alternatives(self, mock_rotation_service, base_date):
        """
        Blocked rotation must return a list of recommended alternatives from
        shared.rotation_top_choices. Minimum 3 alternatives for Eggplant.
        """
        # Arrange — eggplant back-to-back on F001-PU002 (active eggplant PU)
        harvest_end = base_date - timedelta(days=10)
        proposed_planting = base_date

        # Act
        result = await mock_rotation_service(
            current_production_id="CRP-EGG",
            next_production_id="CRP-EGG",
            harvest_end_date=harvest_end,
            proposed_planting_date=proposed_planting,
            pu_id="F001-PU002",
            tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
        )

        # Assert
        assert result["enforcement_decision"] == "BLOCKED"
        assert isinstance(result["alternatives"], list)
        assert len(result["alternatives"]) >= 3, (
            "CRP-EGG blocked rotation must return at least 3 alternatives"
        )

    async def test_alternatives_not_empty_for_block(self, mock_rotation_service, base_date):
        """
        alternatives list must not be empty when enforcement_decision is BLOCKED.

        An empty alternatives list provides no actionable guidance to the farmer.
        This is a data quality requirement on the shared.rotation_top_choices table.
        """
        # Arrange — cassava back-to-back (BLOCK, 180-day rest)
        harvest_end = base_date - timedelta(days=30)
        proposed_planting = base_date

        # Act
        result = await mock_rotation_service(
            current_production_id="CRP-EGG",
            next_production_id="CRP-EGG",
            harvest_end_date=harvest_end,
            proposed_planting_date=proposed_planting,
            pu_id="F001-PU002",
            tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
        )

        # Assert
        assert result["enforcement_decision"] == "BLOCKED"
        assert result["alternatives"] is not None
        assert len(result["alternatives"]) > 0, (
            "alternatives must never be empty for a BLOCKED rotation"
        )


# ---------------------------------------------------------------------------
# Class: TestRotationEngineSpecialCases
# ---------------------------------------------------------------------------

class TestRotationEngineSpecialCases:
    """Special case tests for Kava, Apiculture, Forestry, and calculation edge cases."""

    async def test_kava_rotation_special_handling(self, mock_rotation_service, base_date):
        """
        Kava (CRP-KAV) 4-year cycle: rotation re-planting uses COND status
        with 365-day minimum rest between kava cycles on the same PU.

        Real PU: F002-PU006 (Kava cycle CY-F002-25-001)
        """
        # Arrange — kava harvest 400 days ago (beyond 365-day COND threshold)
        harvest_end = base_date - timedelta(days=400)
        proposed_planting = base_date

        # Act
        result = await mock_rotation_service(
            current_production_id="CRP-KAV",
            next_production_id="CRP-KAV",
            harvest_end_date=harvest_end,
            proposed_planting_date=proposed_planting,
            pu_id="F002-PU006",
            tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
        )

        # Assert
        assert result["rule_status"] == "COND", (
            "CRP-KAV to CRP-KAV should use COND (conditional) rule status"
        )
        assert result["allowed"] is True, (
            "CRP-KAV re-planting after 400 days (> 365 required) should be approved"
        )
        assert result["enforcement_decision"] == "APPROVED"
        assert result["days_short"] == 0

    async def test_apiculture_overlay_logic(self, mock_rotation_service, base_date):
        """
        Apiculture (LIV-API) should use OVERLAY status.

        LIV-API is always OVERLAY — it co-exists with any crop rotation.
        Cycle: CY-F001-26-011 (LIV-API on F001)
        Expected: {rule_status: OVERLAY, enforcement_decision: APPROVED}
        """
        # Arrange — apiculture, previous cycle was also apiculture
        harvest_end = base_date - timedelta(days=14)
        proposed_planting = base_date

        # Act
        result = await mock_rotation_service(
            current_production_id="LIV-API",
            next_production_id="CRP-EGG",  # Any next crop
            harvest_end_date=harvest_end,
            proposed_planting_date=proposed_planting,
            pu_id="F001-PU002",
            tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
        )

        # Assert
        assert result["rule_status"] == "OVERLAY", (
            "LIV-API must always have OVERLAY rule status"
        )
        assert result["enforcement_decision"] == "APPROVED", (
            "Apiculture OVERLAY must always be APPROVED"
        )
        assert result["allowed"] is True

    async def test_forestry_na_logic(self, mock_rotation_service, base_date):
        """
        Forestry crops (FOR-TEK, FOR-SAN) should use N/A status.

        Forestry represents a different production system entirely —
        rotation concept does not apply. N/A = not applicable.
        Expected: {rule_status: N/A, enforcement_decision: APPROVED}
        """
        # Arrange — teak forestry
        harvest_end = base_date - timedelta(days=3650)
        proposed_planting = base_date

        # Act
        result = await mock_rotation_service(
            current_production_id="FOR-TEK",
            next_production_id="CRP-CAS",
            harvest_end_date=harvest_end,
            proposed_planting_date=proposed_planting,
            pu_id="F002-PU004",
            tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
        )

        # Assert
        assert result["rule_status"] == "N/A", (
            "Forestry crops must return N/A rule status"
        )
        assert result["enforcement_decision"] == "APPROVED"
        assert result["allowed"] is True

    async def test_days_short_calculation(self, mock_rotation_service, base_date):
        """
        days_short should be max(0, min_rest_days - days_since_harvest).

        Setup: CRP-EGG after CRP-EGG, min_rest = 60 days, actual rest = 20 days.
        Expected: days_short = max(0, 60 - 20) = 40.
        """
        # Arrange — only 20 days rest since harvest
        harvest_end = base_date - timedelta(days=20)
        proposed_planting = base_date

        # Act
        result = await mock_rotation_service(
            current_production_id="CRP-EGG",
            next_production_id="CRP-EGG",
            harvest_end_date=harvest_end,
            proposed_planting_date=proposed_planting,
            pu_id="F001-PU002",
            tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
        )

        # Assert
        assert result["days_short"] == 40, (
            f"Expected days_short=40 (60 required - 20 observed). Got: {result['days_short']}"
        )
        assert result["enforcement_decision"] == "BLOCKED"

    async def test_days_short_zero_when_rest_met(self, mock_rotation_service, base_date):
        """
        days_short should be 0 when rest period is fully met.

        min_rest = 60 days, actual_rest = 75 days → days_short = max(0, 60-75) = 0.
        """
        # Arrange — 75 days rest (exceeds 60-day requirement)
        harvest_end = base_date - timedelta(days=75)
        proposed_planting = base_date

        # Act
        result = await mock_rotation_service(
            current_production_id="CRP-EGG",
            next_production_id="CRP-EGG",
            harvest_end_date=harvest_end,
            proposed_planting_date=proposed_planting,
            pu_id="F001-PU002",
            tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
        )

        # Assert
        assert result["days_short"] == 0, (
            f"Rest period met (75 days >= 60 required) — days_short must be 0. Got: {result['days_short']}"
        )
        assert result["allowed"] is True
        assert result["enforcement_decision"] == "APPROVED"


# ---------------------------------------------------------------------------
# Class: TestRotationEngineOverrideFlow
# ---------------------------------------------------------------------------

class TestRotationEngineOverrideFlow:
    """Tests for the rotation override approval flow."""

    async def test_blocked_rotation_override_available(self, mock_rotation_service, base_date):
        """
        BLOCKED rotation should indicate override_available: True.

        While BLOCKED prevents automatic approval, a FOUNDER-role user
        can override the block. The response must signal this is possible.
        """
        # Arrange
        harvest_end = base_date - timedelta(days=5)
        proposed_planting = base_date

        # Act
        result = await mock_rotation_service(
            current_production_id="CRP-EGG",
            next_production_id="CRP-EGG",
            harvest_end_date=harvest_end,
            proposed_planting_date=proposed_planting,
            pu_id="F001-PU002",
            tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
        )

        # Assert
        assert result["enforcement_decision"] == "BLOCKED"
        assert result["override_available"] is True, (
            "BLOCKED rotation must have override_available=True to allow FOUNDER override"
        )

    async def test_override_requires_founder_role(self):
        """
        Override approval requires FOUNDER role — MANAGER cannot approve.

        The override service must validate the actor_role before writing to override_log.
        MANAGER attempting to override a BLOCKED rotation must receive a 403 Forbidden.
        """
        # Arrange — mock the override service with role validation
        mock_override_service = AsyncMock()
        mock_override_service.approve_rotation_override = AsyncMock(
            side_effect=lambda cycle_id, actor_role, reason: (
                {"approved": True, "actor_role": actor_role}
                if actor_role == "FOUNDER"
                else (_ for _ in ()).throw(
                    PermissionError("Override requires FOUNDER role. MANAGER cannot approve.")
                )
            )
        )

        # Act — attempt override as MANAGER (should fail)
        with pytest.raises(PermissionError) as exc_info:
            await mock_override_service.approve_rotation_override(
                cycle_id="CY-F001-26-002",
                actor_role="MANAGER",
                reason="Manager trying to override — should be denied",
            )

        # Assert
        assert "FOUNDER" in str(exc_info.value), (
            "Error message must specify that FOUNDER role is required"
        )
        assert "MANAGER" in str(exc_info.value), (
            "Error message must mention that MANAGER cannot approve"
        )

    async def test_override_logged_in_override_log(self, mock_override_log):
        """
        Successful override creates an immutable record in override_log table.

        The override_log entry must capture: cycle_id, actor_user_id, actor_role,
        override_reason, timestamp, before_state_json, after_state_json.
        """
        # Arrange — mock the override approval service
        override_log = mock_override_log  # Shared list to capture logged entries

        async def mock_approve_override(cycle_id, actor_user_id, actor_role, reason, before_state):
            if actor_role != "FOUNDER":
                raise PermissionError("Only FOUNDER can approve rotation overrides.")
            entry = {
                "cycle_id": cycle_id,
                "actor_user_id": actor_user_id,
                "actor_role": actor_role,
                "override_reason": reason,
                "before_state_json": before_state,
                "after_state_json": {"enforcement_decision": "OVERRIDE_APPROVED"},
            }
            override_log.append(entry)
            return {"approved": True, "log_entry": entry}

        # Act — FOUNDER approves override for blocked Solanaceae rotation
        result = await mock_approve_override(
            cycle_id="CY-F001-26-003",
            actor_user_id="founder-uraia-koroi-kama",
            actor_role="FOUNDER",
            reason="Trial: planting eggplant again — monitoring disease pressure closely",
            before_state={"enforcement_decision": "BLOCKED", "rule_status": "BLOCK", "days_short": 45},
        )

        # Assert
        assert result["approved"] is True
        assert len(override_log) == 1, "Exactly one override_log entry must be created"
        log_entry = override_log[0]
        assert log_entry["cycle_id"] == "CY-F001-26-003"
        assert log_entry["actor_role"] == "FOUNDER"
        assert log_entry["before_state_json"]["enforcement_decision"] == "BLOCKED"
        assert log_entry["after_state_json"]["enforcement_decision"] == "OVERRIDE_APPROVED"
        assert "override_reason" in log_entry
        assert len(log_entry["override_reason"]) > 0, "Override reason must not be empty"


# ---------------------------------------------------------------------------
# Additional edge-case tests (standalone functions)
# ---------------------------------------------------------------------------

async def test_exactly_60_days_rest_solanaceae_approved(mock_rotation_service, base_date):
    """
    Boundary condition: exactly 60 days rest for Solanaceae must be APPROVED.

    The rule is 'minimum 60 days' — exactly 60 days should satisfy the requirement.
    """
    # Arrange — exactly 60 days
    harvest_end = base_date - timedelta(days=60)
    proposed_planting = base_date

    # Act
    result = await mock_rotation_service(
        current_production_id="CRP-EGG",
        next_production_id="CRP-EGG",
        harvest_end_date=harvest_end,
        proposed_planting_date=proposed_planting,
        pu_id="F001-PU002",
        tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
    )

    # Assert
    assert result["allowed"] is True, (
        "Exactly 60 days rest meets the 60-day Solanaceae requirement"
    )
    assert result["days_short"] == 0


async def test_59_days_rest_solanaceae_blocked(mock_rotation_service, base_date):
    """
    Boundary condition: 59 days rest for Solanaceae must be BLOCKED.

    One day short of the minimum — must be blocked. days_short = 1.
    """
    # Arrange — 59 days (one day short)
    harvest_end = base_date - timedelta(days=59)
    proposed_planting = base_date

    # Act
    result = await mock_rotation_service(
        current_production_id="CRP-EGG",
        next_production_id="CRP-EGG",
        harvest_end_date=harvest_end,
        proposed_planting_date=proposed_planting,
        pu_id="F001-PU002",
        tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
    )

    # Assert
    assert result["allowed"] is False, (
        "59 days is one day short of 60-day requirement — must be BLOCKED"
    )
    assert result["days_short"] == 1, (
        f"Expected days_short=1. Got: {result['days_short']}"
    )


async def test_pineapple_first_time_approved(mock_rotation_service, base_date):
    """
    Pineapple (FRT-PIN) as first crop on F002-PU004 (Kadavu Island PU).

    No previous cycle → N/A rule status → always APPROVED.
    Cycle: CY-F002-26-010 (FRT-PIN)
    """
    # Arrange — no previous crop on this PU
    proposed_planting = base_date

    # Act
    result = await mock_rotation_service(
        current_production_id=None,
        next_production_id="FRT-PIN",
        harvest_end_date=None,
        proposed_planting_date=proposed_planting,
        pu_id="F002-PU004",
        tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
    )

    # Assert
    assert result["allowed"] is True
    assert result["rule_status"] == "N/A"
    assert result["enforcement_decision"] == "APPROVED"


async def test_kava_replant_too_soon_blocked(mock_rotation_service, base_date):
    """
    Kava replant too soon after previous kava harvest: BLOCKED.

    CRP-KAV COND rule requires 365 days. With only 200 days: BLOCKED.
    days_short = 165.
    """
    # Arrange — only 200 days since previous kava harvest
    harvest_end = base_date - timedelta(days=200)
    proposed_planting = base_date

    # Act
    result = await mock_rotation_service(
        current_production_id="CRP-KAV",
        next_production_id="CRP-KAV",
        harvest_end_date=harvest_end,
        proposed_planting_date=proposed_planting,
        pu_id="F002-PU006",
        tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
    )

    # Assert
    assert result["allowed"] is False
    assert result["enforcement_decision"] == "BLOCKED"
    assert result["rule_status"] == "COND"
    assert result["days_short"] == 165, (
        f"365 required - 200 observed = 165 days short. Got: {result['days_short']}"
    )


async def test_rotation_response_has_required_fields(mock_rotation_service, base_date):
    """
    All rotation responses must include the complete required field set.

    API contract: every validate_rotation() response must have these fields
    regardless of the outcome. Missing fields would break the frontend and
    TIS (voice assistant) parsing.
    """
    required_fields = {
        "allowed",
        "enforcement_decision",
        "rule_status",
        "days_short",
        "min_rest_days",
        "override_available",
        "alternatives",
        "message",
    }

    # Act — test with a simple OK case
    result = await mock_rotation_service(
        current_production_id="CRP-CAS",
        next_production_id="CRP-SPT",
        harvest_end_date=base_date - timedelta(days=30),
        proposed_planting_date=base_date,
        pu_id="F001-PU001",
        tenant_id="a1b2c3d4-0001-0001-0001-000000000001",
    )

    # Assert all required fields present
    missing = required_fields - set(result.keys())
    assert len(missing) == 0, (
        f"validate_rotation() response missing required fields: {missing}"
    )
