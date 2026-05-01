"""Drop stale audit.events CHECK constraint audit_events_event_type_valid.

Background: audit.events accumulated TWO CHECK constraints over the project's
history — the older audit_events_event_type_valid (from initial schema) and the
newer events_event_type_check (added by a Sprint 5 migration). Postgres enforces
the intersection of all CHECKs, which means new event types added to the newer
constraint were silently blocked by the older constraint.

This migration removes the stale older constraint. The newer events_event_type_check
(rebuilt by Migration 043 to include all 38 new POULTRY/LIBRARY event types plus
pre-existing ones) is the canonical source going forward.

Procedural learnings filed:
1. Future migrations that touch audit.events CHECK must verify constraint NAMES
   via \\d audit.events or pg_constraint catalog, not just pg_get_constraintdef
   definitions. Caught at Phase 6.1a verify-time after Migration 043's
   DROP IF EXISTS was a no-op (wrong name).
2. Revision IDs must fit tenant.alembic_version.version_num (varchar(32)).
   Original ID '045_drop_stale_audit_events_check' was 33 chars and rejected.
   Shortened to '045_drop_stale_audit_check' (26 chars).

Revision ID: 045_drop_stale_audit_check
Revises: 044_polymorphic_farm_libraries
Create Date: 2026-05-01
"""

from alembic import op

revision = '045_drop_stale_audit_check'
down_revision = '044_polymorphic_farm_libraries'
branch_labels = None
depends_on = None


def upgrade():
    # Drop the stale constraint. The newer events_event_type_check
    # (rebuilt in Migration 043 with full event_type catalog) remains
    # as the canonical source.
    op.execute("ALTER TABLE audit.events DROP CONSTRAINT IF EXISTS audit_events_event_type_valid;")


def downgrade():
    # Intentional no-op. The stale constraint was redundant with the newer one
    # and recreating it would re-block any event_type added after the constraint
    # was originally written. Future schema work should NOT recreate this.
    pass
