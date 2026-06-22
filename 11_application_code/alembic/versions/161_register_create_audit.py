"""161 — register-create audit events (slice 2: Buyers / Equipment / Inputs / Workers).

Entity-create surfaces (add buyer / add equipment / add input item / add worker) wrote
tenant.* with NO audit.events row — violating the Universal Event Form Contract (one add
-> one hash-chained row). This registers the four event types in shared.event_type_catalog
(is_user_facing=false — they are register-creates, NOT (+) catalog tiles) + a naming label,
then rebuilds the audit.events CHECK from the catalog so the emits in customers.py /
equipment.py / inputs.py / workers.py pass the constraint. Mirrors migration 131.

Revision ID: 161_register_create_audit
Revises: 160_cash_ledger_evidence
Create Date: 2026-06-23

Idempotent (ON CONFLICT DO NOTHING). Apply as owner (Strike #123). rev id 25 chars (<=32).
"""
from alembic import op
import sqlalchemy as sa

revision = "161_register_create_audit"
down_revision = "160_cash_ledger_evidence"
branch_labels = None
depends_on = None

_EVENTS = {
    "BUYER_ADDED":     "Buyer added",
    "EQUIPMENT_ADDED": "Equipment added",
    "INPUT_ADDED":     "Input item added",
    "WORKER_ADDED":    "Worker added",
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
                    'Slice 2: a register row was created (entity-create audit event).')
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
