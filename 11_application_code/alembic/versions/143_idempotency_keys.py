"""143 - Idempotency keys (offline-safe event replays)

Revision ID: 143_idempotency_keys
Revises: 142_user_multirole
Create Date: 2026-06-14

Offline-first: when a device loses signal, event submissions are queued client-
side and replayed on reconnect. Each submission carries a client idempotency_key
so a replay (or a double-tap) returns the original result instead of creating a
duplicate event. This table stores the first response per (tenant, key).

RLS-scoped like every tenant.* table (Inviolable #11). tenant.* runs as owner
(Strike #123). asyncpg: one statement per op.execute (Strike #72).
"""
from alembic import op

revision = "143_idempotency_keys"
down_revision = "142_user_multirole"
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
        CREATE TABLE IF NOT EXISTS tenant.idempotency_keys (
            tenant_id       UUID NOT NULL,
            idempotency_key TEXT NOT NULL,
            user_id         UUID,
            response_json   JSONB,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (tenant_id, idempotency_key)
        )
        """,
        "ALTER TABLE tenant.idempotency_keys ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE tenant.idempotency_keys FORCE ROW LEVEL SECURITY",
        "DROP POLICY IF EXISTS idempotency_keys_tenant_isolation ON tenant.idempotency_keys",
        """
        CREATE POLICY idempotency_keys_tenant_isolation ON tenant.idempotency_keys
            USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
            WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
        """,
        "GRANT SELECT, INSERT ON tenant.idempotency_keys TO teivaka_app",
    ])


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS tenant.idempotency_keys",
    ])
