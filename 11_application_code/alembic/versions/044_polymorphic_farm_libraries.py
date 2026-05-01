"""Create shared.farm_libraries polymorphic table + Operator-seeded global rows for POULTRY.

Per Vertical Completeness Doctrine Gate 4 v1.1 (farmer-extensible at runtime).
Hybrid pattern: tenant_id IS NULL = Operator-curated global; non-NULL = farm-private.
FK references tenant.tenants (not auth.tenants).
RLS policies cover SELECT (visibility) + INSERT/UPDATE (farm-private writes only).
DELETE blocked — soft-delete via UPDATE is_active=false only.

Revision ID: 044_polymorphic_farm_libraries
Revises: 043_poultry_events_taxonomy
Create Date: 2026-05-01
"""

from alembic import op
import sqlalchemy as sa
import json

revision = '044_polymorphic_farm_libraries'
down_revision = '043_poultry_events_taxonomy'
branch_labels = None
depends_on = None

POULTRY_GLOBAL_SEEDS = [
    ('POULTRY_VACCINE', 'Newcastle (live)', {'disease': 'Newcastle', 'route': 'eye_drop_or_water', 'standard_ages_days': [7, 21, 56]}),
    ('POULTRY_VACCINE', 'Newcastle (killed)', {'disease': 'Newcastle', 'route': 'injection', 'standard_ages_days': [112]}),
    ('POULTRY_VACCINE', 'IBD (Gumboro)', {'disease': 'Infectious Bursal Disease', 'route': 'drinking_water', 'standard_ages_days': [14, 21]}),
    ("POULTRY_VACCINE", "Marek's", {'disease': "Marek's disease", 'route': 'injection', 'standard_ages_days': [1]}),
    ('POULTRY_VACCINE', 'Fowl Pox', {'disease': 'Fowl pox', 'route': 'wing_web_stab', 'standard_ages_days': [56, 70]}),
    ('POULTRY_VACCINE', 'ILT', {'disease': 'Infectious Laryngotracheitis', 'route': 'eye_drop', 'standard_ages_days': [84]}),
    ('POULTRY_VACCINE', 'Coryza', {'disease': 'Infectious Coryza', 'route': 'injection', 'standard_ages_days': [98]}),
    ('POULTRY_VACCINE', 'EDS', {'disease': 'Egg Drop Syndrome', 'route': 'injection', 'standard_ages_days': [112]}),
    ('POULTRY_BREED', 'ISA Brown', {'type': 'layer', 'origin': 'commercial'}),
    ('POULTRY_BREED', 'Hyline Brown', {'type': 'layer', 'origin': 'commercial'}),
    ('POULTRY_BREED', 'Lohmann Brown', {'type': 'layer', 'origin': 'commercial'}),
    ('POULTRY_BREED', 'Black Australorp', {'type': 'dual_purpose', 'origin': 'heritage'}),
    ('POULTRY_BREED', 'Rhode Island Red', {'type': 'dual_purpose', 'origin': 'heritage'}),
    ('POULTRY_BREED', 'Local cross / village hen', {'type': 'dual_purpose', 'origin': 'local'}),
    ('POULTRY_BREED', 'Cobb 500', {'type': 'broiler', 'origin': 'commercial'}),
    ('POULTRY_BREED', 'Ross 308', {'type': 'broiler', 'origin': 'commercial'}),
    ('POULTRY_FEED', 'Chick starter', {'grade': 'starter', 'phase': 'day1_to_week8'}),
    ('POULTRY_FEED', 'Pullet grower', {'grade': 'grower', 'phase': 'week8_to_week18'}),
    ('POULTRY_FEED', 'Layer mash', {'grade': 'layer', 'phase': 'laying', 'form': 'mash'}),
    ('POULTRY_FEED', 'Layer pellet', {'grade': 'layer', 'phase': 'laying', 'form': 'pellet'}),
    ('POULTRY_FEED', 'Broiler starter', {'grade': 'broiler_starter', 'phase': 'day1_to_week3'}),
    ('POULTRY_FEED', 'Broiler finisher', {'grade': 'broiler_finisher', 'phase': 'week3_to_week6'}),
    ('POULTRY_FEED', 'Custom mash mix', {'grade': 'custom', 'phase': 'any'}),
    ('POULTRY_SUPPLIER', 'Crest Chicken', {'region': 'Fiji-wide', 'products': ['feed', 'chicks', 'pullets']}),
    ('POULTRY_SUPPLIER', 'Punja & Sons', {'region': 'Fiji-wide', 'products': ['feed', 'equipment']}),
    ('POULTRY_SUPPLIER', 'Goodman Fielder', {'region': 'Fiji-wide', 'products': ['feed']}),
    ('POULTRY_SUPPLIER', 'Bayer Animal Health Fiji', {'region': 'Suva', 'products': ['vaccines', 'medications']}),
    ('POULTRY_SUPPLIER', 'Local hatcheries', {'region': 'per-region', 'products': ['chicks', 'pullets']}),
    ('POULTRY_BUYER', 'Supermarket (chain)', {'channel': 'commercial_retail'}),
    ('POULTRY_BUYER', 'Restaurant / hotel', {'channel': 'commercial_food_service'}),
    ('POULTRY_BUYER', 'Local market vendor', {'channel': 'commercial_retail'}),
    ('POULTRY_BUYER', 'Direct retail', {'channel': 'direct_to_consumer'}),
    ('POULTRY_BUYER', 'Wholesale agent', {'channel': 'wholesale'}),
    ('POULTRY_BUYER', 'Family / neighbor (informal)', {'channel': 'informal'}),
]

VALID_LIBRARY_TYPES = [
    'POULTRY_VACCINE', 'POULTRY_BREED', 'POULTRY_FEED',
    'POULTRY_SUPPLIER', 'POULTRY_BUYER',
]


def upgrade():
    conn = op.get_bind()

    check_values = ', '.join(f"'{lt}'" for lt in VALID_LIBRARY_TYPES)
    conn.execute(sa.text(f"""
        CREATE TABLE shared.farm_libraries (
            library_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            library_type        TEXT NOT NULL CHECK (library_type IN ({check_values})),
            tenant_id           UUID REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
            name                TEXT NOT NULL,
            attributes          JSONB DEFAULT '{{}}'::jsonb NOT NULL,
            is_active           BOOLEAN NOT NULL DEFAULT TRUE,
            created_by          UUID,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT no_empty_name CHECK (length(trim(name)) > 0)
        );
    """))

    conn.execute(sa.text("""
        CREATE INDEX idx_farm_libraries_lookup
        ON shared.farm_libraries (library_type, tenant_id, is_active)
        WHERE is_active = TRUE;
    """))

    conn.execute(sa.text("""
        ALTER TABLE shared.farm_libraries ENABLE ROW LEVEL SECURITY;
    """))

    # SELECT policy: globals visible to all; farm-private filtered by tenant
    conn.execute(sa.text("""
        CREATE POLICY farm_libraries_select ON shared.farm_libraries
        FOR SELECT
        USING (
            tenant_id IS NULL
            OR tenant_id::text = current_setting('app.tenant_id', TRUE)
        );
    """))

    # INSERT policy: farm-private rows only (cannot insert globals from runtime user)
    conn.execute(sa.text("""
        CREATE POLICY farm_libraries_insert ON shared.farm_libraries
        FOR INSERT
        WITH CHECK (
            tenant_id IS NOT NULL
            AND tenant_id::text = current_setting('app.tenant_id', TRUE)
        );
    """))

    # UPDATE policy: only own farm-private rows; soft-delete (is_active=false) allowed
    conn.execute(sa.text("""
        CREATE POLICY farm_libraries_update ON shared.farm_libraries
        FOR UPDATE
        USING (
            tenant_id IS NOT NULL
            AND tenant_id::text = current_setting('app.tenant_id', TRUE)
        )
        WITH CHECK (
            tenant_id IS NOT NULL
            AND tenant_id::text = current_setting('app.tenant_id', TRUE)
        );
    """))

    # DELETE policy: blocked entirely. All deletions go through UPDATE is_active=false.
    conn.execute(sa.text("""
        CREATE POLICY farm_libraries_no_delete ON shared.farm_libraries
        FOR DELETE
        USING (FALSE);
    """))

    conn.execute(sa.text("""
        GRANT SELECT, INSERT, UPDATE ON shared.farm_libraries TO teivaka_app;
    """))

    # Seed globals (tenant_id NULL) — runs as superuser, bypasses RLS
    for library_type, name, attributes in POULTRY_GLOBAL_SEEDS:
        conn.execute(sa.text("""
            INSERT INTO shared.farm_libraries (library_type, tenant_id, name, attributes, is_active)
            VALUES (:lt, NULL, :n, CAST(:attr AS jsonb), TRUE)
        """), {'lt': library_type, 'n': name, 'attr': json.dumps(attributes)})


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS shared.farm_libraries CASCADE;"))
