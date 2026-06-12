"""121 — Strike #80: replace hardcoded farm_libraries.library_type CHECK with FK to
a data-driven shared.library_type_catalog, and register LIBRARY_ROW_UPDATED so edits
(rename + attribute changes) can emit an audit event.

Before: farm_libraries.library_type was constrained by an inline CHECK listing the 5
POULTRY types — adding a new library type for a future group needed a DDL migration
*and* a code edit (the mirrored VALID_LIBRARY_TYPES set). Strike #80.

After: library types live in shared.library_type_catalog (group_code + labels +
placeholder + sort_order). farm_libraries.library_type FK-references it. Adding a type
for a new group = one catalog row (no DDL, no code change). The API + UI read the
catalog. shared.* writes stay migration-only (Inviolable #7).

Revision ID: 121_library_type_catalog
Revises: 120_reference_crops
"""
from alembic import op
import sqlalchemy as sa

revision = "121_library_type_catalog"
down_revision = "120_reference_crops"
branch_labels = None
depends_on = None

# (library_type, group_code, label, singular_label, placeholder, sort_order)
CATALOG_SEED = [
    ("POULTRY_BREED",        "POULTRY", "Breeds",       "breed",        "e.g. ISA Brown",        10),
    ("POULTRY_FEED",         "POULTRY", "Feeds",        "feed",         "e.g. Layer mash 16%",   20),
    ("POULTRY_VACCINE",      "POULTRY", "Vaccines",     "vaccine",      "e.g. Newcastle",        30),
    ("POULTRY_SUPPLIER",     "POULTRY", "Suppliers",    "supplier",     "e.g. Pacific Feed Co",  40),
    ("POULTRY_BUYER",        "POULTRY", "Buyers",       "buyer",        "e.g. Suva Market",      50),
    ("POULTRY_DISINFECTANT", "POULTRY", "Disinfectants", "disinfectant", "e.g. Virkon S",        60),
]


def _rebuild_audit_check(conn):
    """Drop + rebuild audit.events CHECK from the full event_type_catalog (043 pattern)."""
    conn.execute(sa.text("ALTER TABLE audit.events DROP CONSTRAINT IF EXISTS events_event_type_check;"))
    rows = conn.execute(sa.text("SELECT DISTINCT event_type FROM shared.event_type_catalog ORDER BY event_type;"))
    check_values = ", ".join(f"'{r[0]}'" for r in rows)
    conn.execute(sa.text(f"ALTER TABLE audit.events ADD CONSTRAINT events_event_type_check CHECK (event_type IN ({check_values}));"))


def upgrade():
    conn = op.get_bind()

    # 1. Catalog table (data-driven replacement for the hardcoded CHECK).
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS shared.library_type_catalog (
            library_type    TEXT PRIMARY KEY,
            group_code      TEXT NOT NULL,
            label           TEXT NOT NULL,
            singular_label  TEXT NOT NULL,
            placeholder     TEXT,
            sort_order      INTEGER NOT NULL DEFAULT 100,
            is_active       BOOLEAN NOT NULL DEFAULT TRUE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """))

    for library_type, group_code, label, singular, placeholder, sort_order in CATALOG_SEED:
        conn.execute(sa.text("""
            INSERT INTO shared.library_type_catalog
                (library_type, group_code, label, singular_label, placeholder, sort_order)
            VALUES (:lt, :gc, :lb, :sg, :ph, :so)
            ON CONFLICT (library_type) DO NOTHING
        """), {"lt": library_type, "gc": group_code, "lb": label, "sg": singular, "ph": placeholder, "so": sort_order})

    conn.execute(sa.text("GRANT SELECT ON shared.library_type_catalog TO teivaka_app;"))

    # 1b. Backfill the catalog with ANY library_type already present in farm_libraries
    #     that the explicit seed missed (e.g. POULTRY_DISINFECTANT, seeded in Phase
    #     6.3-11/12). Without this the FK below violates on those existing rows. Labels
    #     are derived; the Operator can refine them later via a catalog migration.
    conn.execute(sa.text("""
        INSERT INTO shared.library_type_catalog
            (library_type, group_code, label, singular_label, placeholder, sort_order)
        SELECT DISTINCT
            fl.library_type,
            split_part(fl.library_type, '_', 1),
            initcap(replace(fl.library_type, '_', ' ')),
            lower(replace(fl.library_type, '_', ' ')),
            '',
            999
        FROM shared.farm_libraries fl
        WHERE fl.library_type NOT IN (SELECT library_type FROM shared.library_type_catalog)
        ON CONFLICT (library_type) DO NOTHING
    """))

    # 2. Swap the inline CHECK for an FK to the catalog.
    conn.execute(sa.text("ALTER TABLE shared.farm_libraries DROP CONSTRAINT IF EXISTS farm_libraries_library_type_check;"))
    conn.execute(sa.text("""
        ALTER TABLE shared.farm_libraries
        ADD CONSTRAINT farm_libraries_library_type_fkey
        FOREIGN KEY (library_type) REFERENCES shared.library_type_catalog(library_type);
    """))

    # 3. Register LIBRARY_ROW_UPDATED so rename / attribute edits can emit an audit event.
    conn.execute(sa.text("""
        INSERT INTO shared.event_type_catalog
            (event_type, catalog_group, sort_order, backdating_window_days, requires_reason_after_days, is_active)
        VALUES ('LIBRARY_ROW_UPDATED', 'OTHER', 103, 7, 0, TRUE)
        ON CONFLICT (event_type) DO NOTHING
    """))
    conn.execute(sa.text("""
        INSERT INTO shared.naming_dictionary (concept_key, locale, form, value, is_active)
        VALUES ('event.LIBRARY_ROW_UPDATED.label', 'en', 'label', 'Library item edited', TRUE)
        ON CONFLICT (concept_key, locale, form) DO NOTHING
    """))
    conn.execute(sa.text("""
        INSERT INTO shared.naming_dictionary (concept_key, locale, form, value, is_active)
        VALUES ('event.LIBRARY_ROW_UPDATED.voice_prompt', 'en', 'voice_prompt', 'Library item edited.', TRUE)
        ON CONFLICT (concept_key, locale, form) DO NOTHING
    """))
    _rebuild_audit_check(conn)


def downgrade():
    conn = op.get_bind()

    # Restore the inline CHECK, drop the FK + catalog.
    conn.execute(sa.text("ALTER TABLE shared.farm_libraries DROP CONSTRAINT IF EXISTS farm_libraries_library_type_fkey;"))
    check_values = ", ".join(f"'{r[0]}'" for r in CATALOG_SEED)
    conn.execute(sa.text(f"""
        ALTER TABLE shared.farm_libraries
        ADD CONSTRAINT farm_libraries_library_type_check
        CHECK (library_type IN ({check_values}));
    """))
    conn.execute(sa.text("DROP TABLE IF EXISTS shared.library_type_catalog;"))

    conn.execute(sa.text("DELETE FROM shared.naming_dictionary WHERE concept_key LIKE 'event.LIBRARY_ROW_UPDATED.%';"))
    conn.execute(sa.text("DELETE FROM shared.event_type_catalog WHERE event_type = 'LIBRARY_ROW_UPDATED';"))
    _rebuild_audit_check(conn)
