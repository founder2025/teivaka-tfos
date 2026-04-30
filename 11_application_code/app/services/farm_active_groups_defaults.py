"""farm_active_groups_defaults.py — single source of truth for new-farm group defaults.

Per Catalog Redesign Doctrine Amendment v2 (commit 272f513) Q3 lock:
new farms get MONEY/NOTES/OTHER active=true (universal); 8 production
groups (CROPS, PERENNIALS, LIVESTOCK, POULTRY, APICULTURE, AQUACULTURE,
FORESTRY, SPECIALTY) inactive=true. User opts INTO production domains
via the onboarding wizard (Phase 5.7) or /farm/settings (Phase 5.8).

Idempotent via ON CONFLICT DO NOTHING — safe to call against farms that
were already backfilled by Migration 039 (existing farms have all 11
active=true; this function will not disturb that state).

Called from:
- app/routers/farms.py: create_farm (admin POST /api/v1/farms)
- app/routers/onboarding.py: farm-basics else branch (creation path only)

Caller is responsible for the transaction context. The INSERT runs on
the passed session; commit is the caller's concern.
"""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def insert_default_active_groups(
    db: AsyncSession,
    farm_id: str,
    activated_by: str | None,
) -> None:
    """Insert 11 default farm_active_groups rows for a newly-created farm.

    Defaults: MONEY/NOTES/OTHER active=true, 8 production groups inactive.
    No-ops on rows that already exist (ON CONFLICT DO NOTHING).
    """
    await db.execute(
        text("""
            INSERT INTO tenant.farm_active_groups
                (farm_id, catalog_group, is_active, activated_at, activated_by)
            VALUES
                (:fid, 'CROPS',       false, now(), :uid),
                (:fid, 'PERENNIALS',  false, now(), :uid),
                (:fid, 'LIVESTOCK',   false, now(), :uid),
                (:fid, 'POULTRY',     false, now(), :uid),
                (:fid, 'APICULTURE',  false, now(), :uid),
                (:fid, 'AQUACULTURE', false, now(), :uid),
                (:fid, 'FORESTRY',    false, now(), :uid),
                (:fid, 'SPECIALTY',   false, now(), :uid),
                (:fid, 'MONEY',       true,  now(), :uid),
                (:fid, 'NOTES',       true,  now(), :uid),
                (:fid, 'OTHER',       true,  now(), :uid)
            ON CONFLICT (farm_id, catalog_group) DO NOTHING
        """),
        {"fid": farm_id, "uid": activated_by},
    )
