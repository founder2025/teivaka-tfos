"""content_safety.py — automated first-pass moderation (Trust & Safety Slice 2).

Deterministic, high-precision scam/spam detection. NOT AI and NOT agronomy —
Inviolable #1 (never hallucinate agronomy) is untouched; this only classifies
user content against a narrow rule set and routes hits to the human moderation
queue (community.feed_flags, category='AUTO').

Design rules:
  - HIGH PRECISION over recall. False positives censor real Pacific farmers, which
    is worse than missing one scam — keep the patterns tight and obvious.
  - FLAG, never auto-hide. A human moderator decides. (Auto-hide can come later,
    once the rules' precision is proven in production.)
  - Best-effort. A classifier or DB error must never block the user's post/listing.
"""
import re
import logging

from sqlalchemy import text
from app.db.session import get_db_ctx

logger = logging.getLogger(__name__)

# Narrow, obvious scam signatures. Tuned to avoid legit marketplace/agri language
# (prices, WhatsApp numbers, "deposit" of seed, etc. are NOT matched on their own).
_RULES = [
    ("PAYMENT_LURE", re.compile(
        r"\b(western\s?union|money\s?gram|gift\s?cards?|bitcoin|crypto(currency)?|"
        r"wire\s+transfer|cash\s?app)\b", re.I)),
    ("ADVANCE_FEE", re.compile(
        r"\b(advance|processing|registration|clearance|activation)\s+fee\b"
        r"|\bdeposit\b.{0,25}\bto\s+(claim|release|confirm|receive|unlock)\b"
        r"|\bpay\b.{0,25}\b(first|upfront|before\s+(delivery|shipping|receiving))\b", re.I)),
    ("PRIZE_SCAM", re.compile(
        r"\b(you('ve| have)\s+won|claim\s+your\s+prize|lottery\s+winner|"
        r"congratulations\b.{0,30}\bselected)\b", re.I)),
    ("INVESTMENT_SCAM", re.compile(
        r"\b(double\s+your\s+money|guaranteed\s+(profit|returns?)|"
        r"investment\s+opportunity|forex|binary\s+option)\b", re.I)),
]


def scan(content) -> list:
    """Return the list of matched rule keys (empty = clean). Pure, no side effects."""
    s = content or ""
    return [key for key, rx in _RULES if rx.search(s)]


async def auto_flag(target_type: str, target_id, reported_user_id, content) -> list:
    """Scan content; if it hits, file an AUTO flag into the moderation queue for
    human review. Best-effort — swallows every error so it can never block the
    caller's write. Returns the matched rule keys (for logging/telemetry)."""
    try:
        hits = scan(content)
        if not hits:
            return []
        async with get_db_ctx() as db:
            await db.execute(text("""
                INSERT INTO community.feed_flags
                    (reporter_user_id, reason, target_type, target_id, reported_user_id, category,
                     post_id, reply_id)
                VALUES (NULL, :reason, :tt, :tid, cast(:ruid AS uuid), 'AUTO',
                        CASE WHEN :tt = 'POST'  THEN :tid END,
                        CASE WHEN :tt = 'REPLY' THEN :tid END)
            """), {
                "reason": "auto: " + ", ".join(hits),
                "tt": target_type, "tid": str(target_id),
                "ruid": str(reported_user_id) if reported_user_id else None,
            })
            await db.commit()
        logger.info("[AUTO-FLAG] %s %s → %s", target_type, target_id, hits)
        return hits
    except Exception as e:  # noqa: BLE001 — moderation must never break a write
        logger.warning("[AUTO-FLAG] failed (%s %s): %s", target_type, target_id, e)
        return []
