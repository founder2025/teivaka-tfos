"""137 - Chat message reactions

Revision ID: 137_chat_reactions
Revises: 136_chat_media
Create Date: 2026-06-14

Slice 2 of the messaging upgrade. One reaction per user per message
(emoji stored directly; app validates against a small allowed set). Replacing
a reaction is an upsert; removing is a delete. Read receipts ("Seen") reuse
the existing chat_messages.read_at, and the typing indicator is ephemeral in
Redis — neither needs schema, so this migration only adds reactions.

community.* is cross-tenant, no RLS (FKs to tenant.users). GRANT to
teivaka_app per B73. asyncpg: one statement per op.execute (Strike #72).
"""
from alembic import op

revision = "137_chat_reactions"
down_revision = "136_chat_media"
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
        CREATE TABLE IF NOT EXISTS community.chat_reactions (
            message_id UUID NOT NULL REFERENCES community.chat_messages(message_id) ON DELETE CASCADE,
            user_id    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            emoji      TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (message_id, user_id)
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_chat_reactions_msg ON community.chat_reactions(message_id)",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.chat_reactions TO teivaka_app",
    ])


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS community.chat_reactions",
    ])
