-- FILE: 02_database/init/00_extensions.sql
--
-- PostgreSQL init script — runs ONCE on first container start via
-- /docker-entrypoint-initdb.d/ mount (see docker-compose.yml).
--
-- Installs all required PostgreSQL extensions before Alembic migrations run.
-- Order matters: timescaledb must be in shared_preload_libraries before CREATE EXTENSION.
-- The docker-compose.yml already sets -c shared_preload_libraries='timescaledb,pg_stat_statements'
--
-- DO NOT add schema or table DDL here — that belongs in Alembic migrations.
-- This file is ONLY for extensions.

-- TimescaleDB — time-series extension for weather_logs and tis_voice_logs hypertables
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- pgvector — vector similarity search for KB article embeddings (RAG pipeline)
-- Used by shared.kb_articles.embedding column (1536-dim text-embedding-3-small)
CREATE EXTENSION IF NOT EXISTS vector;

-- pg_stat_statements — query performance tracking (required for slow query analysis)
-- Enabled via shared_preload_libraries in docker-compose postgres command
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- uuid-ossp — UUID generation functions (gen_random_uuid() is built-in in PG14+,
-- but this extension is needed for uuid_generate_v4() compatibility in older seeds)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
