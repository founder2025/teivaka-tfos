"""009 - Enhanced registration: extended user profile, privacy tracking, fraud audit log

Revision ID: 009_enhanced_registration
Revises: 008_password_hash
Create Date: 2026-04-12

Changes:
    tenant.users
        - first_name / last_name (split from full_name; full_name kept for backward compat)
        - date_of_birth           (age verification — must be 18+)
        - phone_number            (primary contact phone, E.164 format)
        - account_type            (FARMER | SUPPLIER | BUYER | OTHER)
        - country                 (ISO 3166-1 alpha-2, defaults FJ)
        - privacy_accepted_at     (GDPR / compliance — exact timestamp of acceptance)
        - privacy_policy_version  (which version they accepted, e.g. "1.0")
        - registration_ip         (for fraud geolocation + rate limiting)
        - registration_user_agent (headless browser / bot detection)
        - email_verified          (email verification gate — defaults false)
        - email_verification_token
        - email_verification_expires

    shared.registration_audit_log  (NEW — cross-tenant fraud visibility)
        - logs every registration attempt regardless of outcome
        - used to detect multi-account fraud, IP abuse, disposable email patterns

    shared.ip_registration_counts  (NEW — IP-based rate limiting)
        - tracks hourly + daily registrations per IP address
"""
from alembic import op

revision = '009_enhanced_registration'
down_revision = '008_password_hash'
branch_labels = None
depends_on = None


def upgrade():
    # ------------------------------------------------------------------
    # 1. Extend tenant.users with full registration profile columns
    # ------------------------------------------------------------------
    op.execute("""
        ALTER TABLE tenant.users
            ADD COLUMN IF NOT EXISTS first_name              TEXT,
            ADD COLUMN IF NOT EXISTS last_name               TEXT,
            ADD COLUMN IF NOT EXISTS date_of_birth           DATE,
            ADD COLUMN IF NOT EXISTS phone_number            TEXT,
            ADD COLUMN IF NOT EXISTS account_type            TEXT NOT NULL DEFAULT 'FARMER'
                                                             CHECK (account_type IN ('FARMER','SUPPLIER','BUYER','OTHER')),
            ADD COLUMN IF NOT EXISTS country                 TEXT NOT NULL DEFAULT 'FJ',
            ADD COLUMN IF NOT EXISTS privacy_accepted_at     TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS privacy_policy_version  TEXT NOT NULL DEFAULT '1.0',
            ADD COLUMN IF NOT EXISTS registration_ip         TEXT,
            ADD COLUMN IF NOT EXISTS registration_user_agent TEXT,
            ADD COLUMN IF NOT EXISTS email_verified          BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS email_verification_token     TEXT,
            ADD COLUMN IF NOT EXISTS email_verification_expires   TIMESTAMPTZ
    """)

    # Backfill first_name / last_name from existing full_name rows
    op.execute("""
        UPDATE tenant.users
        SET
            first_name = split_part(full_name, ' ', 1),
            last_name  = NULLIF(
                            trim(substring(full_name FROM position(' ' IN full_name))),
                            ''
                         )
        WHERE first_name IS NULL AND full_name IS NOT NULL
    """)

    # Phone uniqueness constraint — same phone can't register twice
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
        ON tenant.users(phone_number)
        WHERE phone_number IS NOT NULL
    """)

    # Fast email verification token lookup
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_users_verification_token
        ON tenant.users(email_verification_token)
        WHERE email_verification_token IS NOT NULL
    """)

    # ------------------------------------------------------------------
    # 2. Cross-tenant registration audit log (in shared schema)
    #    Records every attempt — success AND failure — for fraud analysis
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS shared.registration_audit_log (
            id               BIGSERIAL     PRIMARY KEY,
            attempted_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
            ip_address       TEXT          NOT NULL,
            user_agent       TEXT,
            email            TEXT          NOT NULL,
            phone_number     TEXT,
            outcome          TEXT          NOT NULL
                             CHECK (outcome IN (
                                 'SUCCESS',
                                 'FAILED_DUPLICATE_EMAIL',
                                 'FAILED_DUPLICATE_PHONE',
                                 'FAILED_DISPOSABLE_EMAIL',
                                 'FAILED_UNDERAGE',
                                 'FAILED_IP_RATE_LIMIT',
                                 'FAILED_SUSPICIOUS_PATTERN',
                                 'FAILED_PRIVACY_NOT_ACCEPTED',
                                 'FAILED_VALIDATION',
                                 'FAILED_SERVER_ERROR'
                             )),
            failure_detail   TEXT,
            tenant_id        UUID,          -- NULL if registration failed
            user_id          UUID           -- NULL if registration failed
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_reg_audit_ip
        ON shared.registration_audit_log(ip_address, attempted_at DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_reg_audit_email
        ON shared.registration_audit_log(email, attempted_at DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_reg_audit_outcome
        ON shared.registration_audit_log(outcome, attempted_at DESC)
    """)

    # ------------------------------------------------------------------
    # 3. IP rate limiting counters table
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS shared.ip_registration_counts (
            ip_address   TEXT         NOT NULL,
            window_start TIMESTAMPTZ  NOT NULL,
            window_type  TEXT         NOT NULL CHECK (window_type IN ('HOURLY','DAILY')),
            count        INTEGER      NOT NULL DEFAULT 1,
            PRIMARY KEY (ip_address, window_start, window_type)
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_ip_reg_counts_lookup
        ON shared.ip_registration_counts(ip_address, window_type, window_start DESC)
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS shared.ip_registration_counts")
    op.execute("DROP TABLE IF EXISTS shared.registration_audit_log")
    op.execute("DROP INDEX IF EXISTS tenant.idx_users_verification_token")
    op.execute("DROP INDEX IF EXISTS tenant.idx_users_phone_unique")
    op.execute("""
        ALTER TABLE tenant.users
            DROP COLUMN IF EXISTS first_name,
            DROP COLUMN IF EXISTS last_name,
            DROP COLUMN IF EXISTS date_of_birth,
            DROP COLUMN IF EXISTS phone_number,
            DROP COLUMN IF EXISTS account_type,
            DROP COLUMN IF EXISTS country,
            DROP COLUMN IF EXISTS privacy_accepted_at,
            DROP COLUMN IF EXISTS privacy_policy_version,
            DROP COLUMN IF EXISTS registration_ip,
            DROP COLUMN IF EXISTS registration_user_agent,
            DROP COLUMN IF EXISTS email_verified,
            DROP COLUMN IF EXISTS email_verification_token,
            DROP COLUMN IF EXISTS email_verification_expires
    """)
