"""strike #C1c — 20-event naming_dictionary backfill

Revision ID: 078_c1c_naming_backfill
Revises: 077_crops_taxonomy_lock
Create Date: 2026-05-09

Revision id shortened from 078_strike_c1c_naming_dictionary_backfill (41 chars)
to fit tenant.alembic_version.version_num varchar(32) constraint per B41.

Strike #C1c — closes naming_dictionary debt for the 20 truly-new event_types
inserted by migration 077 (Strike #C1 Crops taxonomy lock). Without these
rows, the (+) catalog renders raw uppercase enum strings (CYCLE_ABANDONED,
NURSERY_LOSS, ...) on tile faces because /api/v1/event-catalog returns
event.translated.label = NULL and LogSheet.jsx falls back to event_type.

Backfills both 'label' and 'voice_prompt' forms in en locale.
20 events x 2 forms = 40 rows.

Operator-amended labels (2026-05-09):
  - CROP_SOLD → 'Direct sale' / 'Tell me about the direct sale'
    (disambiguated from existing SELL_CROPS = 'Sell crops')
  - INPUT_PURCHASED → 'Buy input' / 'Tell me what input you bought'
    (disambiguated from existing BUY_SUPPLIES = 'Buy supplies')

Strikes referenced: #51 (ON CONFLICT idempotent), #72 (one DDL per
op.execute), #92 (user-reachable label), #98 Rule 4 (operator-locked
taxonomy). Mirrors pattern of migration 063_poultry_label_backfill.
"""
from alembic import op

revision = '078_c1c_naming_backfill'
down_revision = '077_crops_taxonomy_lock'
branch_labels = None
depends_on = None


# 20 events x 2 forms = 40 rows. Operator-reviewed 2026-05-09 per Universal
# Naming Doctrine Section 4.3 (farmer-vernacular, short labels, conversational
# voice prompts).
ROWS = [
    # (event_type, label_value, voice_prompt_value)
    # ── CROPS lifecycle ────────────────────────────────────────────────
    ('CYCLE_ABANDONED',            'Abandon crop run',  'Tell me which crop run to abandon'),
    ('NURSERY_LOSS',               'Nursery loss',      'Tell me about the nursery loss'),
    # ── CROPS daily care ───────────────────────────────────────────────
    ('MULCHING',                   'Mulch',             'Tell me where you mulched'),
    ('COVER_CROP_PLANTED',         'Cover crop',        'Tell me what cover crop you planted'),
    ('THINNING',                   'Thin',              'Tell me where you thinned'),
    # ── CROPS health/pest/disease ──────────────────────────────────────
    ('PEST_CONFIRMED',             'Pest confirmed',    'Tell me about the pest'),
    ('DISEASE_CONFIRMED',          'Disease confirmed', 'Tell me about the disease'),
    ('BIOLOGICAL_CONTROL_APPLIED', 'Biocontrol',        'Tell me what biocontrol you applied'),
    ('CROP_HEALTH_OBSERVATION',    'Crop health',       'Tell me what you saw on the crop'),
    # ── CROPS production/storage ───────────────────────────────────────
    ('STORAGE_LOGGED',             'Store crop',        'Tell me what you stored'),
    ('STORAGE_CHECK',              'Storage check',     'Tell me about the storage check'),
    # ── CROPS sales/disposal (Operator-amended) ────────────────────────
    ('CROP_SOLD',                  'Direct sale',       'Tell me about the direct sale'),
    ('CROP_GIVEN',                 'Give crop',         'Tell me what crop you gave'),
    # ── CROPS inputs/inventory (Operator-amended) ──────────────────────
    ('INPUT_PURCHASED',            'Buy input',         'Tell me what input you bought'),
    ('INPUT_INVENTORY_CHECK',      'Stock check',       'Tell me about the stock check'),
    ('SEED_SAVED',                 'Save seed',         'Tell me what seed you saved'),
    # ── LABOR ──────────────────────────────────────────────────────────
    ('WORKER_CHECKOUT',            'Worker checkout',   'Tell me which worker checked out'),
    ('WORKER_INCIDENT',            'Worker incident',   'Tell me what happened to the worker'),
    # ── COMPLIANCE ─────────────────────────────────────────────────────
    ('COMPLIANCE_INSPECTION',      'Inspection',        'Tell me about the inspection'),
    # ── OPERATIONS ─────────────────────────────────────────────────────
    ('FIELD_INCIDENT',             'Field incident',    'Tell me what happened on the field'),
]


def upgrade():
    for event_type, label_val, voice_val in ROWS:
        # Label row — idempotent via ON CONFLICT (Strike #51)
        op.execute(f"""
            INSERT INTO shared.naming_dictionary
                (concept_key, locale, form, value, is_active)
            VALUES
                ('event.{event_type}.label', 'en', 'label', '{label_val.replace("'", "''")}', true)
            ON CONFLICT (concept_key, locale, form) DO NOTHING;
        """)
        # Voice prompt row — idempotent via ON CONFLICT
        op.execute(f"""
            INSERT INTO shared.naming_dictionary
                (concept_key, locale, form, value, is_active)
            VALUES
                ('event.{event_type}.voice_prompt', 'en', 'voice_prompt', '{voice_val.replace("'", "''")}', true)
            ON CONFLICT (concept_key, locale, form) DO NOTHING;
        """)


def downgrade():
    op.execute("""
        DELETE FROM shared.naming_dictionary
        WHERE concept_key IN (
            'event.CYCLE_ABANDONED.label',            'event.CYCLE_ABANDONED.voice_prompt',
            'event.NURSERY_LOSS.label',               'event.NURSERY_LOSS.voice_prompt',
            'event.MULCHING.label',                   'event.MULCHING.voice_prompt',
            'event.COVER_CROP_PLANTED.label',         'event.COVER_CROP_PLANTED.voice_prompt',
            'event.THINNING.label',                   'event.THINNING.voice_prompt',
            'event.PEST_CONFIRMED.label',             'event.PEST_CONFIRMED.voice_prompt',
            'event.DISEASE_CONFIRMED.label',          'event.DISEASE_CONFIRMED.voice_prompt',
            'event.BIOLOGICAL_CONTROL_APPLIED.label', 'event.BIOLOGICAL_CONTROL_APPLIED.voice_prompt',
            'event.CROP_HEALTH_OBSERVATION.label',    'event.CROP_HEALTH_OBSERVATION.voice_prompt',
            'event.STORAGE_LOGGED.label',             'event.STORAGE_LOGGED.voice_prompt',
            'event.STORAGE_CHECK.label',              'event.STORAGE_CHECK.voice_prompt',
            'event.CROP_SOLD.label',                  'event.CROP_SOLD.voice_prompt',
            'event.CROP_GIVEN.label',                 'event.CROP_GIVEN.voice_prompt',
            'event.INPUT_PURCHASED.label',            'event.INPUT_PURCHASED.voice_prompt',
            'event.INPUT_INVENTORY_CHECK.label',      'event.INPUT_INVENTORY_CHECK.voice_prompt',
            'event.SEED_SAVED.label',                 'event.SEED_SAVED.voice_prompt',
            'event.WORKER_CHECKOUT.label',            'event.WORKER_CHECKOUT.voice_prompt',
            'event.WORKER_INCIDENT.label',            'event.WORKER_INCIDENT.voice_prompt',
            'event.COMPLIANCE_INSPECTION.label',      'event.COMPLIANCE_INSPECTION.voice_prompt',
            'event.FIELD_INCIDENT.label',             'event.FIELD_INCIDENT.voice_prompt'
        )
        AND locale = 'en'
        AND form IN ('label', 'voice_prompt');
    """)
