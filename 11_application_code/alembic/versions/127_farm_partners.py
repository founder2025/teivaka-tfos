"""127 — Farm partner network (Partnerships page)

tenant.farm_partners stores the prototype's 5-group / 14-type farm network
(Government, Commercial, Finance, Support services, Development) so every
"+ Add" on /farm/partnerships writes a real row instead of vanishing into
client state. FORCE RLS, mirroring migration 125's canonical pattern.

Registers PARTNER_ADDED (network contact logged) and PARTNERSHIP_CREATED
(land & profit-share agreement ratified on the farm record) so both actions
are hash-chained.

Revision ID: 127_farm_partners
Revises: 126_equipment_records
"""
from alembic import op
import sqlalchemy as sa

revision = "127_farm_partners"
down_revision = "126_equipment_records"
branch_labels = None
depends_on = None

_EVENTS = ["PARTNER_ADDED", "PARTNERSHIP_CREATED"]

_GROUPS = ("government", "commercial", "finance", "support", "development")


def _rls(conn, table, grants="SELECT, INSERT, UPDATE"):
    conn.execute(sa.text(f"ALTER TABLE tenant.{table} ENABLE ROW LEVEL SECURITY"))
    conn.execute(sa.text(f"ALTER TABLE tenant.{table} FORCE ROW LEVEL SECURITY"))
    conn.execute(sa.text(f"""
        CREATE POLICY {table}_tenant_isolation ON tenant.{table}
            USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    """))
    conn.execute(sa.text(f"""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
                GRANT {grants} ON tenant.{table} TO teivaka_app;
            END IF;
        END $$
    """))


def _rebuild_audit_check(conn):
    conn.execute(sa.text("ALTER TABLE audit.events DROP CONSTRAINT IF EXISTS events_event_type_check;"))
    rows = conn.execute(sa.text("SELECT DISTINCT event_type FROM shared.event_type_catalog ORDER BY event_type;"))
    vals = ", ".join(f"'{r[0]}'" for r in rows)
    conn.execute(sa.text(f"ALTER TABLE audit.events ADD CONSTRAINT events_event_type_check CHECK (event_type IN ({vals}));"))


def upgrade():
    conn = op.get_bind()

    groups = ", ".join(f"'{g}'" for g in _GROUPS)
    conn.execute(sa.text(f"""
        CREATE TABLE IF NOT EXISTS tenant.farm_partners (
            partner_id    TEXT PRIMARY KEY,
            tenant_id     UUID NOT NULL,
            farm_id       TEXT NOT NULL,
            partner_group TEXT NOT NULL CHECK (partner_group IN ({groups})),
            partner_type  TEXT NOT NULL,
            name          TEXT NOT NULL,
            phone         TEXT,
            notes         TEXT,
            is_active     BOOLEAN NOT NULL DEFAULT TRUE,
            created_by    UUID,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_farm_partners_farm ON tenant.farm_partners (tenant_id, farm_id, partner_type)"))
    _rls(conn, "farm_partners")

    for et in _EVENTS:
        conn.execute(sa.text("""
            INSERT INTO shared.event_type_catalog
                (event_type, catalog_group, sort_order, backdating_window_days, requires_reason_after_days, is_active)
            VALUES (:et, 'OTHER', 155, 30, 0, TRUE) ON CONFLICT (event_type) DO NOTHING
        """), {"et": et})
        conn.execute(sa.text("""
            INSERT INTO shared.naming_dictionary (concept_key, locale, form, value, is_active)
            VALUES (:ck, 'en', 'label', :lbl, TRUE) ON CONFLICT (concept_key, locale, form) DO NOTHING
        """), {"ck": f"event.{et}.label", "lbl": et.replace("_", " ").title()})
    _rebuild_audit_check(conn)


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS tenant.farm_partners"))
    for et in _EVENTS:
        conn.execute(sa.text("DELETE FROM shared.naming_dictionary WHERE concept_key = :ck"), {"ck": f"event.{et}.label"})
        conn.execute(sa.text("DELETE FROM shared.event_type_catalog WHERE event_type = :et"), {"et": et})
    _rebuild_audit_check(conn)
