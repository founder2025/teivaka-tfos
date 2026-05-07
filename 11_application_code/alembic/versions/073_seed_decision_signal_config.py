"""Strike #112: Seed decision_signal_config (10 canonical signal rows).

Revision ID: 073_signal_config_seed
Revises: 072_layer_enum_seed
Create Date: 2026-05-07

Bug D.2 (Strike #112): tenant.decision_signal_config was empty across all tenants,
causing FK violation on every INSERT into decision_signal_snapshots.

Schema reality acknowledged: PK is (signal_id) alone, not composite. Tenant column
exists with FK to tenant.tenants but doesn't enforce per-tenant customization.
Table functions as a global referential anchor for snapshots; threshold values
live in Python SIGNAL_THRESHOLDS dict (decision_engine_worker.py).

This migration seeds 10 canonical signal rows anchored to the F001-A0EE
Save-A-Lot Farm tenant (pilot tenant with verified Phase 4.2 mission loop).

Schema-cleanup follow-up: Strike #113 backlog will compose PK to (signal_id,
tenant_id) + rewire snapshots FK + then enable proper per-tenant customization.
Until then this is the minimum viable seed.

Threshold values lossless-copied from decision_engine_worker.SIGNAL_THRESHOLDS
(threshold-source-of-truth dedup also deferred to follow-up).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '073_signal_config_seed'
down_revision = '072_layer_enum_seed'
branch_labels = None
depends_on = None


# Anchor tenant: F001-A0EE Save-A-Lot Farm (pilot). Schema PK is signal_id alone,
# so all 10 rows hang off this single tenant_id.
ANCHOR_TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'


SIGNAL_SEED = [
    # (signal_id, signal_name, signal_category, green_threshold, amber_threshold, red_threshold, threshold_direction)
    ('DS-001', 'Cost of Goods per Kg vs Market', 'financial',     0.80,  1.20,  None, 'LOWER_IS_BETTER'),
    ('DS-002', 'Cycle Inactivity Days',          'operational',   7,     14,    None, 'LOWER_IS_BETTER'),
    ('DS-003', 'Active Critical Alerts',         'compliance',    0,     2,     None, 'LOWER_IS_BETTER'),
    ('DS-004', 'Input Stock Adequacy %',         'operational',   80.0,  50.0,  None, 'HIGHER_IS_BETTER'),
    ('DS-005', 'Labor Cost Ratio %',             'financial',     40.0,  60.0,  None, 'LOWER_IS_BETTER'),
    ('DS-006', 'Accounts Receivable Days',       'financial',     30,    60,    None, 'LOWER_IS_BETTER'),
    ('DS-007', 'Harvest Yield Attainment %',     'productivity',  85.0,  70.0,  None, 'HIGHER_IS_BETTER'),
    ('DS-008', 'Cash Flow Months Runway',        'financial',     3.0,   1.0,   None, 'HIGHER_IS_BETTER'),
    ('DS-009', 'Rotation Compliance %',          'compliance',    90.0,  75.0,  None, 'HIGHER_IS_BETTER'),
    ('DS-010', 'Ferry Buffer Days (F002)',       'operational',   14,    7,     None, 'HIGHER_IS_BETTER'),
]


def upgrade() -> None:
    """Seed 10 canonical decision signal config rows.

    All rows anchored to a single tenant per the schema's signal_id-only PK.
    ON CONFLICT (signal_id) DO NOTHING makes the migration idempotent —
    re-running on a partially-seeded state is safe.
    """
    conn = op.get_bind()

    for sig in SIGNAL_SEED:
        sig_id, name, category, green, amber, red, direction = sig
        conn.execute(sa.text("""
            INSERT INTO tenant.decision_signal_config
                (signal_id, tenant_id, signal_name, signal_category,
                 green_threshold, amber_threshold, red_threshold, threshold_direction)
            VALUES
                (:sig_id, CAST(:tenant_id AS UUID), :name, :category,
                 :green, :amber, :red, :direction)
            ON CONFLICT (signal_id) DO NOTHING
        """), {
            'sig_id': sig_id,
            'tenant_id': ANCHOR_TENANT_ID,
            'name': name,
            'category': category,
            'green': green,
            'amber': amber,
            'red': red,
            'direction': direction,
        })


def downgrade() -> None:
    """Remove the seeded rows."""
    conn = op.get_bind()
    for sig in SIGNAL_SEED:
        sig_id = sig[0]
        conn.execute(sa.text("""
            DELETE FROM tenant.decision_signal_config
            WHERE signal_id = :sig_id
        """), {'sig_id': sig_id})
