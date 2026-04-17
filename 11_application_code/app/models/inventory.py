"""
app/models/inventory.py
Teivaka Agri-TOS — SQLAlchemy 2.0 ORM models for inventory and supply chain tables.

Covers:
  tenant.inputs              — inventory master (stock updated by DB trigger)
  tenant.input_transactions  — stock movement ledger
  tenant.orders              — purchase and sales orders
  tenant.order_line_items    — order line detail
  tenant.cash_ledger         — petty cash / bank transactions
  tenant.delivery_log        — inbound/outbound deliveries (inc. ferry logistics)
  tenant.nursery_log         — seedling nursery batches
  tenant.harvest_loss        — loss event records

IMPORTANT: Input.current_stock_qty is maintained exclusively by DB triggers
(fn_update_input_stock in 05_functions.sql). Never update this column from the
application layer — use InputTransaction inserts instead.

Source: 02_database/schema/02_tenant_schema.sql (tables 10, 17–23)
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
from sqlalchemy.dialects.postgresql import TIMESTAMP, UUID
TIMESTAMPTZ = TIMESTAMP(timezone=True)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.tenant import TenantBase


# =============================================================================
# TABLE 10: tenant.inputs
# Inventory master — one row per input SKU per tenant.
# current_stock_qty is maintained by DB trigger; do not write from app layer.
# =============================================================================

class Input(TenantBase):
    __tablename__ = "inputs"
    __table_args__ = {"schema": "tenant"}

    input_id: Mapped[str] = mapped_column(Text, primary_key=True)  # INP-001
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    input_name: Mapped[str] = mapped_column(Text, nullable=False)
    input_category: Mapped[str] = mapped_column(Text, nullable=False)
    unit_of_measure: Mapped[str] = mapped_column(Text, nullable=False)  # kg, L, pkt, unit
    # Maintained by trigger fn_update_input_stock — do NOT write from Python
    current_stock_qty: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), nullable=False, server_default="0"
    )
    reorder_point_qty: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 3))
    reorder_qty: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 3))
    unit_cost_fjd: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4))
    preferred_supplier_id: Mapped[Optional[str]] = mapped_column(Text)
    is_chemical: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    # FK to shared.chemical_library (cross-schema soft ref)
    chemical_id: Mapped[Optional[str]] = mapped_column(Text)
    storage_location: Mapped[Optional[str]] = mapped_column(Text)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    transactions: Mapped[List[InputTransaction]] = relationship(
        "InputTransaction", back_populates="input"
    )
    order_lines: Mapped[List[OrderLineItem]] = relationship(
        "OrderLineItem", back_populates="input"
    )

    def __repr__(self) -> str:
        return (
            f"<Input id={self.input_id!r} "
            f"name={self.input_name!r} "
            f"stock={self.current_stock_qty} {self.unit_of_measure} "
            f"chemical={self.is_chemical}>"
        )


# =============================================================================
# TABLE 17: tenant.input_transactions
# Every stock movement — purchases increase qty, usage/waste decrease (negative).
# qty_change is negative for USAGE, WASTE, RETURN.
# =============================================================================

class InputTransaction(TenantBase):
    __tablename__ = "input_transactions"
    __table_args__ = {"schema": "tenant"}

    txn_id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    input_id: Mapped[str] = mapped_column(Text, nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    txn_type: Mapped[str] = mapped_column(Text, nullable=False)
    txn_date: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    # Negative for USAGE / WASTE / RETURN / TRANSFER out
    qty_change: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    qty_before: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    qty_after: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    unit_cost_fjd: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4))
    total_cost_fjd: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    cycle_id: Mapped[Optional[str]] = mapped_column(Text)
    pu_id: Mapped[Optional[str]] = mapped_column(Text)
    supplier_id: Mapped[Optional[str]] = mapped_column(Text)
    purchase_order_no: Mapped[Optional[str]] = mapped_column(Text)
    delivery_note_no: Mapped[Optional[str]] = mapped_column(Text)
    performed_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    input: Mapped[Input] = relationship(
        "Input",
        foreign_keys=[input_id],
        primaryjoin="InputTransaction.input_id == Input.input_id",
        back_populates="transactions",
    )

    def __repr__(self) -> str:
        return (
            f"<InputTransaction id={self.txn_id!r} "
            f"type={self.txn_type!r} "
            f"qty_change={self.qty_change} "
            f"after={self.qty_after}>"
        )


# =============================================================================
# TABLE 18: tenant.delivery_log
# Inbound and outbound deliveries. Includes ferry vessel tracking for
# island-logistics farms (ferry_supplier_id, ferry_vessel, etc.).
# =============================================================================

class DeliveryLog(TenantBase):
    __tablename__ = "delivery_log"
    __table_args__ = {"schema": "tenant"}

    delivery_id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    delivery_type: Mapped[str] = mapped_column(Text, nullable=False)  # INBOUND | OUTBOUND
    delivery_date: Mapped[date] = mapped_column(Date, nullable=False)
    supplier_id: Mapped[Optional[str]] = mapped_column(Text)
    customer_id: Mapped[Optional[str]] = mapped_column(Text)
    transport_method: Mapped[Optional[str]] = mapped_column(Text)
    ferry_vessel: Mapped[Optional[str]] = mapped_column(Text)
    ferry_departure_port: Mapped[Optional[str]] = mapped_column(Text)
    ferry_arrival_port: Mapped[Optional[str]] = mapped_column(Text)
    items_description: Mapped[str] = mapped_column(Text, nullable=False)
    total_weight_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 3))
    freight_cost_fjd: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    delivery_status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'PENDING'"
    )
    estimated_arrival: Mapped[Optional[date]] = mapped_column(Date)
    actual_arrival: Mapped[Optional[date]] = mapped_column(Date)
    delay_reason: Mapped[Optional[str]] = mapped_column(Text)
    driver_contact: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    def __repr__(self) -> str:
        return (
            f"<DeliveryLog id={self.delivery_id!r} "
            f"type={self.delivery_type!r} "
            f"date={self.delivery_date} "
            f"status={self.delivery_status!r} "
            f"transport={self.transport_method!r}>"
        )


# =============================================================================
# TABLE 19: tenant.nursery_log
# Seedling nursery batch records — germination and transplant tracking.
# =============================================================================

class NurseryLog(TenantBase):
    __tablename__ = "nursery_log"
    __table_args__ = {"schema": "tenant"}

    nursery_id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    production_id: Mapped[str] = mapped_column(Text, nullable=False)
    batch_date: Mapped[date] = mapped_column(Date, nullable=False)
    seed_source: Mapped[Optional[str]] = mapped_column(Text)
    seed_qty_planted: Mapped[int] = mapped_column(Integer, nullable=False)
    germination_count: Mapped[Optional[int]] = mapped_column(Integer)
    germination_rate_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    transplant_ready_date: Mapped[Optional[date]] = mapped_column(Date)
    transplant_count: Mapped[Optional[int]] = mapped_column(Integer)
    mortality_count: Mapped[Optional[int]] = mapped_column(Integer)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    def __repr__(self) -> str:
        return (
            f"<NurseryLog id={self.nursery_id!r} "
            f"production={self.production_id!r} "
            f"batch={self.batch_date} "
            f"planted={self.seed_qty_planted} "
            f"germinated={self.germination_count}>"
        )


# =============================================================================
# TABLE 20: tenant.harvest_loss
# Loss events — pest damage, weather, theft, spoilage, etc.
# =============================================================================

class HarvestLoss(TenantBase):
    __tablename__ = "harvest_loss"
    __table_args__ = {"schema": "tenant"}

    loss_id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    cycle_id: Mapped[str] = mapped_column(Text, nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    loss_date: Mapped[date] = mapped_column(Date, nullable=False)
    loss_type: Mapped[str] = mapped_column(Text, nullable=False)
    estimated_loss_kg: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    estimated_value_fjd: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    corrective_action: Mapped[Optional[str]] = mapped_column(Text)
    photo_url: Mapped[Optional[str]] = mapped_column(Text)
    reported_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    def __repr__(self) -> str:
        return (
            f"<HarvestLoss id={self.loss_id!r} "
            f"type={self.loss_type!r} "
            f"loss_kg={self.estimated_loss_kg} "
            f"date={self.loss_date}>"
        )


# =============================================================================
# TABLE 21: tenant.cash_ledger
# Farm-level cash / bank transaction ledger with running balance.
# =============================================================================

class CashLedger(TenantBase):
    __tablename__ = "cash_ledger"
    __table_args__ = {"schema": "tenant"}

    ledger_id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    transaction_type: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    amount_fjd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    running_balance_fjd: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2))
    reference_id: Mapped[Optional[str]] = mapped_column(Text)
    reference_type: Mapped[Optional[str]] = mapped_column(Text)
    payment_method: Mapped[Optional[str]] = mapped_column(Text)
    bank_account: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    def __repr__(self) -> str:
        return (
            f"<CashLedger id={self.ledger_id!r} "
            f"type={self.transaction_type!r} "
            f"amount={self.amount_fjd} "
            f"balance={self.running_balance_fjd}>"
        )


# =============================================================================
# TABLE 22: tenant.orders
# Purchase orders (inputs) and sales orders (produce). RLS enforced.
# =============================================================================

class Order(TenantBase):
    __tablename__ = "orders"
    __table_args__ = {"schema": "tenant"}

    order_id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    order_type: Mapped[str] = mapped_column(Text, nullable=False)  # PURCHASE | SALES
    order_date: Mapped[date] = mapped_column(Date, nullable=False, server_default="CURRENT_DATE")
    supplier_id: Mapped[Optional[str]] = mapped_column(Text)
    customer_id: Mapped[Optional[str]] = mapped_column(Text)
    order_status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'DRAFT'"
    )
    expected_delivery_date: Mapped[Optional[date]] = mapped_column(Date)
    actual_delivery_date: Mapped[Optional[date]] = mapped_column(Date)
    total_amount_fjd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, server_default="0"
    )
    discount_fjd: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), server_default="0")
    freight_cost_fjd: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 2), server_default="0"
    )
    net_amount_fjd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, server_default="0"
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    line_items: Mapped[List[OrderLineItem]] = relationship(
        "OrderLineItem", back_populates="order", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return (
            f"<Order id={self.order_id!r} "
            f"type={self.order_type!r} "
            f"status={self.order_status!r} "
            f"net={self.net_amount_fjd}>"
        )


# =============================================================================
# TABLE 23: tenant.order_line_items
# Line detail for purchase and sales orders.
# =============================================================================

class OrderLineItem(TenantBase):
    __tablename__ = "order_line_items"
    __table_args__ = {"schema": "tenant"}

    line_id: Mapped[str] = mapped_column(Text, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    order_id: Mapped[str] = mapped_column(Text, nullable=False)
    input_id: Mapped[Optional[str]] = mapped_column(Text)
    production_id: Mapped[Optional[str]] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    unit_of_measure: Mapped[str] = mapped_column(Text, nullable=False)
    unit_price_fjd: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    total_fjd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    order: Mapped[Order] = relationship(
        "Order",
        foreign_keys=[order_id],
        primaryjoin="OrderLineItem.order_id == Order.order_id",
        back_populates="line_items",
    )
    input: Mapped[Optional[Input]] = relationship(
        "Input",
        foreign_keys=[input_id],
        primaryjoin="OrderLineItem.input_id == Input.input_id",
        back_populates="order_lines",
    )

    def __repr__(self) -> str:
        return (
            f"<OrderLineItem id={self.line_id!r} "
            f"order={self.order_id!r} "
            f"desc={self.description!r} "
            f"qty={self.quantity} "
            f"total={self.total_fjd}>"
        )
