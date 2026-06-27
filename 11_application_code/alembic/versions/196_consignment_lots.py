"""196 - Consignment / Lot traceability: trace a shipment block→inputs→harvest→buyer.

The exporter's bar — "what went in, where, how grown, traced and proven" — needs a
LOT object, not just farm-level reputation. A lot bundles allocations from one or more
harvests (many-to-many) into a consignment for a named buyer, with a public, token-gated
trace page (QR on the delivery docket).

Tables (tenant.*, FORCED RLS, mirrors 190):
  tenant.lots        — the consignment (token stored HASHED; freezes on deliver)
  tenant.lot_items   — per-harvest allocation (kg) — prevents double-counting across lots

production_units gains latitude/longitude (point geo — "where"; polygon is a later phase).

audit.resolve_lot_trace(token_hash) is the minimal SECURITY DEFINER bootstrap (mirrors
resolve_share): returns ONLY lot_id + tenant_id; the public endpoint then sets app.tenant_id
and assembles the trace under normal RLS. No new audit event_type (the lot's PROOF is its
constituent harvests' existing hash-chained rows — v1; LOT_DELIVERED chaining is a later phase).

NOTE: no FK from lot_items to tenant.harvest_log — harvest_log is a TimescaleDB hypertable
(poor FK target); allocation is validated in the app layer.

Apply AS OWNER (teivaka) per Strike #123. Idempotent.

Revision ID: 196_consignment_lots
Revises: 195_verify_photo_fn
"""
from alembic import op


revision = "196_consignment_lots"
down_revision = "195_verify_photo_fn"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        "ALTER TABLE tenant.production_units ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION",
        "ALTER TABLE tenant.production_units ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION",

        """
        CREATE TABLE IF NOT EXISTS tenant.lots (
            lot_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id       UUID NOT NULL,
            owner_user_id   UUID NOT NULL,
            lot_code        TEXT NOT NULL,
            crop_name       TEXT,
            buyer_id        UUID,
            buyer_name      TEXT,
            status          TEXT NOT NULL DEFAULT 'DRAFT',   -- DRAFT | DELIVERED
            total_kg        NUMERIC(12,2) NOT NULL DEFAULT 0,
            delivered_at    TIMESTAMPTZ,
            trace_token     TEXT NOT NULL UNIQUE,   -- plaintext capability (printed on the docket QR; reprintable)
            trace_expires_at TIMESTAMPTZ,           -- NULL = no expiry; the docket QR can be killed
            trace_revoked_at TIMESTAMPTZ,           -- kill switch for a leaked docket link
            notes           TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """,
        "ALTER TABLE tenant.lots ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE tenant.lots FORCE ROW LEVEL SECURITY",
        """
        CREATE POLICY lots_tenant_isolation ON tenant.lots
            FOR ALL
            USING      (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
        """,
        "CREATE INDEX IF NOT EXISTS idx_lots_tenant ON tenant.lots (tenant_id, created_at DESC)",

        """
        CREATE TABLE IF NOT EXISTS tenant.lot_items (
            item_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            lot_id        UUID NOT NULL,
            tenant_id     UUID NOT NULL,
            harvest_id    UUID NOT NULL,
            harvest_date  DATE NOT NULL,
            kg            NUMERIC(12,2) NOT NULL,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """,
        "ALTER TABLE tenant.lot_items ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE tenant.lot_items FORCE ROW LEVEL SECURITY",
        """
        CREATE POLICY lot_items_tenant_isolation ON tenant.lot_items
            FOR ALL
            USING      (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
        """,
        "CREATE INDEX IF NOT EXISTS idx_lot_items_lot ON tenant.lot_items (lot_id)",
        "CREATE INDEX IF NOT EXISTS idx_lot_items_harvest ON tenant.lot_items (harvest_id)",

        """
        CREATE OR REPLACE FUNCTION audit.resolve_lot_trace(p_token TEXT)
        RETURNS TABLE (lot_id UUID, tenant_id UUID)
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
        AS $$
        BEGIN
            RETURN QUERY
            SELECT l.lot_id, l.tenant_id
            FROM tenant.lots l
            WHERE l.trace_token = p_token
            LIMIT 1;
        END;
        $$;
        """,
        "REVOKE ALL ON FUNCTION audit.resolve_lot_trace(TEXT) FROM PUBLIC",
        "GRANT EXECUTE ON FUNCTION audit.resolve_lot_trace(TEXT) TO teivaka_app",

        """
        DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.lots TO teivaka_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.lot_items TO teivaka_app;
        END IF; END $$
        """,
    ])


def downgrade():
    _exec_each([
        "DROP FUNCTION IF EXISTS audit.resolve_lot_trace(TEXT)",
        "DROP POLICY IF EXISTS lot_items_tenant_isolation ON tenant.lot_items",
        "DROP TABLE IF EXISTS tenant.lot_items",
        "DROP POLICY IF EXISTS lots_tenant_isolation ON tenant.lots",
        "DROP TABLE IF EXISTS tenant.lots",
        "ALTER TABLE tenant.production_units DROP COLUMN IF EXISTS longitude",
        "ALTER TABLE tenant.production_units DROP COLUMN IF EXISTS latitude",
    ])
