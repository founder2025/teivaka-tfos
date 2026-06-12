"""122 — bind event photos to the hash chain: photo_sha256 + photo_byte_size

P0 evidence-integrity slice. Adds content-hash columns to tenant.field_events so a
photo's exact bytes are recorded and (via events.py) folded into the audit payload —
making each photo tamper-evident: a swapped or back-dated file no longer matches its
logged SHA-256. Columns are nullable; existing photos stay NULL until backfilled, and
new photos are bound at submit time. Additive, reversible.

Revision ID: 122_field_event_photo_hash
Revises: 121_library_type_catalog
"""
from alembic import op

revision = "122_field_event_photo_hash"
down_revision = "121_library_type_catalog"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE tenant.field_events ADD COLUMN IF NOT EXISTS photo_sha256 TEXT")
    op.execute("ALTER TABLE tenant.field_events ADD COLUMN IF NOT EXISTS photo_byte_size BIGINT")
    # The event's own audit-chain hash, stored on the row so a photo can link straight
    # to /verify/{audit_hash} without a cross-schema join.
    op.execute("ALTER TABLE tenant.field_events ADD COLUMN IF NOT EXISTS audit_hash TEXT")


def downgrade():
    op.execute("ALTER TABLE tenant.field_events DROP COLUMN IF EXISTS audit_hash")
    op.execute("ALTER TABLE tenant.field_events DROP COLUMN IF EXISTS photo_byte_size")
    op.execute("ALTER TABLE tenant.field_events DROP COLUMN IF EXISTS photo_sha256")
