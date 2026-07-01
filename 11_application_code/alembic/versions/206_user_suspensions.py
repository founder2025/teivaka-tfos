"""206 — community.user_suspensions (Trust & Safety Slice 3: moderator kill-switch)

Completes the enforcement loop: report/auto-flag a scammer → a moderator takes them
offline. Modelled as a COMMUNITY-level fact (no RLS), enforced at community-write
time — deliberately NOT a mutation of tenant.users.is_active (that is an RLS-sensitive
cross-tenant write on the auth/identity surface). Fully reversible: delete the row =
unsuspend. Suspension blocks community WRITES only (post/listing/DM/etc.); reading is
never blocked.

Cross-tenant community.* pattern (no RLS). Apply as owner (Strike #123);
one statement per op.execute (Strike #72); reversible.
"""
from alembic import op

revision = "206_user_suspensions"
down_revision = "205_feed_flags_auto_source"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS community.user_suspensions (
            user_id      UUID PRIMARY KEY,
            reason       TEXT,
            suspended_by UUID,
            until        TIMESTAMPTZ,   -- NULL = indefinite; else auto-expires
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON community.user_suspensions TO teivaka_app")


def downgrade():
    op.execute("DROP TABLE IF EXISTS community.user_suspensions")
