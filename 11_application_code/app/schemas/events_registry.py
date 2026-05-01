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

EVENT_TYPE_REGISTRY: dict = {
    "EGGS_COLLECTED": (EggsCollectedPayload, "tenant.poultry_event_log", 1),
    # Future events register here:
    # "MORTALITY_LOGGED": (MortalityLoggedPayload, "tenant.poultry_event_log", 1),
    # "VACCINATION_GIVEN": (VaccinationGivenPayload, "tenant.poultry_event_log", 1),
}


def get_schema_for_event_type(event_type: str):
    """Return (PydanticSchema, table_name, version) tuple for a registered event_type, or None."""
    return EVENT_TYPE_REGISTRY.get(event_type)
