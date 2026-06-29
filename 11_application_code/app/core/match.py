"""match.py — is there an active commercial MATCH between two users? (Match/Notify Slice 2)

Used to unlock mutual contact once two parties are matched: a hired job applicant +
the employer, a claimed service job's provider + requester. Drives the chat unlock
(chat._connected) so matched parties can message in-app without first following each
other. Cross-tenant community.* reads (no RLS) — run under any session.

Best-effort by construction: ANY error (e.g. a column-name drift) returns False, so a
fault here can NEVER 500 the chat-connection gate — it just falls back to today's rules.
"""
from sqlalchemy import text


async def active_match(db, a, b) -> bool:
    """True iff users a and b have an active, accepted match AND neither has blocked the
    other. Covers hired jobs + claimed/completed service jobs."""
    try:
        return bool((await db.execute(text("""
            SELECT (
              EXISTS (
                SELECT 1 FROM community.job_applications ja
                JOIN community.job_listings jl ON jl.listing_id = ja.listing_id
                WHERE ja.status = 'ACCEPTED' AND (
                  (jl.poster_user_id = cast(:a AS uuid) AND ja.applicant_user_id = cast(:b AS uuid)) OR
                  (jl.poster_user_id = cast(:b AS uuid) AND ja.applicant_user_id = cast(:a AS uuid)))
              )
              OR EXISTS (
                SELECT 1 FROM community.service_jobs sj
                WHERE sj.status IN ('CLAIMED', 'COMPLETED') AND (
                  (sj.requester_user_id = cast(:a AS uuid) AND sj.claimed_by_user_id = cast(:b AS uuid)) OR
                  (sj.requester_user_id = cast(:b AS uuid) AND sj.claimed_by_user_id = cast(:a AS uuid)))
              )
            ) AND NOT EXISTS (
              SELECT 1 FROM community.chat_blocks bk
              WHERE (bk.blocker_user_id = cast(:a AS uuid) AND bk.blocked_user_id = cast(:b AS uuid))
                 OR (bk.blocker_user_id = cast(:b AS uuid) AND bk.blocked_user_id = cast(:a AS uuid))
            )
        """), {"a": str(a), "b": str(b)})).scalar())
    except Exception:  # noqa: BLE001 — never break the caller's connection check
        return False
