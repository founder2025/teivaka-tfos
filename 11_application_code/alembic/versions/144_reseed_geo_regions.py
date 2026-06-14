"""144 - Re-seed Fiji geo regions (guarantee province dropdown is populated)

The registration "Geographic region" dropdown reads
shared.geo_regions WHERE level='PROVINCE' (public endpoint /geo/regions). In
production that came back empty — migration 112's seed did not land in the DB
the running API uses. This migration idempotently re-asserts the authoritative,
public-domain Fiji administrative facts: Fiji + 4 divisions + 14 provinces
(yasana), so the dropdown is always populated.

shared.* is read-only at runtime (Inviolable #7) — seeded via Alembic only.
asyncpg: one statement per op.execute (Strike #72). ON CONFLICT DO NOTHING =
safe no-op if 112 already seeded.
"""
from alembic import op

revision = "144_reseed_geo_regions"
down_revision = "143_idempotency_keys"
branch_labels = None
depends_on = None

DIVISIONS = [("FJI-C", "Central", "FJI"), ("FJI-W", "Western", "FJI"),
             ("FJI-N", "Northern", "FJI"), ("FJI-E", "Eastern", "FJI")]
PROVINCES = [
    ("FJI-NAI", "Naitasiri", "FJI-C"), ("FJI-NAM", "Namosi", "FJI-C"),
    ("FJI-REW", "Rewa", "FJI-C"), ("FJI-SER", "Serua", "FJI-C"),
    ("FJI-TAI", "Tailevu", "FJI-C"), ("FJI-BA", "Ba", "FJI-W"),
    ("FJI-NAD", "Nadroga-Navosa", "FJI-W"), ("FJI-RA", "Ra", "FJI-W"),
    ("FJI-BUA", "Bua", "FJI-N"), ("FJI-CAK", "Cakaudrove", "FJI-N"),
    ("FJI-MAC", "Macuata", "FJI-N"), ("FJI-KAD", "Kadavu", "FJI-E"),
    ("FJI-LAU", "Lau", "FJI-E"), ("FJI-LOM", "Lomaiviti", "FJI-E"),
]


def _values():
    rows = ["('FJI', 'COUNTRY', 'Fiji', NULL, 'FJI')"]
    for rid, name, parent in DIVISIONS:
        rows.append(f"('{rid}', 'DIVISION', '{name}', '{parent}', '{rid.split('-')[-1]}')")
    for rid, name, parent in PROVINCES:
        rows.append(f"('{rid}', 'PROVINCE', '{name.replace(chr(39), chr(39)*2)}', '{parent}', '{rid.split('-')[-1]}')")
    return ",\n        ".join(rows)


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        """
        CREATE TABLE IF NOT EXISTS shared.geo_regions (
            region_id        TEXT PRIMARY KEY,
            level            TEXT NOT NULL CHECK (level IN
                                ('COUNTRY','DIVISION','PROVINCE','DISTRICT','TIKINA','VILLAGE')),
            name             TEXT NOT NULL,
            parent_region_id TEXT REFERENCES shared.geo_regions(region_id),
            centroid_lat     DOUBLE PRECISION,
            centroid_lng     DOUBLE PRECISION,
            code             TEXT
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_geo_regions_level ON shared.geo_regions(level)",
        f"INSERT INTO shared.geo_regions (region_id, level, name, parent_region_id, code) VALUES\n        {_values()}\n        ON CONFLICT (region_id) DO NOTHING",
        "GRANT SELECT ON shared.geo_regions TO teivaka_app",
    ])


def downgrade():
    # Reference data — not removed on downgrade (112 owns the table lifecycle).
    pass
