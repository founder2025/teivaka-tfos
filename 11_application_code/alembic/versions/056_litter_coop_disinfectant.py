"""Phase 6.3-11/12: LITTER_CHANGED + COOP_CLEANED 2-form pack.

Adds LITTER_CHANGED to audit.events CHECK enum + event_type_catalog.
COOP_CLEANED already in both (PRE-CHECK confirmed) - skipped.
Adds POULTRY_DISINFECTANT to farm_libraries.library_type CHECK enum (Strike #80).
Seeds 5 commonly-available Pacific disinfectants as global rows.

Strike #72 binding: each DDL is one op.execute() call.
Strike #51 binding: catalog INSERT uses ON CONFLICT DO NOTHING.
Strike #34/56 binding: shared.farm_libraries has no `description` column;
  human-readable description is folded into attributes JSONB.

Revision ID: 056_litter_coop_disinfect
Revises: 055_crop_nutrition
"""
from alembic import op
import sqlalchemy as sa
import json
import re


revision = '056_litter_coop_disinfect'
down_revision = '055_crop_nutrition'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # 1. Extend audit.events CHECK enum: add LITTER_CHANGED
    #    (COOP_CLEANED already present per PRE-CHECK)
    constraint_row = conn.execute(sa.text("""
        SELECT conname, pg_get_constraintdef(oid) AS defn
        FROM pg_constraint
        WHERE conrelid='audit.events'::regclass AND contype='c'
        AND pg_get_constraintdef(oid) LIKE '%event_type%'
        LIMIT 1;
    """)).first()

    if constraint_row and 'LITTER_CHANGED' not in constraint_row.defn:
        constraint_name = constraint_row.conname
        match = re.search(r"ARRAY\[(.*)\]", constraint_row.defn)
        if match:
            existing = re.findall(r"'([^']+)'::(?:character varying|text)", match.group(1))
            new_values = list(existing) + ['LITTER_CHANGED']
            array_lit = ", ".join([f"'{v}'::text" for v in new_values])
            op.execute(f"ALTER TABLE audit.events DROP CONSTRAINT {constraint_name};")
            op.execute(
                f"ALTER TABLE audit.events ADD CONSTRAINT {constraint_name} "
                f"CHECK (event_type = ANY (ARRAY[{array_lit}]));"
            )

    # 2. Insert LITTER_CHANGED into event_type_catalog
    #    (COOP_CLEANED already present - ON CONFLICT skip is defensive)
    op.execute("""
        INSERT INTO shared.event_type_catalog
            (event_type, catalog_group, sort_order, is_user_facing, is_compound,
             livestock_only, min_role, min_mode, backdating_window_days, is_active, notes)
        VALUES
            ('LITTER_CHANGED', 'POULTRY', 320, TRUE, FALSE, TRUE,
             'WORKER', 'SOLO', 30, TRUE,
             'Phase 6.3-11: Logged when bedding/litter is replaced in a coop. Biosecurity foundational event.')
        ON CONFLICT (event_type) DO NOTHING;
    """)

    # 3. Extend shared.farm_libraries.library_type CHECK enum
    #    Add POULTRY_DISINFECTANT (Strike #80)
    lib_constraint_row = conn.execute(sa.text("""
        SELECT conname, pg_get_constraintdef(oid) AS defn
        FROM pg_constraint
        WHERE conrelid='shared.farm_libraries'::regclass AND contype='c'
        AND pg_get_constraintdef(oid) LIKE '%library_type%'
        LIMIT 1;
    """)).first()

    if lib_constraint_row and 'POULTRY_DISINFECTANT' not in lib_constraint_row.defn:
        constraint_name = lib_constraint_row.conname
        match = re.search(r"ARRAY\[(.*)\]", lib_constraint_row.defn)
        if match:
            existing = re.findall(r"'([^']+)'::text", match.group(1))
            new_values = list(existing) + ['POULTRY_DISINFECTANT']
            array_lit = ", ".join([f"'{v}'::text" for v in new_values])
            op.execute(f"ALTER TABLE shared.farm_libraries DROP CONSTRAINT {constraint_name};")
            op.execute(
                f"ALTER TABLE shared.farm_libraries ADD CONSTRAINT {constraint_name} "
                f"CHECK (library_type = ANY (ARRAY[{array_lit}]));"
            )

    # 4. Seed 5 POULTRY_DISINFECTANT globals (tenant_id IS NULL).
    #    No `description` column on farm_libraries - description folded into attributes.
    disinfectants = [
        ('Virkon S', {
            "description": "Broad-spectrum disinfectant powder; effective against bacteria, viruses, fungi. Mix 1% solution. Good for routine coop disinfection.",
            "active_ingredient": "potassium peroxymonosulfate",
            "concentration": "1%",
            "contact_time_minutes": 10,
        }),
        ('Calcium Hypochlorite (HTH)', {
            "description": "Granular chlorine compound; cost-effective for coop floor sanitation. Mix per label (typically 200-500 ppm available chlorine).",
            "active_ingredient": "calcium hypochlorite",
            "concentration": "65-70%",
            "contact_time_minutes": 15,
        }),
        ('Hydrogen Peroxide 3%', {
            "description": "Mild oxidizing disinfectant; safe for use around birds. Apply via spray. Decomposes to water and oxygen - environmentally safe.",
            "active_ingredient": "hydrogen peroxide",
            "concentration": "3%",
            "contact_time_minutes": 10,
        }),
        ('Bleach Solution (Sodium Hypochlorite)', {
            "description": "Common household bleach diluted 1:10 with water. Effective broad-spectrum. Rinse thoroughly after application; corrosive to metal.",
            "active_ingredient": "sodium hypochlorite",
            "concentration": "5-6%",
            "contact_time_minutes": 10,
        }),
        ('Quaternary Ammonium Compound', {
            "description": "Detergent-disinfectant blend; good for routine cleaning. Less effective against non-enveloped viruses than peroxide-based products.",
            "active_ingredient": "quaternary ammonium",
            "concentration": "varies",
            "contact_time_minutes": 10,
        }),
    ]

    for name, attrs in disinfectants:
        # Idempotent: skip if a global row of this library_type+name already exists.
        existing = conn.execute(sa.text("""
            SELECT 1 FROM shared.farm_libraries
            WHERE library_type='POULTRY_DISINFECTANT'
              AND tenant_id IS NULL
              AND name=:name
            LIMIT 1
        """), {"name": name}).first()
        if existing:
            continue
        conn.execute(sa.text("""
            INSERT INTO shared.farm_libraries
                (tenant_id, library_type, name, attributes, is_active)
            VALUES
                (NULL, 'POULTRY_DISINFECTANT', :name, CAST(:attrs AS jsonb), TRUE)
        """), {"name": name, "attrs": json.dumps(attrs)})


def downgrade():
    op.execute("DELETE FROM shared.event_type_catalog WHERE event_type = 'LITTER_CHANGED';")
    op.execute(
        "DELETE FROM shared.farm_libraries "
        "WHERE library_type = 'POULTRY_DISINFECTANT' AND tenant_id IS NULL;"
    )
    # Don't downgrade CHECK enums - orphan rows worse than retaining permissive enum
