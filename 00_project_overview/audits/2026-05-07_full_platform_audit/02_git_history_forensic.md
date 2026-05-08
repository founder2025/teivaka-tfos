# Phase 2 — Git History Forensic

**Audit date:** 2026-05-07
**Recon executed:** 2026-05-08 05:32:46 UTC (HEAD `aa68470`)
**Branch:** feature/option-3-plus-nav-v2-1
**Scope:** branch graph, commit history, strike chain, churn, integrity. Read-only.
**Recon script:** `/tmp/phase2_recon.sh` (23 sections)

---

## Executive summary

**159 commits**, single author (with minor identity drift), **1 merge** (MVP week 1 only — rest is linear), **0 tags**, **20 dangling blobs + 1 dangling tree** in object DB, **3 branches** (active feature branch + stale main + stale MVP-week-1). The strike chain is **partially recoverable from commits**: strikes #62 + #84 + #88 + #92 + #93 + #94 + #95 + #96 + #97 + #98 + #99 + #100 + #101 + #103 + #104 + #105 + #110-116 ship as commits (23 distinct numbers); strikes #1-83 are doctrine-only (pre-Sprint-7 era, archived in CLAUDE.md); strikes **#102 BACKLOG** + **#106 / #107 / #108 / #109** are *gaps* — #102 has a backlog archive file (filed-deferred); #106-109 have neither commits nor archives — they are unaccounted-for.

The repo is **disciplined-and-aging**: linear history, no force-pushes visible, single author, no stash debt, but no pruning, no tags, no garbage collection. Commit cadence ranged 1-22/day across 60 days; 156 commits authored as `Cody Kama <founder@teivaka.com>`, 3 as `Cody <founder@teivaka.com>` — same email, identity drift to flag for audit-chain provenance.

**Branch tracking is broken on the active branch** — `branch.feature/option-3-plus-nav-v2-1.merge` is not configured locally, so `git status` cannot report ahead/behind state. Local HEAD `aa68470` (Phase 1 audit commit) is 1 ahead of origin's `40dfffb` despite `git status` showing no divergence. Strike #91 finding.

---

## 2.0 Summary

```
HEAD:           aa68470bf2ca19cf0892fc25b49c3b3484f3bde3
Branch:         feature/option-3-plus-nav-v2-1
Total commits:  159
Tracked files:  456
Remote:         git@github.com:founder2025/teivaka-tfos.git (fetch + push)
```

Commit count (159) places the repo in the small-to-mid range. 456 tracked files matches Phase 1 finding (455 was the count at HEAD `f42626b`; +1 file from the Phase 1 commit).

---

## 2.1 / 2.2 Branches

### Local

| Branch | HEAD | Tracking | State |
|--------|------|----------|-------|
| `feature/option-3-plus-nav-v2-1` (active) | `aa68470` | **none configured** | 1 commit ahead of `origin/feature/option-3-plus-nav-v2-1` (`40dfffb`) — uncommunicated |
| `main` | `575fef2` | `origin/main` | 17 days stale (last commit 2026-04-21) |
| `feature/mvp-week1-farm-shell` | `7d62755` | `origin/feature/mvp-week1-farm-shell` | 21 days stale (2026-04-17) |

### Remote (`origin/`)

| Branch | HEAD | Subject |
|--------|------|---------|
| `origin/feature/option-3-plus-nav-v2-1` | `40dfffb` | Doc-sync post-Strikes-#110-116 |
| `origin/feature/mvp-week1-farm-shell` | `7d62755` | fix(farms): rewrite router against deployed tenant.farms schema |
| `origin/main` | `575fef2` | Phase 4 production_cycles v2: audit + uniqueness + entity_type unification |

### Strike #91 catch — branch tracking

`git config --local --list` (2.22) shows tracking config for `main` and `feature/mvp-week1-farm-shell` only:

```
branch.main.remote=origin
branch.main.merge=refs/heads/main
branch.feature/mvp-week1-farm-shell.remote=origin
branch.feature/mvp-week1-farm-shell.merge=refs/heads/feature/mvp-week1-farm-shell
```

There is **no `branch.feature/option-3-plus-nav-v2-1.merge`**. The branch was pushed (origin has it) but never properly tracked locally. Effects:
- `git status` reports `## feature/option-3-plus-nav-v2-1` with no `[ahead 1]` annotation despite real divergence.
- `git pull` / `git push` without explicit refspec on this branch will fail-loud or do nothing — operator habit of explicit `git push origin feature/option-3-plus-nav-v2-1` masks the gap.
- `@{u}` (`git log @{u}..HEAD`) resolves to nothing (silently swallowed by `2>/dev/null` in recon).

**Fix when ready:** `git branch --set-upstream-to=origin/feature/option-3-plus-nav-v2-1`. Single command.

### Cross-branch divergence assessment

Active feature branch is **18+ days ahead of `main`**. `main` is at the production_cycles v2 commit (`575fef2`, 2026-04-21). Every Sprint 6 + Sprint 7 commit, every strike #84-#116, every doctrine document (TIS Doctrine, Parallel Execution, Vertical Completeness), and the entire Decision Engine restoration cluster live only on the feature branch. **`main` is far behind production-deployed reality.**

This is a **deployment-vs-trunk drift** finding: the branch named "feature/" is in fact the live trunk; `main` is a frozen historical snapshot. → Phase 6 (deployment) cross-check.

---

## 2.3 Branch ages

```
2026-05-08  aa68470  feature/option-3-plus-nav-v2-1                   ← today, active
2026-05-08  40dfffb  origin/feature/option-3-plus-nav-v2-1            ← today (push of doc-sync)
2026-04-21  575fef2  origin/main                                       ← 17 days stale
2026-04-21  575fef2  main                                              ← 17 days stale
2026-04-17  7d62755  origin/feature/mvp-week1-farm-shell               ← 21 days stale
2026-04-17  7d62755  feature/mvp-week1-farm-shell                      ← 21 days stale
```

**`main` and `feature/mvp-week1-farm-shell` are abandoned** for the foreseeable future. Neither was tagged before being abandoned, so distinguishing "deliberately frozen" from "left behind" requires reading commit messages. → Phase 10 cleanup recommendation: tag both ("v0-mvp-week-1", "v0-pre-option-3") and document the intent in CLAUDE.md.

---

## 2.4 Tags

**Total tags: 0.**

Production has been live since the strike cluster began (Decision Engine fired snapshots on 2026-05-07). **There is no version tag marking the production state.** All sprint, phase, and strike boundaries are commit-message conventions; no git ref-level annotation. → Phase 6 + Phase 10.

**Recommended tag points (retro):**
- `sprint-6-end` at `e1d59f8` (2026-05-01) — last Sprint 6 phase 6.4 commit
- `sprint-7-rolling-start` at `0425919` (2026-05-02) — start of Sprint 7 6.6
- `decision-engine-restored` at `f42626b` (2026-05-07) — Strike #116 close
- `audit-baseline` at `aa68470` (2026-05-08) — this audit start

Decision rests with operator. Not load-bearing for the audit but cheap insurance.

---

## 2.5 HEAD vs origin/HEAD

```
## feature/option-3-plus-nav-v2-1
?? .9-1b-containers-before.txt
?? .9-1b-snapshot.txt
Local ahead of origin:  (empty)
Origin ahead of local:  (empty)
```

The "empty / empty" is misleading per the tracking-config gap above. **Real state:** local is 1 commit ahead of `origin/feature/option-3-plus-nav-v2-1` (the Phase 1 audit commit `aa68470`). Origin is at `40dfffb`. The recon's `@{u}` reference silently failed because there's no upstream configured.

→ Push decision (a) or (b) from Phase 1 still pending.

---

## 2.6 Recent commit graph (50)

```
* aa68470  Audit: phase 1 — Filesystem topology
* 40dfffb  Doc-sync post-Strikes-#110-116
* f42626b  Strike #116
* b7da6ca  Strike #115
* cf50b62  Doc-sync post-Strikes-#110-114
* 656e5ec  Strike #114
* a22e4b1  Strike #113
* 66f1136  Strike #112
* ba14e2b  Strike #111
* f216075  Strike #110
* 757d4cc  Doc-sync post-Strike-#105
* 6f1bf05  Strike #105
* 8c94a5b  Strike #104a
* a6728db  Strike #103
* fefa2a7  Strike #101
* c8bdba5  Strike #100
* e76764d  Strike #99
* 45e588e  Strike #98
* 5c7929c  Strike #97
* b7ab5bc  Strike #96
* 21de5a0  Add Agentic TIS Doctrine
* 0dad3e1  Sprint 7 session close 2026-05-05
* 5d9cbbe  Strike #95
* 5db74d5  Session handover 2026-05-04
* 6e53d60  Add Parallel Execution Doctrine
* 0f5eded  Strike #94 close-out
* 1872043  Strike #93
* ce4e8fa  Strike #92 close-out
* 66c7146  Strike #92 fix
* 02b7ae1  Operational hygiene: Strike registry backfill #86-#91
... [40 more in same linear pattern]
```

**No branches in the visible graph** — pure trunk. The single merge (`44af539`) is older than the 50-commit window.

---

## 2.7 / 2.8 Strike chain reconstruction

### Strike numbers actually present in commit history

```
62  84  88  92  93  94  95  96  97  98  99  100  101  103  104  105  110  111  112  113  114  115  116
```

**23 distinct strike numbers** ship as `Strike #N: ...` (or "close-out" / "fix" / "hotfix") commits. Some appear in operational-hygiene commits ("Strike registry backfill #86-#91" → mentions #86-#91 but is a single registry-update commit, not 6 strike commits).

### Cross-reference: archive folder vs commits vs CLAUDE.md

| # | Commit? | Archive file? | Status |
|---|---------|---------------|--------|
| 1-61 | No | No | Doctrine-only in CLAUDE.md (pre-Sprint-7) |
| 62 | Mentioned (Phase 10-1b commit) | No | Pre-Sprint-7 doctrine, referenced not commit |
| 63 | No (mentioned in #62 sibling) | No | Doctrine-only |
| 64-83 | No | No | Doctrine-only |
| 84 | Yes (`5208754`) | Yes (`strike_84_*.md`) | ✓ |
| 85 | Mentioned in #84 hotfix | No | Doctrine-only (per Strike #88 archive) |
| 86 | Backfilled in `02b7ae1` | Yes | ✓ |
| 87 | Backfilled in `02b7ae1` | Yes | ✓ |
| 88 | Yes (`ed158af`) | Yes | ✓ |
| 89 | Backfilled in `02b7ae1` | Yes | ✓ |
| 90 | Backfilled in `02b7ae1` | Yes | ✓ |
| 91 | Backfilled in `02b7ae1` | Yes | ✓ |
| 92 | Yes (×2: fix + close-out) | Yes | ✓ |
| 93 | Yes (`1872043`) | Yes | ✓ |
| 94 | Yes (`0f5eded`) | Yes | ✓ |
| 95 | Yes (`5d9cbbe`) | Yes | ✓ |
| 96 | Yes (`b7ab5bc`) | Yes | ✓ |
| 97 | Yes (`5c7929c`) | Yes | ✓ |
| 98 | Yes (`45e588e`) | Yes | ✓ |
| 99 | Yes (`e76764d`) | Yes (×2: unification + path_b) | ✓ |
| 100 | Yes (`c8bdba5`) | Yes | ✓ |
| 101 | Yes (`fefa2a7`) | Yes | ✓ |
| **102** | **No** | **Yes (`_BACKLOG`)** | **Filed-deferred** |
| 103 | Yes (`a6728db`) | Yes | ✓ |
| 104a | Yes (`8c94a5b`) | Yes (`104a`) | ✓ — note: no `104` (only `104a`) |
| 105 | Yes (`6f1bf05`) | Yes | ✓ |
| **106** | **No** | **No** | **GAP — unaccounted** |
| **107** | **No** | **No** | **GAP — unaccounted** |
| **108** | **No** | **No** | **GAP — unaccounted** |
| **109** | **No** | **No** | **GAP — unaccounted** |
| 110 | Yes (`f216075`) | Yes (cluster) | ✓ |
| 111 | Yes (`ba14e2b`) | Yes (cluster) | ✓ |
| 112 | Yes (`66f1136`) | Yes (cluster) | ✓ |
| 113 | Yes (`a22e4b1`) | Yes (cluster) | ✓ |
| 114 | Yes (`656e5ec`) | Yes (cluster) | ✓ |
| 115 | Yes (`b7da6ca`) | Yes (cluster) | ✓ |
| 116 | Yes (`f42626b`) | Yes (cluster) | ✓ |

### Strike #91 surface findings (chain integrity)

1. **#106 / #107 / #108 / #109 are unaccounted** — 4 strike numbers exist in the sequence (#105 → #110 jump) but have neither commits nor archive entries. CLAUDE.md should be checked for what these were filed as. Most likely: doctrine entries that didn't merit strikes (numbering applied retroactively) OR Architect-advisory-mode strikes that drifted (Strike #89 doctrine: advisory-mode strikes silently fail to land — possibly recurred).

2. **#102 is `_BACKLOG`-suffixed** — properly deferred, archive present, no commit. Acceptable per Strike #102 BACKLOG convention.

3. **#85 is doctrine-only** (referenced in #84 close-out and #88 hotfix). No archive file. Acceptable per archive selectivity.

4. **#62 is referenced in `25dfafe Sprint 7 Phase 10-1b: TIS prompt update enforcing lookup_nutrition tool — closes operational loop on Strikes #62/63`** but #62 itself was a pre-Sprint-7 doctrine strike. Not a commit-level strike.

5. **`104a` not `104`** — naming convention `Na` was used once. Likely a Path A / Path B distinction. Worth noting but not a chain break.

### Recommend (Phase 10)

- Reconcile #106-109 against CLAUDE.md content; if doctrine-only, flag explicitly in archive folder via stub `strike_106-109_doctrine_only.md` or rename CLAUDE.md mentions to be locatable by grep.
- Consolidate the two #99 archive files (`_unification.md` + `_path_b.md`) — one summary entry + one detail.

---

## 2.9 Doc-sync commits

```
2026-05-08  40dfffb  Doc-sync post-Strikes-#110-116
2026-05-07  cf50b62  Doc-sync post-Strikes-#110-114                      ← superseded by 40dfffb
2026-05-07  757d4cc  Doc-sync post-Strike-#105: master to v5.0.1 + Section 14
2026-05-04  02b7ae1  Operational hygiene: Strike registry backfill #86-#91
```

Plus three "Operational hygiene: CLAUDE.md ## Current state doc-sync ..." commits on 2026-05-02 / -03 that follow the same ritual under different naming. **Total formal doc-syncs: 7 across 30 days** — once every ~4 days, which matches the strike-cluster cadence.

This is the **Strike #88 cadence in the wild** — every cluster (or single significant strike) gets a doc-sync afterward.

---

## 2.10 Audit commits

```
2026-05-08  aa68470  Audit: phase 1 — Filesystem topology
```

Just one — Phase 1's commit from this audit.

---

## 2.11 Authors

```
156  Cody Kama <founder@teivaka.com>
  3  Cody       <founder@teivaka.com>
```

**Author identity drift.** Same email (so commits are attributable), but the display name oscillated 3 times early in history. Audit-chain provenance signal: same human, 1 git-config change at some early point. Cosmetic, not security.

→ Phase 9: confirm the audit ledger / hash chain doesn't depend on author NAME (presumably it depends on author EMAIL or commit SHA — but verify).

---

## 2.12 Commits per day (last 60 days)

```
 5  2026-04-17     ← MVP Week 1 work begins
 3  2026-04-18
 2  2026-04-19
 4  2026-04-21
 6  2026-04-24
15  2026-04-25
 8  2026-04-26
15  2026-04-27
 1  2026-04-28
 4  2026-04-29     ← incident day; root-owned files appeared on disk
18  2026-04-30
22  2026-05-01     ← peak: Sprint 6 phase 6.10 (POULTRY + Bank Evidence + Library UI)
14  2026-05-02
10  2026-05-03
11  2026-05-04
 9  2026-05-05
 1  2026-05-06     ← only Strike #105 logo deploy
 9  2026-05-07     ← Decision Engine cluster #110-116
 2  2026-05-08     ← today: doc-sync + Phase 1 audit
```

**Median: ~9 commits/day. Peak: 22.** Solo cadence is consistent. 2026-04-28 (1 commit) + 2026-04-20 (skipped) + 2026-04-22 / -23 (skipped) are the recovery / planning gaps.

The 2026-04-29 incident day is visible: 4 commits, then the root-owned `_archive/teivaka_api-prerebuild-*.tar.gz` was created (Phase 1 finding C) — operator was working under root identity that day.

---

## 2.13 File churn (top 30)

| Changes | File | Domain |
|---:|---|---|
| **36** | `frontend/src/App.jsx` | Router root — every nav iteration touches it |
| **32** | `CLAUDE.md` | Section 14 doc-sync ritual |
| **24** | `frontend/src/components/launcher/LogSheet.jsx` | POULTRY event dispatcher (note: `.broken-keep-for-diagnosis` sibling at root) |
| **19** | `11_application_code/app/routers/events.py` | Audit-events ingestion — hot |
| **18** | `11_application_code/app/main.py` | FastAPI app factory |
| **17** | `11_application_code/app/schemas/events_registry.py` | Polymorphic events registry — spine |
| **12** | `frontend/src/layouts/FarmerShell.jsx` | Farmer outer shell |
| **9** | `frontend/src/pages/farmer/FarmDashboard.jsx` | Farm dashboard page |
| 6 | `frontend/src/pages/onboarding/FarmBasics.jsx` | Onboarding voice-first |
| 6 | `frontend/src/pages/farmer/FieldEventNew.jsx` | Generic field-event form |
| 6 | `frontend/src/components/nav/TopAppBar.jsx` | Top nav |
| 6 | `11_application_code/app/routers/event_catalog.py` | Event catalog API |
| 5 | `frontend/src/pages/farmer/HarvestNew.jsx` | Harvest event form |
| 5 | `frontend/src/pages/Login.jsx` | Auth UI |
| 5 | `frontend/src/components/settings/GroupCatalogSection.jsx` | Group catalog Settings |
| 5 | `frontend/src/components/nav/PillarTabs.jsx` | 4-pillar nav |
| 5 | `frontend/package.json` | Frontend deps |
| 5 | `frontend/package-lock.json` | Frontend deps lock |
| 5 | `TFOS_Catalog_Redesign_Doctrine_Amendment_v2_2026-04-30.md` | Doctrine doc |
| 5 | `11_application_code/requirements-api.txt` | API deps |
| 5 | `11_application_code/app/workers/decision_engine_worker.py` | Decision Engine — hot during cluster #110-116 |
| 5 | `11_application_code/app/services/cycle_service.py` | Cycle service |
| 5 | `11_application_code/app/routers/cycles.py` | Cycle router |
| 5 | `11_application_code/app/middleware/auth.py` | Auth middleware |
| 5 | `04_environment/docker-compose.yml` | Deploy config |
| 4 | `frontend/src/pages/farmer/Onboarding.jsx` | Onboarding container |
| 4 | `frontend/src/components/nav/pillarSubNavMap.js` | Pillar sub-nav config |
| 4 | `frontend/src/components/nav/BottomNav.jsx` | Bottom nav |
| 4 | `frontend/src/components/farm/NewCycleModal.jsx` | Cycle creation modal |
| 4 | `frontend/src/components/PrivateRoute.jsx` | Route guard |

**Hot zones:**
- **Frontend nav/router cluster** (App.jsx + FarmerShell.jsx + TopAppBar/BottomNav/PillarTabs/PrivateRoute) — accumulated >70 changes. Confirms Phase 4.2 / Day 3a / Strike #97 churn.
- **Backend events spine** (events.py + main.py + events_registry.py + event_catalog.py) — accumulated 60 changes. The polymorphic events architecture (Sprint 6 Phase 6.2-1) and POULTRY event taxonomy account for most.
- **CLAUDE.md** at 32 changes → confirms the doc-sync ritual frequency.

---

## 2.14 Renames

```
757d4cc  2026-05-07  R100  TFOS_MASTER_BUILD_INSTRUCTION.md → _ARCHIVE_2026-05-06_strike_105/TFOS_MASTER_BUILD_INSTRUCTION_v1.0.md
0b37a7f  2026-04-30  R084  frontend/src/pages/onboarding/WhatYouFarm.jsx → frontend/src/pages/farmer/PickGroups.jsx
```

**Two renames in 159 commits.** The Master Build Instruction archive move (Strike #105 doc-sync to v5.0.1) and one onboarding-page rename. Clean.

---

## 2.15 Deletions

```
1  00_project_overview/strikes/strike_110_114_decision_engine_cascade.md
```

**One file ever deleted in 159 commits.** That deletion happened just now in commit `40dfffb` (cluster archive replacement). Everything else has been kept on disk. Confirms the disciplined-snapshot habit observed in Phase 1: files are renamed, archived, or `.bak`-suffixed but rarely git-deleted.

---

## 2.16 Large commits (>500 LOC, top 20)

| LOC | Commit | Date | Notes |
|---:|--------|------|-------|
| **80,234** | `189d239` | 2026-04-17 | **Baseline TFOS platform state pre-MVP Week 1** — first commit, big-bang import (Migrations 001-015g + 016a/b applied prior to git). Pre-history dump without per-feature provenance. |
| 6,136 | `e65de7e` | 2026-04-24 | `consolidate: backfill 2026-04-19 to 2026-04-24 uncommitted work` — discipline gap recovered |
| 2,230 | `6d0f9d0` | 2026-04-24 | Day 3a Nav v2.1 structural shell |
| 1,773 | `757d4cc` | 2026-05-07 | Doc-sync post-Strike-#105 (mostly Master Build Instruction v5.0.1) |
| 1,770 | `d8ff8eb` | 2026-04-21 | Phase 4.2 Step 5-6 Task API endpoints |
| 1,447 | `521b4dc` | 2026-04-24 | option-3+nav-v2-1 day 2: migration 029 + onboarding router + SSE TIS stream |
| 1,197 | `c8bdba5` | 2026-05-05 | Strike #100: 3-dropdown Crops form + crop_varieties catalog |
| 1,118 | `ebb6f9c` | 2026-04-24 | Day 3a #2 prototype alignment + Nav v2.2 |
| 1,073 | `375213a` | 2026-04-21 | Phase 4 farm ops production_cycles API |
| 957 | `b5c7344` | 2026-04-25 | Day 3b-Farm Farm Overview content (10-card grid) |
| 918 | `48d52e1` | 2026-04-17 | Week 1 MVP FarmerShell + BottomNav + dashboard + harvest |
| 913 | `60ab2b6` | 2026-04-27 | CashUI-1b cash ledger frontend |
| 903 | `c5dd1c6` | 2026-04-21 | Phase 4.2 Days 1-4 Task Engine + audit hash chain |
| 845 | `21de5a0` | 2026-05-05 | Add Agentic TIS Doctrine |
| 805 | `5fc47da` | 2026-04-25 | Day 4 Phase 2 voice-first /onboarding/farm-basics |
| 737 | `c35ce15` | 2026-05-01 | Sprint 6 Phase 6.10-1 POULTRY Bank Evidence PDF (first moat artifact) |
| 718 | `6e53d60` | 2026-05-04 | Add Parallel Execution Doctrine |
| 698 | `19d7318` | 2026-05-03 | Sprint 7 Phase 6.3-17/18 VISITOR_LOGGED + PEST_CONTROL_APPLIED |
| 670 | `b12f85e` | 2026-05-01 | Sprint 6 Phase 6.10-1b Bank Evidence as Monthly Cashflow Statement |
| 660 | `a28d574` | 2026-04-25 | Day 3.5 Phase 2 Cycle Creation Flow |

**The 80,234-LOC baseline** is the single biggest provenance gap in the audit. It includes:
- All 15 initial migrations (001-015g + 016a/b applied to db pre-git)
- The full backend application skeleton (~210 .py files visible today, most originated here)
- The full pre-MVP frontend
- All schema files (`02_database/schema/*.sql`)
- The entire knowledge-base seed
- All architecture docs (`01_architecture/`, `03_backend/`, `09_knowledge_base/`)

**Without the baseline expanded**, the audit chain provenance starts at `189d239` (2026-04-17) — anything written to disk *before* that date and committed *as part of* that commit has no per-line attribution. That's expected for a project's first commit, but it means **~75% of the codebase visible today landed without per-feature commits**. → Phase 4 + Phase 9 cross-check: confirm the audit ledger code didn't pre-exist `189d239`.

---

## 2.17 Merge commits

```
Total merges: 1
2026-04-17  44af539  Merge MVP Week 1: FarmerShell + /farm dashboard + schema alignment
```

**One merge commit total.** Everything since 2026-04-17 has been linear / fast-forward. No branch debt accumulating; no stale topic branches. Single-developer linear-history discipline.

---

## 2.18 Reflog (last 30)

All entries are `commit:` operations on HEAD — no `checkout`, `reset`, `rebase`, `cherry-pick`, `merge` reflog entries visible in the last 30. Confirms the linear-history pattern.

---

## 2.19 Stash

**Empty.** No deferred work hiding.

---

## 2.20 Alembic migrations — disk vs git

```
On disk:    83
Tracked:    82
Drift:      1
```

The drift is the orphan `100_classroom_foundation.py` (Strike #117 backlog). Confirms Phase 1 finding.

### Migration sequence audit

```
001_initial_extensions
002_shared_schema
003_tenant_schema
004_materialized_views
005_functions
006_seed_data
007_idempotency_keys
008_add_password_hash
009_enhanced_registration
010_admin_role
011_password_reset_columns
012_add_farm_worker_count_limits
013_phone_otp_columns
014_growth_foundations
015a_fix_chemical_compliance       ← 015 split into 015a-015g (fix cascade)
015b_fix_field_event_whd_trigger
015c_fix_tenant_rls_with_check
015d_fix_financials_trigger
015e_fix_financials_trigger_v2
015f_fix_referral_rewards_rls
015g_qualify_tenant_func_refs
016a_fix_cycle_status_drift        ← 016 split into 016a/b
016b_fix_validate_rotation_alts
017_community_schema
017b_classroom_schema              ← 017 has community + 017b classroom
018_ops_health_checks
019_harvest_compliance_overrides
020_field_events_soft_delete
021_seed_rule_038
022_task_engine_v4
023_audit_events_v4
024_task_queue_status_alignment
025_audit_events_add_cycle_transition
026_one_active_cycle_per_pu
027_seed_productions_catalog
028_farmer_label_columns
029_tis_advisories
030_force_tenant_rls
031_audit_report_exports
032_audit_event_type_cash
033_cash_ledger_anchors
[034 — MISSING]                    ← STRIKE #91 finding
035_tenant_mv_input_balance_stub
036_event_type_catalog
037_naming_dictionary_schema
038_naming_dictionary_seed_en
039_farm_active_groups
040_catalog_group_expansion
041_naming_dictionary_groups_v2
042_farm_group_toggled_event
043_poultry_events_taxonomy
044_polymorphic_farm_libraries
045_drop_stale_audit_check
046_poultry_event_log_table
047_flocks_entity
048_flock_fk_to_event_log
049_audit_verify_function
050_audit_public_stats_function
051_event_type_catalog_health_feed
052_vaccine_withholding_attrs
053_seed_task_queue_solo
054_task_created_audit
055_crop_nutrition_protocols
056_litter_coop_disinfectant
057_feed_purchased_water_consumed
058_mortality_investigated_cull
059_visitor_pest_control
060_temperature_eggs_graded
061_flock_moved_equipment_maintained
062_incident_supplies
063_poultry_label_backfill
064_weight_check_poultry_orphan
065_weight_check_to_poultry
066_b63_cluster_a_worker_events
067_field_events_check_extend
068_crop_varieties_catalog
069_crop_name_uppercase
070_provisional_varieties_seed
071_crop_varieties_grant
072_layer_enum_seed
073_seed_decision_signal_config
074_inputs_farm_id
075_decision_signal_composite_pk
                                   ← gap 076-099 (room for future)
100_classroom_foundation           ← UNTRACKED ORPHAN, Strike #117 backlog
```

### Strike #91 surface findings (migrations)

1. **Migration 034 missing** — sequence jumps `033 → 035`. Either:
    - (a) deleted from disk (but kept in alembic_version history if applied),
    - (b) renumbered/squashed, or
    - (c) dropped before being committed.
    → Phase 3 SQL: query `alembic_version` for `034_*` ancestry.

2. **Two classroom migrations:**
    - `017b_classroom_schema.py` — committed in Sprint-5-era, already applied (presumably)
    - `100_classroom_foundation.py` — orphan, untracked, never applied
    - **Same domain, parallel paths.** The orphan was numbered `100` — far above current head `075` — suggesting it was authored ahead of being needed, deferred, then forgotten when classroom was paused (per `5db74d5 Session handover 2026-05-04: Classroom pause`). → Phase 3.

3. **Migration 015 split into `015a-g`** (7 files) and **016 split into `016a/b`** — these are amend-cascade signatures, fixing earlier 015/016 problems. Acceptable per migration discipline but worth tracking for amend density.

4. **Gap 076-099** is intentional — leaves room for non-classroom migrations between 075 and the orphan 100. Not a Strike #91 finding.

---

## 2.21 .git integrity

```
git fsck:  20 dangling blob, 1 dangling tree
count:     2053 objects
size:      10.58 MiB
in-pack:   0
packs:     0
size-pack: 0 bytes
```

### Findings

- **Repo has never been packed.** All 2053 objects are loose. `.git/` is 12 MiB on disk (Phase 1 finding), of which 10.58 MiB is in 2053 loose objects. **Recommend `git gc --aggressive` at audit close** — should reduce by ~70%.
- **20 dangling blobs + 1 dangling tree.** Likely sources:
    1. Failed/aborted commits (recovered before commit succeeded)
    2. Truncated paste-pack heredocs that wrote partial files (similar to the truncation Strike #91 caught earlier in this session, but writing-to-disk variants)
    3. `git stash drop`s (none seen in stash today, but historical)
    4. Force-amend operations that orphaned the prior tree
- **Not load-bearing for audit chain integrity** — dangling objects are unreachable, don't appear in any tip's history. Cleanup is hygiene, not security.

---

## 2.22 Git config (sanitized)

Notable settings:
- `core.repositoryformatversion=0` — standard
- `core.filemode=true` — permissions tracked (relevant for the 0777 problem from Phase 1.17 — git is preserving the permissive bits)
- `core.bare=false` — working tree present
- `core.logallrefupdates=true` — reflog enabled (good)
- `remote.origin.url=git@github.com:founder2025/teivaka-tfos.git` — SSH origin
- Branch tracking: configured for `main` + `feature/mvp-week1-farm-shell`; **not configured for the active feature branch** (Strike #91 finding).

---

## Cross-cutting findings (Phase 2)

| # | Finding | → Phase |
|---|---------|---------|
| Q | Branch tracking config missing for active feature branch — `git status` silently lies about ahead/behind | 10 |
| R | 4 strike numbers (#106, #107, #108, #109) absent from both commits and archive folder — unaccounted gap | 10 + cross-ref CLAUDE.md |
| S | `main` is 18 days stale; production runs from feature branch — deployment-vs-trunk drift | 6 |
| T | 0 tags despite production deployment — no version anchor for any release | 6 + 10 |
| U | `core.filemode=true` means the 0777 perms from Phase 1.17 are preserved in object DB — perms tampering surface | 9 |
| V | 20 dangling blobs + 1 dangling tree, repo never packed (`git gc` not run) | 10 hygiene |
| W | Migration 034 missing from sequence (033 → 035) — Phase 3 needs to confirm if applied | 3 |
| X | Two classroom migrations in conflict: tracked `017b_*` + orphan `100_*` (Strike #117 backlog) | 3 |
| Y | Author identity drift: 156 commits "Cody Kama", 3 "Cody" (same email) — provenance signal | 9 |
| Z | 80,234-LOC baseline `189d239` carries ~75% of code without per-feature provenance | 4 + 9 |
| AA | Single merge in 159 commits — linear history, no branch debt | (positive finding) |
| BB | 7 doc-sync rituals across 30 days (~every 4 days) — Strike #88 cadence respected | (positive finding) |

---

## Audit-chain hostile signals (added to Phase 1's three)

4. **`core.filemode=true`** preserves the `chmod -R 777` aftermath (Phase 1.17) in the object DB. Reverting to 0644 would create a one-shot "permissions normalization" commit visible in history, but the existing objects retain the permissive mode in their tree records.
5. **Author identity drift** — if the audit ledger or any report relies on `git log --author`, the "Cody" / "Cody Kama" split fragments queries.
6. **20 dangling blobs in `.git/objects/`** are **invisible to `git log`** but exist on disk. None are reachable from any branch tip. If hash-chain integrity verification ever relies on object-DB enumeration (rather than tip-walking), these would surface as anomalies. Not a current threat — flag for Phase 9.

---

## Handoffs

- **Phase 3** (database): query `alembic_version` for migration 034 ancestry; reconcile `017b_classroom_schema` vs `100_classroom_foundation` orphan; verify migration head is `075_decision_signal_composite_pk` (already confirmed in doc-sync pre-flight, but cross-check formally).
- **Phase 4** (backend): cross-check the 80,234-LOC baseline against current `app/` tree — what fraction of code today predates per-feature commits.
- **Phase 6** (infrastructure): confirm `main` is genuinely a stale historical branch (not the deploy target). Document the deployment-vs-trunk topology.
- **Phase 9** (security): `core.filemode=true` × 0777 perms in objects; author-identity drift in audit chain; dangling-object inventory.
- **Phase 10** (synthesis): Q, R, S, T, V, Y, Z bake into refactor/cleanup recommendations. Decide push cadence (a)/(b) for the audit commits already accumulated locally.

---

**Phase 2 complete.** No mutations. File written 2026-05-08 05:35 UTC.
