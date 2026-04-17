# FILE: 08_deployment/DEPLOYMENT_GUIDE.md

# Teivaka TFOS — Complete Deployment Guide
**Platform:** Teivaka Agricultural TOS, Fiji
**Infrastructure:** Hetzner VPS CAX21 (ARM64, Ubuntu 24.04 LTS)
**Maintained by:** Teivaka PTE LTD (Company No. 2025RC001894)
**Last Updated:** 2026-04-07

---

## Overview

This guide covers a complete production deployment of the Teivaka TFOS stack from a fresh Ubuntu 24.04 server. Follow every step in order. Do not skip validation checks — they exist because prior data migrations have revealed specific failure modes.

**Stack summary:** FastAPI + PostgreSQL 16 + TimescaleDB + pgvector + Redis + Celery + React PWA + Caddy + Claude API + Twilio WhatsApp.

**Server timezone note:** The server runs UTC. All Fiji-facing times are converted in application code to Pacific/Fiji (UTC+12). Do NOT set the server timezone to Pacific/Fiji.

---

## Step 1 — Server Setup

### 1.1 Create Hetzner VPS CAX21

1. Log into Hetzner Cloud Console: https://console.hetzner.cloud
2. Click **+ New Server**
3. Select:
   - **Location:** Nuremberg (nbg1)
   - **Image:** Ubuntu 24.04 LTS
   - **Type:** ARM64 → CAX21 (4 vCPU ARM64, 8GB RAM, 80GB SSD, €7.49/mo)
   - **Networking:** Enable both IPv4 and IPv6
   - **SSH Keys:** Add your public SSH key at this step
   - **Name:** `teivaka-prod-01`
4. Click **Create & Buy Now**
5. Note the public IP address once provisioned (takes ~30 seconds)

### 1.2 Set Hostname

```bash
# Connect as root first
ssh root@<server-ip>

# Set hostname
hostnamectl set-hostname teivaka-prod-01

# Verify
hostnamectl
```

### 1.3 Create Non-Root User

```bash
# Create user
adduser teivaka
# Follow prompts — set a strong password

# Add to sudo group
usermod -aG sudo teivaka

# Verify
groups teivaka
# Expected output: teivaka : teivaka sudo
```

### 1.4 SSH Key Setup and Disable Password Login

```bash
# Still as root — copy authorized_keys to teivaka user
mkdir -p /home/teivaka/.ssh
cp /root/.ssh/authorized_keys /home/teivaka/.ssh/authorized_keys
chown -R teivaka:teivaka /home/teivaka/.ssh
chmod 700 /home/teivaka/.ssh
chmod 600 /home/teivaka/.ssh/authorized_keys

# Disable password authentication
nano /etc/ssh/sshd_config
# Change or add these lines:
#   PasswordAuthentication no
#   PermitRootLogin no
#   PubkeyAuthentication yes

# Restart SSH
systemctl restart sshd

# IMPORTANT: Open a second terminal and verify you can SSH as teivaka user
# BEFORE closing the root session
# ssh teivaka@<server-ip>
```

### 1.5 Configure UFW Firewall

```bash
# As user teivaka (sudo)
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP - Caddy redirect'
sudo ufw allow 443/tcp comment 'HTTPS - Caddy main'
sudo ufw --force enable
sudo ufw status verbose

# Expected output shows: 22, 80, 443 ALLOW
# All other ports DENY by default
```

**Note:** Do not open port 5432 (PostgreSQL) or 6379 (Redis) — these are internal Docker network only.

### 1.6 Set Server Timezone to UTC

```bash
sudo timedatectl set-timezone UTC
timedatectl
# Expected: Time zone: UTC (UTC, +0000)
```

**Critical:** The server MUST run UTC. Application code handles Pacific/Fiji conversion. The automation engine cron `0 6 * * *` (UTC) fires at 6:00 AM UTC = 6:00 PM Fiji time (UTC+12). The daily Decision Engine snapshot runs at `5 18 * * *` UTC = 6:05 AM Fiji time. These timings assume UTC server timezone.

### 1.7 Update System Packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git unzip nano htop
```

---

## Step 2 — Docker Installation

### 2.1 Install Docker Engine (ARM64 Compatible)

Use the official Docker repository — do NOT use `snap install docker` or `apt install docker.io` (outdated versions).

```bash
# Remove any old Docker installations
sudo apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null

# Install prerequisites
sudo apt install -y ca-certificates curl gnupg lsb-release

# Add Docker GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository (ARM64 compatible — Ubuntu detects arch automatically)
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io
```

### 2.2 Install Docker Compose Plugin

The Docker Compose plugin is included in Docker CE from Docker's official repo. Verify:

```bash
sudo apt install -y docker-compose-plugin

# Verify
docker compose version
# Expected: Docker Compose version v2.x.x
```

**Note:** Use `docker compose` (space, v2 plugin), NOT `docker-compose` (hyphen, legacy v1). All scripts in this project use the v2 syntax.

### 2.3 Add teivaka User to Docker Group

```bash
sudo usermod -aG docker teivaka

# Apply group change without logout (or logout + re-login)
newgrp docker
```

### 2.4 Verify Docker Installation

```bash
docker --version
# Expected: Docker version 27.x.x or later

docker compose version
# Expected: Docker Compose version v2.x.x

# Test with hello-world (ARM64 image)
docker run --rm hello-world
# Expected: "Hello from Docker!" message
```

---

## Step 3 — Repository Setup

### 3.1 Clone Repository

```bash
cd /home/teivaka

git clone https://github.com/teivaka/teivaka-api.git
cd teivaka-api

# Verify structure
ls -la
# Should see: docker-compose.yml, Caddyfile, backend/, frontend/, migrations/, etc.
```

### 3.2 Configure Environment Variables

```bash
cp .env.example .env
nano .env
```

Fill in ALL variables. Required fields:

```ini
# Database
POSTGRES_USER=teivaka
POSTGRES_PASSWORD=<generate-strong-password>
POSTGRES_DB=teivaka_db
POSTGRES_HOST=db
POSTGRES_PORT=5432

# Redis
REDIS_URL=redis://redis:6379/0

# API Security
SECRET_KEY=<generate-64-char-random-string>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Claude API
ANTHROPIC_API_KEY=<your-anthropic-api-key>
CLAUDE_MODEL=claude-sonnet-4-20250514

# OpenAI (for embeddings and Whisper)
OPENAI_API_KEY=<your-openai-api-key>
WHISPER_MODEL=whisper-1
EMBEDDING_MODEL=text-embedding-3-small

# Twilio WhatsApp
TWILIO_ACCOUNT_SID=<your-twilio-account-sid>
TWILIO_AUTH_TOKEN=<your-twilio-auth-token>
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# Supabase Storage
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_SERVICE_KEY=<your-supabase-service-role-key>

# Sentry (add later — see Step 9)
SENTRY_DSN=

# App Config
ENVIRONMENT=production
FIJI_TIMEZONE=Pacific/Fiji
FOUNDER_USER_ID=<cody-user-uuid>
TEIVAKA_TENANT_ID=<teivaka-tenant-uuid>

# Domain
API_DOMAIN=api.teivaka.com
FRONTEND_DOMAIN=app.teivaka.com
```

Generate secure passwords and keys:
```bash
# Generate SECRET_KEY
python3 -c "import secrets; print(secrets.token_hex(32))"

# Generate POSTGRES_PASSWORD
python3 -c "import secrets; print(secrets.token_urlsafe(24))"
```

### 3.3 Create Hetzner Volume for Database Storage

In Hetzner Cloud Console:
1. Go to **Volumes** → **+ Create Volume**
2. Size: **80 GB**
3. Location: **Nuremberg (same as server)**
4. Name: `teivaka-db-vol`
5. **Attach to:** `teivaka-prod-01`
6. Click **Create & Buy**

Mount the volume on the server:
```bash
# The volume will appear as /dev/disk/by-id/scsi-0HC_Volume_XXXXXXXX
# Hetzner shows the exact path in the console after attaching

# Format the volume (first time only — DESTRUCTIVE if done twice)
sudo mkfs.ext4 /dev/disk/by-id/scsi-0HC_Volume_XXXXXXXX

# Create mount point
sudo mkdir -p /mnt/data

# Mount
sudo mount /dev/disk/by-id/scsi-0HC_Volume_XXXXXXXX /mnt/data

# Add to /etc/fstab for auto-mount on reboot
echo "/dev/disk/by-id/scsi-0HC_Volume_XXXXXXXX /mnt/data ext4 defaults,nofail 0 2" | \
  sudo tee -a /etc/fstab

# Create subdirectories
sudo mkdir -p /mnt/data/postgres
sudo mkdir -p /mnt/data/backups
sudo chown -R teivaka:teivaka /mnt/data
```

### 3.4 Update docker-compose.yml for Volume

In `docker-compose.yml`, find the `db` service volumes section and update:

```yaml
# Before:
volumes:
  - postgres_data:/var/lib/postgresql/data

# After:
volumes:
  - /mnt/data/postgres:/var/lib/postgresql/data
```

Also remove the bottom-level `postgres_data:` named volume declaration if present.

---

## Step 4 — Database Initialization

### 4.1 Start Database Service Only

```bash
cd /home/teivaka/teivaka-api

docker compose up -d db
```

### 4.2 Wait for Health Check

```bash
# Watch health status — wait until db shows "healthy"
watch -n 2 docker compose ps

# Expected after ~30 seconds:
# NAME      SERVICE   STATUS              PORTS
# db        db        running (healthy)   5432/tcp
```

The PostgreSQL health check is: `pg_isready -U teivaka -d teivaka_db`. It retries every 10s, up to 5 times.

### 4.3 Run Shared Schema Migration

```bash
docker compose exec db psql -U teivaka -d teivaka_db \
  -f /migrations/01_shared_schema.sql

# Verify: no ERROR lines in output
# Expected last line: CREATE TABLE or similar DDL
```

### 4.4 Run Tenant Schema Migration

```bash
docker compose exec db psql -U teivaka -d teivaka_db \
  -f /migrations/02_tenant_schema.sql

# This creates all operational tables with tenant_id RLS policies
# Verify: look for "CREATE POLICY" lines in output
```

### 4.5 Run Materialized Views

```bash
docker compose exec db psql -U teivaka -d teivaka_db \
  -f /migrations/03_materialized_views.sql

# Creates: cycle_financials, farm_dashboard_summary, worker_performance_summary
```

### 4.6 Run Database Functions

```bash
docker compose exec db psql -U teivaka -d teivaka_db \
  -f /migrations/05_functions.sql

# Creates: check_chemical_compliance(), validate_rotation(),
#          compute_cokg(), trigger_harvest_compliance_check()
```

**Critical functions to verify are created:**
```bash
docker compose exec db psql -U teivaka -d teivaka_db -c \
  "SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' ORDER BY routine_name;"
```

### 4.7 Run Seed Data

```bash
docker compose exec db psql -U teivaka -d teivaka_db \
  -f /migrations/04_seed_data.sql

# Seeds: 49 productions, 370+ stage protocols, 1444 actionable rules,
#        43 automation rules, 2 farms, 2 farm units initial data, price master
```

### 4.8 Verify Production Count

```bash
docker compose exec db psql -U teivaka -d teivaka_db -c \
  "SELECT COUNT(*) FROM shared.productions;"

# MUST return: 49
# If not 49: STOP — re-run seed data, check for SQL errors
```

### 4.9 Enable TimescaleDB Hypertables

```bash
docker compose exec db psql -U teivaka -d teivaka_db -c "
  SELECT create_hypertable('weather_log', 'recorded_at', if_not_exists => TRUE);
  SELECT create_hypertable('harvest_log', 'harvest_date', if_not_exists => TRUE);
  SELECT create_hypertable('field_events', 'event_date', if_not_exists => TRUE);
  SELECT create_hypertable('labor_attendance', 'work_date', if_not_exists => TRUE);
  SELECT create_hypertable('cash_ledger', 'transaction_date', if_not_exists => TRUE);
  SELECT create_hypertable('decision_signal_snapshots', 'snapshot_date', if_not_exists => TRUE);
"

# Verify hypertables
docker compose exec db psql -U teivaka -d teivaka_db -c \
  "SELECT hypertable_name FROM timescaledb_information.hypertables;"
# Expected: 6 rows (weather_log, harvest_log, field_events, labor_attendance,
#            cash_ledger, decision_signal_snapshots)
```

### 4.10 Run Alembic Migrations

Start the API container first (needed to run Alembic):
```bash
docker compose up -d api

# Wait for API to be healthy, then run Alembic
docker compose exec api alembic upgrade head

# Verify: last line should be "INFO  [alembic.runtime.migration] Running upgrade ..."
# Check current revision
docker compose exec api alembic current
```

---

## Step 5 — Full Stack Deployment

### 5.1 Build All Images

```bash
cd /home/teivaka/teivaka-api

docker compose build

# This builds: api, worker-automation, worker-notifications, beat, frontend
# Expected build time: 5-10 minutes on CAX21
# ARM64 images are built natively — no emulation needed
```

### 5.2 Start All Services

```bash
docker compose up -d

# Services started:
# db (PostgreSQL 16 + TimescaleDB + pgvector)
# redis (Redis 7.2)
# api (FastAPI, 4 workers via Gunicorn/Uvicorn)
# worker-automation (Celery: automation queue)
# worker-notifications (Celery: notifications queue)
# beat (Celery Beat scheduler)
# caddy (Reverse proxy + SSL)
# frontend (React 18 PWA served as static)
```

### 5.3 Verify All Services Healthy

```bash
docker compose ps

# All services MUST show STATUS: running (healthy)
# If any shows "starting" → wait 60 seconds and check again
# If any shows "unhealthy" → check logs: docker compose logs <service-name>
```

Expected output:
```
NAME                    SERVICE              STATUS              PORTS
teivaka-api-1           api                  running (healthy)   8000/tcp
teivaka-beat-1          beat                 running (healthy)
teivaka-caddy-1         caddy                running (healthy)   0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
teivaka-db-1            db                   running (healthy)   5432/tcp
teivaka-frontend-1      frontend             running (healthy)
teivaka-redis-1         redis                running (healthy)   6379/tcp
teivaka-worker-auto-1   worker-automation    running (healthy)
teivaka-worker-notif-1  worker-notifications running (healthy)
```

### 5.4 Test API Health Endpoint

```bash
curl -s https://api.teivaka.com/api/v1/health | python3 -m json.tool

# Expected response:
# {
#   "status": "healthy",
#   "db": "connected",
#   "redis": "connected",
#   "version": "1.0.0",
#   "environment": "production",
#   "timestamp_utc": "...",
#   "timestamp_fiji": "..."
# }
```

### 5.5 Test Authentication

```bash
curl -s -X POST https://api.teivaka.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "cody@teivaka.com", "password": "<cody-password>"}' | \
  python3 -m json.tool

# Expected: {"access_token": "eyJ...", "token_type": "bearer", "user": {...}}
# If 401: user not seeded — run seed_users.sql
# If 500: check api logs: docker compose logs api
```

### 5.6 Verify Caddy SSL Certificate

```bash
curl -v https://api.teivaka.com/api/v1/health 2>&1 | grep -E "SSL|certificate|TLS|issuer"
# Expected: "Let's Encrypt" issuer, valid certificate

# Also verify in browser — padlock should show valid Let's Encrypt cert
```

**Note:** DNS for `api.teivaka.com` and `app.teivaka.com` must already point to the server's IPv4 address before Caddy can obtain SSL certificates. If DNS is not yet set, Caddy will fail silently on HTTPS. Set DNS A records first.

---

## Step 6 — Celery Workers Verification

### 6.1 Verify Automation Workers Running

```bash
docker compose logs worker-automation --tail=50

# Look for:
# "celery@worker-automation ready."
# "Connected to redis://redis:6379/0"
# No ERROR lines on startup
```

### 6.2 Verify Beat Scheduler

```bash
docker compose logs beat --tail=50

# Look for scheduled tasks being registered:
# "beat: Starting..."
# "Scheduler: Sending due task automation_engine.run_daily_scan"
# Schedule includes:
#   - run_daily_automation_scan: every 15 minutes
#   - run_decision_engine: daily 18:05 UTC (6:05 AM Fiji)
#   - run_ferry_buffer_scan: every Monday 20:00 UTC (8:00 AM Fiji Tuesday)
#   - refresh_materialized_views: every 30 minutes
```

### 6.3 Inspect Active Celery Workers

```bash
docker compose exec worker-automation celery -A app.celery_app inspect active

# Expected: {"celery@worker-automation": []} (no tasks in-flight right now)
# If command hangs: Redis may not be reachable from worker container
```

### 6.4 Verify Redis Queue

```bash
docker compose exec redis redis-cli llen celery

# Expected: 0 (no tasks queued at idle)

# Check Redis is accepting connections
docker compose exec redis redis-cli ping
# Expected: PONG
```

---

## Step 7 — Data Migration from TFOS v7.0

### 7.1 Upload TFOS v7.0 Spreadsheet

```bash
# From your local machine (not the server):
scp /path/to/tfos_v7.xlsx teivaka@<server-ip>:/home/teivaka/

# Verify on server:
ls -la /home/teivaka/tfos_v7.xlsx
```

### 7.2 Run Shared Data Extraction

```bash
docker compose exec api python migration_scripts/extract_shared_data.py \
  --input /home/teivaka/tfos_v7.xlsx \
  --output /home/teivaka/migration_output/shared/

# Extracts:
# - shared.productions (49 crops)
# - shared.production_stages (370+ stages)
# - shared.actionable_rules (1444 rules)
# - shared.chemical_library
# - shared.price_master
```

### 7.3 Run Tenant Data Extraction

```bash
docker compose exec api python migration_scripts/extract_tenant_data.py \
  --input /home/teivaka/tfos_v7.xlsx \
  --tenant-id <teivaka-tenant-uuid> \
  --output /home/teivaka/migration_output/tenant/

# Extracts:
# - farms (F001, F002)
# - farm_units (49 PUs across both farms)
# - workers (11 workers)
# - customers (16, excluding CUS-016 deduplicated)
# - production_cycles (7 active cycles)
# - automation_rules (43 rules)
# - decision_signal_config (10 signals)
```

### 7.4 Load All Data to PostgreSQL

```bash
docker compose exec api python migration_scripts/load_to_postgres.py \
  --phase all \
  --tenant-id <teivaka-tenant-uuid> \
  --input-dir /home/teivaka/migration_output/

# --phase all runs: shared → farms → units → workers → customers → cycles → rules → signals
# Each phase logs: "Loaded X records into TABLE"
# On error: script halts, shows offending row — fix and re-run specific phase only
```

### 7.5 Post-Load Validation

Run all validation queries from Step 8 (below) immediately after load_to_postgres completes.

---

## Step 8 — Validation Queries

Run ALL of the following after data migration. Every query has an expected result. Do not proceed to production use until all pass.

```sql
-- Connect to database
-- docker compose exec db psql -U teivaka -d teivaka_db

-- 1. Shared productions
SELECT COUNT(*) FROM shared.productions;
-- EXPECT: 49

-- 2. Actionable rules (rotation matrix)
SELECT COUNT(*) FROM shared.actionable_rules;
-- EXPECT: ~1444 (varies by version, but must be > 1440)

-- 3. Total automation rules
SELECT COUNT(*) FROM automation_rules;
-- EXPECT: 43

-- 4. Active automation rules
SELECT COUNT(*) FROM automation_rules WHERE is_active = true;
-- EXPECT: 38

-- 5. Inactive automation rules (aquaculture + pig)
SELECT COUNT(*) FROM automation_rules WHERE is_active = false;
-- EXPECT: 5 (RULE-024, RULE-025, RULE-026, RULE-027, RULE-028)

-- 6. Worker count
SELECT COUNT(*) FROM workers;
-- EXPECT: 9 (permanent + contract roster, not including contractor crew)
-- If 11: both permanent and occasional crew included — check with Cody

-- 7. Customer count
SELECT COUNT(*) FROM customers;
-- EXPECT: 16
-- Note: CUS-016 was a duplicate in v7.0, deduplicated during migration

-- 8. CUS-016 deduplication verify
SELECT * FROM customers WHERE id = 'CUS-016';
-- EXPECT: 0 rows (zero rows — confirming deduplication fix applied)

-- 9. Active production cycles
SELECT COUNT(*) FROM production_cycles WHERE cycle_status = 'active';
-- EXPECT: 7
-- (CRP-CAS/F001-PU001, CRP-EGG/F001-PU002, CRP-EGG/F001-PU003,
--  FRT-PIN/F002-PU004, LIV-API/F001-PU011,
--  CRP-KAV/F002-PU006, CRP-KAV/F002-PU007)

-- 10. Fixed RULE-031 and RULE-032 values (had column mapping errors in v7.0)
SELECT rule_id, trigger_category, severity
FROM automation_rules
WHERE rule_id IN ('RULE-031', 'RULE-032', 'RULE-042', 'RULE-043');
-- EXPECT: All 4 rows returned with correct trigger_category and severity
-- RULE-042 and RULE-043 had column mapping errors — verify fixed values

-- 11. Decision engine signals
SELECT signal_name FROM decision_signal_config WHERE signal_name IS NOT NULL;
-- EXPECT: 10 rows
-- (GrossMarginPct, DaysSinceLastHarvest, OpenAlertsCount, WeeklyLogActivity,
--  LaborCostRatio, ActiveCyclesCount, NurseryStatus, WeatherStress,
--  CashPosition, InputStockLevel)

-- 12. CRP-KAV inactivity threshold
SELECT inactivity_alert_days
FROM shared.production_thresholds
WHERE production_id = 'CRP-KAV';
-- EXPECT: 180
-- CRITICAL: If this returns 7, the default threshold is wrong — fix immediately

-- 13. F001 and F002 farm units exist
SELECT farm_id, COUNT(*) as unit_count
FROM farm_units
GROUP BY farm_id
ORDER BY farm_id;
-- EXPECT: F001 has ~11 PUs, F002 has ~8 PUs (exact counts from v7.0 sheet)

-- 14. RLS policy check — tenant isolation
SET app.current_tenant_id = '<teivaka-tenant-uuid>';
SELECT COUNT(*) FROM production_cycles;
-- EXPECT: returns only rows for teivaka tenant

-- 15. TimescaleDB hypertables
SELECT hypertable_name FROM timescaledb_information.hypertables;
-- EXPECT: 6 rows (weather_log, harvest_log, field_events,
--          labor_attendance, cash_ledger, decision_signal_snapshots)

-- 16. pgvector extension installed
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
-- EXPECT: 1 row (vector, 0.x.x)

-- 17. Automation rules severity distribution
SELECT severity, COUNT(*) FROM automation_rules GROUP BY severity ORDER BY severity;
-- EXPECT: CRITICAL ~3, HIGH ~12, MEDIUM ~20, LOW ~8 (exact from seed data)

-- 18. Active cycles per farm
SELECT f.farm_id, f.farm_name, COUNT(pc.cycle_id) as active_cycles
FROM farms f
LEFT JOIN production_cycles pc ON pc.farm_id = f.farm_id AND pc.cycle_status = 'active'
GROUP BY f.farm_id, f.farm_name;
-- EXPECT: F001: 5 active cycles, F002: 2 active cycles (CRP-KAV x2 + FRT-PIN... varies)
```

---

## Step 9 — Monitoring Setup

### 9.1 Sentry Error Tracking

```bash
# Add Sentry DSN to .env
nano /home/teivaka/teivaka-api/.env
# Set: SENTRY_DSN=https://xxxxx@xxxxxxx.ingest.sentry.io/xxxxxxx

# Restart API to pick up new env var
docker compose restart api

# Trigger a test error (use Sentry test endpoint)
curl -X POST https://api.teivaka.com/api/v1/debug/sentry-test \
  -H "Authorization: Bearer <founder-jwt>"
# Check Sentry dashboard — should see "Test error from teivaka-api" within 30 seconds
```

### 9.2 Docker Resource Monitoring

```bash
# Snapshot resource usage
docker stats --no-stream

# Expected healthy ranges on CAX21 (8GB RAM):
# db:                   1.5-3GB RAM, CPU 5-20%
# api:                  300-500MB RAM, CPU 5-15%
# worker-automation:    200-400MB RAM, CPU 1-5% (idle)
# worker-notifications: 150-300MB RAM, CPU 1-5% (idle)
# redis:                100-300MB RAM, CPU <1%
# beat:                 100-200MB RAM, CPU <1%
# caddy:                50-150MB RAM, CPU <1%
# TOTAL should not exceed 7GB (leave 1GB for OS)
```

### 9.3 PostgreSQL Connection Monitoring

```bash
docker compose exec db psql -U teivaka -d teivaka_db -c \
  "SELECT state, count(*) FROM pg_stat_activity GROUP BY state;"

# Healthy:
# active:  < 10 connections (at idle)
# idle:    < 20 connections
# TOTAL:   < 50 connections (hard limit before performance degrades on CAX21)

# If total > 50: add PgBouncer connection pooler (Phase 2 upgrade)
```

### 9.4 Celery Worker Stats

```bash
docker compose exec worker-automation \
  celery -A app.celery_app inspect stats

# Shows: pool size, processed task count, registered tasks, uptime
# Verify: pool_size = 4 (configured for CAX21 4 vCPU)
```

### 9.5 Key Metrics to Watch

| Metric | Healthy | Warning | Critical | Action |
|--------|---------|---------|----------|--------|
| API response time p95 | < 200ms | < 500ms | > 500ms | Scale up API workers or cache |
| DB connections | < 20 | < 50 | > 50 | Add PgBouncer |
| Redis memory | < 500MB | < 1GB | > 2GB | Check Celery result backend TTL |
| CPU average (all cores) | < 40% | < 70% | > 70% | Upgrade to CAX31 (Phase 2) |
| Disk usage /mnt/data | < 50GB | < 65GB | > 70GB | Expand Hetzner Volume |
| Failed Celery tasks | 0 | < 3/day | > 3/day | Check worker logs, check Sentry |
| WhatsApp delivery rate | > 99% | > 95% | < 95% | Check Twilio dashboard |

---

## Step 10 — Backup Procedure

### 10.1 Create Backup Script

```bash
cat > /home/teivaka/backup.sh << 'EOF'
#!/bin/bash
set -euo pipefail

BACKUP_DIR=/mnt/data/backups
DATE=$(date +%Y%m%d_%H%M%S)
COMPOSE_DIR=/home/teivaka/teivaka-api
BACKUP_FILE="$BACKUP_DIR/teivaka_$DATE.sql.gz"

echo "[$(date)] Starting backup..."

# Create backup directory if not exists
mkdir -p "$BACKUP_DIR"

# Dump database
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T db \
  pg_dump -U teivaka teivaka_db | gzip > "$BACKUP_FILE"

echo "[$(date)] Backup completed: $BACKUP_FILE"
echo "[$(date)] Backup size: $(du -sh $BACKUP_FILE | cut -f1)"

# Delete backups older than 30 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
echo "[$(date)] Old backups cleaned (kept last 30 days)"

# List current backups
echo "[$(date)] Current backups:"
ls -lh "$BACKUP_DIR"/*.sql.gz
EOF

chmod +x /home/teivaka/backup.sh
```

Test the backup script:
```bash
/home/teivaka/backup.sh
# Expected: creates /mnt/data/backups/teivaka_YYYYMMDD_HHMMSS.sql.gz
# Verify backup is valid:
gunzip -c /mnt/data/backups/teivaka_*.sql.gz | head -5
# Expected: starts with "-- PostgreSQL database dump"
```

### 10.2 Schedule Backup via Cron

```bash
# Edit crontab for teivaka user
crontab -e

# Add this line:
# 2am Fiji time = 2pm UTC (UTC+12, so 14:00 UTC = 02:00 Fiji)
0 14 * * * /home/teivaka/backup.sh >> /mnt/data/backups/backup.log 2>&1

# Verify cron is set
crontab -l
```

### 10.3 Test Restore Procedure

Run this test quarterly on a staging server (NOT production) to verify backups are restorable:

```bash
# Restore procedure (DO NOT RUN ON PRODUCTION DB):
# 1. Copy backup to staging server
# 2. Create empty staging database
# 3. Restore:
gunzip -c /mnt/data/backups/teivaka_YYYYMMDD_HHMMSS.sql.gz | \
  docker compose exec -T db psql -U teivaka teivaka_db_staging

# 4. Verify restore
docker compose exec db psql -U teivaka -d teivaka_db_staging -c \
  "SELECT COUNT(*) FROM shared.productions;"
# Expected: 49
```

---

## Step 11 — First Run Checklist

Complete this checklist in order. Each item must pass before moving to the next.

```
Infrastructure
  □ All 9 Docker services show STATUS: running (healthy) in docker compose ps
  □ API responds at https://api.teivaka.com/api/v1/health with {"status": "healthy"}
  □ SSL certificate valid — browser shows padlock, no warnings
  □ Disk space: /mnt/data has at least 20GB free (df -h /mnt/data)

Authentication
  □ Cody (Uraia Koroi Kama) can login with founder credentials
  □ JWT returned is valid (200 response, token field present)
  □ GET /api/v1/auth/me returns Cody's profile with role=FOUNDER

Farm Data
  □ Farm dashboard loads (F001 Save-A-Lot Farm visible)
  □ Farm dashboard loads (F002 Viyasiyasi Farm visible)
  □ F001 and F002 are tenant-isolated: query F001 data returns ONLY F001 records
  □ 7 active cycles showing correctly:
      CRP-CAS/F001-PU001, CRP-EGG/F001-PU002, CRP-EGG/F001-PU003,
      FRT-PIN/F002-PU004, LIV-API/F001-PU011,
      CRP-KAV/F002-PU006, CRP-KAV/F002-PU007
  □ 43 automation rules seeded (38 active, 5 inactive)
  □ Decision Engine snapshot generated — run manually for first time:
      docker compose exec worker-automation celery -A app.celery_app call
      automation.tasks.run_decision_engine --args='["<tenant-id>"]'

Critical Rule Verification
  □ CRP-KAV cycles NOT showing harvest gap alerts (threshold = 180 days, not 7)
  □ SELECT inactivity_alert_days FROM shared.production_thresholds
      WHERE production_id = 'CRP-KAV'; → returns 180
  □ Chemical compliance trigger function exists:
      SELECT * FROM pg_trigger WHERE tgname = 'harvest_compliance_check';

Integrations
  □ WhatsApp integration: send test message to W-001 (+6797336211)
      curl -X POST https://api.teivaka.com/api/v1/debug/whatsapp-test
      -d '{"phone": "+6797336211", "message": "Teivaka TFOS deployment test"}'
  □ Test voice command: POST /api/v1/tis/command with audio file
      Verify Whisper transcription completes
      Verify TIS parses intent
      Verify field_event record created
      Total pipeline < 5 seconds

Backup
  □ Backup script runs successfully: /home/teivaka/backup.sh
  □ Backup file created in /mnt/data/backups/
  □ Cron job set for 14:00 UTC daily: crontab -l shows entry

Final Checks
  □ Sentry DSN configured and receiving test error
  □ docker stats shows total memory < 7GB
  □ PostgreSQL connections < 30 (at idle)
```

---

## Step 12 — Rollback Procedure

If the deployment fails at any step and cannot be resolved within 1 hour:

### 12.1 Stop New Services

```bash
cd /home/teivaka/teivaka-api
docker compose down

# Verify all containers stopped
docker ps
# Expected: no teivaka containers running
```

### 12.2 Restore Previous Version from Git

```bash
# Check available tags
git tag --sort=-version:refname | head -10

# Checkout previous stable tag
git checkout v<previous_version>
# e.g., git checkout v0.9.2

# Or checkout previous commit
git log --oneline -10
git checkout <previous-commit-hash>
```

### 12.3 Restore Database from Backup

```bash
# CAUTION: This overwrites the current database completely
# Only do this if the database was modified during the failed deployment

# Start only the db service
docker compose up -d db
sleep 15

# Drop and recreate database
docker compose exec db psql -U teivaka -c "DROP DATABASE IF EXISTS teivaka_db;"
docker compose exec db psql -U teivaka -c "CREATE DATABASE teivaka_db;"

# Restore from most recent backup
LATEST_BACKUP=$(ls -t /mnt/data/backups/*.sql.gz | head -1)
echo "Restoring from: $LATEST_BACKUP"
gunzip -c "$LATEST_BACKUP" | docker compose exec -T db psql -U teivaka teivaka_db

# Verify restore
docker compose exec db psql -U teivaka -d teivaka_db -c \
  "SELECT COUNT(*) FROM shared.productions;"
# Expected: 49
```

### 12.4 Restart Services on Previous Version

```bash
docker compose up -d

# Verify
docker compose ps
curl https://api.teivaka.com/api/v1/health
```

### 12.5 Post-Rollback Actions

1. Document what failed and at which step
2. Alert Cody via WhatsApp: "Deployment rolled back to vX.X.X — investigating failure"
3. Review Docker logs from the failed deployment: `docker compose logs api 2>&1 | grep ERROR`
4. Fix the issue in a development environment before attempting re-deployment
5. Do not attempt re-deployment until root cause is identified

---

## Appendix A — Common Errors and Fixes

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| `db unhealthy` on startup | PostgreSQL not ready yet | Wait 30s, retry. Check `/mnt/data/postgres` permissions |
| `relation "shared.productions" does not exist` | Schema migration not run | Run Step 4.3 |
| `SSL: CERTIFICATE_VERIFY_FAILED` | DNS not pointing to server | Set DNS A records first |
| Celery beat not sending tasks | Redis connection failed | Check `docker compose logs redis` |
| `operator does not exist: vector <=>` | pgvector not installed | Run: `CREATE EXTENSION vector;` in psql |
| WhatsApp message not delivered | Twilio sandbox not configured | Verify TWILIO_ACCOUNT_SID in .env, check Twilio console |
| `tenant_id violation` | RLS policy blocking query | Set `app.current_tenant_id` session variable |
| `count = 0` for shared.productions | Seed data not run | Re-run Step 4.7 |
| API 500 on /auth/login | POSTGRES_PASSWORD mismatch | Verify .env matches pg_hba.conf |

## Appendix B — Service Port Reference (Internal Docker Network)

| Service | Internal Port | External Port | Protocol |
|---------|--------------|---------------|----------|
| PostgreSQL | 5432 | None (internal only) | TCP |
| Redis | 6379 | None (internal only) | TCP |
| FastAPI | 8000 | 443 via Caddy | HTTPS |
| React PWA | 3000 | 443 via Caddy | HTTPS |
| Caddy | 80, 443 | 80, 443 | HTTP/HTTPS |

## Appendix C — Environment Variable Quick Reference

All environment variables are documented in `.env.example` in the repository root. Never commit `.env` to Git. The `.env` file is in `.gitignore`.
