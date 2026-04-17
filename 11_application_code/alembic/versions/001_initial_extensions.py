"""001 - Enable PostgreSQL extensions and create schemas
Revision ID: 001_extensions
Revises:
Create Date: 2026-04-07
"""
from alembic import op

revision = '001_extensions'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE")
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute("CREATE SCHEMA IF NOT EXISTS shared")
    op.execute("CREATE SCHEMA IF NOT EXISTS tenant")

def downgrade():
    pass  # Never drop extensions in production
