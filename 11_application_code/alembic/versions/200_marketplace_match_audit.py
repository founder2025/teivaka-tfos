"""200 — marketplace match audit event types

A job hire / service completion is a bank- and regulator-verifiable fact, but emitted
NO audit.events row (the verification-goal gap). This registers the marketplace match
event types in shared.event_type_catalog (idempotent) + rebuilds the audit.events CHECK
so emit_audit_event passes. Mirrors migration 162. JOB_HIRED is wired now (jobs_board
hire); SERVICE_JOB_COMPLETED + MARKETPLACE_MATCHED are pre-registered for the next slices.

Idempotent. Apply as owner (Strike #123). Reversible (drops only the genuinely-new types).
"""
from alembic import op
import sqlalchemy as sa

revision = "200_marketplace_match_audit"
down_revision = "199_marketplace_notif_types"
branch_labels = None
depends_on = None

_EVENTS = {
    "JOB_HIRED":             "Hired for a job",
    "SERVICE_JOB_COMPLETED": "Service job completed",
    "MARKETPLACE_MATCHED":   "Marketplace match",
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
                    'Match/Notify Slice 3: bank-verifiable marketplace match/completion audit.')
            ON CONFLICT (event_type) DO NOTHING
        """), {"et": et})
        conn.execute(sa.text("""
            INSERT INTO shared.naming_dictionary (concept_key, locale, form, value, is_active)
            VALUES (:ck, 'en', 'label', :lbl, TRUE) ON CONFLICT (concept_key, locale, form) DO NOTHING
        """), {"ck": f"event.{et}.label", "lbl": lbl})
    _rebuild_audit_check(conn)


def downgrade():
    conn = op.get_bind()
    for et in _EVENTS:
        conn.execute(sa.text("DELETE FROM shared.naming_dictionary WHERE concept_key = :ck"), {"ck": f"event.{et}.label"})
        conn.execute(sa.text("DELETE FROM shared.event_type_catalog WHERE event_type = :et"), {"et": et})
    _rebuild_audit_check(conn)
