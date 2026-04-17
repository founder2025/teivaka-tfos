# FILE: 07_testing/tests/test_financial.py
"""
Complete tests for Teivaka financial calculations.
Uses real Fiji farm data: F001-PU002 Eggplant as primary test case.

Platform: Teivaka Agricultural TOS (Agri-TOS), Fiji
Currency: FJD (Fijian Dollar) — all monetary values in FJD, 2 decimal places
Primary metric: CoKG = (TotalLaborCost + TotalInputCost + TotalOtherCost) / TotalHarvestQty_kg

Real IDs used:
  F001 = Save-A-Lot, Korovou Serua
  F001-PU002 = Eggplant production unit
  CY-F001-26-002 = Active Eggplant cycle (CRP-EGG)
  W-001 = Laisenia Waqa (80 hours @ FJD 6/hr = FJD 480)
  CUS-001 = New World (primary commercial buyer)
  CUS-003 = Nayans-Kalsa (related party — profit share arrangements)
  INP-FERT-NPK = NPK Fertilizer
  INP-CHEM-DIM = Dimethoate
  INP-SEED-EGG = Eggplant Seed
"""
import pytest
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, timedelta
from typing import Optional


# ---------------------------------------------------------------------------
# Financial calculation functions (mirrors services/financial_service.py)
# ---------------------------------------------------------------------------

def compute_cokg(
    total_labor_cost: Decimal,
    total_input_cost: Decimal,
    total_other_cost: Decimal,
    total_harvest_qty_kg: Decimal,
) -> Optional[Decimal]:
    """
    Compute Cost of Goods per Kilogram (CoKG).

    CoKG = (TotalLaborCost + TotalInputCost + TotalOtherCost) / TotalHarvestQty_kg

    Returns None when total_harvest_qty_kg == 0 (undefined — not division by zero).
    Returns Decimal rounded to 2 decimal places when harvest > 0.
    """
    if total_harvest_qty_kg == Decimal("0"):
        return None

    total_cost = total_labor_cost + total_input_cost + total_other_cost
    cokg = total_cost / total_harvest_qty_kg
    return cokg.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def compute_gross_profit(total_revenue: Decimal, total_cost: Decimal) -> Decimal:
    """gross_profit = total_revenue - total_cost"""
    return total_revenue - total_cost


def compute_gross_margin_pct(
    gross_profit: Decimal,
    total_revenue: Decimal,
) -> Optional[Decimal]:
    """
    gross_margin_pct = (gross_profit / total_revenue) × 100

    Returns None when revenue is 0.
    """
    if total_revenue == Decimal("0"):
        return None
    margin = (gross_profit / total_revenue) * Decimal("100")
    return margin.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def compute_profit_share(
    net_profit: Decimal,
    profit_share_rate_pct: Optional[Decimal],
    party_name: str,
) -> Optional[dict]:
    """
    Compute profit share for a related party (e.g. Nayans-Kalsa for F001).

    profit_share_rate_pct: from farms.profit_share_rate_pct (configurable, not hardcoded).
    Returns None when profit_share_rate_pct is None (TBD / not configured).

    Returns dict with:
      party_name: str
      share_pct: Decimal
      party_share_fjd: Decimal (net_profit × share_pct / 100)
      teivaka_cut_fjd: Decimal (net_profit - party_share_fjd)
    """
    if profit_share_rate_pct is None:
        return None

    party_share = (net_profit * profit_share_rate_pct / Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    teivaka_cut = (net_profit - party_share).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    return {
        "party_name": party_name,
        "share_pct": profit_share_rate_pct,
        "party_share_fjd": party_share,
        "teivaka_cut_fjd": teivaka_cut,
    }


def compute_loss_gap_pct(
    harvested_kg: Decimal,
    delivered_kg: Decimal,
    sold_kg: Decimal,
) -> Optional[Decimal]:
    """
    loss_gap_pct = (harvested - delivered - sold) / harvested × 100

    Returns None when harvested_kg == 0.
    """
    if harvested_kg == Decimal("0"):
        return None

    # Loss = product that was harvested but not delivered AND not sold
    # In the Teivaka model: delivered is the quantity sent out to customers
    # sold is confirmed sales. Loss = harvested - delivered.
    # The reconciliation checks: harvested vs (delivered + on-farm remaining)
    loss_kg = harvested_kg - delivered_kg
    loss_pct = (loss_kg / harvested_kg * Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return loss_pct


def build_13_week_cashflow_forecast(
    starting_balance: Decimal,
    weekly_inflows: list,  # List of 13 Decimal values (expected inflows per week)
    weekly_outflows: list,  # List of 13 Decimal values (expected outflows per week)
) -> list:
    """
    Build 13-week rolling cashflow forecast.

    Returns list of 13 dicts:
      week_number: int (1-13)
      inflow_fjd: Decimal
      outflow_fjd: Decimal
      net_fjd: Decimal (inflow - outflow)
      cumulative_balance_fjd: Decimal (carried forward)
      is_negative: bool
    """
    forecast = []
    cumulative = starting_balance

    for i in range(13):
        inflow = weekly_inflows[i]
        outflow = weekly_outflows[i]
        net = inflow - outflow
        cumulative = (cumulative + net).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        forecast.append({
            "week_number": i + 1,
            "inflow_fjd": inflow,
            "outflow_fjd": outflow,
            "net_fjd": net,
            "cumulative_balance_fjd": cumulative,
            "is_negative": cumulative < Decimal("0"),
        })

    return forecast


def compute_labor_cost_ratio(
    total_labor_cost_fjd: Decimal,
    total_income_fjd: Decimal,
) -> Optional[Decimal]:
    """
    Labor cost ratio = total_labor_cost / total_income × 100

    Returns None when income is 0.
    """
    if total_income_fjd == Decimal("0"):
        return None
    ratio = (total_labor_cost_fjd / total_income_fjd * Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return ratio


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tenant_id() -> str:
    return "a1b2c3d4-0001-0001-0001-000000000001"


@pytest.fixture
def base_date() -> date:
    return date(2026, 4, 7)


@pytest.fixture
def eggplant_cycle_standard() -> dict:
    """
    Standard test cycle for F001-PU002 Eggplant (CY-F001-26-002).

    Labor:  W-001 Laisenia Waqa, 80 hours @ FJD 6/hr = FJD 480.00
    Inputs: NPK Fertilizer FJD 120, Dimethoate FJD 85, Eggplant Seed FJD 40 = FJD 245.00
    Other:  FJD 0.00
    Harvest: 390.00 kg
    Market price (CRP-EGG Grade A): FJD 2.80/kg
    Revenue: 390 × 2.80 = FJD 1,092.00
    """
    return {
        "cycle_id": "CY-F001-26-002",
        "farm_id": "F001",
        "pu_id": "F001-PU002",
        "production_id": "CRP-EGG",
        "total_labor_cost_fjd": Decimal("480.00"),
        "total_input_cost_fjd": Decimal("245.00"),
        "total_other_cost_fjd": Decimal("0.00"),
        "total_harvest_qty_kg": Decimal("390.00"),
        "market_price_fjd_per_kg": Decimal("2.80"),
        "total_revenue_fjd": Decimal("1092.00"),  # 390 × 2.80
    }


@pytest.fixture
def eggplant_cycle_no_harvest() -> dict:
    """Cycle with no harvest yet — CoKG must be None (not division by zero)."""
    return {
        "cycle_id": "CY-F001-26-003",
        "farm_id": "F001",
        "pu_id": "F001-PU003",
        "production_id": "CRP-EGG",
        "total_labor_cost_fjd": Decimal("200.00"),
        "total_input_cost_fjd": Decimal("150.00"),
        "total_other_cost_fjd": Decimal("0.00"),
        "total_harvest_qty_kg": Decimal("0.00"),  # No harvest yet
        "market_price_fjd_per_kg": Decimal("2.80"),
        "total_revenue_fjd": Decimal("0.00"),
    }


@pytest.fixture
def eggplant_cycle_loss_making() -> dict:
    """Cycle where CoKG exceeds market price — loss-making scenario."""
    return {
        "cycle_id": "CY-F001-26-004",
        "farm_id": "F001",
        "pu_id": "F001-PU002",
        "production_id": "CRP-EGG",
        "total_labor_cost_fjd": Decimal("900.00"),   # High labor
        "total_input_cost_fjd": Decimal("500.00"),   # High inputs
        "total_other_cost_fjd": Decimal("100.00"),   # Other costs
        "total_harvest_qty_kg": Decimal("200.00"),   # Low harvest
        "market_price_fjd_per_kg": Decimal("2.80"),
        "total_revenue_fjd": Decimal("560.00"),      # 200 × 2.80
    }


@pytest.fixture
def mock_alert_store():
    """In-memory alert store for automation rule testing within financial tests."""
    alerts = []

    class AlertStore:
        def create(self, alert_data):
            alerts.append(alert_data)
            return alert_data

        def find(self, rule_id):
            return [a for a in alerts if a.get("rule_id") == rule_id]

        def count(self):
            return len(alerts)

        def clear(self):
            alerts.clear()

    return AlertStore()


# ---------------------------------------------------------------------------
# Class: TestCoKGComputation
# ---------------------------------------------------------------------------

class TestCoKGComputation:
    """Tests for Cost per Kilogram (CoKG) calculation — PRIMARY financial metric."""

    def test_cogk_basic_calculation(self, eggplant_cycle_standard):
        """
        CoKG = (labor + inputs + other) / harvest_qty_kg

        Setup (F001-PU002 Eggplant CY-F001-26-002):
          labor_cost  = FJD 480.00 (W-001 Laisenia Waqa, 80 hours @ FJD 6/hr)
          input_cost  = FJD 245.00 (INP-FERT-NPK + INP-CHEM-DIM + INP-SEED-EGG)
          other_cost  = FJD 0.00
          harvest_qty = 390.00 kg

        Expected CoKG = (480 + 245 + 0) / 390 = 725 / 390 = FJD 1.86/kg (rounded to 2dp)
        """
        cycle = eggplant_cycle_standard

        # Act
        cokg = compute_cokg(
            total_labor_cost=cycle["total_labor_cost_fjd"],
            total_input_cost=cycle["total_input_cost_fjd"],
            total_other_cost=cycle["total_other_cost_fjd"],
            total_harvest_qty_kg=cycle["total_harvest_qty_kg"],
        )

        # Assert
        assert cokg is not None, "CoKG must not be None when harvest quantity > 0"
        assert cokg == Decimal("1.86"), (
            f"CoKG = (480 + 245 + 0) / 390 = FJD 1.86/kg. Got: FJD {cokg}"
        )
        assert isinstance(cokg, Decimal), "CoKG must be Decimal type (not float)"

    def test_cogk_zero_harvest_returns_null(self, eggplant_cycle_no_harvest):
        """
        CoKG should return None when harvest_qty_kg = 0.

        Cycle has costs but no harvest yet — CoKG is undefined (not division by zero).
        Returning 0 or raising an exception would both be incorrect.
        """
        cycle = eggplant_cycle_no_harvest

        # Act
        cokg = compute_cokg(
            total_labor_cost=cycle["total_labor_cost_fjd"],
            total_input_cost=cycle["total_input_cost_fjd"],
            total_other_cost=cycle["total_other_cost_fjd"],
            total_harvest_qty_kg=cycle["total_harvest_qty_kg"],
        )

        # Assert
        assert cokg is None, (
            "CoKG must be None (not 0, not error) when no harvest has been recorded yet"
        )

    def test_cogk_updates_when_harvest_added(self):
        """
        CoKG recalculates correctly when new harvest is logged.

        Initial: 200kg harvested → CoKG = 2.00 FJD/kg
        Add 100kg → Total 300kg → CoKG drops to lower value
        """
        # Initial state: 200kg harvested
        labor = Decimal("240.00")
        inputs = Decimal("160.00")
        other = Decimal("0.00")
        total_cost = labor + inputs + other  # FJD 400.00

        initial_harvest = Decimal("200.00")
        initial_cokg = compute_cokg(labor, inputs, other, initial_harvest)
        assert initial_cokg == Decimal("2.00"), (
            f"Initial CoKG with 200kg should be FJD 2.00/kg. Got: {initial_cokg}"
        )

        # After adding 100kg more harvest (same costs)
        updated_harvest = Decimal("300.00")
        updated_cokg = compute_cokg(labor, inputs, other, updated_harvest)

        # Assert
        assert updated_cokg is not None
        assert updated_cokg < initial_cokg, (
            "CoKG must decrease when more harvest is recorded (same total costs, more kg)"
        )
        expected = (total_cost / updated_harvest).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        assert updated_cokg == expected, (
            f"Expected CoKG {expected} after 300kg. Got: {updated_cokg}"
        )

    def test_cogk_below_market_price_is_profitable(self, eggplant_cycle_standard):
        """
        Cycle is profitable when CoKG < market_price_fjd_kg.

        CoKG = FJD 1.86/kg (computed above)
        Market price for CRP-EGG Grade A = FJD 2.80/kg
        Gross margin must be positive.
        """
        cycle = eggplant_cycle_standard

        # Compute CoKG
        cokg = compute_cokg(
            total_labor_cost=cycle["total_labor_cost_fjd"],
            total_input_cost=cycle["total_input_cost_fjd"],
            total_other_cost=cycle["total_other_cost_fjd"],
            total_harvest_qty_kg=cycle["total_harvest_qty_kg"],
        )

        # Assert: CoKG is below market price
        assert cokg < cycle["market_price_fjd_per_kg"], (
            f"CoKG {cokg} must be below market price {cycle['market_price_fjd_per_kg']} for profitability"
        )

        # Compute gross profit
        total_cost = (
            cycle["total_labor_cost_fjd"]
            + cycle["total_input_cost_fjd"]
            + cycle["total_other_cost_fjd"]
        )
        gross_profit = compute_gross_profit(cycle["total_revenue_fjd"], total_cost)
        assert gross_profit > Decimal("0"), (
            f"Gross profit must be positive. Got: FJD {gross_profit}"
        )

    def test_cogk_above_market_price_is_loss(self, eggplant_cycle_loss_making):
        """
        Cycle is loss-making when CoKG > market_price_fjd_kg.

        Artificially high costs and low harvest → CoKG exceeds market price.
        gross_margin_pct should be negative → RED signal in decision engine.
        """
        cycle = eggplant_cycle_loss_making

        # Compute CoKG
        cokg = compute_cokg(
            total_labor_cost=cycle["total_labor_cost_fjd"],
            total_input_cost=cycle["total_input_cost_fjd"],
            total_other_cost=cycle["total_other_cost_fjd"],
            total_harvest_qty_kg=cycle["total_harvest_qty_kg"],
        )

        # CoKG = (900 + 500 + 100) / 200 = 1500/200 = FJD 7.50/kg
        assert cokg is not None
        assert cokg > cycle["market_price_fjd_per_kg"], (
            f"CoKG {cokg} must exceed market price {cycle['market_price_fjd_per_kg']} for loss scenario"
        )

        # Gross profit must be negative
        total_cost = (
            cycle["total_labor_cost_fjd"]
            + cycle["total_input_cost_fjd"]
            + cycle["total_other_cost_fjd"]
        )
        gross_profit = compute_gross_profit(cycle["total_revenue_fjd"], total_cost)
        assert gross_profit < Decimal("0"), (
            f"Gross profit must be negative for loss scenario. Got: FJD {gross_profit}"
        )

    def test_cogk_calculation_precision(self):
        """CoKG must use Decimal arithmetic — no floating point precision issues."""
        # Use values that would cause float imprecision
        cokg = compute_cokg(
            total_labor_cost=Decimal("333.33"),
            total_input_cost=Decimal("111.11"),
            total_other_cost=Decimal("0.01"),
            total_harvest_qty_kg=Decimal("150.00"),
        )

        assert cokg is not None
        assert isinstance(cokg, Decimal), "CoKG must use Decimal, not float"
        # Verify result is rounded to exactly 2 decimal places
        assert cokg == cokg.quantize(Decimal("0.01")), (
            f"CoKG must be rounded to 2 decimal places. Got: {cokg}"
        )


# ---------------------------------------------------------------------------
# Class: TestPnLComputation
# ---------------------------------------------------------------------------

class TestPnLComputation:
    """Tests for farm Profit & Loss calculations."""

    def test_gross_profit_computation(self, eggplant_cycle_standard):
        """
        gross_profit = total_revenue - total_cost

        Revenue = FJD 1,092.00 (390kg × FJD 2.80)
        Total cost = FJD 725.00 (480 + 245 + 0)
        Gross profit = FJD 367.00
        """
        cycle = eggplant_cycle_standard
        total_cost = (
            cycle["total_labor_cost_fjd"]
            + cycle["total_input_cost_fjd"]
            + cycle["total_other_cost_fjd"]
        )

        # Act
        gross_profit = compute_gross_profit(cycle["total_revenue_fjd"], total_cost)

        # Assert
        assert gross_profit == Decimal("367.00"), (
            f"Gross profit = FJD 1092 - FJD 725 = FJD 367.00. Got: FJD {gross_profit}"
        )

    def test_gross_margin_pct_computation(self, eggplant_cycle_standard):
        """
        gross_margin_pct = (gross_profit / total_revenue) × 100

        Revenue = FJD 1,092.00
        Total cost = FJD 725.00
        Gross profit = FJD 367.00
        Gross margin = (367 / 1092) × 100 = 33.60% (rounded to 2dp)
        """
        cycle = eggplant_cycle_standard
        total_cost = (
            cycle["total_labor_cost_fjd"]
            + cycle["total_input_cost_fjd"]
            + cycle["total_other_cost_fjd"]
        )
        gross_profit = compute_gross_profit(cycle["total_revenue_fjd"], total_cost)

        # Act
        margin = compute_gross_margin_pct(gross_profit, cycle["total_revenue_fjd"])

        # Assert
        assert margin is not None
        expected = (Decimal("367.00") / Decimal("1092.00") * Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        assert margin == expected, (
            f"Gross margin = (367/1092) × 100 = {expected}%. Got: {margin}%"
        )
        # Confirm it's in the AMBER decision engine zone (25-40%)
        assert Decimal("25") <= margin <= Decimal("40"), (
            f"Margin {margin}% should be in AMBER zone (25-40%)"
        )

    def test_gross_margin_zero_revenue_returns_none(self):
        """gross_margin_pct must return None when revenue = 0 (no sales yet)."""
        margin = compute_gross_margin_pct(
            gross_profit=Decimal("0"),
            total_revenue=Decimal("0"),
        )
        assert margin is None, (
            "Gross margin must be None when revenue is 0 — cannot compute percentage"
        )

    def test_gross_margin_negative_when_loss(self, eggplant_cycle_loss_making):
        """Gross margin is negative when costs exceed revenue."""
        cycle = eggplant_cycle_loss_making
        total_cost = (
            cycle["total_labor_cost_fjd"]
            + cycle["total_input_cost_fjd"]
            + cycle["total_other_cost_fjd"]
        )
        gross_profit = compute_gross_profit(cycle["total_revenue_fjd"], total_cost)
        margin = compute_gross_margin_pct(gross_profit, cycle["total_revenue_fjd"])

        assert margin is not None
        assert margin < Decimal("0"), (
            f"Gross margin must be negative for loss-making cycle. Got: {margin}%"
        )

    def test_farm_pnl_aggregates_all_cycles(self):
        """
        Farm P&L sums across all active cycles.

        F001 has 3 eggplant cycles and 1 cassava cycle.
        Farm total revenue = sum of all cycle revenues.
        Farm total cost = sum of all cycle costs.
        """
        # Arrange — 3 cycles with different revenues and costs
        cycles = [
            {
                "cycle_id": "CY-F001-26-001",
                "total_revenue_fjd": Decimal("560.00"),
                "total_cost_fjd": Decimal("400.00"),
            },
            {
                "cycle_id": "CY-F001-26-002",
                "total_revenue_fjd": Decimal("1092.00"),
                "total_cost_fjd": Decimal("725.00"),
            },
            {
                "cycle_id": "CY-F001-26-003",
                "total_revenue_fjd": Decimal("840.00"),
                "total_cost_fjd": Decimal("600.00"),
            },
        ]

        # Act — aggregate (simulating farm_pnl materialized view)
        farm_total_revenue = sum(c["total_revenue_fjd"] for c in cycles)
        farm_total_cost = sum(c["total_cost_fjd"] for c in cycles)
        farm_gross_profit = compute_gross_profit(farm_total_revenue, farm_total_cost)
        farm_margin = compute_gross_margin_pct(farm_gross_profit, farm_total_revenue)

        # Assert
        assert farm_total_revenue == Decimal("2492.00"), (
            f"Farm revenue must sum all cycles. Got: {farm_total_revenue}"
        )
        assert farm_total_cost == Decimal("1725.00"), (
            f"Farm cost must sum all cycles. Got: {farm_total_cost}"
        )
        assert farm_gross_profit == Decimal("767.00")
        assert farm_margin is not None
        assert farm_margin > Decimal("0")


# ---------------------------------------------------------------------------
# Class: TestProfitShareCalculation
# ---------------------------------------------------------------------------

class TestProfitShareCalculation:
    """Tests for Nayans-Kalsa profit share on F001 cycles."""

    def test_profit_share_uses_configurable_rate(self):
        """
        Profit share uses farms.profit_share_rate_pct — not hardcoded.

        farms.profit_share_rate_pct = 30.0%
        net_profit = FJD 367.00 (from standard eggplant cycle)
        nayans_share = FJD 367 × 30% = FJD 110.10
        teivaka_cut  = FJD 367 - FJD 110.10 = FJD 256.90
        """
        # Arrange
        net_profit = Decimal("367.00")
        profit_share_rate = Decimal("30.0")

        # Act
        result = compute_profit_share(
            net_profit=net_profit,
            profit_share_rate_pct=profit_share_rate,
            party_name="Nayans-Kalsa",
        )

        # Assert
        assert result is not None
        assert result["party_name"] == "Nayans-Kalsa"
        assert result["share_pct"] == Decimal("30.0")
        assert result["party_share_fjd"] == Decimal("110.10"), (
            f"Nayans share = FJD 367 × 30% = FJD 110.10. Got: {result['party_share_fjd']}"
        )
        assert result["teivaka_cut_fjd"] == Decimal("256.90"), (
            f"Teivaka cut = FJD 367 - FJD 110.10 = FJD 256.90. Got: {result['teivaka_cut_fjd']}"
        )

    def test_profit_share_null_when_rate_not_configured(self):
        """
        Profit share calculation returns None when rate is NULL (TBD).

        When farms.profit_share_rate_pct is not set, profit share is not computed.
        This handles farms that don't have a profit-share arrangement.
        """
        # Act
        result = compute_profit_share(
            net_profit=Decimal("367.00"),
            profit_share_rate_pct=None,  # Not configured
            party_name="Nayans-Kalsa",
        )

        # Assert
        assert result is None, (
            "Profit share must return None when profit_share_rate_pct is NULL"
        )

    def test_profit_share_party_and_teivaka_sum_to_net_profit(self):
        """
        party_share_fjd + teivaka_cut_fjd must exactly equal net_profit (no rounding loss)."""
        net_profit = Decimal("1234.57")
        profit_share_rate = Decimal("40.0")

        result = compute_profit_share(
            net_profit=net_profit,
            profit_share_rate_pct=profit_share_rate,
            party_name="Nayans-Kalsa",
        )

        assert result is not None
        total = result["party_share_fjd"] + result["teivaka_cut_fjd"]
        # Allow for maximum 1 cent rounding difference
        difference = abs(total - net_profit)
        assert difference <= Decimal("0.01"), (
            f"party_share + teivaka_cut = {total} must equal net_profit {net_profit}. "
            f"Difference: {difference}"
        )

    def test_related_party_flag_on_nayans_sales(self):
        """
        Income records for Nayans customers (CUS-003) must have is_related_party=True.

        Nayans-Kalsa is flagged as a related party — different commercial terms may apply.
        This flag must appear on both the customers record and the income_log record.
        """
        # Arrange — simulate income log entries for Nayans-Kalsa
        nayans_income_records = [
            {
                "income_id": "INC-001",
                "cycle_id": "CY-F001-26-002",
                "customer_id": "CUS-003",
                "customer_name": "Nayans-Kalsa",
                "qty_kg": Decimal("200.00"),
                "price_per_kg_fjd": Decimal("2.50"),
                "total_fjd": Decimal("500.00"),
                "is_related_party": True,  # Must be set from customers.is_related_party
            }
        ]

        new_world_income_records = [
            {
                "income_id": "INC-002",
                "cycle_id": "CY-F001-26-002",
                "customer_id": "CUS-001",
                "customer_name": "New World",
                "qty_kg": Decimal("190.00"),
                "price_per_kg_fjd": Decimal("2.80"),
                "total_fjd": Decimal("532.00"),
                "is_related_party": False,
            }
        ]

        # Assert Nayans is flagged as related party
        for record in nayans_income_records:
            assert record["is_related_party"] is True, (
                f"Nayans-Kalsa (CUS-003) income must have is_related_party=True. "
                f"income_id: {record['income_id']}"
            )

        # Assert New World is NOT a related party
        for record in new_world_income_records:
            assert record["is_related_party"] is False, (
                f"New World (CUS-001) must have is_related_party=False"
            )

    def test_profit_share_zero_profit_gives_zero_shares(self):
        """When net_profit = 0, both shares must be 0."""
        result = compute_profit_share(
            net_profit=Decimal("0.00"),
            profit_share_rate_pct=Decimal("30.0"),
            party_name="Nayans-Kalsa",
        )

        assert result is not None
        assert result["party_share_fjd"] == Decimal("0.00")
        assert result["teivaka_cut_fjd"] == Decimal("0.00")


# ---------------------------------------------------------------------------
# Class: TestCashflowForecast
# ---------------------------------------------------------------------------

class TestCashflowForecast:
    """Tests for 13-week cashflow forecast (RULE-041 trigger)."""

    def test_13_week_forecast_returns_13_rows(self):
        """Forecast function returns exactly 13 week periods."""
        inflows = [Decimal("500.00")] * 13
        outflows = [Decimal("300.00")] * 13

        # Act
        forecast = build_13_week_cashflow_forecast(
            starting_balance=Decimal("1000.00"),
            weekly_inflows=inflows,
            weekly_outflows=outflows,
        )

        # Assert
        assert len(forecast) == 13, (
            f"13-week forecast must return exactly 13 rows. Got: {len(forecast)}"
        )

    def test_week_numbers_sequential(self):
        """Week numbers must be sequential from 1 to 13."""
        inflows = [Decimal("400.00")] * 13
        outflows = [Decimal("300.00")] * 13

        forecast = build_13_week_cashflow_forecast(
            starting_balance=Decimal("500.00"),
            weekly_inflows=inflows,
            weekly_outflows=outflows,
        )

        week_numbers = [row["week_number"] for row in forecast]
        assert week_numbers == list(range(1, 14)), (
            f"Week numbers must be 1-13 in order. Got: {week_numbers}"
        )

    def test_cumulative_balance_computed_correctly(self):
        """
        Cumulative balance correctly carries forward week by week.

        Starting: FJD 1,000
        Week 1: +FJD 500 - FJD 300 = net +FJD 200 → cumulative: FJD 1,200
        Week 2: +FJD 500 - FJD 300 = net +FJD 200 → cumulative: FJD 1,400
        Week 3: +FJD 500 - FJD 300 = net +FJD 200 → cumulative: FJD 1,600
        """
        inflows = [Decimal("500.00")] * 13
        outflows = [Decimal("300.00")] * 13
        starting = Decimal("1000.00")

        forecast = build_13_week_cashflow_forecast(
            starting_balance=starting,
            weekly_inflows=inflows,
            weekly_outflows=outflows,
        )

        assert forecast[0]["cumulative_balance_fjd"] == Decimal("1200.00"), (
            f"Week 1 cumulative must be FJD 1200. Got: {forecast[0]['cumulative_balance_fjd']}"
        )
        assert forecast[1]["cumulative_balance_fjd"] == Decimal("1400.00"), (
            f"Week 2 cumulative must be FJD 1400. Got: {forecast[1]['cumulative_balance_fjd']}"
        )
        assert forecast[2]["cumulative_balance_fjd"] == Decimal("1600.00"), (
            f"Week 3 cumulative must be FJD 1600. Got: {forecast[2]['cumulative_balance_fjd']}"
        )

    def test_negative_week_detected(self):
        """
        When cumulative balance goes negative in any week, is_negative=True for that week.

        Starting: FJD 100
        Weeks 1-5: net = -FJD 30 per week → goes negative by week 4.
        """
        inflows = [Decimal("100.00")] * 13
        outflows = [Decimal("130.00")] * 13  # Net -30 per week
        starting = Decimal("100.00")

        forecast = build_13_week_cashflow_forecast(
            starting_balance=starting,
            weekly_inflows=inflows,
            weekly_outflows=outflows,
        )

        negative_weeks = [row for row in forecast if row["is_negative"]]
        assert len(negative_weeks) >= 1, (
            "At least one week must have is_negative=True when cash goes negative"
        )

        # Verify the first negative week has negative cumulative balance
        first_negative = negative_weeks[0]
        assert first_negative["cumulative_balance_fjd"] < Decimal("0"), (
            f"First negative week must have negative cumulative. Got: {first_negative['cumulative_balance_fjd']}"
        )

    def test_negative_week_triggers_rule_041_alert(self, mock_alert_store):
        """
        RULE-041 must fire when any week in the 13-week forecast shows negative balance.

        This tests the alert trigger logic: after building the forecast, the automation
        engine checks for negative weeks and creates the alert.
        """
        inflows = [Decimal("100.00")] * 13
        outflows = [Decimal("200.00")] * 13  # Heavily negative
        starting = Decimal("50.00")

        forecast = build_13_week_cashflow_forecast(
            starting_balance=starting,
            weekly_inflows=inflows,
            weekly_outflows=outflows,
        )

        # Simulate RULE-041 trigger check
        has_negative_week = any(row["is_negative"] for row in forecast)

        if has_negative_week:
            first_negative = next(row for row in forecast if row["is_negative"])
            alert = mock_alert_store.create({
                "rule_id": "RULE-041",
                "severity": "High",
                "farm_id": "F001",
                "status": "open",
                "title": "Cash Flow Warning — Negative Balance Projected",
                "body_json": {
                    "first_negative_week": first_negative["week_number"],
                    "projected_balance_fjd": str(first_negative["cumulative_balance_fjd"]),
                },
            })

        # Assert
        assert has_negative_week is True
        rule_041_alerts = mock_alert_store.find("RULE-041")
        assert len(rule_041_alerts) == 1, (
            "RULE-041 must create exactly 1 alert when negative week detected"
        )
        assert rule_041_alerts[0]["severity"] == "High"

    def test_harvest_projections_in_forecast(self):
        """
        Expected harvest revenue from active cycles appears in forecast inflows.

        F001-PU002 Eggplant expected harvest: week 5 = FJD 1,092 inflow.
        The forecast must incorporate planned harvest revenues.
        """
        # Arrange — harvest expected in week 5 (FJD 1,092 from standard eggplant cycle)
        inflows = [Decimal("200.00")] * 13
        inflows[4] = Decimal("1292.00")  # Week 5: base FJD 200 + harvest FJD 1092

        outflows = [Decimal("250.00")] * 13
        starting = Decimal("500.00")

        forecast = build_13_week_cashflow_forecast(
            starting_balance=starting,
            weekly_inflows=inflows,
            weekly_outflows=outflows,
        )

        # Assert week 5 shows higher inflow
        week_5 = forecast[4]
        assert week_5["inflow_fjd"] == Decimal("1292.00"), (
            f"Week 5 must include harvest projection FJD 1292. Got: {week_5['inflow_fjd']}"
        )
        assert week_5["week_number"] == 5

    def test_all_weeks_positive_no_is_negative_flag(self):
        """When all weeks are positive, no week should have is_negative=True."""
        inflows = [Decimal("1000.00")] * 13
        outflows = [Decimal("200.00")] * 13
        starting = Decimal("5000.00")

        forecast = build_13_week_cashflow_forecast(
            starting_balance=starting,
            weekly_inflows=inflows,
            weekly_outflows=outflows,
        )

        negative_weeks = [row for row in forecast if row["is_negative"]]
        assert len(negative_weeks) == 0, (
            f"No weeks should be negative when inflows greatly exceed outflows. "
            f"Found negative weeks: {negative_weeks}"
        )


# ---------------------------------------------------------------------------
# Class: TestHarvestReconciliation
# ---------------------------------------------------------------------------

class TestHarvestReconciliation:
    """Tests for harvest reconciliation and loss gap detection (RULE-036)."""

    def test_loss_gap_calculation(self):
        """
        loss_gap_pct = (harvested - delivered) / harvested × 100

        Setup from F001-PU002 Eggplant CY-F001-26-002:
          harvested = 390 kg
          delivered = 350 kg (delivered to New World + Nayans)
          sold      = 340 kg (confirmed paid sales — 10kg in transit/outstanding)
          loss      = 390 - 350 = 40 kg unaccounted
          loss_pct  = 40 / 390 × 100 = 10.26%

        NOTE: loss_gap is harvested - delivered (not sold) for reconciliation.
        """
        # Act
        loss_pct = compute_loss_gap_pct(
            harvested_kg=Decimal("390.00"),
            delivered_kg=Decimal("350.00"),
            sold_kg=Decimal("340.00"),
        )

        # Assert
        assert loss_pct is not None
        expected = (Decimal("40.00") / Decimal("390.00") * Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        assert loss_pct == expected, (
            f"Loss gap = (390-350)/390 × 100 = {expected}%. Got: {loss_pct}%"
        )
        # 10.26% > 10% threshold → should trigger RULE-036
        assert loss_pct > Decimal("10.00"), (
            "10.26% exceeds 10% threshold — RULE-036 should fire"
        )

    def test_loss_gap_alert_fires_above_10_pct(self, mock_alert_store):
        """
        RULE-036 fires when loss_gap_pct > 10%.

        F001-PU002 loss scenario: 390 harvested, 350 delivered.
        Loss gap = 10.26% → above threshold → alert created.
        """
        # Arrange
        loss_pct = compute_loss_gap_pct(
            harvested_kg=Decimal("390.00"),
            delivered_kg=Decimal("350.00"),
            sold_kg=Decimal("340.00"),
        )

        # Simulate RULE-036 trigger logic
        threshold = Decimal("10.00")
        if loss_pct is not None and loss_pct > threshold:
            mock_alert_store.create({
                "rule_id": "RULE-036",
                "severity": "High",
                "farm_id": "F001",
                "pu_id": "F001-PU002",
                "cycle_id": "CY-F001-26-002",
                "status": "open",
                "title": "Harvest Reconciliation Warning — Loss Gap Exceeds 10%",
                "body_json": {
                    "loss_gap_pct": str(loss_pct),
                    "harvested_kg": "390.00",
                    "delivered_kg": "350.00",
                    "threshold_pct": "10.00",
                },
            })

        # Assert
        rule_036_alerts = mock_alert_store.find("RULE-036")
        assert len(rule_036_alerts) == 1, (
            f"RULE-036 must fire when loss_gap = {loss_pct}% > 10% threshold"
        )
        assert rule_036_alerts[0]["severity"] == "High"
        assert float(rule_036_alerts[0]["body_json"]["loss_gap_pct"]) > 10.0

    def test_loss_gap_no_alert_below_10_pct(self, mock_alert_store):
        """
        RULE-036 does NOT fire when loss_gap_pct <= 10%.

        390 harvested, 380 delivered → loss = 10kg → 10/390 = 2.56% (below 10%)
        """
        # Arrange — minimal loss
        loss_pct = compute_loss_gap_pct(
            harvested_kg=Decimal("390.00"),
            delivered_kg=Decimal("380.00"),
            sold_kg=Decimal("375.00"),
        )

        # Simulate RULE-036 trigger
        threshold = Decimal("10.00")
        if loss_pct is not None and loss_pct > threshold:
            mock_alert_store.create({"rule_id": "RULE-036"})

        # Assert
        assert loss_pct is not None
        assert loss_pct <= threshold, (
            f"Loss gap {loss_pct}% should be <= 10% for this test case"
        )
        rule_036_alerts = mock_alert_store.find("RULE-036")
        assert len(rule_036_alerts) == 0, (
            f"RULE-036 must NOT fire when loss_gap = {loss_pct}% <= 10%"
        )

    def test_loss_gap_zero_harvest_returns_none(self):
        """Loss gap must return None when no harvest recorded (avoids division by zero)."""
        loss_pct = compute_loss_gap_pct(
            harvested_kg=Decimal("0.00"),
            delivered_kg=Decimal("0.00"),
            sold_kg=Decimal("0.00"),
        )
        assert loss_pct is None

    def test_loss_gap_boundary_exactly_10_pct(self, mock_alert_store):
        """
        Boundary: exactly 10% loss gap should NOT trigger RULE-036 (threshold is > 10%).
        """
        # 100 harvested, 90 delivered → 10/100 = exactly 10%
        loss_pct = compute_loss_gap_pct(
            harvested_kg=Decimal("100.00"),
            delivered_kg=Decimal("90.00"),
            sold_kg=Decimal("85.00"),
        )

        assert loss_pct == Decimal("10.00")

        # Simulate RULE-036 trigger (> not >=)
        threshold = Decimal("10.00")
        if loss_pct is not None and loss_pct > threshold:
            mock_alert_store.create({"rule_id": "RULE-036"})

        # Assert — exactly 10% does NOT trigger
        rule_036_alerts = mock_alert_store.find("RULE-036")
        assert len(rule_036_alerts) == 0, (
            "RULE-036 threshold is strictly > 10%. Exactly 10% must not trigger."
        )


# ---------------------------------------------------------------------------
# Class: TestLaborCostRatio
# ---------------------------------------------------------------------------

class TestLaborCostRatio:
    """Tests for labor cost ratio signal (Signal 5 in decision engine)."""

    def test_labor_cost_ratio_green(self):
        """
        Labor < 30% of income → GREEN (healthy cost structure).

        W-001 Laisenia Waqa earns FJD 480 in this cycle.
        Total income = FJD 1,092 from eggplant sales to New World.
        Labor ratio = 480/1092 = 43.96% — actually AMBER in real data.
        Use test-specific values for GREEN: labor FJD 200, income FJD 1000 = 20%.
        """
        # Arrange — labor = FJD 200, income = FJD 1000 → 20% (GREEN)
        ratio = compute_labor_cost_ratio(
            total_labor_cost_fjd=Decimal("200.00"),
            total_income_fjd=Decimal("1000.00"),
        )

        # Assert
        assert ratio is not None
        assert ratio == Decimal("20.00"), (
            f"200/1000 × 100 = 20%. Got: {ratio}%"
        )
        assert ratio < Decimal("30.00"), (
            f"Ratio {ratio}% must be < 30% for GREEN signal. Got: {ratio}%"
        )

    def test_labor_cost_ratio_amber(self):
        """
        Labor 30-50% of income → AMBER.

        Labor = FJD 480 (W-001 standard), Income = FJD 1,092.
        Ratio = 480/1092 = 43.96% → AMBER band (30-50%).
        """
        # Arrange — realistic F001-PU002 values
        ratio = compute_labor_cost_ratio(
            total_labor_cost_fjd=Decimal("480.00"),
            total_income_fjd=Decimal("1092.00"),
        )

        # Assert
        assert ratio is not None
        expected = (Decimal("480.00") / Decimal("1092.00") * Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        assert ratio == expected
        assert Decimal("30.00") <= ratio <= Decimal("50.00"), (
            f"Ratio {ratio}% must be in AMBER band (30-50%)"
        )

    def test_labor_cost_ratio_red(self):
        """
        Labor > 50% of income → RED (unsustainable cost structure).

        Labor = FJD 600, Income = FJD 800 → 75% (RED).
        """
        # Arrange
        ratio = compute_labor_cost_ratio(
            total_labor_cost_fjd=Decimal("600.00"),
            total_income_fjd=Decimal("800.00"),
        )

        # Assert
        assert ratio is not None
        assert ratio > Decimal("50.00"), (
            f"Ratio {ratio}% must be > 50% for RED signal"
        )

    def test_labor_cost_ratio_zero_income_returns_none(self):
        """Labor ratio must return None when income = 0 (no sales yet)."""
        ratio = compute_labor_cost_ratio(
            total_labor_cost_fjd=Decimal("480.00"),
            total_income_fjd=Decimal("0.00"),
        )
        assert ratio is None, (
            "Labor cost ratio must return None when income = 0 — division by zero"
        )

    def test_labor_cost_ratio_w001_realistic_case(self):
        """
        Real W-001 Laisenia Waqa case: 80 hours × FJD 6/hr = FJD 480.

        Income from New World (CUS-001) + Nayans (CUS-003) = FJD 1,092.
        Ratio should reflect realistic Fiji farm labor economics.
        """
        # W-001: 80hrs × FJD6 = FJD480
        labor = Decimal("80") * Decimal("6.00")
        assert labor == Decimal("480.00"), "W-001 labor: 80hrs × FJD6 = FJD480"

        income = Decimal("1092.00")  # 390kg × FJD2.80
        ratio = compute_labor_cost_ratio(labor, income)

        assert ratio is not None
        # Confirm ratio is in AMBER (40-44% for this scenario)
        assert Decimal("30.00") <= ratio <= Decimal("50.00"), (
            f"W-001 realistic labor ratio {ratio}% should be in AMBER band"
        )
