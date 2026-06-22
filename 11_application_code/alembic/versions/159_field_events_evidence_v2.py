"""159 — Evidence v2: voice + witness columns on field_events.

Revision ID: 159_field_events_evidence_v2
Revises: 158_field_events_grade_deliv
Create Date: 2026-06-22

Evidence Architecture v2. Photo + GPS already persist on tenant.field_events
(photo_url/photo_sha256/photo_byte_size/gps_lat/gps_lng). This adds the two
remaining evidence layers from the prototype's Universal Event Form so they
become REAL (verifiable), not cosmetic quality-score theatre:
  - voice_url / voice_sha256 / voice_byte_size : a recorded voice note, content-
    fingerprinted server-side (same SHA-256 path as photos → tamper-evident,
    foldable into the audit chain + Bank Evidence).
  - witness_name / witness_contact : a human attestation on the record.

ADD COLUMN IF NOT EXISTS on a hypertable is metadata-only (no chunk rewrite).
A single ALTER with multiple ADD clauses is ONE statement (asyncpg-safe, Strike
#72). Apply as owner (Strike #123). rev id 28 chars (<= 32, B41).
"""
from alembic import op

revision = "159_field_events_evidence_v2"
down_revision = "158_field_events_grade_deliv"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        ALTER TABLE tenant.field_events
            ADD COLUMN IF NOT EXISTS voice_url        TEXT,
            ADD COLUMN IF NOT EXISTS voice_sha256     TEXT,
            ADD COLUMN IF NOT EXISTS voice_byte_size  BIGINT,
            ADD COLUMN IF NOT EXISTS witness_name     TEXT,
            ADD COLUMN IF NOT EXISTS witness_contact  TEXT
        """
    )


def downgrade():
    op.execute(
        """
        ALTER TABLE tenant.field_events
            DROP COLUMN IF EXISTS voice_url,
            DROP COLUMN IF EXISTS voice_sha256,
            DROP COLUMN IF EXISTS voice_byte_size,
            DROP COLUMN IF EXISTS witness_name,
            DROP COLUMN IF EXISTS witness_contact
        """
    )
