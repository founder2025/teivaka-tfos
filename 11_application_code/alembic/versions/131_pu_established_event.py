"""131 — PRODUCTION_UNIT_ESTABLISHED audit event (Slice E)

The universal "establish a production unit" flow (create a pond / cage / woodlot
/ hive / paddock / bed for ANY enterprise) emits one hash-chained audit event.
Registers it in the catalog + rebuilds the audit.events CHECK (migration 128
pattern). No tables — production_units already holds every unit kind (130).

Revision ID: 131_pu_established_event
Revises: 130_universal_production_unit
"""
from alembic import op
import sqlalchemy as sa

revision = "131_pu_established_event"
down_revision = "130_universal_production_unit"
branch_labels = None
depends_on = None

_EVENTS = ["PRODUCTION_UNIT_ESTABLISHED"]


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
                (event_type, catalog_group, sort_order, is_user_facing, is_compound,
                 livestock_only, min_role, min_mode, backdating_window_days,
                 requires_reason_after_days, is_active, notes)
            VALUES (:et, 'OTHER', 5, false, false, false, 'WORKER', 'SOLO', 0, NULL, true,
                    'Slice E: a production unit (pond/cage/woodlot/hive/paddock/bed) was created.')
            ON CONFLICT (event_type) DO NOTHING
        """), {"et": et})
        conn.execute(sa.text("""
            INSERT INTO shared.naming_dictionary (concept_key, locale, form, value, is_active)
            VALUES (:ck, 'en', 'label', :lbl, TRUE) ON CONFLICT (concept_key, locale, form) DO NOTHING
        """), {"ck": f"event.{et}.label", "lbl": "Production unit created"})
    _rebuild_audit_check(conn)


def downgrade():
    conn = op.get_bind()
    for et in _EVENTS:
        conn.execute(sa.text("DELETE FROM shared.naming_dictionary WHERE concept_key = :ck"), {"ck": f"event.{et}.label"})
        conn.execute(sa.text("DELETE FROM shared.event_type_catalog WHERE event_type = :et"), {"et": et})
    _rebuild_audit_check(conn)
