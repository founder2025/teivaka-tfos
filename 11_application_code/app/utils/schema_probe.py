"""Schema-tolerant column resolution for shared.productions.

Forensic finding 2026-06-11: the canonical shared.productions column is
`category` (02_database/schema/01_shared_schema.sql — the baseline applied at
genesis), but seven routers selected `p.production_category`, an
UndefinedColumn 500 on any DB built from the canonical schema. Probe once
per process and serve whichever column exists, always aliased AS
production_category so API responses keep a stable field name either way.
"""
from sqlalchemy import text

_CACHE = {}


async def productions_category(db, alias: str = "p"):
    """Return (select_expr, group_by_expr) for the productions category column."""
    col = _CACHE.get("col")
    if col is None:
        has = bool((await db.execute(text(
            "SELECT 1 FROM information_schema.columns WHERE table_schema='shared' "
            "AND table_name='productions' AND column_name='production_category'"))).scalar())
        col = "production_category" if has else "category"
        _CACHE["col"] = col
    return f"{alias}.{col} AS production_category", f"{alias}.{col}"
