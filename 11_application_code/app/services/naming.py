"""naming.py — Translation service for shared.naming_dictionary.

Wraps the naming dictionary read access with a clean async API.
Per MBI Section 4 Universal Naming Doctrine, every farmer-facing string
flows through name(concept_key, form?, locale?).

Usage:
    from app.services.naming import name, name_many

    label = await name(db, 'event.HARVEST_LOGGED.label')
    # -> "Harvest"

    bulk = await name_many(db, ['group.CROPS.label', 'group.MONEY.label'])
    # -> {'group.CROPS.label': 'Crops', 'group.MONEY.label': 'Money'}

Falls back to the concept_key itself if no translation exists. This is a
deliberate visible-to-Operator signal that translation is missing — better
than silently rendering blank.

locale defaults to 'en'. Phase 12 multi-language work will swap this to
session-derived locale.
"""
from typing import Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def name(
    db: AsyncSession,
    concept_key: str,
    form: str = "label",
    locale: str = "en",
) -> str:
    """Return the translated value for a concept_key.

    Falls back to concept_key itself if no translation row exists.
    """
    row = (await db.execute(
        text("""
            SELECT value
            FROM shared.naming_dictionary
            WHERE concept_key = :ck
              AND form        = :form
              AND locale      = :locale
              AND is_active   = true
            LIMIT 1
        """),
        {"ck": concept_key, "form": form, "locale": locale},
    )).first()
    return row[0] if row else concept_key


async def name_many(
    db: AsyncSession,
    concept_keys: list[str],
    form: str = "label",
    locale: str = "en",
) -> dict[str, str]:
    """Bulk translation. Returns {concept_key: value}.

    Missing keys fall back to the concept_key string itself.
    Uses a single SELECT for efficiency on hot paths (e.g., catalog rendering).
    """
    if not concept_keys:
        return {}

    rows = (await db.execute(
        text("""
            SELECT concept_key, value
            FROM shared.naming_dictionary
            WHERE concept_key = ANY(:cks)
              AND form        = :form
              AND locale      = :locale
              AND is_active   = true
        """),
        {"cks": concept_keys, "form": form, "locale": locale},
    )).all()

    found = {r[0]: r[1] for r in rows}
    # Fill missing keys with self-fallback
    return {ck: found.get(ck, ck) for ck in concept_keys}
