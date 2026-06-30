"""204 — unify the moderation queue (Trust & Safety Slice 1)

Today reports land in two disconnected places: posts/replies → community.feed_flags
(which the admin queue reads), but chat reports → community.chat_reports (NO moderator
ever sees them) and marketplace listings have NO report path at all. So a scam listing
or an abusive DM never reaches a human — the core fraud gap.

This generalizes community.feed_flags into ONE queue: a target_type/target_id pair
(POST/REPLY/LISTING/USER/MESSAGE/GROUP) so every report type surfaces to moderators.
Purely additive columns + a backfill; drops the old "post_id OR reply_id required"
CHECK so non-post targets can be filed.

Apply as owner (Strike #123); one statement per op.execute (Strike #72); reversible.
"""
from alembic import op

revision = "204_moderation_queue_unify"
down_revision = "203_feed_rank_score"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE community.feed_flags "
        "ADD COLUMN IF NOT EXISTS target_type      TEXT, "
        "ADD COLUMN IF NOT EXISTS target_id        TEXT, "
        "ADD COLUMN IF NOT EXISTS reported_user_id UUID, "
        "ADD COLUMN IF NOT EXISTS category         TEXT, "
        "ADD COLUMN IF NOT EXISTS action_taken     TEXT"
    )
    # Drop the legacy "post_id IS NOT NULL OR reply_id IS NOT NULL" table CHECK by
    # name-discovery (it's an auto-named constraint), so listing/user/message
    # reports can be filed. DO block = one statement (asyncpg-safe).
    op.execute(
        "DO $$ DECLARE c text; BEGIN "
        "SELECT conname INTO c FROM pg_constraint "
        "WHERE conrelid = 'community.feed_flags'::regclass AND contype = 'c' "
        "AND pg_get_constraintdef(oid) ILIKE '%post_id%reply_id%'; "
        "IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE community.feed_flags DROP CONSTRAINT %I', c); END IF; "
        "END $$"
    )
    # Backfill existing post/reply flags into the generic shape.
    op.execute(
        "UPDATE community.feed_flags SET "
        "target_type = CASE WHEN post_id IS NOT NULL THEN 'POST' "
        "                   WHEN reply_id IS NOT NULL THEN 'REPLY' ELSE 'POST' END, "
        "target_id = COALESCE(post_id, reply_id) "
        "WHERE target_type IS NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_feed_flags_target "
        "ON community.feed_flags (target_type, status, created_at DESC)"
    )
    # GRANT is already held by teivaka_app (migration 090); re-assert idempotently.
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_flags TO teivaka_app")


def downgrade():
    op.execute("DROP INDEX IF EXISTS community.idx_feed_flags_target")
    op.execute(
        "ALTER TABLE community.feed_flags "
        "DROP COLUMN IF EXISTS action_taken, "
        "DROP COLUMN IF EXISTS category, "
        "DROP COLUMN IF EXISTS reported_user_id, "
        "DROP COLUMN IF EXISTS target_id, "
        "DROP COLUMN IF EXISTS target_type"
    )
    # The dropped legacy CHECK is intentionally NOT re-added (post-generalization
    # rows may legitimately have neither post_id nor reply_id).
