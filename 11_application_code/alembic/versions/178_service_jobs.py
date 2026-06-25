"""178 — service-job engine: connect the ecosystem (transport + cold storage)

When a sale risks spoilage because the farmer has no transport/storage, the gap
becomes a JOB that nearby service providers (LOGISTICS_OPERATOR accounts) see and
claim. On completion it's a 5% Services-marketplace fee (rail from migration 177).
Generalises to input delivery, machinery, tools — any ecosystem gap.

Two global tables (community.* — no RLS, cross-tenant by design: a farmer's job
must be visible to provider tenants):
  community.service_provider_profiles — who provides what + where (for nearby match)
  community.service_jobs              — the gap to fill, claim + completion state

Additive/idempotent; reversible. Apply as owner (Strike #123).

Revision ID: 178_service_jobs
Revises: 177_marketplace_fees
"""
from alembic import op
import sqlalchemy as sa

revision = "178_service_jobs"
down_revision = "177_marketplace_fees"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS community.service_provider_profiles (
            user_id          UUID PRIMARY KEY,
            tenant_id        UUID NOT NULL,
            display_name     TEXT,
            service_types    TEXT[] NOT NULL DEFAULT '{}',   -- TRANSPORT, COLD_STORAGE, ...
            base_location    TEXT,
            base_lat         NUMERIC(9,6),
            base_lng         NUMERIC(9,6),
            service_radius_km INTEGER NOT NULL DEFAULT 25,
            capacity_note    TEXT,
            phone            TEXT,
            is_active        BOOLEAN NOT NULL DEFAULT true,
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS community.service_jobs (
            job_id              TEXT PRIMARY KEY,
            service_type        TEXT NOT NULL,               -- TRANSPORT | COLD_STORAGE | ...
            status              TEXT NOT NULL DEFAULT 'OPEN'
                                CHECK (status IN ('OPEN','CLAIMED','COMPLETED','CANCELLED')),
            requester_tenant_id UUID NOT NULL,
            requester_user_id   UUID NOT NULL,
            farm_id             TEXT,
            order_id            TEXT,                        -- optional link to the sale
            title               TEXT NOT NULL,
            produce_desc        TEXT,
            quantity_kg         NUMERIC(12,2),
            pickup_location     TEXT,
            pickup_lat          NUMERIC(9,6),
            pickup_lng          NUMERIC(9,6),
            dropoff_location    TEXT,
            dropoff_lat         NUMERIC(9,6),
            dropoff_lng         NUMERIC(9,6),
            needed_by           TIMESTAMPTZ,
            budget_fjd          NUMERIC(12,2),
            notes               TEXT,
            claimed_by_user_id   UUID,
            claimed_by_tenant_id UUID,
            claimed_at          TIMESTAMPTZ,
            agreed_price_fjd    NUMERIC(12,2),
            completed_at        TIMESTAMPTZ,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_service_jobs_status ON community.service_jobs (status)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_service_jobs_type ON community.service_jobs (service_type)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_service_jobs_requester ON community.service_jobs (requester_tenant_id)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_service_jobs_claimer ON community.service_jobs (claimed_by_user_id)"))

    conn.execute(sa.text("""
        DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON community.service_provider_profiles TO teivaka_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON community.service_jobs              TO teivaka_app;
        END IF; END $$
    """))


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS community.service_jobs"))
    conn.execute(sa.text("DROP TABLE IF EXISTS community.service_provider_profiles"))
