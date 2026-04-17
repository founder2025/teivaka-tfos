# FILE: 08_deployment/SCALING_PLAN.md

# Teivaka TFOS — Infrastructure Scaling Plan
**Platform:** Teivaka Agricultural TOS, Fiji
**Base Infrastructure:** Hetzner Cloud (ARM64-first strategy)
**Last Updated:** 2026-04-07

---

## Overview

This document defines the four-phase scaling plan for Teivaka TFOS infrastructure. Each phase is triggered by specific metric thresholds, not by time. Do not upgrade infrastructure before triggers are met — premature scaling wastes the budget that should go to farm operations.

**Design principle:** Hetzner ARM64 first (best price/performance ratio). Horizontal scaling before vertical where possible. PostgreSQL + TimescaleDB is the data tier backbone at all phases — do not introduce alternative databases unless Phase 4 sharding requirements genuinely demand it.

---

## Phase 1 — MVP: Single VPS, Teivaka Internal Operations

### Scope
- **Users:** Teivaka staff only — Cody + field workers
- **Farms:** F001 (Save-A-Lot, Serua) + F002 (Viyasiyasi, Kadavu)
- **Concurrent users:** Up to 10
- **Tenants:** Single tenant (Teivaka PTE LTD)
- **Timeline:** Launch to first 6 months of operation

### Infrastructure

| Component | Specification | Cost |
|-----------|--------------|------|
| VPS | Hetzner CAX21 — 4 vCPU ARM64, 8GB RAM, 80GB SSD | €7.49/mo |
| Volume | Hetzner Volume — 80GB (postgres_data + backups) | €3.84/mo |
| Bandwidth | Hetzner included — 20TB/mo | included |
| Domain/DNS | Cloudflare free tier (DNS only, no proxying needed at Phase 1) | free |
| SSL | Caddy + Let's Encrypt (automatic) | free |
| **Total infrastructure** | | **~€11/mo** |

### Database Architecture
- **Engine:** PostgreSQL 16 + TimescaleDB 2.x + pgvector
- **Single instance:** No read replicas at this phase
- **No connection pooler:** FastAPI async SQLAlchemy handles connection efficiency
- **Backup:** nightly pg_dump to /mnt/data/backups, 30-day retention
- **Max connections:** PostgreSQL `max_connections = 100`, FastAPI pool size = 10

### Application Architecture
```
Internet → Caddy (TLS termination)
             ├── api.teivaka.com → FastAPI (1 container, 4 uvicorn workers)
             └── app.teivaka.com → React PWA (static files served by Caddy)

FastAPI → PostgreSQL (direct, no pooler)
FastAPI → Redis (session store + Celery broker)

Celery Beat → automation queue → worker-automation (4 worker processes)
           → notifications queue → worker-notifications (2 worker processes)
```

### Celery Worker Configuration (Phase 1)
```
worker-automation:
  concurrency: 4
  queues: [automation, decision_engine]

worker-notifications:
  concurrency: 2
  queues: [notifications, whatsapp]

beat:
  schedule: Celerybeat (stored in Redis)
```

All Celery workers run on the same VPS. This is acceptable at Phase 1 — automation engine runs daily, not continuously.

### Monitoring (Phase 1)
- **Sentry:** Application error tracking (Sentry free tier: 5K errors/month)
- **Docker stats:** Manual health checks (`docker stats --no-stream`)
- **Caddy access logs:** Request log review (stored in container)
- **Cron job:** daily backup with log output to `/mnt/data/backups/backup.log`

No Prometheus/Grafana at Phase 1 — overkill for 10 concurrent users.

### Claude API Cost Estimate (Phase 1)
- TIS voice commands: ~20/day × $0.003/request = $0.06/day
- TIS chat queries: ~10/day × $0.003/request = $0.03/day
- **Monthly Claude API:** ~$3/month (internal use only at Phase 1)

### Phase 1 Upgrade Triggers
Upgrade to Phase 2 when ANY of the following is true for 2 consecutive weeks:
- More than 5 farms onboarded
- More than 50 concurrent users
- PostgreSQL CPU consistently above 60% (check with `docker stats`)
- API p95 response time consistently above 800ms
- Redis memory above 1GB
- Disk usage above 60GB on /mnt/data

---

## Phase 2 — Fiji Scale: 5-50 Farms, Fiji-Wide Launch

### Scope
- **Users:** 50-200 concurrent users
- **Farms:** 5-50 farms (Fiji farming cooperatives, NGOs, independent farmers)
- **Tenants:** 5-50 tenants (multi-tenant fully active)
- **Markets:** Fiji-wide public launch, BASIC + PREMIUM subscription tiers active
- **Revenue context:** Needs to generate FJD 2,000-8,000/month to cover operating costs

### Infrastructure Changes

| Change | From | To | Monthly Cost Delta |
|--------|------|----|--------------------|
| VPS upgrade | CAX21 (4 vCPU, 8GB) | CAX31 (8 vCPU, 16GB) | +€8.41 |
| Volume expansion | 80GB | 500GB | +€19.20 |
| Celery worker VPS | (same VPS) | Separate CAX21 | +€7.49 |
| PgBouncer | None | Container on api VPS | free |
| CDN | None | Cloudflare free tier (PWA static) | free |
| **Phase 2 infra total** | €11/mo | **~€50/mo** | +€39 |

### Database Changes

#### PgBouncer Connection Pooling
```ini
# pgbouncer.ini
[databases]
teivaka_db = host=db port=5432 dbname=teivaka_db

[pgbouncer]
pool_mode = transaction
max_client_conn = 200
default_pool_size = 20
min_pool_size = 5
reserve_pool_size = 5
listen_port = 6432
auth_type = scram-sha-256
```

Update FastAPI database URL to point to PgBouncer (port 6432) instead of PostgreSQL directly (port 5432). This allows 200 app-level connections while PostgreSQL only sees 20-25 actual connections.

#### Read Replica for Analytics

Add a Hetzner CAX11 (2 vCPU, 4GB RAM, €3.79/mo) as PostgreSQL streaming replication standby:
```sql
-- On primary: enable replication
ALTER SYSTEM SET wal_level = replica;
ALTER SYSTEM SET max_wal_senders = 3;
ALTER SYSTEM SET wal_keep_size = '256MB';

-- Create replication user
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD '<password>';
```

Route analytics/reporting queries (GET /farms/{id}/reports, GET /cycles/{id}/financials historic) to read replica. Write operations (POST, PUT, DELETE) always go to primary.

#### TimescaleDB Compression Policy
```sql
-- Compress chunks older than 7 days (saves 90-95% storage)
SELECT add_compression_policy('weather_log', INTERVAL '7 days');
SELECT add_compression_policy('harvest_log', INTERVAL '7 days');
SELECT add_compression_policy('field_events', INTERVAL '7 days');
SELECT add_compression_policy('labor_attendance', INTERVAL '7 days');
SELECT add_compression_policy('cash_ledger', INTERVAL '7 days');
SELECT add_compression_policy('decision_signal_snapshots', INTERVAL '30 days');
```

#### pgvector Index Optimization for KB Search
```sql
-- Phase 1: basic index
CREATE INDEX ON shared.kb_articles
  USING ivfflat (embedding_vector vector_cosine_ops)
  WITH (lists = 100);

-- Phase 2: increase lists as KB grows beyond 200 articles
-- Reindex when article count > 200
REINDEX INDEX CONCURRENTLY kb_articles_embedding_vector_idx;
-- Then rebuild with larger lists parameter
DROP INDEX kb_articles_embedding_vector_idx;
CREATE INDEX ON shared.kb_articles
  USING ivfflat (embedding_vector vector_cosine_ops)
  WITH (lists = 200);
```

### Application Changes (Phase 2)

#### API Response Caching
Add Redis caching for KB endpoints (content changes rarely):
```python
# Cache KB article retrieval for 1 hour
@router.get("/knowledge/articles/{article_id}")
@cache(expire=3600)
async def get_article(article_id: str):
    ...

# Cache price master for 6 hours
@router.get("/knowledge/price-master")
@cache(expire=21600)
async def get_price_master():
    ...
```

Do NOT cache:
- Farm dashboard (real-time data)
- Alert endpoints (must be fresh)
- Any POST/PUT/DELETE endpoints

#### CDN for PWA Static Assets
Configure Cloudflare (free tier) in front of `app.teivaka.com`:
- PWA static files (JS bundles, CSS, images): Cloudflare edge cache
- API subdomain (`api.teivaka.com`): Cloudflare DNS-only (grey cloud), no proxying — latency sensitive
- Supabase Storage for media files already has CDN via Supabase

#### Subscription Billing Activation
- Stripe integration active for BASIC (FJD 49/mo) and PREMIUM (FJD 149/mo) tiers
- Feature gates enforced at API middleware level (check subscription tier on each request)
- FREE tier: 5 TIS queries/day, simplified dashboard, no voice commands
- BASIC tier: 20 TIS queries/day, full dashboard, voice commands
- PREMIUM tier: unlimited TIS queries, Decision Engine full access, export

### Monitoring (Phase 2)
Deploy Prometheus + Grafana stack:

```yaml
# Add to docker-compose.yml on monitoring VPS (or add as extra containers)
prometheus:
  image: prom/prometheus:latest
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml

grafana:
  image: grafana/grafana:latest
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=<admin-password>
```

Key Prometheus metrics to scrape:
- FastAPI: request duration histogram, error rate counter
- PostgreSQL: `pg_stat_activity`, `pg_stat_database` via postgres_exporter
- Redis: `redis_connected_clients`, `redis_memory_used_bytes` via redis_exporter
- Celery: task counts via Flower or custom metrics

**Alert thresholds (Phase 2):**
- API p95 > 1,000ms → PagerDuty/WhatsApp alert to Cody
- Error rate > 1% over 5 minutes → CRITICAL alert
- DB connections > 150 → WARNING
- Disk usage > 80% → HIGH alert

### Claude API Cost Estimate (Phase 2)
- TIS voice commands: 200/day × $0.003 = $0.60/day
- TIS chat queries: 500/day × $0.002 = $1.00/day
- KB embeddings (one-time + updates): ~500 articles × $0.0001 = negligible
- **Monthly Claude API:** ~$50-80/month at 50 farms

### Phase 2 Upgrade Triggers
Upgrade to Phase 3 when ANY of the following is true for 2 consecutive weeks:
- More than 50 farms onboarded
- More than 200 concurrent users
- Need for High Availability (single VPS outage causes business impact)
- Expansion to non-Fiji markets (Vanuatu, Samoa, Tonga)
- Enterprise clients requiring SLA (99.9% uptime guarantee)

---

## Phase 3 — Pacific Regional: 50-500 Farms, Pacific Islands

### Scope
- **Users:** Up to 2,000 concurrent users
- **Farms:** 50-500 farms across Pacific Island nations
- **Markets:** Fiji, Vanuatu, Samoa, Tonga, Solomon Islands, potentially PNG
- **Infrastructure model:** Kubernetes (k3s lightweight cluster)

### Infrastructure Architecture

```
                          ┌─────────────────────┐
Internet ──► Hetzner LB ──►   k3s API Pods       │
                          │   (3-10 replicas)    │
                          └────────┬────────────-┘
                                   │
              ┌────────────────────┼──────────────────────┐
              │                    │                      │
       ┌──────┴──────┐    ┌────────┴───────┐    ┌────────┴───────┐
       │ DB Primary  │    │  Read Replica 1 │    │ Read Replica 2 │
       │ CCX23       │    │  CAX21          │    │ CAX21          │
       │ 8vCPU,32GB  │    │ Analytics       │    │ Reporting      │
       └─────────────┘    └─────────────────┘    └─────────────────┘
              │
       ┌──────┴──────┐    ┌─────────────────┐
       │ Redis Cluster│    │ Celery Workers  │
       │ 3-node       │    │ (k8s Deployment)│
       └─────────────┘    └─────────────────┘
```

### Kubernetes Cluster (k3s)

**Node configuration:**
| Node | Type | Role | Purpose | Cost |
|------|------|------|---------|------|
| k3s-control-01 | CCX23 (8 vCPU, 16GB) | Control plane + worker | API pods | €23.10/mo |
| k3s-worker-01 | CCX23 (8 vCPU, 16GB) | Worker | API pods + Beat | €23.10/mo |
| k3s-worker-02 | CAX41 (16 vCPU ARM64, 32GB) | Worker | Celery workers | €29.90/mo |

**Hetzner Load Balancer (Layer 7):**
- Routes `api.teivaka.com` to API pods
- Health check: GET /api/v1/health every 10s
- Sticky sessions: disabled (stateless API with JWT)
- SSL termination at Caddy (still used per pod) or move to LB level
- Cost: €5.83/mo

### Database Scaling (Phase 3)

**Dedicated database server:**
| Component | Specification | Cost |
|-----------|--------------|------|
| Primary DB | Dedicated AX41 (4-core/8-thread, 64GB RAM, 2×512GB NVMe) | ~€59/mo |
| Read Replica 1 | CCX23 (8 vCPU, 16GB RAM) | €23.10/mo |
| Read Replica 2 | CCX23 (8 vCPU, 16GB RAM) | €23.10/mo |

**PostgreSQL Streaming Replication (synchronous):**
```sql
-- On primary postgresql.conf:
synchronous_commit = on
synchronous_standby_names = 'FIRST 1 (replica1, replica2)'
wal_level = replica
max_wal_senders = 5
```

**Distributed TimescaleDB hypertables:**
```sql
-- Add TimescaleDB multi-node data node
SELECT add_data_node('data_node_1', host => 'db-replica-1');
SELECT add_data_node('data_node_2', host => 'db-replica-2');

-- Convert key time-series tables to distributed hypertables
SELECT create_distributed_hypertable(
  'weather_log', 'recorded_at',
  partitioning_column => 'farm_id',
  number_partitions => 4
);
```

**TimescaleDB Continuous Aggregates (replaces expensive dashboard queries):**
```sql
-- Farm daily summary aggregate (refreshes every hour)
CREATE MATERIALIZED VIEW farm_daily_summary
WITH (timescaledb.continuous) AS
SELECT
  farm_id,
  time_bucket('1 day', harvest_date) AS day,
  SUM(quantity_kg) AS total_harvest_kg,
  SUM(revenue_fjd) AS total_revenue_fjd,
  COUNT(*) AS harvest_count
FROM harvest_log
GROUP BY farm_id, time_bucket('1 day', harvest_date);

SELECT add_continuous_aggregate_policy('farm_daily_summary',
  start_offset => INTERVAL '7 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour'
);
```

### Kubernetes Horizontal Pod Autoscaling
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: teivaka-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: teivaka-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 70
```

### Blue/Green Deployment (Phase 3)
```bash
# Blue-green via Kubernetes
kubectl set image deployment/teivaka-api api=teivaka/api:v2.0.0

# Monitor rollout
kubectl rollout status deployment/teivaka-api

# Rollback if issues
kubectl rollout undo deployment/teivaka-api
```

### Multi-Region Considerations (Phase 3)
- **CDN:** Cloudflare (Pro tier, ~$20/mo) for global static asset delivery
- **API:** Single region (Nuremberg). Latency from Pacific to Nuremberg is acceptable (~200ms) for farm management use case
- **WhatsApp:** Twilio regional routing — Pacific users route through Singapore-region Twilio infrastructure
- **Future:** If latency becomes user complaint, evaluate Hetzner Singapore (SIN1) addition in Phase 4

### Claude API Cost Estimate (Phase 3)
- TIS commands: 2,000/day × $0.003 = $6/day
- TIS chat: 5,000/day × $0.002 = $10/day
- KB embeddings (ongoing new articles): ~$10/month
- **Monthly Claude API:** ~$480-600/month at 500 farms

### Phase 3 Upgrade Triggers
Upgrade to Phase 4 when ANY of the following is true:
- More than 500 farms onboarded
- Expansion to 5+ Pacific island nations
- Enterprise clients (government, large NGOs) with multi-region data residency requirements
- Revenue exceeds FJD 200,000/month (justifies infrastructure investment)

---

## Phase 4 — Global / Multi-Region: 500+ Farms, Global Reach

### Scope
- **Users:** Unlimited (auto-scaling)
- **Farms:** 500+ farms globally
- **Markets:** Any tropical agriculture region (Southeast Asia, Caribbean, West Africa)
- **Target clients:** Institutional investors, international NGOs (World Bank, FAO, ADB), government programs

### Infrastructure Architecture

```
              ┌─────────────────────────────────────────────────────┐
              │               Cloudflare (Global Edge)              │
              │  DDoS protection + WAF + Global load balancing      │
              └──────────────────┬──────────────────────────────────┘
                                 │
               ┌─────────────────┴──────────────────┐
               │                                    │
    ┌──────────┴───────────┐            ┌───────────┴────────────┐
    │   Hetzner Nuremberg  │            │  Hetzner Singapore     │
    │   (EU/Africa/Pacific)│            │  (Asia-Pacific)        │
    │                      │            │                        │
    │  API Cluster (k8s)   │            │  API Cluster (k8s)     │
    │  DB Primary          │◄──────────►│  DB Read Replica       │
    │  Community Service   │            │  TIS Service           │
    └──────────────────────┘            └────────────────────────┘
```

### Database Architecture (Phase 4)

**Option A: Citus Sharding (PostgreSQL-native)**
```sql
-- Citus distributed PostgreSQL
-- Shard by tenant_id (each tenant's data on one shard)
SELECT create_distributed_table('production_cycles', 'tenant_id');
SELECT create_distributed_table('harvest_log', 'tenant_id');
SELECT create_distributed_table('alerts', 'tenant_id');

-- Reference tables (shared across all shards)
SELECT create_reference_table('shared.productions');
SELECT create_reference_table('shared.actionable_rules');
```

**Option B: Stay with single large PostgreSQL + aggressive partitioning**
At 500 farms × 50 cycles × daily harvest logs, 5 years of data = ~500GB. A well-tuned PostgreSQL on a dedicated 128GB RAM server handles this without Citus. Evaluate actual data volumes before committing to Citus migration.

**TimescaleDB Multi-Node Across Regions:**
```sql
-- Add Singapore data node for read replicas
SELECT add_data_node('sg_data_node_1', host => 'db.sg.teivaka.internal');
```

**Cold Storage for Data > 2 Years:**
```sql
-- Archive policy: move chunks > 2 years to Hetzner Object Storage
-- Implemented via TimescaleDB tiered storage + custom archive task
```

### Microservices Split (Phase 4)

Split the monolithic FastAPI into focused services:

| Service | Purpose | Scaling Strategy |
|---------|---------|-----------------|
| `api-core` | Auth, farms, cycles, harvests, workers | HPA on CPU |
| `tis-service` | TIS AI module (voice, chat, analytics) | HPA on request count (Claude API heavy) |
| `community-service` | Marketplace, forum, price index | HPA on CPU |
| `automation-service` | Automation engine, Decision Engine, alerts | Dedicated workers |
| `kb-service` | Knowledge Base CRUD + RAG search | Cache-heavy, low replicas |

### GPU Instances for AI at Scale

If TIS embedding generation and vector search becomes a bottleneck (>10,000 KB articles):
- Move from text-embedding-3-small (OpenAI API) to self-hosted `bge-m3` or `e5-mistral` on GPU
- Hetzner GPU instance (GX1, NVIDIA L4): available in 2025 on demand
- Reduces embedding API costs from $10K/month to ~$2K/month at scale

### Knowledge Base Edge Caching
```javascript
// Cloudflare Workers KV for KB article caching
// Articles served from edge (near user) for <10ms response
// Cache TTL: 24 hours for published articles
// Invalidate on article update via Cloudflare API

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/v1/knowledge/articles/')) {
      const articleId = url.pathname.split('/').pop();
      const cached = await env.KB_CACHE.get(articleId);
      if (cached) return new Response(cached, { headers: { 'X-Cache': 'HIT' } });
      // Fetch from origin and cache
    }
  }
}
```

### Cost Projection at Phase 4

| Cost Component | Monthly Range |
|---------------|---------------|
| Hetzner (Nuremberg cluster) | €800-1,500 |
| Hetzner (Singapore cluster) | €400-800 |
| Cloudflare Pro + Workers | $50-200 |
| Claude API (claude-sonnet-4-20250514) | $10,000-30,000 |
| OpenAI Whisper (voice pipeline) | $500-2,000 |
| OpenAI Embeddings | $100-500 |
| Twilio WhatsApp | $500-2,000 |
| Supabase Storage | $100-400 |
| Sentry + Monitoring | $100-300 |
| **Total infrastructure + API** | **$12,000-37,000/month** |

**Revenue needed to sustain Phase 4:**
- Break-even at $37,000/month infrastructure cost
- At PREMIUM tier (FJD 149/mo ≈ USD 67/mo): need 500+ PREMIUM farms
- At CUSTOM tier (performance-linked, enterprise): 50 enterprise clients could cover costs
- Real profitability requires 1,000+ farms in the BASIC/PREMIUM mix

---

## Database Scaling Path Summary

| Phase | PostgreSQL Setup | Connection Strategy | Replication | Analytics |
|-------|-----------------|---------------------|-------------|-----------|
| 1 | Single instance, no pooler | SQLAlchemy async pool (10 conn) | None | Direct query |
| 2 | PgBouncer transaction mode | 200 clients → 20 DB connections | 1 read replica | Replica routing |
| 3 | Dedicated DB server | PgBouncer + PgPool-II | Streaming, 1 primary + 2 replicas | Continuous aggregates |
| 4 | Citus sharding or large single + partitioning | PgBouncer cluster | Multi-region | TimescaleDB multi-node |

---

## Cost Comparison Summary

| Phase | Infrastructure | Claude API | Total/mo | Farms Supported |
|-------|---------------|-----------|---------|-----------------|
| 1 | €11 (~$12) | ~$3 | ~$15 | 1-5 |
| 2 | ~€50 (~$55) | ~$65 | ~$120 | 5-50 |
| 3 | ~€300 (~$330) | ~$540 | ~$870 | 50-500 |
| 4 | ~€2,000-5,000 (~$2,200-5,500) | ~$15,000 | ~$17,000-20,000 | 500+ |

**Key insight:** Claude API costs dominate from Phase 3 onward. The single most important cost-optimization lever at scale is TIS query efficiency — caching common crop protocol responses and using KB RAG instead of direct Claude calls wherever possible.

---

## Architecture Decision Records (ADRs)

### ADR-001: ARM64 First Strategy
**Decision:** Use Hetzner ARM64 (CAX series) at all phases where available.
**Rationale:** CAX21 (ARM64) is 30% cheaper than equivalent CX31 (x86) with same or better performance for I/O-bound Python workloads. Docker images build natively on ARM64 (no emulation). FastAPI + Python 3.12 fully supports ARM64.
**Exception:** If a dependency requires x86 only (rare), use CCX series for that specific service only.

### ADR-002: PostgreSQL + TimescaleDB as Single Data Tier
**Decision:** Do not introduce separate time-series database (InfluxDB, etc.) or analytics database (ClickHouse, etc.) until Phase 4.
**Rationale:** TimescaleDB gives 90-95% of time-series optimization with zero additional operational complexity. Single database means single backup, single schema migration system, single monitoring setup. The cost of operational simplicity is higher than the marginal performance gain from specialized databases at Phases 1-3.

### ADR-003: Celery + Redis (not Kafka)
**Decision:** Use Celery 5.4 + Redis 7.2 as task queue. Do not introduce Kafka.
**Rationale:** At Phase 1-2 scale (43 automation rules, ~100 tasks/day), Kafka's operational overhead is not justified. Celery + Redis is simpler, better documented, and handles Teivaka's task volume easily. Revisit at Phase 4 if audit trail or event replay becomes a requirement.

### ADR-004: Monolith First, Microservices at Phase 4
**Decision:** Single FastAPI application through Phase 3. Microservices split only at Phase 4.
**Rationale:** Premature microservices decomposition creates distributed systems complexity (network partitions, distributed tracing, service discovery) that slows development. At 50 farms, a monolith with good internal module boundaries is faster to develop and easier to debug. Split when individual services have genuinely different scaling requirements.
