"""111 - Consent ledger (Intelligence Engine Phase I3)

The legal gate before any data monetization. tenant.users.aggregate_consent
is OPT-IN, default FALSE — no farmer's data enters an external/sellable
aggregate unless they explicitly turned it on. community.consent_events is
the append-only audit trail of every consent change (Covenant §3 + GDPR
consent-management + right-to-withdraw).

Binding rule (enforced in the external report query): a farm's data appears
in any external aggregate ONLY if its owner has aggregate_consent = true AND
the k-anonymity floor still holds. Consent without k-anon, or k-anon without
consent, is non-compliant — both gates, always.
"""
from alembic import op

revision = "111_consent_ledger"
down_revision = "110_analytics_events"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


STATEMENTS = [
    "ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS aggregate_consent BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE tenant.users ADD COLUMN IF NOT EXISTS aggregate_consent_at TIMESTAMPTZ",
    """
    CREATE TABLE IF NOT EXISTS community.consent_events (
        event_id     BIGSERIAL PRIMARY KEY,
        user_id      UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        consent_type TEXT NOT NULL DEFAULT 'AGGREGATE',  -- AGGREGATE (external sharing); room for more
        granted      BOOLEAN NOT NULL,
        source       TEXT NOT NULL DEFAULT 'SELF',        -- SELF | ONBOARDING | ADMIN
        ts           TIMESTAMPTZ NOT NULL DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_consent_events_user ON community.consent_events(user_id, ts DESC)",
    "GRANT SELECT, INSERT ON community.consent_events TO teivaka_app",
    "GRANT USAGE, SELECT ON SEQUENCE community.consent_events_event_id_seq TO teivaka_app",
]


def upgrade():
    _exec_each(STATEMENTS)


def downgrade():
    _exec_each([
        "DROP TABLE IF EXISTS community.consent_events",
        "ALTER TABLE tenant.users DROP COLUMN IF EXISTS aggregate_consent_at",
        "ALTER TABLE tenant.users DROP COLUMN IF EXISTS aggregate_consent",
    ])
