"""174 — sponsor portal: tokenized read-only impact page

Sponsors aren't platform users, so the self-serve impact dashboard is reached by
an unguessable, rotatable token in the URL (same model as /verify/{hash}):
teivaka.com/sponsor/{portal_token}. No account, read-only, one org's own
aggregate impact.

Adds to community.sponsor_orgs:
  portal_token   TEXT UNIQUE  — 32-hex, DB-default generated, app-rotatable
  portal_enabled BOOLEAN      — admin kill-switch for the public link

Backfills a token for existing orgs. Additive/idempotent; reversible. Apply as
owner (Strike #123).

Revision ID: 174_sponsor_portal
Revises: 173_sponsored_seats
"""
from alembic import op
import sqlalchemy as sa

revision = "174_sponsor_portal"
down_revision = "173_sponsored_seats"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    has = conn.execute(sa.text(
        "SELECT to_regclass('community.sponsor_orgs') IS NOT NULL")).scalar()
    if not has:
        return
    conn.execute(sa.text(
        "ALTER TABLE community.sponsor_orgs "
        "ADD COLUMN IF NOT EXISTS portal_token TEXT, "
        "ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN NOT NULL DEFAULT true"))
    # Backfill tokens for any existing rows (gen_random_uuid is built-in on PG16).
    conn.execute(sa.text(
        "UPDATE community.sponsor_orgs "
        "SET portal_token = replace(gen_random_uuid()::text, '-', '') "
        "WHERE portal_token IS NULL"))
    # Default for future inserts + uniqueness.
    conn.execute(sa.text(
        "ALTER TABLE community.sponsor_orgs "
        "ALTER COLUMN portal_token SET DEFAULT replace(gen_random_uuid()::text, '-', '')"))
    conn.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_sponsor_orgs_portal_token "
        "ON community.sponsor_orgs (portal_token)"))


def downgrade():
    conn = op.get_bind()
    has = conn.execute(sa.text(
        "SELECT to_regclass('community.sponsor_orgs') IS NOT NULL")).scalar()
    if not has:
        return
    conn.execute(sa.text("DROP INDEX IF EXISTS community.ux_sponsor_orgs_portal_token"))
    conn.execute(sa.text(
        "ALTER TABLE community.sponsor_orgs "
        "DROP COLUMN IF EXISTS portal_token, DROP COLUMN IF EXISTS portal_enabled"))
