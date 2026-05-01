"""Polymorphic events Pydantic schema registry + dispatch dict.

Per Phase 6.2-1 architectural decisions:
- POST /api/v1/events takes {event_type, anchors, payload}
- Per-event-type payload schemas registered here, dispatched by event_type

Adding a new event type:
1. Define a Pydantic class for its payload (subclass BaseModel)
2. Register it in EVENT_TYPE_REGISTRY with (schema_class, table_name, schema_version)
3. Done — POST /api/v1/events automatically validates and routes

Cross-group reuse: livestock, aquaculture, crops events all register here as they ship.

payload_schema_version: increment when payload shape changes for an existing event_type.
"""

from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field


# ============================================================================
# POULTRY event payload schemas
# ============================================================================

class EggsCollectedPayload(BaseModel):
    """Payload schema for EGGS_COLLECTED event.

    Anchors (Farm + Coop + Crop + Operator) come from the outer envelope.
    This is the event-specific payload only.
    """
    qty_eggs: int = Field(..., ge=0, le=100000, description="Total eggs collected.")
    grade_breakdown: Optional[dict] = Field(
        default=None,
        description="Optional grade counts, e.g. {medium: 80, large: 50, small: 12}.",
    )
    broken_eggs: Optional[int] = Field(
        default=None, ge=0,
        description="Optional broken/cracked count.",
    )
    collected_at_time: Optional[str] = Field(
        default=None,
        description="Local time ('morning', 'afternoon'); separate from occurred_at.",
    )
    notes: Optional[str] = Field(
        default=None, max_length=500,
        description="Single free-text field per Doctrine 4a.1 Tension 1.1.",
    )


# ============================================================================
# EVENT TYPE REGISTRY
# ============================================================================
# Tuple shape: (PydanticSchema, target_table_name, schema_version)
#
# POULTRY events route to tenant.poultry_event_log.
# Future groups register additional events with their own table names.

class MortalityLoggedPayload(BaseModel):
    """Payload schema for MORTALITY_LOGGED event.

    Anchors include flock_id REQUIRED at app layer (validated in events.py).
    Side effect: decrements tenant.flocks.current_count by qty_dead in same transaction.
    """
    qty_dead: int = Field(..., ge=1, le=1000000, description="Number of birds that died.")
    cause: str = Field(
        ...,
        description="Mortality cause (controlled vocab: DISEASE, PREDATION, INJURY, UNKNOWN, OLD_AGE, OTHER).",
    )
    notes: Optional[str] = Field(
        default=None, max_length=500,
        description="Single free-text field per Doctrine 4a.1 Tension 1.1.",
    )


class WeightCheckPayload(BaseModel):
    """Sample-based weight check. flock_id required at anchors. No side effect."""
    avg_weight_g: int = Field(..., gt=0, le=20000, description="Average weight per bird in grams.")
    sample_size: int = Field(..., gt=0, le=10000, description="How many birds were weighed.")
    total_weight_g: Optional[int] = Field(default=None, gt=0, description="Optional total weight of the sample (cross-check).")
    notes: Optional[str] = Field(default=None, max_length=500)


class BirdReplacementPayload(BaseModel):
    """Adds birds to existing flock. Increments flock.current_count same-tx. placed_count never changes."""
    qty_added: int = Field(..., gt=0, le=1000000)
    reason: str = Field(..., description="REPLACEMENT (restock after mortality), EXPANSION (grow flock), RECOVERY (returned escapees)")
    cost_fjd: Optional[Decimal] = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    supplier_id: Optional[str] = Field(default=None, description="Optional UUID of supplier in farm_libraries.")
    notes: Optional[str] = Field(default=None, max_length=500)

    class Config:
        json_encoders = {Decimal: str}


class FeedReceivedPayload(BaseModel):
    """Payload schema for FEED_RECEIVED event.

    flock_id and pu_id OPTIONAL (feed often arrives at farm level).
    feed_type_id REQUIRED (UUID FK to shared.farm_libraries POULTRY_FEED).
    supplier_id OPTIONAL (UUID FK to shared.farm_libraries POULTRY_SUPPLIER).
    NO side effect on flocks.
    NO automatic cash_ledger entry (deferred to Phase 6.5+ integration).
    """
    feed_type_id: str = Field(..., description="UUID of feed type in shared.farm_libraries.")
    qty_kg: Decimal = Field(..., gt=0, max_digits=10, decimal_places=3, description="Quantity in kilograms.")
    supplier_id: Optional[str] = Field(default=None, description="Optional UUID of supplier in shared.farm_libraries.")
    cost_fjd: Optional[Decimal] = Field(
        default=None, ge=0, max_digits=10, decimal_places=2,
        description="Cost in FJD. Optional; may be unknown at delivery.",
    )
    delivery_date: str = Field(..., description="Delivery date (YYYY-MM-DD).")
    batch_number: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=500)

    class Config:
        json_encoders = {Decimal: str}  # Decimals serialize to strings in JSONB


class VaccinationGivenPayload(BaseModel):
    """Payload schema for VACCINATION_GIVEN event.

    flock_id REQUIRED at anchor layer.
    vaccine_id REQUIRED — UUID FK to shared.farm_libraries (POULTRY_VACCINE).
    NO side effect on flock count (pure record-keeping).
    """
    vaccine_id: str = Field(..., description="UUID of vaccine row in shared.farm_libraries.")
    qty_doses: Optional[int] = Field(
        default=None, ge=1, le=1000000,
        description="Number of doses administered. Defaults to flock.current_count at app layer if omitted.",
    )
    route: str = Field(
        ...,
        description="Administration route (controlled vocab: DRINKING_WATER, INJECTION, EYE_DROP, SPRAY, OTHER).",
    )
    next_due_date: Optional[str] = Field(
        default=None,
        description="Optional next-vaccination date in YYYY-MM-DD format.",
    )
    notes: Optional[str] = Field(
        default=None, max_length=500,
        description="Single free-text field per Doctrine 4a.1 Tension 1.1.",
    )


EVENT_TYPE_REGISTRY: dict = {
    "EGGS_COLLECTED":     (EggsCollectedPayload,     "tenant.poultry_event_log", 1),
    "MORTALITY_LOGGED":   (MortalityLoggedPayload,   "tenant.poultry_event_log", 1),
    "VACCINATION_GIVEN":  (VaccinationGivenPayload,  "tenant.poultry_event_log", 1),
    "FEED_RECEIVED":      (FeedReceivedPayload,      "tenant.poultry_event_log", 1),
    "WEIGHT_CHECK":       (WeightCheckPayload,       "tenant.poultry_event_log", 1),
    "BIRD_REPLACEMENT":   (BirdReplacementPayload,   "tenant.poultry_event_log", 1),
}

# Vocabularies (used for app-layer validation in events.py)
MORTALITY_CAUSES = {"DISEASE", "PREDATION", "INJURY", "UNKNOWN", "OLD_AGE", "OTHER"}
VACCINATION_ROUTES = {"DRINKING_WATER", "INJECTION", "EYE_DROP", "SPRAY", "OTHER"}
BIRD_REPLACEMENT_REASONS = {"REPLACEMENT", "EXPANSION", "RECOVERY"}


def get_schema_for_event_type(event_type: str):
    """Return (PydanticSchema, table_name, version) tuple for a registered event_type, or None."""
    return EVENT_TYPE_REGISTRY.get(event_type)
