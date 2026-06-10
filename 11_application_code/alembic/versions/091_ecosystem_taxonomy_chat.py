"""091 - Ecosystem: profession taxonomy + market country gating + chat

Revision ID: 091_ecosystem_taxonomy_chat
Revises: 090_feed_gating_notifications
Create Date: 2026-06-10

Phase 0/1/2 of the social ecosystem:
  - tenant.users.account_type CHECK widened to the 8-profession taxonomy
    (FARMER, BUYER, SUPPLIER, SERVICE_PROVIDER, BANKER, BUSINESS, EXPORTER, IMPORTER);
    legacy 'OTHER' migrated to 'BUSINESS'.
  - community.feed_posts.audience CHECK widened to include the new professions.
  - country added to community.price/demand/supply (marketplace country wall),
    backfilled from the owning tenant.
  - community.chat_threads + chat_messages (1:1 DMs; connection-gated in app layer).

tenant.* edits run as owner (Strike #123 runbook). community.* is cross-tenant, no RLS.
asyncpg: one statement per op.execute (Strike #72). GRANTs to teivaka_app (B73).
"""
from alembic import op

revision = "091_ecosystem_taxonomy_chat"
down_revision = "090_feed_gating_notifications"
branch_labels = None
depends_on = None

_PROFS = "'FARMER','BUYER','SUPPLIER','SERVICE_PROVIDER','BANKER','BUSINESS','EXPORTER','IMPORTER'"
_AUDIENCES = "'everyone','followers','farmer','buyer','supplier','service_provider','banker','business','exporter','importer'"


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        # ---- profession taxonomy ----------------------------------------
        "UPDATE tenant.users SET account_type = 'BUSINESS' WHERE account_type = 'OTHER'",
        "ALTER TABLE tenant.users DROP CONSTRAINT IF EXISTS users_account_type_check",
        f"ALTER TABLE tenant.users ADD CONSTRAINT users_account_type_check CHECK (account_type IN ({_PROFS}))",

        # ---- feed audience taxonomy -------------------------------------
        "ALTER TABLE community.feed_posts DROP CONSTRAINT IF EXISTS feed_posts_audience_check",
        f"ALTER TABLE community.feed_posts ADD CONSTRAINT feed_posts_audience_check CHECK (audience IN ({_AUDIENCES}))",

        # ---- market country wall ----------------------------------------
        "ALTER TABLE community.price_records ADD COLUMN IF NOT EXISTS country TEXT",
        "ALTER TABLE community.demand_records ADD COLUMN IF NOT EXISTS country TEXT",
        "ALTER TABLE community.supply_forecasts ADD COLUMN IF NOT EXISTS country TEXT",
        "UPDATE community.price_records pr SET country = t.country FROM tenant.tenants t WHERE t.tenant_id = pr.tenant_id AND pr.country IS NULL",
        "UPDATE community.demand_records d SET country = t.country FROM tenant.tenants t WHERE t.tenant_id = d.tenant_id AND d.country IS NULL",
        "UPDATE community.supply_forecasts s SET country = t.country FROM tenant.tenants t WHERE t.tenant_id = s.tenant_id AND s.country IS NULL",

        # ---- chat -------------------------------------------------------
        # 1:1 thread keyed by an ordered user pair (user_lo < user_hi) so a pair has
        # exactly one thread regardless of who opens it.
        """
        CREATE TABLE IF NOT EXISTS community.chat_threads (
            thread_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_lo       UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            user_hi       UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_message_at TIMESTAMPTZ,
            CHECK (user_lo < user_hi),
            UNIQUE (user_lo, user_hi)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS community.chat_messages (
            message_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            thread_id      UUID NOT NULL REFERENCES community.chat_threads(thread_id) ON DELETE CASCADE,
            sender_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            body           TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            read_at        TIMESTAMPTZ
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_chat_msg_thread ON community.chat_messages(thread_id, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_chat_threads_lo ON community.chat_threads(user_lo, last_message_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_chat_threads_hi ON community.chat_threads(user_hi, last_message_at DESC)",

        # ---- GRANTs -----------------------------------------------------
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.chat_threads TO teivaka_app",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON community.chat_messages TO teivaka_app",
    ])


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS community.chat_messages",
        "DROP TABLE IF EXISTS community.chat_threads",
        "ALTER TABLE community.supply_forecasts DROP COLUMN IF EXISTS country",
        "ALTER TABLE community.demand_records DROP COLUMN IF EXISTS country",
        "ALTER TABLE community.price_records DROP COLUMN IF EXISTS country",
    ])
