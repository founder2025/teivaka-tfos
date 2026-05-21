"""tis_public_corpus runtime SELECT grant

Revision ID: 080_tis_public_grants
Revises: 079_tis_public_corpus
Create Date: 2026-05-21

Migration 079 created shared.tis_public_corpus without granting SELECT to
the runtime user teivaka_app. The retriever runs as teivaka_app and would
hit "permission denied" without this fix.

SCOPE — corpus only.

shared.* has NO default ACL (pg_default_acl), so every new shared.* table
needs explicit GRANT in the same revision. This is the B73 pattern;
migration 079 missed it; this migration retroactively fixes it.

ops.tis_public_telemetry (also created in 079) is NOT granted here.
ops.* has default privileges that auto-grant teivaka_app on every new
table + sequence (arwd + rU). Verified 2026-05-21 via pg_default_acl
inspection: teivaka_app already has SELECT/INSERT/UPDATE/DELETE on
ops.tis_public_telemetry and USAGE/SELECT on its sequence, applied
automatically at table creation time. Granting them again here would be
redundant; revoking them on downgrade would strip the schema defaults
and break the runtime INSERT path.

Inviolable #7 preserved: shared.tis_public_corpus stays read-only at
runtime (no INSERT/UPDATE/DELETE granted to teivaka_app).
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '080_tis_public_grants'
down_revision = '079_tis_public_corpus'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # shared.* has no default ACL — must explicitly grant SELECT.
    # Matches shared.productions convention: PUBLIC + teivaka_app SELECT.
    op.execute("GRANT SELECT ON shared.tis_public_corpus TO PUBLIC")
    op.execute("GRANT SELECT ON shared.tis_public_corpus TO teivaka_app")

    # ops.tis_public_telemetry + its sequence are intentionally NOT touched.
    # ops.* default ACL auto-grants teivaka_app at object creation time.


def downgrade() -> None:
    # Only revoke what upgrade granted.
    # Do NOT touch ops.* — revoking there would strip schema defaults.
    op.execute("REVOKE SELECT ON shared.tis_public_corpus FROM teivaka_app")
    op.execute("REVOKE SELECT ON shared.tis_public_corpus FROM PUBLIC")
