"""farm_active_groups_defaults.py — single source of truth for new-farm group defaults.

Per Catalog Redesign Doctrine Amendment v2 (commit 272f513) — Q3 REVISED at
Phase 5.10 (2026-04-30, hour 31): all 11 groups default active=true for new
farms. Onboarding is light by design; the trim decision belongs INSIDE the
farm pillar when the user becomes serious about farm management
(Phase 5.10c, in-modal toggle panel).

Original Q3 lock (3 active universal + 8 inactive production) was reversed
because signup is not the moment of serious farm-pillar commitment — forcing
a domain decision there is the wrong moment.

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
    tenant_id: str,
) -> None:
    """Insert 11 default farm_active_groups rows for a newly-created farm.

    Defaults (Phase 5.10 Q3-revised): all 11 groups active=true. User trims
    via the in-pillar toggle panel (Phase 5.10c) when serious about farm
    management. No-ops on rows that already exist (ON CONFLICT DO NOTHING).

    tenant_id is required (Strike #121, Migration 076): the column is
    NOT NULL and RLS is forced. Caller must pass the authenticated tenant.
    """
    await db.execute(
        text("""
            INSERT INTO tenant.farm_active_groups
                (farm_id, tenant_id, catalog_group, is_active, activated_at, activated_by)
            VALUES
                (:fid, :tid, 'CROPS',       true, now(), :uid),
                (:fid, :tid, 'PERENNIALS',  true, now(), :uid),
                (:fid, :tid, 'LIVESTOCK',   true, now(), :uid),
                (:fid, :tid, 'POULTRY',     true, now(), :uid),
                (:fid, :tid, 'APICULTURE',  true, now(), :uid),
                (:fid, :tid, 'AQUACULTURE', true, now(), :uid),
                (:fid, :tid, 'FORESTRY',    true, now(), :uid),
                (:fid, :tid, 'SPECIALTY',   true, now(), :uid),
                (:fid, :tid, 'MONEY',       true, now(), :uid),
                (:fid, :tid, 'NOTES',       true, now(), :uid),
                (:fid, :tid, 'OTHER',       true, now(), :uid)
            ON CONFLICT (farm_id, catalog_group) DO NOTHING
        """),
        {"fid": farm_id, "tid": tenant_id, "uid": activated_by},
    )
