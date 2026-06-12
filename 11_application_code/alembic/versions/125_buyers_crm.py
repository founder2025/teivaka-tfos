"""125 — Buyers CRM: demand signals + sales pipeline + disputes (Buyers S3)

Three real tables so the Demand / Pipeline views and per-buyer Disputes stop being
honest-empty: tenant.buyer_demand_signals, tenant.buyer_leads, tenant.buyer_disputes
(all FORCE RLS). Registers DEMAND_SIGNAL_LOGGED / LEAD_LOGGED / DISPUTE_LOGGED so each
entry is hash-chained.

Revision ID: 125_buyers_crm
Revises: 124_customer_buyer_fields
"""
from alembic import op
import sqlalchemy as sa

revision = "125_buyers_crm"
down_revision = "124_customer_buyer_fields"
branch_labels = None
depends_on = None

_EVENTS = ["DEMAND_SIGNAL_LOGGED", "LEAD_LOGGED", "DISPUTE_LOGGED"]


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

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS tenant.buyer_demand_signals (
            signal_id     TEXT PRIMARY KEY,
            tenant_id     UUID NOT NULL,
            farm_id       TEXT,
            customer_id   TEXT NOT NULL,
            crop_type     TEXT,
            grade         TEXT,
            quantity_kg   NUMERIC(12,2),
            avg_price_fjd NUMERIC(10,2),
            frequency     TEXT,
            preferred_day TEXT,
            confidence    TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high','medium','low')),
            status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
            notes         TEXT,
            created_by    UUID,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_demand_signals_cust ON tenant.buyer_demand_signals (tenant_id, customer_id)"))
    _rls(conn, "buyer_demand_signals")

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS tenant.buyer_leads (
            lead_id              TEXT PRIMARY KEY,
            tenant_id            UUID NOT NULL,
            farm_id              TEXT,
            prospect_name        TEXT NOT NULL,
            prospect_type        TEXT,
            city                 TEXT,
            potential_monthly_fjd NUMERIC(12,2),
            stage                TEXT NOT NULL DEFAULT 'lead' CHECK (stage IN ('lead','qualified','negotiating','won','lost')),
            next_action          TEXT,
            next_action_date     DATE,
            notes                TEXT,
            created_by           UUID,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_leads_farm ON tenant.buyer_leads (tenant_id, farm_id, stage)"))
    _rls(conn, "buyer_leads")

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS tenant.buyer_disputes (
            dispute_id           TEXT PRIMARY KEY,
            tenant_id            UUID NOT NULL,
            farm_id              TEXT,
            customer_id          TEXT NOT NULL,
            order_id             TEXT,
            dispute_date         DATE NOT NULL,
            reason               TEXT,
            description          TEXT,
            quantity_kg          NUMERIC(12,2),
            financial_impact_fjd NUMERIC(10,2),
            status               TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
            resolution           TEXT,
            resolution_amount_fjd NUMERIC(10,2),
            created_by           UUID,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
            resolved_at          TIMESTAMPTZ
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_disputes_cust ON tenant.buyer_disputes (tenant_id, customer_id)"))
    _rls(conn, "buyer_disputes")

    for et in _EVENTS:
        conn.execute(sa.text("""
            INSERT INTO shared.event_type_catalog
                (event_type, catalog_group, sort_order, backdating_window_days, requires_reason_after_days, is_active)
            VALUES (:et, 'OTHER', 150, 30, 0, TRUE) ON CONFLICT (event_type) DO NOTHING
        """), {"et": et})
        conn.execute(sa.text("""
            INSERT INTO shared.naming_dictionary (concept_key, locale, form, value, is_active)
            VALUES (:ck, 'en', 'label', :lbl, TRUE) ON CONFLICT (concept_key, locale, form) DO NOTHING
        """), {"ck": f"event.{et}.label", "lbl": et.replace("_", " ").title()})
    _rebuild_audit_check(conn)


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS tenant.buyer_demand_signals"))
    conn.execute(sa.text("DROP TABLE IF EXISTS tenant.buyer_leads"))
    conn.execute(sa.text("DROP TABLE IF EXISTS tenant.buyer_disputes"))
    for et in _EVENTS:
        conn.execute(sa.text("DELETE FROM shared.naming_dictionary WHERE concept_key = :ck"), {"ck": f"event.{et}.label"})
        conn.execute(sa.text("DELETE FROM shared.event_type_catalog WHERE event_type = :et"), {"et": et})
    _rebuild_audit_check(conn)
