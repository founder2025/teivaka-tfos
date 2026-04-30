"""Sprint 5 Phase 5.3 — expand event_type_catalog.catalog_group CHECK to 12 values

Revision ID: 040_catalog_group_expansion
Revises: 039_farm_active_groups
Create Date: 2026-04-30

Expands the catalog_group CHECK constraint per Catalog Redesign Doctrine
Amendment v2 (commit 272f513). Implements Inviolable Rule #18 (events must
use one of the locked 11 groups + SYSTEM).

CHECK values (before): CROPS, ANIMALS, MONEY, NOTES, OTHER, SYSTEM (6 values)
CHECK values (after):  CROPS, PERENNIALS, LIVESTOCK, POULTRY, APICULTURE,
                       AQUACULTURE, FORESTRY, SPECIALTY,
                       MONEY, NOTES, OTHER, SYSTEM (12 values)

Pre-amendment ANIMALS rows reassigned per doctrine:
- HIVE_INSPECTION → APICULTURE (single row)
- All other ANIMALS rows → LIVESTOCK (LIVESTOCK_BIRTH, LIVESTOCK_MORTALITY,
  VACCINATION, WEIGHT_CHECK, LIVESTOCK_ACQUIRED, LIVESTOCK_SALE)

Order of operations (matters for CHECK constraint validity):
1. DROP old CHECK (no rows currently violate it; drop is unconditional)
2. UPDATE ANIMALS rows to LIVESTOCK / APICULTURE (no longer constrained)
3. ADD new CHECK with 12 values (succeeds because all rows now match)

Migration does NOT add new event types for new groups (PERENNIALS, AQUACULTURE,
FORESTRY, SPECIALTY, POULTRY-specific events, etc.). That's Sprint 6+ work
per the doctrine memo. Tonight ships group SCAFFOLDING only.

Migration does NOT touch naming_dictionary. Group label vocabulary updates
land in Migration 041 (Phase 5.4).

Reversible (reverse the steps + restore 6-value CHECK).
"""
from alembic import op


revision = '040_catalog_group_expansion'
down_revision = '039_farm_active_groups'
branch_labels = None
depends_on = None


# CHECK constraint name from Migration 036 was 'event_type_catalog_group_check'
# (verified via recon; if different, this DROP will fail with a useful error)

DROP_OLD_CHECK = """
ALTER TABLE shared.event_type_catalog
DROP CONSTRAINT event_type_catalog_group_check
"""

REASSIGN_HIVE_INSPECTION = """
UPDATE shared.event_type_catalog
SET catalog_group = 'APICULTURE'
WHERE event_type = 'HIVE_INSPECTION'
  AND catalog_group = 'ANIMALS'
"""

REASSIGN_OTHER_ANIMALS = """
UPDATE shared.event_type_catalog
SET catalog_group = 'LIVESTOCK'
WHERE catalog_group = 'ANIMALS'
"""

ADD_NEW_CHECK = """
ALTER TABLE shared.event_type_catalog
ADD CONSTRAINT event_type_catalog_group_check
CHECK (catalog_group IN (
    'CROPS', 'PERENNIALS', 'LIVESTOCK', 'POULTRY', 'APICULTURE',
    'AQUACULTURE', 'FORESTRY', 'SPECIALTY',
    'MONEY', 'NOTES', 'OTHER', 'SYSTEM'
))
"""

# Downgrade: reverse the moves and restore 6-value CHECK.

DOWNGRADE_DROP_NEW_CHECK = """
ALTER TABLE shared.event_type_catalog
DROP CONSTRAINT event_type_catalog_group_check
"""

DOWNGRADE_RESTORE_HIVE_INSPECTION = """
UPDATE shared.event_type_catalog
SET catalog_group = 'ANIMALS'
WHERE event_type = 'HIVE_INSPECTION'
  AND catalog_group = 'APICULTURE'
"""

DOWNGRADE_RESTORE_LIVESTOCK = """
UPDATE shared.event_type_catalog
SET catalog_group = 'ANIMALS'
WHERE catalog_group = 'LIVESTOCK'
"""

DOWNGRADE_RESTORE_OLD_CHECK = """
ALTER TABLE shared.event_type_catalog
ADD CONSTRAINT event_type_catalog_group_check
CHECK (catalog_group IN ('CROPS', 'ANIMALS', 'MONEY', 'NOTES', 'OTHER', 'SYSTEM'))
"""


def upgrade() -> None:
    op.execute(DROP_OLD_CHECK)
    op.execute(REASSIGN_HIVE_INSPECTION)
    op.execute(REASSIGN_OTHER_ANIMALS)
    op.execute(ADD_NEW_CHECK)


def downgrade() -> None:
    op.execute(DOWNGRADE_DROP_NEW_CHECK)
    op.execute(DOWNGRADE_RESTORE_HIVE_INSPECTION)
    op.execute(DOWNGRADE_RESTORE_LIVESTOCK)
    op.execute(DOWNGRADE_RESTORE_OLD_CHECK)
