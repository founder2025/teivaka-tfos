# TFOS Backlog Index

Canonical running list of filed-but-deferred work. Prior items (B22–B81) live in
`CLAUDE.md` "Open backlog (filed but deferred)" section and individual strike
archives under `00_project_overview/strikes/`. New items append here from
2026-05-08 forward; CLAUDE.md backlog section will be reconciled at next
doc-sync that touches it.

ID numbering: monotonic, never reused. Highest-on-disk wins (Strike #103 B77
rule).

---

## B82 — `tenant.tenants` table RLS design

**Filed:** 2026-05-08 (Strike #121 sibling-sweep recon)

**Current state:**
- `relrowsecurity = false` (RLS not enabled)
- `relforcerowsecurity = true` (force flag set, but no-op without enable)
- No RLS policies attached
- `tenant_id` column present (self-FK to `tenant.tenants.tenant_id`)

**Bug class:** Misconfigured no-op. Force-RLS without enable does nothing; with
no policy attached and RLS disabled, any role with `SELECT` grant on the table
sees every tenant row. Differs from `farm_active_groups` (Strike #121) in shape:
this is the tenant *registry*, not a join-table — it needs a different access
pattern.

**Open design questions:**
- Tenant-self-read: a logged-in tenant sees only their own row? (matches
  canonical pattern)
- Admin cross-read: who/how reads all tenants? Service role with BYPASSRLS?
  Separate admin-context session var?
- Onboarding flow: a new tenant pre-assignment must be writable somehow —
  what session context owns that write?
- Public listing: any future marketplace/community surface needs cross-tenant
  reads from `tenants` for display names; design now or punt?

**Park condition:**
- Until Phase 8 (community/marketplace) brings a real cross-tenant use case
  forcing the design call, OR
- Phase 9 audit forces the question via systemic recon

**Strike eligibility:** Blocked on operator design intent.

**Owners:**
- Boss (design intent)
- Architect (policy draft once intent set)

**Cross-references:**
- Strike #121 archive — sibling-sweep recon output
- Inviolable Rule #11 (RLS on every `tenant.*` table)

---

## B83 — Force-RLS sweep across 32 `tenant.*` tables (defense-in-depth)

**Filed:** 2026-05-08 (Strike #121 sibling-sweep recon)

**Current state:**
- 32 `tenant.*` tables have RLS policies attached and RLS enabled
- All 32 have `relforcerowsecurity = false`
- Canonical-shape baseline (force=true): 12 tables, including
  `farm_active_groups` after Strike #121

**Tables affected (32):**
accounts_receivable, ai_commands, automation_rules, customers, cycle_financials,
decision_signal_config, decision_signal_snapshots, delivery_log, equipment,
flocks, harvest_compliance_overrides, harvest_loss, hive_register, income_log,
input_transactions, inputs, kb_embeddings, livestock_register, nursery_log,
order_line_items, orders, poultry_event_log, price_master, profit_share,
referral_rewards, rotation_override_log, suppliers, tis_conversations,
tis_voice_logs, weather_log, workers, zones

**Bug class:** Silent superuser bypass. PostgreSQL's BYPASSRLS attribute on the
`teivaka` superuser (used by `WORKER_DATABASE_URL` per B72) silently bypasses
the attached policies on these 32 tables. Force-RLS is what makes the policy
binding even for table-owner / superuser connections. Without it, every
worker-side aggregation query traverses all tenants regardless of session
`app.tenant_id`.

**This is NOT the same class as `farm_active_groups`** (which had no
isolation at all). This is *defense-in-depth* — application-layer scan
discipline (Strike #95 two-stage scan) currently provides isolation, but the
database layer is ungated.

**Prerequisites:**
1. SET-context inventory across every code path opening a DB connection:
   - Application: FastAPI dependency `get_tenant_db` (sets
     `SET LOCAL app.tenant_id`)
   - Workers: `WORKER_DATABASE_URL` paths in `worker_automation`,
     `worker_notifications`, decision engine
   - Migrations: Alembic context (no tenant context — needs BYPASSRLS or
     explicit GUC)
   - Admin scripts: any one-off psql / Python invocations
2. Phase 9 audit (systemic infrastructure pass) is expected to produce this
   inventory as a synthesis byproduct.

**Verify gate when shipped:**
- All workers complete a full end-to-end run after `ALTER TABLE ... FORCE`
  applied to all 32 tables
- No silent breakage in Decision Engine, automation engine, notifications
- Admin tooling continues to function (or is explicitly noted as needing
  BYPASSRLS escalation)
- Cross-tenant exploit probe (Strike #121 pattern) returns 0 rows from each
  table when queried with wrong `app.tenant_id` from a non-superuser session

**Strike eligibility:** After Phase 9 audit ships AND SET-context inventory
synthesizes a clean coverage map.

**Owners:**
- Architect (recon + migration draft)
- Boss (approval gate)

**Cross-references:**
- B72 (WORKER_DATABASE_URL using teivaka superuser)
- Strike #95 (silent worker outages, two-stage scan pattern)
- Strike #121 (farm_active_groups; canonical force-RLS pattern established)
- Inviolable Rule #11

---

## B84 — Backup mechanism — **CLOSED 2026-05-08** (on-host portion)

**Filed:** Phase 6 audit (Section L.1, severity 🔴 critical)
**Closed:** Strike #122 (commit `093afda`)

On-host pg_dump pipeline + restore drill + systemd timer + Resend HTTPS
API failure alerts shipped. `postgres_data` is no longer a single point
of failure for accidental volume rm or corruption.

Off-host portion remains open as B93 (Strike #122b) — same disk failure
that takes down `postgres_data` still takes down `/opt/teivaka/backups/`
without an off-host destination configured.

**See:** `00_project_overview/strikes/strike_122_backup_pipeline.md`

---

## B92 — Notification CLI extraction (deferred from Strike #122)

**Filed:** 2026-05-08 (Strike #122 build)

Bash backup script currently calls Resend HTTPS API directly via curl
inside `send_alert()`. Production app code (`app/utils/email.py`)
duplicates the same Resend call pattern in Python. Two implementations
of the same alert pattern is acceptable for #122's tight scope but
becomes maintenance debt as more host-side scripts grow.

**Future shape:** extract a `scripts/teivaka_notify.sh` that wraps the
Resend POST and is callable from any host-side script with a uniform
interface. Bash backup script + restore drill + future ops scripts call
into it. Python app code stays separate (different runtime, different
needs).

**Strike eligibility:** non-blocking; file when a second host-side
script needs the alert path.

**Owners:** Architect.

---

## B93 — Strike #122b: off-host upload bolt-on (pending vendor credentials)

**Filed:** 2026-05-08 (Strike #122 build)

Strike #122 ships the on-host backup with `upload_offhost(local_filepath,
remote_filename)` stubbed. Function signature is stable; #122b swaps only
the body.

**Vendor decision pending:**
- Supabase: `.env` already scaffolded but URL/KEY empty placeholders
  (15 min Operator effort to wire)
- DO Spaces: ~$5/mo, new credential, S3-compat tooling (30 min)
- Other off-host: B2, S3, etc.

**Architect leans:** Supabase, since `.env` is already scaffolded and
no new vendor footprint required. Operator dashboard wire = 15 min.

**Strike-eligible:** as soon as Operator picks a vendor and wires
credentials.

**Owners:** Boss (vendor + credential), Architect (function body).

**Cross-references:**
- Strike #122 archive: `00_project_overview/strikes/strike_122_backup_pipeline.md`
- B84 (parent — on-host portion closed)

---

## B94 — env key rename: `SMTP_*` → `RESEND_*` (cosmetic)

**Filed:** 2026-05-08 (Strike #122 build)

`.env` has `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`,
`SMTP_FROM` — these are scaffolded as if for an SMTP server, but the
actual transport is Resend's HTTPS API. `SMTP_PASSWORD` is a Resend
`re_`-prefixed API key, `SMTP_HOST=smtp.resend.com` is unused for the
HTTP API path, etc.

**What this requires:** rename keys + update every consumer:
- `app/utils/email.py` (Python — auth + cash flows)
- `app/config.py` (settings model)
- `scripts/teivaka_backup.sh` (Strike #122 alert path)
- `04_environment/.env` + `.env.example`

**Why deferred:** purely cosmetic; current names work; coordinated
rename across Python + bash needs container recreation per Strike #69.

**Strike-eligible:** anytime; not urgent.

**Owners:** Architect.

---

## B95 — DigitalOcean outbound SMTP block (INFRASTRUCTURE_NOTE — not actionable)

**Filed:** 2026-05-08 (Strike #122 build, surfaced V7)

**State:** DO blocks all outbound SMTP ports (25, 465, 587, 2525) on
this droplet by anti-spam policy. Verified via `bash -c "</dev/tcp/host/port"`
during Strike #122 V7.

**Workaround:** alert paths use HTTPS API (api.resend.com:443) which is
not blocked. Same Resend API key works for both SMTP and HTTPS API.
Strike #122 send_alert() uses HTTPS path.

**Why this is an INFRASTRUCTURE_NOTE not a strike:** vendor (DO) policy
is not actionable by us. Could file a DO support ticket to request
unblock (multi-day turnaround, unpredictable approval), but the HTTPS
API path is functionally superior — no port blocks, more reliable
delivery, primary recommended Resend interface.

**Awareness only:** future ops/admin scripts that need to send mail
must use HTTPS API path, not assume SMTP works from this host.

**Strike eligibility:** none. File-and-forget reference for future work.

---

## B96 — Phantom-recipient audit (filed 2026-05-09)

**Filed:** 2026-05-08 surfaced; 2026-05-09 logged. Strike #122 V7-redux.

**Scope:** sweep entire repo for every email address in
source/config/docs; confirm each mailbox exists and is monitored;
replace any that don't.

**Why filed:** Strike #122 V7 originally reported PASS based on Resend
HTTP 200 + delivery ID, but `cody@teivaka.com` (the hardcoded
recipient) was a non-existent mailbox. Resend's 200 means *accepted*,
not *received*. False-confidence failure mode. Validates PR.2 proposed
inviolable in real time.

**Known instances at filing:**

| Address | Where | State |
|---|---|---|
| `cody@teivaka.com` (ALERT_RECIPIENT) | scripts/teivaka_backup.sh:42 | RESOLVED — Strike #122 V7-redux (commit `7c7a0ea`); now sourced from .env with founder@ fallback |
| `cody@teivaka.com` (CADDY_EMAIL default) | 04_environment/docker-compose.yml:470 | OPEN — Let's Encrypt ACME contact; if renewal ever needs operator outreach, DO can't reach you |
| `cody@teivaka.com` (CADDY_EMAIL default) | 04_environment/.env.example:212 | OPEN — scaffold for future deploys propagates the bug |
| `cody@teivaka.com` (CADDY_EMAIL default) | 4× docker-compose.yml.bak-* | OPEN — pollutes grep, but pre-strike snapshots arguably immutable |
| (full sweep TBD) | repo-wide | not yet enumerated |

**Doctrine implication:** candidate addition to Section 13 Forbidden
Moves — *"No email address ships in code or config without
mailbox-existence verification recorded in strike archive."*
Mailbox-existence check = MX record present + send-and-confirm-receipt
test from Operator's actual inbox.

**Strike eligibility:** anytime; recommended bundling with closeout of
Strike #122 to capture full sweep in one strike. CADDY_EMAIL fix is a
config-only edit + container reload (Caddy only — db/api/etc unaffected).

**Owners:** Architect (sweep + catalog), Operator (per-address mailbox
confirmation).

**Cross-references:**
- Strike #122 V7-redux (this strike's V7-redux section)
- PR.2 proposed inviolable (verified-loud over assumed-quiet)
- Phase 6 audit document Section J (DNS state) — basis for any future
  MX/CAA verification per address

---

