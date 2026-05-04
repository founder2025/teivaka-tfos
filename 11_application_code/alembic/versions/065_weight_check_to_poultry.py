"""Strike #92 close-out continuation: move WEIGHT_CHECK from LIVESTOCK to POULTRY catalog.

Migration 064 attempted INSERT but hit ON CONFLICT DO NOTHING — WEIGHT_CHECK already existed
in LIVESTOCK group from earlier seed migration. 065 does the UPDATE instead.

Audit: WEIGHT_CHECK has 1 historical row in audit.events from a test tenant on 2026-05-02.
No production-data continuity impact (audit.events stores event_type, not catalog_group).

Code alignment: events.py validation requires flock_id (poultry concept), LogSheet.jsx routes
to /farm/poultry/weight/new, form file at frontend/src/pages/farmer/poultry/WeightCheckNew.jsx.
Catalog was the lone outlier; 065 brings catalog into alignment with code.

Revision ID: 065_weight_check_to_poultry
Revises: 064_weight_check_poultry_orphan
"""
from alembic import op

revision = '065_weight_check_to_poultry'
down_revision = '064_weight_check_poultry_orphan'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        UPDATE shared.event_type_catalog
        SET catalog_group='POULTRY', sort_order=450
        WHERE event_type='WEIGHT_CHECK';
    """)


def downgrade():
    op.execute("""
        UPDATE shared.event_type_catalog
        SET catalog_group='LIVESTOCK', sort_order=40
        WHERE event_type='WEIGHT_CHECK';
    """)
