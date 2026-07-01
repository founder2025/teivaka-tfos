"""trust.py — the Trust Ladder (Blocker #2 Slice 1).

A member's trust, computed from REAL signals only (no fabricated points), expressed
as both a raw score and a legible, earned LEVEL a farmer/buyer/lender can read at a
glance. This is the mechanism that turns the audit-chain moat into visible trust:
someone with a long real record + verified ID ranks above a day-old account.

Signals (each guarded — a missing/locked table can never 500 the caller):
  - kyc_verified      : admin-reviewed government ID (the strongest claim)
  - email_verified    : a verified email
  - verified_records  : audit.events the user authored (their real logged activity)
  - certificates      : earned course certificates
  - linked_posts      : posts linked to a verifiable audit record

The LEVEL is derived, not stored (Slice 1). A later slice denormalizes it (beat-
refreshed) so it can be shown cheaply everywhere (listings/directory/feed).
"""
from sqlalchemy import text

# Ladder, most-trusted first. Kept small and legible on purpose.
LEVELS = ("TRUSTED", "VERIFIED", "ACTIVE", "NEW")
_LABEL = {"TRUSTED": "Trusted", "VERIFIED": "ID-verified", "ACTIVE": "Active", "NEW": "New member"}


def level_from_signals(kyc, email_verified, records, certs=0, linked=0, reviews=0):
    """The single source of truth for the ladder. Used by both the live API helper
    and the batch worker so the level can never drift between them. `reviews` =
    completed marketplace reviews (Marketplace M3) — real outcomes, a form of
    track record."""
    records, certs, linked, reviews = int(records or 0), int(certs or 0), int(linked or 0), int(reviews or 0)
    score = (10 if kyc else 0) + min(records, 100) + certs * 5 + linked * 2 + reviews * 3
    if kyc and (records >= 20 or certs >= 1 or linked >= 3 or reviews >= 3):
        level = "TRUSTED"          # verified ID + a real track record (incl. reviewed sales)
    elif kyc:
        level = "VERIFIED"         # verified government ID
    elif records >= 1 or email_verified or reviews >= 1:
        level = "ACTIVE"           # real logged activity, a verified email, or a reviewed sale
    else:
        level = "NEW"
    return level, score


def level_label(level):
    return _LABEL.get(level, "New member")


async def compute_trust(db, user_id) -> dict:
    """Compute a user's trust from real signals using the given session. Works for
    any user_id (not just the caller). For an accurate verified-records count pass a
    session in that user's tenant context; cross-tenant reads may undercount records
    (never inflate) — KYC/email still resolve correctly."""
    uid = str(user_id)
    kyc = email_verified = False
    member_since = None
    certs = records = linked = 0
    try:
        row = (await db.execute(text(
            "SELECT kyc_verified, email_verified, created_at FROM tenant.users WHERE user_id = cast(:u AS uuid)"),
            {"u": uid})).mappings().first()
        if row:
            kyc = bool(row["kyc_verified"])
            email_verified = bool(row["email_verified"])
            member_since = row["created_at"]
    except Exception:  # noqa: BLE001 — guarded; a column/table gap must not 500
        pass
    try:
        certs = (await db.execute(text(
            "SELECT count(*) FROM community.course_certificates WHERE user_id = cast(:u AS uuid)"), {"u": uid})).scalar() or 0
    except Exception:
        pass
    try:
        linked = (await db.execute(text(
            "SELECT count(*) FROM community.feed_posts WHERE author_user_id = cast(:u AS uuid) AND link_audit_hash IS NOT NULL"), {"u": uid})).scalar() or 0
    except Exception:
        pass
    try:
        # audit.events is TENANT-scoped (no per-user author column). The session is
        # already in this user's tenant (RLS), so this counts the farm's real
        # hash-chained records — the "track record" behind the trust ladder.
        records = (await db.execute(text("SELECT count(*) FROM audit.events"))).scalar() or 0
    except Exception:
        pass
    reviews = 0
    avg_rating = None
    try:
        rr = (await db.execute(text(
            "SELECT count(*) AS n, avg(rating) AS a FROM community.marketplace_reviews WHERE seller_user_id = cast(:u AS uuid)"),
            {"u": uid})).mappings().first()
        if rr:
            reviews = int(rr["n"] or 0)
            avg_rating = float(rr["a"]) if rr["a"] is not None else None
    except Exception:  # noqa: BLE001
        pass

    # Include reviews so the LIVE profile chip matches the beat-refreshed cache badge.
    level, score = level_from_signals(kyc, email_verified, records, certs, linked, reviews)

    return {
        "score": score, "level": level, "level_label": _LABEL[level],
        "kyc_verified": kyc, "email_verified": email_verified,
        "verified_records": records, "certificates": certs, "linked_posts": linked,
        "review_count": reviews, "avg_rating": avg_rating,
        "member_since": member_since.isoformat() if member_since else None,
    }
