"""Sprint 5 Phase 5.2 — tenant.farm_active_groups (user-controlled group visibility)

Revision ID: 039_farm_active_groups
Revises: 038_naming_dictionary_seed_en
Create Date: 2026-04-30

Creates the per-farm group activation table per Catalog Redesign Doctrine
Amendment v2 (commit 272f513). Each farm chooses which of the 11 catalog
groups appears in its (+) menu, preventing cognitive overload while ensuring
no production domain is excluded by design.

Doctrine reconciliation: original memo at 272f513 specified farm_id as uuid,
but production reality has tenant.farms.farm_id as text. Migration uses text
to match production; doctrine memo edited in this same commit to align.
Authority precedent: MBI Section 3 — reality on prod wins over docs.

Locked Operator decisions:
- Q1: per-farm activation (multi-farm operators benefit from independent config)
- Q2: toggling OFF hides from (+) only; history stays in /reports
- Q3: onboarding pre-checks MONEY + NOTES + OTHER (universal); 8 production
  groups unchecked by default (user picks what they actually farm)

Backfill: every existing farm gets all 11 groups inserted with is_active=true,
activated_by=NULL (system backfill marker). Pre-amendment farms experience
no change — they continue seeing the full catalog.

Reversible (DROP TABLE).
"""
from alembic import op


revision = '039_farm_active_groups'
down_revision = '038_naming_dictionary_seed_en'
branch_labels = None
depends_on = None


CREATE_TABLE = """
CREATE TABLE tenant.farm_active_groups (
    farm_id      text NOT NULL REFERENCES tenant.farms(farm_id),
    catalog_group text NOT NULL,
    is_active    boolean NOT NULL DEFAULT true,
    activated_at timestamp with time zone NOT NULL DEFAULT now(),
    activated_by uuid REFERENCES tenant.users(user_id),
    CONSTRAINT farm_active_groups_pkey PRIMARY KEY (farm_id, catalog_group),
    CONSTRAINT farm_active_groups_group_check CHECK (
        catalog_group IN (
            'CROPS','PERENNIALS','LIVESTOCK','POULTRY','APICULTURE',
            'AQUACULTURE','FORESTRY','SPECIALTY',
            'MONEY','NOTES','OTHER'
        )
    )
)
"""

CREATE_INDEX = """
CREATE INDEX idx_farm_active_groups_farm
    ON tenant.farm_active_groups (farm_id)
    WHERE is_active = true
"""

GRANT_PERMS = """
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.farm_active_groups TO teivaka_app
"""

BACKFILL_EXISTING = """
INSERT INTO tenant.farm_active_groups (farm_id, catalog_group, is_active, activated_by)
SELECT f.farm_id, g.group_name, true, NULL
FROM tenant.farms f
CROSS JOIN (VALUES
    ('CROPS'), ('PERENNIALS'), ('LIVESTOCK'), ('POULTRY'),
    ('APICULTURE'), ('AQUACULTURE'), ('FORESTRY'), ('SPECIALTY'),
    ('MONEY'), ('NOTES'), ('OTHER')
) AS g(group_name)
"""

DROP_TABLE = """
DROP TABLE IF EXISTS tenant.farm_active_groups
"""


def upgrade() -> None:
    op.execute(CREATE_TABLE)
    op.execute(CREATE_INDEX)
    op.execute(GRANT_PERMS)
    op.execute(BACKFILL_EXISTING)


def downgrade() -> None:
    op.execute(DROP_TABLE)
