-- 160 Evidence on cash_ledger (B92) — apply-as-owner (Strike #123)
-- ADD COLUMN IF NOT EXISTS is metadata-only (hypertable-safe). Idempotent.
-- Run as the OWNER role, then alembic stamp (AFTER the backend image is rebuilt — B78):
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/160_cash_ledger_evidence_apply_as_owner.sql
--   docker compose -f 04_environment/docker-compose.yml build --no-cache api && docker compose -f 04_environment/docker-compose.yml up -d api
--   docker exec teivaka_api alembic stamp 160_cash_ledger_evidence
--   docker exec teivaka_api alembic current   -- -> 160_cash_ledger_evidence (head)
-- Mirrors alembic/versions/160_cash_ledger_evidence.py upgrade().

ALTER TABLE tenant.cash_ledger
    ADD COLUMN IF NOT EXISTS photo_url        TEXT,
    ADD COLUMN IF NOT EXISTS photo_sha256     TEXT,
    ADD COLUMN IF NOT EXISTS photo_byte_size  BIGINT,
    ADD COLUMN IF NOT EXISTS voice_url        TEXT,
    ADD COLUMN IF NOT EXISTS voice_sha256     TEXT,
    ADD COLUMN IF NOT EXISTS voice_byte_size  BIGINT,
    ADD COLUMN IF NOT EXISTS witness_name     TEXT,
    ADD COLUMN IF NOT EXISTS witness_contact  TEXT,
    ADD COLUMN IF NOT EXISTS gps_lat          DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS gps_lng          DOUBLE PRECISION;
