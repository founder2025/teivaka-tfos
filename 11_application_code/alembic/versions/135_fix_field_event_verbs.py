"""135 — repair field_events verb CHECK (bulletproof re-add)

Migration 134's ADD CONSTRAINT left the field_events_event_type_check in a bad
state (deploy assert: CROP_SALE absent at head=134). This re-adds it defensively:
the allowed set = the intended verb list UNION every distinct event_type already
in the table, so the ADD can never fail on existing data and the CROPS G3 verbs
(incl. CROP_SALE) are guaranteed present.

Revision ID: 135_fix_field_event_verbs
Revises: 134_field_event_crop_verbs
"""
from alembic import op
import sqlalchemy as sa

revision = "135_fix_field_event_verbs"
down_revision = "134_field_event_crop_verbs"
branch_labels = None
depends_on = None

_VERBS = [
    "PLANTING", "TRANSPLANT", "FERTILIZE", "IRRIGATE", "SPRAY", "PRUNE",
    "PEST_OBSERVE", "DISEASE_OBSERVE", "HARVEST_PARTIAL", "HARVEST_FINAL",
    "INSPECTION", "SOIL_TEST", "PHOTO", "OTHER", "WEED_MANAGEMENT", "LAND_PREP",
    "MULCH", "THIN", "COVER_CROP", "SEED_SAVE", "BIO_CONTROL", "CROP_HEALTH",
    "STORAGE", "LOSS", "CYCLE_ABANDON", "CROP_SALE", "CROP_GIVEN",
]


def upgrade():
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE tenant.field_events DROP CONSTRAINT IF EXISTS field_events_event_type_check"))
    existing = {r[0] for r in conn.execute(sa.text(
        "SELECT DISTINCT event_type FROM tenant.field_events WHERE event_type IS NOT NULL"))}
    verbs = sorted(set(_VERBS) | existing)
    vals = ", ".join("'" + v.replace("'", "''") + "'" for v in verbs)
    conn.execute(sa.text(
        f"ALTER TABLE tenant.field_events ADD CONSTRAINT field_events_event_type_check "
        f"CHECK (event_type IN ({vals}))"))


def downgrade():
    # No-op: re-adding a superset constraint is not meaningfully reversible.
    pass
