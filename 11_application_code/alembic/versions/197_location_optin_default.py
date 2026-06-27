"""Privacy: make location-sharing opt-IN for NEW users (share_location DEFAULT false).

Revision ID: 197_location_optin_default
Revises: 196_consignment_lots
Create Date: 2026-06-27

Settings audit SX-1. Migration 164 set `tenant.users.share_location NOT NULL DEFAULT true`
(opt-OUT) — a new farmer is broadcast on the network map before any consent. This flips the
DEFAULT to false so new signups are private by default (opt-in), which the Settings UI already
surfaces with a consent callout.

EXISTING users are intentionally LEFT UNCHANGED here. Backfilling already-opted-in users to
false changes live behaviour for people who may be using the map — that is a separate Operator
consent decision, to be made deliberately (a one-off UPDATE or a follow-up migration), not a
silent side effect of a default change.

Apply as the `teivaka` owner (Strike #123). Reversible.
"""
from alembic import op

revision = "197_location_optin_default"
down_revision = "196_consignment_lots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE tenant.users ALTER COLUMN share_location SET DEFAULT false")


def downgrade() -> None:
    op.execute("ALTER TABLE tenant.users ALTER COLUMN share_location SET DEFAULT true")
