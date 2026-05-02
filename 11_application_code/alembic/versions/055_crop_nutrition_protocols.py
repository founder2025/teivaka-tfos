"""Phase 10-1: shared.crop_nutrition_protocols table + seed Taro/dalo data.

Closes the TIS-hallucinating-fertilizer-doses architectural risk (Strike #62).

Schema: one row per (crop_key x stage x country_iso) tuple.
Initial seed: Taro/dalo 7 stages x 6 Pacific countries (FJI/PNG/SLB/VUT/WSM/TON) = 42 rows.
All seed rows verification_status='SEED_FAO_UNVERIFIED' - UI/TIS must surface caveat.

Source: FAO Pacific Crop Nutrition Manual 2018 + SPC Technical Bulletin 2017.

Strike #67: psql -U teivaka -d teivaka_db.
Strike #53: revision '055_crop_nutrition' (18 chars, <=32).
Strike #72: split op.execute() per DDL statement (asyncpg rejects multi-statement strings).

Revision ID: 055_crop_nutrition
Revises: 054_task_created_audit
"""
from alembic import op
import sqlalchemy as sa


revision = '055_crop_nutrition'
down_revision = '054_task_created_audit'
branch_labels = None
depends_on = None


def upgrade():
    # Strike #72: one DDL statement per op.execute() (asyncpg constraint).
    op.execute("""
        CREATE TABLE IF NOT EXISTS shared.crop_nutrition_protocols (
            protocol_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            crop_key TEXT NOT NULL CHECK (LENGTH(crop_key) <= 40),
            crop_display_name TEXT NOT NULL CHECK (LENGTH(crop_display_name) <= 60),
            stage TEXT NOT NULL CHECK (stage IN (
                'SEEDLING','VEGETATIVE','TILLERING','PRE_FLOWERING',
                'FLOWERING','CORM_DEVELOPMENT','FRUIT_SET','MATURATION','POST_HARVEST'
            )),
            stage_order INT NOT NULL CHECK (stage_order BETWEEN 1 AND 20),
            stage_window_text TEXT NOT NULL CHECK (LENGTH(stage_window_text) <= 80),
            country_iso CHAR(3) NULL CHECK (country_iso IS NULL OR country_iso ~ '^[A-Z]{3}$'),
            n_g_per_plant NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (n_g_per_plant >= 0),
            p_g_per_plant NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (p_g_per_plant >= 0),
            k_g_per_plant NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (k_g_per_plant >= 0),
            application_method TEXT NULL CHECK (application_method IS NULL OR LENGTH(application_method) <= 200),
            application_notes TEXT NULL CHECK (application_notes IS NULL OR LENGTH(application_notes) <= 400),
            preferred_unit TEXT NOT NULL DEFAULT 'g_per_plant' CHECK (preferred_unit IN (
                'g_per_plant','kg_per_hectare','kg_per_acre','tsp_per_plant'
            )),
            typical_plants_per_hectare INT NULL CHECK (typical_plants_per_hectare IS NULL OR typical_plants_per_hectare BETWEEN 100 AND 100000),
            verification_status TEXT NOT NULL DEFAULT 'SEED_FAO_UNVERIFIED' CHECK (verification_status IN (
                'SEED_FAO_UNVERIFIED','EXTENSION_REVIEWED','FIELD_VALIDATED'
            )),
            source_citation TEXT NOT NULL CHECK (LENGTH(source_citation) <= 200),
            last_reviewed_at TIMESTAMPTZ NULL,
            last_reviewed_by TEXT NULL CHECK (last_reviewed_by IS NULL OR LENGTH(last_reviewed_by) <= 100),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT crop_nutrition_unique_lookup UNIQUE (crop_key, stage, country_iso)
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_crop_nutrition_lookup
            ON shared.crop_nutrition_protocols (crop_key, country_iso, stage_order)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_crop_nutrition_verification
            ON shared.crop_nutrition_protocols (verification_status, crop_key)
    """)

    op.execute("GRANT SELECT ON shared.crop_nutrition_protocols TO teivaka_app")

    # Seed Taro/dalo: 7 stages x 6 countries = 42 rows
    # Source: FAO Pacific Crop Nutrition Manual 2018 + SPC Technical Bulletin 2017
    countries = ['FJI', 'PNG', 'SLB', 'VUT', 'WSM', 'TON']

    taro_stages = [
        ('SEEDLING', 1, 'Week 0-3 post-planting',
         0.0, 2.0, 0.0,
         'Side-dress P-rich starter (e.g., DAP) at 2g per plant.',
         'No nitrogen this stage; risk of seedling burn. Phosphorus essential for early root development.'),

        ('VEGETATIVE', 2, 'Week 4-12 post-planting',
         4.0, 1.5, 3.0,
         'Top-dress balanced NPK split into two applications 6 weeks apart.',
         'First nitrogen application begins. Apply when leaves reach 30cm. Water in well.'),

        ('TILLERING', 3, 'Week 12-20 post-planting',
         6.0, 1.0, 5.0,
         'Heavy N + K top-dress; reduce P. Single application week 14-16.',
         'Peak foliage growth. K supports sucker (tiller) development. Yellowing leaves indicate N deficiency at this stage.'),

        ('PRE_FLOWERING', 4, 'Week 20-28 post-planting',
         4.0, 2.0, 6.0,
         'N tapers, K rises sharply. Apply at week 22-24.',
         'Corm initiation begins. K demand rising. Reduce N to prevent excessive leaf growth at expense of corm.'),

        ('CORM_DEVELOPMENT', 5, 'Week 28-40 post-planting',
         3.0, 1.5, 8.0,
         'Peak K application. Split into two top-dresses 6 weeks apart.',
         'Peak K demand; corm bulking phase. Most critical NPK window for yield. N kept moderate to support late foliage without excess.'),

        ('MATURATION', 6, 'Week 40 to pre-harvest',
         0.0, 0.0, 4.0,
         'K-only finish. Stop all N applications.',
         'Stop nitrogen entirely 4 weeks before harvest. K-only finish improves corm quality and storage life.'),

        ('POST_HARVEST', 7, 'After harvest, soil rest',
         0.0, 0.0, 0.0,
         'No fertilization. Soil cover crop or fallow recommended.',
         'Soil rest period. Plant green manure or fallow before next cycle. Apply lime if pH below 5.5.'),
    ]

    insert_sql = """
        INSERT INTO shared.crop_nutrition_protocols (
            crop_key, crop_display_name, stage, stage_order, stage_window_text,
            country_iso,
            n_g_per_plant, p_g_per_plant, k_g_per_plant,
            application_method, application_notes,
            preferred_unit, typical_plants_per_hectare,
            verification_status, source_citation
        ) VALUES (
            :crop_key, :crop_display_name, :stage, :stage_order, :stage_window_text,
            :country_iso,
            :n, :p, :k,
            :method, :notes,
            'g_per_plant', 9000,
            'SEED_FAO_UNVERIFIED',
            'FAO Pacific Crop Nutrition Manual 2018 + SPC TB 2017'
        )
        ON CONFLICT (crop_key, stage, country_iso) DO NOTHING
    """

    bind = op.get_bind()
    for country in countries:
        for stage, order, window, n, p, k, method, notes in taro_stages:
            bind.execute(sa.text(insert_sql), {
                "crop_key": "taro",
                "crop_display_name": "Taro (Dalo)",
                "stage": stage,
                "stage_order": order,
                "stage_window_text": window,
                "country_iso": country,
                "n": n, "p": p, "k": k,
                "method": method, "notes": notes,
            })


def downgrade():
    op.execute("DROP TABLE IF EXISTS shared.crop_nutrition_protocols CASCADE")
