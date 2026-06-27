"""193 - Attestation integrity (TATI redesign): verifier identity + self-confirm detection.

Closes PP-18/P-1: an attestation must record WHO confirmed (verifier identity) and must not count
a self-confirm as independent. Adds:
  attestation_requests.creator_ip        -- IP that minted the request (self-confirm check)
  claim_verifications.independent         -- false when confirmer IP == creator IP (self-reported)
  claim_verifications.request_id          -- lineage back to the attestation request

Apply AS OWNER (teivaka) per Strike #123. Idempotent.

Revision ID: 193_attestation_integrity
Revises: 192_document_vault
"""
from alembic import op


revision = "193_attestation_integrity"
down_revision = "192_document_vault"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        if s.strip():
            op.execute(s)


def upgrade():
    _exec_each([
        "ALTER TABLE tenant.attestation_requests ADD COLUMN IF NOT EXISTS creator_ip TEXT",
        "ALTER TABLE tenant.claim_verifications ADD COLUMN IF NOT EXISTS independent BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE tenant.claim_verifications ADD COLUMN IF NOT EXISTS request_id UUID",
    ])


def downgrade():
    _exec_each([
        "ALTER TABLE tenant.claim_verifications DROP COLUMN IF EXISTS request_id",
        "ALTER TABLE tenant.claim_verifications DROP COLUMN IF EXISTS independent",
        "ALTER TABLE tenant.attestation_requests DROP COLUMN IF EXISTS creator_ip",
    ])
