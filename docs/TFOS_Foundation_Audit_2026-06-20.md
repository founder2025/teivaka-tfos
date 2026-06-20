# TFOS Foundation Audit — Readiness to Scale to Hundreds of Millions of Farmers

**Date:** 2026-06-20
**Design target:** 500M smallholders, global, offline-first, financial-grade audit trail
**Method:** Five parallel codebase audits (data layer, backend, infra/reliability, security, frontend/offline/i18n) grounded in `file:line` evidence, reconciled and calibrated by the lead. LLM cost math uses live Anthropic pricing.
**Status of this document:** Foundation doctrine. Item 4 (non-negotiables) and Item 7 (operator decisions) are the load-bearing sections.

---

## 0. The one-paragraph truth

TFOS is a **genuinely well-built Fiji pilot** — the offline-first layer (service-worker outbox + IndexedDB, 7-day floor, image compression, route-level code-splitting) is strong, the schema is clean and `tenant_id`-keyed so it can shard later without a rewrite, the audit chain is cryptographically sound, and the migration chain is linear and healthy. **Most "not ready for 500M" findings are deliberate Phase-1 scoping, not bugs** — single host, manual deploy, Fiji-hardcoded currency/payments/language — and they're already mapped in `SCALING_PLAN.md`. The job now is *not* to build Phase 4 infra. It is to fix the **small set of decisions that are cheap to get right today and expensive-or-impossible to retrofit later**, and to stop shipping code that adds to the retrofit pile. There are seven of those. Everything else is sequencing.

---

## 1. Executive summary — the 7 things that will hurt before 500M

1. **Bank Evidence over-claims what it can prove.** The hash chain is tamper-*evident* (you can't silently alter a past row) but it does **not** prove the underlying data is *true* — a farmer can record a harvest that never happened through legitimate flows, and `occurred_at` is backdatable. Shipping PDFs labelled "lender-verifiable" that you can't actually stand behind is a credibility and legal landmine. (Corroborated by security + data-layer agents.)
2. **Fail-open webhooks.** Stripe and WhatsApp webhooks **skip signature verification when their secret is unset** (the prod default). Spoofable subscription upgrades and spoofed farmer TIS messages.
3. **No startup guard on `secret_key`.** The code default (`"change-me-in-production..."`) is overridden by `.env` in prod — but nothing *enforces* that. One missed env var = forgeable tokens, silently.
4. **Tenant isolation has two real leak points** (not the one the backend agent flagged). The standard `get_rls_db` path is *safe*. The genuine risk is the two `set_config(..., false)` session-scoped usages that persist on pooled connections, plus base tables that lack `FORCE ROW LEVEL SECURITY` (superuser-bypassable).
5. **The DB connection model caps you early.** 30 app connections vs Postgres `max_connections=100`, no pgbouncer. This bites at *thousands* of users, not millions.
6. **Dashboard computes signals on-demand** — violates your own Inviolable #3 and turns every dashboard view into multi-table aggregation. Plus an on-demand `mv_decision_signals_current` that doesn't exist (latent 500).
7. **Backup integrity is unverified.** Off-host upload is a stub and the restore drill isn't scheduled — which means **Inviolable PR.1 is currently being violated**, and the audit-chain integrity claim should be self-flagged until fixed.

The infra realities (single host, no HA, no orchestration, no observability, manual CI/CD) are **real but correctly sequenced** in `SCALING_PLAN.md` — they belong in Phases 2–4, not pre-alpha. Likewise i18n/multi-currency/payments are Fiji-hardcoded by design; the fix is to *adopt the abstraction now* so new code stops adding debt, not to translate everything today.

---

## 2. Severity-ranked findings

Tags: **BLOCKS-ALPHA** = fix before the first cohort. **BLOCKS-SCALE** = fix before scaling, not before alpha. **DEBT** = address opportunistically. Confidence: **V** = verified in code, **A** = assumption/needs verification.

| # | Sev | Finding | Evidence | Why it bites at scale | Tag | Conf |
|---|---|---|---|---|---|---|
| 1 | 🔴 Critical | Bank Evidence proves tamper-evidence, not veracity; `emit_audit_event()` has no per-event authorization; `occurred_at` backdatable | `app/core/audit_chain.py:101-215,159-169`; v1→v2 seal `alembic/132` | A "verified" loan doc built on self-reported, backdatable data → lender fraud exposure & platform liability | BLOCKS-ALPHA | V |
| 2 | 🔴 Critical | Stripe & WhatsApp webhooks fail **open** when secret unset | `app/routers/webhooks.py:62-70,169-177,243` | Spoofed tier upgrades; spoofed farmer messages into TIS (prompt injection) | BLOCKS-ALPHA | V |
| 3 | 🔴 Critical | `secret_key` default in code, no boot-time guard | `app/config.py:15`; used `app/routers/auth.py:76-92`, `app/middleware/auth.py:99` | One missed env var → all JWTs forgeable across tenants, silently | BLOCKS-ALPHA | V |
| 4 | 🔴 Critical | Session-scoped RLS GUC (`set_config(...,false)`) persists on pooled connections | `app/routers/tis_stream.py:62`, `app/deps/tasks.py:233` | Reused connection serves Tenant B with Tenant A's context → cross-tenant leak | BLOCKS-ALPHA | V |
| 5 | 🔴 Critical | Base `tenant.*` tables lack `FORCE ROW LEVEL SECURITY` (only ENABLE) | `02_database/schema/02_tenant_schema.sql`; retrofits in `alembic/030,076,081,087` | Superuser / `session_replication_role` bypasses isolation; new tables ship without FORCE by omission | BLOCKS-ALPHA | V |
| 6 | 🔴 Critical | Off-host backup is a stub; restore drill not scheduled → **PR.1 violated** | `scripts/teivaka_backup.sh:185-192`; `scripts/teivaka_backup_restore_drill.sh` (no cron) | Single-disk failure = live DB + all backups gone; unverified backup = hopeful file | BLOCKS-ALPHA | V |
| 7 | 🟠 High | Dashboard computes decision signals on-demand + references non-existent MV | `app/routers/farms.py:238-313,269`; `app/services/decision_engine.py:62-64` | Violates Inviolable #3; every dashboard = multi-table scan; latent 500 | BLOCKS-ALPHA | V |
| 8 | 🟠 High | Error `detail=str(e)` leaks DB internals (violates Inviolable #6) | `routers/health.py:25`, `subscriptions.py:129`, `webhooks.py:177`, `cycles.py:253` | Schema/recon leak; broad attack surface | BLOCKS-ALPHA | V |
| 9 | 🟠 High | No pgbouncer; 30 app conns vs Postgres `max_connections=100` | `config.py:22-23`, `docker-compose.yml:56,350`; no pooler | Connection exhaustion at thousands of concurrent users | BLOCKS-SCALE | V |
| 10 | 🟠 High | Workers do unbounded full-tenant scans, sync `psycopg2`, low concurrency | `workers/automation_worker.py:200-246`, `decision_engine_worker.py`, `notification_worker.py` | Nightly job runtime explodes (≈100s of days at scale); no resume on crash | BLOCKS-SCALE | V |
| 11 | 🟠 High | i18n infra exists but **unused**; UI hardcoded English | `app/services/naming.py:32,57` (locale="en"); `095_profile_prefs.py` prefs unread; FE 0 calls to `name()` | 499M non-English farmers → ~0% adoption; every new hardcoded string adds debt | BLOCKS-SCALE | V |
| 12 | 🟠 High | Currency hardcoded FJD end-to-end; no multi-currency | `subscriptions.py:14-43` (`price_fjd_monthly`), `Marketplace.jsx:159`, `MarketIntelligence.jsx:169` | Cannot price outside Fiji; field-name-level coupling | BLOCKS-SCALE | V |
| 13 | 🟠 High | Payments are manual-only (M-PAiSA receipt → admin grant); Stripe stubbed | `classroom.py` payment_instructions; `subscriptions.py:130-161`; no `/webhooks/stripe` impl | 24h admin approval unscalable; no payment verification | BLOCKS-SCALE | V |
| 14 | 🟠 High | v1 audit chain sealed; pre-seal Bank PDFs won't re-verify | `alembic/132_audit_chain_seq_seal.py` | Any PDF issued pre-seal fails verification → trust incident | BLOCKS-SCALE | V |
| 15 | 🟡 Med | Single host, no HA/replication/orchestration/observability | `docker-compose.yml` (whole); `SCALING_PLAN.md` Phases 2-4 | Correctly sequenced; not a pre-alpha blocker | BLOCKS-SCALE | V |
| 16 | 🟡 Med | Resource limits over-committed ~75% on 4GB host | `docker-compose.yml:4-26,86-303` | OOM under load; fine at pilot size | BLOCKS-SCALE | V |
| 17 | 🟡 Med | Redis single instance, 400MB, LRU; rate-limit keys evictable | `docker-compose.yml:393-435,399` | LRU eviction lets users bypass daily TIS limit; no HA | BLOCKS-SCALE | V |
| 18 | 🟡 Med | Rate limiting in-memory/process-local; signup not rate-limited | `app/routers/auth.py:47-62` | Fake-account floods; per-instance limits multiply | BLOCKS-SCALE | V |
| 19 | 🟡 Med | Column-name interpolation in dynamic UPDATE (narrow SQLi surface) | `app/routers/equipment_records.py:137,171` | If update keys ever user-controlled → injection; whitelist columns | BLOCKS-ALPHA | A |
| 20 | 🟡 Med | Admin endpoints query cross-tenant without `tenant_id` filter (rely on role only) | `app/routers/admin.py:75-86,221-249` | Compromised/escalated admin acts across all tenants | BLOCKS-SCALE | A |
| 21 | 🟡 Med | No automatic network retry/backoff in API client | `frontend/src/utils/api.js:71-85`; React-Query retry inconsistent | Packet-loss networks fail on first error when a retry would succeed | BLOCKS-SCALE | V |
| 22 | 🟡 Med | No offline conflict-resolution strategy (last-write-wins only) | `frontend/src/utils/outbox.js`; idempotency only | Concurrent offline edits of one record → silent data loss | BLOCKS-SCALE | A |
| 23 | 🟡 Med | CoKG recomputed via synchronous trigger on every event | `02_database/SCHEMA_OVERVIEW.md:526-534` | Write-lock contention at high ingest; move to async recompute | BLOCKS-SCALE | V |
| 24 | 🟡 Med | Migrations run "as owner" (Strike #123); not RBAC-safe | migration docstrings (`alembic/149` etc.) | Superuser token in CI/CD pipeline; refactor to GRANT-based role | BLOCKS-SCALE | V |
| 25 | 🟡 Med | Solo mode (low-literacy, voice-first) redirects to `/home` | `App.jsx` `/solo/*` → Navigate `/home` | Core accessibility surface for low-literacy farmers is disabled | BLOCKS-SCALE | V |
| 26 | 🟡 Med | Tenant-wide timezone, no per-user override | `config.py:76`, `cycle_service.py` `_FIJI_OFFSET` | Multi-country tenant mis-times all date logic | DEBT | V |
| 27 | 🟢 Low | 30-day refresh token, no rotation; 24h access token | `config.py:17-18` | Stolen phone = 30-day impersonation window | DEBT | V |
| 28 | 🟢 Low | PII (phone/email/DoB/GPS) stored plaintext; no GDPR erase endpoint | `auth.py:457,478`; `webhooks.py:116` | Data-residency / privacy-regime exposure as you cross borders | BLOCKS-SCALE | V |
| 29 | 🟢 Low | bcrypt cost not pinned (passlib default 12); CORS allows localhost+credentials | `auth.py:65`; `config.py:140-146`, `main.py:196` | Minor hardening | DEBT | V |
| 30 | 🟢 Low | Fonts not subsetted; no WebP; Recharts 140KB on Analytics | `index.html:125-127`; `package.json`; `App.jsx:65` | Extra payload on weak devices/3G (lazy-loaded, so contained) | DEBT | V |

**Reconciliation note (important):** the backend agent flagged the *standard* RLS path (`set_config(..., true)`, transaction-local) as a critical leak. **It is not** — transaction-local fails *closed* (resets at commit → NULL tenant → zero rows). The data-layer agent reached the right conclusion (safe) via wrong reasoning. The real leak surface is the `false` (session-scoped) usages in #4. This is exactly why the audits were run in parallel and cross-checked.

---

## 3. Current vs target architecture (per layer)

| Layer | Now | 500M-ready target | Gap type |
|---|---|---|---|
| Tenancy/isolation | Schema-RLS, single DB, `tenant_id` on every table | Same model, FORCE everywhere + CI gate; later cell-shard by `tenant_id % N` | **Config/migration** (schema already shaped right) |
| Database | 1 Postgres container, no replicas | Managed Postgres w/ replicas + failover + PITR (RDS/Cloud SQL/Supabase) | **Build-vs-buy decision** |
| Connection mgmt | 30 conns, no pooler | pgbouncer (txn mode), 100+ stateless API pods | Refactor |
| AI/TIS serving | Single Max bridge (~38s), KB on every call | Tiered: deterministic→cache/RAG→Haiku→Sonnet, model-agnostic | Refactor (in progress) |
| Workers | Sync, unbounded full scans | async + batched/paginated + queue-depth autoscale | Refactor |
| Audit/Bank Evidence | Per-tenant chain, sound, but over-claimed + backdatable | Server-set `occurred_at`, per-event authz, corroboration signals, honest copy | **Decision + small build** |
| Frontend/offline | Strong offline-first, English/FJD only | Same engine + wired i18n + `formatPrice(amount,ccy)` + retry/backoff | Wire existing infra |
| Payments | Manual M-PAiSA, Stripe stubbed | Per-tenant `payment_rail_primary`, real gateways + webhooks | New build |
| Infra/observability | 1 host, no HA, no metrics | k8s + HPA, Prometheus/Grafana, Loki, tracing, off-host backups | Sequenced (Phases 2-4) |
| Secrets/CI-CD | `.env` files, manual deploy | Vault/secrets-manager, CI w/ tests+scan, blue-green | Sequenced |

---

## 4. The non-negotiable pre-alpha fixes (do these before the first cohort)

These are small, mostly hours-to-days, and each is either a security/credibility risk *now* or a schema-shape that's painful to retrofit once real data exists.

- **N1 — Fail-closed webhooks.** Reject Stripe & WhatsApp webhooks with 4xx when their secret is unset. (~1h) [#2]
- **N2 — Boot guard on `secret_key`.** Refuse to start in `production` if `secret_key` equals the default. Same guard for any unset critical secret. (~30m) [#3]
- **N3 — RLS scope fix.** Change the two `set_config(..., false)` usages to transaction-local `true` (or set per-connection on checkout). (~1h) [#4]
- **N4 — FORCE RLS everywhere + CI gate.** Migration applying `FORCE ROW LEVEL SECURITY` to all base `tenant.*` tables; a CI check that fails if any `tenant.*` table lacks ENABLE+FORCE. (~half day) [#5]
- **N5 — Error sanitization.** Replace every `detail=str(e)` with a structured code + reference id; full exception to logs/Sentry only. (~half day) [#8]
- **N6 — Bank Evidence honesty (the honesty-guardrail item).** Pick one and ship it before any PDF goes to a lender: (a) reframe the copy to "tamper-evident record of farmer-reported data, corroborated by [photos/GPS/buyer confirmation]" and add a self-reported caveat; **and** (b) server-set `occurred_at` (or flag backdated entries) + add per-event authorization in `emit_audit_event()`. Do not ship "verified" language you can't defend. [#1]
- **N7 — Backup integrity (close the PR.1 violation).** Implement the off-host upload (S3-compatible) and schedule the restore drill. Until done, the Bank Evidence integrity caveat must be honored per PR.1. (~1 day) [#6]
- **N8 — Dashboard reads precomputed signals only.** Remove on-demand aggregation + the phantom MV reference; read `decision_signal_snapshots`. Honest-empty during baseline. (~half day) [#7]

Everything in §2 tagged BLOCKS-SCALE is explicitly **not** on this list.

---

## 5. Sequenced roadmap (cheapest-irreversible-decisions first)

- **Now → pre-alpha:** N1–N8 above. Plus adopt two abstractions so new code stops adding debt even though we stay English/FJD/Fiji: a `formatPrice(amount, currency)` helper (default FJD) and route all user-facing strings through the existing `name()`/naming-dictionary path. Writing these now is cheap; retrofitting 200 hardcoded call-sites later is not.
- **Pre-scale (Phase 2, with pilot live):** pgbouncer; managed-Postgres decision + read replica; worker batching + async + concurrency; Redis HA; signup/global rate-limiting in Redis; admin endpoints `tenant_id`-scoped; column-name whitelist (#19).
- **Scale-up (Phase 3):** k8s + HPA; observability stack (metrics/logs/tracing/SLOs); CI/CD with tests + blue-green; secrets manager; per-tenant `payment_rail_primary` + real gateways; wire i18n + multi-currency end-to-end; enable Solo mode.
- **Global (Phase 4):** multi-region; cell sharding by `tenant_id`; data-residency/PII encryption + GDPR erase; decide global-vs-per-tenant audit ledger.

---

## 6. Stop-doing list (halt now — these build retrofit debt)

1. **Stop writing hardcoded `FJD` and English strings.** Use `formatPrice()` and `name()` from day one, even while Fiji-only.
2. **Stop adding `detail=str(e)`** to any endpoint.
3. **Stop creating `tenant.*` tables without ENABLE+FORCE RLS** in the same migration.
4. **Stop shipping Bank Evidence PDFs with "verified/lender-verifiable" language** until N6 lands.
5. **Stop adding new on-demand aggregation in hot endpoints** — emit to a precomputed table and read that.
6. **Stop treating the restore drill as optional** — it's an Inviolable (PR.1).

---

## 7. Decisions only the Operator can make

1. **Target geographies, next 12–24 months.** *Recommended default: Fiji + 1–2 Pacific neighbours.* If so, full i18n/multi-currency stays Phase-3 — but adopt the helpers now (§6.1). If you intend Africa/SE-Asia inside 12 months, i18n + multi-rail payments move up to pre-alpha and the timeline roughly doubles.
2. **Bank Evidence posture (legal exposure).** How strong a claim do you make to lenders? *Recommended: "tamper-evident, farmer-reported, corroborated" — never "verified true."* Drives N6's copy and how hard we gate event authorization.
3. **AI cost ceiling / who pays.** *Recommended: tiered serving with Haiku as default model, deterministic-first; bridge as $0 fallback.* At 25% daily-active × 2 questions, frontier-for-everything is ~$18M/yr; tiered serving cuts that by an order of magnitude. (Pricing: Haiku $1/$5, Sonnet $3/$15, Opus $5/$25 per MTok; batch −50%, cache reads ~0.1×.)
4. **Database: build-vs-buy for the HA tier.** *Recommended: managed Postgres (RDS/Cloud SQL/Supabase)* to get replication + PITR + failover without operating Patroni yourself. Decide before Phase 2 because it shapes the connection/backup/secrets design.

---

## 8. Confidence & gaps

- **Verified in code:** all 🔴 criticals and most 🟠 highs (see Conf column).
- **Assumptions needing a live check:** #19 (are equipment update keys ever user-controlled?), #20 (does `has_role` enforce hierarchy + do admin queries actually leak under RLS?), #22 (conflict-resolution behavior under real concurrent offline edits).
- **Not assessed this pass:** live load test, actual prod `.env` contents, TIS bridge internals (`/opt/tis-bridge/server.js` is outside the repo), real cache hit-rates.
- **Calibration applied:** the backend agent's "critical RLS leak" on the standard path was downgraded (fail-closed); several "SQL injection" hits were parameterized with hardcoded table lists (downgraded to the narrow column-name case #19); the `secret_key` finding was reframed from "tokens forged" to "no enforcement"; infra HA gaps were reframed from failures to correctly-sequenced Phase-2-4 work.
