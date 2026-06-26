"""186 — Teivaka Jobs board: agri-sector employment marketplace

Any Teivaka member (farm owner, agri-business, supplier, processor, transporter,
extension org) posts JOB LISTINGS; any member sets a worker profile and applies.
On HIRE the accepted applicant can be dropped straight into the employer's Labour
page (tenant.workers) — jobs → hire → attendance → wages → Bank Evidence.

Mirrors the community.service_jobs pattern (178): global community.* tables, no RLS,
cross-tenant by design (a listing must be visible to other member tenants). Members-only,
free at alpha (no fee rail wired here). Ownership-guarded mutations live in the router.

Three tables:
  community.worker_profiles  — a member's job-seeker profile (skills, location, availability)
  community.job_listings     — a posted role (type, pay, location, positions, status)
  community.job_applications — a member's application to a listing (status lifecycle)

Additive/idempotent; reversible. Apply as owner (Strike #123).

Revision ID: 186_jobs_board
Revises: 185_demand_consolidation
"""
from alembic import op
import sqlalchemy as sa

revision = "186_jobs_board"
down_revision = "185_demand_consolidation"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS community.worker_profiles (
            user_id        UUID PRIMARY KEY,
            tenant_id      UUID NOT NULL,
            display_name   TEXT,
            skills         TEXT[] NOT NULL DEFAULT '{}',
            experience_note TEXT,
            location       TEXT,
            base_lat       NUMERIC(9,6),
            base_lng       NUMERIC(9,6),
            available_from DATE,
            desired_types  TEXT[] NOT NULL DEFAULT '{}',  -- CASUAL, PERMANENT, CONTRACT, SEASONAL, APPRENTICE
            phone          TEXT,
            whatsapp       TEXT,
            is_active      BOOLEAN NOT NULL DEFAULT true,
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS community.job_listings (
            listing_id        TEXT PRIMARY KEY,
            poster_tenant_id  UUID NOT NULL,
            poster_user_id    UUID NOT NULL,
            poster_org_name   TEXT,
            sector            TEXT,                          -- FARM_LABOUR, AGRIBUSINESS, SUPPLIER, PROCESSING, TRANSPORT, EXTENSION, OTHER
            role_title        TEXT NOT NULL,
            employment_type   TEXT NOT NULL DEFAULT 'CASUAL'
                              CHECK (employment_type IN ('CASUAL','PERMANENT','CONTRACT','SEASONAL','APPRENTICE')),
            positions         INTEGER NOT NULL DEFAULT 1,
            location          TEXT,
            region            TEXT,
            base_lat          NUMERIC(9,6),
            base_lng          NUMERIC(9,6),
            pay_rate_fjd      NUMERIC(12,2),
            pay_period        TEXT DEFAULT 'DAY'
                              CHECK (pay_period IN ('HOUR','DAY','WEEK','MONTH','PIECE','NEGOTIABLE')),
            pay_negotiable    BOOLEAN NOT NULL DEFAULT false,
            skills_required   TEXT[] NOT NULL DEFAULT '{}',
            experience_required TEXT,
            start_date        DATE,
            duration_note     TEXT,
            description       TEXT,
            apply_deadline    DATE,
            status            TEXT NOT NULL DEFAULT 'OPEN'
                              CHECK (status IN ('OPEN','CLOSED','FILLED')),
            created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_job_listings_status ON community.job_listings (status)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_job_listings_type ON community.job_listings (employment_type)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_job_listings_poster ON community.job_listings (poster_tenant_id)"))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS community.job_applications (
            application_id     TEXT PRIMARY KEY,
            listing_id         TEXT NOT NULL,
            applicant_tenant_id UUID NOT NULL,
            applicant_user_id  UUID NOT NULL,
            cover_note         TEXT,
            status             TEXT NOT NULL DEFAULT 'APPLIED'
                               CHECK (status IN ('APPLIED','SHORTLISTED','ACCEPTED','DECLINED','WITHDRAWN')),
            applied_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            decided_at         TIMESTAMPTZ,
            CONSTRAINT uq_job_app_once UNIQUE (listing_id, applicant_user_id)
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_job_apps_listing ON community.job_applications (listing_id)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_job_apps_applicant ON community.job_applications (applicant_user_id)"))

    conn.execute(sa.text("""
        DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON community.worker_profiles   TO teivaka_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON community.job_listings      TO teivaka_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON community.job_applications  TO teivaka_app;
        END IF; END $$
    """))


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS community.job_applications"))
    conn.execute(sa.text("DROP TABLE IF EXISTS community.job_listings"))
    conn.execute(sa.text("DROP TABLE IF EXISTS community.worker_profiles"))
