"""Strike #103 — farm_layer enum + suggested_layer seed (B75 Path C amendment)

Adds the 3-Layer Farming System Doctrine (Strike #101) to schema:
- shared.farm_layer ENUM ('CASH_FLOW','FOOD_SECURITY','LONG_TERM_ASSET')
- shared.productions.suggested_layer (default at cycle creation; NULL for borderlines)
- shared.productions.requires_classification_at_creation (TRUE for 7 borderline crops)
- shared.productions.layer_rationale (Architect's per-row rationale for Operator review)
- tenant.production_cycles.layer (per Strike #101 Rule 1; NULL allowed pre-Strike-#104 backfill)

Seeds 87 confident layer assignments per B75 proposal (Operator-confirmed Path C):
- 35 CASH_FLOW
- 27 FOOD_SECURITY
- 25 LONG_TERM_ASSET
- 7 borderline (NULL suggested_layer + requires_classification_at_creation=TRUE):
  FRT-BAN, FRT-PIN, CRP-SUG, CRP-GAR, CRP-PNT, CRP-POT, CRP-TUR

asyncpg requires one DDL statement per op.execute() call (Strike #72).

Revision ID kept short to fit alembic_version VARCHAR(32) cap (Strike #100 lesson).

Revision ID: 072_layer_enum_seed
Revises: 071_crop_varieties_grant
Create Date: 2026-05-05
"""
from alembic import op

revision = '072_layer_enum_seed'
down_revision = '071_crop_varieties_grant'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create farm_layer ENUM type.
    op.execute("""
        CREATE TYPE shared.farm_layer AS ENUM (
            'CASH_FLOW', 'FOOD_SECURITY', 'LONG_TERM_ASSET'
        );
    """)
    # 2. Add suggested_layer column to shared.productions.
    op.execute("""
        ALTER TABLE shared.productions
        ADD COLUMN suggested_layer shared.farm_layer NULL;
    """)
    # 3. Add requires_classification_at_creation column.
    op.execute("""
        ALTER TABLE shared.productions
        ADD COLUMN requires_classification_at_creation BOOLEAN NOT NULL DEFAULT FALSE;
    """)
    # 4. Add layer_rationale column for Architect's per-row reasoning.
    op.execute("""
        ALTER TABLE shared.productions
        ADD COLUMN layer_rationale TEXT NULL;
    """)
    # 5. Document the columns.
    op.execute("""
        COMMENT ON COLUMN shared.productions.suggested_layer IS
        'Default layer suggestion at cycle creation. NULL means Operator must classify per cycle (see requires_classification_at_creation). Per Strike #101 Rule 1 + B75.';
    """)
    op.execute("""
        COMMENT ON COLUMN shared.productions.requires_classification_at_creation IS
        'TRUE when the production is layer-ambiguous and farmer must explicitly pick layer at cycle creation. Per Strike #101 Rule 5 + B75 edge-case handling.';
    """)
    op.execute("""
        COMMENT ON COLUMN shared.productions.layer_rationale IS
        'Architect-provided rationale for the suggested_layer assignment. Surfaced for Operator review per Strike #98 Rule 4. Source: B75 (Strike #103).';
    """)
    # 6. Add layer column to tenant.production_cycles (NULL allowed pre-Strike-#104 backfill).
    op.execute("""
        ALTER TABLE tenant.production_cycles
        ADD COLUMN layer shared.farm_layer NULL;
    """)
    op.execute("""
        COMMENT ON COLUMN tenant.production_cycles.layer IS
        'Operator-locked layer classification per Strike #101 Rule 1. Required NOT NULL after Strike #104 onboarding rebuild ships and existing cycles are backfilled.';
    """)
    # 7. Idempotent runtime GRANT (per B73 binding lesson learned from Migration 068).
    # Already granted from prior migrations; re-asserting is safe.
    op.execute("GRANT SELECT ON shared.productions TO teivaka_app;")

    # 8. Seed CASH_FLOW (35 rows).
    op.execute("""
        UPDATE shared.productions
        SET suggested_layer = 'CASH_FLOW'
        WHERE production_id IN (
            'CRP-CAB','CRP-CAP','CRP-CHI','CRP-CUC','CRP-EGG','CRP-FRB','CRP-LBN',
            'CRP-SQU','CRP-SCN','CRP-TOM','CRP-WAT',
            'AQU-PRW','AQU-TIL',
            'CRP-AMR','CRP-CAR','CRP-CAU','CRP-CCB','CRP-COR','CRP-GOU','CRP-HRB',
            'CRP-LET','CRP-MIN','CRP-OKR','CRP-ONI','CRP-PAR','CRP-RAD','CRP-SON',
            'CRP-WCR','CRP-ZUC',
            'FRT-RME',
            'CRP-DUR','CRP-GIN',
            'LIV-PBR','LIV-DCK','LIV-PLY'
        );
    """)
    # 9. Seed FOOD_SECURITY (27 rows).
    op.execute("""
        UPDATE shared.productions
        SET suggested_layer = 'FOOD_SECURITY'
        WHERE production_id IN (
            'CRP-CWP','CRP-CUL','CRP-MOR','CRP-KAW','CRP-LAB','CRP-MAZ','CRP-MNB',
            'CRP-PGP','CRP-RDR','CRP-RWT','CRP-SOR','CRP-URB','CRP-WNB',
            'FRT-PLN','FRT-BRF',
            'CRP-OTA','CRP-ROU',
            'LIV-GOA','LIV-PIG',
            'CRP-CAS','CRP-DAL','CRP-DTN','CRP-SPT','CRP-YAM',
            'SUP-LEG','SUP-NAP',
            'CRP-URO'
        );
    """)
    # 10. Seed LONG_TERM_ASSET (25 rows).
    op.execute("""
        UPDATE shared.productions
        SET suggested_layer = 'LONG_TERM_ASSET'
        WHERE production_id IN (
            'LIV-API',
            'CRP-COA','CRP-COF','CRP-VAN',
            'CRP-CDM','CRP-KAV',
            'FOR-AGA','FOR-MAH','FOR-PIN','FOR-SAN','FOR-TEK',
            'FRT-CIT','FRT-NON','FRT-MAN','FRT-PAS','FRT-SRS',
            'FRT-AVO','FRT-COC','FRT-CMQ','FRT-DRG','FRT-GUA','FRT-PAP',
            'LIV-CAT','LIV-DIR','LIV-SHP'
        );
    """)
    # 11. Flag 7 borderline rows: NULL suggested_layer + requires classification.
    op.execute("""
        UPDATE shared.productions
        SET suggested_layer = NULL,
            requires_classification_at_creation = TRUE
        WHERE production_id IN (
            'FRT-BAN','FRT-PIN','CRP-SUG','CRP-GAR','CRP-PNT','CRP-POT','CRP-TUR'
        );
    """)
    # 12. Seed layer_rationale per row (single UPDATE via VALUES + JOIN).
    op.execute("""
        UPDATE shared.productions p
        SET layer_rationale = v.rationale
        FROM (VALUES
            -- CASH_FLOW (35)
            ('CRP-CAB', 'Doctrine explicit. 8-12wk cycle, daily/weekly market revenue.'),
            ('CRP-CAP', 'Doctrine explicit. 12wk cycle, market staple.'),
            ('CRP-CHI', 'Doctrine explicit. Continuous picking, premium market herb.'),
            ('CRP-CUC', 'Doctrine explicit. 6-8wk cycle, high turnover.'),
            ('CRP-EGG', 'Doctrine explicit. Biweekly picking once productive.'),
            ('CRP-FRB', '8-10wk, market vegetable.'),
            ('CRP-LBN', 'Doctrine explicit. 8-10wk, prolific picking.'),
            ('CRP-SQU', '12-14wk, single harvest, market vegetable.'),
            ('CRP-SCN', '12wk, single harvest, market staple.'),
            ('CRP-TOM', '10-14wk, continuous picking.'),
            ('CRP-WAT', '10-12wk, market premium.'),
            ('AQU-PRW', '4-6mo grow-out cycle, harvest revenue.'),
            ('AQU-TIL', 'Doctrine explicit. 4-6mo grow-out.'),
            ('CRP-AMR', '6-8wk leafy green, market vegetable.'),
            ('CRP-CAR', '10-12wk, market vegetable.'),
            ('CRP-CAU', '10-12wk, market premium.'),
            ('CRP-CCB', 'Doctrine explicit (Bok Choy). 4-6wk cycle.'),
            ('CRP-COR', '4-6wk herb, continuous market.'),
            ('CRP-GOU', '10-12wk, market vegetable.'),
            ('CRP-HRB', 'Generic catch-all; market herbs.'),
            ('CRP-LET', 'Doctrine explicit. 4-6wk cycle.'),
            ('CRP-MIN', 'Perennial herb, market sales.'),
            ('CRP-OKR', '8-10wk continuous picking.'),
            ('CRP-ONI', '4-5mo, market staple.'),
            ('CRP-PAR', '6-8wk herb, market.'),
            ('CRP-RAD', '4-6wk short cycle.'),
            ('CRP-SON', '6-8wk herb, market.'),
            ('CRP-WCR', 'Market leafy green.'),
            ('CRP-ZUC', '6-8wk market vegetable.'),
            ('FRT-RME', '12wk annual, market premium.'),
            ('CRP-DUR', 'Annual harvest, market vegetable, Pacific specialty.'),
            ('CRP-GIN', 'Annual, high-value cash crop.'),
            ('LIV-PBR', 'Doctrine explicit. 6-8wk cycles.'),
            ('LIV-DCK', 'Market meat, similar to broiler.'),
            ('LIV-PLY', 'Doctrine explicit. Daily egg revenue.'),
            -- FOOD_SECURITY (27)
            ('CRP-CWP', 'Drought-tolerant legume staple.'),
            ('CRP-CUL', 'Perennial garden tree, household kitchen.'),
            ('CRP-MOR', 'Perennial; leaves + pods for household nutrition.'),
            ('CRP-KAW', 'Root crop, food security analogue.'),
            ('CRP-LAB', 'Legume staple + livestock fodder.'),
            ('CRP-MAZ', 'Staple cereal.'),
            ('CRP-MNB', 'Legume staple.'),
            ('CRP-PGP', 'Drought-tolerant legume staple.'),
            ('CRP-RDR', 'Staple cereal.'),
            ('CRP-RWT', 'Staple cereal.'),
            ('CRP-SOR', 'Drought-tolerant staple.'),
            ('CRP-URB', 'Legume staple.'),
            ('CRP-WNB', 'Legume staple, drought-tolerant.'),
            ('FRT-PLN', 'Doctrine explicit. Cooking banana, daily food.'),
            ('FRT-BRF', 'Doctrine explicit. Daily food, rural staple.'),
            ('CRP-OTA', 'Wild forage, daily greens.'),
            ('CRP-ROU', 'Perennial daily greens.'),
            ('LIV-GOA', 'Doctrine explicit. Ceremonial + meat.'),
            ('LIV-PIG', 'Doctrine explicit. Backyard food + ceremonial. Inactive per Inviolable #8.'),
            ('CRP-CAS', 'Doctrine explicit. Pacific staple.'),
            ('CRP-DAL', 'Doctrine explicit. Pacific staple.'),
            ('CRP-DTN', 'Pacific staple, dalo cousin.'),
            ('CRP-SPT', 'Doctrine explicit. Drought-tolerant staple.'),
            ('CRP-YAM', 'Pacific staple, ceremonial.'),
            ('SUP-LEG', 'Soil + nitrogen + edible legume.'),
            ('SUP-NAP', 'Livestock fodder; supports food via livestock.'),
            ('CRP-URO', 'Perennial daily greens, household nutrition.'),
            -- LONG_TERM_ASSET (25)
            ('LIV-API', 'Doctrine explicit. Honey produces year 2+; multi-year asset.'),
            ('CRP-COA', 'Doctrine explicit. Perennial tree, 3-4yr to first yield.'),
            ('CRP-COF', 'Doctrine explicit. Perennial, 3yr to first yield.'),
            ('CRP-VAN', 'Doctrine explicit. Perennial vine, premium, 3yr to yield.'),
            ('CRP-CDM', 'Perennial spice, premium market, 2-3yr to yield.'),
            ('CRP-KAV', 'Doctrine explicit. Yaqona, 4yr cycle, premium.'),
            ('FOR-AGA', '15-20yr maturity, premium.'),
            ('FOR-MAH', '25-40yr timber.'),
            ('FOR-PIN', '20-30yr timber.'),
            ('FOR-SAN', '15-20yr, premium oil.'),
            ('FOR-TEK', '25-50yr premium timber.'),
            ('FRT-CIT', 'Perennial, 3-4yr to yield, multi-decade producer.'),
            ('FRT-NON', 'Perennial, niche premium export.'),
            ('FRT-MAN', 'Doctrine explicit. Perennial, 4-6yr to yield.'),
            ('FRT-PAS', 'Perennial vine, 1-2yr to yield, multi-year producer.'),
            ('FRT-SRS', 'Perennial, niche premium.'),
            ('FRT-AVO', 'Perennial, 3-4yr, premium.'),
            ('FRT-COC', 'Doctrine explicit. Mature stand, multi-decade.'),
            ('FRT-CMQ', 'Perennial citrus, premium.'),
            ('FRT-DRG', 'Doctrine explicit. 1.5-2yr to first yield.'),
            ('FRT-GUA', 'Doctrine explicit. Perennial, 2-3yr to yield.'),
            ('FRT-PAP', 'Doctrine explicit. 1yr to yield, multi-year producer.'),
            ('LIV-CAT', 'Doctrine explicit. 24+mo grow-out.'),
            ('LIV-DIR', 'Long-horizon asset; dairy revenue stream year 2+.'),
            ('LIV-SHP', 'Multi-year grow-out, similar to beef.'),
            -- BORDERLINE (7) — NULL suggested_layer; farmer classifies at cycle creation
            ('FRT-BAN', 'BORDERLINE per B75: Cavendish-export = CASH_FLOW (weekly bunches); mixed/local stand = LONG_TERM_ASSET. Farmer classifies at cycle creation.'),
            ('FRT-PIN', 'BORDERLINE per B75: 18-24mo first crop (asset establishment) vs ratoon onwards (cash). Farmer classifies.'),
            ('CRP-SUG', 'BORDERLINE per B75: Multi-year ratoon (LONG_TERM_ASSET) vs annual harvest income (CASH_FLOW under FSC contract). Farmer classifies.'),
            ('CRP-GAR', 'BORDERLINE per B75: 5-6mo cycle, mostly imported in Fiji; small-scale local CASH_FLOW vs household FOOD_SECURITY. Farmer classifies.'),
            ('CRP-PNT', 'BORDERLINE per B75: Pacific groundnut = household protein (FOOD_SECURITY) primarily; can also be CASH_FLOW. Farmer classifies.'),
            ('CRP-POT', 'BORDERLINE per B75: Most Pacific potato is imported; locally-grown = small CASH_FLOW vs household FOOD_SECURITY. Farmer classifies.'),
            ('CRP-TUR', 'BORDERLINE per B75: Annual cycle (CASH_FLOW) vs perennial production (LONG_TERM_ASSET). Farmer classifies.')
        ) AS v(production_id, rationale)
        WHERE p.production_id = v.production_id;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE tenant.production_cycles DROP COLUMN IF EXISTS layer;")
    op.execute("ALTER TABLE shared.productions DROP COLUMN IF EXISTS layer_rationale;")
    op.execute("ALTER TABLE shared.productions DROP COLUMN IF EXISTS requires_classification_at_creation;")
    op.execute("ALTER TABLE shared.productions DROP COLUMN IF EXISTS suggested_layer;")
    op.execute("DROP TYPE IF EXISTS shared.farm_layer;")
