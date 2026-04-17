"""
app/models/shared.py
Teivaka Agri-TOS — SQLAlchemy 2.0 ORM models for shared.* schema
These tables are read-only reference data shared across ALL tenants.
No tenant_id columns. Write access is restricted to the service role.

Source: 02_database/schema/01_shared_schema.sql
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    ARRAY,
    Boolean,
    Date,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID
TIMESTAMPTZ = TIMESTAMP(timezone=True)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class SharedBase(DeclarativeBase):
    """Declarative base for all shared.* schema models."""
    pass


# =============================================================================
# TABLE 1: shared.productions
# Master list of all production types (crops, livestock, forestry, aquaculture)
# =============================================================================

class Production(SharedBase):
    __tablename__ = "productions"
    __table_args__ = {"schema": "shared"}

    production_id: Mapped[str] = mapped_column(Text, primary_key=True)
    production_name: Mapped[Optional[str]] = mapped_column(Text)
    local_name: Mapped[Optional[str]] = mapped_column(Text)
    category: Mapped[Optional[str]] = mapped_column(Text)
    plant_family: Mapped[Optional[str]] = mapped_column(Text)
    lifecycle: Mapped[Optional[str]] = mapped_column(Text)
    is_perennial: Mapped[Optional[bool]] = mapped_column(Boolean)
    is_livestock: Mapped[Optional[bool]] = mapped_column(Boolean)
    is_forestry: Mapped[Optional[bool]] = mapped_column(Boolean)
    is_aquaculture: Mapped[Optional[bool]] = mapped_column(Boolean)
    is_active_in_system: Mapped[Optional[bool]] = mapped_column(Boolean, server_default="true")
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMPTZ, server_default="NOW()")

    # relationships
    threshold: Mapped[Optional[ProductionThreshold]] = relationship(
        "ProductionThreshold", back_populates="production", uselist=False
    )
    stages: Mapped[List[ProductionStage]] = relationship(
        "ProductionStage", back_populates="production", order_by="ProductionStage.stage_order"
    )
    rotation_registry: Mapped[Optional[RotationRegistry]] = relationship(
        "RotationRegistry", back_populates="production", uselist=False
    )
    rotation_top_choices: Mapped[List[RotationTopChoice]] = relationship(
        "RotationTopChoice",
        foreign_keys="[RotationTopChoice.production_id]",
        back_populates="production",
        order_by="RotationTopChoice.choice_rank",
    )
    kb_articles: Mapped[List[KBArticle]] = relationship(
        "KBArticle", back_populates="production"
    )
    actionable_rules_as_current: Mapped[List[ActionableRule]] = relationship(
        "ActionableRule",
        foreign_keys="[ActionableRule.current_production_id]",
        back_populates="current_production",
    )
    actionable_rules_as_next: Mapped[List[ActionableRule]] = relationship(
        "ActionableRule",
        foreign_keys="[ActionableRule.next_production_id]",
        back_populates="next_production",
    )

    def __repr__(self) -> str:
        return f"<Production id={self.production_id!r} name={self.production_name!r}>"


# =============================================================================
# TABLE 2: shared.production_thresholds
# Yield, pricing, and alert thresholds per production type
# =============================================================================

class ProductionThreshold(SharedBase):
    __tablename__ = "production_thresholds"
    __table_args__ = {"schema": "shared"}

    production_id: Mapped[str] = mapped_column(
        Text,
        primary_key=True,
    )
    min_cycle_days: Mapped[Optional[int]] = mapped_column(Integer)
    max_cycle_days: Mapped[Optional[int]] = mapped_column(Integer)
    expected_yield_low_kg_acre: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    expected_yield_avg_kg_acre: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    expected_yield_high_kg_acre: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    inactivity_alert_days: Mapped[Optional[int]] = mapped_column(Integer, server_default="7")
    harvest_gap_days: Mapped[Optional[int]] = mapped_column(Integer, server_default="7")
    price_min_fjd_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    price_max_fjd_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    production: Mapped[Production] = relationship("Production", back_populates="threshold")

    def __repr__(self) -> str:
        return f"<ProductionThreshold production_id={self.production_id!r}>"


# =============================================================================
# TABLE 3: shared.production_stages
# Crop growth stages with durations and critical actions
# =============================================================================

class ProductionStage(SharedBase):
    __tablename__ = "production_stages"
    __table_args__ = {"schema": "shared"}

    stage_id: Mapped[str] = mapped_column(Text, primary_key=True)
    production_id: Mapped[Optional[str]] = mapped_column(Text)
    stage_name: Mapped[Optional[str]] = mapped_column(Text)
    stage_order: Mapped[Optional[int]] = mapped_column(Integer)
    duration_days_min: Mapped[Optional[int]] = mapped_column(Integer)
    duration_days_max: Mapped[Optional[int]] = mapped_column(Integer)
    description: Mapped[Optional[str]] = mapped_column(Text)
    critical_actions: Mapped[Optional[str]] = mapped_column(Text)

    production: Mapped[Optional[Production]] = relationship(
        "Production", back_populates="stages"
    )
    kb_stage_links: Mapped[List[KBStageLink]] = relationship(
        "KBStageLink", back_populates="stage", primaryjoin="ProductionStage.stage_id == foreign(KBStageLink.stage_id)"
    )

    def __repr__(self) -> str:
        return f"<ProductionStage id={self.stage_id!r} name={self.stage_name!r} order={self.stage_order}>"


# =============================================================================
# TABLE 4: shared.family_policies
# Crop family rotation policies and disease risk profiles
# =============================================================================

class FamilyPolicy(SharedBase):
    __tablename__ = "family_policies"
    __table_args__ = {"schema": "shared"}

    policy_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    family_name: Mapped[Optional[str]] = mapped_column(Text, unique=True)
    member_production_ids: Mapped[Optional[List[str]]] = mapped_column(ARRAY(Text))
    min_rest_days: Mapped[Optional[int]] = mapped_column(Integer)
    enforce_level: Mapped[Optional[str]] = mapped_column(Text)
    disease_risk: Mapped[Optional[str]] = mapped_column(Text)
    rotation_benefit: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    def __repr__(self) -> str:
        return f"<FamilyPolicy id={self.policy_id} family={self.family_name!r} enforce={self.enforce_level!r}>"


# =============================================================================
# TABLE 5: shared.rotation_registry
# Rotation metadata for all 49 productions
# =============================================================================

class RotationRegistry(SharedBase):
    __tablename__ = "rotation_registry"
    __table_args__ = {"schema": "shared"}

    production_id: Mapped[str] = mapped_column(Text, primary_key=True)
    family: Mapped[Optional[str]] = mapped_column(Text)
    is_perennial: Mapped[Optional[bool]] = mapped_column(Boolean)
    is_livestock: Mapped[Optional[bool]] = mapped_column(Boolean)
    is_forestry: Mapped[Optional[bool]] = mapped_column(Boolean)
    is_aquaculture: Mapped[Optional[bool]] = mapped_column(Boolean)
    is_support_crop: Mapped[Optional[bool]] = mapped_column(Boolean)
    min_cycle_days: Mapped[Optional[int]] = mapped_column(Integer)
    max_cycle_days: Mapped[Optional[int]] = mapped_column(Integer)
    rotation_group: Mapped[Optional[str]] = mapped_column(Text)

    production: Mapped[Production] = relationship("Production", back_populates="rotation_registry")

    def __repr__(self) -> str:
        return f"<RotationRegistry production_id={self.production_id!r} family={self.family!r}>"


# =============================================================================
# TABLE 6: shared.chemical_library
# Registered chemicals with withholding periods and safety data
# =============================================================================

class ChemicalLibrary(SharedBase):
    __tablename__ = "chemical_library"
    __table_args__ = {"schema": "shared"}

    chemical_id: Mapped[str] = mapped_column(Text, primary_key=True)
    chem_name: Mapped[Optional[str]] = mapped_column(Text)
    active_ingredient: Mapped[Optional[str]] = mapped_column(Text)
    chemical_class: Mapped[Optional[str]] = mapped_column(Text)
    registered_crops: Mapped[Optional[List[str]]] = mapped_column(ARRAY(Text))
    application_rate: Mapped[Optional[str]] = mapped_column(Text)
    unit: Mapped[Optional[str]] = mapped_column(Text)
    withholding_period_days: Mapped[int] = mapped_column(Integer, nullable=False)
    re_entry_interval_hours: Mapped[Optional[int]] = mapped_column(Integer)
    mrl_ppm: Mapped[Optional[Decimal]] = mapped_column(Numeric)
    approved_for_fiji: Mapped[Optional[bool]] = mapped_column(Boolean, server_default="true")
    hazard_class: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    def __repr__(self) -> str:
        return f"<ChemicalLibrary id={self.chemical_id!r} name={self.chem_name!r} whd={self.withholding_period_days}d>"


# =============================================================================
# TABLE 7: shared.rotation_top_choices
# Top 3 recommended next crops per production type
# =============================================================================

class RotationTopChoice(SharedBase):
    __tablename__ = "rotation_top_choices"
    __table_args__ = {"schema": "shared"}

    production_id: Mapped[str] = mapped_column(Text, primary_key=True)
    choice_rank: Mapped[int] = mapped_column(Integer, primary_key=True)
    recommended_next_id: Mapped[Optional[str]] = mapped_column(Text)
    reason: Mapped[Optional[str]] = mapped_column(Text)

    production: Mapped[Production] = relationship(
        "Production",
        foreign_keys=[production_id],
        back_populates="rotation_top_choices",
    )
    recommended_next: Mapped[Optional[Production]] = relationship(
        "Production",
        foreign_keys=[recommended_next_id],
        primaryjoin="RotationTopChoice.recommended_next_id == Production.production_id",
    )

    def __repr__(self) -> str:
        return f"<RotationTopChoice from={self.production_id!r} rank={self.choice_rank} next={self.recommended_next_id!r}>"


# =============================================================================
# TABLE 8: shared.actionable_rules
# Rotation enforcement rules — 1,444-rule matrix
# =============================================================================

class ActionableRule(SharedBase):
    __tablename__ = "actionable_rules"
    __table_args__ = {"schema": "shared"}

    rule_id: Mapped[str] = mapped_column(Text, primary_key=True)
    current_production_id: Mapped[Optional[str]] = mapped_column(Text)
    next_production_id: Mapped[Optional[str]] = mapped_column(Text)
    rule_status: Mapped[Optional[str]] = mapped_column(Text)
    min_rest_days: Mapped[Optional[int]] = mapped_column(Integer, server_default="0")
    enforcement_decision: Mapped[Optional[str]] = mapped_column(Text)
    disease_risk: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    current_production: Mapped[Optional[Production]] = relationship(
        "Production",
        foreign_keys=[current_production_id],
        back_populates="actionable_rules_as_current",
        primaryjoin="ActionableRule.current_production_id == Production.production_id",
    )
    next_production: Mapped[Optional[Production]] = relationship(
        "Production",
        foreign_keys=[next_production_id],
        back_populates="actionable_rules_as_next",
        primaryjoin="ActionableRule.next_production_id == Production.production_id",
    )

    def __repr__(self) -> str:
        return (
            f"<ActionableRule id={self.rule_id!r} "
            f"from={self.current_production_id!r} "
            f"to={self.next_production_id!r} "
            f"status={self.rule_status!r}>"
        )


# =============================================================================
# TABLE 9: shared.kb_articles
# Knowledge base articles — supports RAG via pgvector embedding
# =============================================================================

class KBArticle(SharedBase):
    __tablename__ = "kb_articles"
    __table_args__ = {"schema": "shared"}

    article_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default="gen_random_uuid()"
    )
    production_id: Mapped[Optional[str]] = mapped_column(Text)
    stage_id: Mapped[Optional[str]] = mapped_column(Text)
    article_type: Mapped[Optional[str]] = mapped_column(Text, server_default="'crop_guide'")
    title: Mapped[str] = mapped_column(Text, nullable=False)
    content_md: Mapped[Optional[str]] = mapped_column(Text)
    content_summary: Mapped[Optional[str]] = mapped_column(Text)
    embedding_vector: Mapped[Optional[List[float]]] = mapped_column(Vector(1536))
    validated_by: Mapped[Optional[str]] = mapped_column(Text)
    validated_date: Mapped[Optional[date]] = mapped_column(Date)
    published: Mapped[Optional[bool]] = mapped_column(Boolean, server_default="false")
    created_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMPTZ, server_default="NOW()")

    production: Mapped[Optional[Production]] = relationship(
        "Production", back_populates="kb_articles"
    )
    kb_stage_links: Mapped[List[KBStageLink]] = relationship(
        "KBStageLink", back_populates="article"
    )

    def __repr__(self) -> str:
        return f"<KBArticle id={self.article_id!r} title={self.title!r} type={self.article_type!r}>"


# =============================================================================
# TABLE 10: shared.kb_stage_links
# Links knowledge base articles to specific production stages
# =============================================================================

class KBStageLink(SharedBase):
    __tablename__ = "kb_stage_links"
    __table_args__ = {"schema": "shared"}

    link_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default="gen_random_uuid()"
    )
    stage_id: Mapped[str] = mapped_column(Text, nullable=False)
    article_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False))
    link_type: Mapped[Optional[str]] = mapped_column(Text, server_default="'primary'")
    created_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMPTZ, server_default="NOW()")

    article: Mapped[Optional[KBArticle]] = relationship("KBArticle", back_populates="kb_stage_links")
    stage: Mapped[Optional[ProductionStage]] = relationship(
        "ProductionStage",
        back_populates="kb_stage_links",
        primaryjoin="KBStageLink.stage_id == foreign(ProductionStage.stage_id)",
    )

    def __repr__(self) -> str:
        return f"<KBStageLink stage={self.stage_id!r} article={self.article_id!r} type={self.link_type!r}>"
