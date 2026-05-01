"""Add POULTRY event taxonomy (35 POULTRY events + 3 LIBRARY events) + naming dictionary rows + audit CHECK expansion.

Per Vertical Completeness Doctrine + POULTRY Phase 6.0 v2 lock (2026-05-01).
First group to ship vertical-complete; this phase delivers Gates 1+2 schema substrate.

Cross-cutting events (WEATHER_IMPACT, INPUT_RECEIVED, INPUT_USED) intentionally
not duplicated for POULTRY — they exist in NOTES/MONEY/SYSTEM groups and are
accessed via global tiles, not per-group. Honors Doctrine Gate 1 (logs every
event a farmer would log) without polluting the audit chain with per-group
duplicates.

Revision ID: 043_poultry_events_taxonomy
Revises: 042_farm_group_toggled_event
Create Date: 2026-05-01
"""

from alembic import op
import sqlalchemy as sa

revision = '043_poultry_events_taxonomy'
down_revision = '042_farm_group_toggled_event'
branch_labels = None
depends_on = None

# (event_type, catalog_group, sort_order, backdating_window_days, requires_reason_after_days)
# requires_reason_after_days: NULL = optional always; 0 = always required when backdated; N = required if backdated > N days
POULTRY_EVENTS = [
    # Lifecycle (5)  — sort 1-5
    ('FLOCK_PLACED', 'POULTRY', 1, 30, 0),
    ('FLOCK_TRANSITIONED', 'POULTRY', 2, 7, 3),
    ('FLOCK_CULLED', 'POULTRY', 3, 7, 0),
    ('FLOCK_RETIRED', 'POULTRY', 4, 30, 7),
    ('BIRD_REPLACEMENT', 'POULTRY', 5, 14, 3),

    # Health & Biosecurity (8) — sort 6-13
    ('VACCINATION_GIVEN', 'POULTRY', 6, 7, 3),
    ('MEDICATION_GIVEN', 'POULTRY', 7, 7, 3),
    ('MORTALITY_LOGGED', 'POULTRY', 8, 3, 0),
    ('SICK_BIRD_NOTED', 'POULTRY', 9, 3, 2),
    ('BIOSECURITY_CHECK', 'POULTRY', 10, 3, None),
    ('COOP_CLEANED', 'POULTRY', 11, 7, None),
    ('BEDDING_CHANGED', 'POULTRY', 12, 7, None),
    ('PARASITE_TREATMENT', 'POULTRY', 13, 7, 3),

    # Daily Production (4) — sort 14-17
    ('EGGS_COLLECTED', 'POULTRY', 14, 7, 2),
    ('EGGS_GRADED', 'POULTRY', 15, 7, None),
    ('EGGS_DISCARDED', 'POULTRY', 16, 7, 2),
    ('WATER_REFILLED', 'POULTRY', 17, 3, None),

    # Feed (3 — INPUT_RECEIVED/INPUT_USED dropped per Decision 3) — sort 18-20
    ('FEED_RECEIVED', 'POULTRY', 18, 30, None),
    ('FEED_GIVEN', 'POULTRY', 19, 7, 2),
    ('FEED_INVENTORY_CHECK', 'POULTRY', 20, 7, None),

    # Sales & Outputs (4) — sort 21-24
    ('EGGS_SOLD', 'POULTRY', 21, 30, 7),
    ('BIRDS_SOLD', 'POULTRY', 22, 30, 7),
    ('MANURE_SOLD', 'POULTRY', 23, 30, 7),
    ('EGGS_GIVEN', 'POULTRY', 24, 14, None),

    # Infrastructure (4) — sort 25-28
    ('COOP_REPAIR', 'POULTRY', 25, 14, None),
    ('EQUIPMENT_PURCHASED', 'POULTRY', 26, 30, None),
    ('EQUIPMENT_REPAIR', 'POULTRY', 27, 14, None),
    ('UTILITY_PAYMENT', 'POULTRY', 28, 30, None),

    # Compliance (3) — sort 29-31
    ('MAQS_INSPECTION', 'POULTRY', 29, 60, 14),
    ('PERMIT_RECEIVED', 'POULTRY', 30, 60, None),
    ('CERTIFICATION_AUDIT', 'POULTRY', 31, 60, 14),

    # Observation (2 — WEATHER_IMPACT dropped per Decision 3) — sort 32-33
    ('PREDATOR_INCIDENT', 'POULTRY', 32, 7, 0),
    ('INCIDENT_NOTED', 'POULTRY', 33, 7, None),

    # Labor (2) — sort 34-35
    ('WORKER_PAID', 'POULTRY', 34, 30, 7),
    ('WORKER_TASK_DONE', 'POULTRY', 35, 7, None),

    # Library management (3) under OTHER — sort 100-102 to push to bottom
    ('LIBRARY_ROW_ADDED', 'OTHER', 100, 7, 2),
    ('LIBRARY_ROW_DEACTIVATED', 'OTHER', 101, 7, 0),
    ('LIBRARY_ROW_REACTIVATED', 'OTHER', 102, 7, 0),
]

# naming_dictionary rows: (concept_key, form, value) — locale='en' assumed default
POULTRY_VOCAB = []
_vocab_data = {
    'FLOCK_PLACED': ('New flock', 'New flock placed.'),
    'FLOCK_TRANSITIONED': ('Flock moved', 'Flock moved between coops.'),
    'FLOCK_CULLED': ('Flock culled', 'Flock culled.'),
    'FLOCK_RETIRED': ('Flock retired', 'Flock retired.'),
    'BIRD_REPLACEMENT': ('Replacements', 'Replacement birds added.'),
    'VACCINATION_GIVEN': ('Vaccination', 'Vaccination given.'),
    'MEDICATION_GIVEN': ('Medicine', 'Medicine given to birds.'),
    'MORTALITY_LOGGED': ('Birds died', 'How many birds died?'),
    'SICK_BIRD_NOTED': ('Sick bird', 'Sick bird seen.'),
    'BIOSECURITY_CHECK': ('Biosecurity', 'Biosecurity check done.'),
    'COOP_CLEANED': ('Coop cleaned', 'Coop cleaned.'),
    'BEDDING_CHANGED': ('Bedding changed', 'Bedding changed.'),
    'PARASITE_TREATMENT': ('Parasite treatment', 'Parasite treatment given.'),
    'EGGS_COLLECTED': ('Eggs collected', 'How many eggs today?'),
    'EGGS_GRADED': ('Eggs graded', 'Eggs graded.'),
    'EGGS_DISCARDED': ('Eggs discarded', 'Eggs discarded.'),
    'WATER_REFILLED': ('Water refilled', 'Water refilled.'),
    'FEED_RECEIVED': ('Feed delivery', 'Feed delivered.'),
    'FEED_GIVEN': ('Feed given', 'How many bags fed today?'),
    'FEED_INVENTORY_CHECK': ('Feed stock', 'Feed stock checked.'),
    'EGGS_SOLD': ('Eggs sold', 'Eggs sold.'),
    'BIRDS_SOLD': ('Birds sold', 'Birds sold.'),
    'MANURE_SOLD': ('Manure sold', 'Manure sold.'),
    'EGGS_GIVEN': ('Eggs given', 'Eggs given or used.'),
    'COOP_REPAIR': ('Coop repair', 'Coop repair done.'),
    'EQUIPMENT_PURCHASED': ('Equipment bought', 'Equipment bought.'),
    'EQUIPMENT_REPAIR': ('Equipment repair', 'Equipment repaired.'),
    'UTILITY_PAYMENT': ('Utility paid', 'Utility paid.'),
    'MAQS_INSPECTION': ('MAQS inspection', 'MAQS inspection done.'),
    'PERMIT_RECEIVED': ('Permit received', 'Permit received.'),
    'CERTIFICATION_AUDIT': ('Certification audit', 'Certification audit done.'),
    'PREDATOR_INCIDENT': ('Predator attack', 'Predator attacked the flock.'),
    'INCIDENT_NOTED': ('Other incident', 'Incident noted.'),
    'WORKER_PAID': ('Worker paid', 'Worker paid.'),
    'WORKER_TASK_DONE': ('Worker task', 'Worker did task.'),
    'LIBRARY_ROW_ADDED': ('Library item added', 'Library item added.'),
    'LIBRARY_ROW_DEACTIVATED': ('Library item off', 'Library item turned off.'),
    'LIBRARY_ROW_REACTIVATED': ('Library item on', 'Library item turned back on.'),
}
for et, (label, voice) in _vocab_data.items():
    POULTRY_VOCAB.append((f'event.{et}.label', 'label', label))
    POULTRY_VOCAB.append((f'event.{et}.voice_prompt', 'voice_prompt', voice))


def upgrade():
    conn = op.get_bind()

    # 1. Insert event_type_catalog rows
    for event_type, group, sort_order, backdating_days, requires_reason_after in POULTRY_EVENTS:
        conn.execute(sa.text("""
            INSERT INTO shared.event_type_catalog
                (event_type, catalog_group, sort_order, backdating_window_days, requires_reason_after_days, is_active)
            VALUES (:et, :grp, :so, :bd, :rrad, TRUE)
            ON CONFLICT (event_type) DO NOTHING
        """), {
            'et': event_type, 'grp': group, 'so': sort_order,
            'bd': backdating_days, 'rrad': requires_reason_after,
        })

    # 2. Insert naming_dictionary rows for events (composite PK: concept_key, locale, form)
    for concept_key, form, value in POULTRY_VOCAB:
        conn.execute(sa.text("""
            INSERT INTO shared.naming_dictionary
                (concept_key, locale, form, value, is_active)
            VALUES (:ck, 'en', :f, :v, TRUE)
            ON CONFLICT (concept_key, locale, form) DO NOTHING
        """), {'ck': concept_key, 'f': form, 'v': value})

    # 3. Expand audit.events CHECK constraint (rebuild from full event_type_catalog)
    conn.execute(sa.text("""
        ALTER TABLE audit.events DROP CONSTRAINT IF EXISTS events_event_type_check;
    """))
    result = conn.execute(sa.text("""
        SELECT DISTINCT event_type FROM shared.event_type_catalog ORDER BY event_type;
    """))
    all_event_types = [row[0] for row in result]
    check_values = ', '.join(f"'{et}'" for et in all_event_types)
    conn.execute(sa.text(f"""
        ALTER TABLE audit.events ADD CONSTRAINT events_event_type_check
        CHECK (event_type IN ({check_values}));
    """))


def downgrade():
    conn = op.get_bind()

    conn.execute(sa.text("""
        ALTER TABLE audit.events DROP CONSTRAINT IF EXISTS events_event_type_check;
    """))

    for concept_key, _, _ in POULTRY_VOCAB:
        conn.execute(sa.text("""
            DELETE FROM shared.naming_dictionary
            WHERE concept_key = :ck AND locale = 'en'
        """), {'ck': concept_key})

    for event_type, _, _, _, _ in POULTRY_EVENTS:
        conn.execute(sa.text("DELETE FROM shared.event_type_catalog WHERE event_type = :et"),
                     {'et': event_type})

    result = conn.execute(sa.text("""
        SELECT DISTINCT event_type FROM shared.event_type_catalog ORDER BY event_type;
    """))
    all_event_types = [row[0] for row in result]
    check_values = ', '.join(f"'{et}'" for et in all_event_types)
    conn.execute(sa.text(f"""
        ALTER TABLE audit.events ADD CONSTRAINT events_event_type_check
        CHECK (event_type IN ({check_values}));
    """))
