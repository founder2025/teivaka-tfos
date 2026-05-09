"""077_crops_taxonomy_lock

Strike #C1: Crops vertical taxonomy lock. Operator-reviewed walk
2026-05-09. Establishes CROPS as priority-1 vertical at parity
with POULTRY operational completeness.

Operations:
- PRE-OP: widen catalog_group CHECK constraint to include
  LABOR, COMPLIANCE, OPERATIONS (drop+readd pattern)
- 20 truly-new event_types (class A INSERTs)
- 26 catalog_group recategorizations (class B UPDATEs)
- 3 new catalog_group values: LABOR, COMPLIANCE, OPERATIONS
- WORKER_CHECKIN relocated to LABOR
- 5 events relocated from POULTRY (cross-vertical concerns)
- Total catalog post-migration: 147 rows (127 + 20 truly new)
- POST-OP downgrade: revert CHECK constraint to original 12 groups

Revision ID: 077_crops_taxonomy_lock
Revises: 076_farm_groups_tenant_id
Create Date: 2026-05-09
"""

from alembic import op

revision = '077_crops_taxonomy_lock'
down_revision = '076_farm_groups_tenant_id'
branch_labels = None
depends_on = None


def upgrade():
    # ──────────────────────────────────────────────────────────────
    # PRE-OPERATION — widen catalog_group CHECK constraint
    # ──────────────────────────────────────────────────────────────
    # Existing constraint whitelists 12 groups; we add 3 new (LABOR,
    # COMPLIANCE, OPERATIONS). Strike #72: single DDL per op.execute.
    op.execute("ALTER TABLE shared.event_type_catalog DROP CONSTRAINT event_type_catalog_group_check;")
    op.execute("""
        ALTER TABLE shared.event_type_catalog ADD CONSTRAINT event_type_catalog_group_check
        CHECK (catalog_group = ANY (ARRAY[
            'CROPS','PERENNIALS','LIVESTOCK','POULTRY','APICULTURE',
            'AQUACULTURE','FORESTRY','SPECIALTY','MONEY','NOTES','OTHER','SYSTEM',
            'LABOR','COMPLIANCE','OPERATIONS'
        ]));
    """)

    # ──────────────────────────────────────────────────────────────
    # CLASS A — TRULY NEW INSERTS (20 rows)
    # ──────────────────────────────────────────────────────────────

    # Lifecycle (1 new — others already exist as relocations)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('CYCLE_ABANDONED', 'CROPS', 14, true, false, false, true,
        'Strike #C1: Cycle terminated mid-stream (failure, weather, decision).');
    """)

    # Nursery (1 new)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('NURSERY_LOSS', 'CROPS', 24, true, false, false, true,
        'Strike #C1: Seedlings lost in nursery (damping off, pest).');
    """)

    # Daily Care new (3 new)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('MULCHING', 'CROPS', 35, true, false, false, true,
        'Strike #C1: Mulch applied for moisture/weed control.');
    """)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('COVER_CROP_PLANTED', 'CROPS', 36, true, false, false, true,
        'Strike #C1: Cover/green-manure crop sown between cycles.');
    """)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('THINNING', 'CROPS', 37, true, false, false, true,
        'Strike #C1: Thin seedlings to optimize spacing.');
    """)

    # Health/Pest/Disease new (4 new — PEST_SCOUTING, DISEASE_SCOUTING relocated separately)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('PEST_CONFIRMED', 'CROPS', 42, true, false, false, true,
        'Strike #C1: Pest identified at threshold for action.');
    """)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('DISEASE_CONFIRMED', 'CROPS', 43, true, false, false, true,
        'Strike #C1: Disease identified at threshold for action.');
    """)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('BIOLOGICAL_CONTROL_APPLIED', 'CROPS', 44, true, false, false, true,
        'Strike #C1: Biocontrol agents released (ladybugs, parasitoids).');
    """)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('CROP_HEALTH_OBSERVATION', 'CROPS', 45, true, false, false, true,
        'Strike #C1: General observation — yellowing, stunting, etc.');
    """)

    # Production/Harvest new (2 new — GRADING relocated separately)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('STORAGE_LOGGED', 'CROPS', 53, true, false, false, true,
        'Strike #C1: Harvest moved to storage with conditions noted.');
    """)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('STORAGE_CHECK', 'CROPS', 54, true, false, false, true,
        'Strike #C1: Periodic storage condition check.');
    """)

    # Sales/Delivery new (2 new — DELIVERY_*, PAYMENT_RECEIVED, INPUT_RECEIVED relocated)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('CROP_SOLD', 'CROPS', 62, true, false, false, true,
        'Strike #C1: Direct sale (market, roadside, walk-in buyer).');
    """)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('CROP_GIVEN', 'CROPS', 63, true, false, false, true,
        'Strike #C1: Non-sale disposal — gifting, charity, family.');
    """)

    # Inventory/Inputs new (3 new)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('INPUT_PURCHASED', 'CROPS', 71, true, false, false, true,
        'Strike #C1: Cost-tracked input purchase. Cashflow input.');
    """)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('INPUT_INVENTORY_CHECK', 'CROPS', 73, true, false, false, true,
        'Strike #C1: Periodic stock check.');
    """)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('SEED_SAVED', 'CROPS', 74, true, false, false, true,
        'Strike #C1: Seed harvested + saved for next planting.');
    """)

    # Labor new (2 new — WORKER_CHECKIN, TASK_ASSIGNED, TASK_COMPLETED, WAGE_PAID relocated)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('WORKER_CHECKOUT', 'LABOR', 81, true, false, false, true,
        'Strike #C1: Worker ends day on farm.');
    """)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('WORKER_INCIDENT', 'LABOR', 85, true, false, false, true,
        'Strike #C1: Injury, dispute, no-show. Compliance + HR record.');
    """)

    # Compliance new (1 new — CERTIFICATION_AUDIT, PERMIT_RECEIVED, VISITOR_LOGGED relocated)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('COMPLIANCE_INSPECTION', 'COMPLIANCE', 90, true, false, false, true,
        'Strike #C1: Regulator/extension officer farm visit.');
    """)

    # Operations new (1 new — WEATHER_*, EQUIPMENT_* relocated)
    op.execute("""
        INSERT INTO shared.event_type_catalog
        (event_type, catalog_group, sort_order, is_user_facing, is_compound, livestock_only, is_active, notes)
        VALUES ('FIELD_INCIDENT', 'OPERATIONS', 102, true, false, false, true,
        'Strike #C1: Theft, vandalism, equipment failure, animal intrusion.');
    """)

    # ──────────────────────────────────────────────────────────────
    # CLASS B — RECATEGORIZATION UPDATEs (26 rows)
    # ──────────────────────────────────────────────────────────────
    # Each UPDATE is explicit about prior catalog_group for downgrade reversibility.

    # OTHER → CROPS (7 rows)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='CROPS', sort_order=10 WHERE event_type='CYCLE_CREATED' AND catalog_group='OTHER';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='CROPS', sort_order=12 WHERE event_type='CYCLE_CLOSED' AND catalog_group='OTHER';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='CROPS', sort_order=20 WHERE event_type='NURSERY_BATCH_CREATED' AND catalog_group='OTHER';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='CROPS', sort_order=21 WHERE event_type='GERMINATION_LOGGED' AND catalog_group='OTHER';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='CROPS', sort_order=22 WHERE event_type='NURSERY_READY' AND catalog_group='OTHER';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='CROPS', sort_order=52 WHERE event_type='POST_HARVEST_LOSS' AND catalog_group='OTHER';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='CROPS', sort_order=51 WHERE event_type='GRADING' AND catalog_group='OTHER';")

    # OTHER → LABOR (1 row)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='LABOR', sort_order=80 WHERE event_type='WORKER_CHECKIN' AND catalog_group='OTHER';")

    # NOTES → CROPS (2 rows)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='CROPS', sort_order=40 WHERE event_type='PEST_SCOUTING' AND catalog_group='NOTES';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='CROPS', sort_order=41 WHERE event_type='DISEASE_SCOUTING' AND catalog_group='NOTES';")

    # NOTES → OPERATIONS (2 rows)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='OPERATIONS', sort_order=100 WHERE event_type='WEATHER_OBSERVED' AND catalog_group='NOTES';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='OPERATIONS', sort_order=101 WHERE event_type='WEATHER_IMPACT' AND catalog_group='NOTES';")

    # MONEY → CROPS (3 rows)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='CROPS', sort_order=60 WHERE event_type='DELIVERY_DISPATCHED' AND catalog_group='MONEY';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='CROPS', sort_order=61 WHERE event_type='DELIVERY_CONFIRMED' AND catalog_group='MONEY';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='CROPS', sort_order=70 WHERE event_type='INPUT_RECEIVED' AND catalog_group='MONEY';")

    # SYSTEM → CROPS (PAYMENT_RECEIVED — user-facing crop event misplaced)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='CROPS', sort_order=64 WHERE event_type='PAYMENT_RECEIVED' AND catalog_group='SYSTEM';")

    # SYSTEM → CROPS (STAGE_TRANSITION — lifecycle event misplaced)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='CROPS', sort_order=11 WHERE event_type='STAGE_TRANSITION' AND catalog_group='SYSTEM';")

    # SYSTEM → LABOR (3 rows)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='LABOR', sort_order=82 WHERE event_type='TASK_ASSIGNED' AND catalog_group='SYSTEM';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='LABOR', sort_order=83 WHERE event_type='TASK_COMPLETED' AND catalog_group='SYSTEM';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='LABOR', sort_order=84 WHERE event_type='WAGE_PAID' AND catalog_group='SYSTEM';")

    # SYSTEM → OPERATIONS (1 row)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='OPERATIONS', sort_order=103 WHERE event_type='EQUIPMENT_USE' AND catalog_group='SYSTEM';")

    # POULTRY → COMPLIANCE (3 rows)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='COMPLIANCE', sort_order=91 WHERE event_type='CERTIFICATION_AUDIT' AND catalog_group='POULTRY';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='COMPLIANCE', sort_order=92 WHERE event_type='PERMIT_RECEIVED' AND catalog_group='POULTRY';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='COMPLIANCE', sort_order=93 WHERE event_type='VISITOR_LOGGED' AND catalog_group='POULTRY';")

    # POULTRY → OPERATIONS (2 rows)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='OPERATIONS', sort_order=104 WHERE event_type='EQUIPMENT_MAINTAINED' AND catalog_group='POULTRY';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='OPERATIONS', sort_order=105 WHERE event_type='EQUIPMENT_PURCHASED' AND catalog_group='POULTRY';")


def downgrade():
    # ──────────────────────────────────────────────────────────────
    # Reverse Class B UPDATEs first (restore original catalog_group + sort_order)
    # ──────────────────────────────────────────────────────────────

    # CROPS → OTHER (revert 7 rows)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='OTHER', sort_order=80 WHERE event_type='CYCLE_CREATED' AND catalog_group='CROPS';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='OTHER', sort_order=90 WHERE event_type='CYCLE_CLOSED' AND catalog_group='CROPS';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='OTHER', sort_order=10 WHERE event_type='NURSERY_BATCH_CREATED' AND catalog_group='CROPS';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='OTHER', sort_order=30 WHERE event_type='GERMINATION_LOGGED' AND catalog_group='CROPS';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='OTHER', sort_order=20 WHERE event_type='NURSERY_READY' AND catalog_group='CROPS';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='OTHER', sort_order=60 WHERE event_type='POST_HARVEST_LOSS' AND catalog_group='CROPS';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='OTHER', sort_order=70 WHERE event_type='GRADING' AND catalog_group='CROPS';")

    # LABOR → OTHER (revert WORKER_CHECKIN)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='OTHER', sort_order=40 WHERE event_type='WORKER_CHECKIN' AND catalog_group='LABOR';")

    # CROPS → NOTES (revert 2 rows)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='NOTES', sort_order=10 WHERE event_type='PEST_SCOUTING' AND catalog_group='CROPS';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='NOTES', sort_order=20 WHERE event_type='DISEASE_SCOUTING' AND catalog_group='CROPS';")

    # OPERATIONS → NOTES (revert 2 rows)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='NOTES', sort_order=30 WHERE event_type='WEATHER_OBSERVED' AND catalog_group='OPERATIONS';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='NOTES', sort_order=40 WHERE event_type='WEATHER_IMPACT' AND catalog_group='OPERATIONS';")

    # CROPS → MONEY (revert 3 rows)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='MONEY', sort_order=70 WHERE event_type='DELIVERY_DISPATCHED' AND catalog_group='CROPS';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='MONEY', sort_order=80 WHERE event_type='DELIVERY_CONFIRMED' AND catalog_group='CROPS';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='MONEY', sort_order=50 WHERE event_type='INPUT_RECEIVED' AND catalog_group='CROPS';")

    # CROPS → SYSTEM (revert PAYMENT_RECEIVED)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='SYSTEM', sort_order=130 WHERE event_type='PAYMENT_RECEIVED' AND catalog_group='CROPS';")

    # CROPS → SYSTEM (revert STAGE_TRANSITION)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='SYSTEM', sort_order=50 WHERE event_type='STAGE_TRANSITION' AND catalog_group='CROPS';")

    # LABOR → SYSTEM (revert 3 rows)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='SYSTEM', sort_order=60 WHERE event_type='TASK_ASSIGNED' AND catalog_group='LABOR';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='SYSTEM', sort_order=10 WHERE event_type='TASK_COMPLETED' AND catalog_group='LABOR';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='SYSTEM', sort_order=90 WHERE event_type='WAGE_PAID' AND catalog_group='LABOR';")

    # OPERATIONS → SYSTEM (revert EQUIPMENT_USE)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='SYSTEM', sort_order=70 WHERE event_type='EQUIPMENT_USE' AND catalog_group='OPERATIONS';")

    # COMPLIANCE → POULTRY (revert 3 rows)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='POULTRY', sort_order=31 WHERE event_type='CERTIFICATION_AUDIT' AND catalog_group='COMPLIANCE';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='POULTRY', sort_order=30 WHERE event_type='PERMIT_RECEIVED' AND catalog_group='COMPLIANCE';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='POULTRY', sort_order=370 WHERE event_type='VISITOR_LOGGED' AND catalog_group='COMPLIANCE';")

    # OPERATIONS → POULTRY (revert 2 rows)
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='POULTRY', sort_order=420 WHERE event_type='EQUIPMENT_MAINTAINED' AND catalog_group='OPERATIONS';")
    op.execute("UPDATE shared.event_type_catalog SET catalog_group='POULTRY', sort_order=26 WHERE event_type='EQUIPMENT_PURCHASED' AND catalog_group='OPERATIONS';")

    # ──────────────────────────────────────────────────────────────
    # Reverse Class A INSERTs (DELETE the 20 truly-new rows)
    # ──────────────────────────────────────────────────────────────
    op.execute("""
        DELETE FROM shared.event_type_catalog
        WHERE event_type IN (
            'CYCLE_ABANDONED','NURSERY_LOSS',
            'MULCHING','COVER_CROP_PLANTED','THINNING',
            'PEST_CONFIRMED','DISEASE_CONFIRMED','BIOLOGICAL_CONTROL_APPLIED','CROP_HEALTH_OBSERVATION',
            'STORAGE_LOGGED','STORAGE_CHECK',
            'CROP_SOLD','CROP_GIVEN',
            'INPUT_PURCHASED','INPUT_INVENTORY_CHECK','SEED_SAVED',
            'WORKER_CHECKOUT','WORKER_INCIDENT',
            'COMPLIANCE_INSPECTION','FIELD_INCIDENT'
        );
    """)

    # ──────────────────────────────────────────────────────────────
    # POST-REVERT — restore original catalog_group CHECK constraint
    # ──────────────────────────────────────────────────────────────
    # All LABOR/COMPLIANCE/OPERATIONS rows must be reverted to original
    # catalog_groups before this CHECK can be reapplied. Class B reverts
    # above already moved them; Class A DELETEs above already removed
    # the rows that were inserted INTO LABOR/COMPLIANCE/OPERATIONS.
    op.execute("ALTER TABLE shared.event_type_catalog DROP CONSTRAINT event_type_catalog_group_check;")
    op.execute("""
        ALTER TABLE shared.event_type_catalog ADD CONSTRAINT event_type_catalog_group_check
        CHECK (catalog_group = ANY (ARRAY[
            'CROPS','PERENNIALS','LIVESTOCK','POULTRY','APICULTURE',
            'AQUACULTURE','FORESTRY','SPECIALTY','MONEY','NOTES','OTHER','SYSTEM'
        ]));
    """)
