"""147 - Grant runtime role write access on the registration infra tables

Revision ID: 147_grant_registration_tables
Revises: 146_ad_role_targeting
Create Date: 2026-06-14

Root-cause fix: shared.registration_audit_log and shared.ip_registration_counts
(created in migration 009) had no GRANT to the runtime role teivaka_app. Under
Strike #123 (migrations apply as the `teivaka` owner) these tables are owned by
`teivaka`, so the runtime role cannot INSERT/UPDATE them. Every signup writes to
both (IP rate-limit upsert + audit row), so the missing grant raised
InsufficientPrivilege, which escaped to the generic global handler as
"internal_server_error" (HTTP 500) — registration failed for ALL new users.

These two tables are registration infrastructure, NOT part of the shared.*
read-only doctrine (Inviolable #7) — they are explicitly write-at-runtime by
design. This grant is idempotent; if a prior deploy created them owned by
teivaka_app the grant is simply a no-op re-assert (B73 GRANT-audit discipline).

asyncpg: one statement per op.execute (Strike #72).
"""
from alembic import op

revision = "147_grant_registration_tables"
down_revision = "146_ad_role_targeting"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        "GRANT SELECT, INSERT, UPDATE, DELETE ON shared.registration_audit_log TO teivaka_app",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON shared.ip_registration_counts TO teivaka_app",
        # Both tables use bigserial PKs whose sequences also need runtime access
        # for INSERT to succeed (nextval). USAGE on every sequence in shared is
        # idempotent and harmless.
        "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA shared TO teivaka_app",
    ])


def downgrade():
    _exec_each([
        "REVOKE INSERT, UPDATE, DELETE ON shared.registration_audit_log FROM teivaka_app",
        "REVOKE INSERT, UPDATE, DELETE ON shared.ip_registration_counts FROM teivaka_app",
    ])
