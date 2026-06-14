"""138 - Chat safety: blocks + reports

Revision ID: 138_chat_safety
Revises: 137_chat_reactions
Create Date: 2026-06-14

Slice 3 of the messaging upgrade — safety before scale.

  - community.chat_blocks  : A blocks B → B can't message A, neither sees the
    other in connections/presence. Symmetric enforcement in the app layer.
  - community.chat_reports : abuse reports (optionally tied to a message) for
    the moderation queue. status OPEN by default.

Mute is a client-side per-conversation preference (no schema). The chat
rate-limit and trust-ladder cold-DM gate are app-layer (no schema).

community.* is cross-tenant, no RLS (FKs to tenant.users). GRANT to
teivaka_app per B73. asyncpg: one statement per op.execute (Strike #72).
"""
from alembic import op

revision = "138_chat_safety"
down_revision = "137_chat_reactions"
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
        CREATE TABLE IF NOT EXISTS community.chat_blocks (
            blocker_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            blocked_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (blocker_user_id, blocked_user_id)
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_chat_blocks_blocked ON community.chat_blocks(blocked_user_id)",
        """
        CREATE TABLE IF NOT EXISTS community.chat_reports (
            report_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            reporter_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            reported_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            message_id       UUID REFERENCES community.chat_messages(message_id) ON DELETE SET NULL,
            reason           TEXT NOT NULL,
            status           TEXT NOT NULL DEFAULT 'OPEN',
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_chat_reports_status ON community.chat_reports(status, created_at DESC)",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.chat_blocks TO teivaka_app",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.chat_reports TO teivaka_app",
    ])


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS community.chat_reports",
        "DROP TABLE IF EXISTS community.chat_blocks",
    ])
