# FILE: 03_backend/MODELS.md

# Teivaka TFOS Backend — Pydantic Models Reference

All Pydantic models used as request/response schemas in the TFOS API. Models live in `models/schemas/`. This document provides the complete class definitions for every domain.

---

## SECTION 1 — ENUMS

```python
# models/schemas/common.py
from enum import Enum


class SubscriptionTier(str, Enum):
    FREE = "free"
    BASIC = "basic"
    PREMIUM = "premium"
    CUSTOM = "custom"


class CycleStatus(str, Enum):
    PLANNED = "planned"
    ACTIVE = "active"
    HARVESTING = "harvesting"
    CLOSING = "closing"
    CLOSED = "closed"
    FAILED = "failed"


class AlertSeverity(str, Enum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class AlertStatus(str, Enum):
    OPEN = "open"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class RAGStatus(str, Enum):
    GREEN = "GREEN"
    AMBER = "AMBER"
    RED = "RED"


class TaskPriority(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TaskStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    OVERDUE = "overdue"


class UserRole(str, Enum):
    FOUNDER = "FOUNDER"
    MANAGER = "MANAGER"
    WORKER = "WORKER"
    VIEWER = "VIEWER"


class RotationStatus(str, Enum):
    PREF = "PREF"
    OK = "OK"
    AVOID = "AVOID"
    BLOCK = "BLOCK"
    COND = "COND"
    OVERLAY = "OVERLAY"
    NA = "N/A"


class EnforcementDecision(str, Enum):
    APPROVED = "APPROVED"
    BLOCKED = "BLOCKED"
    OVERRIDE_REQUIRED = "OVERRIDE_REQUIRED"


class TISModule(str, Enum):
    KNOWLEDGE_BROKER = "knowledge_broker"
    OPERATIONAL_INTERPRETER = "operational_interpreter"
    COMMAND_EXECUTOR = "command_executor"


class VoiceCommandType(str, Enum):
    LOG_LABOR = "LOG_LABOR"
    LOG_HARVEST = "LOG_HARVEST"
    LOG_INPUT = "LOG_INPUT"
    LOG_CASH = "LOG_CASH"
    LOG_WEATHER = "LOG_WEATHER"
    CHECK_TASKS = "CHECK_TASKS"
    CHECK_ALERTS = "CHECK_ALERTS"
    CHECK_FINANCIALS = "CHECK_FINANCIALS"
    CREATE_CYCLE = "CREATE_CYCLE"
    CHECK_STOCK = "CHECK_STOCK"
    GET_PROTOCOL = "GET_PROTOCOL"
    REPORT_INCIDENT = "REPORT_INCIDENT"


class PaymentMethod(str, Enum):
    CASH = "cash"
    CREDIT = "credit"
    BANK_TRANSFER = "bank_transfer"


class EmploymentType(str, Enum):
    PERMANENT = "permanent"
    CASUAL = "casual"
    CONTRACT = "contract"


class LoggedVia(str, Enum):
    MANUAL = "manual"
    VOICE = "voice"
    TIS = "tis"
    SYNC = "sync"
```

---

## SECTION 2 — BASE RESPONSE MODELS

```python
# models/schemas/common.py (continued)
from typing import Any, Dict, Optional, List
from pydantic import BaseModel


class PaginationMeta(BaseModel):
    page: int
    limit: int
    total: int
    total_pages: int

    model_config = {"from_attributes": True}


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None


class BaseResponse(BaseModel):
    success: bool


class SuccessResponse(BaseResponse):
    success: bool = True
    data: Any
    meta: Optional[PaginationMeta] = None


class ErrorResponse(BaseResponse):
    success: bool = False
    error: ErrorDetail


class IDResponse(BaseModel):
    """Minimal response returning just the created resource ID."""
    id: str
    success: bool = True
```

---

## SECTION 3 — DOMAIN MODELS

---

### 3.1 Auth

```python
# models/schemas/auth.py
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from models.schemas.common import UserRole
import re


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    model_config = {"json_schema_extra": {
        "example": {
            "email": "cody@teivaka.com",
            "password": "SecurePass123!"
        }
    }}


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    phone: Optional[str] = None
    farm_name: str
    subscription_tier: str = "FREE"

    @field_validator("phone")
    @classmethod
    def validate_fiji_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        # Fiji phone: +679 followed by 7 digits
        pattern = r"^\+679\d{7}$"
        if not re.match(pattern, v):
            raise ValueError("Phone must be in Fiji format: +679XXXXXXX (7 digits after +679)")
        return v

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    user: "UserResponse"


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("New password must be at least 8 characters")
        return v


class UserResponse(BaseModel):
    id: str
    tenant_id: str
    email: str
    full_name: str
    phone: Optional[str] = None
    role: UserRole
    is_active: bool
    subscription_tier: str
    created_at: str

    model_config = {"from_attributes": True}
```

---

### 3.2 Farm

```python
# models/schemas/farms.py
from pydantic import BaseModel, field_validator
from typing import Optional
from decimal import Decimal


class FarmCreate(BaseModel):
    farm_code: str            # e.g. "F001", "F002"
    farm_name: str            # e.g. "Save-A-Lot", "Viyasiyasi"
    location: str             # e.g. "Korovou Serua"
    island: str               # e.g. "Viti Levu", "Kadavu"
    area_acres: Decimal
    has_ferry_dependency: bool = False  # True for F002 Kadavu

    @field_validator("area_acres")
    @classmethod
    def validate_area(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("area_acres must be greater than 0")
        return v

    model_config = {"json_schema_extra": {
        "example": {
            "farm_code": "F001",
            "farm_name": "Save-A-Lot",
            "location": "Korovou Serua",
            "island": "Viti Levu",
            "area_acres": "12.5",
            "has_ferry_dependency": False
        }
    }}


class FarmUpdate(BaseModel):
    farm_name: Optional[str] = None
    location: Optional[str] = None
    island: Optional[str] = None
    area_acres: Optional[Decimal] = None
    has_ferry_dependency: Optional[bool] = None

    @field_validator("area_acres")
    @classmethod
    def validate_area(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and v <= 0:
            raise ValueError("area_acres must be greater than 0")
        return v


class FarmResponse(BaseModel):
    id: str
    farm_code: str
    farm_name: str
    location: str
    island: str
    area_acres: Decimal
    has_ferry_dependency: bool
    subscription_tier: str
    active_pu_count: int
    active_cycle_count: int
    open_alert_count: int
    expansion_readiness_score: Optional[float] = None  # 0.0 to 10.0
    created_at: str

    model_config = {"from_attributes": True}


class FarmListItem(BaseModel):
    id: str
    farm_code: str
    farm_name: str
    island: str
    active_pu_count: int
    open_alert_count: int
    subscription_tier: str

    model_config = {"from_attributes": True}
```

---

### 3.3 Zone

```python
# models/schemas/farms.py (continued)
class ZoneCreate(BaseModel):
    farm_id: str
    zone_name: str
    area_acres: Decimal
    soil_type: Optional[str] = None   # e.g. "clay loam", "volcanic"
    irrigation_type: Optional[str] = None  # e.g. "drip", "sprinkler", "rain-fed"

    @field_validator("area_acres")
    @classmethod
    def validate_area(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("area_acres must be greater than 0")
        return v


class ZoneUpdate(BaseModel):
    zone_name: Optional[str] = None
    area_acres: Optional[Decimal] = None
    soil_type: Optional[str] = None
    irrigation_type: Optional[str] = None

    @field_validator("area_acres")
    @classmethod
    def validate_area(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and v <= 0:
            raise ValueError("area_acres must be greater than 0")
        return v


class ZoneResponse(BaseModel):
    id: str
    farm_id: str
    zone_name: str
    area_acres: Decimal
    soil_type: Optional[str] = None
    irrigation_type: Optional[str] = None
    production_unit_count: int
    created_at: str

    model_config = {"from_attributes": True}
```

---

### 3.4 Production Unit (PU)

```python
# models/schemas/farms.py (continued)
from typing import Optional, Dict, Any


class PUCreate(BaseModel):
    farm_id: str
    zone_id: Optional[str] = None
    pu_code: str        # e.g. "F001-PU001"
    pu_name: str        # e.g. "Block A North"
    area_acres: Decimal
    notes: Optional[str] = None

    @field_validator("area_acres")
    @classmethod
    def validate_area(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("area_acres must be greater than 0")
        return v


class PUUpdate(BaseModel):
    pu_name: Optional[str] = None
    zone_id: Optional[str] = None
    area_acres: Optional[Decimal] = None
    notes: Optional[str] = None

    @field_validator("area_acres")
    @classmethod
    def validate_area(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and v <= 0:
            raise ValueError("area_acres must be greater than 0")
        return v


class PUCurrentCycleSummary(BaseModel):
    """Lightweight summary of the active cycle on a PU."""
    cycle_id: str
    production_name: str
    production_id: str
    cycle_status: str
    planting_date: str
    days_since_planting: int
    cogk_fjd: Optional[Decimal] = None  # None if no harvests yet
    last_harvest_date: Optional[str] = None
    days_since_harvest: Optional[int] = None


class PUResponse(BaseModel):
    id: str
    farm_id: str
    zone_id: Optional[str] = None
    pu_code: str
    pu_name: str
    area_acres: Decimal
    notes: Optional[str] = None
    current_cycle: Optional[PUCurrentCycleSummary] = None
    created_at: str

    model_config = {"from_attributes": True}


class PUListItem(BaseModel):
    id: str
    pu_code: str
    pu_name: str
    farm_id: str
    area_acres: Decimal
    has_active_cycle: bool
    current_production_name: Optional[str] = None
    cogk_fjd: Optional[Decimal] = None

    model_config = {"from_attributes": True}
```

---

### 3.5 Production Cycle

```python
# models/schemas/cycles.py
from pydantic import BaseModel, field_validator
from typing import Optional, List, Dict, Any
from decimal import Decimal
from datetime import date, datetime
from models.schemas.common import CycleStatus, LoggedVia, EnforcementDecision, RotationStatus


class RotationValidationResult(BaseModel):
    """Embedded in CycleCreate response — result of pre-creation rotation check."""
    allowed: bool
    enforcement_decision: EnforcementDecision
    rule_status: RotationStatus
    min_rest_days: int
    days_short: int
    days_since_last_harvest: int
    rotation_key: str                     # e.g. "CRP-EGG:CRP-TOM"
    current_production_id: Optional[str] = None
    proposed_production_id: str
    previous_production_name: Optional[str] = None
    proposed_production_name: str
    alternatives: List[Dict[str, Any]] = []
    override_available: bool
    validation_timestamp: datetime


class CycleCreate(BaseModel):
    pu_id: str
    production_id: str
    planting_date: date
    area_planted_acres: Decimal
    expected_harvest_start: Optional[date] = None
    notes: Optional[str] = None
    logged_via: LoggedVia = LoggedVia.MANUAL
    # If the rotation check returned BLOCKED, the UI must send override_approved=True
    # (only valid if a CycleCreationGate with override_approved status exists)
    override_approved: bool = False
    rotation_validation_result: Optional[RotationValidationResult] = None

    @field_validator("planting_date")
    @classmethod
    def validate_planting_date(cls, v: date) -> date:
        from datetime import date as date_type
        today = date_type.today()
        delta = (v - today).days
        if delta > 30:
            raise ValueError("planting_date cannot be more than 30 days in the future")
        return v

    @field_validator("area_planted_acres")
    @classmethod
    def validate_area(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("area_planted_acres must be greater than 0")
        return v


class CycleUpdate(BaseModel):
    cycle_status: Optional[CycleStatus] = None
    expected_harvest_start: Optional[date] = None
    actual_harvest_end: Optional[date] = None
    area_planted_acres: Optional[Decimal] = None
    notes: Optional[str] = None

    @field_validator("area_planted_acres")
    @classmethod
    def validate_area(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and v <= 0:
            raise ValueError("area_planted_acres must be greater than 0")
        return v


class CycleResponse(BaseModel):
    # CoKG is the PRIMARY metric — always first field
    cogk_fjd: Optional[Decimal] = None       # Cost of Goods per Kilogram (FJD)
    gross_margin_pct: Optional[float] = None  # Gross margin percentage
    total_revenue_fjd: Optional[Decimal] = None
    total_cost_fjd: Optional[Decimal] = None

    # Core identity
    id: str
    pu_id: str
    pu_code: str
    pu_name: str
    farm_id: str
    production_id: str
    production_name: str

    # Cycle data
    cycle_status: CycleStatus
    planting_date: date
    expected_harvest_start: Optional[date] = None
    actual_harvest_end: Optional[date] = None
    area_planted_acres: Decimal
    days_active: int

    # Harvest summary
    total_harvest_kg: Optional[Decimal] = None
    harvest_count: int = 0
    last_harvest_date: Optional[date] = None
    days_since_last_harvest: Optional[int] = None

    # Compliance
    chemical_compliance_status: Optional[str] = None  # "clear" | "blocked" | "pending_check"

    # Rotation
    rotation_override: bool = False
    rotation_override_reason: Optional[str] = None

    logged_via: LoggedVia
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CycleListItem(BaseModel):
    """Lightweight version for list views."""
    id: str
    pu_code: str
    production_name: str
    cycle_status: CycleStatus
    planting_date: date
    days_active: int
    cogk_fjd: Optional[Decimal] = None
    total_harvest_kg: Optional[Decimal] = None

    model_config = {"from_attributes": True}
```

---

### 3.6 Field Event

```python
# models/schemas/operations.py
from pydantic import BaseModel, field_validator
from typing import Optional
from decimal import Decimal
from datetime import date, datetime
from models.schemas.common import LoggedVia


class EventCreate(BaseModel):
    cycle_id: str
    pu_id: str
    event_type: str  # "planting_note", "weeding", "fertilizer", "spray", "pest_scouting", "observation"
    event_date: date
    description: str
    # Chemical application fields (required when event_type = "spray")
    chemical_name: Optional[str] = None
    whd_days: Optional[int] = None   # Withholding period in days
    quantity_used: Optional[Decimal] = None
    unit: Optional[str] = None  # "L", "kg", "g"
    pest_identified: Optional[str] = None  # For pest_scouting events
    logged_via: LoggedVia = LoggedVia.MANUAL

    @field_validator("event_date")
    @classmethod
    def validate_event_date(cls, v: date) -> date:
        from datetime import date as date_type
        today = date_type.today()
        if (v - today).days > 1:
            raise ValueError("event_date cannot be in the future (max 1 day ahead for timezone tolerance)")
        return v


class EventUpdate(BaseModel):
    event_type: Optional[str] = None
    event_date: Optional[date] = None
    description: Optional[str] = None
    chemical_name: Optional[str] = None
    whd_days: Optional[int] = None
    quantity_used: Optional[Decimal] = None
    unit: Optional[str] = None
    pest_identified: Optional[str] = None


class EventResponse(BaseModel):
    id: str
    cycle_id: str
    pu_id: str
    event_type: str
    event_date: date
    description: str
    chemical_name: Optional[str] = None
    whd_days: Optional[int] = None
    quantity_used: Optional[Decimal] = None
    unit: Optional[str] = None
    pest_identified: Optional[str] = None
    safe_harvest_date: Optional[date] = None  # Computed: event_date + whd_days
    logged_by: str
    logged_via: LoggedVia
    created_at: datetime

    model_config = {"from_attributes": True}


class VoiceEventCreate(BaseModel):
    """Used by TIS Command Executor when creating events via voice command."""
    cycle_id: str
    pu_id: str
    event_type: str
    event_date: date
    description: str
    chemical_name: Optional[str] = None
    whd_days: Optional[int] = None
    quantity_used: Optional[Decimal] = None
    unit: Optional[str] = None
    voice_log_id: str   # Reference to tis_voice_logs record
    raw_transcript: str  # Original Whisper transcript for audit
    logged_via: LoggedVia = LoggedVia.VOICE
```

---

### 3.7 Harvest Log

```python
# models/schemas/operations.py (continued)
class ComplianceStatus(str, Enum):
    CLEAR = "clear"
    BLOCKED = "blocked"
    OVERRIDE = "override"  # Harvested despite block (FOUNDER approved)


class HarvestCreate(BaseModel):
    cycle_id: str
    pu_id: str
    harvest_date: date
    qty_kg: Decimal
    grade: Optional[str] = None     # e.g. "A", "B", "export"
    price_per_kg_fjd: Decimal
    buyer_id: Optional[str] = None  # customer_id reference
    notes: Optional[str] = None
    logged_via: LoggedVia = LoggedVia.MANUAL

    # Auto-check defaults True — compliance check runs automatically before insert
    # Set force=True to bypass compliance block (FOUNDER only, adds to override log)
    chemical_compliance_auto_check: bool = True
    force_compliance_override: bool = False

    @field_validator("qty_kg")
    @classmethod
    def validate_qty(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("qty_kg must be greater than 0")
        return v

    @field_validator("price_per_kg_fjd")
    @classmethod
    def validate_price(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("price_per_kg_fjd must be >= 0")
        return v

    @field_validator("harvest_date")
    @classmethod
    def validate_harvest_date(cls, v: date) -> date:
        from datetime import date as date_type
        today = date_type.today()
        if (v - today).days > 1:
            raise ValueError("harvest_date cannot be in the future")
        return v

    model_config = {"json_schema_extra": {
        "example": {
            "cycle_id": "cyc-001",
            "pu_id": "F001-PU001",
            "harvest_date": "2025-04-07",
            "qty_kg": "125.5",
            "grade": "A",
            "price_per_kg_fjd": "2.80",
            "buyer_id": "cust-001",
            "chemical_compliance_auto_check": True,
            "force_compliance_override": False
        }
    }}


class BlockingChemical(BaseModel):
    chemical_name: str
    application_date: date
    whd_days: int
    safe_harvest_date: date
    days_remaining: int


class HarvestResponse(BaseModel):
    id: str
    cycle_id: str
    pu_id: str
    harvest_date: date
    qty_kg: Decimal
    grade: Optional[str] = None
    price_per_kg_fjd: Decimal
    total_value_fjd: Decimal          # Computed: qty_kg * price_per_kg_fjd
    buyer_id: Optional[str] = None
    buyer_name: Optional[str] = None  # Joined from customers table
    compliance_status: ComplianceStatus
    blocking_chemicals: List[BlockingChemical] = []  # Non-empty if compliance_status = "blocked"
    notes: Optional[str] = None
    logged_via: LoggedVia
    logged_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


class HarvestSummary(BaseModel):
    """Aggregated harvest summary for a cycle — used in cycle detail view."""
    cycle_id: str
    total_harvests: int
    total_qty_kg: Decimal
    total_value_fjd: Decimal
    avg_price_per_kg_fjd: Decimal
    first_harvest_date: Optional[date] = None
    last_harvest_date: Optional[date] = None
    days_since_last_harvest: Optional[int] = None
    compliance_status: str  # "clear" | "blocked" | "mixed"
```

---

### 3.8 Income Log

```python
# models/schemas/operations.py (continued)
class IncomeCreate(BaseModel):
    cycle_id: str
    pu_id: str
    income_date: date
    amount_fjd: Decimal
    income_type: str  # "harvest_sale", "advance_payment", "subsidy", "other"
    reference: Optional[str] = None  # Invoice or receipt number
    notes: Optional[str] = None
    logged_via: LoggedVia = LoggedVia.MANUAL

    @field_validator("amount_fjd")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("amount_fjd must be greater than 0")
        return v


class IncomeResponse(BaseModel):
    id: str
    cycle_id: str
    pu_id: str
    income_date: date
    amount_fjd: Decimal
    income_type: str
    reference: Optional[str] = None
    notes: Optional[str] = None
    logged_via: LoggedVia
    logged_by: str
    created_at: datetime

    model_config = {"from_attributes": True}
```

---

### 3.9 Labor Attendance

```python
# models/schemas/operations.py (continued)
class LaborCreate(BaseModel):
    farm_id: str
    worker_id: str     # e.g. "W-001", "W-002"
    attendance_date: date
    hours_worked: float
    task_description: str
    rate_fjd: Decimal  # Daily or hourly rate depending on worker type
    notes: Optional[str] = None
    logged_via: LoggedVia = LoggedVia.MANUAL

    @field_validator("hours_worked")
    @classmethod
    def validate_hours(cls, v: float) -> float:
        if v < 0.5 or v > 16:
            raise ValueError("hours_worked must be between 0.5 and 16")
        return v

    @field_validator("rate_fjd")
    @classmethod
    def validate_rate(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("rate_fjd must be >= 0")
        return v


class LaborResponse(BaseModel):
    id: str
    farm_id: str
    worker_id: str
    worker_name: str    # Joined from workers table
    attendance_date: date
    hours_worked: float
    task_description: str
    rate_fjd: Decimal
    total_cost_fjd: Decimal   # Computed: hours_worked * rate_fjd (if hourly) or rate_fjd (if daily)
    notes: Optional[str] = None
    logged_via: LoggedVia
    logged_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


class LaborWeeklySummary(BaseModel):
    """Aggregated labor summary per worker per week."""
    farm_id: str
    week_start: date
    worker_id: str
    worker_name: str
    employment_type: str
    days_attended: int
    total_hours: float
    total_cost_fjd: Decimal
    task_types: List[str]    # Distinct task descriptions that week
```

---

### 3.10 Weather Log

```python
# models/schemas/operations.py (continued)
class WeatherCreate(BaseModel):
    farm_id: str
    log_date: date
    rainfall_mm: Optional[float] = None
    temp_min_c: Optional[float] = None
    temp_max_c: Optional[float] = None
    wind_speed_kmh: Optional[float] = None
    notes: Optional[str] = None
    logged_via: LoggedVia = LoggedVia.MANUAL

    @field_validator("rainfall_mm")
    @classmethod
    def validate_rainfall(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v < 0:
            raise ValueError("rainfall_mm cannot be negative")
        return v

    @field_validator("temp_min_c", "temp_max_c")
    @classmethod
    def validate_temp(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and (v < -10 or v > 60):
            raise ValueError("Temperature out of plausible range (-10 to 60°C)")
        return v


class WeatherResponse(BaseModel):
    id: str
    farm_id: str
    log_date: date
    rainfall_mm: Optional[float] = None
    temp_min_c: Optional[float] = None
    temp_max_c: Optional[float] = None
    wind_speed_kmh: Optional[float] = None
    notes: Optional[str] = None
    logged_via: LoggedVia
    logged_by: str
    created_at: datetime

    model_config = {"from_attributes": True}
```

---

### 3.11 Input Inventory and Stock Status

```python
# models/schemas/financial.py
from pydantic import BaseModel, field_validator
from typing import Optional, List
from decimal import Decimal
from datetime import date, datetime
from models.schemas.common import LoggedVia


class InputCreate(BaseModel):
    farm_id: str
    input_name: str
    input_type: str   # "fertilizer", "pesticide", "seed", "fuel", "packaging", "other"
    unit: str         # "kg", "L", "bags", "bottles"
    current_stock: Decimal = Decimal("0")
    reorder_point: Decimal
    unit_cost_fjd: Decimal
    supplier_id: Optional[str] = None
    lead_time_days: int = 3
    notes: Optional[str] = None

    @field_validator("reorder_point", "unit_cost_fjd")
    @classmethod
    def validate_non_negative(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("Value must be >= 0")
        return v


class InputUpdate(BaseModel):
    input_name: Optional[str] = None
    input_type: Optional[str] = None
    unit: Optional[str] = None
    reorder_point: Optional[Decimal] = None
    unit_cost_fjd: Optional[Decimal] = None
    supplier_id: Optional[str] = None
    lead_time_days: Optional[int] = None
    notes: Optional[str] = None


class StockStatus(BaseModel):
    """Stock status for an input item — attached to InputResponse."""
    current_stock: Decimal
    reorder_point: Decimal
    unit: str
    is_low: bool                      # current_stock <= reorder_point
    days_remaining: Optional[int] = None  # current_stock / avg_daily_usage; None if no usage history
    rag_status: str                   # "GREEN" | "AMBER" | "RED"
    # GREEN: current_stock > reorder_point * 1.5
    # AMBER: reorder_point < current_stock <= reorder_point * 1.5
    # RED: current_stock <= reorder_point


class InputResponse(BaseModel):
    id: str
    farm_id: str
    input_name: str
    input_type: str
    unit: str
    current_stock: Decimal
    reorder_point: Decimal
    unit_cost_fjd: Decimal
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    lead_time_days: int
    notes: Optional[str] = None
    stock_status: StockStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class InputTransactionCreate(BaseModel):
    input_id: str
    farm_id: str
    transaction_date: date
    transaction_type: str   # "purchase" | "usage" | "adjustment" | "wastage"
    qty_change: Decimal     # Positive for purchase/adjustment in, negative for usage/wastage
    cost_fjd: Optional[Decimal] = None  # Required for purchase transactions
    notes: Optional[str] = None
    logged_via: LoggedVia = LoggedVia.MANUAL
```

---

### 3.12 Cycle Financials (CoKG First)

```python
# models/schemas/financial.py (continued)

class CostBreakdown(BaseModel):
    total_labor_cost_fjd: Decimal
    total_input_cost_fjd: Decimal
    total_other_cost_fjd: Decimal
    labor_pct: float   # Labor cost as % of total cost
    input_pct: float   # Input cost as % of total cost
    other_pct: float   # Other cost as % of total cost


class CycleFinancialsResponse(BaseModel):
    # CoKG is ALWAYS the first field — it is the primary metric for TFOS
    cogk_fjd: Optional[Decimal] = None
    # Formula: (total_labor_cost + total_input_cost + total_other_cost) / total_harvest_qty_kg
    # None if no harvests have been logged yet

    gross_margin_pct: Optional[float] = None
    # Formula: (total_revenue - total_cost) / total_revenue * 100
    # None if no revenue logged yet

    total_revenue_fjd: Decimal
    total_cost_fjd: Decimal
    gross_margin_fjd: Optional[Decimal] = None  # total_revenue - total_cost

    # Reference
    cycle_id: str
    pu_id: str
    pu_code: str
    production_name: str
    farm_id: str

    # Harvest totals
    total_harvest_kg: Optional[Decimal] = None
    harvest_count: int = 0

    # Cost breakdown
    cost_breakdown: CostBreakdown
    computed_at: datetime

    model_config = {"from_attributes": True}
```

---

### 3.13 Farm P&L and Profit Share

```python
# models/schemas/financial.py (continued)

class CycleFinancialSummary(BaseModel):
    cycle_id: str
    production_name: str
    pu_code: str
    cogk_fjd: Optional[Decimal] = None
    total_revenue_fjd: Decimal
    total_cost_fjd: Decimal
    gross_margin_fjd: Optional[Decimal] = None
    gross_margin_pct: Optional[float] = None


class FarmPnLResponse(BaseModel):
    farm_id: str
    farm_name: str
    period: str   # e.g. "2025-Q1", "2025-04", "2025"

    # Top-line figures
    total_revenue_fjd: Decimal
    total_labor_cost_fjd: Decimal
    total_input_cost_fjd: Decimal
    total_other_cost_fjd: Decimal
    total_cost_fjd: Decimal
    net_profit_fjd: Decimal
    net_margin_pct: float

    # Per-cycle breakdown
    cycles: List[CycleFinancialSummary]

    # Benchmark
    best_cogk_cycle: Optional[str] = None   # cycle_id with lowest CoKG
    worst_cogk_cycle: Optional[str] = None  # cycle_id with highest CoKG
    avg_cogk_fjd: Optional[Decimal] = None


class ProfitShareResponse(BaseModel):
    farm_id: str
    period_month: str  # e.g. "2025-04"

    base_profit_fjd: Decimal

    # Nayan's share (farm owner)
    nayans_share_pct: float    # Agreed percentage for Nayan Bhindra (farm owner)
    nayans_share_fjd: Decimal  # Computed: base_profit_fjd * nayans_share_pct / 100

    # Teivaka platform cut
    teivaka_cut_pct: float     # Teivaka's agreed percentage
    teivaka_cut_fjd: Decimal   # Computed: base_profit_fjd * teivaka_cut_pct / 100

    remainder_fjd: Decimal     # What remains after distributions
    computed_at: datetime

    model_config = {"from_attributes": True}
```

---

### 3.14 Worker

```python
# models/schemas/operations.py (continued)
import re


class WorkerCreate(BaseModel):
    farm_id: str
    worker_code: str          # e.g. "W-001", "W-002"
    full_name: str
    employment_type: EmploymentType
    phone: Optional[str] = None
    daily_rate_fjd: Decimal
    joined_date: date
    notes: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def validate_fiji_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        pattern = r"^\+679\d{7}$"
        if not re.match(pattern, v):
            raise ValueError("Phone must be in Fiji format: +679XXXXXXX (7 digits after +679)")
        return v

    @field_validator("daily_rate_fjd")
    @classmethod
    def validate_rate(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("daily_rate_fjd must be >= 0")
        return v


class WorkerUpdate(BaseModel):
    full_name: Optional[str] = None
    employment_type: Optional[EmploymentType] = None
    phone: Optional[str] = None
    daily_rate_fjd: Optional[Decimal] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def validate_fiji_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        pattern = r"^\+679\d{7}$"
        if not re.match(pattern, v):
            raise ValueError("Phone must be in Fiji format: +679XXXXXXX (7 digits after +679)")
        return v


class WorkerResponse(BaseModel):
    id: str
    farm_id: str
    worker_code: str
    full_name: str
    employment_type: EmploymentType
    phone: Optional[str] = None
    daily_rate_fjd: Decimal
    is_active: bool
    joined_date: date
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkerPerformanceSummary(BaseModel):
    """Performance metrics from materialized view — last N weeks."""
    worker_id: str
    worker_code: str
    worker_name: str
    period_weeks: int
    total_days_attended: int
    total_hours_worked: float
    total_cost_fjd: Decimal
    avg_hours_per_day: float
    attendance_rate_pct: float    # days_attended / expected_working_days * 100
    most_common_task: Optional[str] = None
    last_attendance_date: Optional[date] = None
    days_since_last_attendance: Optional[int] = None
    is_inactive_alert: bool = False  # True if days_since_last_attendance > 14 (permanent workers)
```

---

### 3.15 Alert

```python
# models/schemas/intelligence.py
from pydantic import BaseModel, computed_field
from typing import Optional, Dict, Any
from datetime import date, datetime
from models.schemas.common import AlertSeverity, AlertStatus, RAGStatus


class AlertResponse(BaseModel):
    id: str
    farm_id: str
    pu_id: Optional[str] = None
    rule_id: str
    alert_key: str           # Format: "{rule_id}:{target_id}:{week_start}"
    alert_type: str
    severity: AlertSeverity
    status: AlertStatus
    message: str
    raw_data: Optional[Dict[str, Any]] = None

    # Computed from severity — used for RAG colour display on frontend
    @computed_field
    @property
    def severity_rag_color(self) -> str:
        """Maps severity to RAG hex color for UI badges."""
        colors = {
            "Critical": "#FF0000",  # Red
            "High": "#FF6600",      # Orange
            "Medium": "#FFD700",    # Amber/Gold
            "Low": "#00AA00",       # Green
        }
        return colors.get(self.severity.value, "#808080")

    # Escalation tracking
    escalated_at: Optional[datetime] = None
    escalation_count: int = 0
    auto_resolved: bool = False

    created_at: datetime
    resolved_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AlertListItem(BaseModel):
    """Lighter version for alert list views and dashboard."""
    id: str
    farm_id: str
    pu_id: Optional[str] = None
    rule_id: str
    severity: AlertSeverity
    status: AlertStatus
    message: str
    severity_rag_color: str
    days_open: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AlertResolveRequest(BaseModel):
    resolution_note: str


class AlertDismissRequest(BaseModel):
    reason: str  # Required reason for dismissal audit trail
```

---

### 3.16 Task

```python
# models/schemas/intelligence.py (continued)
from models.schemas.common import TaskPriority, TaskStatus


class TaskCreate(BaseModel):
    farm_id: str
    pu_id: Optional[str] = None
    cycle_id: Optional[str] = None
    task_name: str
    task_type: str
    assigned_to: str        # Worker ID or user ID
    due_date: date
    priority: TaskPriority
    notes: Optional[str] = None
    # rule_id left empty for manually created tasks
    rule_id: Optional[str] = None


class TaskUpdate(BaseModel):
    task_name: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[date] = None
    priority: Optional[TaskPriority] = None
    status: Optional[TaskStatus] = None
    completion_notes: Optional[str] = None
    notes: Optional[str] = None


class TaskResponse(BaseModel):
    id: str
    farm_id: str
    pu_id: Optional[str] = None
    cycle_id: Optional[str] = None
    rule_id: Optional[str] = None   # Set if auto-generated by automation engine
    task_name: str
    task_type: str
    assigned_to: str
    assigned_to_name: Optional[str] = None  # Joined
    due_date: date
    priority: TaskPriority
    status: TaskStatus
    days_until_due: int
    is_overdue: bool
    completed_at: Optional[datetime] = None
    completion_notes: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TaskListItem(BaseModel):
    id: str
    task_name: str
    pu_id: Optional[str] = None
    priority: TaskPriority
    status: TaskStatus
    due_date: date
    is_overdue: bool
    assigned_to_name: Optional[str] = None

    model_config = {"from_attributes": True}
```

---

### 3.17 Decision Signal

```python
# models/schemas/intelligence.py (continued)

class DecisionSignalResponse(BaseModel):
    id: str
    farm_id: str

    # Signal identity
    signal_name: str      # e.g. "CoKG Efficiency", "Cash Position", "Harvest Frequency"
    signal_type: str      # e.g. "financial", "operational", "compliance"

    # RAG status — primary display element
    rag_status: RAGStatus
    score_0_10: float     # Normalized 0-10 score (10 = best)

    # Current value
    value: Optional[float] = None
    target_value: Optional[float] = None
    unit: Optional[str] = None         # "FJD/kg", "FJD", "days", "%"

    # Guidance
    action_at_red: str    # One-line action instruction shown when RED
    trend: Optional[str] = None  # "improving", "declining", "stable" (from previous snapshot)

    computed_at: datetime

    model_config = {"from_attributes": True}


class AllSignalsResponse(BaseModel):
    """All 10 signals for a farm in one payload."""
    farm_id: str
    farm_name: str
    snapshot_time: datetime
    signals: List[DecisionSignalResponse]
    overall_rag: RAGStatus  # Worst signal's RAG status
    critical_count: int     # Signals at RED
    warning_count: int      # Signals at AMBER
    healthy_count: int      # Signals at GREEN
```

---

### 3.18 Farm Dashboard

```python
# models/schemas/intelligence.py (continued)

class DashboardCycleSummary(BaseModel):
    cycle_id: str
    pu_code: str
    production_name: str
    cycle_status: str
    days_active: int
    cogk_fjd: Optional[Decimal] = None
    last_harvest_days_ago: Optional[int] = None

class DashboardCashSummary(BaseModel):
    current_balance_fjd: Decimal
    rag_status: RAGStatus
    last_transaction_date: Optional[date] = None

class DashboardWorkerSummary(BaseModel):
    worker_code: str
    worker_name: str
    last_attended: Optional[date] = None
    days_since_attended: Optional[int] = None

class TisUsageSummary(BaseModel):
    used_today: int
    daily_limit: int
    tier: str
    remaining: int

class DashboardResponse(BaseModel):
    """
    Single aggregated call for the TFOS mobile dashboard.
    Replaces 8+ separate API calls. Optimized for low-bandwidth mobile use.
    """
    farm_id: str
    farm_name: str
    generated_at: datetime

    # Decision signals snapshot
    overall_rag: RAGStatus
    signals: List[DecisionSignalResponse]

    # Active cycles
    active_cycles: List[DashboardCycleSummary]
    active_cycle_count: int

    # Alerts summary
    critical_alerts: List[AlertListItem]
    high_alerts: List[AlertListItem]
    open_alert_count: int
    critical_alert_count: int

    # Tasks
    overdue_tasks: List[TaskListItem]
    due_today_tasks: List[TaskListItem]
    overdue_task_count: int

    # Cash
    cash: DashboardCashSummary

    # Weather (latest entry)
    latest_weather: Optional[WeatherResponse] = None

    # Workers
    worker_summaries: List[DashboardWorkerSummary]

    # TIS usage
    tis_usage: TisUsageSummary

    # Low stock alerts
    low_stock_count: int

    model_config = {"from_attributes": True}
```

---

### 3.19 Rotation Validation

```python
# models/schemas/cycles.py (continued)
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import date, datetime
from models.schemas.common import RotationStatus, EnforcementDecision


class RotationValidateRequest(BaseModel):
    pu_id: str
    proposed_production_id: str
    proposed_planting_date: date

    @field_validator("proposed_planting_date")
    @classmethod
    def validate_planting_date(cls, v: date) -> date:
        from datetime import date as date_type
        today = date_type.today()
        if (v - today).days > 30:
            raise ValueError("proposed_planting_date cannot be more than 30 days in the future")
        return v

    model_config = {"json_schema_extra": {
        "example": {
            "pu_id": "F001-PU001",
            "proposed_production_id": "CRP-TOM",
            "proposed_planting_date": "2025-05-01"
        }
    }}


class RotationAlternative(BaseModel):
    production_id: str
    production_name: str
    rule_status: RotationStatus
    min_rest_days: int
    notes: str


class RotationValidationResult(BaseModel):
    allowed: bool
    enforcement_decision: EnforcementDecision
    rule_status: RotationStatus
    min_rest_days: int
    days_short: int            # 0 if allowed; days until min_rest satisfied
    days_since_last_harvest: int
    rotation_key: str          # e.g. "CRP-EGG:CRP-TOM"
    current_production_id: Optional[str] = None
    proposed_production_id: str
    previous_production_name: Optional[str] = None
    proposed_production_name: str
    alternatives: List[RotationAlternative] = []
    override_available: bool   # True if enforcement_decision = BLOCKED; FOUNDER can override
    validation_timestamp: datetime

    model_config = {"json_schema_extra": {
        "example": {
            "allowed": False,
            "enforcement_decision": "BLOCKED",
            "rule_status": "BLOCK",
            "min_rest_days": 60,
            "days_short": 23,
            "days_since_last_harvest": 37,
            "rotation_key": "CRP-EGG:CRP-TOM",
            "current_production_id": "CRP-EGG",
            "proposed_production_id": "CRP-TOM",
            "previous_production_name": "Eggplant",
            "proposed_production_name": "Tomato",
            "alternatives": [
                {
                    "production_id": "CRP-LBN",
                    "production_name": "Long Bean",
                    "rule_status": "PREF",
                    "min_rest_days": 0,
                    "notes": "Nitrogen-fixing legume — excellent rotation after Solanaceae"
                }
            ],
            "override_available": True,
            "validation_timestamp": "2025-04-07T09:00:00Z"
        }
    }}
```

---

### 3.20 TIS Chat and Voice

```python
# models/schemas/tis.py
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime
from models.schemas.common import TISModule, VoiceCommandType, LoggedVia


class TisChatRequest(BaseModel):
    farm_id: str
    message: str
    conversation_id: Optional[str] = None  # Continue existing conversation thread
    channel: str = "app"  # "app" | "whatsapp"

    model_config = {"json_schema_extra": {
        "example": {
            "farm_id": "F001",
            "message": "What is the CoKG on PU001 this cycle?",
            "channel": "app"
        }
    }}


class TisVoiceRequest(BaseModel):
    farm_id: str
    audio_url: str   # Supabase Storage URL to uploaded audio file
    channel: str = "whatsapp"  # Typically "whatsapp" for voice notes


class CommandResult(BaseModel):
    """Result of a command execution by the TIS Command Executor."""
    command_type: VoiceCommandType
    success: bool
    created_id: Optional[str] = None    # ID of created record (if LOG_* command)
    data: Optional[Dict[str, Any]] = None  # Returned data (if CHECK_* command)
    message: str                         # Human-readable result message
    error: Optional[str] = None
    compliance_blocked: bool = False     # True if LOG_HARVEST was blocked by compliance


class TisResponse(BaseModel):
    """Unified response from all TIS modules."""
    success: bool
    tis_module_used: TISModule
    command_type: Optional[VoiceCommandType] = None  # Set if Command Executor was used
    response_text: str          # Plain-language response in Fijian-English
    command_result: Optional[CommandResult] = None
    sources_cited: List[str] = []    # KB article IDs if Knowledge Broker was used
    conversation_id: str
    tokens_used: int
    latency_ms: int
    created_at: datetime

    model_config = {"from_attributes": True}


class TisConversationResponse(BaseModel):
    id: str
    farm_id: str
    user_id: str
    channel: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    message_count: int
    summary: Optional[str] = None
    messages: Optional[List[Dict[str, Any]]] = None  # Full message history if requested

    model_config = {"from_attributes": True}


class TisInsightResponse(BaseModel):
    """Proactive AI insight generated by TIS Operational Interpreter."""
    id: str
    farm_id: str
    insight_type: str    # "performance", "risk", "opportunity", "alert_explanation"
    title: str
    body: str
    rag_status: RAGStatus
    signal_ref: Optional[str] = None   # Reference to a decision signal ID
    created_at: datetime
    expires_at: Optional[datetime] = None
    dismissed: bool = False

    model_config = {"from_attributes": True}
```

---

### 3.21 Community

```python
# models/schemas/community.py
from pydantic import BaseModel, field_validator
from typing import Optional, List
from decimal import Decimal
from datetime import date, datetime


class ListingCreate(BaseModel):
    production_id: str
    quantity_kg: Decimal
    price_per_kg_fjd: Decimal
    available_date: date
    contact_phone: str
    notes: Optional[str] = None

    @field_validator("quantity_kg")
    @classmethod
    def validate_quantity(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("quantity_kg must be greater than 0")
        return v

    @field_validator("price_per_kg_fjd")
    @classmethod
    def validate_price(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("price_per_kg_fjd must be >= 0")
        return v

    @field_validator("contact_phone")
    @classmethod
    def validate_fiji_phone(cls, v: str) -> str:
        import re
        pattern = r"^\+679\d{7}$"
        if not re.match(pattern, v):
            raise ValueError("Phone must be in Fiji format: +679XXXXXXX")
        return v


class ListingUpdate(BaseModel):
    quantity_kg: Optional[Decimal] = None
    price_per_kg_fjd: Optional[Decimal] = None
    available_date: Optional[date] = None
    listing_status: Optional[str] = None  # "active" | "sold" | "expired"
    notes: Optional[str] = None


class ListingResponse(BaseModel):
    id: str
    tenant_id: str
    display_name: str          # From community_profile
    island: Optional[str] = None  # From community_profile
    production_id: str
    production_name: str       # Joined from shared productions
    quantity_kg: Decimal
    price_per_kg_fjd: Decimal
    available_date: date
    listing_status: str
    contact_phone: str
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PriceIndexResponse(BaseModel):
    """Market price aggregation for a production across recent listings/deliveries."""
    production_id: str
    production_name: str
    market: str                # e.g. "Suva Municipal Market", "Lami", "export"
    avg_price_fjd: Decimal
    min_price_fjd: Decimal
    max_price_fjd: Decimal
    sample_count: int
    week_start: date           # Price index week
    trend: Optional[str] = None  # "up" | "down" | "stable" vs prior week

    model_config = {"from_attributes": True}


class CommunityPostCreate(BaseModel):
    post_type: str   # "tip", "question", "announcement", "market_update"
    title: str
    body: str
    tags: List[str] = []


class CommunityPostResponse(BaseModel):
    id: str
    tenant_id: str
    display_name: str
    post_type: str
    title: str
    body: str
    tags: List[str]
    is_pinned: bool
    created_at: datetime

    model_config = {"from_attributes": True}
```

---

## SECTION 4 — VALIDATORS REFERENCE

All cross-domain validators used in TFOS schemas:

| Field | Validation Rule | Error Message |
|-------|----------------|---------------|
| `planting_date` | Must not be more than 30 days in the future | `"planting_date cannot be more than 30 days in the future"` |
| `harvest_qty_kg` / `qty_kg` | Must be > 0 | `"qty_kg must be greater than 0"` |
| `price_per_unit` / `price_per_kg_fjd` | Must be >= 0 | `"price_per_kg_fjd must be >= 0"` |
| `area_acres` / `area_planted_acres` | Must be > 0 | `"area_acres must be greater than 0"` |
| `hours_worked` | Must be between 0.5 and 16 | `"hours_worked must be between 0.5 and 16"` |
| `phone` | Fiji format: `+679` followed by exactly 7 digits | `"Phone must be in Fiji format: +679XXXXXXX (7 digits after +679)"` |
| `email` | Standard email validation via Pydantic `EmailStr` | Pydantic default |
| `rainfall_mm` | Must be >= 0 | `"rainfall_mm cannot be negative"` |
| `temp_min_c` / `temp_max_c` | Must be between -10 and 60 | `"Temperature out of plausible range (-10 to 60°C)"` |
| `rate_fjd` / `daily_rate_fjd` | Must be >= 0 | `"rate_fjd must be >= 0"` |

---

## SECTION 5 — SCHEMA EXAMPLES

### Complete CycleResponse example

```json
{
  "cogk_fjd": "2.85",
  "gross_margin_pct": 34.2,
  "total_revenue_fjd": "1250.00",
  "total_cost_fjd": "822.50",
  "id": "cyc-f001-001",
  "pu_id": "F001-PU001",
  "pu_code": "F001-PU001",
  "pu_name": "Block A North",
  "farm_id": "F001",
  "production_id": "CRP-TOM",
  "production_name": "Tomato",
  "cycle_status": "harvesting",
  "planting_date": "2025-02-01",
  "expected_harvest_start": "2025-04-01",
  "actual_harvest_end": null,
  "area_planted_acres": "0.5",
  "days_active": 65,
  "total_harvest_kg": "288.7",
  "harvest_count": 3,
  "last_harvest_date": "2025-04-05",
  "days_since_last_harvest": 2,
  "chemical_compliance_status": "clear",
  "rotation_override": false,
  "rotation_override_reason": null,
  "logged_via": "manual",
  "created_at": "2025-02-01T08:00:00Z",
  "updated_at": "2025-04-05T14:30:00Z"
}
```

### Complete DashboardResponse example (abbreviated)

```json
{
  "farm_id": "F001",
  "farm_name": "Save-A-Lot",
  "generated_at": "2025-04-07T06:00:00Z",
  "overall_rag": "AMBER",
  "signals": [...],
  "active_cycle_count": 4,
  "active_cycles": [
    {
      "cycle_id": "cyc-f001-001",
      "pu_code": "F001-PU001",
      "production_name": "Tomato",
      "cycle_status": "harvesting",
      "days_active": 65,
      "cogk_fjd": "2.85",
      "last_harvest_days_ago": 2
    }
  ],
  "open_alert_count": 3,
  "critical_alert_count": 1,
  "critical_alerts": [...],
  "high_alerts": [...],
  "overdue_task_count": 2,
  "overdue_tasks": [...],
  "cash": {
    "current_balance_fjd": "3250.00",
    "rag_status": "GREEN",
    "last_transaction_date": "2025-04-06"
  },
  "latest_weather": {
    "log_date": "2025-04-07",
    "rainfall_mm": 12.5,
    "temp_min_c": 22.0,
    "temp_max_c": 31.0
  },
  "tis_usage": {
    "used_today": 3,
    "daily_limit": 20,
    "tier": "BASIC",
    "remaining": 17
  },
  "low_stock_count": 2
}
```
