"""123 — buyer communications log + COMMUNICATION_LOGGED audit type (Buyers S2)

Adds tenant.buyer_communications (per-buyer comms: channel, direction, topic, notes,
date/time) so the Buyers detail view can show a real communication history, and registers
the COMMUNICATION_LOGGED audit event so each entry is hash-chained. PAYMENT_RECEIVED is
already in the catalog (migration 036) — payments record into cash_ledger, no new type.

Revision ID: 123_buyer_communications
Revises: 122_field_event_photo_hash
"""
from alembic import op
import sqlalchemy as sa

revision = "123_buyer_communications"
down_revision = "122_field_event_photo_hash"
branch_labels = None
depends_on = None


def _rebuild_audit_check(conn):
    conn.execute(sa.text("ALTER TABLE audit.events DROP CONSTRAINT IF EXISTS events_event_type_check;"))
    rows = conn.execute(sa.text("SELECT DISTINCT event_type FROM shared.event_type_catalog ORDER BY event_type;"))
    vals = ", ".join(f"'{r[0]}'" for r in rows)
    conn.execute(sa.text(f"ALTER TABLE audit.events ADD CONSTRAINT events_event_type_check CHECK (event_type IN ({vals}));"))


def upgrade():
    conn = op.get_bind()

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS tenant.buyer_communications (
            communication_id TEXT PRIMARY KEY,
            tenant_id        UUID NOT NULL,
            customer_id      TEXT NOT NULL,
            comm_date        DATE NOT NULL,
            comm_time        TEXT,
            channel          TEXT NOT NULL CHECK (channel IN ('whatsapp','call','visit','email','sms')),
            direction        TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
            topic            TEXT,
            notes            TEXT,
            created_by       UUID,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_buyer_comms_customer ON tenant.buyer_communications (tenant_id, customer_id, comm_date DESC)"))
    conn.execute(sa.text("ALTER TABLE tenant.buyer_communications ENABLE ROW LEVEL SECURITY"))
    conn.execute(sa.text("ALTER TABLE tenant.buyer_communications FORCE ROW LEVEL SECURITY"))
    conn.execute(sa.text("""
        CREATE POLICY buyer_communications_tenant_isolation
            ON tenant.buyer_communications
            USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    """))
    conn.execute(sa.text("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
                GRANT SELECT, INSERT ON tenant.buyer_communications TO teivaka_app;
            END IF;
        END $$
    """))

    conn.execute(sa.text("""
        INSERT INTO shared.event_type_catalog
            (event_type, catalog_group, sort_order, backdating_window_days, requires_reason_after_days, is_active)
        VALUES ('COMMUNICATION_LOGGED', 'OTHER', 140, 30, 0, TRUE)
        ON CONFLICT (event_type) DO NOTHING
    """))
    conn.execute(sa.text("""
        INSERT INTO shared.naming_dictionary (concept_key, locale, form, value, is_active)
        VALUES ('event.COMMUNICATION_LOGGED.label', 'en', 'label', 'Communication logged', TRUE)
        ON CONFLICT (concept_key, locale, form) DO NOTHING
    """))
    conn.execute(sa.text("""
        INSERT INTO shared.naming_dictionary (concept_key, locale, form, value, is_active)
        VALUES ('event.COMMUNICATION_LOGGED.voice_prompt', 'en', 'voice_prompt', 'Communication logged.', TRUE)
        ON CONFLICT (concept_key, locale, form) DO NOTHING
    """))
    _rebuild_audit_check(conn)


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS tenant.buyer_communications"))
    conn.execute(sa.text("DELETE FROM shared.naming_dictionary WHERE concept_key LIKE 'event.COMMUNICATION_LOGGED.%'"))
    conn.execute(sa.text("DELETE FROM shared.event_type_catalog WHERE event_type = 'COMMUNICATION_LOGGED'"))
    _rebuild_audit_check(conn)
