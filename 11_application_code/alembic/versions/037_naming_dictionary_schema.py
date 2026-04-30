"""Sprint 3 Catalog Redesign — shared.naming_dictionary table (schema only)

Revision ID: 037_naming_dictionary_schema
Revises: 036_event_type_catalog
Create Date: 2026-04-30

Creates the naming_dictionary table per MBI Section 4 Universal Naming Doctrine.
Holds farmer-English translations for system-name keys used throughout the platform.
Drives every UI label via the name(concept_key, form?) translation function.

Schema only. Vocabulary seed rows ship in Migration 038 after Operator authors
the strings. Splitting schema from data lets schema land tonight while vocabulary
authoring happens as a focused decision session.

Key shape: <scope>.<id>.<form>
  Examples:
    event.HARVEST_LOGGED.label       -> "Harvest"
    event.HARVEST_LOGGED.description -> "Record what you picked from a block"
    event.HARVEST_LOGGED.voice_prompt -> "Tell me what you harvested"
    group.CROPS.label                -> "Crops"
    subtype.LAND_PREP.CLEARING.label -> "Clearing"
    form.field.block.label           -> "Block"

locale supports en (English) tonight; fj (Fijian) and hi (Hindi) reserved for
Phase 12 multi-language work.

Permissions per MBI Section 4.1: naming_dictionary is build-time admin-write only.
Runtime user teivaka_app gets SELECT only. No INSERT/UPDATE/DELETE grants.

Reversible.
"""
from alembic import op


revision = '037_naming_dictionary_schema'
down_revision = '036_event_type_catalog'
branch_labels = None
depends_on = None


CREATE_TABLE = """
CREATE TABLE shared.naming_dictionary (
    concept_key  text NOT NULL,
    locale       text NOT NULL DEFAULT 'en',
    form         text NOT NULL,
    value        text NOT NULL,
    notes        text,
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamp with time zone NOT NULL DEFAULT now(),
    updated_at   timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT naming_dictionary_pkey PRIMARY KEY (concept_key, locale, form),
    CONSTRAINT naming_dictionary_form_check CHECK (
        form IN ('label', 'description', 'voice_prompt', 'plural', 'verb', 'noun', 'placeholder', 'helper')
    ),
    CONSTRAINT naming_dictionary_locale_check CHECK (
        locale ~ '^[a-z]{2}(_[A-Z]{2})?$'
    )
)
"""

CREATE_INDEX = """
CREATE INDEX idx_naming_dictionary_active
    ON shared.naming_dictionary (concept_key, locale)
    WHERE is_active = true
"""

GRANT_SELECT = """
GRANT SELECT ON shared.naming_dictionary TO teivaka_app
"""

DROP_TABLE = """
DROP TABLE IF EXISTS shared.naming_dictionary
"""


def upgrade() -> None:
    op.execute(CREATE_TABLE)
    op.execute(CREATE_INDEX)
    op.execute(GRANT_SELECT)


def downgrade() -> None:
    op.execute(DROP_TABLE)
