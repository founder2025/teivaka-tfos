"""
app/models/financial.py
Teivaka Agri-TOS — SQLAlchemy 2.0 ORM models for financial summary tables.

Covers:
  tenant.cycle_financials      — per-cycle P&L summary (trigger-maintained)
  tenant.profit_share          — profit share calculations (landowner split)
  tenant.accounts_receivable   — AR tracking with GENERATED STORED days_overdue
  tenant.price_master          — price schedule (farm/customer/default)

IMPORTANT:
- cycle_financials columns are recomputed by fn_compute_cycle_financials trigger.
  Do not manually update individual cost/revenue columns from Python.
- accounts_receivable.days_overdue is a PostgreSQL GENERATED ALWAYS AS STORED
  column. SQLAlchemy maps it as server_default / fetch-only — never write it.

Source: 02_database/schema/02_tenant_schema.sql (tables 24–27)
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import TIMESTAMP, UUID
TIMESTAMPTZ = TIMESTAMP(timezone=True)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.tenant import TenantBase


# =============================================================================
# TABLE 24: tenant.cycle_financials
# One row per production cycle — full P&L summary updated by DB triggers.
# cycle_id has a UNIQUE constraint (one financial summary per cycle).
# cogk_fjd_per_kg is NULL when total_harvest_kg = 0 (avoids division by zero).
# =============================================================================

class CycleFinancials(TenantBase):
    __tablename__ = "cycle_financials"
    __table_args__ = (
        UniqueConstraint("cycle_id", name="uq_cycle_financials_cycle_id"),
        {"schema": "tenant"},
    )

    financial_id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    cycle_id: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    total_labor_cost_fjd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, server_default="0"
    )
    total_input_cost_fjd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, server_default="0"
    )
    total_other_cost_fjd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, server_default="0"
    )
    total_cost_fjd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, server_default="0"
    )
    total_revenue_fjd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, server_default="0"
    )
    gross_profit_fjd: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    gross_margin_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2))
    total_harvest_kg: Mapped[Decimal] = mapped_column(
        Numeric(10, 3), nullable=False, server_default="0"
    )
    # NULL when total_harvest_kg = 0 — undefined cost per kg with zero yield
    cogk_fjd_per_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4))
    labor_cost_ratio_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2))
    harvest_variance_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2))
    last_computed_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    def __repr__(self) -> str:
        return (
            f"<CycleFinancials id={self.financial_id!r} "
            f"cycle={self.cycle_id!r} "
            f"revenue={self.total_revenue_fjd} "
            f"cost={self.total_cost_fjd} "
            f"cogk={self.cogk_fjd_per_kg}>"
        )


# =============================================================================
# TABLE 25: tenant.profit_share
# Per-cycle profit split between operator and landowner.
# Only created when Farm.profit_share_enabled = TRUE.
# Both landowner_share_fjd and operator_share_fjd are NOT NULL.
# =============================================================================

class ProfitShare(TenantBase):
    __tablename__ = "profit_share"
    __table_args__ = {"schema": "tenant"}

    share_id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    cycle_id: Mapped[str] = mapped_column(Text, nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    calculation_date: Mapped[date] = mapped_column(
        Date, nullable=False, server_default="CURRENT_DATE"
    )
    gross_revenue_fjd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total_cost_fjd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    net_profit_fjd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    share_rate_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    # Both shares are always stored — NOT NULL
    landowner_share_fjd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    operator_share_fjd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    landowner_name: Mapped[str] = mapped_column(Text, nullable=False)
    payment_status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'PENDING'"
    )
    payment_date: Mapped[Optional[date]] = mapped_column(Date)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    calculated_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    def __repr__(self) -> str:
        return (
            f"<ProfitShare id={self.share_id!r} "
            f"cycle={self.cycle_id!r} "
            f"net={self.net_profit_fjd} "
            f"landowner={self.landowner_share_fjd} "
            f"operator={self.operator_share_fjd} "
            f"status={self.payment_status!r}>"
        )


# =============================================================================
# TABLE 26: tenant.accounts_receivable
# Outstanding receivables. income_id is a SOFT reference to income_log
# (no FK because TimescaleDB hypertables cannot be referenced with composite FKs).
# Join via income_id + transaction_date when querying income_log.
#
# days_overdue is a PostgreSQL GENERATED ALWAYS AS STORED column:
#   CASE WHEN ar_status NOT IN ('PAID','WRITTEN_OFF')
#        THEN GREATEST(0, CURRENT_DATE - due_date) ELSE 0 END
# SQLAlchemy never writes this column. It is fetched automatically on SELECT.
# =============================================================================

class AccountsReceivable(TenantBase):
    __tablename__ = "accounts_receivable"
    __table_args__ = {"schema": "tenant"}

    ar_id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    customer_id: Mapped[str] = mapped_column(Text, nullable=False)
    # Soft reference — no DB FK due to TimescaleDB composite PK limitation
    income_id: Mapped[Optional[str]] = mapped_column(Text)
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    invoice_amount_fjd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    amount_received_fjd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, server_default="0"
    )
    outstanding_fjd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    ar_status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'OPEN'"
    )
    # GENERATED ALWAYS AS STORED — PostgreSQL computes this; never write from Python.
    # Mapped as Optional[int] so SQLAlchemy fetches but never emits in INSERT/UPDATE.
    days_overdue: Mapped[Optional[int]] = mapped_column(
        Integer,
        # Tell SQLAlchemy this column is server-computed; exclude from inserts/updates
        insert_default=None,
        default=None,
        server_default=None,
    )
    collection_notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    def __repr__(self) -> str:
        return (
            f"<AccountsReceivable id={self.ar_id!r} "
            f"customer={self.customer_id!r} "
            f"outstanding={self.outstanding_fjd} "
            f"days_overdue={self.days_overdue} "
            f"status={self.ar_status!r}>"
        )


# =============================================================================
# TABLE 27: tenant.price_master
# Price schedule per production, optionally scoped to farm and/or customer.
# farm_id NULL  → price applies to all farms for this tenant.
# customer_id NULL → default price (not customer-specific).
# =============================================================================

class PriceMaster(TenantBase):
    __tablename__ = "price_master"
    __table_args__ = {"schema": "tenant"}

    price_id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    # NULL = applies to all farms under this tenant
    farm_id: Mapped[Optional[str]] = mapped_column(Text)
    production_id: Mapped[str] = mapped_column(Text, nullable=False)
    # NULL = default price (not customer-specific)
    customer_id: Mapped[Optional[str]] = mapped_column(Text)
    price_type: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'DEFAULT'"
    )
    price_fjd_per_kg: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    effective_from: Mapped[date] = mapped_column(
        Date, nullable=False, server_default="CURRENT_DATE"
    )
    effective_to: Mapped[Optional[date]] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    def __repr__(self) -> str:
        return (
            f"<PriceMaster id={self.price_id!r} "
            f"production={self.production_id!r} "
            f"type={self.price_type!r} "
            f"price={self.price_fjd_per_kg}/kg "
            f"farm={self.farm_id!r} "
            f"customer={self.customer_id!r}>"
        )
