"""Strike #100 — runtime SELECT grant on shared.crop_varieties

Migration 068 created shared.crop_varieties as the SUPERUSER role
(teivaka) and forgot the runtime GRANT. The api container connects as
teivaka_app and 500's on `permission denied for table crop_varieties`.

This migration mirrors the pattern used in 055_crop_nutrition_protocols,
036_event_type_catalog, 037_naming_dictionary, etc.: explicit GRANT
SELECT to teivaka_app per shared.* table (no DEFAULT PRIVILEGES exists
on the shared schema, so each new table needs its own GRANT).

asyncpg requires one DDL statement per op.execute() call (Strike #72).

Revision ID: 071_crop_varieties_grant
Revises: 070_provisional_varieties_seed
Create Date: 2026-05-05
"""
from alembic import op

revision = '071_crop_varieties_grant'
down_revision = '070_provisional_varieties_seed'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("GRANT SELECT ON shared.crop_varieties TO teivaka_app;")


def downgrade() -> None:
    op.execute("REVOKE SELECT ON shared.crop_varieties FROM teivaka_app;")
