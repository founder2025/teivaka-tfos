"""
app/models/livestock.py
Teivaka Agri-TOS — SQLAlchemy 2.0 ORM models for livestock and apiculture tables.

Covers:
  tenant.livestock_register  — individual animal registry (goats, cattle, chicken, etc.)
  tenant.hive_register       — beehive registry (Langstroth, Top-Bar, etc.)

Both tables have zone_id as an optional FK (livestock may not be zone-assigned).
RLS enforced on both tables.

Source: 02_database/schema/02_tenant_schema.sql (tables 28–29)
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
)
from sqlalchemy.dialects.postgresql import TIMESTAMP, UUID
TIMESTAMPTZ = TIMESTAMP(timezone=True)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.tenant import TenantBase


# =============================================================================
# TABLE 28: tenant.livestock_register
# Individual animal records — one row per head of livestock.
# Species: GOAT, PIG, CATTLE, CHICKEN, DUCK, RABBIT, OTHER
# Status: ACTIVE, PREGNANT, SOLD, DECEASED, SLAUGHTERED
# =============================================================================

class LivestockRegister(TenantBase):
    __tablename__ = "livestock_register"
    __table_args__ = {"schema": "tenant"}

    livestock_id: Mapped[str] = mapped_column(Text, primary_key=True)
    # format: LSK-F001-001
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    # zone_id is optional — livestock may range across zones
    zone_id: Mapped[Optional[str]] = mapped_column(Text)
    species: Mapped[str] = mapped_column(Text, nullable=False)
    breed: Mapped[Optional[str]] = mapped_column(Text)
    tag_number: Mapped[Optional[str]] = mapped_column(Text)
    sex: Mapped[Optional[str]] = mapped_column(Text)
    birth_date: Mapped[Optional[date]] = mapped_column(Date)
    acquisition_date: Mapped[date] = mapped_column(
        Date, nullable=False, server_default="CURRENT_DATE"
    )
    acquisition_source: Mapped[Optional[str]] = mapped_column(Text)
    acquisition_cost_fjd: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    current_weight_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2))
    status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'ACTIVE'"
    )
    status_date: Mapped[Optional[date]] = mapped_column(Date)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    def __repr__(self) -> str:
        return (
            f"<LivestockRegister id={self.livestock_id!r} "
            f"species={self.species!r} "
            f"tag={self.tag_number!r} "
            f"sex={self.sex!r} "
            f"status={self.status!r} "
            f"weight_kg={self.current_weight_kg}>"
        )


# =============================================================================
# TABLE 29: tenant.hive_register
# Individual beehive records — one row per hive.
# Hive types: LANGSTROTH, TOP_BAR, WARRE, TRADITIONAL
# Colony strength: STRONG, MEDIUM, WEAK, QUEENLESS, EMPTY
# Status: ACTIVE, INACTIVE, DEAD, RELOCATED
# =============================================================================

class HiveRegister(TenantBase):
    __tablename__ = "hive_register"
    __table_args__ = {"schema": "tenant"}

    hive_id: Mapped[str] = mapped_column(Text, primary_key=True)
    # format: HIV-F001-001
    tenant_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    farm_id: Mapped[str] = mapped_column(Text, nullable=False)
    # zone_id optional — hive may be placed near field without zone assignment
    zone_id: Mapped[Optional[str]] = mapped_column(Text)
    hive_type: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'LANGSTROTH'"
    )
    installation_date: Mapped[Optional[date]] = mapped_column(Date)
    colony_strength: Mapped[Optional[str]] = mapped_column(Text)
    last_inspection_date: Mapped[Optional[date]] = mapped_column(Date)
    last_harvest_date: Mapped[Optional[date]] = mapped_column(Date)
    honey_yield_kg_last: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 3))
    varroa_treatment_date: Mapped[Optional[date]] = mapped_column(Date)
    varroa_treatment_product: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="'ACTIVE'"
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMPTZ, nullable=False, server_default="NOW()"
    )

    def __repr__(self) -> str:
        return (
            f"<HiveRegister id={self.hive_id!r} "
            f"type={self.hive_type!r} "
            f"strength={self.colony_strength!r} "
            f"status={self.status!r} "
            f"last_honey_kg={self.honey_yield_kg_last}>"
        )
