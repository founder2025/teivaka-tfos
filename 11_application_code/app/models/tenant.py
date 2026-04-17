"""
app/models/tenant.py
Teivaka Agri-TOS — SQLAlchemy 2.0 ORM models for core tenant entity tables.

Covers:
  tenant.tenants, tenant.users, tenant.farms, tenant.zones,
  tenant.production_units, tenant.workers, tenant.suppliers,
  tenant.customers, tenant.equipment

Source: 02_database/schema/02_tenant_schema.sql (tables 1–9)
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
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import TIMESTAMP, UUID
TIMESTAMPTZ = TIMESTAMP(timezone=True)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class TenantBase(DeclarativeBase):
    """Declarative base for all tenant.* schema models."""
    pass


# =============================================================================
# TABLE 1: tenant.tenants
# Root table — one row per tenant organisation. No RLS (service account only).
# =============================================================================

class Tenant(TenantBase):
    __tablename__ = "tenants"
    __table_args__ = {"schema": "tenant"}

    tenant_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default="gen_random_uuid()"
    )
    company_name: Mapped[str] = mapped_column(Text, nullable=False)
    company_reg_no: Mapped[Optional[str]] = mapped_column(Text, unique=True)
    subscription_tier: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'FREE'"
    )
    subscription_status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'ACTIVE'"
    )
    subscription_start: Mapped[Optional[date]] = mapped_column(Date)
    subscription_end: Mapped[Optional[date]] = mapped_column(Date)
    tis_calls_today: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    tis_calls_reset_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    tis_daily_limit: Mapped[int] = mapped_column(Integer, nullable=False, server_default="5")
    primary_contact_name: Mapped[Optional[str]] = mapped_column(Text)
    primary_contact_email: Mapped[Optional[str]] = mapped_column(Text)
    primary_contact_phone: Mapped[Optional[str]] = mapped_column(Text)
    country: Mapped[str] = mapped_column(Text, nullable=False, server_default="'FJ'")
    timezone: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'Pacific/Fiji'"
    )
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(Text)
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    # relationships
    users: Mapped[List[User]] = relationship("User", back_populates="tenant")
    farms: Mapped[List[Farm]] = relationship("Farm", back_populates="tenant")

    def __repr__(self) -> str:
        return (
            f"<Tenant id={self.tenant_id!r} "
            f"company={self.company_name!r} "
            f"tier={self.subscription_tier!r}>"
        )


# =============================================================================
# TABLE 2: tenant.users
# One row per human user. RLS enforced.
# =============================================================================

class User(TenantBase):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),
        {"schema": "tenant"},
    )

    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default="gen_random_uuid()"
    )
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    supabase_auth_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False), unique=True)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False, server_default="'VIEWER'")
    phone: Mapped[Optional[str]] = mapped_column(Text)
    preferred_language: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'en'"
    )
    whatsapp_number: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    last_login: Mapped[Optional[datetime]] = mapped_column(TIMESTAMPTZ)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    tenant: Mapped[Tenant] = relationship("Tenant", back_populates="users")

    def __repr__(self) -> str:
        return (
            f"<User id={self.user_id!r} "
            f"email={self.email!r} "
            f"role={self.role!r}>"
        )


# =============================================================================
# TABLE 3: tenant.farms
# Each tenant can have multiple farms. RLS enforced.
# =============================================================================

class Farm(TenantBase):
    __tablename__ = "farms"
    __table_args__ = {"schema": "tenant"}

    farm_id: Mapped[str] = mapped_column(Text, primary_key=True)  # F001, F002
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    farm_name: Mapped[str] = mapped_column(Text, nullable=False)
    location_name: Mapped[str] = mapped_column(Text, nullable=False)
    location_province: Mapped[Optional[str]] = mapped_column(Text)
    location_island: Mapped[Optional[str]] = mapped_column(Text)
    land_area_ha: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    operational_start: Mapped[Optional[date]] = mapped_column(Date)
    farm_type: Mapped[str] = mapped_column(Text, nullable=False, server_default="'OWNED'")
    profit_share_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    profit_share_rate_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    profit_share_party: Mapped[Optional[str]] = mapped_column(Text)
    island_logistics: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    ferry_supplier_id: Mapped[Optional[str]] = mapped_column(Text)
    ferry_frequency_days: Mapped[Optional[int]] = mapped_column(Integer, server_default="7")
    ferry_buffer_days: Mapped[Optional[int]] = mapped_column(Integer, server_default="3")
    gps_lat: Mapped[Optional[Decimal]] = mapped_column(Numeric(9, 6))
    gps_lng: Mapped[Optional[Decimal]] = mapped_column(Numeric(9, 6))
    timezone: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'Pacific/Fiji'"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    tenant: Mapped[Tenant] = relationship("Tenant", back_populates="farms")
    zones: Mapped[List[Zone]] = relationship("Zone", back_populates="farm")
    production_units: Mapped[List[ProductionUnit]] = relationship(
        "ProductionUnit", back_populates="farm"
    )
    workers: Mapped[List[Worker]] = relationship("Worker", back_populates="farm")
    suppliers: Mapped[List[Supplier]] = relationship("Supplier", back_populates="tenant", viewonly=True)
    equipment_list: Mapped[List[Equipment]] = relationship("Equipment", back_populates="farm")

    def __repr__(self) -> str:
        return (
            f"<Farm id={self.farm_id!r} "
            f"name={self.farm_name!r} "
            f"island={self.location_island!r} "
            f"profit_share={self.profit_share_enabled}>"
        )


# =============================================================================
# TABLE 4: tenant.zones
# Farm zones — crop/livestock/nursery areas. RLS enforced.
# =============================================================================

class Zone(TenantBase):
    __tablename__ = "zones"
    __table_args__ = {"schema": "tenant"}

    zone_id: Mapped[str] = mapped_column(Text, primary_key=True)  # F001-Z01
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    zone_name: Mapped[str] = mapped_column(Text, nullable=False)
    zone_type: Mapped[str] = mapped_column(Text, nullable=False)
    area_ha: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 3))
    soil_type: Mapped[Optional[str]] = mapped_column(Text)
    irrigation_type: Mapped[Optional[str]] = mapped_column(Text)
    sun_exposure: Mapped[Optional[str]] = mapped_column(Text)
    current_crop_family: Mapped[Optional[str]] = mapped_column(Text)
    last_rest_start: Mapped[Optional[date]] = mapped_column(Date)
    last_rest_end: Mapped[Optional[date]] = mapped_column(Date)
    gps_lat: Mapped[Optional[Decimal]] = mapped_column(Numeric(9, 6))
    gps_lng: Mapped[Optional[Decimal]] = mapped_column(Numeric(9, 6))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    farm: Mapped[Farm] = relationship("Farm", back_populates="zones")
    production_units: Mapped[List[ProductionUnit]] = relationship(
        "ProductionUnit", back_populates="zone"
    )

    def __repr__(self) -> str:
        return (
            f"<Zone id={self.zone_id!r} "
            f"farm={self.farm_id!r} "
            f"type={self.zone_type!r}>"
        )


# =============================================================================
# TABLE 5: tenant.production_units
# Individual planting beds/plots/ponds. RLS enforced.
# =============================================================================

class ProductionUnit(TenantBase):
    __tablename__ = "production_units"
    __table_args__ = {"schema": "tenant"}

    pu_id: Mapped[str] = mapped_column(Text, primary_key=True)  # F001-Z01-PU01
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    zone_id: Mapped[str] = mapped_column(Text, nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    pu_name: Mapped[str] = mapped_column(Text, nullable=False)
    pu_type: Mapped[str] = mapped_column(Text, nullable=False)
    area_sqm: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    current_production_id: Mapped[Optional[str]] = mapped_column(Text)
    current_cycle_id: Mapped[Optional[str]] = mapped_column(Text)
    soil_ph: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 2))
    last_soil_test_date: Mapped[Optional[date]] = mapped_column(Date)
    bed_number: Mapped[Optional[int]] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    zone: Mapped[Zone] = relationship("Zone", back_populates="production_units")
    farm: Mapped[Farm] = relationship("Farm", back_populates="production_units")

    def __repr__(self) -> str:
        return (
            f"<ProductionUnit id={self.pu_id!r} "
            f"type={self.pu_type!r} "
            f"production={self.current_production_id!r}>"
        )


# =============================================================================
# TABLE 6: tenant.workers
# Farm workforce. RLS enforced.
# =============================================================================

class Worker(TenantBase):
    __tablename__ = "workers"
    __table_args__ = {"schema": "tenant"}

    worker_id: Mapped[str] = mapped_column(Text, primary_key=True)  # W-001
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    worker_type: Mapped[str] = mapped_column(Text, nullable=False)
    daily_rate_fjd: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2))
    phone: Mapped[Optional[str]] = mapped_column(Text)
    whatsapp_number: Mapped[Optional[str]] = mapped_column(Text)
    emergency_contact: Mapped[Optional[str]] = mapped_column(Text)
    skills: Mapped[Optional[List[str]]] = mapped_column(ARRAY(Text))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    start_date: Mapped[Optional[date]] = mapped_column(Date)
    end_date: Mapped[Optional[date]] = mapped_column(Date)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    farm: Mapped[Farm] = relationship("Farm", back_populates="workers")

    def __repr__(self) -> str:
        return (
            f"<Worker id={self.worker_id!r} "
            f"name={self.full_name!r} "
            f"type={self.worker_type!r} "
            f"rate={self.daily_rate_fjd}>"
        )


# =============================================================================
# TABLE 7: tenant.suppliers
# Input/equipment/shipping suppliers. RLS enforced.
# =============================================================================

class Supplier(TenantBase):
    __tablename__ = "suppliers"
    __table_args__ = {"schema": "tenant"}

    supplier_id: Mapped[str] = mapped_column(Text, primary_key=True)  # SUP-001
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    supplier_name: Mapped[str] = mapped_column(Text, nullable=False)
    supplier_type: Mapped[str] = mapped_column(Text, nullable=False)
    contact_name: Mapped[Optional[str]] = mapped_column(Text)
    phone: Mapped[Optional[str]] = mapped_column(Text)
    whatsapp_number: Mapped[Optional[str]] = mapped_column(Text)
    email: Mapped[Optional[str]] = mapped_column(Text)
    address: Mapped[Optional[str]] = mapped_column(Text)
    island: Mapped[Optional[str]] = mapped_column(Text)
    payment_terms_days: Mapped[Optional[int]] = mapped_column(Integer, server_default="30")
    credit_limit_fjd: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    is_preferred: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    # viewonly back-ref via tenant_id (no direct FK to Farm)
    tenant: Mapped[Optional[Tenant]] = relationship(
        "Tenant",
        foreign_keys=[tenant_id],
        primaryjoin="Supplier.tenant_id == Tenant.tenant_id",
        back_populates="suppliers",
        viewonly=True,
    )

    def __repr__(self) -> str:
        return (
            f"<Supplier id={self.supplier_id!r} "
            f"name={self.supplier_name!r} "
            f"type={self.supplier_type!r}>"
        )


# patch Tenant.suppliers relationship
Tenant.suppliers = relationship(
    "Supplier",
    foreign_keys="[Supplier.tenant_id]",
    primaryjoin="Tenant.tenant_id == Supplier.tenant_id",
    back_populates="tenant",
)


# =============================================================================
# TABLE 8: tenant.customers
# Sales customers — direct, wholesale, restaurant, export, related party.
# RLS enforced.
# =============================================================================

class Customer(TenantBase):
    __tablename__ = "customers"
    __table_args__ = {"schema": "tenant"}

    customer_id: Mapped[str] = mapped_column(Text, primary_key=True)  # CUS-001
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    customer_name: Mapped[str] = mapped_column(Text, nullable=False)
    customer_type: Mapped[str] = mapped_column(Text, nullable=False)
    contact_name: Mapped[Optional[str]] = mapped_column(Text)
    phone: Mapped[Optional[str]] = mapped_column(Text)
    whatsapp_number: Mapped[Optional[str]] = mapped_column(Text)
    email: Mapped[Optional[str]] = mapped_column(Text)
    address: Mapped[Optional[str]] = mapped_column(Text)
    island: Mapped[Optional[str]] = mapped_column(Text)
    payment_terms_days: Mapped[Optional[int]] = mapped_column(Integer, server_default="7")
    credit_limit_fjd: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 2), server_default="0"
    )
    is_related_party: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    related_party_notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    def __repr__(self) -> str:
        return (
            f"<Customer id={self.customer_id!r} "
            f"name={self.customer_name!r} "
            f"type={self.customer_type!r} "
            f"related_party={self.is_related_party}>"
        )


# =============================================================================
# TABLE 9: tenant.equipment
# Farm equipment registry. RLS enforced.
# =============================================================================

class Equipment(TenantBase):
    __tablename__ = "equipment"
    __table_args__ = {"schema": "tenant"}

    equipment_id: Mapped[str] = mapped_column(Text, primary_key=True)  # EQP-001
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    equipment_name: Mapped[str] = mapped_column(Text, nullable=False)
    equipment_type: Mapped[str] = mapped_column(Text, nullable=False)
    brand: Mapped[Optional[str]] = mapped_column(Text)
    model: Mapped[Optional[str]] = mapped_column(Text)
    serial_number: Mapped[Optional[str]] = mapped_column(Text)
    purchase_date: Mapped[Optional[date]] = mapped_column(Date)
    purchase_cost_fjd: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    current_value_fjd: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    condition: Mapped[Optional[str]] = mapped_column(Text)
    last_service_date: Mapped[Optional[date]] = mapped_column(Date)
    next_service_date: Mapped[Optional[date]] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    farm: Mapped[Farm] = relationship("Farm", back_populates="equipment_list")

    def __repr__(self) -> str:
        return (
            f"<Equipment id={self.equipment_id!r} "
            f"name={self.equipment_name!r} "
            f"type={self.equipment_type!r} "
            f"condition={self.condition!r}>"
        )
