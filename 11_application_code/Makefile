# Teivaka Agri-TOS — Developer shortcuts
# Run from: 11_application_code/

.PHONY: help dev db-init db-seed migrate test lint shell logs celery beat

help:
	@echo "Teivaka Agri-TOS — Available commands:"
	@echo ""
	@echo "  make dev          Start all services (API + workers + DB + Redis)"
	@echo "  make api          Start API only (needs DB + Redis already running)"
	@echo "  make db-start     Start DB and Redis only"
	@echo "  make db-init      Initialize database schemas (run once after fresh DB)"
	@echo "  make db-seed      Load seed data (Teivaka tenant, farms, rules)"
	@echo "  make migrate      Run Alembic migrations"
	@echo "  make test         Run all test suites"
	@echo "  make test-fast    Run tests excluding slow integration tests"
	@echo "  make lint         Run ruff linter"
	@echo "  make shell        Open Python shell in API container"
	@echo "  make logs         Tail all service logs"
	@echo "  make celery       Show Celery worker status"
	@echo "  make beat         Show Celery Beat scheduled tasks"
	@echo "  make clean        Remove __pycache__ and .pyc files"

# ── Service management ──────────────────────────────────────────────────────

dev:
	docker compose up -d
	@echo "All services starting... check health at http://localhost:8000/health"

api:
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

db-start:
	docker compose up -d db redis
	@echo "Waiting for DB to be ready..."
	@sleep 3
	@docker compose exec db pg_isready -U teivaka && echo "DB ready."

# ── Database ────────────────────────────────────────────────────────────────

DB_URL ?= $(shell grep DATABASE_URL .env | cut -d= -f2-)
SCHEMA_DIR = ../02_database/schema

db-init: db-start
	@echo "Creating extensions and schemas..."
	psql "$(DB_URL)" -f $(SCHEMA_DIR)/01_shared_schema.sql
	psql "$(DB_URL)" -f $(SCHEMA_DIR)/02_tenant_schema.sql
	psql "$(DB_URL)" -f $(SCHEMA_DIR)/03_materialized_views.sql
	psql "$(DB_URL)" -f $(SCHEMA_DIR)/05_functions.sql
	@echo "Database initialized. Run 'make db-seed' to load Teivaka data."

db-seed:
	@echo "Loading seed data..."
	psql "$(DB_URL)" -f $(SCHEMA_DIR)/04_seed_data.sql
	@echo "Seed data loaded. Verifying..."
	@psql "$(DB_URL)" -c "SELECT 'Tenants: ' || COUNT(*) FROM tenant.tenants;" -t
	@psql "$(DB_URL)" -c "SELECT 'Farms: ' || COUNT(*) FROM tenant.farms;" -t
	@psql "$(DB_URL)" -c "SELECT 'Rules: ' || COUNT(*) FROM tenant.automation_rules;" -t
	@psql "$(DB_URL)" -c "SELECT 'Productions: ' || COUNT(*) FROM shared.productions;" -t
	@psql "$(DB_URL)" -c "SELECT 'Decision signals: ' || COUNT(*) FROM tenant.decision_signal_config;" -t

db-seed-kb:
	@echo "Loading KB seed articles..."
	psql "$(DB_URL)" -f ../09_knowledge_base/KB_SEED_ARTICLES.sql
	@echo "KB articles loaded. Run embedding generation:"
	@echo "  docker compose exec worker-ai celery call app.workers.ai_worker.embed_kb_article --args '[\"ALL\", \"ALL\"]'"

migrate:
	alembic upgrade head

migrate-check:
	alembic check

migrate-history:
	alembic history --verbose

migrate-rollback:
	alembic downgrade -1

# ── Testing ──────────────────────────────────────────────────────────────────

test:
	docker compose exec api pytest ../07_testing/tests/ -v --tb=short \
		--cov=app --cov-report=term-missing --cov-fail-under=60

test-fast:
	docker compose exec api pytest ../07_testing/tests/ -v --tb=short \
		-m "not slow" --cov=app --cov-report=term-missing

test-rotation:
	docker compose exec api pytest ../07_testing/tests/test_rotation_engine.py -v

test-automation:
	docker compose exec api pytest ../07_testing/tests/test_automation_engine.py -v

test-financial:
	docker compose exec api pytest ../07_testing/tests/test_financial.py -v

test-tis:
	docker compose exec api pytest ../07_testing/tests/test_tis.py -v

# ── Code quality ─────────────────────────────────────────────────────────────

lint:
	ruff check app/ --fix
	ruff format app/

lint-check:
	ruff check app/
	ruff format app/ --check

# ── Debugging ────────────────────────────────────────────────────────────────

shell:
	docker compose exec api python -c "import asyncio; from app.config import settings; print(f'Connected: {settings.app_name} v{settings.app_version}')"

logs:
	docker compose logs -f --tail=50

logs-api:
	docker compose logs -f api --tail=100

logs-worker:
	docker compose logs -f worker-automation worker-ai --tail=50

celery:
	docker compose exec worker-automation celery -A app.workers.celery_app inspect active

beat:
	docker compose exec beat celery -A app.workers.celery_app inspect scheduled

# ── Maintenance ──────────────────────────────────────────────────────────────

clean:
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null; true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null; true

refresh-views:
	@echo "Refreshing all materialized views..."
	psql "$(DB_URL)" -c "SELECT * FROM tenant.refresh_all_materialized_views();"

run-automation:
	@echo "Manually triggering automation engine..."
	docker compose exec worker-automation celery -A app.workers.celery_app call \
		app.workers.automation_worker.run_automation_engine

run-decision:
	@echo "Manually triggering decision engine..."
	docker compose exec worker-automation celery -A app.workers.celery_app call \
		app.workers.decision_engine_worker.run_decision_engine

# ── Health check ─────────────────────────────────────────────────────────────

health:
	@curl -s http://localhost:8000/health | python -m json.tool

validate:
	@echo "=== Validating Teivaka Agri-TOS deployment ==="
	@psql "$(DB_URL)" -c "SELECT COUNT(*) AS tenants FROM tenant.tenants;" -t
	@psql "$(DB_URL)" -c "SELECT COUNT(*) AS farms FROM tenant.farms;" -t
	@psql "$(DB_URL)" -c "SELECT COUNT(*) AS automation_rules FROM tenant.automation_rules WHERE is_active = true;" -t
	@psql "$(DB_URL)" -c "SELECT COUNT(*) AS productions FROM shared.productions WHERE is_active = true;" -t
	@psql "$(DB_URL)" -c "SELECT COUNT(*) AS rotation_rules FROM shared.actionable_rules;" -t
	@psql "$(DB_URL)" -c "SELECT COUNT(*) AS chemicals FROM shared.chemical_library;" -t
	@psql "$(DB_URL)" -c "SELECT farm_id, farm_name FROM tenant.farms ORDER BY farm_id;"
	@curl -s http://localhost:8000/health | python -m json.tool
