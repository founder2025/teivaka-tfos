"""195 - audit.verify_photo_by_hash: SAFE independent photo verification (proof-only).

The share portal shows each photo's SHA-256. This lets an institution INDEPENDENTLY
confirm a given photo hash is anchored in the farmer's tamper-evident chain — WITHOUT
leaking any other data. Deliberately NOT report_evidence_by_hash (which returns the full
bundle and would re-leak photos if made public, violating D2). This returns ONLY:
  found (bool), event_type, occurred_at, tenant_id (used internally for the chain check).
Same disclosure class as 049's verify_event_by_hash — proof of authenticity, nothing more.

SECURITY DEFINER (owned by teivaka, bypasses RLS like 049/187). Apply AS OWNER per
Strike #123. Grant EXECUTE to teivaka_app.

Revision ID: 195_verify_photo_fn
Revises: 194_farm_land_tenure
"""
from alembic import op
import sqlalchemy as sa


revision = "195_verify_photo_fn"
down_revision = "194_farm_land_tenure"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    conn.execute(sa.text("""
        CREATE OR REPLACE FUNCTION audit.verify_photo_by_hash(p_sha CHAR(64))
        RETURNS jsonb
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog, public
        AS $$
        DECLARE r record;
        BEGIN
            SELECT fe.event_type, fe.event_date, fe.tenant_id
              INTO r
            FROM tenant.field_events fe
            WHERE fe.photo_sha256 = p_sha::text
              AND fe.deleted_at IS NULL
            LIMIT 1;
            IF r.tenant_id IS NULL THEN
                RETURN jsonb_build_object('found', false);
            END IF;
            RETURN jsonb_build_object(
                'found', true,
                'event_type', r.event_type,
                'occurred_at', r.event_date,
                'tenant_id', r.tenant_id
            );
        END;
        $$;
    """))
    conn.execute(sa.text("REVOKE ALL ON FUNCTION audit.verify_photo_by_hash(CHAR(64)) FROM PUBLIC;"))
    conn.execute(sa.text("GRANT EXECUTE ON FUNCTION audit.verify_photo_by_hash(CHAR(64)) TO teivaka_app;"))


def downgrade():
    op.get_bind().execute(sa.text("DROP FUNCTION IF EXISTS audit.verify_photo_by_hash(CHAR(64));"))
