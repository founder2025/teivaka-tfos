"""140 - Sponsor Corner: sponsored placements

Revision ID: 140_sponsor_placements
Revises: 139_group_chat
Create Date: 2026-06-14

A right-rail "Sponsor Corner" on Home where organisations run clearly-labelled
sponsored placements. Admin-managed (create/schedule/activate); impressions +
clicks tracked per placement so it can be billed later. community.* is
cross-tenant, no RLS. GRANT to teivaka_app per B73. asyncpg: one statement per
op.execute (Strike #72).
"""
from alembic import op

revision = "140_sponsor_placements"
down_revision = "139_group_chat"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        """
        CREATE TABLE IF NOT EXISTS community.sponsor_placements (
            placement_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sponsor_name    TEXT NOT NULL,
            sponsor_logo    TEXT,
            title           TEXT NOT NULL,
            blurb           TEXT,
            image_url       TEXT,
            cta_label       TEXT,
            cta_url         TEXT,
            placement_type  TEXT NOT NULL DEFAULT 'STANDARD',
            priority        INTEGER NOT NULL DEFAULT 0,
            target_country  TEXT,
            target_vertical TEXT,
            starts_at       TIMESTAMPTZ,
            ends_at         TIMESTAMPTZ,
            status          TEXT NOT NULL DEFAULT 'ACTIVE',
            impressions     BIGINT NOT NULL DEFAULT 0,
            clicks          BIGINT NOT NULL DEFAULT 0,
            created_by      UUID REFERENCES tenant.users(user_id) ON DELETE SET NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "ALTER TABLE community.sponsor_placements ADD CONSTRAINT sponsor_placements_status_check CHECK (status IN ('ACTIVE','PAUSED','ENDED'))",
        "CREATE INDEX IF NOT EXISTS idx_sponsor_active ON community.sponsor_placements(status, priority DESC)",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.sponsor_placements TO teivaka_app",
    ])


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS community.sponsor_placements",
    ])
