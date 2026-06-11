"""Analytics event spine — the one writer for analytics.events (Phase I1).

PRIVACY BY CONSTRUCTION (Covenant + data-minimization, deliverable 15):
- props are WHITELISTED per event_type. Anything not whitelisted is dropped.
- post bodies, message text, names, emails, phones, exact coords are NEVER
  accepted into analytics — only enums, ids, counts, booleans, regions.
- best-effort by contract: a telemetry write can NEVER break the user action.

This is SEPARATE from audit.events (hash-chained legal record). Different
stream, different rules: this is the high-volume behavioural firehose.
"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text

# Per-event prop whitelist. Only these keys survive; values are coerced to
# safe scalars. Add an event_type here to start capturing it — nothing flows
# until it's whitelisted (deny-by-default).
_ALLOWED_PROPS: dict[str, set[str]] = {
    # home / community
    "post_created":     {"has_photo", "is_question", "group_id", "audience", "reach"},
    "reaction_added":   {"reaction"},
    "comment_added":    set(),
    "follow_added":     set(),
    "listing_created":  {"category", "price_basis"},
    "group_joined":     {"group_id", "category"},
    "search_performed": {"scope"},   # the QUERY TEXT is never stored — only that a search happened
    # tis
    "tis_query":        {"intent", "had_answer", "lang"},  # intent enum, not the question text
    # classroom
    "course_enrolled":  {"course_id", "pricing"},
    "lesson_completed": {"course_id"},
    "quiz_attempted":   {"course_id", "passed"},
    "certificate_issued": {"course_id"},
    # farm
    "cycle_created":    {"production_id", "layer"},
    "harvest_logged":   {"production_id"},
    "field_event":      {"event_type"},
    # market
    "price_reported":   {"commodity", "price_tier"},
    # auth / lifecycle
    "signup":           {"account_type"},
    "login":            set(),
}


def _safe(v: Any) -> Any:
    """Coerce to a safe scalar — drop anything that could carry free text/PII risk."""
    if isinstance(v, bool) or isinstance(v, (int, float)) or v is None:
        return v
    s = str(v)
    return s[:64] if len(s) <= 200 else None  # short identifiers/enums only


def clean_props(event_type: str, props: dict | None) -> dict:
    allow = _ALLOWED_PROPS.get(event_type)
    if not allow or not props:
        return {}
    return {k: _safe(props[k]) for k in props if k in allow and _safe(props.get(k)) is not None}


async def track(db, *, pillar: str, event_type: str, user: dict | None = None,
                entity_type: str | None = None, entity_id: str | None = None,
                props: dict | None = None, region: str | None = None,
                session_id: str | None = None) -> None:
    """Record one behavioural event. Best-effort — never raises into the caller.

    Unknown event_types are still recorded (with empty props) so volume is
    visible, but their payload is dropped until whitelisted."""
    try:
        await db.execute(text("""
            INSERT INTO analytics.events
                (actor_user_id, tenant_id, region, pillar, event_type, entity_type, entity_id, props, session_id)
            VALUES
                (:uid, :tid, :region, :pillar, :etype, :entype, :enid, cast(:props AS jsonb), :sid)
        """), {
            "uid": str(user["user_id"]) if user else None,
            "tid": str(user["tenant_id"]) if user and user.get("tenant_id") else None,
            "region": (region or "")[:80] or None,
            "pillar": (pillar or "unknown")[:20],
            "etype": (event_type or "unknown")[:60],
            "entype": (entity_type or None),
            "enid": (str(entity_id)[:80] if entity_id else None),
            "props": json.dumps(clean_props(event_type, props)),
            "sid": (session_id or None),
        })
    except Exception:  # noqa: BLE001 — telemetry must never break a user action
        try:
            await db.rollback()
        except Exception:  # noqa: BLE001
            pass
