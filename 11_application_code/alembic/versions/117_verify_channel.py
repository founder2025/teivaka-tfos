"""117 - preferred verification channel (omnichannel OTP, verify-later)

Captures the channel the user wants their verification sent through. The password
remains the auth spine; this is the verify-later channel preference that the CFO
cost-routing engine (app/core/verification_routing.py) resolves and dispatches on.

Channels: whatsapp | sms | email. Default 'email' — the only channel that delivers
reliably today (WhatsApp/SMS await provisioning, Q8), so email is also the fallback.
"""
from alembic import op

revision = "117_verify_channel"
down_revision = "116_business_entities"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE tenant.users
            ADD COLUMN IF NOT EXISTS preferred_verify_channel TEXT NOT NULL DEFAULT 'email'
            CHECK (preferred_verify_channel IN ('whatsapp','sms','email'))
    """)


def downgrade():
    op.execute("ALTER TABLE tenant.users DROP COLUMN IF EXISTS preferred_verify_channel")
