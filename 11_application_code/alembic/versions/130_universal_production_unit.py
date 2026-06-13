"""130 — Universal production-unit keystone (Slice A)

Makes the production unit enterprise-agnostic so every vertical (crops, poultry,
livestock, aqua, forestry, floriculture, protected/nursery) has one place to
live — the read model the destinations will consume in Slice D.

  1. tenant.production_units gains enterprise_type + unit_of_measure, and the
     pu_type CHECK widens for aqua/forestry/floriculture/protected unit kinds.
  2. Existing rows backfilled from pu_type → enterprise_type + sensible uom.
     Zero rows orphaned; crop blocks become enterprise_type='CROPS' explicitly.
  3. tenant.v_production_units VIEW unions the three real PU-like tables that
     exist — production_units, flocks, nursery_batches — into one normalized
     "every production unit, any enterprise" shape. (tenant.livestock and
     tenant.apiculture_hives referenced by sibling routers DO NOT EXIST — those
     routers write to phantom tables; flagged, not unioned.)

Data-safe + reversible. asyncpg: one statement per op.execute (Strike #72).

Revision ID: 130_universal_production_unit
Revises: 129_catalog_forensic
"""
from alembic import op
import sqlalchemy as sa

revision = "130_universal_production_unit"
down_revision = "129_catalog_forensic"
branch_labels = None
depends_on = None

# pu_type → enterprise_type (catalog_group vocabulary, so it joins 1:1 to
# tenant.farm_active_groups.catalog_group in Slice D).
_PU_TYPE_TO_ENTERPRISE = {
    "BED": "CROPS", "PLOT": "CROPS",
    "GREENHOUSE": "SPECIALTY", "NURSERY_TRAY": "SPECIALTY", "FLOWER_BED": "SPECIALTY",
    "POND": "AQUACULTURE", "TANK": "AQUACULTURE", "CAGE": "AQUACULTURE",
    "PADDOCK": "LIVESTOCK",
    "HIVE_STAND": "APICULTURE",
    "WOODLOT": "FORESTRY", "STAND": "FORESTRY",
}
_ENTERPRISE_TO_UOM = {
    "CROPS": "kg", "PERENNIALS": "kg", "SPECIALTY": "units",
    "AQUACULTURE": "kg", "LIVESTOCK": "head", "APICULTURE": "hives", "FORESTRY": "m3",
}
_NEW_PU_TYPES = ("BED", "PLOT", "GREENHOUSE", "POND", "PADDOCK", "HIVE_STAND",
                 "TANK", "CAGE", "WOODLOT", "STAND", "FLOWER_BED", "NURSERY_TRAY")


def upgrade():
    conn = op.get_bind()

    # 1. New columns (nullable first — backfill — then defaults).
    conn.execute(sa.text(
        "ALTER TABLE tenant.production_units ADD COLUMN IF NOT EXISTS enterprise_type TEXT"))
    conn.execute(sa.text(
        "ALTER TABLE tenant.production_units ADD COLUMN IF NOT EXISTS unit_of_measure TEXT"))

    # 2. Widen pu_type CHECK (drop old, add new). One statement each.
    conn.execute(sa.text(
        "ALTER TABLE tenant.production_units DROP CONSTRAINT IF EXISTS production_units_pu_type_check"))
    vals = ", ".join(f"'{t}'" for t in _NEW_PU_TYPES)
    conn.execute(sa.text(
        f"ALTER TABLE tenant.production_units ADD CONSTRAINT production_units_pu_type_check "
        f"CHECK (pu_type IN ({vals}))"))

    # 3. Backfill enterprise_type + unit_of_measure from pu_type.
    for pu_type, ent in _PU_TYPE_TO_ENTERPRISE.items():
        uom = _ENTERPRISE_TO_UOM.get(ent, "kg")
        conn.execute(sa.text(
            "UPDATE tenant.production_units SET enterprise_type = :ent, "
            "unit_of_measure = COALESCE(unit_of_measure, :uom) "
            "WHERE pu_type = :pt AND enterprise_type IS NULL"),
            {"ent": ent, "uom": uom, "pt": pu_type})
    # Any leftover (unknown pu_type) → CROPS/kg so nothing stays NULL.
    conn.execute(sa.text(
        "UPDATE tenant.production_units SET enterprise_type = 'CROPS' WHERE enterprise_type IS NULL"))
    conn.execute(sa.text(
        "UPDATE tenant.production_units SET unit_of_measure = 'kg' WHERE unit_of_measure IS NULL"))

    # 4. Defaults for new rows.
    conn.execute(sa.text(
        "ALTER TABLE tenant.production_units ALTER COLUMN enterprise_type SET DEFAULT 'CROPS'"))
    conn.execute(sa.text(
        "ALTER TABLE tenant.production_units ALTER COLUMN unit_of_measure SET DEFAULT 'kg'"))

    # 5. The unified read model. Plain view → inherits the caller's RLS context
    #    on every underlying tenant.* table (NOT security definer).
    conn.execute(sa.text("DROP VIEW IF EXISTS tenant.v_production_units"))
    conn.execute(sa.text("""
        CREATE VIEW tenant.v_production_units AS
        SELECT
            pu.pu_id                              AS unit_id,
            'PRODUCTION_UNIT'                     AS unit_kind,
            pu.tenant_id, pu.farm_id,
            pu.enterprise_type,
            pu.pu_name                            AS label,
            CASE WHEN pu.is_active THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
            NULL::integer                         AS headcount,
            pu.area_sqm,
            pu.unit_of_measure,
            pu.pu_id                              AS location_pu_id,
            pu.current_production_id              AS production_id,
            pu.created_at
        FROM tenant.production_units pu
        UNION ALL
        SELECT
            f.flock_id                            AS unit_id,
            'FLOCK'                               AS unit_kind,
            f.tenant_id, f.farm_id,
            'POULTRY'                             AS enterprise_type,
            f.flock_label                         AS label,
            CASE WHEN f.is_active THEN f.lifecycle_status ELSE 'INACTIVE' END AS status,
            f.current_count                       AS headcount,
            NULL::numeric                         AS area_sqm,
            'birds'                               AS unit_of_measure,
            f.current_pu_id                       AS location_pu_id,
            NULL::text                            AS production_id,
            f.created_at
        FROM tenant.flocks f
        UNION ALL
        SELECT
            nb.batch_id                           AS unit_id,
            'NURSERY_BATCH'                       AS unit_kind,
            nb.tenant_id, nb.farm_id,
            'SPECIALTY'                           AS enterprise_type,
            nb.production_id                      AS label,
            nb.batch_status                       AS status,
            nb.total_seeds_sown                   AS headcount,
            NULL::numeric                         AS area_sqm,
            'seedlings'                           AS unit_of_measure,
            NULL::text                            AS location_pu_id,
            nb.production_id                      AS production_id,
            nb.created_at
        FROM tenant.nursery_batches nb
    """))
    conn.execute(sa.text("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
                GRANT SELECT ON tenant.v_production_units TO teivaka_app;
            END IF;
        END $$
    """))


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DROP VIEW IF EXISTS tenant.v_production_units"))
    conn.execute(sa.text(
        "ALTER TABLE tenant.production_units DROP CONSTRAINT IF EXISTS production_units_pu_type_check"))
    conn.execute(sa.text(
        "ALTER TABLE tenant.production_units ADD CONSTRAINT production_units_pu_type_check "
        "CHECK (pu_type IN ('BED','PLOT','GREENHOUSE','POND','PADDOCK','HIVE_STAND'))"))
    conn.execute(sa.text(
        "ALTER TABLE tenant.production_units DROP COLUMN IF EXISTS enterprise_type"))
    conn.execute(sa.text(
        "ALTER TABLE tenant.production_units DROP COLUMN IF EXISTS unit_of_measure"))
