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
