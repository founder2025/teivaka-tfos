"""205 — allow machine-generated moderation flags (Trust & Safety Slice 2)

The automated first-pass classifier auto-flags obvious scam/spam into the same
moderation queue (community.feed_flags) for human review. A machine flag has no
human reporter, so reporter_user_id must be nullable. category='AUTO' marks these.

Purely relaxes a constraint (safe for existing rows). Reversible.

Apply as owner (Strike #123); one statement per op.execute (Strike #72).
"""
from alembic import op

revision = "205_feed_flags_auto_source"
down_revision = "204_moderation_queue_unify"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE community.feed_flags ALTER COLUMN reporter_user_id DROP NOT NULL")


def downgrade():
    # AUTO flags have no reporter — remove them before re-asserting NOT NULL.
    op.execute("DELETE FROM community.feed_flags WHERE reporter_user_id IS NULL")
    op.execute("ALTER TABLE community.feed_flags ALTER COLUMN reporter_user_id SET NOT NULL")
