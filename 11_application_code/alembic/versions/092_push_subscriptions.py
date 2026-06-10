"""092 - Web Push subscriptions

Revision ID: 092_push_subscriptions
Revises: 091_ecosystem_taxonomy_chat
Create Date: 2026-06-10

Stores browser Web Push subscriptions so the backend can deliver OS notifications for
new chat messages even when the tab/app is closed. Cross-tenant community.* (no RLS).
GRANT to teivaka_app (B73); one statement per op.execute (Strike #72).
"""
from alembic import op

revision = "092_push_subscriptions"
down_revision = "091_ecosystem_taxonomy_chat"
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
        CREATE TABLE IF NOT EXISTS community.push_subscriptions (
            subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id         UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            endpoint        TEXT NOT NULL UNIQUE,
            p256dh          TEXT NOT NULL,
            auth            TEXT NOT NULL,
            user_agent      TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_push_subs_user ON community.push_subscriptions(user_id)",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.push_subscriptions TO teivaka_app",
    ])


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS community.push_subscriptions",
    ])
