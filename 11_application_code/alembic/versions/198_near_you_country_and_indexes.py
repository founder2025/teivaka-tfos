"""198 - Near You: country gate on jobs/services + composite live/geo indexes

Backs the read-only /api/v1/near-you aggregation (audit Slice 1).

WHY country: community.job_listings + service_jobs are cross-tenant but had NO country
column, so they were globe-wide — a cross-country leak the moment a 2nd country onboards.
Add `country`, backfill from the poster/requester tenant (mirrors migration 091's
demand/price backfill), and the feed gates `country = viewer OR NULL`. The owning POST
routers must also set `country` going forward (router change ships with this slice).

WHY plain CREATE INDEX (not CONCURRENTLY): Alembic runs migrations inside a transaction
and Postgres forbids CREATE INDEX CONCURRENTLY in a txn. At alpha row counts a plain
build's brief lock is fine (this mirrors 167_geo_indexes). RUNBOOK: at large scale,
re-create these CONCURRENTLY outside a txn. Apply as the `teivaka` owner (Strike #123);
one statement per op.execute (asyncpg, Strike #72). Fully reversible.
"""
from alembic import op

revision = "198_near_you_country_and_indexes"
down_revision = "197_location_optin_default"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        op.execute(s)


def upgrade():
    _exec_each([
        # 1-2: add country (idempotent)
        "ALTER TABLE community.job_listings ADD COLUMN IF NOT EXISTS country TEXT",
        "ALTER TABLE community.service_jobs ADD COLUMN IF NOT EXISTS country TEXT",
        # 3-4: backfill from the owning tenant (same pattern as 091 for demand/price)
        "UPDATE community.job_listings jl SET country = t.country "
        "FROM tenant.tenants t WHERE t.tenant_id = jl.poster_tenant_id AND jl.country IS NULL",
        "UPDATE community.service_jobs sj SET country = t.country "
        "FROM tenant.tenants t WHERE t.tenant_id = sj.requester_tenant_id AND sj.country IS NULL",
        # 5-9: composite live + partial geo indexes backing the feed's WHERE/ORDER BY
        "CREATE INDEX IF NOT EXISTS ix_job_listings_live ON community.job_listings (status, apply_deadline)",
        "CREATE INDEX IF NOT EXISTS ix_job_listings_geo ON community.job_listings (base_lat, base_lng) WHERE status = 'OPEN'",
        "CREATE INDEX IF NOT EXISTS ix_service_jobs_live ON community.service_jobs (status, service_type)",
        "CREATE INDEX IF NOT EXISTS ix_service_jobs_geo ON community.service_jobs (pickup_lat, pickup_lng) WHERE status = 'OPEN'",
        "CREATE INDEX IF NOT EXISTS ix_demand_records_live ON community.demand_records (country, status, required_by)",
    ])


def downgrade():
    _exec_each([
        "DROP INDEX IF EXISTS community.ix_demand_records_live",
        "DROP INDEX IF EXISTS community.ix_service_jobs_geo",
        "DROP INDEX IF EXISTS community.ix_service_jobs_live",
        "DROP INDEX IF EXISTS community.ix_job_listings_geo",
        "DROP INDEX IF EXISTS community.ix_job_listings_live",
        "ALTER TABLE community.service_jobs DROP COLUMN IF EXISTS country",
        "ALTER TABLE community.job_listings DROP COLUMN IF EXISTS country",
    ])
