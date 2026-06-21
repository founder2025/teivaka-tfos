"""153 - revoke UPDATE/DELETE on audit.events from teivaka_app (append-only hard-grant).

Revision ID: 153_revoke_audit_mutations
Revises: 152_merge_feed_audience
Create Date: 2026-06-21

Cluster 3 (tenant isolation / sacred-chain defense-in-depth).

audit.events is the append-only hash chain behind Bank Evidence. Migration 023
added immutability TRIGGERS (events_immutability_guard raises 42501 on UPDATE/
DELETE) and REVOKEd UPDATE,DELETE FROM PUBLIC — but the matching
`REVOKE UPDATE, DELETE ON audit.events FROM teivaka_app` line was left COMMENTED
OUT (023 line 162). So the runtime role still holds UPDATE/DELETE on the chain.

Today the triggers hold the line (and teivaka_app cannot set
session_replication_role to bypass them — that needs superuser). But the grant is
a latent hole: drop or disable the trigger and the app could rewrite history.
Defense-in-depth says the privilege should not exist at all. Verified: no app code
UPDATEs or DELETEs audit.events (grep clean), so removing the grant breaks nothing.

REVOKE/GRANT must run as the table OWNER (teivaka), so this applies as owner
(Strike #123): run docs/runbooks/153_revoke_audit_mutations_apply_as_owner.sql as
the teivaka role, then `alembic stamp 153_revoke_audit_mutations`. The upgrade()
body below is the canonical record and is what runs on a greenfield apply.

REVOKE is idempotent (revoking a privilege not held is a no-op). rev id 26 chars
(<= 32, B41).
"""
from alembic import op

revision = "153_revoke_audit_mutations"
down_revision = "152_merge_feed_audience"
branch_labels = None
depends_on = None


def upgrade():
    # Finish what 023 intended: the runtime role must never hold mutation rights on
    # the append-only chain. INSERT + SELECT remain (granted in 023/094).
    op.execute("REVOKE UPDATE, DELETE ON audit.events FROM teivaka_app")


def downgrade():
    # Restore the prior (over-broad) grant. Note: the immutability triggers still
    # block actual UPDATE/DELETE regardless — this only restores the privilege bit.
    op.execute("GRANT UPDATE, DELETE ON audit.events TO teivaka_app")
