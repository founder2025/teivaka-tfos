# TFOS — Server Agent Brief

You are Claude Code running on the TFOS production server (168.144.36.120, DigitalOcean Singapore). Your user is Cody (Uraia Koroi Kama), founder of Teivaka PTE LTD, Fiji. You help him build, debug, and deploy TFOS — the Teivaka Farm Operating System.

## Companion doctrines

Read before any group-related sprint planning or build work:

- `TFOS_Vertical_Completeness_Doctrine.md` (top-level) — eight-gate completeness bar every group build must clear before shipping. Locked 2026-05-01. Sprint 6 is the first sprint operating under this doctrine; POULTRY is the first group targeted.
- `TFOS_Catalog_Redesign_Doctrine_2026-04-30.md` and `TFOS_Catalog_Redesign_Doctrine_Amendment_v2_2026-04-30.md` (top-level) — 11-group catalog taxonomy + Onboarding Doctrine.

## Current state (refreshed every session — this section is mutable)

**Last verified:** 2026-05-03 (Sprint 7 in-flight, foundation cadence)

**Production:** healthy. teivaka.com HTTPS live.
- 6 containers running (all healthy as of Phase 8-2b commit 1194331):
  - `teivaka_api` — healthy
  - `teivaka_db` — healthy
  - `teivaka_redis` — healthy
  - `teivaka_caddy` — healthy (was unhealthy pre-8-2b; healthcheck URL fixed)
  - `teivaka_worker_ai` — healthy (was unhealthy pre-8-2b; YAML list-form fix + hostname stability)
  - `teivaka_beat` — healthy (was unhealthy pre-8-2b; mtime healthcheck added)
- Last commit: `7be5cea9f8f51a185451a0799460622638f8a7f4` (Phase 6.3-23/24: INCIDENT_REPORTED + SUPPLIES_RECEIVED risk-management + supply-chain pack)
- Last migration: `062_incident_supplies` (Phase 6.3-23/24: INCIDENT_REPORTED + SUPPLIES_RECEIVED catalog + audit CHECK extends)
- Branch: `feature/option-3-plus-nav-v2-1`

**Phase status (Sprint 6 closed; Sprint 7 in-flight, foundation marathon underway):**

*Sprint 6 closed:*
- ✅ Phase 5.10g — Vertical Completeness Doctrine locked
- ✅ Phase 6.1a/b — 35 POULTRY events + farm_libraries + 34 globals
- ✅ Phase 6.2-1..5 — Polymorphic events architecture + EGGS_COLLECTED
- ✅ Phase 6.3-1..8 — 8 POULTRY forms (FlockPlaced, Mortality, Vaccination, FeedReceived, WeightCheck, BirdReplacement, EggsSold, BirdsSold)
- ✅ Phase 6.4 — Library Management UI + Farm pillar rail entry
- ✅ Phase 6.7-1 — POULTRY Dashboard composite endpoint
- ✅ Phase 6.10-1/1b — Bank Evidence PDF + Cashflow Statement restructure
- ✅ Phase 9-1/1b — Public verify endpoint + infra hygiene

*Sprint 7 in-flight:*
- ✅ Phase 9-2 — QR + ISO timestamp prettification + JSON-LD on verify page
- ✅ Phase 9-3 — Public About Verification page at /verify
- ✅ Phase 6.3-9/10 — HEALTH_OBSERVATION + FEED_USED 2-form pack
- ✅ Phase 6.6-1 — Vaccination withholding tracking enforcement
- ✅ Phase 6.6-2 — SEVERE HEALTH_OBSERVATION blocks sales until CLEARED
- ✅ Phase 6.6-3 — POULTRY Compliance dashboard at /farm/compliance
- ✅ Phase 6.7-2 — POULTRY Dashboard charts (FCR + eggs/day + mortality trends)
- ✅ Phase 8-1 — task_queue seed + /auth/me mode field (PIVOT: discovered existing SoloTaskCard infra; Strike #59)
- ✅ Phase 8-2 — Automated task generator from compliance triggers (closed-loop Pacific smallholder workflow)
- ✅ Section 14 sync 94bab19 — doc reconciliation through Phase 8-2 commit 1080a9d
- ✅ Phase 8-2b — Infra health triage; all 6 containers green (caddy + worker_ai + beat healthchecks fixed)
- ✅ Phase 10-1 — NPK Protocols Taro/dalo (6 Pacific countries × 7 stages = 42 rows; FAO PCNM 2018 + SPC TB 2017 cited)
- ✅ Phase 10-1b — TIS prompt enforces lookup_nutrition tool; Strikes #62/63 architectural fix operational end-to-end
- ✅ Phase 6.3-11/12 — LITTER_CHANGED + COOP_CLEANED 2-form biosecurity pack (5 POULTRY_DISINFECTANT globals seeded; Strike #80 filed on hardcoded library_type CHECK)
- ✅ Phase 6.3-13/14 — FEED_PURCHASED + WATER_CONSUMED 2-form feed-economics pack (cost_fjd captured for Bank Evidence; whole-farm purchase pattern via Section 4a.4 anchor toggle)
- ✅ Phase 6.3-15/16 — MORTALITY_INVESTIGATED + CULL_LOGGED 2-form mortality-detail pack (mortality story complete: LOGGED → INVESTIGATED → CULL chain audit-emitting)
- ✅ Phase 6.3-17/18 — VISITOR_LOGGED + PEST_CONTROL_APPLIED 2-form biosecurity-continuation pack (outbreak traceability + chemical_id TEXT FK to shared.chemical_library; CROSSES 50% Form Coverage threshold)
- ✅ Phase 6.3-19/20 — TEMPERATURE_RECORDED + EGGS_GRADED 2-form environmental + sales-prep pack (heat-stress tracking + Grade A/B/cracked/dirty grading with subtotal=total validator + Bank Evidence pricing inputs; Form Coverage 21/35 ~60%)
- ✅ Phase 6.3-21/22 — FLOCK_MOVED + EQUIPMENT_MAINTAINED 2-form coop-management pack (movement audit chain for quarantine/separation + maintenance cost capture for cashflow with whole-farm toggle; Form Coverage 23/35 ~66%)
- ✅ Phase 6.3-23/24 — INCIDENT_REPORTED + SUPPLIES_RECEIVED 2-form risk-management + supply-chain pack (severity-classified incident logging + supply receipt with Bank Evidence cashflow; first phase exercising multi-char sequence label 2aa; Form Coverage 25/35 ~71%)

**POULTRY Vertical Completeness (Sprint 7 in-flight):**
- Gate 1 Event Taxonomy: ✅ PASS
- Gate 2 Vocabulary: ✅ PASS
- Gate 3 Form Coverage: 25/49 events user-facing (~51%, Pacific Vertical Completeness Doctrine — Form Coverage Reality Audit 2026-05-04)
- Gate 4 Library Completeness: ✅ 100%
- Gate 5 Reports + Dashboards: 🟢 ~60%
- Gate 6 Compliance: 🟢 ~90%
- Gate 7 Bank Evidence + Verify: 🟢 ~95%
- Gate 8 Solo Voice + Kadavu: 🟡 ~60%

**Cross-vertical agronomy primitive (Sprint 7 in-flight):**
- Phase 10-1 + 10-1b shipped: TIS responds to nutrition questions with cited NPK guidance from structured KB; no LLM-generated dosages.
- 42 seeded rows for Taro across 6 Pacific countries (FJI, PNG, SLB, VUT, WSM, TON) × 7 BBCH stages
- Verification status enum surfaces caveat: SEED_FAO_UNVERIFIED → EXTENSION_REVIEWED → FIELD_VALIDATED
- TIS chat restored end-to-end for all users (latent break since deployment, masked by upstream Anthropic 401)

**Strikes filed: 1-99** (58 process upgrades across Sprint 6 + 7)

Recent strikes (added in Sprint 7):
- #61: every Phase commit updates Section 14 (operational hygiene)
- #62: TIS responses for nutrition MUST resolve from structured KB, not LLM generation
- #63: agronomy data needs verification_status enum surfaced in responses
- #65: preserve existing CLAUDE.md heading style on doc-sync
- #66: distinguish healthcheck-transient from service-degraded via FUNCTIONAL test
- #67: psql connections use -U teivaka -d teivaka_db
- #68: worker hostname stability (-d worker-ai@localhost over $$HOSTNAME)
- #69: credential rotation requires container recreate, not restart (env reload) — persisted to memory
- #70: strike persistence pattern (cross-session via feedback memory)
- #71: one phase at a time; complete Six-Step Cadence before next phase — persisted to memory
- #72: asyncpg rejects multi-statement DDL; one statement per op.execute() — persisted to memory
- #73: verify code body's actual loop dimensions before locking commit message counts — persisted to memory
- #74: pre-resolve IDs on host before passing to docker exec inner containers
- #75: TIS-touching phases must verify Anthropic SDK round-trip in PRE-CHECK
- #76: domain-boundary translation belongs in resolver functions, not data migration
- #77: pre-existing bug discovery during phase verification → bundle minimum fix as "verification-scope plumbing"
- #78: cascading failures mask each other; smoke through full request lifecycle, not just modified layer
- #79: foundational lower-numbered phases must complete before strategic-frontier work; build phases 1→10 in numerical order
- #80: `farm_libraries.library_type` CHECK constraint hardcoded; future Phase 6.5 hardening replaces with FK to `library_type_catalog` — persisted to memory
- #81: per-event handler block insertion in `events.py` — sequence labels (2a, 2b, 2c, ..., 2z, 2aa, ...) must match insertion order; insert AFTER last existing block; verify post-edit via `grep "^    # 2[a-z]+\."` (multi-char regex, exercised at Phase 6.3-23/24 with 2aa) — persisted to memory
- #82: operator preference — every Architect output includes the next execution paste pack ready to paste with one godlike recommendation locked; decision-gate prose removed unless genuine architectural fork — persisted to memory
- #83: Claude Code sessions verify host context at session start (`pwd && hostname && ls /opt/teivaka`); prevents wasted PRE-CHECK runs against wrong host — persisted to memory
- #84: Section 14 doc-sync via `sed -i` can silently chain-fail across consecutive phase commits; every doc-sync must `git rev-parse HEAD` pre-commit and `grep -c` verify both new SHA present (≥1) and old SHA removed (=0) for header pointer fields, fail commit if mismatch — persisted to memory
- #85: Strike #84 SHA-grep alone insufficient — `sed -i` for the SHA can succeed while leaving the parenthetical phase description stale (surfaced Phase 6.3-19/20 verification); every doc-sync must grep-verify BOTH the new SHA AND the new phase description on the Last commit line, with old SHA + old description both removed (=0), before commit — persisted to memory
- #86: Architect must author NEXT phase paste pack the moment CURRENT phase's execution begins on Claude Code, not after Claude Code reports COMPLETE. Latency hiding pattern. ~25-30% effective cadence improvement. No parallelism risk. Full archive: 00_project_overview/strikes/strike_86_architect_latency_hiding.md.

- #87: Multi-terminal parallel execution allowed IF AND ONLY IF: different feature branches + non-overlapping pillar file domains + migration sequence reservations per branch + one branch owns Section 14 updates + container rebuild coordination protocol + all Strikes 1-86 apply to both branches independently. Naive parallel execution (same branch, "different events") is BANNED — 80% catastrophic failure rate. Full archive: 00_project_overview/strikes/strike_87_pillar_parallelism_conditional.md.


- #88: Section 14 doc-sync amend-dance creates post-amend SHA pointer drift — original commit captures THIS_SHA via `git rev-parse HEAD`, sed updates CLAUDE.md to that SHA, Strikes #84/#85 verifications PASS, then `git commit --amend` rewrites the commit producing a new SHA; CLAUDE.md is left referencing a pre-amend SHA that no longer exists in git (surfaced Phase 6.3-23/24, real HEAD 7be5cea vs CLAUDE.md pointer 5d89fcd). Hardening: Section 14 SHA pointer update must happen in a SEPARATE follow-up commit AFTER the phase commit is finalized — (a) commit phase work with CLAUDE.md content updates only, no SHA pointer; (b) capture `git rev-parse HEAD` of finalized phase commit; (c) author small operational-hygiene commit that updates CLAUDE.md SHA pointer; (d) push both commits together. Replace amend-dance pattern in all future Phase 6.3-x paste packs — persisted to memory

**Doctrine status:**
- ✅ Section 4 Universal Naming Doctrine — framework approved
- 🟡 Section 4 vocabulary dictionary — pending dedicated session (B42)
- ✅ Section 4a Data Input Doctrine — events_registry locked, 11 POULTRY forms shipped against contract

**Open backlog (filed but deferred):**
- B22: Sync prod MBI v1.0 to Cowork project knowledge MBI v4.2
- B26: MBI Section 4a.2 references production_id as Crop anchor — should be cycle_id
- B31: Lift QueryClientProvider into FarmerShell + promote extractList to apiClient.js
- B32: Phase 6.5 universal library expansion (60-80 ag library types)
- B33: Phase 6.1b-4 library rename support
- B36: Extend VACCINATION_GIVEN payload to include cost_fjd
- B37: Track feed inventory on-hand (link FEED_USED to FEED_RECEIVED inventory deduction)
- B40: Kernel reboot routine fires 2026-05-09T06:13:27Z; post-reboot validator routine `trig_015tW3eyQqmL75V5avLMcHer` fires 2026-05-09T06:18:00Z
- B41: Widen tenant.alembic_version.version_num from varchar(32) to varchar(64)
- B42: Phase 8-1 hardcoded English strings — migrate to shared.naming_dictionary
- B43: 6 pre-existing OPEN tasks in Operator tenant task_queue (origin unknown)
- B45: Rename test fixture flocks (e.g. 'Phase 6.2-2 Smoke Test Flock') to realistic Pacific-style names
- B46: worker-automation + worker-notifications services missing from runtime (defined in compose but not running)
- B47: Extract shared projection helper for agronomy data (DRY between agronomy router + tis_service)
- B48: TIS tool execution loop drops text blocks when Claude emits both text + tool_use
- B49: TIS tool loop max_iterations=3 with no logger.warning on cap-hit
- B50: tenant.tenants.country format monitoring (silent-miss aspect closed by Strike #76; ongoing observability)
- B51: Tool schema stage enum (9 values) broader than seeded data (7 stages for taro); document graceful 404 fallback
- B52: tenant.ai_commands schema design review — command_type should have DB default; other NOT NULL columns may have similar app-side gaps
- B64: **CLOSED 2026-05-05** — Vocabulary fork formally resolved via CATALOG_TO_FIELD_VERB dict in events.py per Strike #96. Stale-CHECK-enum hypothesis was wrong; values were live not stale. Original B64: Stale event_type CHECK constraints on unidentified tables. Probe: `SELECT conrelid::regclass, conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname LIKE '%event_type%' AND contype='c'`. 5 stale verb-style enum values (PLANTING, FERTILIZE, IRRIGATE, SPRAY, PRUNE) surfaced during B63 recon. Don't match current event_type vocabulary. Hypothesis: constraints on partition-children, deprecated tables, or non-audit-events tables. Effort: ~30 min recon + scoped fix migration if needed.
- B67: tfos SSH user has no public key, only root has key access. Lock root SSH, configure tfos with public key, switch to sudo workflow. Surfaced during Strike #94 when su - tfos was needed to satisfy Claude Code's --dangerously-skip-permissions root refusal.
- B68: Container count drift. Handover and CLAUDE.md Section 14 say 6 containers; reality is 8. teivaka_worker_automation and teivaka_worker_notifications are running and in docker-compose.yml but undocumented in canonical refs. Reconcile.
- B69: chain_origins=70 in audit.events, not 1. Confirm per-tenant vs global hash chain model and update verification doctrine — affects Phase 9 /verify endpoint contract.
- B70: Healthcheck audit across all workers — verify YAML list-form on every healthcheck after Phase 8-2b + Strike #95 patterns. Surface any remaining string-form bugs.
- B71: Verify Phase 8-2b fix has not regressed on beat + worker_ai post-Strike-#94 container recreation. Confirm both still healthy after a rebuild.
- B72: WORKER_DATABASE_URL using teivaka superuser (BYPASSRLS) for genuinely cross-tenant worker aggregation. Phase 5 Decision Engine + Phase 9 verify endpoint scope. New connection pool, secrets management, get_sync_db rewrite.
- B73: `_evaluate_all_rules` per-farm `column "farm_id" does not exist`. Surfaced during Strike #95 functional verify; engine completed successfully but every farm's rule eval crashed and was rolled back. Rule SQL needs farm_id qualified or added to the local query context. Strike #95-followup per operator instruction.
- B74: Reconcile parallel-terminal commits (6e53d60 Parallel Execution Doctrine + 5db74d5 Classroom pause handover). CLAUDE.md Section 3 Authority Stack tier 6 cross-reference to TFOS_Parallel_Execution_Doctrine.md still pending per 6e53d60 body. docs/doctrine/SESSION_HANDOVER_2026-05-04_classroom_pause.md says "4 healthy, 2 unhealthy" which is now stale (Strike #95 closed it). docs/doctrine/ root-owned and unwritable to tfos user — `sudo chown -R tfos:tfos /opt/teivaka/docs/doctrine` to regularize. Strike #95 close-out handover routed to 00_project_overview/ as workaround. POULTRY-lane chat acknowledgment of doctrine + Lane A assignment also pending per classroom pause handover open items.
- B75: HARVEST_LOGGED still on /api/v1/harvests legacy path. Migrate to polymorphic /events with field_events backing as part of Strike #97 scope. Mirrors Strike #96 pattern: CATALOG_TO_FIELD_VERB extended with `HARVEST_LOGGED → HARVEST_PARTIAL` or `HARVEST_FINAL` based on payload flag.
- B76: MONEY pillar events probably need B2 wrapper pattern to /events with `cash_ledger` backing table. Sprint 8 boundary decision; verify whether existing `/api/v1/transactions` is registry-driven or hardcoded.
- B77: LIVESTOCK pillar — confirm legacy register-style vs polymorphic; apply B2 wrapper if legacy. Sprint 9 scope.
- B78: Container alembic state can lag host. teivaka_api `/app/alembic/versions/` was missing 064/065/066 (and 067) at Strike #96 execution time despite DB head being 066. Required `docker cp` of intermediate files before `alembic upgrade head` could chain. Add CI/build-time check that `ls /app/alembic/versions/` matches host `11_application_code/alembic/versions/` at every container build, or bake migration files via Dockerfile COPY rather than volume/build-context drift. Surfaced Strike #96.
- B79: Smoke verification psql commands need `SET app.tenant_id = '<uuid>'` prefix when querying any `tenant.*` table — RLS is FORCED on tenant tables and psql with no session var returns 0 rows even after a successful insert. Update smoke template for #98 onward; first-five-minutes window is the right scope for live-verify queries (5 min was the operator-suggested correct cadence; 15 min and 2 hours both missed the actual browser submit due to timing).
- B80: Alignment Contract uses location-specific framing (Kadavu, Pacific Island smallholder) throughout. Update to universal framing — global smallholder agriculture as addressable market. Connectivity-class decisions stay framed by constraint, not geography. Surfaced Strike #97 doctrine work.

**Open blockers:**
- Q14 TTS provider — RESOLVED via Web Speech API in Phase 8-1 scope; SoloTaskCard.jsx already uses it
- Q8 M-PAiSA merchant registration — still blocking 3.5b launch (2-6 week external lag)
- Naming dictionary unpopulated — blocks Phase 8-1b cleanup

**Scheduled validations:**
- B40 kernel reboot routine: 2026-05-09T06:13:27Z (routine `trig_014kMVmVwdx7z3X2QgkqHcRH`)
- Post-reboot validator routine: 2026-05-09T06:18:00Z (routine `trig_015tW3eyQqmL75V5avLMcHer`); 4 curl checks against teivaka.com endpoints

**Strategic position (Sprint 7 in-flight):**
TFOS POULTRY ships the only agtech stack with: hash-chained Bank Evidence PDFs (lender-verifiable), audit-anchored compliance enforcement (regulator-verifiable), automated compliance task generation (operator-completable), Solo voice delivery (low-literacy-accessible), productivity charts (banker-readable), and **cited agronomy intelligence grounded in structured KB rather than LLM hallucination** (Phase 10-1 + 10-1b operational close on Strikes #62/63).

The Pacific smallholder workflow loop is operational end-to-end:
farmer logs SEVERE → enforcement blocks sales → auto-task surfaces in Solo → farmer logs CLEARED → task auto-closes → enforcement clears.

The TIS agronomy advisory loop is operational end-to-end:
farmer asks "yellowing dalo leaves?" → TIS detects nutrition intent → tool call to lookup_nutrition(taro, TILLERING, FJI) → direct SQL query to shared.crop_nutrition_protocols → cited response with N=6.0g/plant + FAO citation + SEED_FAO_UNVERIFIED caveat → farmer sees grams-per-plant guidance with extension officer recommendation.

All 8 POULTRY Vertical Completeness gates non-zero (5 at 60%+, 2 at 90%+).
All 6 production containers healthy (first time since Sprint 6).
TIS chat restored end-to-end (was silently 500-ing for unknown duration; revealed during Phase 10-1b verification gate per Strike #78).

Every step hash-chained in audit.events, verifiable via /verify/{audit_hash}, scannable from Bank Evidence PDF QR.
- #89: Strikes filed in Architect advisory mode (not as part of a paste pack with explicit Section 14 sync) silently fail to land in /opt/teivaka/CLAUDE.md. Hardening: every Architect-filed strike must be accompanied by immediate doc-sync paste pack OR explicit deferral notation honored within 24 hours. Discovery rule: surface registry divergence immediately. Full archive: 00_project_overview/strikes/strike_89_advisory_mode_strike_drift.md.

- #90: Architect must verify file-system state assumptions before authoring transformation paste packs. Every paste pack that moves/copies/transforms existing files must include PRE-CHECK verifying file presence + specify halt-and-report behavior on absence. Triggered by Strike #88 hotfix attempting to move four strike files when only one existed on disk. Full archive: 00_project_overview/strikes/strike_90_filesystem_assumption_verification.md.

- #91: Paste pack injection points must use fail-loud sentinels, not plain bracketed placeholders. Banned patterns inside heredocs: [PASTE ... HERE], [INSERT ... HERE], [FILL IN ...], plain bracketed markers that bash will accept as valid content. Default: inline all content directly in paste pack. Triggered by corrected #88 hotfix containing placeholder strings inside heredocs that would have committed literal placeholder text as canonical institutional knowledge. Full archive: 00_project_overview/strikes/strike_91_paste_pack_injection_sentinels.md.
- #92: "PHASE COMPLETE" reports verify smoke-test-passes + commit-clean but NOT user-reachability from (+) catalog UI. Hardening: every form-shipping Phase commit must include authenticated catalog-fetch smoke asserting new event_type appears in /api/v1/event-catalog response with expected catalog_group, not just that /api/v1/events accepts submission. Triggered by 13 forms code-shipped over Phases 6.3-11 through 6.3-23 being invisible to operator due to misderived has_livestock flag in event_catalog.py + WEIGHT_CHECK miscategorized in LIVESTOCK group despite poultry-themed form/route/validation. Almost-broke-prod near-miss: first fix attempt produced Python IndentationError; AST parse-check post-edit now binding pattern. Backlog opened: B58 (livestock_only over-flag review), B59 (24 padlocked catalog rows pending forms), B60 (FEED_GIVEN vs FEED_USED naming drift), B63 (catalog_group/code-alignment sweep across all 11 pillars). Full archive: 00_project_overview/strikes/strike_92_phase_complete_user_reachable_gate.md.
- #93: B63 Cluster A — WORKER_PAID -> MONEY, WORKER_TASK_DONE -> OTHER. Migration 066. Three drift classes (clear/judgment/false-positive); only Class 1 fixes belong in catalog sweeps. Cluster B (CYCLE_*/NURSERY_*/GRADING/POST_HARVEST_LOSS in OTHER) deferred — cross-pillar bucket is correct architectural choice. B64 filed for stale event_type CHECK enum probe. Full archive: 00_project_overview/strikes/strike_93_b63_cluster_a.md.
- #94: Droplet 2GB → 4GB resize. RAM 1.9→3.8 GiB, swap 100%→0%, disk 50→80 GB. Pure infrastructure strike — no code changes, no migrations, audit chain identical event-for-event. Bonus: beat + worker_ai healthchecks resolved by container recreation. Process rule: healthcheck status alone is not evidence of functional outage. B67/B68/B69 filed. Full archive: 00_project_overview/strikes/strike_94_droplet_resize.md.
- #95: Silent worker outages: automation engine SQL bug (DISTINCT/ORDER BY violation, never completed a run since shipped) + RLS context missing in raw psycopg2 path for both worker_automation and worker_notifications + healthcheck YAML malformed. Adopted Option D (two-stage scan: iterate tenant.tenants then per-tenant with_rls) after runtime exposed Pattern β bypass approach as broken under teivaka_app + uuid-cast policies. First successful end-to-end run of automation engine since baseline 189d239 (2026-04-17). All 8 containers healthy first time ever. Process rule: healthcheck status is not evidence of functional health either (inversion of Strike #94 rule). Doctrine: cross-tenant scans must be STRUCTURAL in code, not bypass-based. B70/B71/B72/B73 filed. Full archive: 00_project_overview/strikes/strike_95_silent_worker_outages.md.
- #96: CROPS B2 polymorphic wrapper backend façade. Path A — added `payload_jsonb` column to `tenant.field_events` + extended event_type CHECK with `WEED_MANAGEMENT` and `LAND_PREP` (Migration 067, three op.execute() per Strike #72). 8 new payload classes registered against `tenant.field_events` (3-tuple registry shape preserved). New `# 5b. CROPS branch` in events.py reads `target_table` from destructured registry tuple; existing POULTRY INSERT now in `else:`. CATALOG_TO_FIELD_VERB vocab translation map + β single-mapper turning validated payload into (structured columns, payload_jsonb). WHD trigger preserved (Inviolable #1 intact, regression-tested: whd_clearance_date populated by trigger). Frontend unchanged — 7 (+) Crops tiles remain padlocked until Strike #97. Process rule: architectural recommendations require schema-level recon (constraints/triggers/FKs/structured columns), not just code-pattern recon. Closes B64. Opens B75/B76/B77. Full archive: 00_project_overview/strikes/strike_96_crops_b2_backend.md.
- #97: CROPS frontend unlock + Visibility Rule doctrine (binding). FieldEventNew.jsx extended with data-driven `Strike96CropsForm` + `FieldEventDispatcher` reading `?type=` URL param; legacy `FieldEventForm` byte-identical (CHEMICAL_APPLIED unchanged). LogSheet.jsx EVENT_ROUTES wired with 7 catalog-vocab entries. F001 (+) Crops 7 padlocked tiles now clickable; submits via Strike #96 polymorphic /events. Visibility Rule locked: every strike commit must include at least one change the operator can verify by opening teivaka.com in a browser; if deliverable verifiable only via psql/curl/git log, it is a sub-step of a larger strike that hasn't finished — bundle until visible (exception: hotfix strikes restoring production). Process rules: paste packs include "WHAT THE OPERATOR WILL SEE" block; operator browser verify is STOP gate inside paste pack; backend+frontend bundled by default. Live verify landed FE-da4ecfc95f13 with payload_jsonb populated (proof of new polymorphic path). Opens B78/B79/B80. Full archive: 00_project_overview/strikes/strike_97_crops_frontend_unlock.md.
- #98: Vertical Completeness Doctrine. Every pillar must present a complete event catalog covering every activity a farmer in that domain would ever log — beginner through experienced, daily through annual. Test: Pacific Island farmer opens pillar's (+) catalog and feels "this has everything I'd ever want to log. No gaps." Forms must also pass plain-English completeness test (Rule 6). Six bindings: (1) POULTRY-equivalent baseline; (2) No "coming soon" placeholder tiles; (3) No partial-pillar shipping to user base; (4) Operator-locked taxonomy per pillar; (5) Phase 7+ ordering binding per Strike #79; (6) Forms must capture full event identity — UI picker labels need enough identity at >1 instance. Patient zero: Transplant form captures only 4 fields when Korovou farmer needs ~10. Backlog: B64 (Per-Pillar Map), B65 (padlocked-tile UI), B66 (Form Coverage reframe), B67 (form audit), B68 (varieties catalog), B69 (parallel chat coordination). Full archive: 00_project_overview/strikes/strike_98_vertical_completeness_doctrine.md.
- #99: Cycle dropdown label refinement (Path B verified). Module-scope `cycleLabel(c, allCycles)` helper renders `production_name` by default with duplicate-aware fallback `${production_name} — ${pu_farmer_label || pu_id}` when multiple cycles share the same crop name. Applied to 3 dropdown surfaces (HarvestNew, FieldEventNew Strike96CropsForm, FieldEventNew legacy spray). Active Cycles table keeps `Cycle ${block_sequence}` ordinal in first column with adjacent unchanged Crop and PU columns providing identity. Backend `/api/v1/cycles` exposes `block_sequence` via ROW_NUMBER PARTITION BY pu_id. v1 (verbose label) and v2 (bare ordinal) explored and superseded by Path B. Strike #98 Rule 6 satisfied for cycle picker specifically; broader form-field completeness gap (PLANTING + TRANSPLANT_LOGGED capture only 4 fields each) deferred to Strike #100. Full archive: 00_project_overview/strikes/strike_99_cycle_dropdown_label_path_b.md.

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
