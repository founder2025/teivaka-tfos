# Phase 1 — Filesystem Topology

**Audit date:** 2026-05-07
**Recon executed:** 2026-05-08 01:59:04 UTC (post doc-sync commit `40dfffb`)
**Branch:** feature/option-3-plus-nav-v2-1
**Scope:** `/opt/teivaka` — read-only `find` / `ls` / `du` / `git status` recon, no mutations
**Recon script:** `/tmp/phase1_recon.sh` (24 sections, output 34.9KB)

---

## Executive summary

The repo is a 215M working tree with a **38% disk-vs-git drift** (455 tracked, 737 on-disk excluding `node_modules` / `.git` / `__pycache__` / `.venv`). The drift is not chaos — most of it is a deliberate but accumulating `.bak` snapshot habit (CLAUDE.md alone has 17 backups at root). The structural anomalies are: a numeric-prefix collision (`04_environment/` + `04_execution/`), two stale numbered dirs (`06_api_reference/`, `08_deployment/` last touched 2026-04-07), an old build dir not cleaned (`frontend/dist.old.1776163582/`), and **root-owned files in two locations** (operator-session leakage from 2026-04-29). Headroom is fine (24 GB used / 77 GB disk = 31%). Caddy access log is 42 MB with no rotation visible — not Phase 1 territory but worth flagging now for Phase 6.

**Strike #91 surface findings (cross-phase):** 7 distinct anomalies, all forwarded to Phases 2 / 6 / 7 / 9.

---

## 1.0 Audit dir precondition

`00_project_overview/audits/` did **not** exist at recon time. Created in this phase under `2026-05-07_full_platform_audit/` immediately before this file was written. Subsequent phases append siblings.

---

## 1.1 Root inventory

22 entries at `/opt/teivaka/`. Permissions are mixed — many directories at 0777 (drwxrwxrwx), suggesting a permissive `chmod -R 777` was applied at some point.

| Type | Count | Notes |
|------|-------|-------|
| Numbered dirs (`NN_*`) | 12 | One collision: `04_environment/` + `04_execution/` |
| Top-level docs (`.md`) | 8 | TFOS_BUILD_BLUEPRINT, TFOS_Master_Build_Instruction, TFOS_Catalog_Redesign_Doctrine (×2), TFOS_Vertical_Completeness_Doctrine, day_3a_standard_shell_spec, CLAUDE.md, plus catalog amendment |
| `CLAUDE.md.bak*` | **17** | All untracked, ~500 KB combined |
| `_archive` dirs | 2 | `_archive/` (root-owned), `_ARCHIVE_2026-05-06_strike_105/` |
| Hidden | 5 | `.git/`, `.claude/`, `.gitignore`, `.9-1b-containers-before.txt`, `.9-1b-snapshot.txt` |

The two `.9-1b-*` dotfiles at root are Phase 9.1b artifacts (containers snapshot from 2026-05-02). Untracked, 18 + 208 bytes — junk, but harmless.

---

## 1.2 Top-level sizes

```
16K   .claude/
60K   08_deployment/
68K   _ARCHIVE_2026-05-06_strike_105/
96K   04_execution/
96K   10_handoff/
120K  06_api_reference/
160K  05_data_migration/
240K  01_architecture/
248K  docs/
252K  04_environment/
292K  09_knowledge_base/
296K  02_database/
324K  00_project_overview/
348K  07_testing/
444K  _archive/
472K  03_backend/
3.1M  11_application_code/   ← code
12M   .git/
41M   logs/                  ← caddy access log dominates
155M  frontend/              ← node_modules dominates (150M)
```

Functional code + docs (excl `node_modules`, `.git`, `logs/`): **~7.5 MB**. The repo is small. The bloat is `node_modules` (150M) and the caddy access log (42M).

---

## 1.3 Disk footprint

- `/opt/teivaka` total: **215 MB**
- `/dev/vda1`: 77 GB total, 24 GB used (31%) — plenty of headroom
- No imminent disk pressure

---

## 1.4 Directory tree (depth 3, noise pruned)

```
/opt/teivaka/
├── .claude/{feedback, handover}                                    # both empty
├── 00_project_overview/{handover, strikes}
├── 01_architecture/
├── 02_database/{init, schema}
├── 03_backend/
├── 04_environment/                                                 ← collision
├── 04_execution/{phase_4_2_option_3_plus_nav_v2_1}                 ← collision
├── 05_data_migration/{migration_scripts}
├── 06_api_reference/                                               # STALE
├── 07_testing/{tests}
├── 08_deployment/                                                  # STALE
├── 09_knowledge_base/
├── 10_handoff/
├── 11_application_code/
│   ├── alembic/{versions}
│   ├── app/{core, db, deps, middleware, models, routers, schemas,
│   │        services, tasks, templates, utils, workers}
│   └── openclaw/                                                   ← TIS agent home
├── _ARCHIVE_2026-05-06_strike_105/
├── _archive/                                                       ← root-owned
├── docs/{doctrine}
└── frontend/{src/{components, context, hooks, layouts, pages,
                  styles, utils}, public/.bak-pre-logo-deploy/}
```

`frontend/public/.bak-pre-logo-deploy/` is a 12-file backup of the public dir from before Strike #105 (the logo deployment strike). Should probably be in `_ARCHIVE_2026-05-06_strike_105/`.

---

## 1.5 File count by extension

| Ext | Count | Notes |
|-----|-------|-------|
| `.py` | 210 | Backend |
| `.js` | 113 | Frontend (incl dist) |
| `.jsx` | 109 | Frontend components/pages |
| `.md` | 77 | Docs |
| `.png` | 20 | Logos + UI assets |
| `.bak-pre-logo-deploy` | 12 | Strike #105 snapshots |
| `.txt` | 8 | Mixed |
| `.sql` | 8 | Schema files |
| `.html` | 6 | Includes the 100 KB Interactive Prototype |
| `.bak-pre-9-1` | 6 | Phase 9.1 snapshots |
| `.svg` / `.json` / `.bak-pre-strike-99-v2` / `.bak-pre-9-2` / `.bak-pre-6-3-23/21/19/17/15/13/11` / `.3-9` | 4 each | Snapshot habit per phase |

The long tail of `.bak-pre-*` extensions tells a story: every contentious phase or strike got a tarball-style snapshot in-place, never cleaned up. **Cumulative `.bak-pre-*` files: ~80**, scattered through the tree.

---

## 1.6 Tracked vs on-disk

| Metric | Count |
|--------|-------|
| `git ls-files` | **455** |
| On disk (excl noise) | **737** |
| **Drift** | **+282 (62% over tracked)** |

282 files exist on disk that git doesn't know about. Breakdown (estimated from sections 1.7, 1.8, 1.21):
- ~80 `.bak-pre-*` files (snapshot habit)
- ~17 `CLAUDE.md.bak*` files
- ~12 `bak-pre-logo-deploy/` files in `frontend/public/`
- 2 `_archive/` tarballs
- 1 orphan migration (`100_classroom_foundation.py`)
- The rest = old `dist.old.*`, doctrine drafts, handover artifacts, prototype scaffolding

This is a **disciplined snapshot habit, not chaos** — but it's not garbage-collected and slowly accumulates. → recommend Phase 10 sweep.

---

## 1.7 Untracked + modified (full)

```
?? .9-1b-containers-before.txt
?? .9-1b-snapshot.txt
?? 00_project_overview/handover/TFOS_HANDOVER_2026-05-05_FOUNDATION_MARATHON_CLOSE.md
?? 11_application_code/alembic/versions/100_classroom_foundation.py     ← Strike #117 backlog
?? 11_application_code/app/routers/event_catalog.py.bak-strike-92        ← bak filter hid this
?? CLAUDE.md.bak-20260430-pre-sync                                       ← bak filter hid this
?? _archive/teivaka_api-code-20260429-100525.tar.gz
?? _archive/teivaka_api-prerebuild-20260429-100303.tar.gz
?? frontend/src/components/launcher/LogSheet.jsx.broken-keep-for-diagnosis
```

**9 items total.** Earlier doc-sync output filtered with `grep -v "\.bak"` and showed only 6 — the bak filter hid `event_catalog.py.bak-strike-92` and `CLAUDE.md.bak-20260430-pre-sync`. The bak filter is a doctrine smell: it lets `.bak` accumulation become invisible to status checks. → flag for Phase 10.

---

## 1.8 .bak / .orig / .old / .broken / tilde files (within tree, excl backup root files)

```
2026-04-29   5075  /opt/teivaka/04_environment/.env.broken-20260429-recovery
2026-04-30   8208  /opt/teivaka/frontend/src/components/launcher/LogSheet.jsx.broken-keep-for-diagnosis
2026-05-01  29943  /opt/teivaka/_ARCHIVE_2026-05-06_strike_105/TFOS_MASTER_BUILD_INSTRUCTION_pre-510g.md.bak
```

Only 3 files in this scan. The `bak-pre-*` snapshot habit dominates the actual count (see 1.5) but doesn't trigger the literal `*.bak` / `*.orig` / `*.old` / `*.broken*` glob — these files use compound suffixes like `.md.bak-pre-strike-100`. **Recommend Phase 10 sweep with broader patterns.**

`.env.broken-20260429-recovery` — 5075 bytes, owned root:root, perms 0600 → **session-leak artifact**. The 2026-04-29 incident left state on disk that wasn't reverted.

---

## 1.9 Archive / dead-code dirs

```
2026-04-29  /opt/teivaka/_archive
2026-05-06  /opt/teivaka/_ARCHIVE_2026-05-06_strike_105
```

Two archive directories with **inconsistent naming conventions**:
- `_archive/` — lowercase, undated, contains 2026-04-29 emergency tarballs (`teivaka_api-code-*.tar.gz`, `teivaka_api-prerebuild-*.tar.gz`), root-owned. Both tarballs are untracked.
- `_ARCHIVE_2026-05-06_strike_105/` — uppercase, dated, contains pre-510g build instruction backup, properly tfos-owned.

**Convention drift.** → recommend Phase 10 standardize.

---

## 1.10 Newest file per top-level dir

| Last modified | Dir | Status |
|---|---|---|
| 2026-04-07 | `06_api_reference/` | **STALE** (~31 days) |
| 2026-04-07 | `08_deployment/` | **STALE** (~31 days) |
| 2026-04-08 | `01_architecture/` | Stable doc dir |
| 2026-04-11 | `03_backend/` | Stable doc dir |
| 2026-04-11 | `09_knowledge_base/` | Stable doc dir |
| 2026-04-11 | `10_handoff/` | Stable doc dir |
| 2026-04-12 | `02_database/` | Stable doc dir |
| 2026-04-15 | `05_data_migration/` | Stable doc dir |
| 2026-04-21 | `07_testing/` | Tests not maintained recently |
| 2026-04-24 | `04_execution/` | Phase 4.2 work parked |
| 2026-04-25 | `.claude/` | Tooling state |
| 2026-04-29 | `_archive/` | Frozen |
| 2026-05-01 | `_ARCHIVE_2026-05-06_strike_105/` | Frozen |
| 2026-05-02 | `logs/` | Active (caddy log) |
| 2026-05-05 | `docs/` | Doctrine activity |
| 2026-05-06 | `frontend/` | Active dev |
| 2026-05-07 | `04_environment/` | Active (docker-compose changes) |
| 2026-05-07 | `11_application_code/` | Active (Strike #116) |
| 2026-05-08 | `00_project_overview/` | Active (this audit) |

**Hot:** `frontend/`, `11_application_code/`, `04_environment/`, `00_project_overview/`.
**Cold but ought to be hot:** `07_testing/` (no edits in 17 days despite Decision Engine changes), `06_api_reference/` (OpenAPI spec at 116 KB last touched 2026-04-07 — almost certainly drifted from current routers).

---

## 1.11 Stale top-level dirs (no edits in 30+ days)

```
STALE      1 files  /opt/teivaka/06_api_reference/
STALE      2 files  /opt/teivaka/08_deployment/
```

Just two directories. `06_api_reference/openapi_spec.yaml` (116 KB) is the canonical API contract — if it hasn't been touched since 2026-04-07 but routers have been modified weekly, it's almost certainly **out of sync with reality**. → critical Phase 4 cross-check.

---

## 1.12 Largest 30 files (excl noise)

Top 5:

| Size | File | Note |
|------|------|------|
| 42,249,805 | `logs/caddy/access.log` | **42 MB log, no rotation visible** |
| 364,535 | `frontend/dist/assets/PoultryDashboard-BtXUakBE.js` | Built bundle |
| 298,423 | `frontend/public/teivaka_logo.png` | Logo source |
| 298,423 | `frontend/dist/teivaka_logo.png` | Logo (built copy, dup) |
| 217,775 | `_archive/teivaka_api-prerebuild-20260429-100303.tar.gz` | Emergency archive |

Largest source files (signal of complexity hotspots → Phase 4):

| Size | File |
|------|------|
| 116,254 | `06_api_reference/openapi_spec.yaml` |
| 100,687 | `docs/TFOS_Platform_Interactive_Prototype.html` (visual contract) |
| 94,465 | `TFOS_Master_Build_Instruction.md` (1652-line authority doc) |
| 85,396 | `02_database/schema/02_tenant_schema.sql` |
| 71,374 | `03_backend/ENDPOINTS.md` |
| 71,300 | `03_backend/TIS_SPECIFICATION.md` |
| 69,919 | `01_architecture/API_DESIGN.md` |
| 69,159 | `07_testing/tests/test_tis.py` |
| 63,676 | `03_backend/AI_LAYER.md` |
| 63,237 | `11_application_code/app/workers/automation_worker.py` |
| 62,300 | `00_project_overview/BUSINESS_LOGIC.md` |
| 62,269 | `app/workers/automation_worker.py.bak-pre-strike-95` |
| 60,870 | `TFOS_BUILD_BLUEPRINT.md` |
| 60,595 | `02_database/schema/01_shared_schema.sql` |

`automation_worker.py` at 63 KB is a complexity hotspot. The fact that `automation_worker.py.bak-pre-strike-95` (62 KB) sits next to it in tracked-or-not state needs to be checked — these compound `.bak-pre-strike-95` files are tracked-vs-not anomalies.

`frontend/dist.old.1776163582/` appeared in this listing (`vendor-_428cKPg.js` at 163,839 bytes) — a never-cleaned old build directory. Sibling to `frontend/dist/`. → Phase 5 cleanup.

---

## 1.13 Symlinks

**None.** Clean.

---

## 1.14 Empty files

```
/opt/teivaka/11_application_code/app/core/__init__.py
/opt/teivaka/11_application_code/app/workers/__init__.py
/opt/teivaka/11_application_code/app/schemas/__init__.py
/opt/teivaka/11_application_code/app/tasks/__init__.py
/opt/teivaka/11_application_code/app/deps/__init__.py
```

Five Python package markers. Expected and correct.

---

## 1.15 Empty directories

```
/opt/teivaka/.claude/feedback
/opt/teivaka/.claude/handover
```

Two stub dirs in `.claude/` tooling state. Harmless.

---

## 1.16 Hidden entries at root

```
d  drwxr-xr-x  2026-05-08  /opt/teivaka/.git
d  drwxrwxrwx  2026-05-03  /opt/teivaka/.claude
f  -rw-r--r--  2026-05-06  /opt/teivaka/.gitignore
f  -rw-rw-r--  2026-05-02  /opt/teivaka/.9-1b-containers-before.txt
f  -rw-rw-r--  2026-05-02  /opt/teivaka/.9-1b-snapshot.txt
```

`.claude/` is 0777 — the same permissive habit visible elsewhere. The two `.9-1b-*` dotfiles are stale Phase 9.1b artifacts, untracked, harmless.

---

## 1.17 World-writable files

**~150 files at 0777 (rwxrwxrwx)**, all owned `tfos:tfos`. Includes:
- Source code (every router, every model, every worker, every page, every service)
- Schema SQL (`01_shared_schema.sql`, `02_tenant_schema.sql`, `04_seed_data.sql`)
- Config (`alembic.ini`, `package.json`, `vite.config.js`, `Dockerfile`, `docker-compose.yml`, `Caddyfile`)
- Knowledge base (`KB_SEED_ARTICLES.sql`, `FIJI_FARM_INTELLIGENCE.md`)
- API reference (`openapi_spec.yaml`)
- Tests (`test_tis.py`, `conftest.py`, all test_*.py)

This is **chmod -R 777 territory**, almost certainly the result of one or more permissive resets. Single-user droplet so it's not actively exploitable, but it's a bad-habit fingerprint and audit-chain hostile. → Phase 9 critical.

---

## 1.18 Non-tfos owned files (depth 3)

```
root:root  /opt/teivaka/_archive
root:root  /opt/teivaka/_archive/teivaka_api-prerebuild-20260429-100303.tar.gz
root:root  /opt/teivaka/_archive/teivaka_api-code-20260429-100525.tar.gz
root:root  /opt/teivaka/04_environment/.env.broken-20260429-recovery
root:root  /opt/teivaka/04_environment/.env.bak-20260429-065902
root:root  /opt/teivaka/docs/doctrine/TFOS_Agentic_TIS_Doctrine.md
```

**Six files owned root:root.** Five are directly traceable to the 2026-04-29 incident (`_archive/` tarballs + two `.env.bak/broken-2026-04-29*`). The sixth — `docs/doctrine/TFOS_Agentic_TIS_Doctrine.md` — is anomalous; root ownership of a doctrine markdown file suggests it was written via a privileged session. → Phase 9 ownership audit.

The two root-owned `.env.bak*` files are the most concerning: 5075 bytes each, 0600 perms, root-owned. They contain real secrets snapshotted under root identity from a broken state.

---

## 1.19 Secrets-shaped files

| Date | Perms | Owner | Size | Path |
|------|-------|-------|------|------|
| 2026-04-12 | 0777 | tfos:tfos | 4811 | `04_environment/.env.prototype` |
| 2026-04-13 | 0755 | tfos:tfos | 5005 | `_archive/.env.prototype.filled.archived-20260429-082943` |
| 2026-04-14 | 0644 | tfos:tfos | 99 | `frontend/.env.production` (likely just `VITE_API_URL`) |
| 2026-04-20 | 0777 | tfos:tfos | 16793 | `04_environment/.env.example` |
| 2026-04-29 | **0600** | **root:root** | 5075 | `04_environment/.env.bak-20260429-065902` |
| 2026-04-29 | **0600** | **root:root** | 5075 | `04_environment/.env.broken-20260429-recovery` |
| 2026-05-03 | 0600 | tfos:tfos | 5075 | `04_environment/.env` (current, correct) |

The current `.env` is right (tfos-owned, 0600). The two **root-owned secrets snapshots from the 2026-04-29 incident still exist on disk** — should be deleted or moved to encrypted offline storage. The `.env.example` at 0777 (world-writable, 16 KB) is also a smell — examples with broad perms aren't a leak per se, but the perms scream "we ran chmod 777 broadly". → Phase 9.

`_archive/.env.prototype.filled.archived-*` is a "filled" prototype (real secrets) preserved under `_archive/`. Owned tfos but at 0755 (world-readable). Real-secrets file with world-readable perms is a leak class. → Phase 9 critical.

---

## 1.20 Strike archive inventory

23 entries in `00_project_overview/strikes/`:

```
README.md
strike_86_architect_latency_hiding.md
strike_87_pillar_parallelism_conditional.md
strike_88_post_amend_sha_drift.md
strike_89_advisory_mode_strike_drift.md
strike_90_filesystem_assumption_verification.md
strike_91_paste_pack_injection_sentinels.md
strike_92_phase_complete_user_reachable_gate.md
strike_93_b63_cluster_a.md
strike_94_droplet_resize.md
strike_95_silent_worker_outages.md
strike_96_crops_b2_backend.md
strike_97_crops_frontend_unlock.md
strike_98_vertical_completeness_doctrine.md
strike_99_cycle_dropdown_label_path_b.md          ← TWO strike-99 files
strike_99_cycle_dropdown_label_unification.md     ← ↑
strike_100_three_dropdown_crops_form.md
strike_101_three_layer_farming_doctrine.md
strike_102_full_varieties_catalog_BACKLOG.md
strike_103_layer_enum_schema.md
strike_104a_three_layer_backfill_banner.md
strike_105_logo_deployment.md
strike_110_116_decision_engine_cascade.md         ← cluster (replaces 110-114)
```

**Coverage:** strikes #86-105 archived individually; #106-109 absent (likely doc-only, no individual archive); #110-116 covered by cluster archive.

**Anomaly:** Two #99 files (`_path_b.md` + `_unification.md`) — one is the original, one a follow-up. Acceptable per cluster-archive doctrine but worth noting.

**Anomaly:** `#102` filename has `_BACKLOG` suffix — strike that was filed but deferred. Naming convention not used elsewhere; could become a pattern.

**Strikes 1-85** documented only inside CLAUDE.md (per selective-archive doctrine — strikes 1-85 = pre-Sprint-7 process). Brief stated `**Strikes filed: 1-116** (65 process upgrades across Sprint 6 + 7)` — confirmed against archive.

---

## 1.21 Root-level loose files

29 root-level files. Categorisation:

| Category | Count | Notes |
|----------|-------|-------|
| `CLAUDE.md*` (current + .bak) | 17 | The .bak proliferation lives entirely at root |
| TFOS_* doctrine | 6 | BUILD_BLUEPRINT, Master_Build_Instruction, Catalog_Redesign_Doctrine (×2 + 1.bak), Vertical_Completeness_Doctrine |
| Phase-9.1b dotfiles | 2 | `.9-1b-snapshot.txt`, `.9-1b-containers-before.txt` |
| Other | 4 | `day_3a_standard_shell_spec.md`, `.gitignore`, MD doctrine amendment .bak |

**The 17 CLAUDE.md.bak* files are the dominant root noise.** All untracked. Combined ~498 KB. They form a tar-pit at the project root.

**Recommend:** create `_backups/CLAUDE.md/` and move them all there (Phase 10).

---

## 1.22 Noise footprint

```
node_modules         150M
.venv                  ─    (none — backend lives in containers)
.git                  12M
__pycache__            ─    (no host-level cache; containers handle this)
frontend/dist        2.1M
build/ (within node_modules)  ~7M
.next                  ─    (not Next.js)
.cache                 ─
```

Backend has no host-level `.venv` — interpreted within `teivaka_api` container. Clean separation. node_modules at 150 M is normal (Vite + React + Tailwind + Redux + Tanstack + lucide-react alone = 29 M).

**`frontend/dist.old.1776163582/`** appeared in section 1.12 (vendor bundle 163 KB) — an old build directory the build process didn't clean up. → Phase 5 cleanup.

---

## 1.23 Root-level dotfile / config inventory

32 config files identified. Highlights:

| File | Status |
|------|--------|
| `04_environment/docker-compose.yml` | **Active** — 16,863 bytes, 2026-05-07 |
| `04_environment/Caddyfile` | **Active** — 13,049 bytes, 2026-05-02 |
| `04_environment/.env` | Active (tfos:tfos 0600, 2026-05-03) |
| `11_application_code/requirements.txt` | Active — 6,383 bytes, 2026-05-02 |
| `11_application_code/Makefile` | 7,135 bytes, 2026-04-08 (likely stale) |
| `11_application_code/alembic.ini` | 660 bytes, 2026-04-07 |
| `frontend/package.json` | 777 bytes, 2026-05-02 |
| `frontend/package-lock.json` | 108,489 bytes, 2026-05-02 |

**Backup/stale config files (clutter):**
- `Caddyfile.production.bak.1776144814`
- `Caddyfile.production.bak-pre-9-1`
- `Caddyfile.production.bak-pre-9-3`
- `Caddyfile.bak-pre-9-1`
- `docker-compose.yml.bak-pre-9-1b`
- `docker-compose.yml.bak-pre-8-2b`
- `docker-compose.yml.bak-pre-strike-95`
- `docker-compose.yml.bak-pre-celery-fix`

8 backup config files in `04_environment/`. Same snapshot habit as CLAUDE.md.

**Two requirements files in `11_application_code/`:**
- `requirements.txt` (6,383 bytes, 2026-05-02)
- `requirements-api.txt` (1,035 bytes, 2026-05-02)
- `requirements-dev.txt` (384 bytes, 2026-04-15)

→ Phase 7 needs to disambiguate which is authoritative for the API container.

**`04_environment/requirements.txt`** (5,990 bytes, 2026-04-12) duplicates `11_application_code/requirements.txt`. Same name, different paths, different sizes — **two requirements files claiming truth**. → Phase 7 critical.

---

## 1.24 Cross-cutting findings

### Strike #91 surface anomalies (forwarded to later phases)

| # | Finding | → Phase |
|---|---------|---------|
| A | 282-file disk-vs-git drift (62% over tracked); ~80 `.bak-pre-*` files scattered tree-wide | 10 |
| B | Numeric-prefix collision: `04_environment/` + `04_execution/` | 10 |
| C | `_archive/` is root:root with two untracked tar.gz archives | 9 + 10 |
| D | Six root-owned files in tree (1 doctrine .md + 5 from 2026-04-29 incident) | 9 |
| E | Two `.env.bak*` files at 0600 root:root contain real secrets snapshots from 2026-04-29 | 9 critical |
| F | `.env.example` at 0777 (16 KB, world-writable); `_archive/.env.prototype.filled.*` at 0755 (real secrets, world-readable) | 9 critical |
| G | ~150 source/config files at 0777 (chmod -R 777 fingerprint) | 9 |
| H | `06_api_reference/openapi_spec.yaml` (116 KB) last touched 2026-04-07 → almost certainly drifted from current routers | 4 |
| I | `07_testing/` last touched 2026-04-21 — Decision Engine restoration cluster #110-116 produced **no test changes** | 4 + 7 |
| J | `frontend/dist.old.1776163582/` never cleaned up | 5 + 10 |
| K | `automation_worker.py.bak-pre-strike-95` (62 KB) on disk next to live worker — track-state must be confirmed | 4 |
| L | Two `requirements.txt` paths (`04_environment/` + `11_application_code/`) plus `requirements-api.txt` + `requirements-dev.txt` | 7 critical |
| M | 8 backup config files in `04_environment/` (Caddyfile + docker-compose .bak proliferation) | 6 + 10 |
| N | Caddy access.log = 42 MB, no rotation observable from filesystem alone | 6 |
| O | 17 `CLAUDE.md.bak*` at root, all untracked, ~498 KB combined | 10 |
| P | Doc-sync's `git status \| grep -v "\.bak"` filter hides 2 untracked `.bak` items per run | 10 doctrine |

### Audit-chain hostile signals

Three observations bear directly on the hash-chained audit ledger story (the byproduct, not the moat — but it must hold):

1. **`chmod -R 777`** of source files (1.17) means tampering at rest leaves no permission anomaly to detect.
2. **Root-owned files** in `_archive/` and `04_environment/` mean two ownership identities have written to the tree — `tfos` AND `root`. Audit chain integrity verification has to account for this.
3. **`.env.broken-*` and `.env.bak-*`** containing real secret material at 0600 root:root persist on disk → secrets-handling discipline broken at one point.

---

## Recon parameters and provenance

- **Recon command:** `bash /tmp/phase1_recon.sh 2>&1`
- **Output captured to:** transient (saved to Claude Code tool-results path during synthesis)
- **Read-only verified:** no `>`, `mv`, `rm`, `-delete`, `chmod`, `chown` in script body
- **Noise pruned in counts:** `node_modules/`, `.git/`, `__pycache__/`, `.venv/`, `dist/`, `build/`
- **Noise footprint counted separately** in 1.22

---

## Handoffs

- **Phase 2** (git history): cross-check the 282-file drift against `git log --diff-filter=A` to identify which untracked files were ever committed.
- **Phase 3** (database): unrelated to filesystem, but verify alembic migrations 011-075 actually exist on disk under `11_application_code/alembic/versions/` (recon hit perms-filtered subset).
- **Phase 4** (backend): cross-check `06_api_reference/openapi_spec.yaml` against `app/routers/` actuals — drift expected.
- **Phase 5** (frontend): clean `frontend/dist.old.1776163582/` after confirming non-current.
- **Phase 6** (infrastructure): caddy log rotation, 8 backup config files in `04_environment/`.
- **Phase 7** (deps): resolve which `requirements.txt` is authoritative for `teivaka_api` container.
- **Phase 9** (security): all 0777 perms, root-owned files, secrets-shaped files at world-readable perms.
- **Phase 10** (synthesis): bake findings A, B, C, J, L, M, O, P into the cleanup register.

---

**Phase 1 complete.** No mutations to repo state during recon. File written 2026-05-08 02:00 UTC.
