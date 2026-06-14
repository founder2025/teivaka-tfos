"""136 - Chat media messages (photo / video / voice notes)

Revision ID: 136_chat_media
Revises: 135_fix_field_event_verbs
Create Date: 2026-06-14

Slice 1 of the messaging upgrade: let a chat message carry media, not just
text. A farmer photographs pest damage to an agronomist, or records a voice
note in iTaukei to a buyer (low-literacy first-class path).

Adds to community.chat_messages:
  - message_type  TEXT  ('text'|'image'|'video'|'audio'|'card')  default 'text'
  - media_url     TEXT  (always one of our own /uploads URLs — app-validated)
  - media_meta    JSONB (name / bytes / duration — optional)

The old NOT-NULL + length(body) BETWEEN 1 AND 4000 inline CHECK is replaced:
a media message has no body, a text message still requires one. body stays
capped at 4000.

community.* is cross-tenant, no RLS (FKs to tenant.users). GRANTs already
held by teivaka_app from migration 091. asyncpg: one statement per
op.execute (Strike #72).
"""
from alembic import op

revision = "136_chat_media"
down_revision = "135_fix_field_event_verbs"
branch_labels = None
depends_on = None

_TYPES = "'text','image','video','audio','card'"

_CONTENT_CHECK = (
    "ALTER TABLE community.chat_messages ADD CONSTRAINT chat_messages_content_check CHECK ("
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
        "ALTER TABLE community.chat_messages ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text'",
        "ALTER TABLE community.chat_messages ADD COLUMN IF NOT EXISTS media_url TEXT",
        "ALTER TABLE community.chat_messages ADD COLUMN IF NOT EXISTS media_meta JSONB",
        "ALTER TABLE community.chat_messages ALTER COLUMN body DROP NOT NULL",
        # drop the old auto-named inline body check, then the new combined checks
        "ALTER TABLE community.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_body_check",
        "ALTER TABLE community.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_content_check",
        "ALTER TABLE community.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_type_check",
        f"ALTER TABLE community.chat_messages ADD CONSTRAINT chat_messages_type_check CHECK (message_type IN ({_TYPES}))",
        _CONTENT_CHECK,
    ])


def downgrade():
    _exec_each([
        "ALTER TABLE community.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_content_check",
        "ALTER TABLE community.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_type_check",
        "ALTER TABLE community.chat_messages DROP COLUMN IF EXISTS media_meta",
        "ALTER TABLE community.chat_messages DROP COLUMN IF EXISTS media_url",
        "ALTER TABLE community.chat_messages DROP COLUMN IF EXISTS message_type",
        # restore the original NOT NULL + length check
        "UPDATE community.chat_messages SET body = '(media)' WHERE body IS NULL",
        "ALTER TABLE community.chat_messages ALTER COLUMN body SET NOT NULL",
        "ALTER TABLE community.chat_messages ADD CONSTRAINT chat_messages_body_check CHECK (length(body) BETWEEN 1 AND 4000)",
    ])
