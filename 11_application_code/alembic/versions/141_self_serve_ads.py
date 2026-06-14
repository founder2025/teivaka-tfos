"""141 - Self-serve paid ads (extend Sponsor Corner)

Revision ID: 141_self_serve_ads
Revises: 140_sponsor_placements
Create Date: 2026-06-14

Extends community.sponsor_placements (NOT a fork) so any profile can run its own
clearly-labelled paid ad, monetised by flat duration (daily/weekly/monthly,
admin-configurable rates). Adds the ownership + billing + lifecycle + surface
columns that are the load-bearing foundation, plus a community.ad_rates config
table (rates are data, never hardcoded).

Activation gate: an ad only serves when status='ACTIVE' AND payment_status IN
('PAID','WAIVED') AND (paid_through IS NULL OR paid_through >= now). Existing
admin-created rows are back-filled to WAIVED so they keep showing.

community.* is cross-tenant, no RLS. GRANT to teivaka_app (B73). asyncpg: one
statement per op.execute (Strike #72).
"""
from alembic import op

revision = "141_self_serve_ads"
down_revision = "140_sponsor_placements"
branch_labels = None
depends_on = None

_STATUSES = "'DRAFT','PENDING_REVIEW','APPROVED','REJECTED','PENDING_PAYMENT','ACTIVE','PAUSED','ENDED'"


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        # --- ownership + billing + lifecycle + surface on the existing table ---
        "ALTER TABLE community.sponsor_placements ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES tenant.users(user_id) ON DELETE CASCADE",
        "ALTER TABLE community.sponsor_placements ADD COLUMN IF NOT EXISTS surface TEXT NOT NULL DEFAULT 'HOME_RAIL'",
        "ALTER TABLE community.sponsor_placements ADD COLUMN IF NOT EXISTS billing_period TEXT NOT NULL DEFAULT 'NONE'",
        "ALTER TABLE community.sponsor_placements ADD COLUMN IF NOT EXISTS price_fjd NUMERIC(12,2)",
        "ALTER TABLE community.sponsor_placements ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'WAIVED'",
        "ALTER TABLE community.sponsor_placements ADD COLUMN IF NOT EXISTS payment_ref TEXT",
        "ALTER TABLE community.sponsor_placements ADD COLUMN IF NOT EXISTS paid_through TIMESTAMPTZ",
        "ALTER TABLE community.sponsor_placements ADD COLUMN IF NOT EXISTS review_note TEXT",
        # widen the status state-machine
        "ALTER TABLE community.sponsor_placements DROP CONSTRAINT IF EXISTS sponsor_placements_status_check",
        f"ALTER TABLE community.sponsor_placements ADD CONSTRAINT sponsor_placements_status_check CHECK (status IN ({_STATUSES}))",
        "ALTER TABLE community.sponsor_placements DROP CONSTRAINT IF EXISTS sponsor_placements_payment_check",
        "ALTER TABLE community.sponsor_placements ADD CONSTRAINT sponsor_placements_payment_check CHECK (payment_status IN ('UNPAID','PAID','WAIVED'))",
        "ALTER TABLE community.sponsor_placements DROP CONSTRAINT IF EXISTS sponsor_placements_period_check",
        "ALTER TABLE community.sponsor_placements ADD CONSTRAINT sponsor_placements_period_check CHECK (billing_period IN ('NONE','DAILY','WEEKLY','MONTHLY'))",
        "CREATE INDEX IF NOT EXISTS idx_sponsor_owner ON community.sponsor_placements(owner_user_id, created_at DESC)",
        # --- admin-configurable rate card ---
        """
        CREATE TABLE IF NOT EXISTS community.ad_rates (
            rate_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            surface        TEXT NOT NULL DEFAULT 'HOME_RAIL',
            billing_period TEXT NOT NULL CHECK (billing_period IN ('DAILY','WEEKLY','MONTHLY')),
            price_fjd      NUMERIC(12,2) NOT NULL,
            active         BOOLEAN NOT NULL DEFAULT true,
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (surface, billing_period)
        )
        """,
        # seed sensible defaults (Operator can edit in admin)
        "INSERT INTO community.ad_rates (surface, billing_period, price_fjd) VALUES ('HOME_RAIL','DAILY',5.00) ON CONFLICT (surface, billing_period) DO NOTHING",
        "INSERT INTO community.ad_rates (surface, billing_period, price_fjd) VALUES ('HOME_RAIL','WEEKLY',28.00) ON CONFLICT (surface, billing_period) DO NOTHING",
        "INSERT INTO community.ad_rates (surface, billing_period, price_fjd) VALUES ('HOME_RAIL','MONTHLY',90.00) ON CONFLICT (surface, billing_period) DO NOTHING",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.ad_rates TO teivaka_app",
    ])


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS community.ad_rates",
        "ALTER TABLE community.sponsor_placements DROP CONSTRAINT IF EXISTS sponsor_placements_period_check",
        "ALTER TABLE community.sponsor_placements DROP CONSTRAINT IF EXISTS sponsor_placements_payment_check",
        "ALTER TABLE community.sponsor_placements DROP COLUMN IF EXISTS review_note",
        "ALTER TABLE community.sponsor_placements DROP COLUMN IF EXISTS paid_through",
        "ALTER TABLE community.sponsor_placements DROP COLUMN IF EXISTS payment_ref",
        "ALTER TABLE community.sponsor_placements DROP COLUMN IF EXISTS payment_status",
        "ALTER TABLE community.sponsor_placements DROP COLUMN IF EXISTS price_fjd",
        "ALTER TABLE community.sponsor_placements DROP COLUMN IF EXISTS billing_period",
        "ALTER TABLE community.sponsor_placements DROP COLUMN IF EXISTS surface",
        "ALTER TABLE community.sponsor_placements DROP COLUMN IF EXISTS owner_user_id",
    ])
