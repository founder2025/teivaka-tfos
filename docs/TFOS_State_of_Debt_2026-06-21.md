# TFOS State-of-the-Debt — Phase A Forensic Report

**Date:** 2026-06-21 · **Mode:** RECON ONLY (nothing modified) · **Author:** chief systems architect (Claude Code)
**Environment caveat:** produced from a fresh **git clone in a cloud container**, NOT the production droplet.
Every code finding is **VERIFIED-IN-CODE** with `file:line`. Live DB state and runtime infra are
marked **NEEDS-LIVE-DB / NEEDS-DROPLET** with the exact command to settle them — no numbers were guessed.

Method: six parallel forensic sweeps (migrations, multi-tenant/RLS, dead/dup code, security/billing,
audit-chain/data-quality, doc-drift). All Criticals were re-verified by hand by the architect, not parroted
from the sub-agents. Where a sub-agent claim could not be confirmed from source, it is marked needs-live.

---

## 0. Headline truths

1. **The platform is spending real Anthropic credits in production** — one beat-scheduled worker bypasses
   the OpenClaw bridge. Direct billing-doctrine breach.
2. **The Alembic chain has two heads** — a fresh `alembic upgrade head` either errors ("multiple heads") or
   silently skips a CHECK-constraint fix. New migrations cannot be safely stacked until merged.
3. **Fresh/greenfield deploy is broken at migration 074** (seed populates `tenant.inputs`, 074 then adds a
   NOT-NULL column with no backfill). pg_restore-from-dump DR is fine; building from scratch is not.
4. **A tenant-isolation leak vector exists** (session-scoped RLS GUC + an auth middleware that doesn't reset
   it) AND the deployed `tenant.users` RLS policy contradicts the source tree. Together: a possible
   cross-tenant mis-scope. Must be settled against live `pg_policy` before going multi-tenant-wide.
5. **Bank Evidence is tamper-evident, not veracity-proving** — corroborated from two independent angles.
6. The codebase is otherwise **healthier than its age** — dist not committed, one icon/date/state lib each,
   zero dead routers, negligible TODO debt. The real rot is concentrated, not pervasive.

---

## 1. Ranked findings

Legend — **Safe?**: SAFE = mechanical/reversible · CARE = auth/migration/audit, stage with rollback · DECISION = needs Boss.

### 🔴 CRITICAL

| # | Finding | Evidence | Blast radius | Safe? | Rollback risk |
|---|---|---|---|---|---|
| C1 | **Live Anthropic API spend** — `generate_weekly_insights` calls `anthropic.Anthropic().messages.create` directly; beat-scheduled `ai-insights-weekly` (Sat 18:00 UTC), loops every PREMIUM/CUSTOM tenant×farm, silent. Plus a dead module-level `AsyncAnthropic` client holding the key. | `app/workers/ai_worker.py:123-180`; `app/workers/celery_app.py:107-112`; dead client `app/services/tis_service.py:3,18` | Metered credit burn scaling with paid-tier farms; doctrine breach; one stray call on the dead client = 2nd spend path | SAFE | Low — disable beat entry / route to bridge; reversible |
| C2 | **Migration chain has two heads** — `105_fix_feed_audience_check` & `105_tier_requests_prefs` both child `104_groups`; nothing descends from the former (dead head). | `alembic/versions/105_fix_feed_audience_check.py`, `105_tier_requests_prefs.py` (both `down_revision="104_groups"`) — verified by hand | Fresh `upgrade head` errors on multi-head OR skips the `feed_audience` CHECK fix; **blocks all future migrations** | CARE | Med — needs a merge migration, apply-as-owner |
| C3 | **Tenant-isolation leak vector + policy contradiction.** (a) `set_tenant_context` sets GUC session-scoped (`false`) → persists on pooled conn; (b) `auth.py` opens a raw session every request and does NOT NULL-reset (unlike `get_db`); (c) the live `tenant.users` policy is asserted permissive-on-NULL in code comments but **no migration creates it** (latest is strict). | `app/deps/tasks.py:233` (`false` — verified); `app/middleware/auth.py:129`; policy: `02_tenant_schema.sql:110`, `015c:85` (strict) vs `session.py:46`, `150:20` (claims permissive) | Possible cross-tenant mis-scope of the auth lookup; correctness of auth path **unverifiable from source** | CARE + **NEEDS-LIVE-DB** | High — auth/RLS; stage with rollback |
| C4 | **Bank Evidence: tamper-evident, not veracity-proving** — `occurred_at` client-supplied/backdatable; no per-event authorization in `emit_audit_event`; the underlying event row is editable (`GRANT UPDATE ON tenant.poultry_event_log TO teivaka_app` + `payload_jsonb`). `audit.events` itself IS append-only (REVOKE+triggers verified). | `app/core/audit_chain.py:148-160`; `046:101`; immutability `023:160,169-192` | Lender could read "verified" as "true" → fraud-exposure/liability. = prior audit #1 (still open, decision #2) | DECISION | n/a (copy + authz design) |

### 🟠 HIGH

| # | Finding | Evidence | Blast radius | Safe? |
|---|---|---|---|---|
| H1 | **Greenfield deploy broken at 074** — seed inserts `tenant.inputs` w/o `farm_id`; `074` adds `farm_id NOT NULL` no-backfill ("verified empty" only true on live prod). | `04_seed_data.sql:272` (no farm_id col); `074_inputs_farm_id.py:39` — verified | Fresh `alembic upgrade head` / disaster-rebuild-from-migrations fails. (pg_restore DR unaffected.) | CARE + **NEEDS-LIVE-DB** (`SELECT count(*) FROM tenant.inputs`) |
| H2 | **`maintenance_worker` cross-tenant writes on a FALSE BYPASSRLS assumption, no RLS context** — docstring claims superuser/BYPASSRLS but connects as non-bypass `teivaka_app`; `UPDATE tenant.alerts / tenants / task_queue` with no `with_rls`/`SET app.tenant_id`. | `app/workers/maintenance_worker.py:120-133,76-105` | TIS daily-counter reset / alert cleanup / task expiry may silently touch 0 rows (B73/Strike-#95 family) | CARE |
| H3 | **`me.py` reads/writes `tenant.*` via non-RLS `get_db`, never sets tenant context**; several queries filter `user_id` only, no tenant predicate. Same file uses `get_tenant_db` elsewhere (inconsistent). | `app/routers/me.py:49,55,135,158,162,203,207,299` vs `:377+` | If live policy strict → silent empty reads; if permissive → cross-tenant read exposure | CARE |
| H4 | **`poultry_event_log.created_by UUID NOT NULL` has no FK to `tenant.users`** — operator anchor unenforced on the audit-bearing event table. | `046:57` | Orphan/garbage actor IDs on compliance events; weakens anchor coverage | CARE (migration) |
| H5 | **`production_cycles.layer` still NULLable** despite Strike #101/#103 NOT-NULL mandate; only F001's 2 cycles backfilled. | `072:71` | Cycles created layer-less; 3-Layer doctrine integrity gap | CARE + **NEEDS-LIVE-DB** (`layer IS NULL` count) |
| H6 | **Three competing HTTP clients in frontend** — `api.js` (27 files, has auto-refresh+honest errors), `apiClient.js` (31 files, no refresh), raw `fetch` (~105 files). Only 27 get token refresh. | `frontend/src/utils/api.js`, `apiClient.js:8-11`; grep | ~136 call sites silently lack token refresh + honest error UX (B31) | SAFE (incremental) |
| H7 | **20 orphaned React components** — re-implemented inline elsewhere; 0 real importers (verified). | listed in §3 | Dead weight, confusion, bloat | SAFE (delete) |
| H8 | **Currency hardcoded FJD at column/field level** across 46 backend files (`amount_fjd`, `price_fjd`). | grep; `02_tenant_schema.sql *_fjd` | No currency dimension; multi-country pricing/Bank Evidence needs schema change, not a wrapper | CARE (scale) |
| H9 | **`/tis-widget.js` referenced but missing** from repo + git. | `frontend/index.html:141` — verified missing | 404 on every page load after a clean build/deploy | DECISION (index.html is DO-NOT-TOUCH) |

### 🟡 MEDIUM

| # | Finding | Evidence |
|---|---|---|
| M1 | Stale `requirements.txt` (NOT deployed; deploy uses `requirements-api.txt`); lists `pandas/boto3/sentence-transformers/supabase` w/ 0 import sites — `supabase` absent from deployed reqs so any Supabase path = ImportError in prod. | `04_environment/Dockerfile:73,78`; `11_application_code/requirements.txt` |
| M2 | ~10 frontend files bypass the `money.js` `formatMoney` seam with local `fjd()` helpers. | `Analytics.jsx:35`, `Reports.jsx:117`, `DecisionCenter.jsx:34`, `FarmHistory.jsx:41`, `CashLedger.jsx:25`, `Partnerships.jsx:39`, `FarmDashboard.jsx:48`, `Enterprises.jsx:61`, `InventoryList.jsx:23`, `Buyers.jsx:28` |
| M3 | Base schema ships RLS **ENABLE-only**, FORCE retrofitted by `150`; **no in-repo CI gate** keeps new tables FORCE-compliant — relies on author memory. | `02_tenant_schema.sql` (all CREATE TABLE); `150_force_rls_all_tenant.py` |
| M4 | Tenant-wide hardcoded **Fiji TZ**; date math reads a constant, ignores the existing `tenants.timezone`/`farms.timezone` columns. | `cycle_service.py:73` `_FIJI_OFFSET`; `attendance.py:147`; cols at `02_tenant_schema.sql:42,144` |
| M5 | One-time `UPDATE audit.events` in a migration (owner/replica-only; not a runtime path). | `025_audit_events_add_cycle_transition.py:72` |
| M6 | Dead Python `verify_chain()` walks the **buggy occurred_at axis** (pre-132 bug); 0 callers; footgun if ever wired to Bank Evidence. | `app/core/audit_chain.py:231,248` |
| M7 | Pre-seal Bank PDFs won't re-verify (132 sealed v1 rather than rewriting). | `132_audit_chain_seq_seal.py` |
| M8 | `ai_worker` uses `SET LOCAL` instead of the doctrinal `with_rls` helper (fragile if autocommit ever on); other workers comply. | `app/workers/ai_worker.py:75,142` |
| M9 | `admin.py` cross-tenant reads via `get_db` rely implicitly on a permissive policy (ties to C3); if policy is strict → silent zero/partial analytics. | `app/routers/admin.py:76-260` |
| M10 | 8.6 MB duplicated prototype HTML (intentional — sacred copy + served copy; could be build-generated). | `docs/TFOS_MyFarm_Prototype_v263_20260608.html` ≡ `app/static/prototype_v263.html` |

### 🟢 LOW

| # | Finding | Evidence |
|---|---|---|
| L1 | Default founder/admin password `Teivaka2025!` committed in VCS (seed); already flagged in CLAUDE.md + a hardening runbook. Owner-clobber risk low (`ON CONFLICT DO NOTHING`). | `02_database/schema/04_seed_data.sql:9,42-57` |
| L2 | **CLAUDE.md "Current state" rotted** — claims head `086` (line 82) & `015a` (line 517), disk is **151**; container counts say 6 vs 8 vs 9; "/privacy /terms don't exist" is FALSE (both exist+routed); "CSS `${C.green}`" warning gone; `03_backend` mislabeled as backend (it's 9 `.md` docs, real backend = `11_application_code`). | CLAUDE.md vs `App.jsx:194-195`, `Privacy.jsx`/`Terms.jsx`, disk |
| L3 | Schema SQL (`02_database/schema/*.sql`) is a frozen ~001-003 baseline (~100 later tables absent); will mislead a fresh-deploy reader. Label it or regenerate. | `02_tenant_schema.sql` (no `farm_id` on inputs; no `flocks`/`poultry_event_log`) |
| L4 | Stale handover/doctrine docs (e.g. `SESSION_HANDOVER_2026-05-04_classroom_pause.md` "4 healthy 2 unhealthy" — closed by Strike #95); duplicate runbook number 094. | `docs/doctrine/`, `docs/runbooks/094_*` |

---

## 2. Things I ADDED that you did not list

- **C1 is a *live* breach, not just a check** — you asked me to look for direct Anthropic calls; I found one actually scheduled and spending. Elevated to lead Critical.
- **H1 greenfield-deploy break at 074** — you asked about backfill-before-multi-tenant; this is the concrete instance, and it's a DR landmine (rebuild-from-migrations is broken; rebuild-from-dump is fine).
- **H6 three HTTP clients** + **M2 money-seam bypass** — "two ways of doing one thing" at scale.
- **M1 stale `requirements.txt` with a latent ImportError** (Supabase).
- **M3 no CI gate for FORCE RLS** on new tables — the structural reason #C3-class debt recurs.
- **M6 dead buggy `verify_chain`** — a Bank-Evidence footgun.
- **L3 frozen schema-SQL baseline** — silent fresh-deploy trap.

## 3. The 20 orphaned components (H7 — all verified 0 importers)

`components/IdentityGate.jsx`, `utils/identityGate.js`, `components/farm/{AttendanceCard, BankabilityPath,
CyclePipeline, DemandPipeline, FarmComparison, FarmSummaryCard, IntelligencePanel, MetricCard,
PerformanceSummary, PriorityCards, QuickActions, TisSuggestions, TopTaskBanner}.jsx`,
`components/nav/SearchBar.jsx`, `components/onboarding/VoiceInput.jsx`,
`components/tis/{TisFab, TisModal}.jsx`, `pages/me/MeProfile.jsx`.

---

## 4. Fix-cluster order (fix-first-unlocks-most / lowest-risk-first)

> Each cluster runs the six-step cadence and **HALTS for Boss approval** before the next.

- **Cluster 1 — Stop the credit bleed (C1).** Disable `ai-insights-weekly` beat entry (immediate stop) →
  migrate the summary to `bridge_chat` → delete the dead `tis_service` client → drop `anthropic_api_key`
  from prod env. *Lowest risk, stops money now, no schema/auth.* **Recommend first.**
- **Cluster 2 — Migration-chain integrity (C2 + H1).** Author a merge migration uniting the two heads;
  fix the 074 greenfield break (make 074 idempotent/backfill-aware, or add `farm_id` to the seed insert).
  *Unlocks ALL future schema work + fresh deploy/DR-from-migrations.* Verify on a scratch DB. apply-as-owner.
- **Cluster 3 — Tenant isolation (C3 + H2 + H3 + M8/M9).** FIRST settle the live `pg_policy` truth, then:
  flip `deps/tasks.py:233` to `true`; NULL-reset (or `get_tenant_db`) in `auth.py` + `me.py`; bring
  `maintenance_worker`/`ai_worker` onto `with_rls`. *Highest care — stage with one-command rollback.*
  Must precede multi-tenant-wide rollout.
- **Cluster 4 — Data-quality anchors (H4 + H5).** `poultry_event_log.created_by` FK; backfill +
  `production_cycles.layer NOT NULL`. *Needs Cluster 2 done first (migrations).*
- **Cluster 5 — Dead-code + asset cleanup (H7 + M1 + H9 + M6 + L3/L4 + M10).** Delete 20 orphans + stale
  `requirements.txt` + dead `verify_chain`; resolve `tis-widget.js`; label/regenerate schema baseline; prune
  stale docs. *Lowest risk, mechanical, verified no importers.* Can run anytime.
- **Cluster 6 — Frontend consolidation (H6 + M2 + H8-FE).** Converge on one HTTP client; route money through
  `formatMoney`. *Biggest effort, incremental, no rush (B31).*
- **Cluster 7 — Doc reconciliation (L2 + L3 + M4).** Refresh CLAUDE.md Current-state; per-user/per-farm
  timezone; container-count truth. *Housekeeping.*

**Standing decisions (not a code cluster):** C4 Bank-Evidence veracity = product/copy + authz design (prior
decision #2); H8/M4 multi-currency + per-user TZ = scale-track, schema-level.

---

## 5. NEEDS-LIVE-DB / NEEDS-DROPLET — run these on the droplet to settle the report

```sql
-- 1. Migration head reality (settles L2; confirms C2 multi-head on the live stamp)
SELECT version_num FROM tenant.alembic_version;
-- in container:  docker exec teivaka_api alembic heads   (expect: should be 1; if 2 → C2 live)

-- 2. tenant.users RLS policy — settles C3 contradiction (permissive vs strict)
SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS check_expr
FROM pg_policy WHERE polrelid = 'tenant.users'::regclass;

-- 3. audit.events grants for the runtime role (must be SELECT[,INSERT]; NO UPDATE/DELETE)
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='audit' AND table_name='events' AND grantee='teivaka_app';

-- 4. Greenfield DR landmine (H1) — is prod's inputs table really empty?
SELECT count(*) FROM tenant.inputs;

-- 5. 3-Layer integrity (H5)
SELECT count(*) FILTER (WHERE layer IS NULL) AS null_layer, count(*) FROM tenant.production_cycles;

-- 6. Real vs phantom tenants + multi-genesis (B69)
SELECT count(*) FROM tenant.tenants;
SELECT tenant_id, count(*) FILTER (WHERE previous_hash IS NULL) AS genesis_rows
FROM audit.events GROUP BY tenant_id HAVING count(*) FILTER (WHERE previous_hash IS NULL) > 1;

-- 7. tenant tables missing a tenant_id index (10x/100x scale)
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='tenant' AND c.relkind='r'
AND NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_attribute a
  ON a.attrelid=c.oid AND a.attnum=ANY(i.indkey)
  WHERE i.indrelid=c.oid AND a.attname='tenant_id');

-- 8. Live chain integrity (sacred — read only)
SELECT * FROM audit.verify_chain_for_tenant('<tenant_uuid>');
```
```bash
# NEEDS-DROPLET — infra/runtime
free -h && swapon --show && df -h /
docker ps --format 'table {{.Names}}\t{{.Status}}'
```

---

## 5b. LIVE VERIFICATION ADDENDUM (2026-06-21, run on prod droplet as `teivaka` owner)

| Q | Result | Effect on report |
|---|---|---|
| Migration stamp | `151_user_sessions_valid_after` | matches disk head |
| **`alembic heads`** | **TWO heads: `105_fix_feed_audience_check` + `151...`** | **C2 CONFIRMED LIVE** — `105_fix_feed_audience_check` never applied; next `upgrade head` errors |
| `tenant.users` policy | **permissive-on-NULL** (`current_setting IS NULL OR '' OR match`) | C3 sub-finding resolved: live policy is permissive (auth works), but **source/migrations would deploy STRICT** → fresh-deploy/DR breaks login (untracked drift). Permissive policy = GUC-leak is a real cross-tenant exposure. |
| **audit.events grants → teivaka_app** | **INSERT, SELECT, UPDATE, DELETE** | **NEW 🔴 — UPDATE/DELETE must not be granted.** Immutability triggers (`023:169-192`) currently hold the line; defense-in-depth broken. Fix: `REVOKE UPDATE, DELETE ON audit.events FROM teivaka_app` (Cluster 3). |
| `tenant.inputs` rows | **1** | H1 refined: seed never ran on prod → prod fine; 074 break is greenfield/DR-rebuild-only. pg_restore DR unaffected. |
| `production_cycles.layer` NULL | **1 of 3** | H5 confirmed, small (only 3 cycles platform-wide) |
| tenants | **22** | "3 real / 67 phantom" memory is STALE — needs real-vs-test triage |
| multi-genesis chains | **0 rows** | B69 resolved: chain is per-tenant, one genesis each, clean |
| tenant tables w/o tenant_id index | **23** (alerts, income_log, labor_attendance, orders, decision_signal_snapshots, …) | NEW 🟡 scale finding — seq-scans under RLS at 10x-100x farms |
| infra | RAM 3.8Gi (1.5 avail), **swap 100% full (272 KiB free)**, disk **80%**, 8/8 containers healthy | NEW 🟡 — memory pressure at pilot size; disk climbing |

**Net changes to the ranked list:**
- **+ NEW 🔴 C5 — `audit.events` grants UPDATE/DELETE to runtime role** (triggers currently protect; REVOKE in Cluster 3).
- **C2 upgraded theoretical→CONFIRMED-LIVE** (2 heads on prod).
- **C3** policy half resolved (live=permissive); GUC-leak exposure confirmed real; + source-drift sub-finding (DR would deploy strict policy).
- **H1** downgraded for prod (1 input row; greenfield-only break); pg_restore DR safe.
- **B69** resolved clean.
- **+ NEW 🟡 — 23 tenant tables missing tenant_id index** (scale); **NEW 🟡 — swap exhausted / disk 80%** (infra).

## 6. STOP

Phase A complete. Nothing changed. Awaiting Boss: **which cluster, and "go."** Recommended first move:
**Cluster 1** (stop the Anthropic credit bleed) — trivial, reversible, and it's spending money every week.
