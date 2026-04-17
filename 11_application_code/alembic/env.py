import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context
import os
import sys

# Ensure the application root is on sys.path so that app.* imports resolve
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
from app.db.base import Base, SharedBase
from app.models import *  # noqa: F401 — registers all SQLAlchemy models so their tables appear in metadata

config = context.config

# Wire up logging from alembic.ini if a config file is present
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override the blank sqlalchemy.url in alembic.ini with the value from settings
# settings.async_database_url ensures the postgresql+asyncpg:// driver prefix
config.set_main_option("sqlalchemy.url", settings.async_database_url)

# Both metadata objects must be listed so Alembic tracks shared and tenant schemas
target_metadata = [Base.metadata, SharedBase.metadata]


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (no live DB connection required).

    Emits DDL as SQL text — useful for reviewing or applying manually.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
        version_table_schema="tenant",
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    """Inner function executed inside an async connection context."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_schemas=True,
        version_table_schema="tenant",
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an async engine and drive migrations over it."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    """Entry point for online (live DB) migrations."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
