"""Phase 4.2 Step 5-6 — Pydantic schemas for Task API.

Request/response models for /api/v1/tasks/*.

All responses wrap in the Part 13 envelope: {status, data, meta} — see
app/core/responses.py (existing helper) or build inline.

Deployment target: /opt/teivaka/11_application_code/app/schemas/tasks.py
"""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# --- Enums (mirror DB check constraints) -------------------------------

class TaskStatus(str, Enum):
    OPEN = "OPEN"
    COMPLETED = "COMPLETED"
    SKIPPED = "SKIPPED"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


class SourceModule(str, Enum):
    AUTOMATION = "automation"
    DECISION = "decision"
    WEATHER = "weather"
    ROTATION = "rotation"
    COMPLIANCE = "compliance"
    CASH = "cash"
    MARKET = "market"
    MANUAL = "manual"
    TIS = "tis"


class SkipReason(str, Enum):
    NOT_APPLICABLE = "not_applicable"
    WILL_DO_LATER = "will_do_later"
    NEED_HELP = "need_help"
    OTHER = "other"


class RankBand(str, Enum):
    CRITICAL = "critical"   # 1-99
    HIGH = "high"           # 100-299
    MEDIUM = "medium"       # 300-599
    LOW = "low"             # 600-899
    OPTIONAL = "optional"   # 900-999
    ADVISORY = "advisory"   # 1000+


RANK_BAND_RANGES: dict[RankBand, tuple[int, int]] = {
    RankBand.CRITICAL: (1, 99),
    RankBand.HIGH: (100, 299),
    RankBand.MEDIUM: (300, 599),
    RankBand.LOW: (600, 899),
    RankBand.OPTIONAL: (900, 999),
    RankBand.ADVISORY: (1000, 9999),
}


# --- Response models ---------------------------------------------------

class TaskOut(BaseModel):
    """A single task — used in both /next and /tasks list responses.

    Designed to be directly consumable by both the Solo TaskCard and
    Growth/Commercial task list views without client-side reshaping.
    """
    model_config = ConfigDict(from_attributes=True)

    task_id: UUID
    imperative: str
    task_rank: int = Field(ge=1, le=9999)
    icon_key: str
    input_hint: str  # 'none' | 'numeric_kg' | 'numeric_fjd' | 'photo' | 'text_short' | 'checklist' | 'confirm_yn'
    body_md: str | None = None
    due_date: date | None = None
    expires_at: datetime | None = None
    default_outcome: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    source_module: str
    source_reference: str | None = None
    voice_playback_url: str | None = None
    status: str
    created_at: datetime


class TaskListOut(BaseModel):
    """Response for GET /tasks."""
    total: int
    tasks: list[TaskOut]


class TaskHelpOut(BaseModel):
    """Response for POST /tasks/{id}/help.

    Returns body_md plus optional KB article pointers and an escalation path.
    No state change — this endpoint is read-only against the task.
    """
    task_id: UUID
    body_md: str | None
    kb_articles: list[KBArticleRef]
    escalation: EscalationHint | None


class KBArticleRef(BaseModel):
    """Lightweight KB article pointer — full content fetched via /kb/{id}."""
    article_id: UUID
    title: str
    slug: str
    layer: Literal["VALIDATED_KB", "FIJI_INTELLIGENCE"]
    excerpt: str | None = None


class EscalationHint(BaseModel):
    """Who to contact / what action to take if the farmer cannot complete."""
    contact_name: str | None = None
    contact_role: str
    contact_whatsapp: str | None = None
    suggested_action: str


class TaskCompleteOut(BaseModel):
    """Response for POST /tasks/{id}/complete."""
    task_id: UUID
    status: Literal["COMPLETED"]
    audit_event_id: UUID
    audit_this_hash: str  # 64-char hex
    next_task: TaskOut | None = None  # Pre-fetched Solo-mode next card


class TaskSkipOut(BaseModel):
    """Response for POST /tasks/{id}/skip."""
    task_id: UUID
    status: Literal["SKIPPED"]
    audit_event_id: UUID
    audit_this_hash: str
    next_task: TaskOut | None = None


# --- Request models ---------------------------------------------------

class TaskCompleteIn(BaseModel):
    """Body for POST /tasks/{id}/complete.

    input_value is the payload matching the task's input_hint contract:
      - 'none':        input_value MUST be null
      - 'numeric_kg':  positive decimal as string (e.g. '12.5')
      - 'numeric_fjd': positive decimal as string (FJD amount)
      - 'photo':       URL string pointing to uploaded photo
      - 'text_short':  string up to 200 chars
      - 'checklist':   JSON array of booleans, length matches task contract
      - 'confirm_yn':  boolean (true = yes = done)

    The endpoint validates input_value against the task's input_hint.
    """
    input_value: str | bool | list[bool] | None = None
    note: str | None = Field(default=None, max_length=500)
    offline_id: str | None = Field(default=None, max_length=64)


class TaskSkipIn(BaseModel):
    """Body for POST /tasks/{id}/skip."""
    reason: SkipReason
    note: str | None = Field(default=None, max_length=500)
    offline_id: str | None = Field(default=None, max_length=64)


# --- Mode derivation -------------------------------------------------

class FarmerMode(str, Enum):
    SOLO = "SOLO"
    GROWTH = "GROWTH"
    COMMERCIAL = "COMMERCIAL"


class ModeOut(BaseModel):
    mode: FarmerMode
    derivation: ModeDerivation


class ModeDerivation(BaseModel):
    """Explainable mode derivation — surfaced to UI for debug panel."""
    total_area_ha: float
    active_cycles: int
    user_tenure_days: int
    subscription_tier: str
    reason: str  # Human-readable: "SOLO: <5ha, <3 cycles, <90 day tenure"


# Rebuild forward refs
TaskHelpOut.model_rebuild()
