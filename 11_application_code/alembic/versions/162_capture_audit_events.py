"""162 — capture audit events (slice 2b: labor attendance / check-in / inventory movement).

labor (POST /labor), check-in (POST /attendance/clock) and inventory movements
(POST /input-transactions) wrote tenant.* with NO audit row. This ensures the three
event types exist in shared.event_type_catalog (idempotent) and rebuilds the audit.events
CHECK so the emits pass. ATTENDANCE_LOGGED is new; WORKER_CHECKIN + INPUT_USED_ADJUSTMENT
already exist (re-asserted defensively). Mirrors migration 131/161.

Revision ID: 162_capture_audit_events
Revises: 161_register_create_audit
Create Date: 2026-06-23

Idempotent. Apply as owner (Strike #123). rev id 24 chars (<=32).
"""
from alembic import op
import sqlalchemy as sa

revision = "162_capture_audit_events"
down_revision = "161_register_create_audit"
branch_labels = None
depends_on = None

_EVENTS = {
    "ATTENDANCE_LOGGED":     "Attendance logged",
    "WORKER_CHECKIN":        "Worker check-in",
    "INPUT_USED_ADJUSTMENT": "Stock movement",
}


def _rebuild_audit_check(conn):
    conn.execute(sa.text("ALTER TABLE audit.events DROP CONSTRAINT IF EXISTS events_event_type_check;"))
    rows = conn.execute(sa.text("SELECT DISTINCT event_type FROM shared.event_type_catalog ORDER BY event_type;"))
    vals = ", ".join(f"'{r[0]}'" for r in rows)
    conn.execute(sa.text(f"ALTER TABLE audit.events ADD CONSTRAINT events_event_type_check CHECK (event_type IN ({vals}));"))


def upgrade():
    conn = op.get_bind()
    for et, lbl in _EVENTS.items():
        conn.execute(sa.text("""
            INSERT INTO shared.event_type_catalog
                (event_type, catalog_group, sort_order, is_user_facing, is_compound,
                 livestock_only, min_role, min_mode, backdating_window_days,
                 requires_reason_after_days, is_active, notes)
            VALUES (:et, 'OTHER', 5, false, false, false, 'WORKER', 'SOLO', 0, NULL, true,
                    'Slice 2b: capture-event audit (labor/checkin/inventory movement).')
            ON CONFLICT (event_type) DO NOTHING
        """), {"et": et})
        conn.execute(sa.text("""
            INSERT INTO shared.naming_dictionary (concept_key, locale, form, value, is_active)
            VALUES (:ck, 'en', 'label', :lbl, TRUE) ON CONFLICT (concept_key, locale, form) DO NOTHING
        """), {"ck": f"event.{et}.label", "lbl": lbl})
    _rebuild_audit_check(conn)


def downgrade():
    conn = op.get_bind()
    # Only remove the genuinely-new type; the other two pre-date this migration.
    conn.execute(sa.text("DELETE FROM shared.naming_dictionary WHERE concept_key = 'event.ATTENDANCE_LOGGED.label'"))
    conn.execute(sa.text("DELETE FROM shared.event_type_catalog WHERE event_type = 'ATTENDANCE_LOGGED'"))
    _rebuild_audit_check(conn)
