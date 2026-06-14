"""145 - Chat: reply-to-message

Revision ID: 145_chat_reply_to
Revises: 144_reseed_geo_regions
Create Date: 2026-06-14

Lets a 1:1 chat message quote/reply to a specific earlier message
(WhatsApp/Messenger style). Self-referential FK; SET NULL if the quoted
message is deleted. community.* is cross-tenant, no RLS. asyncpg: one statement
per op.execute (Strike #72).
"""
from alembic import op

revision = "145_chat_reply_to"
down_revision = "144_reseed_geo_regions"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        "ALTER TABLE community.chat_messages ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES community.chat_messages(message_id) ON DELETE SET NULL",
        "CREATE INDEX IF NOT EXISTS idx_chat_msg_reply ON community.chat_messages(reply_to_message_id)",
    ])


def downgrade():
    _exec_each([
        "ALTER TABLE community.chat_messages DROP COLUMN IF EXISTS reply_to_message_id",
    ])
