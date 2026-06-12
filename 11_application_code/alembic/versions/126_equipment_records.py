"""126 — Equipment records: usage (hours/fuel), maintenance log, parts (Equipment complete)

Backs the prototype's Usage, Maintenance, Costs and Parts tabs + the per-asset detail with
real data, so every Equipment tile/button works end-to-end:
  - tenant.equipment_usage      (hours/km run, fuel, cycle allocation, operator)
  - tenant.equipment_maintenance (service/repair, parts+labor cost, downtime)
  - tenant.equipment_parts       (spares: on-hand, unit cost, lead time, ferry)
  - tenant.equipment += current_hours, hours_unit, useful_life_years (hours + depreciation)
Registers EQUIPMENT_USAGE_LOGGED / EQUIPMENT_PART_LOGGED (EQUIPMENT_MAINTAINED already exists).

Revision ID: 126_equipment_records
Revises: 125_buyers_crm
"""
from alembic import op
import sqlalchemy as sa

revision = "126_equipment_records"
down_revision = "125_buyers_crm"
branch_labels = None
depends_on = None

_EVENTS = ["EQUIPMENT_USAGE_LOGGED", "EQUIPMENT_PART_LOGGED", "EQUIPMENT_MAINTAINED"]


def _rls(conn, table):
    conn.execute(sa.text(f"ALTER TABLE tenant.{table} ENABLE ROW LEVEL SECURITY"))
    conn.execute(sa.text(f"ALTER TABLE tenant.{table} FORCE ROW LEVEL SECURITY"))
    conn.execute(sa.text(f"""
        CREATE POLICY {table}_tenant_isolation ON tenant.{table}
            USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    """))
    conn.execute(sa.text(f"""
        DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
            GRANT SELECT, INSERT, UPDATE ON tenant.{table} TO teivaka_app; END IF; END $$
    """))


def _rebuild_audit_check(conn):
    conn.execute(sa.text("ALTER TABLE audit.events DROP CONSTRAINT IF EXISTS events_event_type_check;"))
    rows = conn.execute(sa.text("SELECT DISTINCT event_type FROM shared.event_type_catalog ORDER BY event_type;"))
    vals = ", ".join(f"'{r[0]}'" for r in rows)
    conn.execute(sa.text(f"ALTER TABLE audit.events ADD CONSTRAINT events_event_type_check CHECK (event_type IN ({vals}));"))


def upgrade():
    conn = op.get_bind()
    op.execute("ALTER TABLE tenant.equipment ADD COLUMN IF NOT EXISTS current_hours NUMERIC(12,1) NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE tenant.equipment ADD COLUMN IF NOT EXISTS hours_unit TEXT NOT NULL DEFAULT 'h'")
    op.execute("ALTER TABLE tenant.equipment ADD COLUMN IF NOT EXISTS useful_life_years INTEGER")

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS tenant.equipment_usage (
            usage_id      TEXT PRIMARY KEY,
            tenant_id     UUID NOT NULL,
            farm_id       TEXT,
            equipment_id  TEXT NOT NULL,
            usage_date    DATE NOT NULL,
            hours_run     NUMERIC(10,1) NOT NULL DEFAULT 0,
            km_run        NUMERIC(10,1),
            fuel_litres   NUMERIC(10,1),
            fuel_cost_fjd NUMERIC(10,2),
            cycle_id      TEXT,
            pu_id         TEXT,
            task          TEXT,
            operator      TEXT,
            notes         TEXT,
            created_by    UUID,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_equip_usage ON tenant.equipment_usage (tenant_id, equipment_id, usage_date DESC)"))
    _rls(conn, "equipment_usage")

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS tenant.equipment_maintenance (
            maint_id        TEXT PRIMARY KEY,
            tenant_id       UUID NOT NULL,
            farm_id         TEXT,
            equipment_id    TEXT NOT NULL,
            maint_date      DATE NOT NULL,
            maint_type      TEXT NOT NULL DEFAULT 'service' CHECK (maint_type IN ('service','repair')),
            description     TEXT,
            parts_cost_fjd  NUMERIC(10,2) NOT NULL DEFAULT 0,
            labor_cost_fjd  NUMERIC(10,2) NOT NULL DEFAULT 0,
            total_cost_fjd  NUMERIC(10,2) NOT NULL DEFAULT 0,
            downtime_hours  NUMERIC(8,1) NOT NULL DEFAULT 0,
            performed_by    TEXT,
            next_service_date DATE,
            created_by      UUID,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_equip_maint ON tenant.equipment_maintenance (tenant_id, equipment_id, maint_date DESC)"))
    _rls(conn, "equipment_maintenance")

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS tenant.equipment_parts (
            part_id        TEXT PRIMARY KEY,
            tenant_id      UUID NOT NULL,
            farm_id        TEXT,
            part_name      TEXT NOT NULL,
            equipment_id   TEXT,
            on_hand        NUMERIC(10,1) NOT NULL DEFAULT 0,
            reorder_point  NUMERIC(10,1),
            unit_cost_fjd  NUMERIC(10,2),
            lead_time_days INTEGER,
            ferry_dependent BOOLEAN NOT NULL DEFAULT false,
            supplier_id    TEXT,
            notes          TEXT,
            created_by     UUID,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_equip_parts ON tenant.equipment_parts (tenant_id, farm_id)"))
    _rls(conn, "equipment_parts")

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
    conn.execute(sa.text("DROP TABLE IF EXISTS tenant.equipment_usage"))
    conn.execute(sa.text("DROP TABLE IF EXISTS tenant.equipment_maintenance"))
    conn.execute(sa.text("DROP TABLE IF EXISTS tenant.equipment_parts"))
    op.execute("ALTER TABLE tenant.equipment DROP COLUMN IF EXISTS current_hours")
    op.execute("ALTER TABLE tenant.equipment DROP COLUMN IF EXISTS hours_unit")
    op.execute("ALTER TABLE tenant.equipment DROP COLUMN IF EXISTS useful_life_years")
    for et in ["EQUIPMENT_USAGE_LOGGED", "EQUIPMENT_PART_LOGGED"]:
        conn.execute(sa.text("DELETE FROM shared.naming_dictionary WHERE concept_key = :ck"), {"ck": f"event.{et}.label"})
        conn.execute(sa.text("DELETE FROM shared.event_type_catalog WHERE event_type = :et"), {"et": et})
    _rebuild_audit_check(conn)
