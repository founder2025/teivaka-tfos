"""Sprint 3 Catalog Redesign — naming_dictionary English seed (142 rows)

Revision ID: 038_naming_dictionary_seed_en
Revises: 037_naming_dictionary_schema
Create Date: 2026-04-30

Seeds shared.naming_dictionary with the English (locale='en') vocabulary for
the (+) catalog UI and form fields. All keys authored by Operator in the
2026-04-30 Sprint 3 doctrine session and locked across 6 review chunks.

Composition:
- 5 group labels (CROPS, ANIMALS, MONEY, NOTES, OTHER)
- 8 form field labels (farm, block, crop, when, notes label/placeholder, amount, unit)
- 117 event keys (39 user-facing events x 3 forms: label, description, voice_prompt)
- 12 subtype labels (LAND_PREP x6, CHEMICAL_APPLIED x3, FIELD_OBSERVATION x3)

Total: 142 rows.

INSERTs split into 6 statements by source chunk for readability and asyncpg
single-statement compatibility (lesson from Migration 035).

Future locales (fj=Fijian, hi=Hindi) will land as separate seed migrations
(039_naming_dictionary_seed_fj, etc.) per Phase 12 multi-language doctrine.

Reversible (DELETE WHERE locale='en').
"""
from alembic import op


revision = '038_naming_dictionary_seed_en'
down_revision = '037_naming_dictionary_schema'
branch_labels = None
depends_on = None


SEED_B1_GROUPS_AND_FORMS = """
INSERT INTO shared.naming_dictionary (concept_key, locale, form, value) VALUES
('group.CROPS.label',                'en', 'label',       'Crops'),
('group.ANIMALS.label',              'en', 'label',       'Animals'),
('group.MONEY.label',                'en', 'label',       'Money'),
('group.NOTES.label',                'en', 'label',       'Notes'),
('group.OTHER.label',                'en', 'label',       'Other work'),
('form.field.farm.label',            'en', 'label',       'Farm'),
('form.field.block.label',           'en', 'label',       'Block'),
('form.field.crop.label',            'en', 'label',       'Crop'),
('form.field.when.label',            'en', 'label',       'When?'),
('form.field.notes.label',           'en', 'label',       'Notes'),
('form.field.notes.placeholder',     'en', 'placeholder', 'Anything else to remember?'),
('form.field.amount.label',          'en', 'label',       'How much?'),
('form.field.unit.kilos.label',      'en', 'label',       'kilos')
"""

SEED_B2_CROPS = """
INSERT INTO shared.naming_dictionary (concept_key, locale, form, value) VALUES
('event.PLANTING.label',             'en', 'label',        'Plant'),
('event.PLANTING.description',       'en', 'description',  'Record planting a crop in a block'),
('event.PLANTING.voice_prompt',      'en', 'voice_prompt', 'Tell me what you planted'),
('event.HARVEST_LOGGED.label',       'en', 'label',        'Harvest'),
('event.HARVEST_LOGGED.description', 'en', 'description',  'Record what you picked from a block'),
('event.HARVEST_LOGGED.voice_prompt','en', 'voice_prompt', 'Tell me what you harvested'),
('event.IRRIGATION.label',           'en', 'label',        'Water'),
('event.IRRIGATION.description',     'en', 'description',  'Record watering a crop'),
('event.IRRIGATION.voice_prompt',    'en', 'voice_prompt', 'Tell me what you watered'),
('event.CHEMICAL_APPLIED.label',     'en', 'label',        'Spray'),
('event.CHEMICAL_APPLIED.description','en','description',  'Record spraying — chemical, herbicide, or fungicide'),
('event.CHEMICAL_APPLIED.voice_prompt','en','voice_prompt','Tell me what you sprayed'),
('event.FERTILIZER_APPLIED.label',   'en', 'label',        'Fertilize'),
('event.FERTILIZER_APPLIED.description','en','description','Record fertilizing a crop'),
('event.FERTILIZER_APPLIED.voice_prompt','en','voice_prompt','Tell me what you fertilized'),
('event.WEED_MANAGEMENT.label',      'en', 'label',        'Weed'),
('event.WEED_MANAGEMENT.description','en', 'description',  'Record weeding a block'),
('event.WEED_MANAGEMENT.voice_prompt','en','voice_prompt', 'Tell me where you weeded'),
('event.PRUNING_TRAINING.label',     'en', 'label',        'Prune'),
('event.PRUNING_TRAINING.description','en','description',  'Record pruning or training plants'),
('event.PRUNING_TRAINING.voice_prompt','en','voice_prompt','Tell me what you pruned'),
('event.TRANSPLANT_LOGGED.label',    'en', 'label',        'Transplant'),
('event.TRANSPLANT_LOGGED.description','en','description', 'Move seedlings from nursery to a block'),
('event.TRANSPLANT_LOGGED.voice_prompt','en','voice_prompt','Tell me what you transplanted'),
('event.LAND_PREP.label',            'en', 'label',        'Land prep'),
('event.LAND_PREP.description',      'en', 'description',  'Record clearing, tilling, leveling, or fencing'),
('event.LAND_PREP.voice_prompt',     'en', 'voice_prompt', 'Tell me what land work you did')
"""

SEED_B3_ANIMALS = """
INSERT INTO shared.naming_dictionary (concept_key, locale, form, value) VALUES
('event.LIVESTOCK_BIRTH.label',           'en', 'label',        'Birth'),
('event.LIVESTOCK_BIRTH.description',     'en', 'description',  'Record an animal birth'),
('event.LIVESTOCK_BIRTH.voice_prompt',    'en', 'voice_prompt', 'Tell me about the birth'),
('event.LIVESTOCK_MORTALITY.label',       'en', 'label',        'Death'),
('event.LIVESTOCK_MORTALITY.description', 'en', 'description',  'Record an animal that died'),
('event.LIVESTOCK_MORTALITY.voice_prompt','en', 'voice_prompt', 'Tell me which animal died and why'),
('event.VACCINATION.label',               'en', 'label',        'Vaccinate'),
('event.VACCINATION.description',         'en', 'description',  'Record vaccinating an animal'),
('event.VACCINATION.voice_prompt',        'en', 'voice_prompt', 'Tell me what you vaccinated'),
('event.WEIGHT_CHECK.label',              'en', 'label',        'Weight'),
('event.WEIGHT_CHECK.description',        'en', 'description',  'Record weighing an animal'),
('event.WEIGHT_CHECK.voice_prompt',       'en', 'voice_prompt', 'Tell me the weight'),
('event.HIVE_INSPECTION.label',           'en', 'label',        'Bee check'),
('event.HIVE_INSPECTION.description',     'en', 'description',  'Record a bee hive inspection'),
('event.HIVE_INSPECTION.voice_prompt',    'en', 'voice_prompt', 'Tell me what you saw in the hive'),
('event.LIVESTOCK_ACQUIRED.label',        'en', 'label',        'New animal'),
('event.LIVESTOCK_ACQUIRED.description',  'en', 'description',  'Record adding an animal to your herd'),
('event.LIVESTOCK_ACQUIRED.voice_prompt', 'en', 'voice_prompt', 'Tell me about the new animal'),
('event.LIVESTOCK_SALE.label',            'en', 'label',        'Sell animal'),
('event.LIVESTOCK_SALE.description',      'en', 'description',  'Record selling an animal — auto-records cash in'),
('event.LIVESTOCK_SALE.voice_prompt',     'en', 'voice_prompt', 'Tell me about the animal sale')
"""

SEED_B4_MONEY = """
INSERT INTO shared.naming_dictionary (concept_key, locale, form, value) VALUES
('event.SELL_CROPS.label',               'en', 'label',        'Sell crops'),
('event.SELL_CROPS.description',         'en', 'description',  'Record selling crops — auto-records the delivery and cash in'),
('event.SELL_CROPS.voice_prompt',        'en', 'voice_prompt', 'Tell me what you sold and to who'),
('event.CASH_OUT.label',                 'en', 'label',        'Pay'),
('event.CASH_OUT.description',           'en', 'description',  'Record paying someone'),
('event.CASH_OUT.voice_prompt',          'en', 'voice_prompt', 'Tell me what you paid for'),
('event.BUY_SUPPLIES.label',             'en', 'label',        'Buy supplies'),
('event.BUY_SUPPLIES.description',       'en', 'description',  'Record buying inputs — auto-records cash out and stock added'),
('event.BUY_SUPPLIES.voice_prompt',      'en', 'voice_prompt', 'Tell me what you bought'),
('event.HIRE_MACHINE.label',             'en', 'label',        'Hire machine'),
('event.HIRE_MACHINE.description',       'en', 'description',  'Record hiring a tractor or machine — auto-records the work and cash out'),
('event.HIRE_MACHINE.voice_prompt',      'en', 'voice_prompt', 'Tell me what machine you hired and what it did'),
('event.INPUT_RECEIVED.label',           'en', 'label',        'Got supplies'),
('event.INPUT_RECEIVED.description',     'en', 'description',  'Record supplies received without payment — donation, subsidy, gift'),
('event.INPUT_RECEIVED.voice_prompt',    'en', 'voice_prompt', 'Tell me what supplies you got'),
('event.WAGES_PAID.label',               'en', 'label',        'Pay workers'),
('event.WAGES_PAID.description',         'en', 'description',  'Record paying wages — auto-records cash out'),
('event.WAGES_PAID.voice_prompt',        'en', 'voice_prompt', 'Tell me who you paid and how much'),
('event.DELIVERY_DISPATCHED.label',      'en', 'label',        'Send delivery'),
('event.DELIVERY_DISPATCHED.description','en', 'description',  'Record goods leaving the farm'),
('event.DELIVERY_DISPATCHED.voice_prompt','en','voice_prompt', 'Tell me what you sent and to where'),
('event.DELIVERY_CONFIRMED.label',       'en', 'label',        'Delivery received'),
('event.DELIVERY_CONFIRMED.description', 'en', 'description',  'Record buyer confirmed receipt'),
('event.DELIVERY_CONFIRMED.voice_prompt','en','voice_prompt',  'Tell me which delivery the buyer received')
"""

SEED_B5_NOTES_AND_OTHER = """
INSERT INTO shared.naming_dictionary (concept_key, locale, form, value) VALUES
('event.PEST_SCOUTING.label',             'en', 'label',        'Pest'),
('event.PEST_SCOUTING.description',       'en', 'description',  'Record a pest you saw'),
('event.PEST_SCOUTING.voice_prompt',      'en', 'voice_prompt', 'Tell me about the pest you saw'),
('event.DISEASE_SCOUTING.label',          'en', 'label',        'Disease'),
('event.DISEASE_SCOUTING.description',    'en', 'description',  'Record a disease you saw on a crop or animal'),
('event.DISEASE_SCOUTING.voice_prompt',   'en', 'voice_prompt', 'Tell me what disease you saw'),
('event.WEATHER_OBSERVED.label',          'en', 'label',        'Weather'),
('event.WEATHER_OBSERVED.description',    'en', 'description',  'Record a weather event — rain, wind, drought, heat'),
('event.WEATHER_OBSERVED.voice_prompt',   'en', 'voice_prompt', 'Tell me about the weather'),
('event.WEATHER_IMPACT.label',            'en', 'label',        'Weather damage'),
('event.WEATHER_IMPACT.description',      'en', 'description',  'Record damage from weather'),
('event.WEATHER_IMPACT.voice_prompt',     'en', 'voice_prompt', 'Tell me what weather damaged'),
('event.FIELD_OBSERVATION.label',         'en', 'label',        'Note'),
('event.FIELD_OBSERVATION.description',   'en', 'description',  'Record any general observation, photo, or note'),
('event.FIELD_OBSERVATION.voice_prompt',  'en', 'voice_prompt', 'Tell me what you noticed'),
('event.INCIDENT_REPORT.label',           'en', 'label',        'Incident'),
('event.INCIDENT_REPORT.description',     'en', 'description',  'Record a serious incident — theft, accident, conflict'),
('event.INCIDENT_REPORT.voice_prompt',    'en', 'voice_prompt', 'Tell me what happened'),
('event.NURSERY_BATCH_CREATED.label',     'en', 'label',        'Start nursery'),
('event.NURSERY_BATCH_CREATED.description','en','description',  'Record starting a nursery batch'),
('event.NURSERY_BATCH_CREATED.voice_prompt','en','voice_prompt','Tell me about the nursery batch'),
('event.NURSERY_READY.label',             'en', 'label',        'Nursery ready'),
('event.NURSERY_READY.description',       'en', 'description',  'Mark a nursery batch ready to transplant'),
('event.NURSERY_READY.voice_prompt',      'en', 'voice_prompt', 'Tell me which nursery batch is ready'),
('event.GERMINATION_LOGGED.label',        'en', 'label',        'Germinated'),
('event.GERMINATION_LOGGED.description',  'en', 'description',  'Record that seeds germinated'),
('event.GERMINATION_LOGGED.voice_prompt', 'en', 'voice_prompt', 'Tell me which seeds germinated'),
('event.WORKER_CHECKIN.label',            'en', 'label',        'Worker check-in'),
('event.WORKER_CHECKIN.description',      'en', 'description',  'Record a worker arriving for the day'),
('event.WORKER_CHECKIN.voice_prompt',     'en', 'voice_prompt', 'Tell me which worker checked in'),
('event.INPUT_USED_ADJUSTMENT.label',     'en', 'label',        'Adjust stock'),
('event.INPUT_USED_ADJUSTMENT.description','en','description',  'Manually adjust your inventory count'),
('event.INPUT_USED_ADJUSTMENT.voice_prompt','en','voice_prompt','Tell me what stock to adjust'),
('event.POST_HARVEST_LOSS.label',         'en', 'label',        'Crop loss'),
('event.POST_HARVEST_LOSS.description',   'en', 'description',  'Record crops lost after harvest — spoilage, theft, damage'),
('event.POST_HARVEST_LOSS.voice_prompt',  'en', 'voice_prompt', 'Tell me about the crop loss'),
('event.GRADING.label',                   'en', 'label',        'Grade harvest'),
('event.GRADING.description',             'en', 'description',  'Sort harvest into grades — A, B, C, reject'),
('event.GRADING.voice_prompt',            'en', 'voice_prompt', 'Tell me how the harvest graded'),
('event.CYCLE_CREATED.label',             'en', 'label',        'Start crop run'),
('event.CYCLE_CREATED.description',       'en', 'description',  'Manually start a new crop run on a block'),
('event.CYCLE_CREATED.voice_prompt',      'en', 'voice_prompt', 'Tell me what crop run to start'),
('event.CYCLE_CLOSED.label',              'en', 'label',        'Close crop run'),
('event.CYCLE_CLOSED.description',        'en', 'description',  'Close a finished crop run'),
('event.CYCLE_CLOSED.voice_prompt',       'en', 'voice_prompt', 'Tell me which crop run to close')
"""

SEED_B6_SUBTYPES = """
INSERT INTO shared.naming_dictionary (concept_key, locale, form, value) VALUES
('subtype.LAND_PREP.CLEARING.label',           'en', 'label', 'Clearing'),
('subtype.LAND_PREP.EXCAVATION.label',         'en', 'label', 'Excavating'),
('subtype.LAND_PREP.TILLING.label',            'en', 'label', 'Tilling'),
('subtype.LAND_PREP.LEVELING.label',           'en', 'label', 'Leveling'),
('subtype.LAND_PREP.BED_FORMATION.label',      'en', 'label', 'Forming beds'),
('subtype.LAND_PREP.FENCING.label',            'en', 'label', 'Fencing'),
('subtype.CHEMICAL_APPLIED.PESTICIDE.label',   'en', 'label', 'Pesticide'),
('subtype.CHEMICAL_APPLIED.HERBICIDE.label',   'en', 'label', 'Herbicide'),
('subtype.CHEMICAL_APPLIED.FUNGICIDE.label',   'en', 'label', 'Fungicide'),
('subtype.FIELD_OBSERVATION.GENERAL.label',    'en', 'label', 'Just a note'),
('subtype.FIELD_OBSERVATION.PHOTO_ONLY.label', 'en', 'label', 'Photo'),
('subtype.FIELD_OBSERVATION.FREE_NOTE.label',  'en', 'label', 'Long note')
"""

DELETE_EN_SEED = """
DELETE FROM shared.naming_dictionary WHERE locale = 'en'
"""


def upgrade() -> None:
    op.execute(SEED_B1_GROUPS_AND_FORMS)
    op.execute(SEED_B2_CROPS)
    op.execute(SEED_B3_ANIMALS)
    op.execute(SEED_B4_MONEY)
    op.execute(SEED_B5_NOTES_AND_OTHER)
    op.execute(SEED_B6_SUBTYPES)


def downgrade() -> None:
    op.execute(DELETE_EN_SEED)
