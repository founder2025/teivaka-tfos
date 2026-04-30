"""Sprint 5 Phase 5.4 — naming_dictionary seed for 7 new group labels + deactivate ANIMALS

Revision ID: 041_naming_dictionary_groups_v2
Revises: 040_catalog_group_expansion
Create Date: 2026-04-30

Seeds farmer-English labels for the 7 new/renamed groups introduced by
Catalog Redesign Doctrine Amendment v2 (commit 272f513).

Operator-locked vocabulary (2026-04-30 session):
- group.PERENNIALS.label  -> 'Trees & vines'  (food-bearing trees + grapes/passionfruit/vanilla)
- group.LIVESTOCK.label   -> 'Livestock'      (cattle, pigs, goats, sheep, buffalo)
- group.POULTRY.label     -> 'Poultry'        (chickens, ducks, turkey, quail)
- group.APICULTURE.label  -> 'Bees'           (honeybees, native bees, beeswax)
- group.AQUACULTURE.label -> 'Fish & sea'     (tilapia, prawns, mud crab, oysters, seaweed)
- group.FORESTRY.label    -> 'Forestry'       (mahogany, sandalwood, bamboo, teak)
- group.SPECIALTY.label   -> 'Specialty'      (mushrooms, hydroponics, microgreens, insects)

Plus: legacy group.ANIMALS.label row set to is_active=false (kept for audit
trail per Inviolable Rule #2 — history sacred). Future API consumers query
WHERE is_active=true and won't see it.

Reversible (DELETE new rows + restore ANIMALS active state).

Total dictionary rows after: 149 (142 + 7).
"""
from alembic import op


revision = '041_naming_dictionary_groups_v2'
down_revision = '040_catalog_group_expansion'
branch_labels = None
depends_on = None


SEED_NEW_GROUP_LABELS = """
INSERT INTO shared.naming_dictionary (concept_key, locale, form, value) VALUES
('group.PERENNIALS.label',  'en', 'label', 'Trees & vines'),
('group.LIVESTOCK.label',   'en', 'label', 'Livestock'),
('group.POULTRY.label',     'en', 'label', 'Poultry'),
('group.APICULTURE.label',  'en', 'label', 'Bees'),
('group.AQUACULTURE.label', 'en', 'label', 'Fish & sea'),
('group.FORESTRY.label',    'en', 'label', 'Forestry'),
('group.SPECIALTY.label',   'en', 'label', 'Specialty')
"""

DEACTIVATE_LEGACY_ANIMALS = """
UPDATE shared.naming_dictionary
SET is_active = false, updated_at = now()
WHERE concept_key = 'group.ANIMALS.label'
  AND locale = 'en'
"""

DOWNGRADE_DELETE_NEW = """
DELETE FROM shared.naming_dictionary
WHERE concept_key IN (
    'group.PERENNIALS.label',
    'group.LIVESTOCK.label',
    'group.POULTRY.label',
    'group.APICULTURE.label',
    'group.AQUACULTURE.label',
    'group.FORESTRY.label',
    'group.SPECIALTY.label'
)
AND locale = 'en'
"""

DOWNGRADE_REACTIVATE_ANIMALS = """
UPDATE shared.naming_dictionary
SET is_active = true, updated_at = now()
WHERE concept_key = 'group.ANIMALS.label'
  AND locale = 'en'
"""


def upgrade() -> None:
    op.execute(SEED_NEW_GROUP_LABELS)
    op.execute(DEACTIVATE_LEGACY_ANIMALS)


def downgrade() -> None:
    op.execute(DOWNGRADE_DELETE_NEW)
    op.execute(DOWNGRADE_REACTIVATE_ANIMALS)
