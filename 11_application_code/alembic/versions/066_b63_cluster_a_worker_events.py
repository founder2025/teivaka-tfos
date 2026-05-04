"""B63 Cluster A: WORKER_PAID -> MONEY, WORKER_TASK_DONE -> OTHER

Strike #93. Catalog group realignment for cross-pillar labor events
incorrectly filed under POULTRY (WEIGHT_CHECK / Strike #92 pattern).

Three drift classes from B63 recon:
1. CLEAR drift (cross-pillar event in single-pillar bucket) -> fix here
2. JUDGMENT drift (cross-pillar event in OTHER) -> leave; OTHER is the deliberate cross-pillar bucket
3. FALSE POSITIVE (SYSTEM meta-events flagged by prefix-only heuristic) -> exclude from sweep

Revision ID: 066_b63_cluster_a
Revises: 065_weight_check_to_poultry
Create Date: 2026-05-04
"""
from alembic import op

revision = '066_b63_cluster_a'
down_revision = '065_weight_check_to_poultry'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        UPDATE shared.event_type_catalog
        SET catalog_group = 'MONEY',
            sort_order = (SELECT COALESCE(MAX(sort_order), 0) + 10
                          FROM shared.event_type_catalog
                          WHERE catalog_group = 'MONEY')
        WHERE event_type = 'WORKER_PAID'
          AND catalog_group = 'POULTRY';
    """)
    op.execute("""
        UPDATE shared.event_type_catalog
        SET catalog_group = 'OTHER',
            sort_order = (SELECT COALESCE(MAX(sort_order), 0) + 10
                          FROM shared.event_type_catalog
                          WHERE catalog_group = 'OTHER')
        WHERE event_type = 'WORKER_TASK_DONE'
          AND catalog_group = 'POULTRY';
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE shared.event_type_catalog
        SET catalog_group = 'POULTRY', sort_order = 34
        WHERE event_type = 'WORKER_PAID';
    """)
    op.execute("""
        UPDATE shared.event_type_catalog
        SET catalog_group = 'POULTRY', sort_order = 35
        WHERE event_type = 'WORKER_TASK_DONE';
    """)
