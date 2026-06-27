"""Shared farm-profile projection — what's grown, farming types, 3-layer mix, land.

Used by BOTH the owner's passport (passport.py) and the scoped share view
(shares.py) so the two can never drift. The caller must already have RLS
context set (app.tenant_id) — these are plain tenant.* reads.
"""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_LAYER_LABEL = {
    "CASH_FLOW": "Cash Flow",
    "FOOD_SECURITY": "Food Security",
    "LONG_TERM_ASSET": "Long-Term Asset",
}


async def gather_farm_profile(db: AsyncSession) -> dict:
    crops = (await db.execute(text("""
        SELECT p.production_name AS name, COUNT(*) AS cycles
        FROM tenant.production_cycles pc
        JOIN shared.productions p ON p.production_id = pc.production_id
        GROUP BY p.production_name ORDER BY cycles DESC, name LIMIT 24
    """))).mappings().all()
    layers = (await db.execute(text("""
        SELECT layer, COUNT(*) AS n FROM tenant.production_cycles
        WHERE layer IS NOT NULL GROUP BY layer
    """))).mappings().all()
    land = (await db.execute(text("""
        SELECT COUNT(*) AS blocks, COALESCE(SUM(area_sqm),0) AS area_sqm
        FROM tenant.production_units WHERE is_active=TRUE
    """))).mappings().first() or {}
    verticals = (await db.execute(text("""
        SELECT DISTINCT enterprise_type AS t FROM tenant.production_units
        WHERE is_active=TRUE AND enterprise_type IS NOT NULL
    """))).mappings().all()
    return {
        "crops": [{"name": c["name"], "cycles": int(c["cycles"])} for c in crops],
        "verticals": [str(v["t"]).replace("_", " ").title() for v in verticals],
        "layers": [{"label": _LAYER_LABEL.get(l["layer"], str(l["layer"]).replace("_", " ").title()),
                    "n": int(l["n"])} for l in layers],
        "blocks": int(land.get("blocks") or 0),
        "land_ha": round(float(land.get("area_sqm") or 0) / 10000.0, 2),
    }
