"""018 - ops schema: infrastructure health checks + alert events

Revision ID: 018_ops_health_checks
Revises: 017b_classroom_schema
Create Date: 2026-04-20

Phase infra-gate. Created after tis-bridge was down 2 days unnoticed
(2026-04-18). Owned by the ops.run_health_checks Celery task.

Schema rationale: uses a dedicated `ops` schema (not `shared.*`) because
health-monitor rows are not multi-tenant business data and the platform
rule forbids runtime writes to shared.*.
"""
from alembic import op

revision = "018_ops_health_checks"
down_revision = "017b_classroom_schema"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        "CREATE SCHEMA IF NOT EXISTS ops",

        """
        CREATE TABLE IF NOT EXISTS ops.health_checks (
            id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            check_name        TEXT NOT NULL,
            status            TEXT NOT NULL CHECK (status IN ('PASS','FAIL')),
            response_time_ms  INTEGER,
            error_detail      TEXT,
            checked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_health_checks_checked_at ON ops.health_checks(checked_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_health_checks_name_checked_at ON ops.health_checks(check_name, checked_at DESC)",

        """
        CREATE TABLE IF NOT EXISTS ops.alert_events (
            id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            check_name            TEXT NOT NULL,
            severity              TEXT NOT NULL CHECK (severity IN ('CRITICAL')),
            consecutive_fails     INTEGER NOT NULL,
            fired_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            resolved_at           TIMESTAMPTZ,
            notification_channel  TEXT CHECK (notification_channel IN ('email','whatsapp')),
            notification_status   TEXT CHECK (notification_status IN ('SENT','FAILED'))
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_alert_events_checked_at ON ops.alert_events(fired_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_alert_events_unresolved ON ops.alert_events(check_name, fired_at DESC) WHERE resolved_at IS NULL",
    ])


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS ops.alert_events",
        "DROP TABLE IF EXISTS ops.health_checks",
        "DROP SCHEMA IF EXISTS ops",
    ])
