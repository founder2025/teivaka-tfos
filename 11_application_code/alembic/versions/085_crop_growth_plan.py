"""085 crop growth plan — shared.crop_growth_plan (cited, verification-flagged)

Powers the Tasks page "Next steps from your crop plan" section: per-crop stage
milestones keyed to days after planting. Qualitative, standard horticultural
actions only (NO invented dosages — NPK numbers live in crop_nutrition_protocols).
Every row is SEED_UNVERIFIED with a citation + extension-officer caveat surfaced
in the UI, mirroring the Phase 10-1 nutrition KB (Inviolable #1).

shared.* CREATE needs the owner role — apply-as-owner then alembic stamp
(Strike #123). Runbook: docs/runbooks/crop_growth_plan_apply_as_owner.md.

revision: 085_crop_growth_plan
down_revision: 084_farm_activity_context
"""
from alembic import op

revision = "085_crop_growth_plan"
down_revision = "084_farm_activity_context"
branch_labels = None
depends_on = None

CITATION = "General Pacific horticultural practice (FAO / SPC / ECHO). Indicative timing — confirm with your extension officer."
VERIF = "SEED_UNVERIFIED"

# crop_key (production_id) -> (display, [ (order, stage, day_from, day_to, action, category, ongoing) ])
PLANS = {
    "CRP-EGG": ("Eggplant", [
        (1, "Land prep", 0, 0, "Prepare the bed: clear, till and add compost", "LAND_PREP", "Keep the bed weed-free"),
        (2, "Establishment", 1, 14, "Water in the seedlings and shade from harsh sun", "PRODUCTION", "Water daily until established"),
        (3, "Vegetative", 15, 30, "Side-dress with nitrogen as the plants grow", "FEEDING", "Water 2-3x per week; scout for pests"),
        (4, "Flowering and fruit set", 31, 55, "Feed at fruit set; watch for fruit borer and whitefly", "HEALTH", "Water 2-3x per week; scout for pests"),
        (5, "Harvest", 56, 240, "Harvest fruit regularly once glossy (every few days)", "HARVEST", "Keep picking; observe any spray withholding period"),
    ]),
    "CRP-TOM": ("Tomato", [
        (1, "Land prep", 0, 0, "Prepare the bed: clear, till and add compost", "LAND_PREP", "Keep the bed weed-free"),
        (2, "Establishment", 1, 14, "Water in the seedlings and set stakes early", "PRODUCTION", "Water daily until established"),
        (3, "Vegetative", 15, 30, "Stake and de-sucker; side-dress with nitrogen", "MAINTENANCE", "Water carefully at the base; de-sucker weekly"),
        (4, "Flowering and fruit set", 31, 50, "Feed at fruit set; watch for blight and fruit borer", "HEALTH", "Water at the base; scout for disease"),
        (5, "Harvest", 51, 150, "Pick fruit as it colours (every few days)", "HARVEST", "Keep picking; observe any spray withholding period"),
    ]),
    "CRP-CAP": ("Capsicum", [
        (1, "Land prep", 0, 0, "Prepare the bed: clear, till and add compost", "LAND_PREP", "Keep the bed weed-free"),
        (2, "Establishment", 1, 14, "Water in the seedlings and protect from pests", "PRODUCTION", "Water daily until established"),
        (3, "Vegetative", 15, 35, "Side-dress with nitrogen as the plants grow", "FEEDING", "Water 2-3x per week; scout for thrips"),
        (4, "Flowering and fruit set", 36, 60, "Feed at fruit set; watch for thrips and virus", "HEALTH", "Steady watering to avoid blossom-end rot"),
        (5, "Harvest", 61, 200, "Harvest fruit as it matures", "HARVEST", "Keep picking; observe any spray withholding period"),
    ]),
    "CRP-CHI": ("Chillies", [
        (1, "Land prep", 0, 0, "Prepare the bed: clear, till and add compost", "LAND_PREP", "Keep the bed weed-free"),
        (2, "Establishment", 1, 14, "Water in the seedlings", "PRODUCTION", "Water daily until established"),
        (3, "Vegetative", 15, 35, "Side-dress with nitrogen as the plants grow", "FEEDING", "Water 2-3x per week; scout for mites and thrips"),
        (4, "Flowering and fruit set", 36, 65, "Feed at fruit set; watch for mites, thrips and virus", "HEALTH", "Steady watering; scout regularly"),
        (5, "Harvest", 66, 240, "Harvest pods as they colour", "HARVEST", "Keep picking; observe any spray withholding period"),
    ]),
    "CRP-CUC": ("Cucumber", [
        (1, "Land prep", 0, 0, "Prepare the bed: clear, till and add compost", "LAND_PREP", "Keep the bed weed-free"),
        (2, "Establishment", 1, 14, "Water in and set up trellis or training", "PRODUCTION", "Water daily until established"),
        (3, "Vining", 15, 30, "Train the vines and side-dress with nitrogen", "FEEDING", "Water 2-3x per week; scout for downy mildew"),
        (4, "Flowering", 31, 45, "Support fruit set; watch for mildew and beetles", "HEALTH", "Keep soil evenly moist"),
        (5, "Harvest", 46, 90, "Pick fruit young and often (every 1-2 days)", "HARVEST", "Keep picking; observe any spray withholding period"),
    ]),
    "CRP-WAT": ("Watermelon", [
        (1, "Land prep", 0, 0, "Prepare the bed: clear, till and add compost", "LAND_PREP", "Keep the bed weed-free"),
        (2, "Establishment", 1, 18, "Water in and protect young plants", "PRODUCTION", "Water regularly until established"),
        (3, "Vining", 19, 40, "Train the vines and side-dress with nitrogen", "FEEDING", "Water deeply; scout for pests"),
        (4, "Flowering and fruit set", 41, 65, "Support pollination; reduce water near ripening", "HEALTH", "Ease off watering as fruit ripens"),
        (5, "Harvest", 66, 110, "Harvest when the ground spot yellows and tendril dries", "HARVEST", "Check ripeness before cutting"),
    ]),
    "CRP-CAB": ("Cabbage", [
        (1, "Land prep", 0, 0, "Prepare the bed: clear, till and add compost", "LAND_PREP", "Keep the bed weed-free"),
        (2, "Establishment", 1, 14, "Water in the seedlings", "PRODUCTION", "Water daily until established"),
        (3, "Vegetative", 15, 30, "Side-dress with nitrogen as leaves grow", "FEEDING", "Water 2-3x per week; scout for caterpillars"),
        (4, "Heading", 31, 55, "Watch for diamondback moth and aphids", "HEALTH", "Steady watering for firm heads"),
        (5, "Harvest", 56, 90, "Cut heads when firm", "HARVEST", "Harvest before heads split"),
    ]),
    "CRP-CCB": ("Bok choy", [
        (1, "Land prep", 0, 0, "Prepare the bed: clear, till and add compost", "LAND_PREP", "Keep the bed weed-free"),
        (2, "Establishment", 1, 10, "Water in and keep moist", "PRODUCTION", "Water daily; fast-growing leafy crop"),
        (3, "Vegetative", 11, 30, "Side-dress with nitrogen; scout for caterpillars", "FEEDING", "Keep evenly moist; scout for pests"),
        (4, "Harvest", 31, 60, "Harvest whole plants or outer leaves as needed", "HARVEST", "Harvest young for best quality"),
    ]),
    "CRP-SPT": ("Sweet potato", [
        (1, "Land prep", 0, 0, "Prepare mounds or ridges and plant vine cuttings", "LAND_PREP", "Keep weed-free early"),
        (2, "Establishment", 1, 30, "Keep moist while vines root and run", "PRODUCTION", "Water until vines establish"),
        (3, "Vine and root growth", 31, 90, "Control weeds; avoid excess nitrogen", "MAINTENANCE", "Reduce watering as roots bulk"),
        (4, "Harvest", 91, 160, "Dig roots when sized (check a test plant)", "HARVEST", "Harvest before heavy rain if possible"),
    ]),
    "CRP-CAS": ("Cassava", [
        (1, "Land prep", 0, 0, "Prepare the land and plant healthy stem cuttings", "LAND_PREP", "Keep weed-free in the first months"),
        (2, "Establishment", 1, 60, "Keep weed-free while plants establish", "MAINTENANCE", "Weed regularly early on"),
        (3, "Bulking", 61, 240, "Minimal inputs; monitor for mosaic disease", "HEALTH", "Scout for mosaic and mealybug"),
        (4, "Harvest", 241, 400, "Dig up roots as needed once mature (harvest to market plan)", "HARVEST", "Harvest fresh to order; roots spoil fast"),
    ]),
}


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS shared.crop_growth_plan (
            plan_id            SERIAL PRIMARY KEY,
            crop_key           TEXT NOT NULL,
            crop_display_name  TEXT NOT NULL,
            stage_order        INT  NOT NULL,
            stage              TEXT NOT NULL,
            day_from           INT  NOT NULL,
            day_to             INT  NOT NULL,
            action             TEXT NOT NULL,
            category           TEXT NOT NULL
                               CHECK (category IN ('LAND_PREP','PRODUCTION','FEEDING','HEALTH','HARVEST','MAINTENANCE')),
            ongoing            TEXT,
            citation           TEXT NOT NULL,
            verification_status TEXT NOT NULL DEFAULT 'SEED_UNVERIFIED'
                               CHECK (verification_status IN ('SEED_UNVERIFIED','EXTENSION_REVIEWED','FIELD_VALIDATED')),
            UNIQUE (crop_key, stage_order)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_crop_growth_plan_key ON shared.crop_growth_plan (crop_key, stage_order)")

    rows = []
    for ck, (disp, stages) in PLANS.items():
        for (order, stage, df, dt, action, cat, ongoing) in stages:
            rows.append(
                "('{ck}','{disp}',{o},'{st}',{df},{dt},'{act}','{cat}','{ong}','{cit}','{ver}')".format(
                    ck=ck, disp=disp, o=order, st=stage, df=df, dt=dt,
                    act=action, cat=cat, ong=ongoing, cit=CITATION, ver=VERIF,
                )
            )
    op.execute(
        "INSERT INTO shared.crop_growth_plan "
        "(crop_key, crop_display_name, stage_order, stage, day_from, day_to, action, category, ongoing, citation, verification_status) "
        "VALUES " + ", ".join(rows) + " ON CONFLICT (crop_key, stage_order) DO NOTHING"
    )

    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
                GRANT SELECT ON shared.crop_growth_plan TO teivaka_app;
            END IF;
        END $$
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS shared.crop_growth_plan")
