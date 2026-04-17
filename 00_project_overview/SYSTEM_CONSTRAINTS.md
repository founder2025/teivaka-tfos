# FILE: 00_project_overview/SYSTEM_CONSTRAINTS.md

# Teivaka TFOS — System Constraints Reference

> **Authority:** This document defines the hard limits, real-world constraints, and non-negotiable
> design boundaries that govern all TFOS infrastructure and implementation decisions.
> Every architectural choice must be evaluated against these constraints.
>
> **Company:** Teivaka PTE LTD, Fiji | Company No. 2025RC001894
> **Last Updated:** April 2026

---

## Table of Contents

1. [Infrastructure Specifications](#section-1-infrastructure-specifications)
2. [Connectivity Reality in Fiji](#section-2-connectivity-reality-in-fiji)
3. [File Upload Limits](#section-3-file-upload-limits)
4. [WhatsApp Rate Limits](#section-4-whatsapp-rate-limits)
5. [Concurrent User Limits](#section-5-concurrent-user-limits)
6. [Data Retention Policy](#section-6-data-retention-policy)
7. [Backup Schedule](#section-7-backup-schedule)
8. [Legacy TFOS Reference](#section-8-legacy-tfos-reference)
9. [Security Constraints](#section-9-security-constraints)
10. [AI/TIS Cost Controls](#section-10-aitlis-cost-controls)
11. [Voice Pipeline Latency Target](#section-11-voice-pipeline-latency-target)
12. [Known Limitations Phase 1](#section-12-known-limitations-phase-1)

---

## Section 1: Infrastructure Specifications

### Current Production Server: Hetzner CAX21

| Specification | Value |
|--------------|-------|
| **Server Type** | Hetzner CAX21 (ARM64) |
| **vCPU** | 4 × ARM64 Cores |
| **RAM** | 8 GB |
| **SSD** | 80 GB NVMe |
| **Network** | 20 TB bandwidth / month |
| **Operating System** | Ubuntu 24.04 LTS |
| **Monthly Cost** | €7.49 / month |
| **Data Center** | Hetzner (EU — Falkenstein or Helsinki) |
| **Architecture** | ARM64 (not x86_64) — all Docker images and compiled dependencies MUST support ARM64 |

### Why Hetzner CAX21

- Extremely cost-effective for a startup with constrained initial budget
- ARM64 provides good performance-per-euro for CPU-bound tasks like query processing
- 20TB monthly bandwidth is more than sufficient for Phase 1 operations
- Ubuntu 24.04 LTS provides 5-year support horizon (through 2029)

### ARM64 Compatibility Notes

Because the CAX21 uses ARM64 architecture, developers must ensure:
- All Docker base images used are multi-arch (linux/arm64 supported) — use official images from Docker Hub which typically provide ARM64 variants
- Any Python packages with compiled C extensions must have ARM64 wheels available on PyPI or must be compiled from source in the Dockerfile
- Do not assume x86 performance characteristics when benchmarking — ARM64 performance profiles differ
- Local development on Apple Silicon (M1/M2/M3 Macs) is architecturally compatible with the production server; local development on Intel Macs or Windows x86 requires Docker's cross-platform emulation (slower)

### Capacity Estimates for CAX21

| Metric | Estimated Capacity |
|--------|-------------------|
| Concurrent active users | ~50 (comfortable) |
| Farms before performance degradation | 5–10 farms |
| Daily TIS queries across all tenants | ~2,000 (at 20 Q/farm/day × 100 farms) |
| Database size before storage concern | ~40 GB data (leaves headroom on 80 GB NVMe) |
| Celery workers | 2–4 concurrent workers |

### Upgrade Path

When Phase 1 capacity is approached, upgrade path is:

| Stage | Server | RAM | vCPU | Monthly Cost | Trigger |
|-------|--------|-----|------|-------------|---------|
| **Phase 1 (current)** | CAX21 | 8 GB | 4 ARM64 | €7.49 | < 50 concurrent users |
| **Phase 2** | CAX31 | 16 GB | 8 ARM64 | ~€14.49 | 50–200 concurrent users, add PgBouncer |
| **Phase 3** | CAX41 | 32 GB | 16 ARM64 | ~€27.49 | 200–500 users |
| **Phase 4** | Kubernetes (Hetzner Cloud) | Scalable | Scalable | Variable | > 500 users / Pacific expansion |

**Upgrade trigger:** When average CPU utilization exceeds 70% sustained or RAM usage exceeds 80% sustained for 3+ consecutive days, initiate upgrade planning.

### Attached Storage Volume

A separate Hetzner Volume (independent of the VPS boot disk) is attached for:
- PostgreSQL database backups (`pg_dump` files)
- Any large file staging before Supabase upload
- Log archives

Volume is mounted at `/mnt/tfos-backups`. The VPS boot disk (80 GB NVMe) must not be used for backup storage — if the VPS disk fails, backups stored on a separate volume survive.

---

## Section 2: Connectivity Reality in Fiji

### The Problem

TFOS is built for Fiji. Fiji's telecommunications infrastructure is urban-concentrated. Suva, Nadi, and Lautoka have reliable 4G LTE. Rural areas and outer islands are a different story.

### F001: Save-A-Lot Farm, Korovou, Serua Province

**Connectivity:** Moderate 3G/4G. Korovou is a rural town in Serua Province. Mobile coverage exists from Vodafone Fiji and Digicel Fiji, but signal quality varies significantly by location on the 83-acre farm. Low-lying areas near the river may have poor signal. Workers near the farm gate or on higher ground typically have adequate connectivity for WhatsApp and basic app use.

**Expected offline episodes:** Short (minutes to a few hours). Connectivity is unreliable but not absent.

**Design implication:** Offline sync is important for F001 but primarily a resilience feature. Workers who lose connectivity will have their data queued and synced when they move to better signal.

### F002: Viyasiyasi Farm, Kadavu Island

**Connectivity:** Limited to none during working hours. Kadavu is a remote island ~100km south of Suva. Mobile towers exist in Vunisea (the main town and administrative center of Kadavu), but coverage on the island is highly localized. The farm area may be kilometers from the nearest tower.

**Expected offline episodes:** Full working days (8+ hours) without connectivity are normal. Workers may only get connectivity when they return to Vunisea at end of day or when near the main jetty.

**Design implication:** Offline-first is NON-NEGOTIABLE for F002. Every field logging operation must work completely without an internet connection. The application must behave identically offline and online. Sync happens at end-of-day or when connectivity is available.

### Offline-First Is Non-Negotiable

Offline-first is not a "nice to have" for F002 operations. It is the difference between a system that works for island farming and one that does not. Any feature that requires live connectivity for basic field logging (harvest recording, labor tracking, input application logging) is not acceptable for F002.

**Specific requirements:**

1. **Service Worker caches PWA shell + static assets** — The full application JavaScript bundle, HTML, CSS, and all static images must be cached by the Service Worker on first load. Subsequent loads work entirely from cache, even with zero connectivity.

2. **IndexedDB stores pending operations** — All field logs created offline are stored in browser-side IndexedDB. They are NOT lost if the browser is closed or the device is restarted (IndexedDB is persistent storage, not session storage).

3. **Maximum offline queue: 500 records** — To prevent unbounded data accumulation during extended offline periods, the offline queue caps at 500 records. At this limit, new logging is blocked until sync completes. At 490 records, a warning banner is displayed.

4. **Sync status always visible** — The sync status indicator (Online/Offline/Syncing/Failed) must be present on every field-facing screen. Field workers must always know whether their data has been submitted.

5. **No "server required" for read operations on cached data** — Workers must be able to VIEW their assigned tasks, current cycle status, and KB protocols they have previously viewed, even while offline.

### Bandwidth Conservation

Mobile data is not free in Fiji. Vodafone and Digicel both offer prepaid data plans, but field workers on casual FJD 6/hour wages cannot absorb large data costs. TFOS must minimize data consumption:

- All API responses must be paginated (no bulk data dumps)
- Image uploads use compressed WebP format, capped at 1200px and 10MB
- Voice audio for Whisper transcription must be compressed before upload (target < 500KB for a 30-second recording)
- No background data polling — use event-driven updates (WebSocket or SSE) rather than polling every N seconds

---

## Section 3: File Upload Limits

### Photo Uploads

| Parameter | Limit |
|-----------|-------|
| Maximum file size | 10 MB per photo |
| Accepted formats | JPEG, PNG, WebP |
| Processing | Resized to maximum 1200px on longest dimension |
| Processing library | Pillow (Python, backend processing before Supabase upload) |
| Storage destination | Supabase Storage |
| GPS metadata | Stripped before storage (privacy — farm location must not be embedded in photos) |

**Photo use cases:**
- Field event photos (pest sightings, crop stage documentation)
- Harvest quality photos (grade documentation)
- Equipment damage photos (incident reporting)
- Delivery confirmation photos
- Nursery stage photos

**Processing pipeline:**
```python
from PIL import Image
import io

def process_farm_photo(raw_bytes: bytes, max_dimension: int = 1200) -> bytes:
    """
    Resize to max dimension, strip EXIF/GPS metadata, convert to WebP.
    Returns processed image bytes ready for Supabase upload.
    """
    img = Image.open(io.BytesIO(raw_bytes))

    # Strip ALL metadata (including GPS)
    img_without_exif = Image.new(img.mode, img.size)
    img_without_exif.putdata(list(img.getdata()))

    # Resize if needed
    if max(img_without_exif.size) > max_dimension:
        img_without_exif.thumbnail((max_dimension, max_dimension), Image.LANCZOS)

    # Save as WebP for size efficiency
    output = io.BytesIO()
    img_without_exif.save(output, format='WebP', quality=85)
    return output.getvalue()
```

### Document Uploads

| Parameter | Limit |
|-----------|-------|
| Maximum file size | 50 MB per document |
| Accepted formats | PDF, JPEG, PNG (scanned documents) |
| Storage destination | Supabase Storage |
| GPS metadata | Not applicable for documents |

**Document use cases:**
- Delivery notes (PDF or photo scan)
- Chemical purchase invoices
- Laboratory test reports
- ILTB lease documents (reference copies)
- Ferry shipping manifests (F002)

### Supabase Storage Structure

```
supabase-storage/
├── farms/
│   ├── F001/
│   │   ├── field-events/     ← photos from field event logs
│   │   ├── harvest/          ← harvest quality photos
│   │   ├── incidents/        ← incident report photos
│   │   └── documents/        ← delivery notes, invoices
│   └── F002/
│       ├── field-events/
│       ├── harvest/
│       ├── incidents/
│       └── documents/
└── shared/
    └── kb-assets/            ← Knowledge Base article images and diagrams
```

---

## Section 4: WhatsApp Rate Limits

### Twilio WhatsApp Business API Limits

| Parameter | Limit |
|-----------|-------|
| Messages per second (single number) | 80 messages/second |
| Recommended maximum per farm per minute | 10 messages/minute |
| Template messages | Required for outbound messages to users who have not messaged first within 24 hours |
| Session messages | Free-form within 24-hour window after user initiates |

### Alert Batching Rules

To prevent WhatsApp spam and ensure workers do not ignore alerts due to notification fatigue:

1. **Maximum 10 WhatsApp messages per minute per farm** — The alert dispatch queue batches messages. If 20 alerts fire simultaneously, they are dispatched at a rate of 10 per minute (2 minutes total delivery time).

2. **Alert grouping** — When multiple alerts of the same severity fire simultaneously (e.g., 3 HIGH alerts for 3 PUs all reaching their overdue threshold at the same time), they are grouped into a single WhatsApp message with a summary: "3 HIGH alerts: [Task overdue on PU001], [Task overdue on PU003], [Harvest gap on PU005]. Log into TFOS for details."

3. **No duplicate alerts** — An alert that has already been sent via WhatsApp will not be re-sent for 24 hours unless it has been escalated in severity.

### Opt-Out Rules

Workers and managers can configure their WhatsApp alert preferences:
- **MEDIUM alerts:** Opt-out available. Default: receive (but can be turned off)
- **LOW alerts:** Opt-out available. Default: off (must explicitly opt in)
- **HIGH alerts:** Soft opt-out. If a manager opts out of HIGH alerts, they still receive a daily digest at 7am.
- **CRITICAL alerts:** Never suppressible. No opt-out. Always delivered immediately.

### CRITICAL Alerts Are Never Suppressed

The following CRITICAL alert scenarios bypass all opt-out, batching, and rate limiting:

| Rule | Scenario | Why Non-Suppressible |
|------|----------|---------------------|
| RULE-021 | Livestock mortality | Immediate biosecurity action required |
| RULE-038 | Chemical compliance violation (harvest blocked) | Food safety and legal compliance |
| RULE-034 | F002 ferry buffer breach | Island farm supply chain crisis |
| RULE-029 | Repeat pest pattern (outbreak confirmed) | Crop loss imminent across multiple PUs |

These four scenarios fire WhatsApp messages immediately to all registered CRITICAL alert contacts for the farm, regardless of time of day, regardless of opt-out settings, regardless of rate limits.

### WhatsApp Number Requirements

Each farm must have at least one registered WhatsApp number designated as the CRITICAL alert recipient. This is typically the Farm Manager's number. For Teivaka's own farms:
- F001 CRITICAL contact: Farm Manager (TBD — configurable in `farm_config`)
- F002 CRITICAL contact: Farm Manager (TBD — configurable in `farm_config`)

Worker WhatsApp numbers used in TFOS:
- W-001 Laisenia Waqa: +679 733 6211
- W-002 Maika Ratubaba: +679 839 9088
- W-003 Maciu Tuilau: +679 932 8045
- W-004 through W-009: Numbers to be captured during worker onboarding

---

## Section 5: Concurrent User Limits

### Phase Definitions

**Phase 1: MVP (Teivaka Internal)**
- **Users:** Teivaka staff only (Cody + farm managers + field workers)
- **Estimated concurrent users:** 5–10 (unlikely more than 10 users ever simultaneously active)
- **Farms:** F001 and F002 only
- **Infrastructure:** CAX21 handles this comfortably without optimization

**Phase 2: Fiji Farms**
- **Users:** Other Fiji farms subscribed to TFOS
- **Target:** 200 concurrent users (roughly 50–100 farms with 2–4 active users each)
- **Infrastructure requirements for Phase 2:**
  - PgBouncer for PostgreSQL connection pooling (CAX21's PostgreSQL handles ~100 direct connections max; PgBouncer allows thousands of application connections mapped to a smaller connection pool)
  - Redis query caching for Decision Engine results and frequently read data (PU lists, KB articles)
  - Possible upgrade to CAX31 (16GB RAM) if memory becomes constrained
  - Celery worker scaling (4–8 workers for alert dispatch and background jobs)

**Phase 3: Pacific Regional**
- **Users:** Farms across Fiji, Vanuatu, Solomon Islands, Samoa, Tonga
- **Target:** 2,000 concurrent users
- **Infrastructure requirements for Phase 3:**
  - VPS upgrade to CAX41 (32GB) or migration to Hetzner Kubernetes
  - Read replicas for PostgreSQL (separate read and write traffic)
  - CDN for PWA static assets (Cloudflare or Hetzner's CDN)
  - TimescaleDB compression for older time-series data
  - Horizontal Celery scaling

### Connection Pool Sizing

For Phase 1 (CAX21, 8GB RAM):

```ini
# PgBouncer configuration (implement from Phase 1 for future-proofing)
[databases]
tfos_prod = host=localhost port=5432 dbname=tfos_production

[pgbouncer]
pool_mode = transaction
max_client_conn = 200
default_pool_size = 20
min_pool_size = 5
max_db_connections = 50
```

```python
# SQLAlchemy async engine configuration
engine = create_async_engine(
    DATABASE_URL,
    pool_size=10,          # Base connection pool
    max_overflow=20,        # Max overflow beyond pool_size
    pool_timeout=30,        # Wait up to 30s for a connection
    pool_recycle=3600,      # Recycle connections hourly
    pool_pre_ping=True      # Verify connection before use
)
```

---

## Section 6: Data Retention Policy

### Operational Data

| Data Type | Retention Period | Reason |
|-----------|-----------------|--------|
| All operational logs (field events, harvest logs, cash ledger, labor records) | 7 years | Fiji Revenue Authority compliance for agricultural businesses |
| Production cycle records | 7 years | Business records + crop rotation history |
| Alert records | 7 years | Compliance audit trail |
| Chemical compliance records | 7 years | Legal and food safety compliance |
| Incident reports | 7 years | Insurance and legal compliance |
| Profit share records (F001) | 7 years | Financial records compliance |
| Worker attendance records | 7 years | Employment law compliance |

### Platform Data

| Data Type | Retention Period | Notes |
|-----------|-----------------|-------|
| KB articles and protocols | Indefinitely | Core platform asset |
| Shared schema (rotation matrix, production thresholds, chemical database) | Indefinitely | Core platform asset |
| Tenant account records | 7 years after account closure | Legal compliance |

### AI/TIS Data

| Data Type | Retention Period | Reason |
|-----------|-----------------|--------|
| `tis_conversations` table | 90 days | Short retention — TIS conversations are operational, not business records |
| `tis_voice_logs` (Whisper transcriptions) | 30 days | Transcriptions are working data; audio files are not stored |
| Voice audio files | NOT retained | Audio is transcribed and discarded immediately. Raw audio is never stored in TFOS. |

### Deleted Tenant Data

When a tenant account is deleted (subscription cancels or is terminated):
- Tenant data is flagged as `deleted = true` with a `deleted_at` timestamp
- Tenant data is retained for **30 calendar days** in the deleted state (recovery window)
- After 30 days, tenant data is **permanently deleted** from all tables
- Supabase Storage files for the tenant are deleted at the same time
- This 30-day window allows recovery in case of accidental deletion or billing dispute

Exceptions to permanent deletion:
- Financial records involving related-party transactions (Nayans) — retained 7 years regardless of tenant status
- Any records referenced in legal proceedings — retained under legal hold

---

## Section 7: Backup Schedule

### PostgreSQL Database Backup

| Parameter | Value |
|-----------|-------|
| Tool | `pg_dump` (compressed format) |
| Schedule | Daily at **2:00am Fiji time** (UTC+12 = 2:00pm UTC previous calendar day) |
| Retention | 30 days rolling (30 backup files stored, oldest deleted when 31st is created) |
| Storage | Hetzner Volume mounted at `/mnt/tfos-backups/postgres/` |
| Format | `pg_dump --format=custom --compress=9` |
| Estimated size | ~500MB – 2GB per dump (depending on data volume) |

**Cron expression for pg_dump (in Fiji local time, UTC+12):**
```cron
0 2 * * * pg_dump --format=custom --compress=9 -U tfos_user tfos_production > /mnt/tfos-backups/postgres/tfos_$(date +%Y%m%d_%H%M%S).dump
```

**Cron in UTC (for server configured in UTC):**
```cron
0 14 * * * pg_dump --format=custom --compress=9 -U tfos_user tfos_production > /mnt/tfos-backups/postgres/tfos_$(date +%Y%m%d_%H%M%S).dump
```

**Note on timezone:** Ubuntu servers should be configured in UTC. Always translate Fiji time (UTC+12) to UTC when writing cron expressions. 2:00am Fiji time = 14:00 UTC the previous calendar day. This means the daily backup runs at 2:00pm UTC, which is 2:00am Fiji time the following morning. This avoids backup during the Decision Engine run at 6:05am Fiji time (18:05 UTC).

### Backup Cleanup Script

```bash
# Runs after pg_dump — delete backups older than 30 days
find /mnt/tfos-backups/postgres/ -name "tfos_*.dump" -mtime +30 -delete
```

### Supabase Storage

Supabase handles its own replication and redundancy for Storage. No manual backup of Supabase Storage is required. Teivaka does not control Supabase's infrastructure — this is a managed service dependency. If Supabase Storage has an outage, file access is unavailable but no data is permanently lost (Supabase maintains replicas).

### Redis Cache

Redis is configured with **no persistence** (no AOF, no RDB snapshots). Redis is used exclusively as an ephemeral cache and Celery message broker. All data in Redis is reconstructible from PostgreSQL. If Redis crashes, the application recovers by:
- Celery tasks: re-queued from pending state in the database
- Cached query results: recomputed from PostgreSQL on next request
- TIS daily query counters: reset to 0 on Redis restart (acceptable — users may get extra queries on the day of a Redis restart)

### Test Restore Requirement

**Quarterly test restore is mandatory.** Schedule: first Monday of each quarter (January, April, July, October).

Test restore procedure:
1. Copy latest `.dump` file from `/mnt/tfos-backups/postgres/` to a test environment
2. Create a fresh PostgreSQL database `tfos_test_restore`
3. Run: `pg_restore --format=custom -d tfos_test_restore tfos_YYYYMMDD.dump`
4. Verify: row counts on key tables match expected values
5. Verify: application can connect to restored DB and serve data correctly
6. Document: restore duration, any errors, and confirmation of success in `10_handoff/OPEN_ISSUES.md`

---

## Section 8: Legacy TFOS Reference

### The Google Sheets TFOS v7.0

Before the PostgreSQL TFOS system being documented in this resource pack, Teivaka operated using a Google Sheets-based TFOS (version 7.0). This spreadsheet system is referred to throughout as "the legacy TFOS" or "TFOS v7.0."

### Status During Migration

- **Google Sheets TFOS v7.0 status: READ-ONLY reference during migration**
- No new data is written to Google Sheets after PostgreSQL TFOS deployment
- The Sheets system is kept accessible for 90 days post-deployment as a reference for historical data validation
- After 90-day parallel run, Sheets is decommissioned and access is revoked

### Source of Truth

From **Day 1 of PostgreSQL TFOS deployment**, the new PostgreSQL system is the **sole source of truth** for all operational data. There is no write-back to Google Sheets under any circumstances. Any developer who attempts to maintain data synchronization between PostgreSQL and Google Sheets is creating a dangerous dual-system problem.

### Known Issues in TFOS v7.0

During migration planning, two critical column mapping errors were identified in TFOS v7.0:

**RULE-042 column mapping error:**
In the Google Sheets automation rules tab, the `Status` column and `TriggerCategory` column are shifted for RULE-042 and RULE-043. The values that should be in `TriggerCategory` appear in `Status`, and vice versa. This means any automated import of rules from v7.0 must include a manual correction for rows 42 and 43.

**Correct values for RULE-042:**
- Status: Active
- TriggerCategory: OrderStatus
- TriggerType: OrderOverdue
- Interval: Daily7am
- Severity: HIGH

**Correct values for RULE-043:**
- Status: Active
- TriggerCategory: WorkerPerformance
- TriggerType: WorkerInactive>14days
- Interval: WeeklyMonday
- Severity: MEDIUM

See `05_data_migration/COLUMN_MAPPING.md` for the full mapping specification including all 43 rules.

### 90-Day Parallel Run Validation

During the 90-day period after PostgreSQL TFOS deployment (while Google Sheets v7.0 is still accessible):
- Farm Managers run both systems in parallel for critical financial records
- Weekly comparison reports verify that PostgreSQL financial totals match Sheets totals
- Any discrepancy triggers an immediate data investigation
- After 90 days without discrepancies, the migration is declared validated and Sheets is decommissioned
- Validation criteria and checklist: `05_data_migration/VALIDATION_CHECKLIST.md`

---

## Section 9: Security Constraints

### Authentication and Tokens

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| JWT access token expiry | 15 minutes | Short-lived to limit damage from token theft |
| Refresh token expiry | 7 days | Reasonable session length for farm workers |
| Refresh token storage | httpOnly cookie | Prevents JavaScript access (XSS protection) |
| Password hashing | bcrypt, cost factor 12 | Industry standard; cost factor 12 provides ~300ms hash time |

### Database Security

**Row-Level Security (RLS):**
PostgreSQL RLS is enabled on all operational tables. RLS policies ensure:
- A tenant can only read and write rows where `tenant_id = current_tenant_id()`
- `current_tenant_id()` is a PostgreSQL function that reads the tenant ID from the current session variable (set at connection time from the JWT)
- RLS is the SECOND layer of security after JWT validation. Even if a developer forgets to add a `WHERE tenant_id = :tenant_id` clause in a query, RLS prevents data leakage between tenants

**The `shared.*` schema has no `tenant_id` and no RLS.** All tenants can read shared schema tables (KB articles, rotation matrix, chemical database, etc.). No tenant can write to the shared schema — write permissions are restricted to the `tfos_admin` database role (used only by Teivaka platform administrators, not application service accounts).

### API Security

| Parameter | Value |
|-----------|-------|
| API key access | Only with IP whitelist — no open API keys |
| HTTPS | Enforced via Caddy (auto-cert Let's Encrypt). HTTP redirects to HTTPS. |
| CORS | Restricted to registered domains only (never `*`) |
| Rate limiting | 100 requests/minute per authenticated user, 20 requests/minute for unauthenticated |
| SQL injection prevention | SQLAlchemy parameterized queries only — no raw string interpolation in queries |

### File Storage Security

| Parameter | Value |
|-----------|-------|
| GPS metadata | Stripped from all photos before Supabase upload (see Section 3) |
| File access | Supabase Storage signed URLs with 1-hour expiry |
| No public buckets | All farm storage buckets are private — no direct public URL access |
| Virus scanning | Not implemented Phase 1 (document uploads are internal use only) |

### CORS Configuration

```python
# FastAPI CORS middleware configuration
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://app.teivaka.com",           # Production PWA
        "https://staging.teivaka.com",        # Staging PWA
        "http://localhost:3000",              # Local development only
        "http://localhost:5173",              # Vite dev server
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

**Never add `*` to `allow_origins`.** If a new deployment domain is required, it must be explicitly added to this list and committed to version control.

### Caddy HTTPS Configuration (Sketch)

```caddyfile
app.teivaka.com {
    reverse_proxy localhost:8000
    encode gzip
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Content-Security-Policy "default-src 'self'; ..."
    }
}
```

Full Caddy configuration: `08_deployment/CADDY_CONFIG.md`

---

## Section 10: AI/TIS Cost Controls

### Claude API (claude-sonnet-4-20250514)

| Parameter | Constraint | Enforcement |
|-----------|-----------|-------------|
| Max tokens per TIS response | 1,000 tokens | `max_tokens=1000` in every Claude API call |
| TIS query limit (FREE tier) | 5 queries/day | Redis counter per tenant per day |
| TIS query limit (BASIC tier) | 20 queries/day | Redis counter per tenant per day |
| TIS query limit (PREMIUM/CUSTOM) | Unlimited | No counter applied |
| Response caching | Same query within 1 hour returns cached response | Redis cache, 1-hour TTL per query hash |

**Redis counter key format:**
```
tis_query_count:{tenant_id}:{YYYY-MM-DD}
```

Counter increments on every TIS query. Counter expires at midnight Fiji time (12:00 UTC the following day). Counter is checked BEFORE the Claude API call — if the limit is reached, the API returns HTTP 429 with a message indicating the daily limit and next reset time.

**Why 1,000 token limit:**
- Typical Knowledge Broker response: 200–400 tokens (a clear agronomic protocol answer)
- Typical Command Executor confirmation: 50–100 tokens (brief confirmation message)
- 1,000 tokens is generous for useful answers while preventing runaway costs from complex multi-part queries
- At Claude Sonnet pricing (~$3/million output tokens), 1,000 tokens = $0.003 per query maximum

### Whisper API (OpenAI)

| Parameter | Constraint | Enforcement |
|-----------|-----------|-------------|
| Max audio file size | 25 MB | File size check before API call |
| Typical field voice note | < 1 MB (30 seconds of compressed audio) | Typical constraint |
| Audio compression | Required before upload | FFmpeg or browser MediaRecorder with Opus codec |
| Rejected files | > 25 MB: rejected with error to user | API-level check |

**30-second field voice note at typical WhatsApp audio quality = ~300KB – 500KB.** The 25MB limit is an extremely conservative constraint — it would require a 25-minute uncompressed audio recording to hit it. For field logging purposes, the practical limit is a 3–5 minute maximum recording guideline for workers.

### Estimated Monthly AI Costs Per Farm

These are cost estimates assuming average usage patterns. Actual costs depend on query length, response length, and farming activity level.

| Tier | Estimated Monthly AI Cost (FJD) | Basis |
|------|--------------------------------|-------|
| FREE | ~FJD 2 | 5 queries/day × 30 days = 150 queries × ~FJD 0.013/query |
| BASIC | ~FJD 15 | 20 queries/day × 30 days = 600 queries × ~FJD 0.025/query (+ Whisper) |
| PREMIUM | ~FJD 50 | ~2,000 queries/month (unlimited but typical usage) |
| CUSTOM | Negotiated | Based on actual usage; included in revenue share arrangement |

These costs are borne by Teivaka as a platform operating cost — they are NOT passed through to farm subscribers as a per-query charge. They are covered by subscription revenue.

### Cost Monitoring

A daily Celery task computes total Claude API and Whisper API usage from `tis_conversations` and `tis_voice_logs` tables. If daily AI cost exceeds a configurable threshold (default: FJD 500/day platform-wide), a HIGH alert fires to the Teivaka admin account. This prevents runaway costs from abuse or a bug causing infinite query loops.

---

## Section 11: Voice Pipeline Latency Target

### The 5-Second Rule

For voice-based data entry to be accepted by field workers, the entire pipeline from voice input to confirmation must complete in under **5 seconds**. Workers who have to wait more than 5 seconds for a response after speaking will abandon voice input and revert to text (or stop logging altogether).

### Target Breakdown

| Pipeline Stage | Target Duration | Notes |
|----------------|----------------|-------|
| **User records voice message** | User-controlled | Typically 5–30 seconds, not counted |
| **WhatsApp delivers audio to TFOS webhook** | ~0.5 seconds | Twilio delivery to our webhook endpoint |
| **Whisper API transcription** | < 1 second | For ≤ 30 seconds of audio at 300KB |
| **TIS Operational Interpreter parsing** | < 0.5 seconds | Claude API intent parsing with short prompt |
| **TFOS API call + database write** | < 0.5 seconds | FastAPI endpoint + PostgreSQL write |
| **Response formatting** | < 0.5 seconds | Python string formatting |
| **WhatsApp reply delivery** | ~0.5 seconds | Twilio outbound message delivery |
| **TOTAL (post-recording)** | **< 3 seconds** | Target for steps after the recording ends |

### Latency Budget Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Whisper API cold start | +1–2 seconds if API is cold | Use Whisper API with keep-warm (send small test requests if no activity for >10 minutes) |
| Claude API latency spike | +0.5–2 seconds during high load | Use `claude-sonnet-4-20250514` which is fast; monitor p95 latency |
| Database write under load | +0.5 seconds if connection pool saturated | PgBouncer with adequate pool sizing |
| Twilio webhook delivery | +0.5–1 second | Cannot control; factor into budget |
| Network latency (Fiji to EU server) | +0.3–0.5 seconds round-trip | Hetzner Helsinki has ~250ms RTT to Fiji (acceptable) |

### Monitoring

The voice pipeline latency must be instrumented end-to-end. Each stage logs a timestamp to `tis_voice_logs`:

```sql
CREATE TABLE tis_voice_logs (
    id              UUID PRIMARY KEY,
    tenant_id       UUID NOT NULL,
    session_id      UUID NOT NULL,
    whisper_start   TIMESTAMPTZ,
    whisper_end     TIMESTAMPTZ,
    tis_parse_start TIMESTAMPTZ,
    tis_parse_end   TIMESTAMPTZ,
    api_call_start  TIMESTAMPTZ,
    api_call_end    TIMESTAMPTZ,
    total_ms        INTEGER,     -- computed: (api_call_end - whisper_start) in milliseconds
    exceeded_target BOOLEAN,     -- true if total_ms > 3000
    intent_type     VARCHAR(30),
    success         BOOLEAN,
    error_code      VARCHAR(50),
    retained_until  DATE         -- 30-day retention (Section 6)
);
```

If `exceeded_target = true` for more than 10% of voice pipeline requests in a rolling 24-hour period, a HIGH alert fires to the Teivaka admin account for performance investigation.

---

## Section 12: Known Limitations Phase 1

These are **intentional limitations** of Phase 1 (MVP). They are not bugs. They are scoped-out features deferred to Phase 2 or later. Developers should not attempt to build these in Phase 1 without explicit product sign-off.

### 1. No Real-Time Collaboration

If two users (e.g., a Farm Manager and a field supervisor) attempt to edit the same Production Unit record simultaneously, the system uses **last-write-wins** conflict resolution. There is no locking, no optimistic concurrency control, and no real-time collaboration UI (no "someone else is editing this" warning).

**Impact:** Low in Phase 1 because the number of concurrent users is very small (5–10 Teivaka staff). Unlikely to cause practical problems.

**Phase 2 fix:** Optimistic concurrency using `version_number` columns with compare-and-swap on update.

### 2. No Map/GIS Visualization

TFOS stores zone definitions (acreage, description) but has no map layer. There is no farm map, no zone polygon drawing, no GIS integration, and no satellite imagery overlay. Farm layout is represented in tabular form only (zones with names and area in acres).

**Impact:** Farm Managers must mentally map zones to the physical farm. Not a problem when there are only 2 farms being managed by the people who physically know the land.

**Phase 2 feature:** Mapbox or Leaflet.js integration with manually drawn zone polygons. Farm photos can also be tagged to zones as visual reference.

### 3. No Automated Market Price Feeds

All market prices in the `price_master` table are manually entered by the Farm Manager or Teivaka admin. There is no integration with FijiMarkets, the Fiji Agriculture Ministry's price bulletins, or any price feed API.

**Impact:** Prices may be out of date if not manually updated. CoKG loss detection depends on prices being current. Farm Manager must update prices weekly.

**Phase 2 feature:** Manual import workflow from Agricultural Ministry price reports. Phase 3: automated scraping/API integration if a reliable source becomes available.

### 4. Community Platform Read-Only in Phase 1

The Community pillar (marketplace, knowledge sharing, buyer pipeline) is read-only for all users in Phase 1. Users can browse KB articles and view marketplace listings (if any are seeded), but cannot post, comment, list produce, or interact with other users.

**Phase 2 feature:** Full Community marketplace with listing management, buyer-seller messaging, and order placement.

### 5. No Stripe Integration in Phase 1

Subscription management in Phase 1 is handled manually by Teivaka (Cody invoices farms directly, manually updates `tenants.subscription_tier` in the database). There is no self-service signup, no payment gateway, and no automated subscription renewal.

**Impact:** This is fine for Phase 1 when there are only a handful of subscribers known personally to Teivaka.

**Phase 2 feature:** Stripe integration for self-service subscription purchase, upgrade, and renewal. Webhook-driven automatic tier assignment.

### 6. Kava Long-Timeline Chart Limitation

Standard chart libraries (Chart.js, Recharts, Victory) do not handle time-series data spanning 4 years well without customization. The default rendering of a kava cycle (planted January 2025, harvested January 2029) on a standard harvest timeline chart will either compress the data unusably or require horizontal scrolling.

**Impact:** The Decision Engine's `DaysSinceLastHarvest` signal (Signal 2) will show RED for kava cycles in all normal views (the kava exception in BUSINESS_LOGIC.md Section 12 applies to alert rules, not to chart visualization). Farm Managers must be educated that kava cycles look "red" on standard harvest gap visualizations but this is expected.

**Phase 2 fix:** Custom kava cycle chart with a "kava timeline" view that shows the multi-year growth phases (establishment, vegetative, maturation, harvest window) as distinct zones, with the current date highlighted relative to the expected harvest window.

### 7. RULE-042 and RULE-043 Column Mapping Error (Legacy)

As documented in Section 8 (Legacy TFOS Reference), RULE-042 and RULE-043 in the Google Sheets TFOS v7.0 have column mapping errors. These rules are correctly defined in BUSINESS_LOGIC.md Section 3 and in the `automation_rules` table seed data. The errors exist only in the legacy Sheets system. Any developer working with migrated data from the Sheets must verify these two rules manually.

### 8. No Multi-Language Support in Phase 1

TFOS Phase 1 is English-only. Field worker communications via WhatsApp (task alerts, harvest confirmations, voice command responses) are in English. Fijian language support is planned for Phase 2.

**Impact:** Some field workers may prefer Fijian. Crop names using Fijian terms (Dalo, Rourou, Kava, etc.) are supported as aliases in the production catalog, so TIS can recognize Fijian crop names in voice commands.

### 9. No Automated Worker Availability Forecasting

The WorkerBookingQueue for F002 (island farm casual worker scheduling) in Phase 1 is a manual system — Farm Managers enter worker bookings directly. There is no automated demand forecasting that says "you will need 3 workers for 2 days in 3 weeks for the pineapple harvest." This intelligence is not automated.

**Phase 2 feature:** Labor demand forecasting based on Stage Engine task timelines, estimated hours per task, and historical labor data.

---

*This document defines the non-negotiable constraints within which TFOS is built and deployed. When new features are proposed, every constraint in this document must be evaluated for compatibility. When infrastructure changes are made, this document must be updated first.*

---

**Document maintained by:** Teivaka Development Team
**Company:** Teivaka PTE LTD, Fiji | Company No. 2025RC001894
**Founder:** Uraia Koroi Kama (Cody)
