"""Convert tenant.poultry_event_log.flock_id from UUID to TEXT + add FK to tenant.flocks.

Phase 6.2-1 created poultry_event_log.flock_id as UUID nullable (placeholder).
Phase 6.2-2 confirmed flock_id is TEXT (Strike #21). This migration:
1. Drops the existing flock_id column (UUID, no data yet — table empty of flock-tagged rows)
2. Re-adds it as TEXT with FK to tenant.flocks.flock_id
3. Recreates the index that depended on it (none currently — flock_id has no index in 046)

Safe because:
- Phase 6.2-1 had no FK on flock_id (deferred to this migration)
- poultry_event_log has 1 smoke-test row with flock_id=NULL — column drop+recreate preserves NULLs
- Existing index on (tenant_id, pu_id) does not reference flock_id

Revision ID: 048_flock_fk_to_event_log
Revises: 047_flocks_entity
Create Date: 2026-05-01
"""

from alembic import op
import sqlalchemy as sa

revision = '048_flock_fk_to_event_log'
down_revision = '047_flocks_entity'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # 1. Drop the UUID flock_id column (no FK existed; safe drop)
    conn.execute(sa.text("""
        ALTER TABLE tenant.poultry_event_log DROP COLUMN flock_id;
    """))

    # 2. Re-add as TEXT with FK to tenant.flocks.flock_id
    conn.execute(sa.text("""
        ALTER TABLE tenant.poultry_event_log
        ADD COLUMN flock_id TEXT REFERENCES tenant.flocks(flock_id);
    """))

    # 3. Index for queries filtering by flock
    conn.execute(sa.text("""
        CREATE INDEX idx_poultry_event_log_flock
        ON tenant.poultry_event_log (tenant_id, flock_id, occurred_at DESC)
        WHERE flock_id IS NOT NULL;
    """))


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DROP INDEX IF EXISTS idx_poultry_event_log_flock;"))
    conn.execute(sa.text("ALTER TABLE tenant.poultry_event_log DROP COLUMN flock_id;"))
    conn.execute(sa.text("ALTER TABLE tenant.poultry_event_log ADD COLUMN flock_id UUID;"))
