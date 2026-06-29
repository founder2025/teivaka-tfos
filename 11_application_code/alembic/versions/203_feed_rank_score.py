"""203 — precomputed rank_score on community.feed_posts (Feed v2 Slice 2a)

The feed read used to ORDER BY a computed expression (recency decay + boosts + a
correlated topic-follows subquery), so every load did a FULL SORT of the candidate
set with no usable index — the thing that dies at scale and burns connection time
in low-bandwidth Fiji (Inviolable #3 spirit: don't recompute the ranking on every
request). This stores the post-intrinsic score + a matching partial index so the
read becomes an index-ordered scan.

rank_score = recency backbone (-hours since created) + open-question boost
             (+ verified boost, added by the recompute_feed_rank beat task once
              tenant.users.kyc_verified exists; honest 0 until then).
Linear recency decay is order-stable between refreshes (every active post ages by
the same Δ), so the beat only needs to refresh the boosts; new posts are scored at
INSERT in the router so they're never stuck at the default 0.

DEPLOY ORDER (important): apply BEFORE the new code serves — the read now SELECTs /
ORDER BYs these columns (deploy.sh migrates the fresh image before `up`).

Apply as owner (Strike #123); one statement per op.execute (Strike #72); reversible.
"""
from alembic import op

revision = "203_feed_rank_score"
down_revision = "202_feed_post_counters"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE community.feed_posts ADD COLUMN IF NOT EXISTS rank_score DOUBLE PRECISION NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE community.feed_posts ADD COLUMN IF NOT EXISTS ranked_at TIMESTAMPTZ")
    # Backfill from the current effective formula (verified is FALSE everywhere
    # today — no kyc_verified — so recency + open-question matches live output).
    op.execute(
        "UPDATE community.feed_posts fp SET "
        "rank_score = ( - extract(epoch from (now() - fp.created_at)) / 3600.0 "
        "               + CASE WHEN fp.is_question AND fp.best_answer_reply_id IS NULL THEN 24 ELSE 0 END ), "
        "ranked_at = now() "
        "WHERE fp.status = 'active'"
    )
    # Matches the read's ORDER BY exactly so it can be served as an index scan.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_feed_posts_rank "
        "ON community.feed_posts (pinned DESC, rank_score DESC, created_at DESC, post_id DESC) "
        "WHERE status = 'active'"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS community.ix_feed_posts_rank")
    op.execute("ALTER TABLE community.feed_posts DROP COLUMN IF EXISTS ranked_at, DROP COLUMN IF EXISTS rank_score")
