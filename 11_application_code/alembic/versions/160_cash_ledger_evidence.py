"""160 — Evidence on cash_ledger (B92: receipt-photo + evidence on Money).

Revision ID: 160_cash_ledger_evidence
Revises: 159_field_events_evidence_v2
Create Date: 2026-06-22

The Whole-farm Money capture (Capture Engine → POST /cash-ledger) is audit-compliant
but carried no evidence because tenant.cash_ledger had no evidence columns. A receipt
photo on an expense is high-value Bank Evidence. This mirrors the field_events evidence
set so money records can carry the same verifiable layer:
  photo_url/photo_sha256/photo_byte_size, voice_url/voice_sha256/voice_byte_size,
  witness_name/witness_contact, gps_lat/gps_lng.

ADD COLUMN IF NOT EXISTS is metadata-only (hypertable-safe). One ALTER, multiple ADD
clauses = one statement (asyncpg-safe, Strike #72). Apply as owner (Strike #123).
rev id 24 chars (<= 32, B41).
"""
from alembic import op

revision = "160_cash_ledger_evidence"
down_revision = "159_field_events_evidence_v2"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
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
            ADD COLUMN IF NOT EXISTS gps_lng          DOUBLE PRECISION
        """
    )


def downgrade():
    op.execute(
        """
        ALTER TABLE tenant.cash_ledger
            DROP COLUMN IF EXISTS photo_url,
            DROP COLUMN IF EXISTS photo_sha256,
            DROP COLUMN IF EXISTS photo_byte_size,
            DROP COLUMN IF EXISTS voice_url,
            DROP COLUMN IF EXISTS voice_sha256,
            DROP COLUMN IF EXISTS voice_byte_size,
            DROP COLUMN IF EXISTS witness_name,
            DROP COLUMN IF EXISTS witness_contact,
            DROP COLUMN IF EXISTS gps_lat,
            DROP COLUMN IF EXISTS gps_lng
        """
    )
