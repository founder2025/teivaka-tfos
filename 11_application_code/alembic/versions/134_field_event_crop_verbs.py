"""134 — field_events verbs for the 15 unlocked CROPS forms (Crops G3)

Crops form-coverage gate (MBI 4b.1 G3): unlocks the padlocked CROPS (+) tiles by
giving their polymorphic field_events writes the verbs the CHECK requires. The
catalog rows + audit.events CHECK already allow the catalog names (seeded in 077);
this only extends tenant.field_events.event_type with the structured verbs the
events.py CROPS branch maps to.

New verbs: MULCH, THIN, COVER_CROP, SEED_SAVE, BIO_CONTROL, CROP_HEALTH, STORAGE,
LOSS, CYCLE_ABANDON, CROP_SALE, CROP_GIVEN (reuses PEST_OBSERVE / DISEASE_OBSERVE
/ INSPECTION for the rest).

Revision ID: 134_field_event_crop_verbs
Revises: 133_user_tours
"""
from alembic import op

revision = "134_field_event_crop_verbs"
down_revision = "133_user_tours"
branch_labels = None
depends_on = None

_VERBS = [
    "PLANTING", "TRANSPLANT", "FERTILIZE", "IRRIGATE", "SPRAY", "PRUNE",
    "PEST_OBSERVE", "DISEASE_OBSERVE", "HARVEST_PARTIAL", "HARVEST_FINAL",
    "INSPECTION", "SOIL_TEST", "PHOTO", "OTHER", "WEED_MANAGEMENT", "LAND_PREP",
    # 134 — CROPS G3 unlocks
    "MULCH", "THIN", "COVER_CROP", "SEED_SAVE", "BIO_CONTROL", "CROP_HEALTH",
    "STORAGE", "LOSS", "CYCLE_ABANDON", "CROP_SALE", "CROP_GIVEN",
]
_OLD = [
    "PLANTING", "TRANSPLANT", "FERTILIZE", "IRRIGATE", "SPRAY", "PRUNE",
    "PEST_OBSERVE", "DISEASE_OBSERVE", "HARVEST_PARTIAL", "HARVEST_FINAL",
    "INSPECTION", "SOIL_TEST", "PHOTO", "OTHER", "WEED_MANAGEMENT", "LAND_PREP",
]


def _set_check(verbs):
    vals = ", ".join(f"'{v}'" for v in verbs)
    op.execute("ALTER TABLE tenant.field_events DROP CONSTRAINT IF EXISTS field_events_event_type_check;")
    op.execute(f"ALTER TABLE tenant.field_events ADD CONSTRAINT field_events_event_type_check CHECK (event_type IN ({vals}));")


def upgrade() -> None:
    _set_check(_VERBS)


def downgrade() -> None:
    _set_check(_OLD)
