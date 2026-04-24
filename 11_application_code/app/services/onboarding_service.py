"""Phase 4.2 Option 3 Day 2 — Onboarding wizard service.

Provides helpers used by /api/v1/onboarding/* endpoints:
  - derive_initial_mode      : SOLO / GROWTH from wizard inputs
  - route_livestock_row      : livestock_register vs hive_register routing
  - next_zone_id / next_pu_id / next_livestock_id / next_hive_id :
                               farm-scoped text ID generators
  - default_farmer_label     : substitutes section_term in label defaults

Binding spec:
  /opt/teivaka/04_execution/phase_4_2_option_3_plus_nav_v2_1/day_2_tis_advisories_spec.md
  /opt/teivaka/04_execution/phase_4_2_option_3_plus_nav_v2_1/onboarding_wizard_spec.md
"""
from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


Mode = Literal["SOLO", "GROWTH", "COMMERCIAL"]


# ----------------------------------------------------------------------
# Mode derivation
# ----------------------------------------------------------------------

def derive_initial_mode(
    area_acres: float | None,
    crop_count: int,
    animal_count: int,
) -> Mode:
    """Returns 'SOLO' or 'GROWTH'. COMMERCIAL is admin-assigned only.

    Thresholds per onboarding_wizard_spec.md §Mode Derivation:
      area_acres >= 1.0  → GROWTH
      crop_count > 2     → GROWTH
      animal_count > 10  → GROWTH
      otherwise          → SOLO
    """
    if area_acres is not None and area_acres >= 1.0:
        return "GROWTH"
    if crop_count > 2:
        return "GROWTH"
    if animal_count > 10:
        return "GROWTH"
    return "SOLO"


# ----------------------------------------------------------------------
# Livestock vs hive routing
# ----------------------------------------------------------------------
# Decision Tree S-24 default routes by production_id prefix. The live
# shared.productions catalog ships apiculture under production_id
# `LIV-API` (category='Apiculture'), so a naive prefix rule
# (`LIV-*` → livestock_register) mis-routes bees. We look up the
# category from shared.productions and route by category:
#   Apiculture  → tenant.hive_register
#   Livestock   → tenant.livestock_register
#   Aquaculture → reject (Phase 10)
# If the production_id is unknown, we raise 400 and the caller surfaces
# a normalized error shape.

async def route_livestock_row(
    db: AsyncSession, production_id: str
) -> str:
    """Returns 'tenant.livestock_register' or 'tenant.hive_register'.

    Raises HTTPException(400) for Aquaculture (not yet supported) or
    unknown production_id.
    """
    row = (
        await db.execute(
            text(
                """
                SELECT production_id, category
                FROM shared.productions
                WHERE production_id = :pid
                """
            ),
            {"pid": production_id},
        )
    ).first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "UNKNOWN_PRODUCTION_ID",
                "message": f"production_id not in shared.productions: {production_id}",
            },
        )

    category = (row.category or "").strip().lower()
    if "apicult" in category or "bee" in category:
        return "tenant.hive_register"
    if "livestock" in category:
        return "tenant.livestock_register"
    if "aquacult" in category:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "AQUACULTURE_NOT_SUPPORTED",
                "message": "Aquaculture onboarding is Phase 10 — not available yet",
            },
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "code": "UNROUTEABLE_PRODUCTION",
            "message": (
                f"production_id {production_id} has category '{row.category}' "
                "which is not livestock, apiculture, or aquaculture"
            ),
        },
    )


# ----------------------------------------------------------------------
# Text ID generators (farm-scoped)
# ----------------------------------------------------------------------
# Follow live patterns observed in DB:
#   zone_id       : "{farm_id}-Z{02d}"
#   pu_id         : "{farm_id}-PU{03d}"
#   livestock_id  : "{farm_id}-LV{03d}"
#   hive_id       : "{farm_id}-HV{03d}"
# The counter is derived from MAX() of existing IDs in that farm.

async def _next_sequence(
    db: AsyncSession,
    table: str,
    id_column: str,
    farm_id: str,
    prefix_suffix: str,
    width: int,
) -> str:
    """Return the next text ID for a farm-scoped sequence.

    prefix_suffix is the bit between '{farm_id}-' and the zero-padded
    number (e.g. 'Z', 'PU', 'LV', 'HV').
    """
    prefix = f"{farm_id}-{prefix_suffix}"
    rows = (
        await db.execute(
            text(
                f"""
                SELECT {id_column} AS rid
                FROM {table}
                WHERE {id_column} LIKE :p
                """
            ),
            {"p": f"{prefix}%"},
        )
    ).fetchall()

    max_n = 0
    for r in rows:
        tail = r.rid[len(prefix):]
        try:
            n = int(tail)
        except ValueError:
            continue
        if n > max_n:
            max_n = n

    return f"{prefix}{max_n + 1:0{width}d}"


async def next_zone_id(db: AsyncSession, farm_id: str) -> str:
    return await _next_sequence(db, "tenant.zones", "zone_id", farm_id, "Z", 2)


async def next_pu_id(db: AsyncSession, farm_id: str) -> str:
    return await _next_sequence(
        db, "tenant.production_units", "pu_id", farm_id, "PU", 3
    )


async def next_livestock_id(db: AsyncSession, farm_id: str) -> str:
    return await _next_sequence(
        db, "tenant.livestock_register", "livestock_id", farm_id, "LV", 3
    )


async def next_hive_id(db: AsyncSession, farm_id: str) -> str:
    return await _next_sequence(
        db, "tenant.hive_register", "hive_id", farm_id, "HV", 3
    )


async def next_farm_id(db: AsyncSession, tenant_id: UUID) -> str:
    """Farm ID scoped to tenant — 'F{03d}' counting farms for this tenant.

    Pilot tenants (F001/F002) already exist with those ids. For new
    tenants we start at F001 inside their own tenant namespace — the
    text PK is globally unique, so we must include a tenant hash or
    suffix. Simplest: use the first 8 chars of tenant_id uppercased
    if an ID collision would occur. In practice a fresh tenant will
    have no farms, so F001/F002/… with a per-tenant suffix works.
    """
    # Count existing farms for this tenant to determine next index.
    count = (
        await db.execute(
            text(
                "SELECT COUNT(*) AS c FROM tenant.farms WHERE tenant_id = :tid"
            ),
            {"tid": str(tenant_id)},
        )
    ).scalar()
    next_idx = (count or 0) + 1

    # Scope with 4-char suffix from the tenant_id to avoid global PK
    # collision with pilot F001/F002 and cross-tenant fresh farms.
    suffix = str(tenant_id).replace("-", "")[:4].upper()
    candidate = f"F{next_idx:03d}-{suffix}"

    # Very unlikely collision guard: bump suffix length until unique.
    for extra in range(1, 10):
        exists = (
            await db.execute(
                text("SELECT 1 FROM tenant.farms WHERE farm_id = :fid"),
                {"fid": candidate},
            )
        ).first()
        if exists is None:
            return candidate
        candidate = f"F{next_idx:03d}-{str(tenant_id).replace('-', '')[:4 + extra].upper()}"

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="unable to generate unique farm_id",
    )


# ----------------------------------------------------------------------
# Default farmer_label
# ----------------------------------------------------------------------

_SECTION_TERM_LOWER = {
    "BLOCK": "block",
    "PLOT": "plot",
    "BED": "bed",
    "FIELD": "field",
    "PATCH": "patch",
}


def default_farmer_label(
    crop_or_animal_name: str | None,
    section_term: str | None,
    kind: Literal["crop", "animal"] = "crop",
) -> str:
    """Build "My cassava block" or "My goats" style default labels.

    section_term only applies to crops/production_units. Animals default
    to "My {animal_name}".
    """
    name = (crop_or_animal_name or "thing").strip().lower()
    if kind == "crop":
        term = _SECTION_TERM_LOWER.get((section_term or "BLOCK").upper(), "block")
        return f"My {name} {term}"
    return f"My {name}"
