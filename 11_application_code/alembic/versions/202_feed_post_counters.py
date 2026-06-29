"""202 — denormalized engagement counters on community.feed_posts (Feed v2 Slice 1b)

Kills the per-row count subqueries (N+1) the feed read paid on every load. Adds
like_count / reply_count / repost_count + backfills them from current data. The router
keeps them accurate with a recount-on-write (drift-proof) on like/unlike/reply/repost.

DEPLOY ORDER (important): this migration must apply BEFORE the new code serves, because
the feed read now SELECTs these columns. Run as a one-off on the freshly-built image:
  docker compose run --rm api alembic upgrade head   # then  up -d api
(else the read 500s in the window between `up` and `upgrade`).

Apply as owner (Strike #123); one statement per op.execute (Strike #72); reversible.
"""
from alembic import op

revision = "202_feed_post_counters"
down_revision = "201_feed_signals"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE community.feed_posts "
        "ADD COLUMN IF NOT EXISTS like_count   INTEGER NOT NULL DEFAULT 0, "
        "ADD COLUMN IF NOT EXISTS reply_count  INTEGER NOT NULL DEFAULT 0, "
        "ADD COLUMN IF NOT EXISTS repost_count INTEGER NOT NULL DEFAULT 0"
    )
    op.execute(
        "UPDATE community.feed_posts p SET like_count = "
        "(SELECT count(*) FROM community.feed_likes l WHERE l.post_id = p.post_id)"
    )
    op.execute(
        "UPDATE community.feed_posts p SET reply_count = "
        "(SELECT count(*) FROM community.feed_replies r WHERE r.post_id = p.post_id AND r.status = 'active')"
    )
    op.execute(
        "UPDATE community.feed_posts p SET repost_count = "
        "(SELECT count(*) FROM community.feed_posts rp WHERE rp.repost_of_id = p.post_id AND rp.status = 'active')"
    )


def downgrade():
    op.execute(
        "ALTER TABLE community.feed_posts "
        "DROP COLUMN IF EXISTS repost_count, DROP COLUMN IF EXISTS reply_count, DROP COLUMN IF EXISTS like_count"
    )
