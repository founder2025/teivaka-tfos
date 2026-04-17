# TFOS — Server Agent Brief

You are Claude Code running on the TFOS production server (168.144.36.120, DigitalOcean Singapore). Your user is Cody (Uraia Koroi Kama), founder of Teivaka PTE LTD, Fiji. You help him build, debug, and deploy TFOS — the Teivaka Farm Operating System.

## Current state (2026-04-15)

- Phases 1–2 complete (infra, auth, web shell)
- Phase 3 (TIS) ~85% — OpenClaw bridge live at https://teivaka.com/tis/chat, full-page UI at /tis, plus floating TISWidget on every farmer page
- Phase 3.5a complete (growth foundations: referral codes, attribution, 14-day BASIC trial, trial chip)
- Phase 4a in progress — 4a-3 done (compliance trigger consolidation), 4a-4 in review (harvest API rewrite). Migration head: 015a_fix_chemical_compliance.
- Phase 4b+ NOT started (automation engine, decision engine, offline sync, full farm ops)
- Overall ~30–35% against the full master spec

## Architecture

- FastAPI backend (container: teivaka_api) on port 8000, behind Caddy (container: teivaka_caddy) terminating TLS for teivaka.com
- PostgreSQL 16 + TimescaleDB + pgvector (container: teivaka_db) on 5432
- Redis 7.2 (container: teivaka_redis) on 6379
- worker-ai container (container: teivaka_worker_ai) — background tasks
- React PWA served by Caddy from /opt/teivaka/frontend/dist/ (Vite build output)
- OpenClaw TIS: systemd service `tis`, runs as user `tis`, WhatsApp bot +6797336211
- TIS bridge: systemd service `tis-bridge`, Node.js at /opt/tis-bridge/server.js, port 18790, exposes OpenClaw to the web via HTTP wrapper

## Paths you care about

- Frontend source: /opt/teivaka/frontend/src/ (Vite + React 18 + Tailwind)
- Frontend build: /opt/teivaka/frontend/dist/ (Caddy serves this)
- Backend: /opt/teivaka/03_backend/ and /opt/teivaka/11_application_code/
- DB schema: /opt/teivaka/02_database/
- Docker compose: /opt/teivaka/04_environment/docker-compose.yml
- Caddyfile (PRODUCTION): /opt/teivaka/04_environment/Caddyfile.production
- TIS bridge: /opt/tis-bridge/server.js
- OpenClaw workspace: /home/tis/.openclaw/

## Commands you can run (as user `tis`, no password)

- docker commands (you're in the docker group)
- sudo systemctl restart tis-bridge / tis
- sudo systemctl status tis-bridge / tis
- sudo journalctl -u tis-bridge -n 50

## Deploy patterns

**Frontend change:** edit /opt/teivaka/frontend/src/, then `cd /opt/teivaka/frontend && npm run build`. Caddy picks up dist/ automatically.

**Backend change:** edit /opt/teivaka/03_backend or the container code, then `docker compose -f /opt/teivaka/04_environment/docker-compose.yml up -d --build api`.

**Caddy change:** edit /opt/teivaka/04_environment/Caddyfile.production, then `docker exec teivaka_caddy caddy reload --config /etc/caddy/Caddyfile`.

**TIS bridge change:** edit /opt/tis-bridge/server.js, then `sudo systemctl restart tis-bridge`.

## Inviolable rules (from TFOS MASTER BUILD INSTRUCTION)

1. **Never hallucinate agronomic advice.** TIS answers must come from validated KB articles (Layer 1), Fiji Intelligence (Layer 2), or explicitly logged as fallback. Never invent crop protocols.
2. **Never bypass chemical withholding period (WHD) enforcement.** Dual-layer enforcement is mandatory:
   - **Layer 1 (UX):** `harvest_service.check_chemical_compliance()` returns HTTP 409 with full payload before any insert.
   - **Layer 2 (HARD GATE):** trigger `tenant.enforce_harvest_compliance` (migration 015a) `RAISE EXCEPTION 'CHEMICAL_COMPLIANCE_VIOLATION'` on every `INSERT INTO tenant.harvest_log`. Cannot be bypassed by ORM, raw SQL, or psql.
   Both layers must always be active. Neither alone is sufficient.
3. **Never compute dashboard signals on-demand.** Read from pre-computed `decision_signals` table. On-demand computation kills UX in low-connectivity Fiji.
4. **Never apply the standard 7-day harvest gap rule to kava (CRP-KAV).** Kava is a 4–5 year crop; the threshold is 180 days.
5. **Never fire RULE-034 (F002 ferry buffer) without per-input lead_time_days.** Read from `inputs.lead_time_days`, not a global default.
6. **Never expose stack traces in API responses.** Log to Sentry, return structured error codes.
7. **Never write to `shared.*` schema tables at runtime except these two:** `shared.kb_article_candidates` and `shared.attribution_events`. Everything else in `shared.*` is read-only at runtime — modify via Alembic migrations only.
8. **Never activate RULE-024–028 (aquaculture/pig).** Pig rules require biosecurity infrastructure due to ASF risk.
9. **Never show F001 profit share if `farms.profit_share_rate_pct` IS NULL.** Contractual figure for Nayans — a wrong number damages the business relationship.
10. **Never skip Twilio signature verification on webhook endpoints.**
11. **Every `tenant.*` table must enforce RLS using the `app.tenant_id` session variable** (set via `SET LOCAL app.tenant_id` in `get_tenant_db`). Set tenant context at session start, never bypass in business logic. NOTE: master spec says `app.current_tenant_id` — that is DRIFT. The deployed schema and middleware use `app.tenant_id`.
12. **Migrations via Alembic only.** No raw SQL in production without a migration file. Every migration must be reversible.

## Schema reality (master spec has DRIFT — use these names)

Confirmed against live DB on 2026-04-15. When the master spec disagrees, the live DB wins.

- `shared.chemical_library.chem_name` (NOT `product_name`)
- `shared.chemical_library.withholding_period_days` (NOT `whd_days` or `withholding_days_harvest`)
- `shared.chemical_library.registered_crops` is `text[]` of production_id codes (NOT a single `crop_id` column)
- `tenant.harvest_log.pu_id` (NOT `production_unit_id`)
- `tenant.harvest_log.chemical_compliance_cleared` (NOT `is_compliant`)
- `tenant.harvest_log` is a TimescaleDB hypertable with PK `(harvest_id, harvest_date)`
- `tenant.production_cycles.cycle_status` enum: `PLANNED|ACTIVE|HARVESTING|CLOSING|CLOSED|FAILED` — there is NO `COMPLETED` status
- `tenant.production_cycles.pu_id` (NOT `production_unit_id`)
- RLS session variable: `app.tenant_id` (NOT `app.current_tenant_id`)
- Alembic version table lives at `tenant.alembic_version` (NOT `public.alembic_version`)
- Subscription tiers: uppercase — `FREE | BASIC | PREMIUM | PROFESSIONAL | CUSTOM`
- New BASIC signups get `tis_daily_limit = 20`, 14-day trial via `users.trial_started_at` / `trial_ends_at`

## Working production features — DO NOT TOUCH unless task explicitly requires

These are shipped, tested, and revenue/UX-critical. Editing them risks regressions. If a task forces an edit, call out the standing-rule override explicitly.

- `frontend/src/pages/Landing.jsx`
- `frontend/src/pages/Login.jsx`
- `frontend/src/pages/Register.jsx`
- `frontend/src/pages/VerifyEmail.jsx`
- `frontend/src/pages/ForgotPassword.jsx`
- `frontend/src/pages/ResetPassword.jsx`
- `frontend/src/pages/farmer/TIS.jsx` (full-page TIS tab)
- `frontend/src/components/TISWidget.jsx` (floating chat — bottom-right of every farmer page)
- `frontend/src/components/farmer/FarmerLayout.jsx` trial-chip logic + `/auth/me` fetch
- `frontend/src/App.jsx` routing
- `frontend/index.html` SEO meta tags, `frontend/public/robots.txt`, `frontend/public/sitemap.xml`
- `04_environment/Caddyfile.production`
- `/opt/tis-bridge/server.js` and the `tis-bridge` systemd service
- The `tis` systemd service (OpenClaw)
- Alembic migrations 001 through 015a (current head: `015a_fix_chemical_compliance`). Never edit a stamped migration — write a new one.

Both the floating TISWidget and the `/tis` page are live; they share `POST /tis/chat`.

## Alembic workaround (asyncpg)

- asyncpg rejects multi-statement strings in `op.execute()`. Use the `_exec_each(statements)` helper pattern (see migrations 014, 015a) — one DDL statement per call.
- A single `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ..., ADD COLUMN ...` with multiple comma-separated clauses still counts as one statement and is fine.
- DO blocks (`DO $$ ... $$`) are one statement.
- `alembic_version` lives in the `tenant` schema, not `public` — verify with `SELECT version_num FROM tenant.alembic_version;`.

## Tech stack (no substitutions)

Python 3.12, FastAPI 0.115+, SQLAlchemy 2.0 async (never sync), PostgreSQL 16 + TimescaleDB + pgvector, Redis 7.2, Celery 5.4, React 18 + Vite + Tailwind, Claude via `claude-cli` provider (OpenClaw/OpenAI for Whisper in Phase 5+).

## Known issues (do not "fix" without asking Cody)

- Migration 012 (`012_add_farm_worker_count_limits`) IS now in versions/ — fresh deploys should work, but verify on a clean DB before relying on it
- worker_ai healthcheck definition wrong in docker-compose
- Migration 004 (materialized views) stubbed as no-op pending inputs.farm_id scoping
- /privacy and /terms pages don't exist but Register.jsx links them
- Admin password still `Teivaka2025!` (default, must change)
- Phone OTP to +679 doesn't deliver; fix path is WhatsApp OTP via existing Meta API
- Frontend has CSS build warning: a file uses `${C.green}` inside plain CSS (JS template literal leaked into CSS) — needs grep to find

## How to work with Cody

- Be ruthless. He's explicitly asked for blunt strategic advice, not validation.
- Prefer simple, scalable execution over elaborate smart-sounding plans.
- Call out false assumptions, hidden tradeoffs, and underestimated risks up front.
- When unsure, surface it as a new open question rather than hallucinating.
- Verify everything. Run the verification gates in the master spec (Part 17) before declaring any phase complete.
- Commit messages: terse, imperative, no marketing language.

## Open questions (defaults applied — do not hardcode)

- F001 profit share rate (hide profit share UI until set)
- F001 iTaukei lease expiry year
- F002 coordinator WhatsApp number (defaults to Cody)
- Exact Sea Master Shipping ferry schedule
- Nayans supermarket buyer contact details
- Specific chemical supplier contacts
- Kava current FJD/kg market price
- Stripe payment integration

## Today's immediate work queue

1. (pending) Wire `/tis/chat` streaming for perceived speed improvement
2. (pending) Farmer dashboard: live weather + market prices widget
3. (pending) Dead buttons in farmer nav: 6 stub tabs + Classroom 404
4. (pending) WhatsApp OTP as alternative to failing +679 SMS

Ask Cody before starting any new item. Confirm scope, then execute, then verify.
