"""poultry 14-event label + voice_prompt backfill

Revision ID: 063_poultry_label_backfill
Revises: 062_incident_supplies
Create Date: 2026-05-04

Phase 6.3-FIX-A — closes 14-event naming_dictionary debt accumulated across
Phases 6.3-9 through 6.3-23/24. Backfills both 'label' and 'voice_prompt' forms
in en locale. Resolves 14 (+) catalog tiles rendering raw 'event.X.label' keys.

Strikes referenced: #73 (drift), #89 (live recon), #51 (ON CONFLICT idempotent),
#72 (one DDL per op.execute), #67 (teivaka superuser for DDL).
"""
from alembic import op

revision = '063_poultry_label_backfill'
down_revision = '062_incident_supplies'
branch_labels = None
depends_on = None


# 14 events x 2 forms = 28 rows. Operator-locked Year-6 farmer-vernacular per Universal
# Naming Doctrine Section 4.3.
ROWS = [
    # (event_type, label_value, voice_prompt_value)
    ('CULL_LOGGED',            'Bird culled',         'Bird culled.'),
    ('EQUIPMENT_MAINTAINED',   'Equipment serviced',  'Equipment serviced.'),
    ('FEED_PURCHASED',         'Feed bought',         'Feed bought.'),
    ('FEED_USED',              'Feed given',          'Feed given to flock.'),
    ('FLOCK_MOVED',            'Flock moved',         'Flock moved.'),
    ('HEALTH_OBSERVATION',     'Health check',        'Health check noted.'),
    ('INCIDENT_REPORTED',      'Incident logged',     'Incident logged.'),
    ('LITTER_CHANGED',         'Bedding changed',     'Bedding changed.'),
    ('MORTALITY_INVESTIGATED', 'Death checked',       'Death checked.'),
    ('PEST_CONTROL_APPLIED',   'Pest treated',        'Pest treated.'),
    ('SUPPLIES_RECEIVED',      'Supplies in',         'Supplies received.'),
    ('TEMPERATURE_RECORDED',   'Temp logged',         'Temperature logged.'),
    ('VISITOR_LOGGED',         'Visitor on farm',     'Visitor logged.'),
    ('WATER_CONSUMED',         'Water used',          'Water used.'),
]


def upgrade():
    for event_type, label_val, voice_val in ROWS:
        # Label row - idempotent via ON CONFLICT (Strike #51)
        op.execute(f"""
            INSERT INTO shared.naming_dictionary
                (concept_key, locale, form, value, is_active)
            VALUES
                ('event.{event_type}.label', 'en', 'label', '{label_val.replace("'", "''")}', true)
            ON CONFLICT (concept_key, locale, form) DO NOTHING;
        """)
        # Voice prompt row - idempotent via ON CONFLICT
        op.execute(f"""
            INSERT INTO shared.naming_dictionary
                (concept_key, locale, form, value, is_active)
            VALUES
                ('event.{event_type}.voice_prompt', 'en', 'voice_prompt', '{voice_val.replace("'", "''")}', true)
            ON CONFLICT (concept_key, locale, form) DO NOTHING;
        """)


def downgrade():
    for event_type, _, _ in ROWS:
        op.execute(f"""
            DELETE FROM shared.naming_dictionary
            WHERE concept_key IN ('event.{event_type}.label', 'event.{event_type}.voice_prompt')
              AND locale = 'en';
        """)
