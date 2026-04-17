# FILE: 07_testing/TESTING_STRATEGY.md

# Teivaka Agri-TOS — Testing Strategy

**Platform:** Teivaka Agricultural TOS (Agri-TOS), Fiji
**Stack:** FastAPI 0.115+, Python 3.12, PostgreSQL 16 + TimescaleDB, Redis 7.2
**Last Updated:** 2026-04-07

---

## 1. Testing Philosophy

**Test the business logic thoroughly. Test integration paths critically. Do not over-mock.**

The Teivaka platform enforces hard business rules that directly affect farm profitability and food safety — rotation enforcement, chemical compliance, financial calculations, and alert deduplication. These rules must be tested against their real implementations, not mocked approximations.

### Core Principles

1. **Business logic modules get the most coverage.** The five critical services — `rotation_service`, `compliance_service`, `decision_service`, `automation_service`, `tis_service` — require minimum 80% coverage. Bugs here have direct operational consequences for Fiji farmers.

2. **Integration tests use real infrastructure.** Database tests run against real PostgreSQL (with TimescaleDB and pgvector extensions). Redis tests run against real Redis. We do not use SQLite for integration tests — SQLite cannot replicate PostgreSQL triggers, RLS policies, TimescaleDB hypertables, or pgvector cosine similarity. Using SQLite would give false confidence.

3. **External APIs are always mocked.** Twilio (WhatsApp), Anthropic Claude API, OpenAI Whisper, and Supabase Auth are mocked in all test environments. We never call real external APIs in tests — this prevents billing charges, rate limiting, and flaky tests from network conditions.

4. **Test data is realistic.** Factories use real Fiji farm IDs (F001, F002), real worker names (Laisenia Waqa, Maika Ratubaba), real currency (FJD), and real agricultural cycles. Generic placeholder data (farm1, user123, $10) is not acceptable in the Teivaka test suite.

5. **Arrange-Act-Assert structure.** Every test is structured with a clear setup section, a single action under test, and explicit assertions. Test names describe what they verify, not how.

6. **Tests must be deterministic.** No random data in tests. All dates anchored to fixed test values. All financial calculations use exact decimal arithmetic (Python `Decimal`, not `float`).

---

## 2. Coverage Targets

| Module | Minimum Coverage | Rationale |
|--------|-----------------|-----------|
| `services/rotation_service.py` | 80% | Core agronomic rule enforcement |
| `services/compliance_service.py` | 80% | Chemical/food safety — zero tolerance for gaps |
| `services/decision_service.py` | 80% | Primary farm intelligence product |
| `services/automation_service.py` | 80% | 43 rules, alert lifecycle, deduplication |
| `services/tis_service.py` | 80% | Voice/AI pipeline, multi-turn conversation |
| `services/financial_service.py` | 80% | CoKG, P&L, profit share — financial accuracy critical |
| `routers/*.py` | 60% | HTTP layer — critical paths only |
| `models/*.py` | 60% | Schema validation coverage |
| `tasks/*.py` (Celery) | 60% | Async task execution paths |
| `utils/*.py` | 50% | Helper functions |

Coverage is measured with `pytest-cov`. The CI pipeline fails if any module in the 80% group falls below its threshold. Coverage is reported per-file, not globally — a high global average cannot mask a critical service with 40% coverage.

---

## 3. Test Structure

```
07_testing/
├── TESTING_STRATEGY.md            ← This document
├── conftest.py                    ← Shared fixtures: DB, Redis, factories, mocks
├── pytest.ini                     ← pytest config (asyncio_mode, markers, etc.)
├── factories/
│   ├── __init__.py
│   ├── farm_factories.py          ← FarmFactory, ZoneFactory, ProductionUnitFactory
│   ├── cycle_factories.py         ← ProductionCycleFactory, CycleFinancialsFactory
│   ├── worker_factories.py        ← WorkerFactory, LaborAttendanceFactory
│   ├── input_factories.py         ← InputFactory, InputTransactionFactory
│   ├── financial_factories.py     ← IncomeLogFactory, CashLedgerFactory
│   ├── alert_factories.py         ← AlertFactory, AutomationRuleFactory
│   └── chemical_factories.py     ← ChemicalApplicationFactory
└── tests/
    ├── __init__.py
    ├── test_rotation_engine.py    ← All 7 rotation statuses + edge cases
    ├── test_automation_engine.py  ← All 43 rules, dedup, auto-resolution, lifecycle
    ├── test_decision_engine.py    ← All 10 signals at GREEN/AMBER/RED thresholds
    ├── test_financial.py          ← CoKG, P&L, profit share, cashflow, reconciliation
    ├── test_compliance.py         ← Chemical withholding, harvest blocking, 2-layer
    ├── test_tis_service.py        ← Voice pipeline, intent parsing, conversation context
    ├── test_labor_service.py      ← Attendance tracking, pay calculation, weekly summary
    ├── test_input_service.py      ← Stock movements, reorder alerts, balance mat view
    ├── test_api_farms.py          ← Router-level tests for /farms endpoints
    ├── test_api_cycles.py         ← Router-level tests for /cycles endpoints
    ├── test_api_alerts.py         ← Router-level tests for /alerts endpoints
    ├── test_api_decision.py       ← Router-level tests for /decision-engine endpoints
    └── test_integration_e2e.py   ← End-to-end: cycle creation → harvest → alert → WhatsApp
```

### What Each Key Test File Covers

**`test_rotation_engine.py`**
- All 7 rotation rule statuses: PREF, OK, AVOID, BLOCK, COND, OVERLAY, N/A
- Solanaceae family blocking (CRP-EGG, CRP-TOM, CRP-CAP) — 60-day rest enforcement
- Euphorbiaceae (CRP-CAS) — 180-day rest enforcement
- Cucurbitaceae (CRP-WAT, CRP-CUC) — 45-day rest enforcement
- First crop on a PU (no history) → always approved
- Sufficient rest period cases (rest met → approved)
- Insufficient rest period cases (rest not met → blocked)
- `days_short` calculation correctness: `max(0, min_rest_days - days_since_harvest)`
- Kava (CRP-KAV) special handling (4-year cycle, OVERLAY logic)
- Apiculture (LIV-API) OVERLAY status
- Forestry (FOR-TEK, FOR-SAN) N/A status
- Alternatives list populated for BLOCKED and AVOID rotations
- Override flow: override_available flag, FOUNDER-role requirement, override_log audit entry

**`test_automation_engine.py`**
- RULE-017 HarvestAlert: 7-day threshold (standard crops), 180-day threshold (CRP-KAV exception)
- RULE-012 InventoryAlert: reorder point trigger, above-threshold no-fire
- RULE-034 F002FerryBuffer: F002-specific CRITICAL alert, F001 not affected, always CRITICAL severity
- RULE-038 ChemicalCompliance: harvest blocked within WHD, allowed after WHD
- Alert deduplication via `alert_key` UNIQUE constraint (same week = no duplicate)
- Alert auto-resolution: condition clears → alert resolved, `auto_resolved=True`
- WhatsApp notification queuing for CRITICAL and HIGH severity alerts
- Multiple chemicals: most restrictive WHD applies

**`test_decision_engine.py`**
- All 10 signals at all 3 thresholds (GREEN/AMBER/RED)
- CRP-KAV exception: `DaysSinceLastHarvest` uses 180-day threshold
- Snapshot storage: all 10 signals written to `decision_signals` table
- No on-demand computation: `/decision-engine/current` returns stored snapshot only
- Historical snapshots preserved (not overwritten on new run)

**`test_financial.py`**
- CoKG formula: `(labor + inputs + other) / harvest_qty_kg`
- CoKG = NULL when harvest_qty = 0 (no division by zero)
- CoKG updates correctly when new harvest logged
- Gross margin computation using real eggplant pricing (FJD 2.80/kg)
- Farm P&L aggregation across all active cycles
- Profit share: configurable `profit_share_rate_pct`, NULL when not configured
- Related party flag on Nayans sales (CUS-003)
- 13-week cashflow forecast structure and cumulative balance
- Negative week in cashflow triggers RULE-041 alert
- Harvest reconciliation loss gap: `(harvested - delivered - sold) / harvested × 100`
- RULE-036 fires above 10% loss gap, silent below 10%

---

## 4. pytest Configuration

### `pytest.ini`

```ini
[pytest]
asyncio_mode = auto
testpaths = 07_testing/tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
markers =
    unit: Pure unit tests, no external dependencies
    integration: Tests requiring real DB/Redis
    slow: Tests taking > 2 seconds
    e2e: End-to-end tests
filterwarnings =
    error::DeprecationWarning
    ignore::PendingDeprecationWarning
```

### `asyncio_mode = auto`

All async test functions are automatically wrapped by pytest-asyncio. No `@pytest.mark.asyncio` decorator needed on individual tests. All FastAPI service calls are async — this setting is mandatory.

---

## 5. Test Database Isolation

Each test gets **transaction-level isolation**: the test opens a database connection, begins a transaction, runs the test, and rolls back at teardown. No data leaks between tests.

For tests that require schema-level isolation (e.g., TimescaleDB hypertable operations that don't support savepoints), a **fresh schema strategy** is used: a new `test_{uuid}` schema is created per test class, populated with seed data, and dropped on teardown.

### Database Fixture (in `conftest.py`)

```python
import pytest
import asyncpg
from uuid import uuid4

TEST_DB_URL = "postgresql://teivaka_test:test@localhost:5432/teivaka_test"

@pytest.fixture(scope="session")
async def db_pool():
    """Session-scoped connection pool for test database."""
    pool = await asyncpg.create_pool(TEST_DB_URL, min_size=2, max_size=10)
    yield pool
    await pool.close()

@pytest.fixture
async def db_conn(db_pool):
    """Per-test transactional isolation. Rolls back after each test."""
    async with db_pool.acquire() as conn:
        tx = conn.transaction()
        await tx.start()
        yield conn
        await tx.rollback()

@pytest.fixture
async def test_tenant_id():
    """Fixed tenant UUID for all tests — maps to F001 and F002 farms."""
    return "a1b2c3d4-0001-0001-0001-000000000001"
```

---

## 6. Test Data Strategy — Factory-Boy Factories

All test data is created via factory-boy factories. No raw INSERT SQL in test files.

Factories use realistic Fiji farm data:

```python
# factories/farm_factories.py
import factory
from factory import SubFactory
from decimal import Decimal

class FarmFactory(factory.Factory):
    class Meta:
        model = dict  # Or SQLAlchemy model when ORM is configured

    farm_id = factory.Sequence(lambda n: f"F{n:03d}")
    farm_name = factory.Iterator(["Save-A-Lot", "Viyasiyasi", "Wailevu Grove"])
    location_text = factory.Iterator(["Korovou Serua", "Kadavu Island", "Ba Province"])
    island = factory.Iterator(["Viti Levu", "Kadavu", "Viti Levu"])
    is_island_farm = factory.LazyAttribute(lambda obj: obj.island == "Kadavu")
    profit_share_rate_pct = factory.LazyFunction(lambda: Decimal("30.0"))
    timezone = "Pacific/Fiji"

class ProductionUnitFactory(factory.Factory):
    class Meta:
        model = dict

    pu_id = factory.Sequence(lambda n: f"F001-PU{n:03d}")
    farm_id = "F001"
    area_m2 = factory.Iterator([500, 1000, 750, 1200])
    soil_type = factory.Iterator(["loam", "clay_loam", "sandy_loam"])

class ProductionCycleFactory(factory.Factory):
    class Meta:
        model = dict

    cycle_id = factory.Sequence(lambda n: f"CY-F001-26-{n:03d}")
    pu_id = "F001-PU002"
    farm_id = "F001"
    production_id = "CRP-EGG"
    status = "ACTIVE"
    planting_date = factory.LazyFunction(lambda: date.today() - timedelta(days=45))
    expected_harvest_date = factory.LazyFunction(lambda: date.today() + timedelta(days=30))
```

### Seed Data for Integration Tests

Integration tests that require `shared.*` data (rotation rules, productions registry) use a shared fixture that seeds the test database once per session:

```python
@pytest.fixture(scope="session", autouse=True)
async def seed_shared_data(db_pool):
    """
    Seeds shared.productions and shared.actionable_rules for rotation tests.
    Run once per test session.
    """
    async with db_pool.acquire() as conn:
        # Seed shared.productions
        await conn.execute("""
            INSERT INTO shared.productions
              (production_id, production_name, family, category,
               min_rest_days_same_family, cycle_duration_days, inactivity_alert_days)
            VALUES
              ('CRP-EGG', 'Eggplant',  'Solanaceae',    'CRP', 60,  120,  7),
              ('CRP-TOM', 'Tomato',    'Solanaceae',    'CRP', 60,  90,   7),
              ('CRP-CAP', 'Capsicum',  'Solanaceae',    'CRP', 60,  90,   7),
              ('CRP-CAS', 'Cassava',   'Euphorbiaceae', 'CRP', 180, 365,  7),
              ('CRP-KAV', 'Kava',      'Piperaceae',    'CRP', 365, 1460, 180),
              ('FRT-PIN', 'Pineapple', 'Bromeliaceae',  'FRT', 0,   540,  7),
              ('LIV-API', 'Apiculture','N/A',           'LIV', 0,   0,    7),
              ('FOR-TEK', 'Teak',      'Lamiaceae',     'FOR', 0,   3650, 90),
              ('CRP-LBN', 'Long Bean', 'Fabaceae',      'CRP', 30,  90,   7),
              ('CRP-CAB', 'Cabbage',   'Brassicaceae',  'CRP', 45,  75,   7),
              ('CRP-WAT', 'Watermelon','Cucurbitaceae', 'CRP', 45,  90,   7),
              ('CRP-CUC', 'Cucumber',  'Cucurbitaceae', 'CRP', 45,  75,   7),
              ('CRP-SPT', 'Sweet Potato','Convolvulaceae','CRP',90,  180,  7)
            ON CONFLICT (production_id) DO NOTHING;
        """)
        # Seed key rotation rules in shared.actionable_rules
        await conn.execute("""
            INSERT INTO shared.actionable_rules
              (current_production_id, next_production_id, rule_status, min_rest_days, notes)
            VALUES
              ('CRP-EGG','CRP-EGG','BLOCK',60,'Solanaceae back-to-back blocked'),
              ('CRP-EGG','CRP-TOM','BLOCK',60,'Solanaceae family rest required'),
              ('CRP-TOM','CRP-EGG','BLOCK',60,'Solanaceae family rest required'),
              ('CRP-TOM','CRP-TOM','BLOCK',60,'Solanaceae back-to-back blocked'),
              ('CRP-EGG','CRP-CAP','BLOCK',60,'Solanaceae family rest required'),
              ('CRP-CAP','CRP-EGG','BLOCK',60,'Solanaceae family rest required'),
              ('CRP-CAS','CRP-CAS','BLOCK',180,'Euphorbiaceae long rest required'),
              ('CRP-WAT','CRP-CUC','BLOCK',45,'Cucurbitaceae family rest required'),
              ('CRP-CUC','CRP-WAT','BLOCK',45,'Cucurbitaceae family rest required'),
              ('CRP-CAB','CRP-LBN','PREF',0,'Nitrogen-fixer after heavy feeder'),
              ('CRP-CAS','CRP-SPT','OK',0,'Different families, acceptable follow'),
              ('LIV-API',NULL,'OVERLAY',0,'Apiculture co-exists with any crop'),
              ('FOR-TEK',NULL,'N/A',0,'Forestry - rotation not applicable')
            ON CONFLICT (current_production_id, next_production_id) DO NOTHING;
        """)
```

---

## 7. External API Mocking

All external API calls are intercepted using standard Python mocking. Never call real external services in tests.

### Twilio (WhatsApp) — httpx mock

```python
@pytest.fixture
def mock_twilio(httpx_mock):
    """Mock Twilio WhatsApp message sending."""
    httpx_mock.add_response(
        url="https://api.twilio.com/2010-04-01/Accounts/*/Messages.json",
        method="POST",
        json={"sid": "SM_TEST_000001", "status": "queued"},
        status_code=201,
    )
    return httpx_mock
```

### Anthropic Claude API

```python
@pytest.fixture
def mock_claude(monkeypatch):
    """Mock Anthropic Claude API for TIS tests."""
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text="Mocked Claude response for farm query.")]
    mock_client = AsyncMock()
    mock_client.messages.create = AsyncMock(return_value=mock_response)
    monkeypatch.setattr("anthropic.AsyncAnthropic", lambda **kwargs: mock_client)
    return mock_client
```

### OpenAI Whisper (voice transcription)

```python
@pytest.fixture
def mock_whisper(monkeypatch):
    """Mock OpenAI Whisper API for voice transcription tests."""
    mock_result = MagicMock()
    mock_result.text = "Check the eggplant harvest for F001-PU002"
    mock_client = MagicMock()
    mock_client.audio.transcriptions.create = MagicMock(return_value=mock_result)
    monkeypatch.setattr("openai.OpenAI", lambda **kwargs: mock_client)
    return mock_client
```

### Supabase Auth

```python
@pytest.fixture
def mock_supabase_auth(monkeypatch):
    """Mock Supabase Auth — always returns valid JWT for test tenant."""
    mock_user = MagicMock()
    mock_user.id = "test-user-founder-001"
    mock_user.user_metadata = {"role": "FOUNDER", "tenant_id": TEST_TENANT_ID}
    monkeypatch.setattr(
        "app.auth.verify_jwt_token",
        AsyncMock(return_value=mock_user)
    )
    return mock_user
```

---

## 8. Redis Fixtures

Tests that interact with Celery task dispatch or rate limiting use a real Redis instance (not a mock). The test Redis database is flushed before each test class.

```python
@pytest.fixture(scope="session")
def redis_client():
    """Real Redis connection for integration tests."""
    import redis
    client = redis.Redis(host="localhost", port=6379, db=15)  # db=15 = test DB
    yield client
    client.flushdb()
    client.close()

@pytest.fixture(autouse=True)
def flush_redis(redis_client):
    """Flush test Redis before each test to ensure clean state."""
    redis_client.flushdb()
```

---

## 9. CI/CD Strategy

### GitHub Actions (or equivalent CI)

- Tests run on **every pull request** before merge.
- Required status check: all tests must pass. PRs cannot be merged if tests are failing.
- Coverage report generated and stored as CI artifact.
- If coverage for any 80%-target module drops below threshold, the CI step fails.

### CI Pipeline Steps

```yaml
# Simplified CI pipeline
steps:
  - name: Start test PostgreSQL + TimescaleDB
    run: docker compose -f docker-compose.test.yml up -d postgres

  - name: Start test Redis
    run: docker compose -f docker-compose.test.yml up -d redis

  - name: Wait for DB
    run: ./scripts/wait-for-db.sh

  - name: Run Alembic migrations on test DB
    run: alembic upgrade head

  - name: Seed shared test data
    run: python scripts/seed_test_data.py

  - name: Run tests with coverage
    run: |
      pytest 07_testing/tests/ \
        --cov=app \
        --cov-report=xml \
        --cov-fail-under=75 \
        -v \
        --timeout=60

  - name: Check per-module coverage thresholds
    run: python scripts/check_coverage_thresholds.py coverage.xml
```

### Test Environment Variables

```bash
TEST_DATABASE_URL=postgresql://teivaka_test:test@localhost:5432/teivaka_test
TEST_REDIS_URL=redis://localhost:6379/15
TWILIO_AUTH_TOKEN=test_token_not_real
ANTHROPIC_API_KEY=test_key_not_real
OPENAI_API_KEY=test_key_not_real
SUPABASE_URL=http://localhost:54321
FIJI_TIMEZONE=Pacific/Fiji
```

---

## 10. Performance Tests

Performance tests are marked `@pytest.mark.slow` and run separately from the standard test suite (not in every CI run — they run nightly).

### Required Performance Thresholds

| Operation | Threshold | Rationale |
|-----------|-----------|-----------|
| `validate_rotation()` single call | < 100ms | Called on every cycle creation, must be fast |
| Decision engine full run (1 farm) | < 5s | Runs daily for all farms, must complete in batch window |
| Voice command pipeline end-to-end | < 5s | User-facing WhatsApp latency |
| Alert deduplication check | < 50ms | Called for every alert candidate |
| `input_balance` mat view query | < 200ms | Used in inventory checks every 30min |
| CoKG computation via trigger | < 100ms | Called on every harvest INSERT |

### Performance Test Example

```python
# In tests/test_performance.py
import time
import pytest

@pytest.mark.slow
async def test_rotation_validation_under_100ms(db_conn, seed_shared_data):
    """
    validate_rotation() must complete in under 100ms.
    Uses idx_rotation_lookup composite index on shared.actionable_rules.
    """
    from services.rotation_service import validate_rotation

    start = time.perf_counter()
    result = await validate_rotation(
        db_conn,
        current_production_id="CRP-EGG",
        next_production_id="CRP-EGG",
        days_since_harvest=10,
        pu_id="F001-PU002",
    )
    elapsed_ms = (time.perf_counter() - start) * 1000

    assert elapsed_ms < 100, (
        f"validate_rotation() took {elapsed_ms:.1f}ms — must be < 100ms. "
        f"Check idx_rotation_lookup index on shared.actionable_rules."
    )

@pytest.mark.slow
async def test_decision_engine_under_5_seconds(db_conn, seed_farm_data):
    """
    compute_all_decision_signals() for a single farm must complete under 5s.
    """
    from services.decision_service import compute_all_decision_signals

    start = time.perf_counter()
    result = await compute_all_decision_signals(db_conn, farm_id="F001")
    elapsed = time.perf_counter() - start

    assert elapsed < 5.0, (
        f"Decision engine took {elapsed:.2f}s for F001 — must be < 5s."
    )
    assert len(result) == 10, "All 10 signals must be computed"

@pytest.mark.slow
async def test_voice_pipeline_under_5_seconds(mock_whisper, mock_claude, db_conn):
    """
    Full voice pipeline: receive audio → transcribe → parse intent → act → respond.
    Must complete end-to-end in under 5s.
    """
    from services.tis_service import process_voice_message

    test_audio_bytes = b"fake_audio_data"

    start = time.perf_counter()
    result = await process_voice_message(
        audio_data=test_audio_bytes,
        from_phone="+6799XXXXXX",
        farm_id="F001",
        db_conn=db_conn,
    )
    elapsed = time.perf_counter() - start

    assert elapsed < 5.0, (
        f"Voice pipeline took {elapsed:.2f}s — must be < 5s for WhatsApp UX."
    )
    assert result.get("response_text") is not None
```

---

## 11. Special Test Cases — Fiji-Specific Rules

These rules require explicit test coverage due to their domain specificity:

### CRP-KAV (Kava) — 4-Year Cycle Exception
- `inactivity_alert_days = 180` (not 7 like all other crops)
- Decision signal `DaysSinceLastHarvest` must use 180-day threshold for CRP-KAV
- RULE-017 HarvestAlert must use 180-day threshold for CRP-KAV
- Must have dedicated tests in both `test_automation_engine.py` and `test_decision_engine.py`

### F002 Kadavu Island — Ferry Dependency (RULE-034)
- `farms.is_island_farm = true` for F002
- RULE-034 fires only for island farms
- Severity always CRITICAL (supplies cannot be obtained quickly)
- References SUP-012 Sea Master Shipping in alert body
- Must have tests confirming F001 (mainland) is NOT affected by RULE-034

### Related Party Sales (CUS-003 to CUS-007 Nayans)
- `income_log.is_related_party = true` for Nayans sales
- Profit share calculations must be tested with related-party context
- Revenue from related parties must be identifiable separately in P&L

### Alert Deduplication — Weekly Window
- `alert_key` format: `{rule_id}:{pu_id}:{week_start_date}` (ISO Monday)
- Same condition firing twice in the same week: only one alert created
- New week: new alert allowed even for same ongoing condition
- Must test both scenarios

### Chemical Compliance — 2-Layer Enforcement
- Test that DB trigger fires correctly (layer 1)
- Test that API-level compliance_service also blocks (layer 2)
- Test that both layers produce consistent error messaging
- Test most-restrictive-wins for multiple simultaneous chemicals

---

## 12. Test Maintenance Rules

1. **When adding a new automation rule:** Add tests to `test_automation_engine.py` for the rule's fire condition, non-fire condition, and auto-resolution (if applicable).

2. **When adding a new rotation production type:** Add at least 3 rotation tests — BLOCK case, PREF/OK case, and alternatives check.

3. **When modifying a financial formula:** Update the exact expected values in `test_financial.py` tests. Never update expected values to match wrong outputs.

4. **When adding a new decision signal:** Add GREEN/AMBER/RED threshold tests to `test_decision_engine.py`.

5. **Factory updates:** When adding a new model field, update the corresponding factory to include realistic Fiji data for that field.

6. **Do not** add `# type: ignore` or `# noqa` comments to suppress test failures. Fix the underlying issue.
