"""115 - 12-tier ecosystem account_type taxonomy

Transitions tenant.users.account_type from the casual 8-value taxonomy (migration
091) to the formal 12-tier ecosystem taxonomy selected on the 9-card registration
grid (two cards fan out into a Stage-2 dropdown):

    PRIMARY_PRODUCER, COMMERCIAL_BUYER, AGRI_INPUT_SUPPLIER, LOGISTICS_OPERATOR,
    BANKER_COMMERCIAL, DONOR_DEVELOPMENT, AGRIBUSINESS_ENTERPRISE,
    COMMODITY_EXPORTER, TRADE_IMPORTER, MATAQALI_TRUSTEE, GOVERNMENT_REGULATOR,
    QUALITY_AUDITOR

Data-safe: existing rows are mapped old → new BEFORE the CHECK is swapped, and the
column default is moved to PRIMARY_PRODUCER so a default insert can't violate the
new constraint. One statement per op.execute() (asyncpg — Strike #72). Reversible.
"""
from alembic import op

revision = "115_account_type_taxonomy"
down_revision = "114_remove_trials"
branch_labels = None
depends_on = None

NEW_VALUES = (
    "'PRIMARY_PRODUCER','COMMERCIAL_BUYER','AGRI_INPUT_SUPPLIER','LOGISTICS_OPERATOR',"
    "'BANKER_COMMERCIAL','DONOR_DEVELOPMENT','AGRIBUSINESS_ENTERPRISE','COMMODITY_EXPORTER',"
    "'TRADE_IMPORTER','MATAQALI_TRUSTEE','GOVERNMENT_REGULATOR','QUALITY_AUDITOR'"
)
OLD_VALUES = (
    "'FARMER','SUPPLIER','BUYER','SERVICE_PROVIDER','BANKER','BUSINESS','EXPORTER','IMPORTER'"
)


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        # 1. Map existing rows old → new (single CASE statement).
        """
        UPDATE tenant.users SET account_type = CASE account_type
            WHEN 'FARMER'          THEN 'PRIMARY_PRODUCER'
            WHEN 'BUYER'           THEN 'COMMERCIAL_BUYER'
            WHEN 'SUPPLIER'        THEN 'AGRI_INPUT_SUPPLIER'
            WHEN 'SERVICE_PROVIDER' THEN 'LOGISTICS_OPERATOR'
            WHEN 'BANKER'          THEN 'BANKER_COMMERCIAL'
            WHEN 'BUSINESS'        THEN 'AGRIBUSINESS_ENTERPRISE'
            WHEN 'EXPORTER'        THEN 'COMMODITY_EXPORTER'
            WHEN 'IMPORTER'        THEN 'TRADE_IMPORTER'
            WHEN 'OTHER'           THEN 'AGRIBUSINESS_ENTERPRISE'
            ELSE account_type END
        WHERE account_type IN ('FARMER','BUYER','SUPPLIER','SERVICE_PROVIDER','BANKER','BUSINESS','EXPORTER','IMPORTER','OTHER')
        """,
        # 2. Move the column default off a now-invalid value.
        "ALTER TABLE tenant.users ALTER COLUMN account_type SET DEFAULT 'PRIMARY_PRODUCER'",
        # 3. Swap the CHECK constraint to the 12-tier taxonomy.
        "ALTER TABLE tenant.users DROP CONSTRAINT IF EXISTS users_account_type_check",
        f"ALTER TABLE tenant.users ADD CONSTRAINT users_account_type_check CHECK (account_type IN ({NEW_VALUES}))",
    ])


def downgrade():
    _exec_each([
        "ALTER TABLE tenant.users DROP CONSTRAINT IF EXISTS users_account_type_check",
        """
        UPDATE tenant.users SET account_type = CASE account_type
            WHEN 'PRIMARY_PRODUCER'        THEN 'FARMER'
            WHEN 'COMMERCIAL_BUYER'        THEN 'BUYER'
            WHEN 'AGRI_INPUT_SUPPLIER'     THEN 'SUPPLIER'
            WHEN 'LOGISTICS_OPERATOR'      THEN 'SERVICE_PROVIDER'
            WHEN 'BANKER_COMMERCIAL'       THEN 'BANKER'
            WHEN 'DONOR_DEVELOPMENT'       THEN 'BANKER'
            WHEN 'AGRIBUSINESS_ENTERPRISE' THEN 'BUSINESS'
            WHEN 'COMMODITY_EXPORTER'      THEN 'EXPORTER'
            WHEN 'TRADE_IMPORTER'          THEN 'IMPORTER'
            WHEN 'MATAQALI_TRUSTEE'        THEN 'BUSINESS'
            WHEN 'GOVERNMENT_REGULATOR'    THEN 'BUSINESS'
            WHEN 'QUALITY_AUDITOR'         THEN 'BUSINESS'
            ELSE account_type END
        """,
        "ALTER TABLE tenant.users ALTER COLUMN account_type SET DEFAULT 'FARMER'",
        f"ALTER TABLE tenant.users ADD CONSTRAINT users_account_type_check CHECK (account_type IN ({OLD_VALUES}))",
    ])
