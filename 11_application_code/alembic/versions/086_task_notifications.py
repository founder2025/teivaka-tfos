"""086 task notifications — tenant.task_notifications (external alert delivery log)

P3b of the Tasks pillar. Records every external task alert dispatched (WhatsApp
or email), the provider message id, send status, and — per Inviolable PR.2
(Alert Path Receipt Verification) — a receipt_confirmed_at column that stays
NULL until the recipient confirms the message landed in the real inbox/channel.
Sender-side success is logged as SENT, never as "delivered"; only an Operator
receipt sets receipt_confirmed_at.

Doubles as the dedupe substrate: notify_due_tasks skips any task already logged
SENT/MOCK within the lookback window, so a farmer is not re-pinged about the
same overdue task every run.

Per-tenant RLS so each farm account sees only its own notification log.

revision: 086_task_notifications
down_revision: 085_crop_growth_plan
"""
from alembic import op

revision = "086_task_notifications"
down_revision = "085_crop_growth_plan"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS tenant.task_notifications (
            notification_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id            UUID NOT NULL,
            farm_id              TEXT NOT NULL,
            task_id              TEXT,
            channel              TEXT NOT NULL CHECK (channel IN ('whatsapp','email')),
            recipient            TEXT NOT NULL,
            status               TEXT NOT NULL CHECK (status IN ('SENT','MOCK','FAILED')),
            provider_message_id  TEXT,
            error                TEXT,
            is_test              BOOLEAN NOT NULL DEFAULT false,
            sent_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
            receipt_confirmed_at TIMESTAMPTZ,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_task_notifications_dedupe
            ON tenant.task_notifications (tenant_id, task_id, sent_at DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_task_notifications_farm
            ON tenant.task_notifications (tenant_id, farm_id, sent_at DESC)
    """)

    # RLS — canonical app.tenant_id policy, mirror sibling tenant.* tables.
    op.execute("ALTER TABLE tenant.task_notifications ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tenant.task_notifications FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY task_notifications_tenant_isolation
            ON tenant.task_notifications
            USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    """)

    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
                GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.task_notifications TO teivaka_app;
            END IF;
        END $$
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tenant.task_notifications")
