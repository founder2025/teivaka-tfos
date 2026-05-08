# TFOS Audit — Phase 6 — Infrastructure Topology

**Audited:** 2026-05-08 UTC
**Branch:** `feature/option-3-plus-nav-v2-1`
**Scope:** Production infrastructure layer — containers, orchestration, reverse
proxy, systemd units, scheduling, SSL, DNS, backups, log retention. Read-only
recon only; no state changes.

---

## TL;DR

Production stack is **functionally healthy** but has **doctrinal drift in
documentation** (host class, container count, compose comments) and **two
real gaps**:

1. **No backup mechanism exists.** docker-compose.yml comments aspirationally
   reference "pg_dump daily to Hetzner Object Storage or Supabase" — there is
   no backup script on disk, no cron entry, no destination configured in `.env`.
   This is a **single-disk-failure data-loss risk** today. Strike-class.
2. **Secrets embedded in systemd unit files.** `tis.service` carries
   `GEMINI_API_KEY` and `GOOGLE_API_KEY` directly in `Environment=` directives;
   `tis-bridge.service` carries `TIS_BRIDGE_TOKEN` the same way. Unit files are
   world-readable (`systemctl cat` returns them without sudo). Rotation
   requires editing the unit. **Strike-class secrets-handling.**

Plus several smaller drift items (compose comments name "Hetzner CAX21 ARM64",
real host is DigitalOcean Singapore VPS; container count documented as 6 but
running 8 — already filed B68).

---

## A. Host

| Property | Value | Source |
|---|---|---|
| Provider | DigitalOcean | CLAUDE.md |
| Region | Singapore | CLAUDE.md |
| IP (public) | `168.144.36.120` | DNS A record + CLAUDE.md |
| OS | Linux 6.8.0-110-generic (Ubuntu) | environment context |
| Disk | 80 GB SSD, 24 GB used (31%) | `df -h /` |
| RAM | 4 GB (post-Strike-#94 resize) | Strike #94 archive |
| Filesystem mount | `/dev/vda1` → `/` | `df -h /` |

**Drift A.1 — compose comments name wrong host class.** Lines 4–5 + 17 of
`04_environment/docker-compose.yml` describe the deployment as
"Hetzner CAX21 (ARM64, 8GB RAM, 4 vCPU, 80GB SSD)". The actual host is a
DigitalOcean x86_64 droplet, 4 GB RAM (post-#94). Resource allocation targets
in compose comments (`api: 1.5GB`, `db: 2.0GB`, total `~7.1GB`) **exceed
available host RAM** — the hard limits in `deploy.resources.limits` are not
currently sized to host capacity.

---

## B. Docker compose services (8 total)

All defined in `04_environment/docker-compose.yml` (16,863 bytes, last touched
2026-05-07). Backups exist for pre-Strike-#95 + pre-celery-fix + pre-8-2b +
pre-9-1b.

| Service | Image | Container | Port → Host | Restart | Healthy? |
|---|---|---|---|---|---|
| `api` | `04_environment-api` (built) | `teivaka_api` | `127.0.0.1:8000→8000` | unless-stopped | ✅ 5h |
| `worker-automation` | `04_environment-worker-automation` | `teivaka_worker_automation` | `8000/tcp` (internal) | unless-stopped | ✅ 35h |
| `worker-ai` | `04_environment-worker-ai` | `teivaka_worker_ai` | `8000/tcp` (internal) | unless-stopped | ✅ 31h |
| `worker-notifications` | `04_environment-worker-notifications` | `teivaka_worker_notifications` | `8000/tcp` (internal) | unless-stopped | ✅ 4d |
| `beat` | `04_environment-beat` | `teivaka_beat` | `8000/tcp` (internal) | unless-stopped | ✅ 36h |
| `db` | `timescale/timescaledb:2.15.3-pg16` | `teivaka_db` | `127.0.0.1:5432→5432` | unless-stopped | ✅ 4d |
| `redis` | `redis:7.2-alpine` | `teivaka_redis` | `127.0.0.1:6379→6379` | unless-stopped | ✅ 4d |
| `caddy` | `caddy:2-alpine` | `teivaka_caddy` | `0.0.0.0:80→80, 0.0.0.0:443→443, 127.0.0.1:2019→2019` | unless-stopped | ✅ 4d |

**Drift B.1 — container count documentation gap (B68 filed).** CLAUDE.md
Section 14 "Production: healthy. 6 containers running" is stale. Eight
containers are actually defined in compose and running. `worker_automation`
and `worker_notifications` exist in compose but are undocumented in canonical
refs.

**Build context for application services:** all five Python services
(`api`, three workers, `beat`) build from `../11_application_code` with
shared `Dockerfile` `target: runtime`. They use the same image artifact;
only `command:` differs.

**Resource limits (declared in compose `deploy.resources.limits`):**

| Service | Memory | CPU |
|---|---|---|
| api | 1500M | 1.0 |
| worker-automation | 1000M | 0.5 |
| worker-ai | 1000M | 0.5 |
| worker-notifications | 512M | 0.25 |
| beat | 256M | 0.1 |
| db | 2000M | 1.0 |
| redis | 512M | 0.25 |
| caddy | 256M | 0.1 |
| **Total declared** | **~7.0 GB** | **~3.65 CPU** |

⚠️ **Total declared ceiling exceeds host RAM (4 GB).** Currently swap is at
0% (Strike #94) so workloads fit, but the configured limits are not enforced
ceilings — they are headroom assumptions. If usage actually peaked at
declared limits, OOM events would follow.

---

## C. Networks and volumes

### Networks

| Name | Driver | Subnet | Use |
|---|---|---|---|
| `teivaka-network` | bridge | `172.20.0.0/16` | All 8 services |
| `bridge` | bridge | (default) | Docker default; unused |
| `host` | host | n/a | unused |
| `none` | null | n/a | unused |

The Caddy `/tis/*` route reverse-proxies to `172.20.0.1:18790` — that's the
bridge gateway IP, i.e. the host from inside the container. This is how Caddy
reaches the host-side `tis-bridge` systemd service (which is not a docker
service).

### Named volumes (5 expected)

| Name | Purpose | Size class |
|---|---|---|
| `04_environment_postgres_data` | PostgreSQL data dir | persistent |
| `04_environment_redis_data` | Redis AOF + RDB | persistent |
| `04_environment_caddy_data` | Let's Encrypt certs + ACME state | **CRITICAL — losing this means cert storm** |
| `04_environment_caddy_config` | Caddy internal config state | persistent |
| `04_environment_beat_data` | Celery beat schedule DB | persistent (mtime-checked by healthcheck) |

`docker system df -v` also lists ~40 anonymous regular volumes from build
contexts (mostly 12-650 KB each, source from Dockerfile `COPY` layers
post-build). Not a gap — Docker housekeeping.

**Bind mounts:**
- `caddy` → `./Caddyfile.production:/etc/caddy/Caddyfile:ro` (live config)
- `caddy` → `../frontend/dist:/srv/frontend:ro` (PWA static files)
- `db` → `../02_database/init:/docker-entrypoint-initdb.d:ro` (first-boot init)
- All 5 Python services → `../logs:/app/logs` (shared log dir on host)

---

## D. Caddy reverse proxy

**Config:** `04_environment/Caddyfile.production` (4441 bytes, last touched
2026-05-02).

**Route map:**

| Path | Target | Notes |
|---|---|---|
| `/tis/*` | `172.20.0.1:18790` | host-side tis-bridge (OpenClaw HTTP wrapper) |
| `/api/*` | `api:8000` | upstream health-checked at `/api/v1/health` |
| `/ws/*` | `api:8000` | WebSocket upgrade headers |
| `/webhooks/*` | `api:8000` | WhatsApp callbacks |
| `/verify*` | `api:8000` | Phase 9 server-rendered audit verify HTML |
| `*.{js,css,woff,woff2,ttf,ico,png,jpg,jpeg,gif,svg,webp,avif}` | `/srv/frontend` (static) | `Cache-Control: public, max-age=31536000, immutable` |
| `/service-worker.js`, `/sw.js`, `/workbox-*.js` | `/srv/frontend` | `Cache-Control: no-store, max-age=0` |
| `/manifest.json`, `/manifest.webmanifest` | `/srv/frontend` | `Cache-Control: public, max-age=3600` |
| `/index.html` | `/srv/frontend` | `Cache-Control: no-store, max-age=0` |
| `/*` (SPA fallback) | `try_files {path} /index.html` | React PWA |

**Security headers (set on every response):**
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(self), geolocation=(self), payment=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (2-year HSTS)
- `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' wss://{$DOMAIN}; font-src 'self'; frame-ancestors 'self';`
- `-Server` (strips Caddy server header)

**HSTS preload is set** but apex domain is **not** known to be on the HSTS
preload list (verify via [hstspreload.org](https://hstspreload.org/)). Browser
caches the policy after first visit; this is only an issue for first-touch
hardening.

**`www.teivaka.com` → `https://teivaka.com{uri}` permanent redirect** — wired.

**Caddy access log:**
- Inside container at `/var/log/caddy/access.log`
- 17.5 MB live file (May 4 → May 8)
- Roll: `roll_size 100MiB`, `roll_keep 5`, `roll_keep_for 720h` (30 days)
- ⚠️ **Log directory is not bind-mounted to host.** On container recreation
  (Strike #69 pattern: `compose up -d` after env rotation), 5 rolled files
  *survive in container fs* but are not visible to host journals or backups.
  The `caddy_data` and `caddy_config` named volumes don't include `/var/log/caddy`.

**Caddy admin API exposed on `127.0.0.1:2019`** — used for `caddy reload`. Not
externally reachable. Healthcheck hits this endpoint.

---

## E. Systemd units (host-side, not in compose)

### `tis.service` (active + enabled)

```
[Unit]
Description=TIS - Teivaka Intelligence System
After=network.target

[Service]
Type=simple
User=tis
WorkingDirectory=/home/tis/.openclaw
ExecStart=/usr/bin/openclaw gateway --force
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production
Environment=OPENCLAW_NO_RESPAWN=1
Environment=HOME=/home/tis
Environment=GEMINI_API_KEY=<REDACTED — see Drift E.1>
Environment=GOOGLE_API_KEY=<REDACTED — see Drift E.1>
Environment=GOOGLE_API_KEY=    # ← duplicate empty assignment overrides above

[Install]
WantedBy=multi-user.target
```

Override directory exists at `/etc/systemd/system/tis.service.d/override.conf`
but is `chmod 600 root:root` and unreadable as `tfos`. **Unknown additional
config drift.**

**Drift E.1 — secrets in unit Environment= directives.** `GEMINI_API_KEY`
and `GOOGLE_API_KEY` are written directly into the unit file. Unit files are
returned by `systemctl cat` to any user (no sudo gate on read). Best practice:
load secrets via `EnvironmentFile=/etc/teivaka/secrets.env` with
`chmod 600 root:root`, or systemd-creds, or a credentials store.

**Drift E.2 — duplicate `GOOGLE_API_KEY=` line with empty value** appears
*after* the populated one. Per systemd parsing semantics, the last assignment
wins, so `GOOGLE_API_KEY` is currently empty inside the tis service. Either
the populated key is dead (good — narrower exposure) or the service needs
the key and is silently degraded. **Functional verification required.**

### `tis-bridge.service` (active + enabled)

```
[Unit]
Description=TIS Bridge - HTTP wrapper for OpenClaw agent CLI
After=network.target tis.service
Requires=tis.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/tis-bridge
ExecStart=/usr/bin/node /opt/tis-bridge/server.js
Restart=always
RestartSec=5
Environment=TIS_BRIDGE_PORT=18790
Environment=TIS_BRIDGE_TOKEN=<REDACTED — see Drift E.3>
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Drift E.3 — secret in unit Environment + service runs as root.**
`TIS_BRIDGE_TOKEN` is in the unit file (same exposure as Drift E.1). Plus
`User=root` for a Node.js HTTP wrapper is excessive privilege. Should run as
a dedicated `tis-bridge` user, port 18790 doesn't require root.

**Drift E.4 — `Requires=tis.service` makes the bridge fate-share with TIS.**
If `tis.service` fails to start, `tis-bridge` won't start either. Fine for
"strict integration" semantics, but means a bad OpenClaw deploy takes the
HTTP wrapper down too — there's no graceful "wrapper up but TIS down" mode.
Probably correct, just noting for the record.

---

## F. Celery beat schedule

**Source of truth:** `11_application_code/app/workers/celery_app.py:59-108`.

**Persistence:** `beat_data` named volume → `/app/data/celerybeat-schedule`
(SQLite-like file). Healthcheck (lines 292–297 of compose) checks file mtime
within last 1800s — Strike #66 / Strike #110 pattern. Beat container max-interval=60s.

**8 scheduled tasks (all UTC, Fiji = UTC+12):**

| Task | Schedule (UTC) | Fiji local | Queue |
|---|---|---|---|
| `app.workers.automation_worker.run_automation_engine` | 18:00 daily | 06:00 | `automation` |
| `app.workers.decision_engine_worker.run_decision_engine` | 18:05 daily | 06:05 | `decision` |
| `app.workers.maintenance_worker.refresh_materialized_views` | 18:10 daily | 06:10 | `maintenance` |
| `app.workers.automation_worker.run_ferry_buffer_scan` | 18:00 Sun (= Mon 06:00 Fiji) | 06:00 Mon | `automation` |
| `app.workers.notification_worker.send_batched_low_alerts` | every hour at :00 | every hour | `notifications` |
| `app.workers.ai_worker.generate_weekly_insights` | Sat 18:00 (= Sun 06:00 Fiji) | 06:00 Sun | `ai` |
| `ops.run_cheap_checks` | every 15 min (:00, :15, :30, :45) | every 15 min | `ai` |
| `ops.run_expensive_checks` | every 4 h (00, 04, 08, 12, 16, 20) | every 4h | `ai` |

**Queue routing (`task_routes`):**
- `automation_worker.*` → `automation` queue (consumed by `worker-automation`)
- `decision_engine_worker.*` → `decision` queue (consumed by `worker-ai` per `--queues=ai,decision`)
- `notification_worker.*` → `notifications` queue (consumed by `worker-notifications`)
- `ai_worker.*` → `ai` queue (consumed by `worker-ai`)
- `maintenance_worker.*` → `maintenance` queue (consumed by `worker-automation` per `--queues=automation,maintenance`)
- Default → `default` queue → **NOT CONSUMED BY ANY WORKER.**

**Drift F.1 — `default` queue has no consumer.** `task_default_queue: "default"`
is set, with `Queue("default", routing_key="default")` declared, but none of
the 4 workers subscribe to `default`. Any task without an explicit route
(intentional or accidental — e.g. the `ops.*` ones use `options.queue` to
override) lands in `default` and accumulates indefinitely.

**Concurrency settings:**
- `worker-automation`: `--concurrency=4`, `--max-tasks-per-child=500`
- `worker-ai`: `--concurrency=8`, `--max-tasks-per-child=200`
- `worker-notifications`: `--concurrency=4`, `--max-tasks-per-child=1000`

**Task limits:** hard 600s / soft 540s (10 min / 9 min). Result expiry 24h.

---

## G. Backups

### Findings

- **No `pg_dump` script anywhere in `/opt/teivaka` repo or `/etc/cron.*`.**
- **No backup destination configured in `.env`** (no `BACKUP_DEST`,
  `S3_BACKUP_BUCKET`, `SUPABASE_BACKUP_*`, etc.).
- **No `crontab` for `tfos` user** (`crontab -l` returns "no crontab").
- **No system-level cron job referencing teivaka or pg_dump** in `/etc/cron.d/`.
- **`docker-compose.yml:502` comment "BACKUP: pg_dump daily to Hetzner Object
  Storage or Supabase"** — aspirational, never implemented.
- **`postgres_data` named volume is a single point of failure.** A disk
  failure or accidental volume deletion erases all 46 tenant tables, audit
  chain, agronomy KB, and library catalog with no recovery.

### Strike-class severity

This is a **silent gap** — production has been running 4+ days uninterrupted
with healthy containers, but a single `docker volume rm postgres_data`
command, a disk fault, or a corrupted page in PostgreSQL would lose the
entire system without recourse. The hash-chained audit table (Bank Evidence
trust anchor) lives in this volume too.

**Recommend:** dedicated backup strike. Minimum viable shape:
1. Daily `pg_dump --format=custom` to local `/opt/teivaka/backups/` with
   7-day rotation
2. Off-host copy to Supabase/S3/B2 (`SUPABASE_*` already in `.env`, may be
   reusable)
3. Pre-migration snapshot hook (Alembic upgrade triggers a fresh dump)
4. Documented restore procedure with a smoke-tested dry-run

---

## H. Log retention

### Application logs (json-file driver per service)

| Service | Max size/file | Max files | Retention |
|---|---|---|---|
| `api` | 50M | 5 | ~250M peak |
| `worker-automation` | 50M | 5 | ~250M peak |
| `worker-ai` | 50M | 5 | ~250M peak |
| `worker-notifications` | 20M | 3 | ~60M peak |
| `beat` | 10M | 3 | ~30M peak |
| `db` | 100M | 5 | ~500M peak |
| `redis` | 20M | 3 | ~60M peak |
| `caddy` | 20M | 3 | ~60M peak |
| **Total ceiling** | | | **~1.4 GB** |

### Bind-mounted host log dir

`/opt/teivaka/logs/` — **41 MB** total. Only `caddy/` subdir present (empty?
ls showed dir created Apr 13 with one subdir from same date). The 5 Python
services bind-mount `../logs:/app/logs` but appear not to be writing there in
practice — they're writing to stdout/stderr (the json-file driver path).

### Caddy file logs

`/var/log/caddy/access.log` (17.5 MB) — **inside container**, not bind-mounted
out. Roll policy keeps 5 × 100 MiB for 720 h (30 days). Survives container
restart but **not container recreation** (volume not declared for that path).

### journald

Not audited in detail — `journalctl --disk-usage` requires sudo. journald
default is "max 4 GB or 15% of /". `tis` and `tis-bridge` route stdout/stderr
to journald (`StandardOutput=journal`).

### Drift H.1 — Caddy access logs are unbacked

A container recreate (env rotation or healthcheck redefinition) wipes the
access log history. For Bank Evidence + audit-trail purposes, **this is a
gap**: no record of who hit `/api/*` after a recreate.

---

## I. SSL/TLS state

| Property | Value |
|---|---|
| Cert authority | Let's Encrypt (via Caddy ACME) |
| Issuer | `C = US, O = Let's Encrypt, CN = E7` |
| Subject | `CN = teivaka.com` |
| Valid from | `2026-04-13 09:11:37 UTC` |
| Valid until | `2026-07-12 09:11:36 UTC` |
| Days remaining | **65** (Caddy auto-renews ~30 days before expiry) |
| Cert storage | `caddy_data` named volume → `/data/caddy/certificates/` |
| ACME account | `founder@teivaka.com` |
| Domains covered | `teivaka.com`, `www.teivaka.com` |

**Cert renewal is not currently at risk.** Caddy handles ACME on its own
schedule, healthcheck verifies admin API, no manual intervention needed.

**`caddy_data` volume is critical** — losing it triggers an ACME re-issue
storm subject to Let's Encrypt rate limits (5 cert orders/week per registered
domain). Preserve this volume across any maintenance.

---

## J. DNS state

| Record | Value |
|---|---|
| `teivaka.com` A | `168.144.36.120` |
| `www.teivaka.com` A | `168.144.36.120` |

**Apex + www both point correctly to the host.** No CAA, MX, SPF, DKIM,
or DMARC checks performed in this audit (out of scope; flag for follow-up
if email pipeline is in scope at Phase 7+).

**Reverse DNS / PTR not audited** — relevant for outbound SMTP if email
sending is added.

---

## K. .env variable inventory (keys only, no values)

64 keys present. Categorized:

**Domain/infra (5):** `DOMAIN`, `API_DOMAIN`, `FRONTEND_URL`, `CADDY_EMAIL`, `HETZNER_SERVER_IP` (legacy name; should rename — host is no longer Hetzner)

**Database (5):** `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `PGBOUNCER_POOL_SIZE`

**Redis/Celery (3):** `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`

**JWT/auth (4):** `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`

**AI providers (5):** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CLAUDE_MODEL`, `EMBEDDING_MODEL`, `WHISPER_MODEL`

**TIS (5):** `TIS_BRIDGE_TOKEN`, `TIS_DAILY_LIMIT_FREE`, `TIS_DAILY_LIMIT_BASIC`, `TIS_KB_COVERAGE_TARGET`, `TIS_KNOWLEDGE_LAYER_LOGGING`, `TIS_MAX_TOKENS_PER_CALL`

**Messaging (8):** `META_PHONE_NUMBER_ID`, `META_WHATSAPP_TOKEN`, `META_WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_BUSINESS_NUMBER`, `WHATSAPP_RATE_LIMIT_PER_HOUR`, `VONAGE_API_KEY`, `VONAGE_API_SECRET`, `VONAGE_BRAND_NAME`, `CODY_WHATSAPP_NUMBER`

**Email (5):** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`

**Payments (2):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

**Storage (3):** `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_BUCKET_NAME`

**Observability (1):** `SENTRY_DSN`

**Other domain logic (~10):** `ENVIRONMENT`, `LOG_LEVEL`, `CORS_ORIGINS`, `MAX_UPLOAD_SIZE_MB`, `MAX_AUDIO_DURATION_SECONDS`, `MAX_OFFLINE_QUEUE_SIZE`, `SYNC_BATCH_SIZE`, `TENANT_DEFAULT_TIMEZONE`, `VECTOR_SIMILARITY_THRESHOLD`, `FIJI_INTELLIGENCE_PATH`, `F002_FERRY_BUFFER_DAYS`, `KAVA_INACTIVITY_ALERT_DAYS`, `ALERT_ESCALATION_HIGH_DAYS`, `ALERT_ESCALATION_MEDIUM_DAYS`, `PROFIT_SHARE_DEFAULT_RATE`

`.env` is `chmod 600 tfos:tfos` — correct. Three `.env.bak-*` files also
present in `04_environment/` (pre-credential-rotation snapshots, two
root-owned). Suggest housekeeping pass to either move them to `_archive/`
or delete after confirming rotation completed cleanly.

**Drift K.1 — `HETZNER_SERVER_IP` legacy name.** Host migrated off
Hetzner, key name should be renamed to `SERVER_IP` or `PRODUCTION_HOST_IP`
to avoid confusion. Backwards compat covered if any code references the
key, but no code search performed in this audit.

---

## L. Summary of findings

### Strike-class gaps (warrant their own strike)

| ID | Severity | Summary |
|---|---|---|
| **L.1** | 🔴 critical | **No backup mechanism exists.** `postgres_data` is a single point of failure for the audit chain, KB, libraries, and all tenant data. Section G. |
| **L.2** | 🟠 high | **Secrets embedded in systemd unit files.** `tis.service` carries `GEMINI_API_KEY` + `GOOGLE_API_KEY`, `tis-bridge.service` carries `TIS_BRIDGE_TOKEN`. Unit files are world-readable. Section E (E.1, E.3). |
| **L.3** | 🟠 high | **Resource limits exceed host RAM.** Compose `deploy.resources.limits` total ~7 GB on a 4 GB host. Currently fits because services are not at peak; future load surge risks OOM. Section A + B. |
| **L.4** | 🟡 medium | **`tis-bridge` runs as root.** Excessive privilege for a Node.js HTTP wrapper on port 18790. Section E (E.3). |
| **L.5** | 🟡 medium | **`default` Celery queue has no consumer.** Any unrouted task accumulates indefinitely in Redis. Section F (F.1). |
| **L.6** | 🟡 medium | **Caddy access logs not bind-mounted.** Container recreation wipes audit-trail history. Section D + H (H.1). |
| **L.7** | 🟢 low | **`tis.service` duplicate `GOOGLE_API_KEY=` empty assignment** silently overrides the populated value. Section E (E.2). |

### Documentation drift (already filed or housekeeping)

| ID | Status | Summary |
|---|---|---|
| **K.D1** | already B68 | Container count documented as 6, actually 8. |
| **K.D2** | new | `docker-compose.yml` comments name "Hetzner CAX21 ARM64"; real host is DigitalOcean Singapore. |
| **K.D3** | new | `.env` key `HETZNER_SERVER_IP` should be renamed post-migration. |
| **K.D4** | already B70 | Healthcheck audit across all workers (YAML list-form). Compose file shows all healthchecks now using list form post-Phase 8-2b/Strike #95. **Mostly closed** — verify on next audit pass. |

### New backlog candidates (proposed)

- **B84 — Backup mechanism** (pg_dump + off-host copy + restore drill)
- **B85 — Secrets-in-unit-files refactor** (move to `EnvironmentFile=` with `chmod 600`)
- **B86 — Resource-limit reconciliation** (size compose limits to actual host RAM)
- **B87 — `tis-bridge` runs-as-non-root** refactor
- **B88 — Default Celery queue consumer** (assign to a worker or remove the queue)
- **B89 — Caddy access log persistence** (bind-mount or named volume)
- **B90 — `tis.service` cleanup** (remove duplicate `GOOGLE_API_KEY=` line; add override.conf to readable path)
- **B91 — `HETZNER_SERVER_IP` env var rename + compose comment refresh**

Filing held until operator scope decision.

---

## M. Cross-references

- **Strike #94** — Droplet 2GB→4GB resize. Host is now DigitalOcean Singapore 4 GB.
- **Strike #95** — Worker outages + healthcheck YAML form fixes. All 8 containers now healthy.
- **Strike #110** — Celery scheduler restoration; `--max-interval=60` on beat.
- **Strike #66** — Healthcheck-transient vs service-degraded distinction (FUNCTIONAL test).
- **B68** — Container count drift (filed pre-Phase-6).
- **B70** — Healthcheck audit (Phase 8-2b/Strike #95 follow-up).
- **B72** — `WORKER_DATABASE_URL` superuser audit.
- **CLAUDE.md** Section "Architecture" — confirmed accurate after this audit.
- **CLAUDE.md** Section "Paths you care about" — confirmed accurate.

---

## N. Recon outputs (raw, for reproducibility)

Recon commands run against live host on **2026-05-08 13:20 UTC**:

- `docker compose -f 04_environment/docker-compose.yml config --services` — 8 services
- `docker ps -a` — 8 containers, all healthy
- `docker network ls` + `docker volume ls` — 1 custom net, 5 named volumes
- `Read 04_environment/docker-compose.yml` — full file (537 lines)
- `Read 04_environment/Caddyfile.production` — full file (157 lines)
- `Read 11_application_code/app/workers/celery_app.py` — full file (110 lines)
- `systemctl is-active tis tis-bridge` — both active+enabled
- `systemctl cat tis tis-bridge` — full unit definitions (override.conf locked)
- `dig +short teivaka.com A` — `168.144.36.120`
- `openssl s_client + x509` — Let's Encrypt E7, valid through 2026-07-12
- `docker exec teivaka_caddy ls -R /data/caddy` — cert + ACME state present
- `awk -F= '/^[A-Z]/' .env` — 64 keys
- `crontab -l` + `ls /etc/cron.d/` — no teivaka entries
- `find /opt/teivaka -name '*backup*' -o -name '*pg_dump*'` — nothing
- `df -h /` — 24G used / 80G

---

**End of Phase 6.**

Next: Phase 7 — TBD per audit master plan.
