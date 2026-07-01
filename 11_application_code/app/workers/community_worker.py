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
        # Engagement flywheel (Blocker #3): fold REAL engagement into the score —
        # denormalized like/reply/repost counters (weighted; a reply/repost is
        # worth more than a like) + distinct-user CLICK signals. ln()-dampened and
        # capped at +48h-equivalent so virality NUDGES but never buries fresh
        # content (an ag feed values freshness); distinct-user clicks blunt
        # self-gaming. Zero engagement → +0, so new/quiet posts are unaffected.
        eng = ("(fp.like_count + 2*fp.reply_count + 3*fp.repost_count "
               "+ (SELECT count(DISTINCT s.user_id) FROM community.feed_signals s "
               "WHERE s.post_id = fp.post_id AND s.signal_type = 'CLICK'))")
        # vterm/eng are internally controlled (no user input) — safe to interpolate.
        cur.execute(
            f"""
            UPDATE community.feed_posts fp
            SET rank_score =
                  ( - extract(epoch from (now() - fp.created_at)) / 3600.0
                    + {vterm}
                    + CASE WHEN fp.is_question AND fp.best_answer_reply_id IS NULL THEN 24 ELSE 0 END
                    + LEAST(48.0, 12.0 * ln(1 + {eng})) ),
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


@celery_app.task(
    name="app.workers.community_worker.recompute_trust_levels",
    queue="maintenance",
)
def recompute_trust_levels():
    """Refresh the denormalized trust-level cache (Trust Ladder Slice 2) so the
    badge shows cheaply on listings/directory/feed authors.

    audit.events has STRICT tenant-isolation RLS, so record counts must be read
    per-tenant (Strike #95 two-stage scan): iterate tenants, set app.tenant_id,
    aggregate that tenant's users. Level is decided by the SAME
    trust.level_from_signals used by the live API helper (no drift). Fail-soft
    per tenant — one bad tenant never aborts the batch."""
    from app.core.trust import level_from_signals
    conn = get_sync_db()
    total = 0
    try:
        cur = conn.cursor()
        cur.execute("SELECT tenant_id FROM tenant.tenants")
        tenant_ids = [r["tenant_id"] for r in cur.fetchall()]
        for tid in tenant_ids:
            try:
                cur.execute("SET app.tenant_id = %s", (str(tid),))
                cur.execute(
                    """
                    SELECT u.user_id,
                           COALESCE(u.kyc_verified, FALSE)   AS kyc,
                           COALESCE(u.email_verified, FALSE) AS email,
                           (SELECT count(*) FROM audit.events e WHERE e.created_by = u.user_id) AS records,
                           (SELECT count(*) FROM community.feed_posts p
                             WHERE p.author_user_id = u.user_id AND p.link_audit_hash IS NOT NULL) AS linked
                    FROM tenant.users u
                    WHERE u.tenant_id = cast(%s AS uuid) AND u.is_active = TRUE
                    """, (str(tid),))
                rows = cur.fetchall()
                for r in rows:
                    level, score = level_from_signals(r["kyc"], r["email"], r["records"], 0, r["linked"])
                    cur.execute(
                        """
                        INSERT INTO community.user_trust (user_id, level, score, kyc, verified_records, computed_at)
                        VALUES (%s, %s, %s, %s, %s, now())
                        ON CONFLICT (user_id) DO UPDATE
                           SET level = EXCLUDED.level, score = EXCLUDED.score, kyc = EXCLUDED.kyc,
                               verified_records = EXCLUDED.verified_records, computed_at = now()
                        """, (str(r["user_id"]), level, score, bool(r["kyc"]), int(r["records"])))
                    total += 1
                conn.commit()
            except Exception as te:  # noqa: BLE001 — one tenant's failure must not abort the batch
                conn.rollback()
                logger.warning("[TRUST] tenant %s failed: %s", tid, te)
        logger.info("[TRUST] recomputed %s user trust levels across %s tenants", total, len(tenant_ids))
        return {"users": total, "tenants": len(tenant_ids)}
    except Exception as e:  # noqa: BLE001
        conn.rollback()
        logger.warning("[TRUST] failed: %s", e)
        return {"users": total, "error": str(e)}
    finally:
        conn.close()
