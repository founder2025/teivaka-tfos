"""128 — Control-room audit events (Farm Settings)

Registers the event types the Farm Settings control room emits so every
rename/edit there is hash-chained and traceable ("who changed the farm name
and when" is what makes the control room trusted):

  FARM_PROFILE_UPDATED — farms PATCH (name / region / area / archive)
  ZONE_UPDATED         — zones PATCH (rename / area)
  BLOCK_UPDATED        — production_units PATCH (rename / area)
  CYCLE_RELABELED      — production_cycles farmer_label correction

No new tables. Rebuilds the audit.events CHECK from the catalog (migration
125 pattern).

Revision ID: 128_control_room_events
Revises: 127_farm_partners
"""
from alembic import op
import sqlalchemy as sa

revision = "128_control_room_events"
down_revision = "127_farm_partners"
branch_labels = None
depends_on = None

_EVENTS = ["FARM_PROFILE_UPDATED", "ZONE_UPDATED", "BLOCK_UPDATED", "CYCLE_RELABELED"]


def _rebuild_audit_check(conn):
    conn.execute(sa.text("ALTER TABLE audit.events DROP CONSTRAINT IF EXISTS events_event_type_check;"))
    rows = conn.execute(sa.text("SELECT DISTINCT event_type FROM shared.event_type_catalog ORDER BY event_type;"))
    vals = ", ".join(f"'{r[0]}'" for r in rows)
    conn.execute(sa.text(f"ALTER TABLE audit.events ADD CONSTRAINT events_event_type_check CHECK (event_type IN ({vals}));"))


def upgrade():
    conn = op.get_bind()
    for et in _EVENTS:
        conn.execute(sa.text("""
            INSERT INTO shared.event_type_catalog
                (event_type, catalog_group, sort_order, backdating_window_days, requires_reason_after_days, is_active)
            VALUES (:et, 'OTHER', 160, 30, 0, TRUE) ON CONFLICT (event_type) DO NOTHING
        """), {"et": et})
        conn.execute(sa.text("""
            INSERT INTO shared.naming_dictionary (concept_key, locale, form, value, is_active)
            VALUES (:ck, 'en', 'label', :lbl, TRUE) ON CONFLICT (concept_key, locale, form) DO NOTHING
        """), {"ck": f"event.{et}.label", "lbl": et.replace("_", " ").title()})
    _rebuild_audit_check(conn)


def downgrade():
    conn = op.get_bind()
    for et in _EVENTS:
        conn.execute(sa.text("DELETE FROM shared.naming_dictionary WHERE concept_key = :ck"), {"ck": f"event.{et}.label"})
        conn.execute(sa.text("DELETE FROM shared.event_type_catalog WHERE event_type = :et"), {"et": et})
    _rebuild_audit_check(conn)
