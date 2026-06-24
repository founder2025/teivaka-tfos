"""169 — tenant.push_devices: native push notification device tokens

Device side of native push (Capacitor PushNotifications). Each native app install
registers its APNs/FCM token here, scoped to the authenticated tenant + user, so a
future sender (credential-gated APNs/FCM worker) can target a farmer's devices.

The SEND side is intentionally NOT in this migration — it needs APNs/FCM keys and a
dispatch worker. This is the storage + registration scaffolding only.

Additive + reversible. Apply as owner (Strike #123). RLS mirrors every sibling
tenant.* table (FORCE + tenant_id isolation). Unique (tenant_id, token) supports the
idempotent upsert in routers/push.py.

Revision ID: 169_push_devices
Revises: 168_feed_post_type_activities
"""
from alembic import op
import sqlalchemy as sa

revision = "169_push_devices"
down_revision = "168_feed_post_type_activities"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS tenant.push_devices (
            device_id    TEXT PRIMARY KEY,
            tenant_id    UUID NOT NULL,
            user_id      UUID NOT NULL,
            token        TEXT NOT NULL,
            platform     TEXT NOT NULL DEFAULT 'unknown',
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_push_devices_tenant_token "
        "ON tenant.push_devices (tenant_id, token)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_push_devices_user "
        "ON tenant.push_devices (tenant_id, user_id)"
    ))
    conn.execute(sa.text("ALTER TABLE tenant.push_devices ENABLE ROW LEVEL SECURITY"))
    conn.execute(sa.text("ALTER TABLE tenant.push_devices FORCE ROW LEVEL SECURITY"))
    conn.execute(sa.text("""
        CREATE POLICY push_devices_tenant_isolation ON tenant.push_devices
            USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    """))
    conn.execute(sa.text("""
        DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.push_devices TO teivaka_app;
        END IF; END $$
    """))


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DROP POLICY IF EXISTS push_devices_tenant_isolation ON tenant.push_devices"))
    conn.execute(sa.text("DROP TABLE IF EXISTS tenant.push_devices"))
