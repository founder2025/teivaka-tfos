"""151 - tenant.users.sessions_valid_after (refresh-token revocation cutoff)

Revision ID: 151_user_sessions_valid_after
Revises: 150_force_rls_all_tenant
Create Date: 2026-06-21

Alpha security hardening. Refresh tokens were previously un-revocable — a leaked
30-day refresh token could be replayed indefinitely, and changing your password
did NOT invalidate existing sessions. This adds a per-user cutoff: refresh tokens
now carry an `iat` (issued-at) claim, and POST /auth/refresh rejects any token
issued before `sessions_valid_after`. Password reset sets it to NOW(), so a reset
kills every prior session for that user. NULL = no cutoff (default).

Backward-compatible: legacy refresh tokens (no `iat` claim) are still accepted by
/refresh until they expire — no forced logout on deploy.

Revision id <= 32 chars for the tenant.alembic_version varchar(32) ceiling (B41).
asyncpg: one statement per op.execute (Strike #72); applied as owner (Strike #123).
"""
from alembic import op

revision = "151_user_sessions_valid_after"
down_revision = "150_force_rls_all_tenant"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS sessions_valid_after TIMESTAMPTZ"
    )


def downgrade():
    op.execute(
        "ALTER TABLE tenant.users DROP COLUMN IF EXISTS sessions_valid_after"
    )
