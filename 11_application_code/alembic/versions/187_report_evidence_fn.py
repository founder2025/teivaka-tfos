"""187 - audit.report_evidence_by_hash: privacy-scoped report evidence for the public verify page.

The public QR/verify page (Phase 9) deliberately shows only chain proof. The Bank
Evidence QR should ALSO let a lender BROWSE the evidence behind the report — the
location blocks and the gallery photos that back the numbers. This SECURITY DEFINER
function (owned by teivaka, bypasses RLS exactly like 049's verify_event_by_hash)
returns ONLY that report's blocks + photos for a BANK_PDF_GENERATED hash — never
money, notes, user identities or any other payload field.

Privacy projection (locked):
  blocks: pu_name, area_ha, active_cycles
  photos: event_type, date, pu_id, photo_url, sha256
The hash is the capability — only someone the farmer handed the report/QR to has it.

Apply AS OWNER (teivaka) per Strike #123 so the function is owned by a role that
bypasses RLS. Grant EXECUTE to the runtime role teivaka_app.

Revision ID: 187_report_evidence_fn
Revises: 186_jobs_board
"""
from alembic import op
import sqlalchemy as sa


revision = "187_report_evidence_fn"
down_revision = "186_jobs_board"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    conn.execute(sa.text("""
        CREATE OR REPLACE FUNCTION audit.report_evidence_by_hash(p_hash CHAR(64))
        RETURNS jsonb
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog, public
        AS $$
        DECLARE
            v_tenant uuid; v_farm text; v_period text; v_ps date; v_pe date;
            v_blocks jsonb; v_photos jsonb;
        BEGIN
            -- Resolve scope from the report's own audit event (only Bank Evidence anchors).
            SELECT ae.tenant_id, ae.payload_jsonb->>'farm_id', ae.payload_jsonb->>'period'
              INTO v_tenant, v_farm, v_period
            FROM audit.events ae
            WHERE ae.this_hash = p_hash AND ae.event_type = 'BANK_PDF_GENERATED'
            LIMIT 1;
            IF v_tenant IS NULL OR v_farm IS NULL THEN
                RETURN NULL;
            END IF;

            BEGIN
                v_ps := to_date(v_period || '-01', 'YYYY-MM-DD');
                v_pe := (v_ps + INTERVAL '1 month')::date;
            EXCEPTION WHEN OTHERS THEN
                v_ps := NULL; v_pe := NULL;
            END;

            SELECT COALESCE(jsonb_agg(to_jsonb(bq)), '[]'::jsonb) INTO v_blocks FROM (
                SELECT pu.pu_name AS pu_name,
                       round((COALESCE(pu.area_sqm, 0) / 10000.0)::numeric, 3) AS area_ha,
                       (SELECT count(*) FROM tenant.production_cycles pc
                          WHERE pc.pu_id = pu.pu_id AND pc.tenant_id = v_tenant
                            AND pc.cycle_status IN ('ACTIVE', 'HARVESTING', 'CLOSING')) AS active_cycles
                FROM tenant.production_units pu
                WHERE pu.tenant_id = v_tenant AND pu.farm_id = v_farm AND pu.is_active = TRUE
                ORDER BY pu.pu_name
            ) bq;

            SELECT COALESCE(jsonb_agg(to_jsonb(pq)), '[]'::jsonb) INTO v_photos FROM (
                SELECT fe.event_type AS event_type,
                       fe.event_date::date AS date,
                       fe.pu_id AS pu_id,
                       fe.photo_url AS photo_url,
                       fe.photo_sha256 AS sha256
                FROM tenant.field_events fe
                WHERE fe.tenant_id = v_tenant AND fe.farm_id = v_farm
                  AND fe.photo_url IS NOT NULL
                  AND fe.deleted_at IS NULL
                  AND (v_ps IS NULL OR (fe.event_date >= v_ps AND fe.event_date < v_pe))
                ORDER BY fe.event_date DESC
                LIMIT 200
            ) pq;

            RETURN jsonb_build_object(
                'period', v_period, 'farm_id', v_farm,
                'blocks', v_blocks, 'photos', v_photos
            );
        END;
        $$;
    """))
    conn.execute(sa.text("REVOKE ALL ON FUNCTION audit.report_evidence_by_hash(CHAR(64)) FROM PUBLIC;"))
    conn.execute(sa.text("GRANT EXECUTE ON FUNCTION audit.report_evidence_by_hash(CHAR(64)) TO teivaka_app;"))


def downgrade():
    op.get_bind().execute(sa.text("DROP FUNCTION IF EXISTS audit.report_evidence_by_hash(CHAR(64));"))
