from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import MetaData

# Naming convention for Alembic auto-generated constraints.
# This ensures all constraint names are deterministic and reversible.
convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

# tenant schema — all RLS-protected tables (farms, zones, cycles, harvests, etc.)
metadata = MetaData(naming_convention=convention, schema="tenant")


class Base(DeclarativeBase):
    """Base for all tenant-schema models (RLS-protected)."""
    metadata = metadata


# shared schema — cross-tenant tables (crop_library, rotation_rules, kb_articles, etc.)
shared_metadata = MetaData(naming_convention=convention, schema="shared")


class SharedBase(DeclarativeBase):
    """Base for all shared-schema models (no RLS, readable by all authenticated users)."""
    metadata = shared_metadata
