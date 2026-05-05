"""Strike #100 — provisional varieties seed for top Pacific crops

Adds is_provisional BOOLEAN column to shared.crop_varieties (default
FALSE; existing 6 CASSAVA/EGGPLANT rows from Migration 068 stay FALSE).
Then seeds 95 architect-baseline varieties for 34 crops with
is_provisional=TRUE pending Operator review per Strike #98 Rule 4
(B64: CROPS Per-Pillar Vertical Map session; B71: review queue).

asyncpg requires one DDL statement per op.execute() call (Strike #72).

Revision ID: 070_provisional_varieties_seed
Revises: 069_crop_name_uppercase
Create Date: 2026-05-05
"""
from alembic import op

revision = '070_provisional_varieties_seed'
down_revision = '069_crop_name_uppercase'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add is_provisional column.
    op.execute("""
        ALTER TABLE shared.crop_varieties
        ADD COLUMN is_provisional BOOLEAN NOT NULL DEFAULT FALSE;
    """)
    # 2. Document the column.
    op.execute("""
        COMMENT ON COLUMN shared.crop_varieties.is_provisional IS
        'TRUE = Architect-seeded baseline pending Operator review per Strike #98 Rule 4. Operator confirms/strikes/adds in CROPS Per-Pillar Vertical Map session (B64).';
    """)
    # 3. Seed provisional varieties for 34 top Pacific crops.
    op.execute("""
        INSERT INTO shared.crop_varieties (variety_id, production_id, variety_name, is_provisional) VALUES
            ('CRP-CAB-DRUMHEAD',          'CRP-CAB', 'Drumhead', TRUE),
            ('CRP-CAB-ROUND',             'CRP-CAB', 'Round', TRUE),
            ('CRP-CAB-SAVOY',             'CRP-CAB', 'Savoy', TRUE),
            ('CRP-CAP-BELL',              'CRP-CAP', 'Bell', TRUE),
            ('CRP-CAP-LONG-GREEN',        'CRP-CAP', 'Long Green', TRUE),
            ('CRP-CAP-YOLO-WONDER',       'CRP-CAP', 'Yolo Wonder', TRUE),
            ('CRP-CHI-BIRDS-EYE',         'CRP-CHI', 'Bird''s Eye', TRUE),
            ('CRP-CHI-CAYENNE',           'CRP-CHI', 'Cayenne', TRUE),
            ('CRP-CHI-HABANERO',          'CRP-CHI', 'Habanero', TRUE),
            ('CRP-CHI-LOCAL-RED',         'CRP-CHI', 'Local Red', TRUE),
            ('CRP-CUC-LOCAL-GREEN',       'CRP-CUC', 'Local Green', TRUE),
            ('CRP-CUC-LONG-ENGLISH',      'CRP-CUC', 'Long English', TRUE),
            ('CRP-CUC-LEBANESE',          'CRP-CUC', 'Lebanese', TRUE),
            ('CRP-FRB-LOCAL-GREEN',       'CRP-FRB', 'Local Green', TRUE),
            ('CRP-FRB-BUSH-BEAN',         'CRP-FRB', 'Bush Bean', TRUE),
            ('CRP-FRB-POLE-BEAN',         'CRP-FRB', 'Pole Bean', TRUE),
            ('CRP-LBN-YARD-LONG',         'CRP-LBN', 'Yard Long', TRUE),
            ('CRP-LBN-SNAKE-BEAN',        'CRP-LBN', 'Snake Bean', TRUE),
            ('CRP-SQU-BUTTERNUT',         'CRP-SQU', 'Butternut', TRUE),
            ('CRP-SQU-LOCAL-PUMPKIN',     'CRP-SQU', 'Local Pumpkin', TRUE),
            ('CRP-SQU-ACORN',             'CRP-SQU', 'Acorn', TRUE),
            ('CRP-SCN-YELLOW',            'CRP-SCN', 'Yellow', TRUE),
            ('CRP-SCN-WHITE',             'CRP-SCN', 'White', TRUE),
            ('CRP-SCN-BICOLOR',           'CRP-SCN', 'Bicolor', TRUE),
            ('CRP-TOM-ROMA',              'CRP-TOM', 'Roma', TRUE),
            ('CRP-TOM-CHERRY',            'CRP-TOM', 'Cherry', TRUE),
            ('CRP-TOM-BEEFSTEAK',         'CRP-TOM', 'Beefsteak', TRUE),
            ('CRP-TOM-LOCAL-ROUND',       'CRP-TOM', 'Local Round', TRUE),
            ('CRP-WAT-SUGAR-BABY',        'CRP-WAT', 'Sugar Baby', TRUE),
            ('CRP-WAT-CHARLESTON-GREY',   'CRP-WAT', 'Charleston Grey', TRUE),
            ('CRP-WAT-CRIMSON-SWEET',     'CRP-WAT', 'Crimson Sweet', TRUE),
            ('CRP-CAR-NANTES',            'CRP-CAR', 'Nantes', TRUE),
            ('CRP-CAR-IMPERATOR',         'CRP-CAR', 'Imperator', TRUE),
            ('CRP-CAR-LOCAL-ORANGE',      'CRP-CAR', 'Local Orange', TRUE),
            ('CRP-CAU-WHITE',             'CRP-CAU', 'White', TRUE),
            ('CRP-CAU-PURPLE',            'CRP-CAU', 'Purple', TRUE),
            ('CRP-CAU-SNOWBALL',          'CRP-CAU', 'Snowball', TRUE),
            ('CRP-CCB-BOK-CHOY',          'CRP-CCB', 'Bok Choy', TRUE),
            ('CRP-CCB-PAK-CHOY',          'CRP-CCB', 'Pak Choy', TRUE),
            ('CRP-CCB-NAPA',              'CRP-CCB', 'Napa', TRUE),
            ('CRP-LET-ICEBERG',           'CRP-LET', 'Iceberg', TRUE),
            ('CRP-LET-ROMAINE',           'CRP-LET', 'Romaine', TRUE),
            ('CRP-LET-LOCAL-GREEN',       'CRP-LET', 'Local Green', TRUE),
            ('CRP-OKR-LOCAL-GREEN',       'CRP-OKR', 'Local Green', TRUE),
            ('CRP-OKR-CLEMSON-SPINELESS', 'CRP-OKR', 'Clemson Spineless', TRUE),
            ('CRP-ONI-RED',               'CRP-ONI', 'Red', TRUE),
            ('CRP-ONI-WHITE',             'CRP-ONI', 'White', TRUE),
            ('CRP-ONI-SPRING',            'CRP-ONI', 'Spring', TRUE),
            ('CRP-POT-LOCAL-WHITE',       'CRP-POT', 'Local White', TRUE),
            ('CRP-POT-SWEET-VARIETY',     'CRP-POT', 'Sweet Variety', TRUE),
            ('CRP-RAD-RED',               'CRP-RAD', 'Red', TRUE),
            ('CRP-RAD-WHITE-DAIKON',      'CRP-RAD', 'White Daikon', TRUE),
            ('CRP-SPT-KUMARA',            'CRP-SPT', 'Kumara', TRUE),
            ('CRP-SPT-ORANGE',            'CRP-SPT', 'Orange', TRUE),
            ('CRP-SPT-PURPLE',            'CRP-SPT', 'Purple', TRUE),
            ('CRP-SPT-LOCAL-WHITE',       'CRP-SPT', 'Local White', TRUE),
            ('CRP-DAL-TAUSALA',           'CRP-DAL', 'Tausala', TRUE),
            ('CRP-DAL-SAMOAN',            'CRP-DAL', 'Samoan', TRUE),
            ('CRP-DAL-LOCAL-BLACK',       'CRP-DAL', 'Local Black', TRUE),
            ('CRP-YAM-UVI',               'CRP-YAM', 'Uvi', TRUE),
            ('CRP-YAM-TIVOLI',            'CRP-YAM', 'Tivoli', TRUE),
            ('CRP-YAM-LOCAL-BROWN',       'CRP-YAM', 'Local Brown', TRUE),
            ('CRP-KAV-NOBLE',             'CRP-KAV', 'Noble', TRUE),
            ('CRP-KAV-TUDEI',             'CRP-KAV', 'Tudei', TRUE),
            ('CRP-KAV-LOA',               'CRP-KAV', 'Loa', TRUE),
            ('CRP-KAV-DAMU',              'CRP-KAV', 'Damu', TRUE),
            ('CRP-GIN-LOCAL',             'CRP-GIN', 'Local', TRUE),
            ('CRP-GIN-YELLOW',            'CRP-GIN', 'Yellow', TRUE),
            ('CRP-TUR-LOCAL-YELLOW',      'CRP-TUR', 'Local Yellow', TRUE),
            ('CRP-TUR-RED',               'CRP-TUR', 'Red', TRUE),
            ('CRP-ROU-LOCAL-GREEN',       'CRP-ROU', 'Local Green', TRUE),
            ('CRP-ROU-SMOOTH-LEAF',       'CRP-ROU', 'Smooth Leaf', TRUE),
            ('CRP-DUR-LOCAL',             'CRP-DUR', 'Local', TRUE),
            ('CRP-OTA-LOCAL-WILD',        'CRP-OTA', 'Local Wild', TRUE),
            ('FRT-PAS-YELLOW',            'FRT-PAS', 'Yellow', TRUE),
            ('FRT-PAS-PURPLE',            'FRT-PAS', 'Purple', TRUE),
            ('FRT-PAS-BANANA',            'FRT-PAS', 'Banana', TRUE),
            ('FRT-PAP-SOLO',              'FRT-PAP', 'Solo', TRUE),
            ('FRT-PAP-SUNSET',            'FRT-PAP', 'Sunset', TRUE),
            ('FRT-PAP-LOCAL-RED',         'FRT-PAP', 'Local Red', TRUE),
            ('FRT-MAN-CARRIE',            'FRT-MAN', 'Carrie', TRUE),
            ('FRT-MAN-TOMMY-ATKINS',      'FRT-MAN', 'Tommy Atkins', TRUE),
            ('FRT-MAN-LOCAL-PACIFIC',     'FRT-MAN', 'Local Pacific', TRUE),
            ('FRT-BAN-CAVENDISH',         'FRT-BAN', 'Cavendish', TRUE),
            ('FRT-BAN-LADY-FINGER',       'FRT-BAN', 'Lady Finger', TRUE),
            ('FRT-BAN-PLANTAIN',          'FRT-BAN', 'Plantain', TRUE),
            ('FRT-COC-TALL',              'FRT-COC', 'Tall', TRUE),
            ('FRT-COC-DWARF',             'FRT-COC', 'Dwarf', TRUE),
            ('FRT-COC-HYBRID',            'FRT-COC', 'Hybrid', TRUE),
            ('FRT-PIN-SMOOTH-CAYENNE',    'FRT-PIN', 'Smooth Cayenne', TRUE),
            ('FRT-PIN-QUEEN',             'FRT-PIN', 'Queen', TRUE),
            ('FRT-PIN-LOCAL-SPINY',       'FRT-PIN', 'Local Spiny', TRUE),
            ('FRT-DRG-WHITE-FLESH',       'FRT-DRG', 'White Flesh', TRUE),
            ('FRT-DRG-RED-FLESH',         'FRT-DRG', 'Red Flesh', TRUE),
            ('FRT-DRG-YELLOW',            'FRT-DRG', 'Yellow', TRUE);
    """)


def downgrade() -> None:
    op.execute("DELETE FROM shared.crop_varieties WHERE is_provisional = TRUE;")
    op.execute("ALTER TABLE shared.crop_varieties DROP COLUMN is_provisional;")
