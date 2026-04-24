# Claude Code Execution Paste — Phase 4.2 Option 3 + Nav v2.1 Merged
## Hand this entire document to Claude Code as the standing prompt

**Date prepared:** 2026-04-24
**Authority:** Cody, Founder, Teivaka PTE LTD
**Scope:** Execute Option 3 Deploy Pack + Nav Architecture v2.1 structural changes in a single coordinated pass.
**Budget:** ~11-13 days single-thread execution (Day 3 is a 2-day day — absorbs Universal (+) Log button from Nav v2.1 §12).
**Branch:** `feature/option-3-plus-nav-v2-1`

> **READ ALONGSIDE:** `PROTOTYPE_ALIGNMENT_APPENDIX.md` in this same folder. The prototype (`TFOS_Platform_Interactive_Prototype.html` at Resource Pack root) is the **locked visual target**. The appendix enumerates per-pillar sub-nav items, Farm Overview dashboard layout, and Notifications/Messages dropdown UX that this paste left open. Where paste and appendix disagree, **appendix wins** — the prototype is law.

---

## STANDING RULES — v4 + v4.1 Naming + Nav v2.1

### CANONICAL STACK (in order of precedence)

1. `TFOS_DESIGN_DOCTRINE.md` (Part IV Naming)
2. `01_architecture/UNIVERSAL_NAMING_V2_ADDENDUM.md` (SUPERSEDES v1 naming)
3. `01_architecture/TFOS_Navigation_Architecture_v2_1_Addendum.md` (SUPERSEDES v2 §3–§4 left-rail pillar nav)
4. `TFOS_Integrated_Phase_Build_Blueprint.md` (phase sequence — 2026-04-24)
5. `TFOS_Master_Build_Instruction_v4.md` (architecture law)
6. `01_architecture/TFOS_v4_1_Execution_Reality_Addendum.md` (farmer UX supremacy — Task Engine nervous system)
7. `01_architecture/TFOS_v4_Architecture.md` (architecture supplement)
8. `TFOS_Platform_Architecture_v1.md` (Growth/Commercial nav contract — now partially superseded by v2.1)

### What v2.1 changes on top of v4

- **Top bar, not left rail**, for primary pillars (Facebook pattern).
- **4 pillars** (Home / Classroom / Farm / TIS). **Me is an avatar dropdown top-right**, not a pillar.
- **Search bar in top bar**, keyboard `/` focuses. Global: Home posts + Classroom + Farm records + TIS history + team.
- **Top-right cluster:** 🔔 Notifications | 💬 Messages (in-app DM — deferred Phase 8) | Me ▾.
- **Sub-nav is a LEFT RAIL LIST** per pillar on desktop/tablet ≥768px (200px / 168px). Hamburger drawer on mobile.
- **TIS FAB bottom-right** on every authenticated STANDARD-shell page (not on Solo shell, not on `/tis/*`, not on auth pages).
- **Shell Mode** (derived, never user-facing) vs **Farm View Mode** (user dropdown inside Farm → Overview).
- **Solo shell preserved** — no top bar, no FAB, one-card view. Shell Mode decides which shell loads.

### Universal Naming v2 — OVERRIDE "Patch" with "Block" everywhere

| Engineer term | Farmer UI / API copy / TIS |
|---|---|
| Production Unit | **Block** |
| Production Cycle | **Cycle** |
| Field Event | **Activity** |
| Cash Ledger | **Cash book** |
| Harvest Log | **Harvest** |
| Chemical Compliance Check | **Safety check** |
| Rotation Gate | **Rotation check** |
| Withholding Period Days | **Wait days** |
| Livestock | **Animals** |
| Apiculture | **Bees** |
| Inputs | **Supplies** |
| Task Queue | **Tasks** |
| Audit Events | **Farm record** |
| Decision Signals | **Insights** |
| Automation Rules | **Watchers** |
| Sales Orders | **Orders** |
| Buyer Payments | **Payments** |
| Decision Engine | **Farm brain** |

---

## EXPLICITLY DEFERRED (DO NOT BUILD IN THIS PASS)

| Feature | Defer to |
|---|---|
| In-app chat (Messages icon destination — farmer↔farmer DM) | Phase 8 (Community). Icon renders with "Coming soon" modal on click. |
| TIS Farm Plan (conversational onboarding, `tenant.farm_plans`, plan PDF) | Phase 5 (post-Task-Engine verification). Wizard is the only onboarding path in this pass. |

If Claude Code starts scoping either of the above, **stop and reject**. Both are queued in the Integrated Phase Blueprint; neither is on-mission for Phase 4.2 closure.

---

## EXECUTION ORDER — 8 DAYS

### Day 1 — Migration 027 (farmer_label columns)

1. Read `/opt/teivaka/CLAUDE.md` FIRST.
2. Read `/opt/teivaka/04_execution/phase_4_2_option_3/027_farmer_label_columns.py`.
3. Verify Alembic head is `026_one_active_cycle_per_pu` — if not, stop and report.
4. Copy migration into `/opt/teivaka/11_application_code/alembic/versions/`.
5. Rebuild (restart is not enough):
   ```
   cd /opt/teivaka/04_environment
   docker compose up -d --build teivaka_api
   docker exec -it teivaka_api alembic upgrade head
   ```
6. Verify:
   ```sql
   SELECT version_num FROM tenant.alembic_version;   -- 027_farmer_label_columns
   SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema='tenant' AND column_name='farmer_label'
     ORDER BY table_name;
   -- 4 rows: harvest_log, livestock, production_cycles, production_units
   ```

**Commit:** `option-3: migration 027 adds farmer_label columns`

### Day 2 — Migration 028 (tis_advisories) + backend onboarding + SSE stream

**Part A — Migration 028 (TIS advisory push channel)**

Create `/opt/teivaka/11_application_code/alembic/versions/028_tis_advisories.py` implementing the schema from `TFOS_Navigation_Architecture_v2_1_Addendum.md` §11.8:

```sql
CREATE TABLE tenant.tis_advisories (
    advisory_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL,
    user_id           UUID NOT NULL,
    priority          VARCHAR(16) CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    preview           TEXT NOT NULL,
    full_message      TEXT NOT NULL,
    source_task_id    UUID REFERENCES tenant.task_queue,
    source_audit_id   UUID REFERENCES audit.events,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    read_at           TIMESTAMPTZ,
    dismissed_at      TIMESTAMPTZ
);
CREATE INDEX idx_tis_advisories_user_unread
  ON tenant.tis_advisories (user_id, created_at DESC)
  WHERE read_at IS NULL;
```

Enable RLS with `USING/WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid)`.
Downgrade: DROP INDEX, DROP TABLE.
Verify Alembic upgrade head → `028_tis_advisories`.

**Part B — Onboarding router + service**

Read `/opt/teivaka/04_execution/phase_4_2_option_3/onboarding_wizard_spec.md`. Create:
- `/opt/teivaka/11_application_code/app/routers/onboarding.py`
- `/opt/teivaka/11_application_code/app/services/onboarding_service.py`
- Wire into `/opt/teivaka/11_application_code/app/main.py`

Endpoints (farmer-facing terms in copy, engineer-facing terms in route paths):
```
GET  /api/v1/onboarding/status
POST /api/v1/onboarding/farm-basics
POST /api/v1/onboarding/production-units   # farmer UI copy: "blocks"
POST /api/v1/onboarding/livestock          # farmer UI copy: "animals"
POST /api/v1/onboarding/complete
```

Mode derivation:
```python
def derive_initial_mode(area_acres, crop_count, animal_count) -> str:
    if area_acres is not None and area_acres >= 1.0: return "GROWTH"
    if crop_count > 2: return "GROWTH"
    if animal_count > 10: return "GROWTH"
    return "SOLO"
```

Every write emits exactly one `audit.events` row (v4 Part 21, existing `emit_audit_event()` helper). `audit_event_id` stored on the source row where applicable.

**Part C — SSE TIS advisory stream**

Create `/opt/teivaka/11_application_code/app/routers/tis_stream.py`:
- `GET /api/v1/tis/stream` — Server-Sent Events, Bearer auth, one stream per authenticated session.
- `POST /api/v1/tis/advisories/:id/read` — marks `read_at = NOW()`, emits `audit.events` row `ADVISORY_READ`.
- Event shape per v2.1 §11.8:
  ```json
  {"type":"TIS_ADVISORY","advisory_id":"<uuid>","priority":"LOW|MEDIUM|HIGH|CRITICAL",
   "preview":"...","source_task_id":"<uuid?>","source_audit_event_id":"<uuid?>"}
  ```
- SSE keep-alive ping every 25s. Close on auth expiry.
- Connection tracked in-memory per API worker; in prod, Redis pub/sub fan-out (deferred — single worker is fine for F001/F002 MVP).

**Verify Day 2:**
```
curl -s https://teivaka.com/api/v1/onboarding/status -H "Authorization: Bearer $TOKEN"
# returns {"status":"success","data":{...}}

curl -N -H "Authorization: Bearer $TOKEN" https://teivaka.com/api/v1/tis/stream
# streams keepalives until Ctrl+C
```

**Commit:** `option-3+nav-v2-1: migration 028 + onboarding router + SSE TIS stream`

### Day 3 — Frontend shell refactor (StandardShell + top bar + left rail + Farm View Mode dropdown + Universal (+) Log button)

**This is the heaviest day. Budget 2 days if needed — (+) adds ~1 day.**

Create `/opt/teivaka/frontend/src/layouts/StandardShell.jsx`:
- Top bar: logo (click → /home) + search input (`/` focuses, 200px wide) + 4 pillars center + 🔔 💬 Me▾ right.
- Below top bar: two-column flex — left rail (200px desktop, 168px tablet) + content area flex:1.
- Pillar active state: underline, primary green `#6AA84F`.
- Left rail active sub-item: `background:#EAF3DE; border-left:3px solid #6AA84F; weight:500`.
- Mobile <768px: top bar compresses (search → icon), pillars collapse to bottom nav, left rail collapses to hamburger drawer with breadcrumb `[☰] Farm › Overview` bar below top bar.
- DO NOT rename or reshape `FarmerShell.jsx`. `StandardShell.jsx` is the new wrapper for authenticated STANDARD-shell routes. `FarmerShell.jsx` stays in place for backward compat during rollout.

Create `/opt/teivaka/frontend/src/components/nav/TopBar.jsx`, `SearchInput.jsx`, `NotificationsBell.jsx`, `MessagesIcon.jsx`, `MeAvatarDropdown.jsx`, `LeftRail.jsx`.

Me dropdown links: Profile, Settings, **Switch mode** (Shell Mode override — 7-day rate limit, audit event), Subscription, Referrals, Team, Export data, Sign out. Match v4 Amendment 5 override rules.

Messages icon (💬) opens a panel that reads **"Coming soon — Messages launches with the Community phase. For now, reach your team on WhatsApp."** No schema, no endpoints, no thread UI. Icon present because top-right cluster is the binding nav spec; behavior is deferred.

**Farm View Mode dropdown** (inside Farm → Overview, not in top bar):
- Rendered above metric cards.
- Options: Solo / Growth (default) / Commercial.
- Stored on `auth.users.farm_view_preference` (migration 028 add-column step — fold into migration 028 or add migration 028b).
- Changes do not trigger an audit event (it's a display preference, not a mode switch).

**Universal (+) Log button (binding per Nav v2.1 §12):**

Create:
- `/opt/teivaka/frontend/src/components/nav/LogFab.jsx` — mobile bottom-nav **center slot** (5-slot nav: Home | Classroom | (+) | Farm | TIS). 56×56px round, primary green `#6AA84F`, lucide `plus` icon, raised 6px above nav baseline, white border 2px. No label.
- `/opt/teivaka/frontend/src/components/nav/LogButton.jsx` — desktop/tablet **top-bar pill button** `[+ Log]`, lucide `plus` + "Log" label, positioned left of `<NotificationsBell />` in `<TopBar />`. Keyboard shortcut: `Cmd/Ctrl + L`.
- `/opt/teivaka/frontend/src/components/log/LogSheet.jsx` — full-screen bottom sheet on mobile, centered modal on desktop. Renders the action grid per Shell Mode tier (see §12.3–§12.4 of Nav v2.1 Addendum).
- `/opt/teivaka/frontend/src/components/log/LogTile.jsx` — reusable tile: lucide icon + 1-word label. Phase-gated tiles (`livestock-birth`, `livestock-death`, `nursery-batch`, `farm-units`) render with 🔒 lucide `lock` overlay and "Coming in Phase X" subtext → tap routes to waitlist toast, NOT the endpoint.

**Action grid wiring (LIVE endpoints only — render 🔒 for unshipped):**

| Tile label (lucide icon) | Endpoint | Status |
|---|---|---|
| Harvest (`leaf`) | `POST /api/v1/harvests` | LIVE |
| Paid (`banknote`) | `POST /api/v1/cash-ledger` (type=OUT) | LIVE |
| Pest seen (`bug`) | `POST /api/v1/field-events` (type=PEST_SIGHT) | LIVE |
| Plant (`sprout`) | `POST /api/v1/cycles` (action=PLANT) or `/field-events` | LIVE |
| Start cycle (`calendar-plus`) | `POST /api/v1/cycles` | LIVE |
| Input applied (`spray-can` — use `flask-conical` as fallback) | `POST /api/v1/field-events` (type=CHEM_APP) | LIVE — chemical compliance API must fire |
| Sale (`shopping-cart`) | `POST /api/v1/sales-orders` or `POST /api/v1/cash-ledger` (type=SALE) | LIVE |
| New buyer (`user-plus`) | `POST /api/v1/buyers` | LIVE |
| Attendance (`user-check`) | `POST /api/v1/labor-attendance` | LIVE |
| New birth (`baby`) | 🔒 Phase 6.5 — waitlist toast |
| Death (`skull` — use `alert-triangle` as fallback) | 🔒 Phase 6.5 — waitlist toast |
| New field (`map`) | 🔒 Phase 4.3 admin — waitlist toast |
| Nursery (`seedling` — use `sprout` as fallback) | 🔒 Phase 5.5 — waitlist toast |
| Inventory in (`package-plus`) | `POST /api/v1/inventory-movements` | LIVE |

Grid rendering rules by Shell Mode:
- **Solo:** 3 tiles only — Harvest, Paid, Pest seen. Plus one mic tile: "🎤 Hold to say anything else" — long-press → TIS voice capture → intent interpreter routes.
- **Growth:** 8 tiles — Solo 3 + Plant + Start cycle + Input applied + Sale + New buyer. "More" tile reveals Commercial grid.
- **Commercial:** all 14 tiles, searchable input at top, footer "Import from CSV/webhook" (Phase 8 — 🔒).

Tap a LIVE tile → opens the existing form for that endpoint, **pre-filled** with: today's date, active farm, and if applicable the production auto-inferred from active PUs. Existing form screens (`/farm/harvest/new`, `/farm/cash-ledger/new`, etc.) are the landing points — DO NOT duplicate forms. The (+) is a **router**, not a new form layer. (This respects v4 Part 23 #28 — don't touch protected screens.)

Task Engine auto-complete: after form POST success, check Redux/Zustand for any open task matching `(farm_id, production_id, action_type)`. If match exists, call `POST /api/v1/tasks/{id}/complete` with `outcome=DONE`. If no match, proceed normally.

Voice fallback: Solo mic tile + `Cmd/Ctrl + L` + long-press on LogFab (400ms) → TIS voice recording → Whisper → TIS intent interpreter → routes to correct endpoint → TTS confirmation. Reuses existing TIS pipeline from §11 FAB.

**All LogSheet and LogFab icons must be lucide-react per §13 of Nav v2.1 Addendum. No emoji. No cartoon imagery. Professional flat only.**

Route updates in `App.jsx` (ADDITIVE only — never reshape existing routes):
- Wrap Home, Classroom, Farm, TIS, Me routes in `<StandardShell>`.
- Solo-shell routes (`/solo/*`) remain wrapped in `<SoloShell>`.
- Auth routes (`/login` etc.) remain wrapped in `<AuthLayout>`.

**Shell loader:** on login, read `auth.tenants.shell_mode` → if `SOLO`, route to `/solo/task`; else route to `/home` (or wherever they were). This is existing logic, just confirm it still fires.

**Verify Day 3:**
```
curl -s https://teivaka.com/ | grep -o 'index-[^"]*\.js'
# new hash vs prior = successful deploy
```
Hard-reload browser:
- /home renders with new top bar, left rail hidden (Home has no sub-nav), FAB bottom-right.
- /farm renders with Farm pillar active, left rail showing Farm sub-items, Farm View Mode dropdown above content.
- /farm/harvest/new still loads (v4 Part 23 #28 protected — do not touch the page itself, only the wrapping shell).
- Mobile <768px: bottom nav renders with 5 slots — Home | Classroom | (+) | Farm | TIS. Center (+) is raised circle, primary green, no label.
- Tap (+) on mobile (Growth shell test account) → bottom-sheet LogSheet opens with 8 tiles + "More" tile. All lucide icons, no emoji, no cartoons.
- Tap "Harvest" tile → lands on /farm/harvest/new with farm pre-filled. Submit flow unchanged.
- Tap "New birth" tile (Growth test) → 🔒 waitlist toast "Coming in Phase 6.5", no POST fires.
- Solo test account → /solo/task loads unchanged (no top bar, no FAB, no (+) button — Solo shell has its own log flow via task cards).
- Desktop ≥1024px: [+ Log] pill renders in top bar left of 🔔 bell. `Cmd/Ctrl+L` opens modal LogSheet.
- Hamburger drawer opens left rail on mobile (unchanged).

**Icon audit (before commit):** grep the new components for any non-lucide imports. Any `react-icons`, `@fortawesome`, inline SVG copied from a cartoon source, or emoji used as an icon → remove. Only `lucide-react` exports allowed. This enforces §13.

**Commit:** `nav-v2-1: StandardShell top bar + left rail + Farm View Mode dropdown + Universal (+) Log`

### Day 4 — TIS FAB + SSE client + voice shortcuts

Create:
- `/opt/teivaka/frontend/src/components/tis/TISFab.jsx` — 56×56px round button, lucide `sparkles`, primary green.
- `/opt/teivaka/frontend/src/components/tis/TISFloatingPanel.jsx` — 360×480px desktop, 70vh bottom sheet mobile, portal-rendered into `<div id="tis-fab-portal">` on body.
- `/opt/teivaka/frontend/src/hooks/useTISSession.js` — shared session hook (same `tfos-web-{user_id}` session as the TIS pillar).
- `/opt/teivaka/frontend/src/hooks/useTISAdvisoryStream.js` — opens SSE connection to `/api/v1/tis/stream`, stores advisories in Zustand, dedupes on `advisory_id`.

**Position per v2.1 §11.7:**
```
≥1024px:   bottom: 24px; right: 24px;   56×56
768-1023:  bottom: 24px; right: 20px;   56×56
380-767:   bottom: 96px; right: 16px;   56×56   (clears 64px bottom nav + 32px)
<380:      bottom: 96px; right: 12px;   48×48
```

**Hide on:** Solo shell, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/`, `/tis/*`.

**Voice interaction (v2.1 §11.6):**
- Tap mic button in open panel → record until release → send.
- **Long-press FAB 400ms** (panel closed) → push-to-talk — hold to talk, release to send, auto-opens panel with transcript streaming.
- **`Cmd/Ctrl + Shift + K`** hold-to-talk global keyboard shortcut.
- **`Cmd/Ctrl + K`** opens panel with text cursor focused.
- 200ms post-release tail before stopping recording to avoid clipping final words.
- **No wake word, no always-listening.** Rejected for battery/privacy/multilingual reasons.
- Web Speech API for MVP. Whisper streaming (Phase 5+) is the upgrade path.

**Advisory surfacing:**
- Red dot on FAB for any unread MEDIUM+ advisory.
- Orange pulse ring for CRITICAL until opened.
- Open panel → advisory pre-composed as TIS message, reply with one-tap "OK" or voice.
- `POST /api/v1/tis/advisories/:id/read` on panel open.

**Tier rate limits:** respect `FREE=5/day`, `BASIC=20/day`, `PREMIUM=unlimited`. Over-limit → panel shows "Upgrade" CTA, mic disabled.

**Verify Day 4:**
- Hard-reload → FAB visible bottom-right on /home, /classroom, /farm, /me.
- FAB hidden on /tis, /login, /register, and Solo shell.
- Click FAB → panel opens. Click same panel close → minimized.
- Long-press FAB 400ms → mic listening → release → transcript appears.
- `Cmd+K` → panel opens text-focused.
- `Cmd+Shift+K` (hold) → mic listening.
- With SSE stream open, insert a test advisory via `psql`:
  ```sql
  INSERT INTO tenant.tis_advisories (tenant_id, user_id, priority, preview, full_message)
  VALUES ('<tenant>', '<user>', 'HIGH', 'Rain at 14:00 — do not spray', 'Rain at 14:00 — do not spray Karate Zeon on Block 3. Reschedule to Thursday.');
  ```
  → red dot appears on FAB within 3s. Click → advisory surfaces.

**Commit:** `nav-v2-1: TIS FAB + SSE advisory stream + voice shortcuts`

### Day 5 — Frontend onboarding wizard pages

Create under `/opt/teivaka/frontend/src/pages/onboarding/`:
- `FarmBasics.jsx` — farm name, region, area (acres or hectares — voice entry primary), ferry-access yes/no.
- `WhatYouGrow.jsx` — "What do you grow on this block?" — multi-select crop chips + per-crop block count + optional block label.
- `Animals.jsx` — "What animals do you have?" — livestock tiles + hive count for bees.
- `FirstTask.jsx` — preview the first 3 tasks the Task Engine will generate; one-tap "Let's go."

Wrap all in `/opt/teivaka/frontend/src/layouts/OnboardingShell.jsx` — no top bar, progress dots top, skip-link "I'll do this later" bottom.

Copy rules (Universal Naming v2 binding):
- "What should you call this block?" (NOT "Name your patch").
- Placeholder: "e.g. mango tree block, back field, near the creek".
- Fallback if skipped: system assigns `Block 1, Block 2, Block 3` sequentially.
- Never show the engineer term `PU-F001-002`.

Route additions in `App.jsx` (ADDITIVE):
```
/onboarding/farm-basics
/onboarding/what-you-grow
/onboarding/animals
/onboarding/first-task
```

Shell loader: if tenant has `shell_mode='STANDARD'` AND `onboarding_completed_at IS NULL`, redirect to `/onboarding/farm-basics` on first post-login navigation. Solo-shell tenants skip the wizard — their onboarding is baked into the first Solo task card.

**Verify Day 5:**
- New signup → redirects to /onboarding/farm-basics.
- Complete wizard → lands on /home with left rail + FAB.
- Abandoned mid-wizard → resumes on return.
- Grep frontend for `Patch|Production Unit|patch` (case-insensitive) in user-visible strings → zero hits.

**Commit:** `option-3: onboarding wizard pages with Universal Naming v2`

### Day 6 — Term rename audit (execution sweep)

Read `/opt/teivaka/04_execution/phase_4_2_option_3/term_rename_audit.md`. OVERRIDE v1 "Patch" with v2 "Block" throughout.

**Audit scope:**
- Frontend `/opt/teivaka/frontend/src/` — all user-visible strings.
- Backend notification templates (`/opt/teivaka/11_application_code/app/templates/`).
- TIS OpenClaw system prompts in `/home/tis/.openclaw/workspace/`.
- WhatsApp message templates.
- Monthly PDF templates (if any exist — Phase 6 deliverable, skip if absent).

**Grep targets (must return zero user-visible hits):**
```
grep -rni "patch" /opt/teivaka/frontend/src/ --include="*.jsx" --include="*.js"
grep -rni "production unit" /opt/teivaka/frontend/src/ --include="*.jsx" --include="*.js"
grep -rni "PU-" /opt/teivaka/frontend/src/ --include="*.jsx" --include="*.js"
```
Engineer-only code paths (models, types, API route definitions, test fixtures) may retain the engineer term.

**DO NOT TOUCH** (v4 Part 23 #28 protected files):
- Landing.jsx, Login.jsx, Register.jsx, VerifyEmail.jsx, ForgotPassword.jsx, ResetPassword.jsx
- pages/farmer/TIS.jsx
- BottomNav.jsx, TopAppBar.jsx, FarmerShell.jsx
- FarmDashboard.jsx, HarvestNew.jsx (logic untouched; only display-label mappings may change)
- Caddyfile.production, tis-bridge server.js, OpenClaw `tis` service
- Alembic migrations 001 through 026
- robots.txt, sitemap.xml, index.html SEO meta tags

**Commit:** `nav-v2-1: term rename audit applied (Patch→Block across UI)`

### Day 7 — F001 + F002 farmer_label backfill + Farm View Mode default wiring

**Part A — Admin backfill UI (Cody-only)**

Create `/opt/teivaka/frontend/src/pages/admin/LabelBackfill.jsx` — FOUNDER-role-gated route at `/admin/labels`:
- Lists all rows in `tenant.production_units` + `tenant.livestock` + `tenant.production_cycles` + `tenant.harvest_log` where `farmer_label IS NULL`.
- Inline edit per row → `PATCH /api/v1/admin/labels/{table}/{id}` sets the label.
- Emits `audit.events` row `LABEL_ASSIGNED`.

**Part B — Label seeding script for F001 + F002 (Cody fills in)**

Provide a script `/opt/teivaka/04_execution/phase_4_2_option_3_plus_nav_v2_1/label_backfill_f001_f002.sql` with placeholders Cody fills in:
```sql
UPDATE tenant.production_units SET farmer_label = 'Mango tree block'  WHERE pu_id='...';
UPDATE tenant.production_units SET farmer_label = 'Back field'        WHERE pu_id='...';
UPDATE tenant.livestock        SET farmer_label = 'Hive 1'            WHERE livestock_id='...';
-- etc.
```

DO NOT seed labels in a migration — labels are tenant data, not platform seed (v4 Part 4).

**Part C — Farm View Mode default wiring**

On user creation, `auth.users.farm_view_preference` defaults to the tenant's `shell_mode`. Confirm via test: create new STANDARD-shell user → `/farm` → dropdown reads "Growth" (default) unless `shell_mode='SOLO'` (reads "Solo" default but still on standard shell).

**Verify Day 7:**
- /admin/labels lists remaining NULL rows.
- After backfill, /farm dashboard shows Cody's labels (not "Block 1" fallback).
- F001 TIS WhatsApp query "how's the mango tree block" returns correct data.

**Commit:** `option-3: farmer_label backfill UI + Farm View Mode default wiring`

### Day 8 — Resume Phase 4.2 Task Engine Step 5-6 verification

Once naming + onboarding + nav shell are live, verify end-to-end on F001 cycle `CYC-F001-PU002-2026-003`:

- `GET /api/v1/tasks/next` returns 1 task.
- Task card payload includes `display_label` field populated from `farmer_label` (not raw `PU-F001-002`).
- Voice TTS plays when Solo task card opens.
- Left rail renders correctly in Farm pillar for Cody's standard-shell account.
- FAB advisory push fires when Task Engine emits a `tis_advisory_required=true` task.
- `POST /api/v1/tasks/{id}/complete` with outcome `DONE`:
  - Emits 1 `audit.events` row.
  - Hash chain integrity verified: `sha256(previous_hash || payload_hash || occurred_at) == this_hash`.
  - Next task surfaces (Solo) or queue refreshes (Standard).

**Commit:** `phase-4-2: end-to-end task engine verification on F001 CYC-F001-PU002-2026-003`

**Merge `feature/option-3-plus-nav-v2-1` to `main` only after all Day 8 verifications pass and Cody approves in a browser smoke test.**

---

## BINDING RULES THROUGHOUT

1. Read `/opt/teivaka/CLAUDE.md` FIRST before any write.
2. Read relevant files before editing. No blind writes.
3. **Schema Reality Drift List (v4 Part 4):** `cycle_status`, `alert_status`, `qty_kg`, `pu_id`, `chem_name`, `withholding_period_days`, `app.tenant_id`, `tenant.alembic_version`. Never use the master-spec names that conflict.
4. Task Engine is the nervous system. No module writes to farmer surface directly — everything routes through `tenant.task_queue` or `tenant.tis_advisories`.
5. **Every tenant-scoped write emits exactly one `audit.events` row with hash chain** (v4 Part 21). Corrections are new events, not in-place edits.
6. Solo shell: one screen, no nav, three-button tap, TTS auto-play. **Not touched in this pass** beyond the shell-loader redirect confirmation.
7. No farmer-facing form with >1 free-text field. Voice/camera/tap before typing.
8. Sub-components at module scope ONLY. Never inside a parent component function.
9. Scope only. Flag unrelated bugs — do not fix them.
10. No commits to `main`. Use `feature/option-3-plus-nav-v2-1` branch.
11. M-PAiSA primary. No Stripe until Phase 8.
12. **Universal Naming v2 is binding on all farmer-facing surfaces.** NEVER use "Patch" or "Production Unit" in UI, copy, TIS, WhatsApp, or PDF.
13. **Nav v2.1 is binding:** top bar pillars (4), Me as avatar top-right, LEFT RAIL sub-nav, FAB bottom-right. Do not default back to v2 left-rail-pillar patterns.
14. Git commit before every risky session. Commit message must name the day (1–9; Day 3 is a 2-day block) and scope.
15. No ML libraries in `api` or `worker-ai` containers.
16. **Do not build deferred items.** In-app chat = Phase 8. TIS Farm Plan = Phase 5. If either creeps into scope, stop and report.
17. **Professional flat icons only (Nav v2.1 §13).** `lucide-react` exclusively. No emoji as nav/action icons, no cartoon imagery, no gradients, no 3D. Emoji acceptable only on WhatsApp outbound / push / celebratory milestones (≤1 per message). Grep new components before commit — any non-lucide import → remove.
18. **Universal (+) Log button is binding (Nav v2.1 §12).** Mobile center-nav slot + desktop top-bar `[+ Log]` pill. Tier grid by Shell Mode (Solo 3 / Growth 8 / Commercial 14). Unshipped endpoints render 🔒 waitlist — never fake success.

---

## VERIFICATION GATES — ONE PER DAY

See each day's "Verify Day N" block above. Run the gate before committing. If a gate fails, **stop and report**.

Every Day N commit is preceded by:
```
git status        # working tree clean after intentional changes only
git log --oneline -5   # new commit visible on feature branch
curl -s https://teivaka.com/api/v1/health   # {"status":"healthy"}
```

---

## REPORT FORMAT — END OF EACH DAY

```
Day: <N>
Step: <name>
Files changed: <list with full paths>
Files read but not changed: <list>
What still works: <smoke-tested features>
What I did NOT do: <descoped items>
New frontend bundle hash: <if applicable>
Schema drift bugs found elsewhere: <list — FLAG, do NOT fix>
Audit events emitted this session: <count>
Next day's starting step: <Day N+1, exact step>
Open blockers: <list, or "none">
```

---

## IF ANYTHING BLOCKS

Stop immediately. Report:
1. What you tried.
2. What error / unexpected state you hit.
3. What guess you have about the cause.
4. Which canonical doc / migration / file I need to review.

Do NOT proceed on a guess. Do NOT fix unrelated bugs. Do NOT expand scope.

---

## ANTI-DRIFT GUARD

Before any new task you add to your own to-do list that isn't in the 8 days above, run the Three-Question Check (v4 Part 24):

1. Does this move F001 or F002 toward logging a full cycle?
2. Is there a lower-phase prerequisite not shipped yet?
3. What data can be logged AFTER this ships that can't be logged BEFORE?

If the answer to (1) is no or (3) is "none," the task is drift. Reject it.

---

**End of paste. Hand this entire document to Claude Code and authorize execution on `feature/option-3-plus-nav-v2-1`.**
