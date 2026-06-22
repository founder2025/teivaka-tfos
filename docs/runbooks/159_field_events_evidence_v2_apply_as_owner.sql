-- 159 Evidence v2 — add voice + witness columns to tenant.field_events — apply-as-owner (Strike #123)
-- ADD COLUMN IF NOT EXISTS on a hypertable is metadata-only (no chunk rewrite). Idempotent.
-- Run as the OWNER role, then alembic stamp:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/159_field_events_evidence_v2_apply_as_owner.sql
--   docker exec teivaka_api alembic stamp 159_field_events_evidence_v2
--   docker exec teivaka_api alembic current   -- -> 159_field_events_evidence_v2 (head)
-- Mirrors alembic/versions/159_field_events_evidence_v2.py upgrade().

ALTER TABLE tenant.field_events
    ADD COLUMN IF NOT EXISTS voice_url        TEXT,
    ADD COLUMN IF NOT EXISTS voice_sha256     TEXT,
    ADD COLUMN IF NOT EXISTS voice_byte_size  BIGINT,
    ADD COLUMN IF NOT EXISTS witness_name     TEXT,
    ADD COLUMN IF NOT EXISTS witness_contact  TEXT;
