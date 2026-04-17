"""
app/models/operations.py
Teivaka Agri-TOS — SQLAlchemy 2.0 ORM models for operational tables.

Covers:
  tenant.production_cycles  — core crop cycle record
  tenant.field_events       — TimescaleDB hypertable (7-day chunks)
  tenant.harvest_log        — TimescaleDB hypertable (7-day chunks)
  tenant.income_log         — TimescaleDB hypertable (7-day chunks)
  tenant.labor_attendance   — TimescaleDB hypertable (7-day chunks)
  tenant.weather_log        — TimescaleDB hypertable (7-day chunks)

TimescaleDB hypertables use composite PKs: (id_col, timestamp_col).
SQLAlchemy maps these as regular composite PKs — TimescaleDB manages
chunk partitioning on the DB side.

Source: 02_database/schema/02_tenant_schema.sql (tables 11–16)
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
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID
TIMESTAMPTZ = TIMESTAMP(timezone=True)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.models.tenant import TenantBase


# =============================================================================
# TABLE 11: tenant.production_cycles
# Core operational record — one row per planting/growing cycle.
# =============================================================================

class ProductionCycle(TenantBase):
    __tablename__ = "production_cycles"
    __table_args__ = {"schema": "tenant"}

    cycle_id: Mapped[str] = mapped_column(Text, primary_key=True)
    # format: CYC-F001-Z01-PU01-2026-001
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    pu_id: Mapped[str] = mapped_column(Text, nullable=False)
    zone_id: Mapped[str] = mapped_column(Text, nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    production_id: Mapped[str] = mapped_column(Text, nullable=False)
    cycle_status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'PLANNED'"
    )
    planting_date: Mapped[date] = mapped_column(Date, nullable=False)
    expected_harvest_date: Mapped[Optional[date]] = mapped_column(Date)
    actual_harvest_start: Mapped[Optional[date]] = mapped_column(Date)
    actual_harvest_end: Mapped[Optional[date]] = mapped_column(Date)
    planned_area_sqm: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    planned_yield_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    actual_yield_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    total_labor_cost_fjd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, server_default="0"
    )
    total_input_cost_fjd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, server_default="0"
    )
    total_other_cost_fjd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, server_default="0"
    )
    total_revenue_fjd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, server_default="0"
    )
    # NULL when zero harvest (cannot compute cost per kg with no yield)
    cogk_fjd_per_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4))
    # (actual_yield - planned_yield) / planned_yield * 100
    harvest_reconciliation_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2))
    cycle_notes: Mapped[Optional[str]] = mapped_column(Text)
    closed_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    closed_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMPTZ)
    created_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    # relationships
    field_events: Mapped[List[FieldEvent]] = relationship(
        "FieldEvent", back_populates="cycle"
    )
    harvest_logs: Mapped[List[HarvestLog]] = relationship(
        "HarvestLog", back_populates="cycle"
    )
    income_logs: Mapped[List[IncomeLog]] = relationship(
        "IncomeLog", back_populates="cycle"
    )
    labor_attendance: Mapped[List[LaborAttendance]] = relationship(
        "LaborAttendance", back_populates="cycle"
    )

    def __repr__(self) -> str:
        return (
            f"<ProductionCycle id={self.cycle_id!r} "
            f"status={self.cycle_status!r} "
            f"planted={self.planting_date} "
            f"cogk={self.cogk_fjd_per_kg}>"
        )


# =============================================================================
# TABLE 12: tenant.field_events  (TimescaleDB hypertable — 7-day chunks)
# Every on-farm activity logged here — spray, fertilize, harvest_partial, etc.
# Composite PK: (event_id, event_date) required by TimescaleDB.
# =============================================================================

class FieldEvent(TenantBase):
    __tablename__ = "field_events"
    __table_args__ = {"schema": "tenant"}

    event_id: Mapped[str] = mapped_column(Text, primary_key=True)
    # Composite PK col 2 — TimescaleDB partitions on this column
    event_date: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, primary_key=True, server_default="NOW()"
    )
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    cycle_id: Mapped[str] = mapped_column(Text, nullable=False)
    pu_id: Mapped[str] = mapped_column(Text, nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    performed_by_worker_id: Mapped[Optional[str]] = mapped_column(Text)
    input_id: Mapped[Optional[str]] = mapped_column(Text)
    input_qty_used: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 3))
    input_cost_fjd: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    labor_hours: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2))
    labor_cost_fjd: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    quantity_harvested_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 3))
    observation_text: Mapped[Optional[str]] = mapped_column(Text)
    photo_url: Mapped[Optional[str]] = mapped_column(Text)
    gps_lat: Mapped[Optional[Decimal]] = mapped_column(Numeric(9, 6))
    gps_lng: Mapped[Optional[Decimal]] = mapped_column(Numeric(9, 6))
    chemical_application: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    # FK to shared.chemical_library — soft reference (cross-schema FK acceptable)
    chemical_id: Mapped[Optional[str]] = mapped_column(Text)
    chemical_dose_per_liter: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4))
    tank_volume_liters: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    # Computed on DB side: event_date::date + withholding_period_days
    whd_clearance_date: Mapped[Optional[date]] = mapped_column(Date)
    created_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    cycle: Mapped[ProductionCycle] = relationship(
        "ProductionCycle",
        foreign_keys=[cycle_id],
        primaryjoin="FieldEvent.cycle_id == ProductionCycle.cycle_id",
        back_populates="field_events",
    )

    def __repr__(self) -> str:
        return (
            f"<FieldEvent id={self.event_id!r} "
            f"type={self.event_type!r} "
            f"date={self.event_date} "
            f"chemical={self.chemical_application}>"
        )


# =============================================================================
# TABLE 13: tenant.harvest_log  (TimescaleDB hypertable — 7-day chunks)
# Records every harvest event with chemical compliance tracking.
# Composite PK: (harvest_id, harvest_date).
# =============================================================================

class HarvestLog(TenantBase):
    __tablename__ = "harvest_log"
    __table_args__ = {"schema": "tenant"}

    harvest_id: Mapped[str] = mapped_column(Text, primary_key=True)
    harvest_date: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, primary_key=True, server_default="NOW()"
    )
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    cycle_id: Mapped[str] = mapped_column(Text, nullable=False)
    pu_id: Mapped[str] = mapped_column(Text, nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    production_id: Mapped[str] = mapped_column(Text, nullable=False)
    gross_yield_kg: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    marketable_yield_kg: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    waste_kg: Mapped[Decimal] = mapped_column(
        Numeric(10, 3), nullable=False, server_default="0"
    )
    grade_A_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 3), server_default="0")
    grade_B_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 3), server_default="0")
    grade_C_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 3), server_default="0")
    harvested_by_worker_id: Mapped[Optional[str]] = mapped_column(Text)
    harvest_method: Mapped[Optional[str]] = mapped_column(Text)
    quality_notes: Mapped[Optional[str]] = mapped_column(Text)
    photo_url: Mapped[Optional[str]] = mapped_column(Text)
    # Chemical compliance — must be TRUE before sale is permitted
    chemical_compliance_cleared: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    last_chemical_date: Mapped[Optional[date]] = mapped_column(Date)
    whd_clearance_date: Mapped[Optional[date]] = mapped_column(Date)
    compliance_override: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    compliance_override_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    compliance_override_reason: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    cycle: Mapped[ProductionCycle] = relationship(
        "ProductionCycle",
        foreign_keys=[cycle_id],
        primaryjoin="HarvestLog.cycle_id == ProductionCycle.cycle_id",
        back_populates="harvest_logs",
    )

    def __repr__(self) -> str:
        return (
            f"<HarvestLog id={self.harvest_id!r} "
            f"date={self.harvest_date} "
            f"gross_kg={self.gross_yield_kg} "
            f"compliant={self.chemical_compliance_cleared}>"
        )


# =============================================================================
# TABLE 14: tenant.income_log  (TimescaleDB hypertable — 7-day chunks)
# All revenue transactions. Composite PK: (income_id, transaction_date).
# =============================================================================

class IncomeLog(TenantBase):
    __tablename__ = "income_log"
    __table_args__ = {"schema": "tenant"}

    income_id: Mapped[str] = mapped_column(Text, primary_key=True)
    transaction_date: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, primary_key=True, server_default="NOW()"
    )
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    cycle_id: Mapped[Optional[str]] = mapped_column(Text)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    customer_id: Mapped[Optional[str]] = mapped_column(Text)
    production_id: Mapped[Optional[str]] = mapped_column(Text)
    income_type: Mapped[str] = mapped_column(Text, nullable=False)
    quantity_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 3))
    unit_price_fjd: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4))
    gross_amount_fjd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    discount_fjd: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), server_default="0")
    net_amount_fjd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_method: Mapped[Optional[str]] = mapped_column(Text)
    payment_status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'PENDING'"
    )
    payment_received_date: Mapped[Optional[date]] = mapped_column(Date)
    invoice_number: Mapped[Optional[str]] = mapped_column(Text)
    is_related_party: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    delivery_address: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    cycle: Mapped[Optional[ProductionCycle]] = relationship(
        "ProductionCycle",
        foreign_keys=[cycle_id],
        primaryjoin="IncomeLog.cycle_id == ProductionCycle.cycle_id",
        back_populates="income_logs",
    )

    def __repr__(self) -> str:
        return (
            f"<IncomeLog id={self.income_id!r} "
            f"type={self.income_type!r} "
            f"net_fjd={self.net_amount_fjd} "
            f"status={self.payment_status!r}>"
        )


# =============================================================================
# TABLE 15: tenant.labor_attendance  (TimescaleDB hypertable — 7-day chunks)
# Daily worker attendance and pay records.
# Composite PK: (attendance_id, work_date).
# =============================================================================

class LaborAttendance(TenantBase):
    __tablename__ = "labor_attendance"
    __table_args__ = {"schema": "tenant"}

    attendance_id: Mapped[str] = mapped_column(Text, primary_key=True)
    work_date: Mapped[datetime] = mapped_column(TIMESTAMPTZ, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    worker_id: Mapped[str] = mapped_column(Text, nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    cycle_id: Mapped[Optional[str]] = mapped_column(Text)
    hours_worked: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, server_default="8"
    )
    daily_rate_fjd: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    total_pay_fjd: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    task_description: Mapped[Optional[str]] = mapped_column(Text)
    pu_id: Mapped[Optional[str]] = mapped_column(Text)
    overtime_hours: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(5, 2), server_default="0"
    )
    overtime_rate_fjd: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2))
    overtime_pay_fjd: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 2), server_default="0"
    )
    payment_status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'PENDING'"
    )
    payment_date: Mapped[Optional[date]] = mapped_column(Date)
    approved_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    cycle: Mapped[Optional[ProductionCycle]] = relationship(
        "ProductionCycle",
        foreign_keys=[cycle_id],
        primaryjoin="LaborAttendance.cycle_id == ProductionCycle.cycle_id",
        back_populates="labor_attendance",
    )

    def __repr__(self) -> str:
        return (
            f"<LaborAttendance id={self.attendance_id!r} "
            f"worker={self.worker_id!r} "
            f"date={self.work_date} "
            f"pay={self.total_pay_fjd}>"
        )


# =============================================================================
# TABLE 16: tenant.weather_log  (TimescaleDB hypertable — 7-day chunks)
# Farm-level weather observations and cyclone alerts.
# Composite PK: (log_id, logged_at).
# =============================================================================

class WeatherLog(TenantBase):
    __tablename__ = "weather_log"
    __table_args__ = {"schema": "tenant"}

    log_id: Mapped[str] = mapped_column(Text, primary_key=True)
    logged_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, primary_key=True, server_default="NOW()"
    )
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    rainfall_mm: Mapped[Optional[Decimal]] = mapped_column(Numeric(7, 2))
    temp_max_c: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    temp_min_c: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    humidity_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    wind_speed_kmh: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2))
    wind_direction: Mapped[Optional[str]] = mapped_column(Text)
    weather_condition: Mapped[Optional[str]] = mapped_column(Text)
    cyclone_alert: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    cyclone_name: Mapped[Optional[str]] = mapped_column(Text)
    source: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'MANUAL'"
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    def __repr__(self) -> str:
        return (
            f"<WeatherLog id={self.log_id!r} "
            f"farm={self.farm_id!r} "
            f"at={self.logged_at} "
            f"rain_mm={self.rainfall_mm} "
            f"cyclone={self.cyclone_alert}>"
        )
