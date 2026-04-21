"""Phase 4.2 — audit schema + audit.events hash chain (Bank Evidence spine)

Revision ID: 023_audit_events_v4
Revises: 022_task_engine_v4
Create Date: 2026-04-21

Creates the `audit` schema and `audit.events` table — the hash-chained
append-only log that backs automatic Bank Evidence accrual under v4.1.

Every task COMPLETE, SKIP, or CANCEL emits exactly one audit.events row.
The hash chain is tenant-scoped: each row's this_hash is computed from
(tenant_id || previous_hash || payload_sha256 || occurred_at). previous_hash
is the this_hash of the prior row for the same tenant. The GENESIS row for
each tenant has previous_hash = NULL.

Hard rules enforced at the DB level:
- RLS on audit.events (tenant_id = app.current_tenant_id)
- REVOKE UPDATE, DELETE from PUBLIC — audit log is immutable after insert
- UNIQUE (tenant_id, this_hash) — prevents hash collision / tampering
- INSERT-only workflow; no in-place correction

Reference: 01_architecture/Phase_4_2_Task_Engine_Spec.md §7
Reference: 01_architecture/TFOS_v4_1_Execution_Reality_Addendum.md §Bank Evidence

NOTE: audit.events lives in its own schema (not tenant.*) for conceptual
separation. RLS still enforces tenant isolation. The alembic_version row
itself remains in tenant.alembic_version.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '023_audit_events_v4'
down_revision = '022_task_engine_v4'
branch_labels = None
depends_on = None


def _exec_each(statements):
    for stmt in statements:
        op.execute(stmt)


def upgrade() -> None:
    # --- 0. Ensure pgcrypto is in the public schema ----------------------
    # Historical drift: an earlier migration installed pgcrypto while
    # `tenant` was the active schema, so digest()/gen_salt()/crypt() ended
    # up in tenant.* instead of public.*. LANGUAGE SQL functions (like
    # audit.compute_hash in section 8) bind identifier references at
    # CREATE time — unqualified digest() must resolve via search_path,
    # which is "$user",public by default. Public is the conventional
    # home for extension functions and keeps the audit schema free of
    # cross-schema coupling to tenant.*.
    #
    # Guard is idempotent: if pgcrypto is already in public, the ALTER
    # block skips. If pgcrypto isn't installed, CREATE EXTENSION lands
    # it in public on the next line.
    _exec_each([
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_extension e
                JOIN pg_namespace n ON e.extnamespace = n.oid
                WHERE e.extname = 'pgcrypto' AND n.nspname <> 'public'
            ) THEN
                ALTER EXTENSION pgcrypto SET SCHEMA public;
            END IF;
        END $$
        """,
        "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public",
    ])

    # --- 1. Create audit schema ------------------------------------------
    _exec_each([
        "CREATE SCHEMA IF NOT EXISTS audit",
    ])

    # --- 2. Create audit.events table ------------------------------------
    _exec_each([
        """
        CREATE TABLE IF NOT EXISTS audit.events (
            event_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id           UUID NOT NULL,
            actor_user_id       UUID NULL,
            event_type          VARCHAR(64) NOT NULL,
            entity_type         VARCHAR(64) NULL,
            entity_id           VARCHAR(64) NULL,
            occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            payload_jsonb       JSONB NOT NULL,
            payload_sha256      CHAR(64) NOT NULL,
            previous_hash       CHAR(64) NULL,
            this_hash           CHAR(64) NOT NULL,
            client_offline_id   VARCHAR(64) NULL,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
    ])

    # --- 3. Check constraint: valid event_type ---------------------------
    # Extend this list only via a new migration. Keep it tight.
    _exec_each([
        """
        ALTER TABLE audit.events
        ADD CONSTRAINT audit_events_event_type_valid
        CHECK (event_type IN (
            'TASK_COMPLETED', 'TASK_SKIPPED', 'TASK_CANCELLED', 'TASK_EXPIRED',
            'HARVEST_LOGGED', 'CHEMICAL_APPLIED', 'CYCLE_CREATED',
            'CYCLE_CLOSED', 'ROTATION_OVERRIDE', 'COMPLIANCE_OVERRIDE',
            'PAYMENT_RECEIVED', 'PAYMENT_SENT', 'LABOR_LOGGED',
            'INVENTORY_ADJUSTED', 'ALERT_RESOLVED', 'USER_INVITED',
            'FARM_CREATED', 'FARM_CLOSED', 'SUBSCRIPTION_CHANGED',
            'REFERRAL_ACTIVATED', 'BANK_PDF_GENERATED', 'CREDIT_SCORE_UPDATED'
        ))
        """,
    ])

    # --- 4. Indexes -----------------------------------------------------
    _exec_each([
        """
        CREATE INDEX idx_audit_tenant_time
        ON audit.events (tenant_id, occurred_at DESC)
        """,
        """
        CREATE INDEX idx_audit_entity
        ON audit.events (tenant_id, entity_type, entity_id)
        WHERE entity_type IS NOT NULL
        """,
        """
        CREATE UNIQUE INDEX idx_audit_chain_unique
        ON audit.events (tenant_id, this_hash)
        """,
        """
        CREATE INDEX idx_audit_offline_id
        ON audit.events (tenant_id, client_offline_id)
        WHERE client_offline_id IS NOT NULL
        """,
    ])

    # --- 5. Row Level Security ------------------------------------------
    # Session variable name is `app.tenant_id` — this matches the deployed
    # convention. The v3/v4 master docs reference `app.current_tenant_id`
    # which is master-doc drift. Do not use `current_tenant_id` here — it
    # will make RLS silently fail to match rows (or raise on NULL setting).
    _exec_each([
        "ALTER TABLE audit.events ENABLE ROW LEVEL SECURITY",
        """
        CREATE POLICY audit_events_tenant_isolation ON audit.events
        USING (tenant_id = current_setting('app.tenant_id')::uuid)
        """,
    ])

    # --- 6. Immutability: REVOKE UPDATE, DELETE --------------------------
    # Bank Evidence MUST be append-only. Revoke from PUBLIC and from the
    # application role. Migrations run as the admin role, which retains
    # full rights (needed for downgrade + data-correction ceremonies that
    # require Cody's explicit approval).
    _exec_each([
        "REVOKE UPDATE, DELETE ON audit.events FROM PUBLIC",
        # If the app uses a non-default role, uncomment and adjust:
        # "REVOKE UPDATE, DELETE ON audit.events FROM teivaka_app",
    ])

    # --- 7. Trigger: auto-block UPDATE and DELETE even via superuser ----
    # Defence-in-depth. A superuser connection could bypass REVOKE, but the
    # trigger raises regardless. Only the migration role can bypass via
    # explicit SET session_replication_role = 'replica' inside a downgrade.
    _exec_each([
        """
        CREATE OR REPLACE FUNCTION audit.events_immutability_guard()
        RETURNS TRIGGER AS $$
        BEGIN
            IF current_setting('session_replication_role', true) = 'replica' THEN
                RETURN NULL;  -- Allow during replication / Alembic downgrade
            END IF;
            RAISE EXCEPTION 'audit.events is append-only. % forbidden.', TG_OP
                USING ERRCODE = '42501';
        END;
        $$ LANGUAGE plpgsql
        """,
        """
        CREATE TRIGGER audit_events_block_update
        BEFORE UPDATE ON audit.events
        FOR EACH ROW EXECUTE FUNCTION audit.events_immutability_guard()
        """,
        """
        CREATE TRIGGER audit_events_block_delete
        BEFORE DELETE ON audit.events
        FOR EACH ROW EXECUTE FUNCTION audit.events_immutability_guard()
        """,
    ])

    # --- 8. Helper function: compute hash inside the DB (optional) ------
    # Python-side helper is the primary path, but this SQL function lets
    # you verify chain integrity from a psql session without pulling
    # rows out to Python.
    _exec_each([
        """
        CREATE OR REPLACE FUNCTION audit.compute_hash(
            p_tenant_id UUID,
            p_previous_hash CHAR(64),
            p_payload_sha256 CHAR(64),
            p_occurred_at TIMESTAMPTZ
        ) RETURNS CHAR(64) AS $$
        SELECT encode(
            digest(
                p_tenant_id::text || '|' ||
                COALESCE(p_previous_hash, 'GENESIS') || '|' ||
                p_payload_sha256 || '|' ||
                to_char(p_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.USOF:00'),
                'sha256'
            ),
            'hex'
        )::char(64);
        $$ LANGUAGE SQL IMMUTABLE
        """,
    ])

    # pgcrypto was already ensured public-scoped in step 0 of upgrade().
    # No further CREATE EXTENSION needed here.


def downgrade() -> None:
    # Downgrade is destructive — drops the entire audit schema.
    # Before running in production, EXPORT audit.events to a signed archive.
    _exec_each([
        "DROP FUNCTION IF EXISTS audit.compute_hash(UUID, CHAR(64), CHAR(64), TIMESTAMPTZ)",
        "DROP TRIGGER IF EXISTS audit_events_block_delete ON audit.events",
        "DROP TRIGGER IF EXISTS audit_events_block_update ON audit.events",
        "DROP FUNCTION IF EXISTS audit.events_immutability_guard()",
        "DROP POLICY IF EXISTS audit_events_tenant_isolation ON audit.events",
        "ALTER TABLE IF EXISTS audit.events DISABLE ROW LEVEL SECURITY",
        "DROP INDEX IF EXISTS audit.idx_audit_offline_id",
        "DROP INDEX IF EXISTS audit.idx_audit_chain_unique",
        "DROP INDEX IF EXISTS audit.idx_audit_entity",
        "DROP INDEX IF EXISTS audit.idx_audit_tenant_time",
        "ALTER TABLE IF EXISTS audit.events DROP CONSTRAINT IF EXISTS audit_events_event_type_valid",
        "DROP TABLE IF EXISTS audit.events",
        "DROP SCHEMA IF EXISTS audit CASCADE",
    ])
