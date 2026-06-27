"""194 - Farm land tenure (passport gap-close): bank-relevant land descriptor.

Adds tenant.farms.land_tenure (nullable TEXT) — e.g. 'iTaukei lease', 'Freehold',
'Crown/State lease', 'Native reserve'. Surfaced in the Agricultural Passport + share
portal as a high-value collateral signal for lenders. Nullable + additive (honest-empty
until the farmer sets it). No taxonomy enforced at DB level — the UI offers a best-guess
Fiji list but accepts free text (Operator may lock the taxonomy later).

Apply AS OWNER (teivaka) per Strike #123. Idempotent.

Revision ID: 194_farm_land_tenure
Revises: 193_attestation_integrity
"""
from alembic import op


revision = "194_farm_land_tenure"
down_revision = "193_attestation_integrity"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        if s.strip():
            op.execute(s)


def upgrade():
    _exec_each([
        "ALTER TABLE tenant.farms ADD COLUMN IF NOT EXISTS land_tenure TEXT",
    ])


def downgrade():
    _exec_each([
        "ALTER TABLE tenant.farms DROP COLUMN IF EXISTS land_tenure",
    ])
