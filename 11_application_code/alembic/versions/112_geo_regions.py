"""112 - Geographic registry (Intelligence Engine Phase I4)

The geographic spine. A single recursive table — shared.geo_regions — turns
every roll-up (National -> Division -> Province -> ... -> Field) into one
recursive CTE, with no per-report geo logic. tenant.farms.region_id (nullable
FK) attaches each farm to a node in the tree.

HONESTY BOUNDARY (deliberate):
  Loaded here  : COUNTRY (Fiji) + the 4 DIVISIONS + the 14 PROVINCES (yasana).
                 These are authoritative, public-domain administrative facts —
                 reference data, not fabricated records.
  NOT loaded   : DISTRICT / TIKINA / VILLAGE. Sub-province granularity needs the
                 Fiji Bureau of Statistics / iTaukei Lands dataset (external).
                 Those levels stay empty until that dataset is loaded — the dome
                 reports them as 'pending external data', never invented.

shared.* is read-only at runtime (Inviolable #7): only Alembic writes this table;
app code only ever SELECTs it.
"""
from alembic import op

revision = "112_geo_regions"
down_revision = "111_consent_ledger"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


# Fiji administrative hierarchy — public-domain reference facts.
# (region_id, level, name, parent_region_id, code)
DIVISIONS = [
    ("FJI-C", "Central", "FJI"),
    ("FJI-W", "Western", "FJI"),
    ("FJI-N", "Northern", "FJI"),
    ("FJI-E", "Eastern", "FJI"),
]
# province -> division
PROVINCES = [
    ("FJI-NAI", "Naitasiri", "FJI-C"),
    ("FJI-NAM", "Namosi", "FJI-C"),
    ("FJI-REW", "Rewa", "FJI-C"),
    ("FJI-SER", "Serua", "FJI-C"),
    ("FJI-TAI", "Tailevu", "FJI-C"),
    ("FJI-BA", "Ba", "FJI-W"),
    ("FJI-NAD", "Nadroga-Navosa", "FJI-W"),
    ("FJI-RA", "Ra", "FJI-W"),
    ("FJI-BUA", "Bua", "FJI-N"),
    ("FJI-CAK", "Cakaudrove", "FJI-N"),
    ("FJI-MAC", "Macuata", "FJI-N"),
    ("FJI-KAD", "Kadavu", "FJI-E"),
    ("FJI-LAU", "Lau", "FJI-E"),
    ("FJI-LOM", "Lomaiviti", "FJI-E"),
]


def _seed_values():
    """Build a VALUES list for the seed INSERT. Centroids are left NULL — we do
    not fabricate coordinates; province/division centroids arrive with the
    Bureau of Statistics dataset."""
    rows = ["('FJI', 'COUNTRY', 'Fiji', NULL, 'FJI')"]
    for rid, name, parent in DIVISIONS:
        code = rid.split("-")[-1]
        rows.append(f"('{rid}', 'DIVISION', '{name}', '{parent}', '{code}')")
    for rid, name, parent in PROVINCES:
        code = rid.split("-")[-1]
        nm = name.replace("'", "''")
        rows.append(f"('{rid}', 'PROVINCE', '{nm}', '{parent}', '{code}')")
    return ",\n        ".join(rows)


STATEMENTS = [
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
    "CREATE INDEX IF NOT EXISTS idx_geo_regions_parent ON shared.geo_regions(parent_region_id)",
    "CREATE INDEX IF NOT EXISTS idx_geo_regions_level ON shared.geo_regions(level)",
    # Seed COUNTRY + DIVISION + PROVINCE (idempotent).
    f"""
    INSERT INTO shared.geo_regions (region_id, level, name, parent_region_id, code) VALUES
        {_seed_values()}
    ON CONFLICT (region_id) DO NOTHING
    """,
    "GRANT SELECT ON shared.geo_regions TO teivaka_app",
    # Attach farms to the tree (nullable — honest-empty until classified).
    "ALTER TABLE tenant.farms ADD COLUMN IF NOT EXISTS region_id TEXT REFERENCES shared.geo_regions(region_id)",
    "CREATE INDEX IF NOT EXISTS idx_farms_region ON tenant.farms(region_id)",
    # Best-effort backfill: match existing free-text location_island to a province
    # (then, for any still unmatched, a division). Exact-contains only — we never
    # guess; unmatched farms stay NULL and show up as 'unclassified' in the dome.
    """
    UPDATE tenant.farms f SET region_id = g.region_id
    FROM shared.geo_regions g
    WHERE f.region_id IS NULL AND g.level = 'PROVINCE'
      AND f.location_island IS NOT NULL
      AND f.location_island ILIKE '%' || g.name || '%'
    """,
    """
    UPDATE tenant.farms f SET region_id = g.region_id
    FROM shared.geo_regions g
    WHERE f.region_id IS NULL AND g.level = 'DIVISION'
      AND f.location_island IS NOT NULL
      AND f.location_island ILIKE '%' || g.name || '%'
    """,
]


def upgrade():
    _exec_each(STATEMENTS)


def downgrade():
    _exec_each([
        "ALTER TABLE tenant.farms DROP COLUMN IF EXISTS region_id",
        "DROP TABLE IF EXISTS shared.geo_regions",
    ])
