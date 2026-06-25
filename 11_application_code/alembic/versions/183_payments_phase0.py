"""183 — Phase 0 payment orchestration rail (non-custodial, manual-first)

Teivaka never holds or moves money. This adds the records that let a farmer
capture an obligation (pay a supplier/worker, or money owed to them), generate a
manual payment instruction, confirm it once paid out-of-band, and have it land in
their cash flow + audit chain. Real providers (M-PAiSA, banks) plug into the same
shape later by config — no schema rework.

Tables:
  tenant.payment_methods       — a user's payout/pay-in methods (tokenized refs only)
  tenant.payment_counterparties— who you pay / who pays you (display handles only)
  tenant.payables              — unified who-owes-what (direction COLLECT|RECEIVE)
  tenant.payment_transactions  — an instruction + its settlement state machine
  shared.payment_providers     — read-only adapter registry (MANUAL live; rest off)

No raw PAN / wallet / bank credentials are ever stored — only masked display
strings and provider tokens. Per-tenant FORCE RLS, canonical app.tenant_id policy.
Reversible. Apply as owner (Strike #123).

Revision ID: 183_payments_phase0
Revises: 182_tenant_billing_email
"""
from alembic import op

revision = "183_payments_phase0"
down_revision = "182_tenant_billing_email"
branch_labels = None
depends_on = None


def _rls(table: str, policy: str):
    op.execute(f"ALTER TABLE tenant.{table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE tenant.{table} FORCE ROW LEVEL SECURITY")
    op.execute(f"""
        CREATE POLICY {policy} ON tenant.{table}
            USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
            WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    """)
    op.execute(f"""
        DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.{table} TO teivaka_app;
        END IF; END $$
    """)


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS tenant.payment_methods (
            method_id          TEXT PRIMARY KEY,
            tenant_id          UUID NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
            owner_user_id      UUID REFERENCES tenant.users(user_id),
            provider           TEXT NOT NULL DEFAULT 'MANUAL',
            method_type        TEXT NOT NULL CHECK (method_type IN ('WALLET','BANK','CARD')),
            label              TEXT NOT NULL,
            masked_identifier  TEXT,
            token_ref          TEXT,
            is_default         BOOLEAN NOT NULL DEFAULT false,
            status             TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
            created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_payment_methods_tenant ON tenant.payment_methods (tenant_id, status)")
    _rls("payment_methods", "payment_methods_tenant_isolation")

    op.execute("""
        CREATE TABLE IF NOT EXISTS tenant.payment_counterparties (
            counterparty_id    TEXT PRIMARY KEY,
            tenant_id          UUID NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
            name               TEXT NOT NULL,
            kind               TEXT NOT NULL DEFAULT 'OTHER' CHECK (kind IN ('SUPPLIER','WORKER','BUYER','OTHER')),
            provider           TEXT,
            masked_handle      TEXT,
            token_ref          TEXT,
            created_by         UUID REFERENCES tenant.users(user_id),
            created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_payment_counterparties_tenant ON tenant.payment_counterparties (tenant_id)")
    _rls("payment_counterparties", "payment_counterparties_tenant_isolation")

    op.execute("""
        CREATE TABLE IF NOT EXISTS tenant.payables (
            obligation_id      TEXT PRIMARY KEY,
            tenant_id          UUID NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
            farm_id            TEXT REFERENCES tenant.farms(farm_id),
            direction          TEXT NOT NULL CHECK (direction IN ('COLLECT','RECEIVE')),
            counterparty_id    TEXT,
            counterparty_label TEXT,
            category           TEXT NOT NULL DEFAULT 'OTHER',
            amount_fjd         NUMERIC(12,2) NOT NULL,
            currency           TEXT NOT NULL DEFAULT 'FJD',
            source_type        TEXT NOT NULL DEFAULT 'ADHOC',
            source_id          TEXT,
            status             TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','INSTRUCTED','SETTLED','CANCELLED')),
            due_date           DATE,
            notes              TEXT,
            created_by         UUID REFERENCES tenant.users(user_id),
            created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_payables_tenant_status ON tenant.payables (tenant_id, status, direction)")
    _rls("payables", "payables_tenant_isolation")

    op.execute("""
        CREATE TABLE IF NOT EXISTS tenant.payment_transactions (
            txn_id             TEXT PRIMARY KEY,
            tenant_id          UUID NOT NULL REFERENCES tenant.tenants(tenant_id) ON DELETE CASCADE,
            obligation_id      TEXT NOT NULL REFERENCES tenant.payables(obligation_id) ON DELETE CASCADE,
            payment_method_id  TEXT REFERENCES tenant.payment_methods(method_id),
            provider           TEXT NOT NULL DEFAULT 'MANUAL',
            direction          TEXT NOT NULL CHECK (direction IN ('COLLECT','RECEIVE')),
            amount_fjd         NUMERIC(12,2) NOT NULL,
            idempotency_key    TEXT,
            provider_ref       TEXT,
            state              TEXT NOT NULL DEFAULT 'INITIATED'
                               CHECK (state IN ('INITIATED','PENDING','CONFIRMED','FAILED','REVERSED')),
            instruction_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            confirmation_ref   TEXT,
            confirmed_via      TEXT,
            cash_ledger_id     TEXT,
            created_by         UUID REFERENCES tenant.users(user_id),
            created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_payment_txn_obligation ON tenant.payment_transactions (tenant_id, obligation_id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_txn_idem ON tenant.payment_transactions (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL")
    _rls("payment_transactions", "payment_transactions_tenant_isolation")

    # Adapter registry (read-only config; modify via migration only — Inviolable #7).
    op.execute("""
        CREATE TABLE IF NOT EXISTS shared.payment_providers (
            code         TEXT PRIMARY KEY,
            display      TEXT NOT NULL,
            is_manual    BOOLEAN NOT NULL DEFAULT false,
            can_collect  BOOLEAN NOT NULL DEFAULT false,
            can_request  BOOLEAN NOT NULL DEFAULT false,
            can_disburse BOOLEAN NOT NULL DEFAULT false,
            can_qr       BOOLEAN NOT NULL DEFAULT false,
            enabled      BOOLEAN NOT NULL DEFAULT false,
            sort_order   INTEGER NOT NULL DEFAULT 100
        )
    """)
    op.execute("""
        INSERT INTO shared.payment_providers
            (code, display, is_manual, can_collect, can_request, can_disburse, can_qr, enabled, sort_order)
        VALUES
            ('MANUAL','Manual / cash / other', true,  true,  true,  true,  false, true,  0),
            ('MPAISA','M-PAiSA',               false, false, false, false, false, false, 10),
            ('MYCASH','MyCash (Digicel)',      false, false, false, false, false, false, 20),
            ('BSP','BSP',                      false, false, false, false, false, false, 30),
            ('ANZ','ANZ',                      false, false, false, false, false, false, 40),
            ('WESTPAC','Westpac',              false, false, false, false, false, false, 50),
            ('HFC','HFC Bank',                 false, false, false, false, false, false, 60),
            ('BRED','BRED Bank',               false, false, false, false, false, false, 70)
        ON CONFLICT (code) DO NOTHING
    """)
    op.execute("""
        DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
            GRANT SELECT ON shared.payment_providers TO teivaka_app;
        END IF; END $$
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS shared.payment_providers")
    op.execute("DROP TABLE IF EXISTS tenant.payment_transactions")
    op.execute("DROP TABLE IF EXISTS tenant.payables")
    op.execute("DROP TABLE IF EXISTS tenant.payment_counterparties")
    op.execute("DROP TABLE IF EXISTS tenant.payment_methods")
