"""155 - FK on tenant.poultry_event_log.created_by -> tenant.users (operator anchor).

Revision ID: 155_poultry_created_by_fk
Revises: 154_users_rls_permissive
Create Date: 2026-06-21

Cluster 4.1 (data-quality anchors). poultry_event_log is the audit-bearing
polymorphic POULTRY event table. Every anchor on it is FK-constrained — tenant_id,
farm_id, pu_id, cycle_id, audit_event_id — EXCEPT created_by (UUID NOT NULL,
046:57), the operator anchor. So a garbage/orphan actor id could be written. This
adds the missing FK so the operator anchor is referentially enforced like the rest.

ON DELETE NO ACTION (RESTRICT, the default): created_by is NOT NULL, so SET NULL is
impossible; CASCADE would delete audit-bearing events when a user record is removed
(unacceptable). RESTRICT preserves the event trail — and users are soft-deleted via
is_active, not hard-deleted, so this never blocks normal ops.

Pre-verified on prod before stamping: 48 events, 0 orphaned created_by (the ADD
CONSTRAINT validates existing rows, so this is required). Apply as owner
(Strike #123). asyncpg: one statement per op.execute. rev id 25 chars (<= 32, B41).
"""
from alembic import op

revision = "155_poultry_created_by_fk"
down_revision = "154_users_rls_permissive"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        ALTER TABLE tenant.poultry_event_log
        ADD CONSTRAINT poultry_event_log_created_by_fk
        FOREIGN KEY (created_by) REFERENCES tenant.users(user_id)
        """
    )


def downgrade():
    op.execute(
        "ALTER TABLE tenant.poultry_event_log "
        "DROP CONSTRAINT IF EXISTS poultry_event_log_created_by_fk"
    )
