"""
app/models/automation.py
Teivaka Agri-TOS — SQLAlchemy 2.0 ORM models for automation and alerting tables.

Covers:
  tenant.automation_rules          — RULE-001..RULE-043 trigger/action definitions
  tenant.task_queue                — generated tasks and reminders
  tenant.alerts                    — deduplicated alerts (UNIQUE alert_key)
  tenant.decision_signal_config    — DS-001..DS-010 signal thresholds
  tenant.decision_signal_snapshots — TimescaleDB hypertable (7-day chunks)

Key notes:
- AutomationRule.notify_roles is ARRAY(Text) — roles that receive WhatsApp alerts.
- Alert.alert_key has a UNIQUE constraint for deduplication (one alert per
  rule+farm+entity+day).
- DecisionSignalSnapshot is a TimescaleDB hypertable.
  Composite PK: (snapshot_id, snapshot_date).

Source: 02_database/schema/02_tenant_schema.sql (tables 30–33)
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import (
    ARRAY,
    Boolean,
    Date,
    Integer,
    Numeric,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID
TIMESTAMPTZ = TIMESTAMP(timezone=True)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.tenant import TenantBase


# =============================================================================
# TABLE 30: tenant.automation_rules
# Rule definitions — trigger conditions and resulting actions.
# notify_roles: ARRAY(Text) — e.g. ['FOUNDER', 'MANAGER']
# =============================================================================

class AutomationRule(TenantBase):
    __tablename__ = "automation_rules"
    __table_args__ = {"schema": "tenant"}

    rule_id: Mapped[str] = mapped_column(Text, primary_key=True)  # RULE-001..RULE-043
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    rule_name: Mapped[str] = mapped_column(Text, nullable=False)
    trigger_category: Mapped[str] = mapped_column(Text, nullable=False)
    trigger_condition: Mapped[str] = mapped_column(Text, nullable=False)
    trigger_threshold_value: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    trigger_threshold_unit: Mapped[Optional[str]] = mapped_column(Text)
    action_type: Mapped[str] = mapped_column(Text, nullable=False)
    action_description: Mapped[str] = mapped_column(Text, nullable=False)
    alert_severity: Mapped[Optional[str]] = mapped_column(Text)
    whatsapp_template: Mapped[Optional[str]] = mapped_column(Text)
    # NOT NULL — defaults to ['FOUNDER']
    notify_roles: Mapped[List[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default="ARRAY['FOUNDER']"
    )
    auto_resolve: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    auto_resolve_condition: Mapped[Optional[str]] = mapped_column(Text)
    farm_specific: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    farm_id: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    last_triggered_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMPTZ)
    trigger_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    # relationships
    tasks: Mapped[List[TaskQueue]] = relationship("TaskQueue", back_populates="rule")
    alerts: Mapped[List[Alert]] = relationship("Alert", back_populates="rule")

    def __repr__(self) -> str:
        return (
            f"<AutomationRule id={self.rule_id!r} "
            f"name={self.rule_name!r} "
            f"action={self.action_type!r} "
            f"active={self.is_active}>"
        )


# =============================================================================
# TABLE 31: tenant.task_queue
# Generated tasks: alerts, field tasks, orders, reminders.
# =============================================================================

class TaskQueue(TenantBase):
    __tablename__ = "task_queue"
    __table_args__ = {"schema": "tenant"}

    task_id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    rule_id: Mapped[Optional[str]] = mapped_column(Text)
    task_type: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    assigned_to_worker_id: Mapped[Optional[str]] = mapped_column(Text)
    assigned_to_user_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    priority: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'MEDIUM'"
    )
    due_date: Mapped[Optional[date]] = mapped_column(Date)
    due_time: Mapped[Optional[datetime]] = mapped_column(Time)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="'OPEN'")
    completed_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMPTZ)
    completed_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    cycle_id: Mapped[Optional[str]] = mapped_column(Text)
    pu_id: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    rule: Mapped[Optional[AutomationRule]] = relationship(
        "AutomationRule",
        foreign_keys=[rule_id],
        primaryjoin="TaskQueue.rule_id == AutomationRule.rule_id",
        back_populates="tasks",
    )

    def __repr__(self) -> str:
        return (
            f"<TaskQueue id={self.task_id!r} "
            f"type={self.task_type!r} "
            f"priority={self.priority!r} "
            f"status={self.status!r}>"
        )


# =============================================================================
# TABLE 32: tenant.alerts
# Deduplicated alert log. alert_key UNIQUE prevents duplicate alerts for the
# same triggering event on the same day.
# alert_key format: {rule_id}_{farm_id}_{entity_id}_{YYYYMMDD}
# =============================================================================

class Alert(TenantBase):
    __tablename__ = "alerts"
    __table_args__ = (
        UniqueConstraint("alert_key", name="uq_alerts_alert_key"),
        {"schema": "tenant"},
    )

    alert_id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    rule_id: Mapped[Optional[str]] = mapped_column(Text)
    # Deduplication key — UNIQUE. Format: rule_id + farm_id + entity_id + YYYYMMDD
    alert_key: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    severity: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    alert_status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'ACTIVE'"
    )
    triggered_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMPTZ)
    acknowledged_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    resolved_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMPTZ)
    resolved_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    resolution_notes: Mapped[Optional[str]] = mapped_column(Text)
    whatsapp_sent: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    whatsapp_sent_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMPTZ)
    whatsapp_message_sid: Mapped[Optional[str]] = mapped_column(Text)
    entity_type: Mapped[Optional[str]] = mapped_column(Text)  # 'cycle', 'input', etc.
    entity_id: Mapped[Optional[str]] = mapped_column(Text)
    alert_metadata: Mapped[Optional[dict]] = mapped_column("metadata", JSONB)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    rule: Mapped[Optional[AutomationRule]] = relationship(
        "AutomationRule",
        foreign_keys=[rule_id],
        primaryjoin="Alert.rule_id == AutomationRule.rule_id",
        back_populates="alerts",
    )

    def __repr__(self) -> str:
        return (
            f"<Alert id={self.alert_id!r} "
            f"severity={self.severity!r} "
            f"status={self.alert_status!r} "
            f"key={self.alert_key!r}>"
        )


# =============================================================================
# TABLE 33a: tenant.decision_signal_config
# Signal definitions — green/amber/red thresholds for farm decision dashboard.
# DS-001..DS-010
# =============================================================================

class DecisionSignalConfig(TenantBase):
    __tablename__ = "decision_signal_config"
    __table_args__ = {"schema": "tenant"}

    signal_id: Mapped[str] = mapped_column(Text, primary_key=True)  # DS-001..DS-010
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    signal_name: Mapped[str] = mapped_column(Text, nullable=False)
    signal_category: Mapped[str] = mapped_column(Text, nullable=False)
    green_threshold: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    amber_threshold: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    red_threshold: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    threshold_direction: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'LOWER_IS_BETTER'"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    custom_formula: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    snapshots: Mapped[List[DecisionSignalSnapshot]] = relationship(
        "DecisionSignalSnapshot", back_populates="signal_config"
    )

    def __repr__(self) -> str:
        return (
            f"<DecisionSignalConfig id={self.signal_id!r} "
            f"name={self.signal_name!r} "
            f"direction={self.threshold_direction!r}>"
        )


# =============================================================================
# TABLE 33b: tenant.decision_signal_snapshots  (TimescaleDB hypertable — 7-day)
# Point-in-time computed values for each decision signal.
# Composite PK: (snapshot_id, snapshot_date) — required by TimescaleDB.
# =============================================================================

class DecisionSignalSnapshot(TenantBase):
    __tablename__ = "decision_signal_snapshots"
    __table_args__ = {"schema": "tenant"}

    snapshot_id: Mapped[str] = mapped_column(Text, primary_key=True)
    snapshot_date: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, primary_key=True, server_default="NOW()"
    )
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    signal_id: Mapped[str] = mapped_column(Text, nullable=False)
    computed_value: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    signal_status: Mapped[str] = mapped_column(Text, nullable=False)  # GREEN|AMBER|RED|NULL
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    signal_config: Mapped[Optional[DecisionSignalConfig]] = relationship(
        "DecisionSignalConfig",
        foreign_keys=[signal_id],
        primaryjoin="DecisionSignalSnapshot.signal_id == DecisionSignalConfig.signal_id",
        back_populates="snapshots",
    )

    def __repr__(self) -> str:
        return (
            f"<DecisionSignalSnapshot id={self.snapshot_id!r} "
            f"signal={self.signal_id!r} "
            f"date={self.snapshot_date} "
            f"status={self.signal_status!r} "
            f"value={self.computed_value}>"
        )
