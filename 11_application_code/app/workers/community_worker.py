"""Community worker — background jobs for the community.* surfaces.

recompute_feed_rank: refreshes community.feed_posts.rank_score (Feed v2 Slice 2a)
so the feed read is an index-ordered scan instead of an on-demand full sort
(Inviolable #3 spirit). community.* has NO RLS, so this runs on a plain connection
with no app.tenant_id — the same NULL context the API's feed read uses (get_db_ctx).
Reads tenant.users.kyc_verified for the verified boost only if the column exists
(migration-tolerant; honest 0 until KYC ships).
"""
import psycopg2
import psycopg2.extras
import logging

from app.workers.celery_app import app as celery_app
from app.config import settings

logger = logging.getLogger(__name__)


def get_sync_db():
    db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(db_url, cursor_factory=psycopg2.extras.RealDictCursor)


@celery_app.task(
    name="app.workers.community_worker.recompute_feed_rank",
    queue="maintenance",
)
def recompute_feed_rank():
    """Recompute the post-intrinsic rank_score for recent active posts.

    Linear recency decay keeps relative order correct between runs, so a modest
    cadence (every 10 min) is enough — this mainly keeps the boosts current
    (verified author, open-question flipping when a best answer is marked).
    """
    conn = get_sync_db()
    try:
        cur = conn.cursor()
        # Verified boost only if the KYC column exists (mirrors _verified_expr in
        # the router) — never let an absent column break the rerank.
        cur.execute(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema='tenant' AND table_name='users' AND column_name='kyc_verified'"
        )
        has_kyc = cur.fetchone() is not None
        vterm = "CASE WHEN COALESCE(u.kyc_verified, FALSE) THEN 36 ELSE 0 END" if has_kyc else "0"
        # vterm is internally controlled (no user input) — safe to interpolate.
        cur.execute(
            f"""
            UPDATE community.feed_posts fp
            SET rank_score =
                  ( - extract(epoch from (now() - fp.created_at)) / 3600.0
                    + {vterm}
                    + CASE WHEN fp.is_question AND fp.best_answer_reply_id IS NULL THEN 24 ELSE 0 END ),
                ranked_at = now()
            FROM tenant.users u
            WHERE u.user_id = fp.author_user_id
              AND fp.status = 'active'
              AND fp.created_at > now() - interval '90 days'
            """
        )
        updated = cur.rowcount
        conn.commit()
        logger.info("[FEED RANK] recomputed %s posts (kyc=%s)", updated, has_kyc)
        return {"reranked": updated, "kyc": has_kyc}
    except Exception as e:  # noqa: BLE001 — fail-soft; stale scores are still ordered
        conn.rollback()
        logger.warning("[FEED RANK] failed: %s", e)
        return {"reranked": 0, "error": str(e)}
    finally:
        conn.close()
