# TFOS PARALLEL EXECUTION DOCTRINE
## How to run multiple Architect chats and Claude Code terminals on the same production system without collision

**Authority:** Uraia Koroi Kama (Cody / Boss), Founder, Teivaka PTE LTD
**Created:** 2026-05-04 (Fiji time)
**Status:** Binding on every parallel build session — both Architect chats AND every Claude Code terminal.
**Read this entire document before opening a second concurrent build chat.**

---

## 0. THE ONE-PARAGRAPH SUMMARY

TFOS is built primarily by one Operator (Cody), one Architect (Cowork chat), one Execution Engine (Claude Code on prod). Parallel execution unlocks a second Architect chat + a second Claude Code terminal working on a *different lane* of the codebase concurrently, to compress calendar time on independent build streams. **Parallel execution is dangerous. It is allowed only when lanes are pre-assigned, guardrails are honored, and the Operator commits to the coordination overhead.** This doctrine defines the rules. Violating any rule below is treated as a Strike-class drift event and the chat is paused until reconciled.

---

## 1. WHEN PARALLEL IS ALLOWED — AND WHEN IT IS NOT

### 1.1 Allowed conditions (all must be true)

A second concurrent Architect chat may be opened only when:

1. **The two lanes are independent.** They touch different schemas, different page modules, different API namespaces, different migrations. If lanes share even one shared file as a *write target*, they are not independent.
2. **A lane assignment exists in writing.** Section 4 below is filled in for both lanes before the second chat sends its first paste pack.
3. **The Operator has 30+ minutes/day of coordination headspace.** Parallel costs Operator attention. If the Operator is sleep-deprived, in a crisis, or single-tasking, parallel makes things worse, not better.
4. **The current Alembic head is known and stable.** Both chats start from the same known commit and known migration head. Drift between chats begins from a verified shared baseline.
5. **No production-down situation is in flight.** Parallel during a hotfix multiplies the blast radius. If anything is broken on prod, serialize until green.

### 1.2 Forbidden conditions (any one is enough to forbid parallel)

Parallel is **forbidden** when:

- ❌ Two lanes both need to edit `App.jsx` route topology (not appending — reshaping).
- ❌ Two lanes both need to write to `shared.naming_dictionary` simultaneously (read is fine; write is not).
- ❌ Two lanes both need to ship a migration that touches the same table.
- ❌ Two lanes both need to modify `BottomNav.jsx` or `TopAppBar.jsx` or `FarmerShell.jsx` (sacred shell files — Section 7 of `CLAUDE.md`).
- ❌ A migration is in flight on either lane and not yet verified as `alembic upgrade head` complete.
- ❌ The Operator is the only person at the keyboard and must context-switch faster than once per 5 minutes — that's a ticket to pasting the wrong pack into the wrong terminal.
- ❌ There is no internet stability on the Operator's side (parallel needs reliable connection to both teivaka.com and both chat sessions).

### 1.3 The parallel readiness checklist

Before opening the second chat, the Operator runs through this 7-question checklist out loud:

1. Have I named the two lanes? (e.g., "POULTRY pillar" + "Classroom pillar")
2. Have I assigned migration ranges to each lane? (Section 4)
3. Have I assigned file/directory ownership to each lane? (Section 5)
4. Have I assigned branch names to each lane? (Section 6)
5. Have I committed to writing this doctrine's lane table into a session file? (Section 11)
6. Am I willing to spend 30 min/day on coordination overhead?
7. Is production currently green?

**Any "no" → parallel is not allowed. Serialize the work.**

---

## 2. THE COLLISION VECTORS — WHAT WE ARE PREVENTING

Parallel execution can fail in seven specific ways. Every rule in this doctrine traces back to preventing one of these.

### 2.1 Migration head fork

Two chats both run `alembic revision --autogenerate -m "..."` from the same parent. Two migration files are created with `down_revision = <same-id>`. Alembic's `upgrade head` will fail or, worse, `heads` will list two heads. Resolution requires `alembic merge`, which is doable but requires hand-walking the schema and is a 1–2 hour debug.

**Prevented by:** Section 4 (migration lane ranges).

### 2.2 Schema collision on shared tables

Both lanes need to add columns to the same table (e.g., both want columns on `shared.event_type_catalog`). Even if migration heads don't fork, the second migration depends on a state of the table the first migration created. If both are written in parallel without sync, the second one is wrong.

**Prevented by:** Section 4 (table ownership) + Section 9 (sync points).

### 2.3 Naming dictionary write race

Both lanes append rows to `shared.naming_dictionary` seed file. The two seed files are committed independently. The merge eats one batch silently because the file ordering looks valid in both diffs but produces duplicate keys at runtime.

**Prevented by:** Section 5.4 (naming dictionary append zones).

### 2.4 Shell file reshape

Both lanes touch `App.jsx`, `BottomNav.jsx`, `LeftRail.jsx`, or `FarmerShell.jsx`. Even appending routes can collide if two lanes append to the same array in the same line range. Worse, if one lane reshapes the route topology (e.g., moves Classroom under a `/learn` namespace), the other lane's deep links break.

**Prevented by:** Section 5.2 (shell file rules — additive only, append-at-end pattern).

### 2.5 Naming dictionary read drift

Lane A renders a string with `name('eggs_collected')`. Lane B (POULTRY) commits a dictionary update changing `'eggs_collected'` to `'egg_collection'`. Lane A's components break in production and the failure surfaces hours later when the Operator visits the Classroom page.

**Prevented by:** Section 5.4 (naming key namespace prefix per lane).

### 2.6 Operator paste pack misrouting

Operator has two terminals open: terminal-1 connected to prod for POULTRY work, terminal-2 connected to prod for Classroom work. Both terminals look identical at 2am. The Operator pastes the Classroom paste pack into terminal-1. Migration 100 runs on the wrong context, or worse, runs at the right time but the Operator believed it was POULTRY work and so doesn't verify Classroom UI.

**Prevented by:** Section 8 (terminal labelling protocol) + Section 10 (paste pack header tags).

### 2.7 Memory drift between Architect chats

Architect A learns something new about prod state mid-session ("Celery worker is unhealthy on this cycle"). Architect B does not have that context and ships a paste pack assuming Celery works. The bug surfaces only when Architect B's feature is exercised under load.

**Prevented by:** Section 11 (sync handover protocol — every 90 min or every commit, whichever first).

---

## 3. THE THREE ROLES IN PARALLEL MODE

The role architecture from `CLAUDE.md` Section 1 is preserved. Parallel adds a fourth invisible role:

| Role | Person/System | Job in parallel mode |
|---|---|---|
| **Operator** | Cody (Boss) | Sets intent for both lanes. Approves both gates. **Owns coordination.** **The single source of truth that two lanes don't collide.** |
| **Architect A** | Chat 1 (e.g., POULTRY) | Recon, design, paste-pack drafting for Lane A only. Forbidden from advising on Lane B's work. |
| **Architect B** | Chat 2 (e.g., Classroom) | Recon, design, paste-pack drafting for Lane B only. Forbidden from advising on Lane A's work. |
| **Execution Engine A** | Claude Code terminal-1 | Silent executor for Lane A. Runs only paste packs tagged `LANE: A`. |
| **Execution Engine B** | Claude Code terminal-2 | Silent executor for Lane B. Runs only paste packs tagged `LANE: B`. |
| **Coordinator** | The Operator (acting as their own coordinator) | Lane assignment, sync handover scheduling, conflict resolution, kill-switch authority. |

**Critical:** No Architect ever gives advice or paste packs about the other lane. If Architect B asks "what's POULTRY doing?", the answer is "I don't know — the Operator is the only sync point." This is by design. Cross-lane chatter is collision risk.

---

## 4. THE LANE ASSIGNMENT TABLE (filled in per parallel session)

Before the second chat sends a single paste pack, this table is filled in by the Operator and pasted into both Architect chats.

### Template

```
PARALLEL SESSION — LANE ASSIGNMENT
Created: <YYYY-MM-DD HH:MM Fiji time>
Active until: <YYYY-MM-DD or "until either lane completes">
Operator: Cody

LANE A — <name, e.g. POULTRY pillar Phase 6.3>
  Architect chat: <chat-id or descriptive label>
  Claude Code terminal: terminal-1 (label: "POULTRY")
  Branch: feature/<branch-name>
  Migration range: <e.g., 066–099>
  Owned schemas:
    - shared.poultry_*
    - tenant.poultry_*
    - shared.event_type_catalog (POULTRY rows only)
  Owned page directories:
    - src/pages/farmer/poultry/*
    - src/components/poultry/*
  Owned API namespaces:
    - /api/v1/poultry/*
  Naming dictionary key prefix: poultry_*
  Forbidden files (cannot edit):
    - src/pages/farmer/classroom/*
    - shared.classroom_* schemas
    - migrations 100-149

LANE B — <name, e.g. Classroom pillar prototype-match>
  Architect chat: <chat-id or descriptive label>
  Claude Code terminal: terminal-2 (label: "CLASSROOM")
  Branch: feature/<branch-name>
  Migration range: <e.g., 100–149>
  Owned schemas:
    - shared.classroom_*
    - shared.crop_guide_pages
    - learning.*
  Owned page directories:
    - src/pages/farmer/classroom/*
    - src/components/classroom/*
  Owned API namespaces:
    - /api/v1/classroom/*
    - /api/v1/learning/*
  Naming dictionary key prefix: classroom_*, learn_*
  Forbidden files (cannot edit):
    - src/pages/farmer/poultry/*
    - shared.poultry_* schemas
    - migrations 066-099

SHARED FILES (both lanes may edit, with discipline per Section 5.2):
  - src/App.jsx (route registration — additive only, append at end)
  - src/components/nav/LeftRail.jsx (sub-nav — additive only, append at end of pillar's array)
  - src/lib/naming.ts (naming.json build artifact — generated, never hand-edited)

KILL SWITCH OWNER: Operator. Either chat may invoke "PAUSE PARALLEL" if a collision risk emerges.

SYNC HANDOVER SCHEDULE: Every 90 minutes OR after every commit, whichever first.
```

### 4.1 Migration range assignment rules

- Migration ranges are non-overlapping integer windows of 30+ slots each.
- Lane A starts at the next available slot after current Alembic head.
- Lane B starts at Lane A's range end + 1.
- Future lanes (rare) follow the same pattern.
- Skipping migration numbers is acceptable. Alembic does not require sequential integers.
- A lane never re-numbers a migration mid-build. If a lane runs out of its range, it stops and requests a new range from the Operator.

### 4.2 Schema ownership rules

- Each schema (`shared.classroom_*`, `tenant.poultry_*`, etc.) is owned by exactly one lane during the parallel session.
- A schema owned by Lane A is **read-only** for Lane B.
- A lane may add foreign key references to the other lane's schemas if needed, but cannot add columns, alter constraints, or drop objects in the other lane's schemas.
- Cross-lane schema dependencies (Lane B FK referencing Lane A table) require sync handover sign-off before the migration ships.

### 4.3 Shared schema rules (one table, multiple lanes)

Some tables are shared by design — `shared.event_type_catalog`, `shared.naming_dictionary`, `audit.events`. The rule:

- **Both lanes may INSERT rows.**
- **Neither lane may ALTER the table structure** during parallel session.
- If structure must change, parallel is **paused**, the structure change ships solo, parallel resumes.

For these shared tables, lanes coordinate on a row-namespace prefix:

| Shared table | Lane A namespace | Lane B namespace |
|---|---|---|
| `shared.event_type_catalog` | `event_type_code` starts with `POULTRY_*` | `event_type_code` starts with `CLASSROOM_*` (rare — Classroom is read-mostly) |
| `shared.naming_dictionary` | `concept_key` starts with `poultry_*` | `concept_key` starts with `classroom_*` or `learn_*` |
| `audit.events` | All lanes write — this is fine, append-only by design |

---

## 5. FILE AND DIRECTORY OWNERSHIP

### 5.1 Owned directories — exclusive

Each lane owns its page module directory and its component subdirectory exclusively. Examples:

- POULTRY lane owns: `src/pages/farmer/poultry/*`, `src/components/poultry/*`, `app/api/v1/poultry/*`, `app/models/poultry.py`
- Classroom lane owns: `src/pages/farmer/classroom/*`, `src/components/classroom/*`, `app/api/v1/classroom/*`, `app/models/classroom.py`

Other lane MUST NOT touch these files. Period.

### 5.2 Shared files — additive-append discipline

Some files cannot be cleanly split: `App.jsx`, `LeftRail.jsx`, naming dictionary seed scripts, route generators. These are **shared**. The rule:

- **Append-only.** Both lanes append their entries to the bottom of the relevant array/list.
- **Never reshape.** No reordering existing entries, no renaming existing exports, no extracting common patterns into a new abstraction. Reshaping is a serialization-level change and must be done outside parallel.
- **Visible diff.** Each lane's append section is bracketed by comments:
  ```jsx
  // ===== POULTRY LANE — Phase 6.3 =====
  <Route path="/farmer/poultry/eggs" element={<PoultryEggs />} />
  // ===== END POULTRY LANE =====

  // ===== CLASSROOM LANE — prototype-match =====
  <Route path="/classroom" element={<ClassroomOverview />} />
  // ===== END CLASSROOM LANE =====
  ```
- **Merge conflicts on append:** rare but possible if both lanes append to the same line range. Resolution: lane that pushed second rebases. No exceptions.

### 5.3 Sacred shell files — frozen during parallel

Per `CLAUDE.md` Section 7, these files are sacred and require explicit Operator approval to modify even in serial mode. **In parallel mode, they are frozen — neither lane may touch them under any condition.**

- `TFOS_MyFarm_Prototype_v263_20260608.html`
- `Landing.jsx`, `Login.jsx`, `Register.jsx`, `VerifyEmail.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`
- `pages/farmer/TIS.jsx`
- `components/nav/BottomNav.jsx`, `components/nav/TopAppBar.jsx`
- `layouts/FarmerShell.jsx`, `pages/farmer/FarmDashboard.jsx`, `pages/farmer/HarvestNew.jsx`
- `Caddyfile.production`, `/opt/tis-bridge/server.js`, OpenClaw `tis` systemd unit
- `robots.txt`, `sitemap.xml`, `index.html` SEO meta tags

If a lane needs to modify a sacred file, the Operator pauses parallel, ships the change solo, then resumes parallel.

### 5.4 Naming dictionary — append zones with key prefix

The naming dictionary is the highest-write-frequency shared file. To prevent collision:

1. The seed file is structured into named sections, one per lane.
   ```typescript
   export const NAMING_DICTIONARY: NamingEntry[] = [
     // ===== CORE — pre-parallel baseline =====
     { concept_key: 'farm', universal_name: 'Farm', forms: {...} },
     // ===== END CORE =====

     // ===== POULTRY LANE =====
     { concept_key: 'poultry_egg_collected', universal_name: 'Eggs collected', ... },
     // ===== END POULTRY LANE =====

     // ===== CLASSROOM LANE =====
     { concept_key: 'classroom_track', universal_name: 'Learning track', ... },
     // ===== END CLASSROOM LANE =====
   ];
   ```
2. Each lane only appends within its named section.
3. Each lane prefixes its `concept_key` with its lane prefix (`poultry_*`, `classroom_*`, `learn_*`).
4. Cross-lane key reuse is forbidden during parallel. If POULTRY needs `weight_check` and LIVESTOCK might also need `weight_check` later, POULTRY uses `poultry_weight_check`. Generic `weight_check` is reserved for serial-mode consolidation.
5. After parallel session ends, the Operator may run a serialize-mode "dictionary consolidation" pass to extract common keys.

---

## 6. BRANCH STRATEGY

### 6.1 Branch naming

Each lane works on its own `feature/*` branch. Branch names follow:

- `feature/<lane-name>-<phase-or-milestone>`
- Examples: `feature/poultry-phase-6-3`, `feature/classroom-prototype-match`

### 6.2 Branch creation point

Both lanes branch from the same parent commit (the current `main` head OR the current shared feature branch like `feature/option-3-plus-nav-v2-1`). The shared parent is recorded in the lane assignment table.

### 6.3 Forbidden branch operations during parallel

- ❌ Neither lane merges to `main` during parallel.
- ❌ Neither lane rebases the other lane's branch.
- ❌ Neither lane cherry-picks from the other lane's branch.
- ❌ Neither lane force-pushes to a shared branch.

### 6.4 Allowed branch operations

- ✅ Each lane commits and pushes to its own `feature/*` freely.
- ✅ Each lane may pull from `main` to its own branch if needed (e.g., a hotfix landed on main during parallel — both lanes pull).
- ✅ At parallel session end, lanes are merged sequentially: Lane A → main, then Lane B rebases on main, then Lane B → main.

---

## 7. COMMIT MESSAGE PROTOCOL

Every commit during parallel session ends with a lane tag line:

```
<commit message body>

PARALLEL-LANE: <lane-name> (migrations <range>, files <directory-glob>, no shared schema writes)
```

Examples:

```
Phase 6.3-FIX-B: POULTRY tiles grouped by daily_priority_score

Implements UI grouping pattern 1 per Sprint 6.3 plan. Tiles now sort by
shared.event_type_catalog.daily_priority_score DESC within each group.

PARALLEL-LANE: poultry (migrations 066-099, files src/pages/farmer/poultry/*, no shared schema writes)
```

```
Classroom Phase 1: Migration 100 schema + Overview page wired

Creates shared.classroom_tracks, shared.classroom_modules,
shared.classroom_lessons. Seeds 6 starter tracks. Renders /classroom
overview matching prototype.

PARALLEL-LANE: classroom (migrations 100-149, files src/pages/farmer/classroom/*, no shared schema writes)
```

The lane tag is **machine-greppable**. After parallel session ends, the Operator runs:

```bash
git log --grep="PARALLEL-LANE: poultry" --oneline
git log --grep="PARALLEL-LANE: classroom" --oneline
```

To audit which commits belonged to which lane, useful when debugging post-merge regressions.

---

## 8. TERMINAL LABELLING PROTOCOL

The Operator runs two Claude Code terminals concurrently. Misrouting a paste pack between terminals is a collision-class risk (see Section 2.6).

### 8.1 Visual differentiation rules

The Operator MUST configure each terminal with visual differentiation that is impossible to miss at 2am:

1. **Background color.** Terminal 1 (POULTRY) → dark blue background. Terminal 2 (CLASSROOM) → dark green background. (Or any two distinct colors. The point is they are not both black.)
2. **Window title.** Each terminal's window title bar shows `[POULTRY]` or `[CLASSROOM]` prominently.
3. **Shell prompt.** Each terminal's shell prompt is configured with a colored prefix:
   ```
   [POULTRY]$ <command>
   [CLASSROOM]$ <command>
   ```
   On bash/zsh, edit the `PS1` to include the lane name in a high-contrast color.
4. **Physical screen position.** If using two monitors: POULTRY always on left monitor, CLASSROOM always on right. Single monitor: POULTRY always on top half, CLASSROOM always on bottom half. **Never swap.**

### 8.2 Pre-paste verification ritual

Before pasting any paste pack into a terminal, the Operator runs this 3-second check:

1. Look at the window title bar. Read the lane name.
2. Look at the paste pack header (Section 10). Read the lane name.
3. Confirm they match. If they do not match — STOP. Do not paste.

This is a 3-second discipline. It prevents the most common parallel collision in human-AI workflows.

---

## 9. SYNC HANDOVER PROTOCOL

Architects in parallel can drift on shared state (e.g., one chat learns prod is degraded, the other doesn't). Sync handovers prevent this.

### 9.1 When to sync

The Operator triggers a sync handover at the **earliest** of:

- Every 90 minutes of active parallel work.
- After every commit on either lane.
- After every migration runs on either lane.
- When the Operator notices something on prod that affects both lanes (e.g., Caddy restart, droplet resource warning).
- Immediately, if either Architect's response surprises the Operator.

### 9.2 Sync handover format

The Operator pastes this template into both chats simultaneously:

```
=== SYNC HANDOVER ===
Time: <YYYY-MM-DD HH:MM Fiji>

LANE A (<name>) status:
  Last commit: <hash>
  Last migration: <number>
  Currently working on: <one-sentence>
  Blockers: <if any>

LANE B (<name>) status:
  Last commit: <hash>
  Last migration: <number>
  Currently working on: <one-sentence>
  Blockers: <if any>

PROD STATE:
  Containers: <healthy / degraded list>
  Alembic head: <number>
  Last platform check pass: <commit-hash>

OPERATOR NOTE: <anything either chat needs to know>
=== END SYNC ===
```

Both Architects acknowledge the sync explicitly before resuming work:

> 🟢 Sync received. Lane B (Classroom) acknowledges Lane A's commit on POULTRY tiles. Resuming Migration 101 paste pack.

If an Architect does NOT acknowledge, the Operator pauses parallel until they do.

---

## 10. PASTE PACK HEADER PROTOCOL

Every paste pack the Architect emits during parallel mode carries a 4-line header. Without this header, the Operator does not paste.

```
═══════════════════════════════════════════════════
LANE: <CLASSROOM | POULTRY | other>
TERMINAL: <terminal-1 | terminal-2>
SCOPE: <single-sentence describing what this paste pack does>
EXPECTED OUTPUT: <one-line of what success looks like>
═══════════════════════════════════════════════════
```

Example:

```
═══════════════════════════════════════════════════
LANE: CLASSROOM
TERMINAL: terminal-2
SCOPE: Migration 100 — create shared.classroom_tracks + shared.classroom_modules + shared.classroom_lessons
EXPECTED OUTPUT: alembic upgrade head returns "100_classroom_schema" with no errors. \d shared.classroom_tracks shows 9 columns.
═══════════════════════════════════════════════════

# (paste pack body follows)
```

The Operator's pre-paste ritual (Section 8.2) checks this header against the terminal label. Match → paste. Mismatch → STOP.

---

## 11. THE LANE LOG (session-level audit trail)

For every parallel session, the Operator maintains a single markdown file that is the source of truth for what each lane is doing in real time.

### 11.1 File location

```
/opt/teivaka/parallel_sessions/<YYYY-MM-DD>_<session-name>.md
```

Examples:
- `/opt/teivaka/parallel_sessions/2026-05-04_poultry_classroom.md`

### 11.2 File contents

The file follows the lane assignment template from Section 4 plus a running log:

```markdown
# Parallel Session: 2026-05-04 — POULTRY + Classroom

## Lane assignment
<paste from Section 4 template>

## Running log

### 14:30 Fiji — Session opened
- Operator: Cody
- Lane A Architect: Cowork chat #1 (POULTRY)
- Lane B Architect: Cowork chat #2 (Classroom)
- Starting Alembic head: 065_weight_check_to_poultry
- Starting commit: ce4e8fa

### 14:45 — Lane A paste pack 1 sent (Phase 6.3-FIX-B)
- Terminal: terminal-1
- Header: LANE: POULTRY
- Outcome: 🟢 success, commit a8b9c0d

### 15:10 — Lane B paste pack 1 sent (Migration 100)
- Terminal: terminal-2
- Header: LANE: CLASSROOM
- Outcome: 🟢 success, Alembic head now 100_classroom_schema, commit f1e2d3c

### 16:00 — SYNC HANDOVER #1
- Both lanes confirmed acknowledgment

### ...
```

### 11.3 Why this file matters

If parallel breaks (production goes red, a migration corrupts something, the Operator gets confused), this file is the forensic evidence. Without it, you cannot reconstruct who did what when.

The file is committed to the canonical project repo at session end:

```
docs/parallel_sessions/2026-05-04_poultry_classroom.md
```

This becomes part of the project audit trail forever.

---

## 12. THE KILL SWITCH

Parallel can fail. When it does, the Operator (or either Architect, who flags to Operator) invokes the kill switch.

### 12.1 Kill switch triggers

Any one of these triggers a mandatory pause of parallel:

1. **Migration head conflict detected** (`alembic heads` shows >1 head).
2. **Either lane's branch fails to build** (TypeScript errors, Vite build fails).
3. **Production health degrades** (any container moves to unhealthy on either lane's deploy).
4. **Shell file edit detected on either branch** (sacred files per Section 5.3).
5. **Naming dictionary conflict** (duplicate `concept_key` on rebase or merge).
6. **The Operator pastes the wrong pack into the wrong terminal even once.** (One mistake = pause. Don't wait for the second.)
7. **Either Architect produces output that contradicts the lane assignment.**

### 12.2 Kill switch invocation

The Operator types in both chats:

```
🔴 KILL SWITCH — PAUSE PARALLEL
Reason: <one sentence>
Last safe commit on Lane A: <hash>
Last safe commit on Lane B: <hash>
Both Architects: stop work, do not emit further paste packs until I resume.
```

Both Architects acknowledge:

```
🔴 PARALLEL PAUSED ON LANE A. Last safe commit: <hash>. Standing by for Operator to resolve and re-authorize parallel.
```

### 12.3 Resolution

After kill switch:

1. **Operator diagnoses the cause** (re-reads relevant section of this doctrine).
2. **One lane is chosen as canonical** (usually the one furthest along).
3. **The other lane rebases or rolls back** to a state compatible with the canonical lane.
4. **Operator decides whether to re-enter parallel or serialize.** If the same root cause could recur, serialize.

### 12.4 Re-entering parallel after a kill switch

Re-entry requires the Operator to:

1. Update the lane assignment table with whatever changed.
2. Sync both Architects on the new state.
3. Re-run the parallel readiness checklist (Section 1.3).
4. Send `🟢 PARALLEL RESUMED` to both chats with the updated lane assignment.

---

## 13. END-OF-SESSION MERGE PROTOCOL

Parallel sessions end either by completion (both lanes finished) or by Operator decision (e.g., one lane needs more time, the other is done — finish that one and serialize the rest).

### 13.1 Sequential merge (one lane at a time)

- The first lane to merge runs the standard Six-Step Cadence (Section 9 of `CLAUDE.md`): Recon → Build → Verify → Commit → Platform Check → Next Phase Decision. Then merges feature branch to main.
- The second lane rebases its feature branch on the new main, resolves any merge conflicts (rare if Sections 4–6 were honored), runs the Six-Step Cadence, and merges.
- The Lane Log file (Section 11) is committed to `docs/parallel_sessions/` on the second merge.

### 13.2 Forbidden merge operations

- ❌ Merging both lanes simultaneously.
- ❌ Merging without running Platform Check on each lane.
- ❌ Skipping Lane Log file commit.

---

## 14. THE OPERATOR'S COORDINATION JOB

In parallel mode, the Operator's role expands. The Operator commits to:

### 14.1 Coordination tasks (the 30-minute/day overhead)

- Maintain the Lane Log file (Section 11) — append every paste, every commit, every sync.
- Run sync handovers at the cadence in Section 9.1.
- Verify terminal labelling before every paste (Section 8.2).
- Watch for collision risks across both chats — Architects do not see each other's work.
- Keep the lane assignment table current. If a lane needs scope expansion, update the table before authorizing.

### 14.2 Authority preserved

- Operator is the only entity that can modify the lane assignment.
- Operator is the only entity that can invoke the kill switch.
- Operator is the only entity that can authorize parallel re-entry after a kill switch.
- Operator is the only entity that can authorize a lane to touch a sacred shell file (Section 5.3) — and doing so requires pausing parallel.

### 14.3 What the Operator does NOT do

- Operator does not relay messages between Architects. (That's a sync handover, formal, with timestamps.)
- Operator does not let either Architect "advise" on the other's lane. ("Hey what does POULTRY think we should do about X?" — forbidden. POULTRY is not in this chat. Their advice is not in scope.)
- Operator does not skip the Lane Log entries to "save time." The log is the audit trail.

---

## 15. WHEN TO STOP DOING PARALLEL

Parallel is a tool, not a default. The Operator stops parallel and serializes when:

- ✅ Both lanes complete naturally — parallel served its purpose.
- ✅ Coordination overhead exceeds 60 min/day for 3+ days — diminishing return.
- ✅ Kill switch fires twice in one session — root cause is structural, not tactical.
- ✅ One lane needs to touch a sacred shell file or shared schema structure.
- ✅ Operator is in a context-switching crisis (multiple farm fires, M-PAiSA negotiation, family obligation).
- ✅ A new doctrine, pillar, or major refactor is being designed — design phases serialize.

When stopping, the Operator finishes the active paste pack on each lane to a safe commit, runs Platform Check on both, then merges per Section 13.

---

## 16. AUDIT CHECKLIST — END-OF-SESSION REVIEW

After every parallel session, the Operator runs this 10-question audit:

1. ✅ Did both lanes stay within their assigned migration ranges?
2. ✅ Did both lanes stay within their assigned file directories?
3. ✅ Did both lanes use the lane prefix on all naming dictionary keys?
4. ✅ Did every commit carry a `PARALLEL-LANE:` tag?
5. ✅ Did every paste pack carry the 4-line header?
6. ✅ Did sync handovers happen at the cadence in Section 9.1?
7. ✅ Was the Lane Log file maintained throughout?
8. ✅ Were there any kill switch events? If yes, root cause documented?
9. ✅ Did Platform Check pass on both lanes' final commits?
10. ✅ Was the Lane Log file committed to `docs/parallel_sessions/`?

Any "no" → that finding is a Strike-class drift event. The Operator records it in the Strike registry. Future parallel sessions add a guardrail against the specific failure mode.

---

## 17. DOCTRINE EVOLUTION RULE

This doctrine is **mutable**. It improves with every parallel session.

After each session's audit (Section 16), the Operator considers:

- Was there a collision the doctrine didn't predict? Add a Section 2 vector + a preventive rule.
- Was a rule too rigid? Soften it with a documented condition.
- Was a rule too loose? Tighten it.

Updates to this doctrine are committed to the project repo with the commit message:

```
TFOS Parallel Execution Doctrine — <update reason>

PARALLEL-DOCTRINE-UPDATE: section <N>, rationale <why>
```

The doctrine never silently changes. Every change is a commit.

---

## 18. THE SHORT VERSION (TL;DR for fast lookup)

If Boss is in the middle of parallel and needs the rules at a glance:

1. **Lanes are assigned in writing before the second chat opens.** Migration ranges + directories + branch names + key prefixes.
2. **Owned files are exclusive. Shared files are append-only with bracketed comments. Sacred files are frozen.**
3. **Every commit ends with `PARALLEL-LANE: <name>`.**
4. **Every paste pack has the 4-line header (LANE / TERMINAL / SCOPE / EXPECTED OUTPUT).**
5. **Terminals are visually differentiated. Pre-paste ritual: read window title, read paste pack header, confirm match.**
6. **Sync handover every 90 min or every commit, whichever first.**
7. **Lane Log file maintained throughout. Committed to `docs/parallel_sessions/` at session end.**
8. **Kill switch triggers immediate pause. Re-entry requires updated lane assignment + readiness checklist.**
9. **Operator owns coordination. Architects never advise across lanes.**
10. **End-of-session: sequential merge (Lane A then Lane B rebase + merge). Audit checklist runs. Doctrine updated if needed.**

---

## 19. THE FINAL DIRECTIVE

Parallel execution is a force multiplier when the rules hold and a force destroyer when they slip. The rules in this doctrine are not bureaucratic theater. Every one was reasoned from a specific collision vector that costs hours-to-days of cleanup when it fires.

The first time you skip a sync handover because "we're moving fast" is the first time you discover the Architects drifted on prod state. The first time you don't tag a commit with `PARALLEL-LANE` is the first time you can't reconstruct which lane caused a regression. The first time you let a lane edit `App.jsx` without bracketed comments is the first time you spend 2 hours untangling a route topology merge.

The discipline is the speed. The shortcuts are the slowness.

**This is Teivaka. Execute at the highest standard, even when no one is watching.**

---

*End of doctrine. Read again before opening a second concurrent build chat.*
*Section 4 (Lane Assignment Table) is filled in fresh per parallel session.*
*Sections 1-3 + 5-19 are stable contract — change only via Section 17 (Doctrine Evolution Rule).*
