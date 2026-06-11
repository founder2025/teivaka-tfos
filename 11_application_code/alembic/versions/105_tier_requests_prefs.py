"""105 - Tier change requests + notification preferences

community.tier_change_requests: honest tier switching with NO payment rail —
the user requests, admin approves (which sets tenant.tenants.subscription_tier),
nothing is ever charged in-app. Lives in community schema (cross-tenant,
admin-readable) per the KYC verification_requests pattern. Replaces the
phantom tenant.upgrade_requests that subscriptions.py referenced but no
migration ever created.

tenant.users notification prefs back the Settings page's prototype toggles.
"""
from alembic import op

revision = "105_tier_requests_prefs"
down_revision = "104_groups"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS community.tier_change_requests (
        request_id   TEXT PRIMARY KEY,
        tenant_id    UUID NOT NULL,
        user_id      UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        current_tier TEXT NOT NULL,
        target_tier  TEXT NOT NULL,
        billing_period TEXT NOT NULL DEFAULT 'MONTHLY',
        payment_method TEXT,
        notes        TEXT,
        status       TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
        reason       TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        decided_at   TIMESTAMPTZ,
        decided_by   UUID
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_tier_requests_status ON community.tier_change_requests(status, created_at)",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON community.tier_change_requests TO teivaka_app",
    "ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS notify_whatsapp BOOLEAN NOT NULL DEFAULT true",
    "ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS notify_tasks BOOLEAN NOT NULL DEFAULT true",
    "ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS notify_weather BOOLEAN NOT NULL DEFAULT true",
]


def upgrade():
    _exec_each(STATEMENTS)


def downgrade():
    _exec_each([
        "ALTER TABLE tenant.users DROP COLUMN IF EXISTS notify_weather",
        "ALTER TABLE tenant.users DROP COLUMN IF EXISTS notify_tasks",
        "ALTER TABLE tenant.users DROP COLUMN IF EXISTS notify_whatsapp",
        "DROP TABLE IF EXISTS community.tier_change_requests",
    ])
