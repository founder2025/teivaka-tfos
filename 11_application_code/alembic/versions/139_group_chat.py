"""139 - Group chat (realtime room per community.group)

Revision ID: 139_group_chat
Revises: 138_chat_safety
Create Date: 2026-06-14

Slice 5 of the messaging upgrade. Group chat is a realtime room layered onto
the EXISTING community.groups + community.group_members (no parallel grouping
concept). Members of a group can chat with text / photo / video / voice;
fan-out to members reuses the per-user SSE channels from Slice 4.

  - community.group_messages : one row per group message, same media model as
    the 1:1 chat_messages (message_type / media_url / media_meta; body
    nullable; combined content CHECK).

Member-gating, rate-limit and the SSE fan-out are app-layer. community.* is
cross-tenant, no RLS. GRANT to teivaka_app per B73. asyncpg: one statement per
op.execute (Strike #72).
"""
from alembic import op

revision = "139_group_chat"
down_revision = "138_chat_safety"
branch_labels = None
depends_on = None

_CONTENT_CHECK = (
    "ALTER TABLE community.group_messages ADD CONSTRAINT group_messages_content_check CHECK ("
    " (message_type = 'text' AND body IS NOT NULL AND length(body) BETWEEN 1 AND 4000)"
    " OR (message_type <> 'text' AND media_url IS NOT NULL AND (body IS NULL OR length(body) <= 4000))"
    ")"
)


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        """
        CREATE TABLE IF NOT EXISTS community.group_messages (
            message_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            group_id       TEXT NOT NULL REFERENCES community.groups(group_id) ON DELETE CASCADE,
            sender_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            body           TEXT,
            message_type   TEXT NOT NULL DEFAULT 'text',
            media_url      TEXT,
            media_meta     JSONB,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_group_messages_grp ON community.group_messages(group_id, created_at)",
        "ALTER TABLE community.group_messages ADD CONSTRAINT group_messages_type_check CHECK (message_type IN ('text','image','video','audio','card'))",
        _CONTENT_CHECK,
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.group_messages TO teivaka_app",
    ])


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS community.group_messages",
    ])
