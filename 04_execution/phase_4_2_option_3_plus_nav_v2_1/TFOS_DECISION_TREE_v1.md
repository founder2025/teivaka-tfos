# TFOS DECISION TREE v1.0
## Pre-Answered Scenarios for Routine Drift-Recovery & Execution Decisions

**Authority:** Boss (Cody) — supersedes all inline Claude Code prompts where scenario matches.
**Scope:** Phase 4.2 Option 3 + Nav v2.1 (8-day single-thread) + future Phase 4.3 / 5 / 5.5 / 6 / 6.5 / 9.
**Purpose:** Eliminate round-trips. Claude Code consults this file when a blocker matches a listed scenario, applies the prescribed default, proceeds, and reports the decision taken. Boss only intervenes on NOVEL drift not covered here.
**Version:** 1.0 | **Drafted:** 2026-04-25 | **Last Updated:** 2026-04-25

---

## HOW TO USE THIS TREE

1. Claude Code hits a blocker.
2. Scan scenarios below for a match.
3. If match found → apply DEFAULT decision → proceed → report decision + rationale in final commit message and day-close report.
4. If NO match found → stop, report to Boss, await A/B/C-style instruction.
5. After resolution of NOVEL drift → this file gets an appended scenario so it never re-blocks.

**Binding:** Boss's in-session override wins over this file. This file wins over Claude Code's judgment.

---

## SCENARIO INDEX

**Migration & Schema**
- S-01: Alembic revision slot collision (same number, different content)
- S-02: Pack migration targets table that doesn't exist on server (split/renamed)
- S-03: Pack migration targets column name that differs from live schema
- S-04: Untracked migration file on server (not in git)
- S-05: Seed migration with non-reversible downgrade
- S-06: Row count differs from pack prediction (off by <15%)
- S-07: Row count differs from pack prediction (off by ≥15%)
- S-08: Alembic head diverged between dev pack and server
- S-09: TimescaleDB hypertable conversion conflict
- S-10: New column on table with RLS — policy rewrite needed

**Code & API**
- S-11: API envelope drift — router returns bare array not `{status,data,meta}`
- S-12: Sacred file (Part 23 item 28) needs edit to complete task
- S-13: Schema Reality Drift List (Part 4) needs new entry
- S-14: Endpoint missing mode-gating middleware
- S-15: Frontend field name conflicts with DB column rename (Universal Naming v2)

**Infrastructure & Deploy**
- S-16: Docker rebuild vs restart ambiguity
- S-17: Docker compose run from wrong directory
- S-18: Caddyfile edit needed mid-day
- S-19: Git remote push fails (no remote configured)
- S-20: Migration applied but container not rebuilt

**Naming, Content, UX**
- S-21: Universal Naming v2 term missing from rename table (new farmer-facing noun)
- S-22: Farmer_label NULL fallback display logic
- S-23: section_term not yet set by farmer (onboarding incomplete)
- S-24: Livestock vs hive routing (production_id prefix lookup)
- S-25: Icon choice — no lucide-react match for concept

---

## SCENARIOS — DETAILED

### S-01: Alembic revision slot collision

**Trigger:** Pack migration declares `revision = 'NNN_foo'` with `down_revision = 'M'`, but a file already exists on server at `/opt/teivaka/11_application_code/alembic/versions/NNN_bar.py` with the same revision number.

**Default decision:** **Option B — preserve the server file, renumber the pack.**
- Rename pack migration to `NNN+1_foo.py`.
- Update `revision = 'NNN+1_foo'` and `down_revision = 'NNN_bar'` (chain after the existing file).
- Add the server file to the git commit (ends untracked drift).
- Report which files were renumbered in day-close report.

**Rationale:** Server state is ground truth. Assume server file is canonical work that wasn't tracked. Never delete a server migration without Boss approval.

**Escalate to Boss only if:** server file's downgrade raises RuntimeError AND its content conflicts with pack semantics.

---

### S-02: Pack migration targets table that doesn't exist on server (split/renamed)

**Trigger:** Pack migration says `ALTER TABLE tenant.foo ADD COLUMN ...` but `\dt tenant.foo` returns nothing. Live schema has `tenant.foo_a` + `tenant.foo_b`.

**Default decision:** **Option A — extend migration to cover both target tables.**
- Add ALTER TABLE for each actual table.
- Add corresponding indexes/constraints for each.
- Mirror in downgrade() in reverse order.
- Update the Schema Reality Drift List (Part 4) in a separate follow-up commit — add the split to the drift catalog.
- Flag in day-close report: "Extended scope: {tables}".

**Rationale:** Schema drift is usually pack-author oversight. The live schema is ground truth. Don't drop features because of a naming guess.

**Escalate to Boss only if:** more than 3 tables involved OR the column semantics differ per-table (e.g. one table needs a different data type).

---

### S-03: Pack migration targets column name that differs from live schema

**Trigger:** Pack says `UPDATE tenant.foo SET status = ...` but live schema has `cycle_status` (per Schema Reality Drift List).

**Default decision:** **Correct the column name in the migration, proceed.**
- Reference Master Build Instruction v4 Part 4 Schema Reality Drift List.
- Use the live column name.
- Flag in day-close report if the drift isn't already in Part 4 — add it.

**Rationale:** Drift list wins. Never introduce the wrong name "because the pack said so."

**Escalate to Boss only if:** the column doesn't exist at all under any name (not a rename — a missing column).

---

### S-04: Untracked migration file on server (not in git)

**Trigger:** `ls /opt/teivaka/11_application_code/alembic/versions/` shows files not in `git ls-files`.

**Default decision:** **Inspect → validate → commit with today's work.**
- `cat` the file. Check: does it declare a valid revision chain? Does the DDL match current DB state?
- If revision+DDL look legitimate (seeds, column adds, index creates): `git add` and include in today's commit.
- If file looks corrupted or experimental: move to `/opt/teivaka/_archive/alembic_orphans/` and flag in day-close report.
- Update Alembic chain memory (`reference_alembic_chain.md`) after resolution.

**Rationale:** Untracked migrations are technical debt, not disaster. Commit them when found.

**Escalate to Boss only if:** file's revision number breaks the chain and fixing it requires destructive DB operations.

---

### S-05: Seed migration with non-reversible downgrade

**Trigger:** Migration's `downgrade()` contains `raise RuntimeError(...)` or similar — violates CLAUDE.md rule 12.

**Default decision:** **Apply the migration, file a follow-up to fix downgrade.**
- Do NOT block the chain to fix downgrade retroactively.
- Create a follow-up task: "Fix NNN downgrade: DELETE rows by production_id list."
- Include follow-up in day-close report under "Known Follow-ups."

**Rationale:** Irreversible downgrades are a risk, not a blocker. Production never downgrades anyway. Fix when convenient.

**Escalate to Boss only if:** the migration is Phase-6 financial or audit-related (downgrade matters more for compliance data).

---

### S-06: Row count differs from pack prediction (off by <15%)

**Trigger:** Pack predicted 89 rows, live DB shows 94 rows after seed applied.

**Default decision:** **Trust the data. Report both numbers. Proceed.**
- Log in day-close report: "Expected N, got M — delta attributed to {likely cause}."
- Update memory if the cause is structural (e.g. canonical catalog changed since pack was written).
- No corrective action.

**Rationale:** <15% delta is usually documentation lag. Data is truth.

---

### S-07: Row count differs from pack prediction (off by ≥15%)

**Trigger:** Pack predicted 100, live DB shows 50. Or predicted 50, got 200.

**Default decision:** **Stop. Report to Boss with diff query output.**
- Run: `SELECT production_id FROM shared.productions ORDER BY production_id` and compare to pack's expected list.
- Do NOT proceed with downstream migrations.
- Report the row-count anomaly + the diff.

**Rationale:** Large deltas suggest either corrupted seed, stale pack, or missing category — all need human judgment.

---

### S-08: Alembic head diverged between dev pack and server

**Trigger:** Pack assumes head is `NNN`, server head is `MMM` (different revision).

**Default decision:** **Trust server head. Renumber pack migrations to chain after server head.**
- `docker exec -t teivaka_db psql -U teivaka -d teivaka_db -c "SELECT version_num FROM tenant.alembic_version;"`
- Update pack migration's `down_revision` to match live head.
- Renumber subsequent pack migrations accordingly.
- Report adjustment in day-close.

**Rationale:** Server head is ground truth. Never try to force server backward.

---

### S-09: TimescaleDB hypertable conversion conflict

**Trigger:** Migration tries `SELECT create_hypertable(...)` on a table that already has indexes, constraints, or RLS policies.

**Default decision:** **Drop dependents, convert, recreate.**
- Drop non-primary indexes before `create_hypertable`.
- Drop FK constraints pointing at the table (flag for restoration).
- Run `create_hypertable`.
- Recreate indexes and FKs.
- Test RLS still applies post-conversion (TimescaleDB + RLS historically tricky — verify with `SET app.tenant_id` query).

**Rationale:** TimescaleDB docs require clean conversion. Re-applying auxiliary objects after is routine.

**Escalate to Boss only if:** RLS policies fail to re-apply cleanly post-conversion.

---

### S-10: New column on table with RLS — policy rewrite needed

**Trigger:** Adding column, existing RLS policy references columns by name or type changes affect WHERE clauses.

**Default decision:** **Column add first. Policy review after. No policy rewrite unless WHERE clause directly references the column.**
- Adding a new column does NOT usually invalidate existing `USING (tenant_id = current_setting(...)::uuid)` policies.
- Only rewrite policy if new column is used in cross-tenant access logic (rare).

**Rationale:** RLS policies target tenant_id, not arbitrary columns. Avoid unnecessary policy churn.

---

### S-11: API envelope drift — router returns bare array not `{status,data,meta}`

**Trigger:** Claude Code is modifying or reading an endpoint that returns a bare JSON array (Community, legacy farm endpoints).

**Default decision:** **Do NOT retrofit envelope mid-feature. Use defensive parser on frontend.**
- Frontend: `const items = body.data ?? body;` (already the pattern in live frontend).
- Do NOT modify the router's response shape unless the current task explicitly targets envelope retrofit.
- Flag in day-close report: "Envelope drift confirmed on {endpoint}. Queue for Phase 4b audit."

**Rationale:** Per Master Build Instruction v4 Part 14 — envelope retrofit is a Phase 4b audit task, not a blocker. 3 of 44 routers compliant. Don't expand scope.

---

### S-12: Sacred file (Part 23 item 28) needs edit to complete task

**Trigger:** Task requires change to Landing.jsx, Login.jsx, Register.jsx, BottomNav.jsx, App.jsx (beyond additive), TIS.jsx, FarmerShell.jsx, Caddyfile.production, tis-bridge server.js, Alembic 001-017, etc.

**Default decision:** **Stop. Route additive. Report to Boss.**
- If the change can be additive (new route in App.jsx, new link on landing, new field in register form): make the additive change, flag "additive edit to sacred file".
- If change requires removing/reshaping existing sacred structure: STOP. Report to Boss with exact proposed diff. Await explicit instruction.
- Never commit sacred-file reshape without named approval.

**Rationale:** These files run production. Breaking them breaks everything. Part 23 is law.

---

### S-13: Schema Reality Drift List (Part 4) needs new entry

**Trigger:** Discovered a column/table name mismatch between Master Build Instruction v4 spec and live DB that isn't yet in Part 4.

**Default decision:** **Append to drift list. Commit in same PR. Flag in day-close.**
- Edit `TFOS_Master_Build_Instruction_v4.md` Part 4 — add row to Schema Reality Drift List table.
- Update memory `reference_canonical_architecture.md` if the drift is structural.
- Do NOT attempt to rename live DB to match spec — spec follows reality.

**Rationale:** Drift list is the living catalog. Growing it prevents future drift-recovery cycles.

---

### S-14: Endpoint missing mode-gating middleware

**Trigger:** Adding a new endpoint; mode gating (`@requires_mode("GROWTH")`) per Part 14 should apply but isn't declared.

**Default decision:** **Add the decorator. Default to most-restrictive mode that still lets the current target user reach it.**
- Solo farmers → only task engine + voice + photo endpoints.
- Growth farmers → add buyer, labor, cash, cycle endpoints.
- Commercial → everything.
- When in doubt: `@requires_mode("GROWTH")` (Solo-safe default locks unneeded endpoints).

**Rationale:** Missing mode gate = Phase 4.3 hole. Plug at write time.

---

### S-15: Frontend field name conflicts with DB column rename (Universal Naming v2)

**Trigger:** Universal Naming v2 renames a farmer-facing term ("Patch" → "Block"), but the DB column name stays (e.g. `tenant.production_units.patch_count` stays as-is, but UI shows "Block count").

**Default decision:** **Display layer only — DB columns unchanged, frontend maps DB → farmer term at render.**
- Add a translation map in `frontend/src/constants/farmer_terms.js` (or similar) keyed by tenant's `section_term`.
- Never rename a DB column just because farmer label changed.
- JSON API contracts can be renamed (e.g. `patches` → `blocks` in payload) if not breaking production — otherwise dual-emit.

**Rationale:** DB is stable contract. Farmer-facing language is fluid. Keep them decoupled.

---

### S-16: Docker rebuild vs restart ambiguity

**Trigger:** Code change made. Need to decide: `docker compose restart api` OR `docker compose up -d --build api`?

**Default decision:** **Code edits need `up -d --build`. Config-only changes (env vars in compose.yml, no code touched) can use `restart`.**
- If ANY file under `/opt/teivaka/11_application_code/` changed: `up -d --build api` (and `worker-ai` if Celery task code touched).
- If ONLY `.env` changed: `restart api worker-ai beat`.
- Per memory `feedback_docker_rebuild.md`: restart does NOT pick up code changes.

**Rationale:** Silent skipped rebuilds are a top-3 cause of "why isn't my change live?" time waste.

---

### S-17: Docker compose run from wrong directory

**Trigger:** `docker compose ...` returns "no configuration file provided: not found".

**Default decision:** **Either `cd /opt/teivaka/04_environment && docker compose ...` OR use `docker exec` directly.**
- For DB queries: `docker exec -t teivaka_db psql -U teivaka -d teivaka_db -c "..."` (avoids compose entirely).
- For API logs: `docker logs teivaka_api --tail 50`.
- Compose only needed when bringing services up/down.

**Rationale:** `docker compose` requires docker-compose.yml in CWD. Container-direct commands don't.

---

### S-18: Caddyfile edit needed mid-day

**Trigger:** New route needs proxy config or HTTPS path adjustment.

**Default decision:** **Sacred file — STOP. Report to Boss.**
- Caddyfile.production is Part 23 item 28 sacred.
- Propose exact diff. Wait for explicit approval.
- Test in staging Caddy config first if possible.

**Rationale:** A broken Caddy = teivaka.com down. No autonomous edits.

---

### S-19: Git remote push fails (no remote configured)

**Trigger:** `git push` returns "fatal: No configured push destination" or similar.

**Default decision:** **Commit locally. Flag in day-close report. Continue work.**
- Do NOT block execution on remote setup.
- Known issue per memory: private GitHub remote not yet configured.
- Report: "Local commit {hash}. Remote unconfigured — offsite backup gap persists."

**Rationale:** Remote setup is an operations task for Boss, not a blocker for code work.

---

### S-20: Migration applied but container not rebuilt

**Trigger:** Alembic migration chain advanced, new columns exist in DB, but API still 500s on reads that use new columns.

**Default decision:** **Rebuild API + worker-ai containers.**
- `cd /opt/teivaka/04_environment && docker compose up -d --build api worker-ai`
- Wait for health check: `curl -s https://teivaka.com/api/v1/health`
- Verify ORM model files reference new columns (check `/opt/teivaka/11_application_code/app/models/`).

**Rationale:** SQLAlchemy caches column metadata at app boot. New columns need app restart (with rebuild if model files changed).

---

### S-21: Universal Naming v2 term missing from rename table

**Trigger:** Writing UI copy for a concept not in the rename table (e.g. "Lot", "Row", "Paddock").

**Default decision:** **Default to Block-family if it's a land unit. Otherwise use most neutral English term. Flag for Boss review.**
- Land unit → Block (canonical) or tenant's chosen section_term.
- Time unit → Cycle.
- People unit → Worker (permanent) or Casual (day labor).
- Money unit → FJD {amount}.
- Animal unit → Animal or livestock-specific (goat, chicken, bee).

**Rationale:** Universal Naming v2 prioritizes low-literacy accessibility. When in doubt, pick the most concrete word.

---

### S-22: Farmer_label NULL fallback display logic

**Trigger:** Rendering a block/cycle/animal that has NULL farmer_label.

**Default decision:** **Show canonical ID with a tag indicating label is unset.**
- Example: `PU002 (no nickname)` for production_units.
- Example: `CYC-F001-PU002-2026-003 (label unset)` for cycles.
- Onboarding wizard prompts farmer to set labels on first render.
- Never crash or blank-render on NULL.

**Rationale:** Labels are farmer nicknames. System IDs are permanent. Both should always be showable.

---

### S-23: section_term not yet set by farmer (onboarding incomplete)

**Trigger:** Farmer account created but onboarding wizard Step 2 (section_term picker) not completed.

**Default decision:** **Use "Block" as system default until farmer picks.**
- `COALESCE(tenants.section_term, 'BLOCK')` in queries.
- UI copy: "My {section_term} list" renders as "My Block list" pre-onboarding.
- Nudge banner: "Complete setup — pick your section name" on first login.

**Rationale:** Block is Universal Naming v2 canonical default.

---

### S-24: Livestock vs hive routing (production_id prefix lookup)

**Trigger:** Onboarding wizard receives animal entry; needs to route to `tenant.livestock_register` or `tenant.hive_register`.

**Default decision:** **Inspect production_id prefix. LIV-* → livestock_register. HIV-* → hive_register. AQU-* → (Phase 10 — reject for now).**
- Route based on `production_id` field in payload.
- If production_id is missing: look up by `production_name` against `shared.productions` + route by category.
- If ambiguous: default to livestock_register + flag in day-close report.

**Rationale:** The split is real (Master Build Instruction v4 Part 4 + memory `project_phase_4_3_drift_catalog.md`). Routing must respect it.

---

### S-25: Icon choice — no lucide-react match for concept

**Trigger:** UI needs an icon but no obvious lucide-react candidate exists.

**Default decision:** **Pick the nearest lucide match. Never introduce a second icon library.**
- Animal → `PawPrint` or `Bird`.
- Bee/hive → `Hexagon` (closest to honeycomb).
- Kava → `Leaf`.
- Cassava/root → `Sprout`.
- Compliance block → `ShieldAlert`.
- Task → `CircleCheck` / `Circle` (done/undone).
- If absolutely nothing fits: use text label only, flag for Boss icon-set review.

**Rationale:** Part 23 item 19 — never introduce a second icon library. Approximation + text beats icon-library bloat.

---

## APPEND POLICY

After any NOVEL drift gets resolved in-session, add a new S-NN scenario here with:
- Trigger (pattern that identifies the drift)
- Default decision (prescribed action)
- Rationale (one-line why)
- Escalation condition (what makes it a Boss-intervention case)

**File grows monotonically. Never delete scenarios — supersede by appending a new entry referencing the superseded one.**

---

## SCENARIOS TO ADD IN FUTURE VERSIONS (v1.1+)

- TTS provider failure → cached audio fallback
- OCR confidence below threshold → voice confirmation prompt
- Whisper transcription low confidence → re-record prompt
- Offline queue replay conflict resolution
- Credit score computation stale >7 days
- Bank evidence PDF generation failure
- M-PAiSA webhook signature mismatch
- SSE connection drop during task stream
- Task expiry race (task completed while expiring)
- Rotation gate BLOCK but farmer insists (override path)

---

**END OF DECISION TREE v1.0**
