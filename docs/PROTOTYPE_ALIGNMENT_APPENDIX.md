# Prototype Alignment Appendix
## Binding amendments to CLAUDE_CODE_EXECUTION_PASTE.md

**Date:** 2026-04-24
**Authority:** Cody (Boss), Founder, Teivaka PTE LTD
**Purpose:** Lock the execution paste to the exact structure in `TFOS_Platform_Interactive_Prototype.html`. The prototype is the VISUAL LAW. This appendix closes three gaps in the paste: per-pillar sub-nav enumeration, Farm Overview dashboard layout, and Notifications/Messages dropdown UX.

> This appendix is **read alongside** `CLAUDE_CODE_EXECUTION_PASTE.md`, not instead of it. Where they disagree, this appendix wins — the prototype is the locked visual target.

---

## 1. Per-pillar left-rail sub-nav (Day 3 scope)

Extracted byte-for-byte from the locked prototype. These are the exact items, in exact order. No additions. No reorders. lucide-react icon key in brackets.

### Home pillar — `/home`

| Order | Label | Route stub | lucide icon |
|---|---|---|---|
| 1 | Feed | `/home/feed` | `rss` |
| 2 | Following | `/home/following` | `users` |
| 3 | Marketplace | `/home/marketplace` | `shopping-bag` |
| 4 | Directory | `/home/directory` | `list` |
| 5 | Saved | `/home/saved` | `bookmark` |

Default sub-page: `feed`.

### Classroom pillar — `/classroom`

| Order | Label | Route stub | lucide icon |
|---|---|---|---|
| 1 | Overview | `/classroom/overview` | `book-open` |
| 2 | Tracks | `/classroom/tracks` | `layers` |
| 3 | My progress | `/classroom/my-progress` | `activity` |
| 4 | Certification | `/classroom/certification` | `award` |
| 5 | Bookmarks | `/classroom/bookmarks` | `bookmark` |

Default sub-page: `overview`.

### Farm pillar — `/farm` (14 items, flat, no section headers)

| Order | Label | Route stub | lucide icon | Badge logic |
|---|---|---|---|---|
| 1 | Overview | `/farm` | `bar-chart-3` | — |
| 2 | Tasks | `/farm/tasks` | `check-square` | unread task count |
| 3 | Cycles | `/farm/cycles` | `layers` | — |
| 4 | Harvests | `/farm/harvests` | `package` | — |
| 5 | Activities | `/farm/field-events` | `activity` | — (farmer label per Universal Naming v2 = "Activities"; engineer route retains `field-events`) |
| 6 | Supplies | `/farm/inventory` | `package` | — (Universal Naming v2: Inventory → Supplies) |
| 7 | Labor | `/farm/labor` | `users` | — |
| 8 | Cash book | `/farm/cash` | `banknote` | — (Universal Naming v2: Cash Ledger → Cash book) |
| 9 | Buyers | `/farm/buyers` | `truck` | — |
| 10 | Equipment | `/farm/equipment` | `wrench` | 🔒 Phase 6.5 — tile visible, route shows "Coming in Phase 6.5" |
| 11 | Safety check | `/farm/compliance` | `shield` | compliance block count (Universal Naming v2: Compliance → Safety check) |
| 12 | Analytics | `/farm/analytics` | `bar-chart-3` | — (sub-page, NOT a top-level pillar) |
| 13 | Reports | `/farm/reports` | `file-text` | — |
| 14 | Locations | `/farm/locations` | `map` | 🔒 Phase 4.3 — tile visible, route shows "Coming in Phase 4.3" |

Default sub-page: `overview` (the dashboard).

### TIS pillar — `/tis`

| Order | Label | Route stub | lucide icon |
|---|---|---|---|
| 1 | Chat | `/tis/chat` | `sparkles` |
| 2 | History | `/tis/history` | `clock` |
| 3 | Voice | `/tis/voice` | `mic` |
| 4 | Plan my farm | `/tis/plan` | `map` |
| 5 | Usage | `/tis/usage` | `activity` |

Default sub-page: `chat`. **Existing `pages/farmer/TIS.jsx` is a protected sacred file** (v4 Part 23 #28). It becomes the `/tis/chat` sub-page *contents* — do not touch its chat logic. The other four sub-pages are new stubs.

---

## 2. Farm Overview dashboard — 10-metric layout (Day 3 scope)

**Protected-file scope adjustment:** `FarmDashboard.jsx` may be touched on Day 3 *only* to implement the exact structure below. No other dashboard edits permitted. If the existing file renders different metrics, replace the metric list with the 10 below; do not refactor unrelated code paths. Every field-label rename must respect Universal Naming v2.

### Layout order (top to bottom)

1. **Header row** (existing file likely has this — keep or align):
   - Farm selector dropdown (F001 / F002)
   - Farm View Mode selector dropdown (Solo / Growth / Commercial) — `auth.users.farm_view_preference`, no audit event
   - `[+ New cycle]` primary-green button → opens existing cycle creation modal

2. **Today's top task card** (full width, cream panel, 80px tall):
   - Icon (left, 22px) — `droplet` / `sun` / `wrench` per task type from `tenant.task_queue.task_type`
   - Label row 1: "Top task · due today 10am" (or actual time)
   - Label row 2: Task title from `display_label` + entity label
   - Label row 3: Meta — quantity + assignee + weather condition
   - Right-side actions: `[Done]` primary + `[Reassign]` secondary (Reassign is Phase 4.3 — wire as toast stub)
   - Data source: `GET /api/v1/tasks/next` with `limit=1` (top-ranked unexpired incomplete task for current farm)

3. **Metrics grid** (3 columns desktop, 2 tablet, 1 mobile — CSS grid):

| Order | Label | Data source | Trend behavior |
|---|---|---|---|
| 1 | Active cycles | `tenant.production_cycles` WHERE cycle_status IN ('ACTIVE','HARVESTING') | Sub: "F001: N · F002: M" |
| 2 | Cycles to date | `tenant.production_cycles` COUNT ALL | Sub: "All time" |
| 3 | Cash balance | SUM(`tenant.cash_ledger`) for tenant+farm | Sub: "Runway Nd" — from 13-wk forecast; trend arrow vs last 30 days |
| 4 | Open tasks | `tenant.task_queue` WHERE completed_at IS NULL AND expires_at > NOW() | Sub: "N due today" |
| 5 | CoKG (avg) | AVG(`tenant.cycle_financials.cokg_fjd_per_kg`) last 3 closed cycles | Sub: "Last 3 cycles"; format `FJD X.XX/kg` |
| 6 | Runway (wks) | From 13-wk forecast first-negative-week index | Sub: "13-wk forecast" |
| 7 | Yield accuracy | Decision signal `Yield_Forecast_Accuracy` (v4 signal #11) | Sub: "vs forecast"; trend arrow |
| 8 | Weather 7d | Decision signal `Weather_Risk_7d` (v4 signal #12) | Sub: rainfall total mm; trend warn if rain >30mm in 48h |
| 9 | Demand match | Decision signal `Demand_Match_Score` (v4 signal #13) | Sub: "Buyer fulfillment" |
| 10 | Compliance | `tenant.harvest_log` WHERE chemical_compliance_cleared=false OR active WHD block count | Sub: "Chem WHD"; trend down with block id if any |

**Decision signals not yet live (Phase 5):** render the card with value `—` and sub `"Live after Phase 5"` rather than a fake number. **Never fake data.** See v4 Part 28 rule #17.

4. **Active cycles table** (existing in FarmDashboard — keep as-is below the metrics grid).

### Palette

- Metric card: background `#F8F3E9`, border `1px solid #E4DACC`, radius 8px, padding 16px.
- Metric value: 22px, weight 600, soil `#3D2817`.
- Metric label: 11px uppercase, letter-spacing 0.6px, soil `#7A6852`.
- Trend up: green `#6AA84F`. Trend down: red `#A32D2D`. Trend warn: amber `#BF9000`.

---

## 3. Notifications dropdown (Day 3 scope — severity-tiered)

### Trigger

Bell icon top-right. Red dot shown when any unread CRITICAL or HIGH notification exists.

### Panel spec

- Width 380px desktop. Full-width drawer on mobile <768px.
- Header: "Notifications" left, `Mark all read` text link right (primary green).
- Body: list of up to 20 most-recent `tenant.alerts` OR `tenant.tis_advisories` unread-first ordered by `created_at DESC`. Use a union view or separate sections — prefer a unified chronological list.
- Footer: "See all" link → `/me/notifications` (Phase 4.3 stub).

### Row layout (each notification)

```
[SEVERITY BADGE]  Title                              2h ago
                  Body text, max 2 lines truncated
```

Severity badge (pill, 10px uppercase, 4px padding, radius 3px, top-left of row):
- CRITICAL → `background:#FDEAEA; color:#A32D2D; border:1px solid #F5C7C7;`
- HIGH → `background:#FFF4E5; color:#BF7A00; border:1px solid #F5D9A8;`
- MEDIUM → `background:#F0EDE5; color:#5C4033; border:1px solid #D9D1BC;`

### Data source

Union of `tenant.alerts` (alert_status = 'OPEN') and `tenant.tis_advisories` (read_at IS NULL). Unified endpoint: `GET /api/v1/notifications?limit=20` — new in Day 2 scope (add to onboarding router file or create `routers/notifications.py`).

### Interactions

- Click row → marks read (emit `audit.events` row `NOTIFICATION_READ`), drops red dot, routes to source entity (task, cycle, cycle financials, etc.).
- `Mark all read` → bulk update + 1 audit event `NOTIFICATIONS_BULK_READ`.

---

## 4. Messages dropdown — Coming soon sheet (Day 3 scope)

### Trigger

Chat/message icon top-right (left of bell). Small badge count shows for unread *Phase 8* messages when the feature launches. For now, badge is hidden.

### Panel spec (per paste Day 3)

- Width 360px desktop, full-width on mobile.
- Header: "Messages"
- Body (single centered block):

```
[icon: messages-square, 40px, primary green]

Messages launches with the Community phase.

For now, reach your team on WhatsApp or use
the Activities log to record what happened.

[Open WhatsApp]   (primary green button, opens wa.me)
```

- No schema. No endpoints. No thread UI. This is a shell-only placeholder.
- The chat list + chat thread views in the prototype HTML are **visual demonstration only** — they show what Phase 8 will build. Do NOT port them.

---

## 5. Avatar dropdown (Day 3 scope)

### Trigger

Avatar chip top-right: `[avatar-image] Name ▾` — name truncates to first name on narrow screens.

### Header block

```
Uraia Koroi Kama
founder@teivaka.com · PREMIUM
```

Subscription tier pulled from `auth.tenants.subscription_tier`. Render as small amber pill.

### Menu items (top to bottom)

| Label | Route | lucide icon | Notes |
|---|---|---|---|
| Profile | `/me/profile` | `user` | stub in Phase 4.3 |
| Settings | `/me/settings` | `settings` | stub in Phase 4.3 |
| Switch mode ▸ | submenu | `toggle-left` | opens submenu with Solo / Growth / Commercial — Shell Mode override, 7-day rate limit, emits `audit.events` row `SHELL_MODE_OVERRIDE` (v4 Amendment 5) |
| Subscription | `/me/subscription` | `credit-card` | stub Phase 3.5b M-PAiSA |
| Referrals | `/me/referrals` | `gift` | existing referral code read from `growth_referral_codes` |
| Team | `/me/team` | `users` | stub Phase 4.3 (locked to FOUNDER role) |
| Export data | `/me/export` | `download` | triggers `/api/v1/me/export` (Phase 6 stub) |
| — divider — | | | |
| Sign out | action | `log-out` | clears session, navigates `/login` |

### Submenu UX — Switch mode

- Slide in from right or open as secondary dropdown.
- Active mode shows `check` icon right-aligned.
- Selecting a different mode → confirm modal: "Switch to Solo mode? You'll see one task at a time and full farm data stays safe. You can switch back anytime." → confirm → `PATCH /api/v1/me/shell-mode` → redirect to the appropriate shell route.

---

## 6. Farm Overview header — Farm View Mode selector placement

Prototype renders:

```
[F001 ▾]    Mode: [Growth ▾]    [+ New cycle]
```

Left to right, single row above the top task card. Per v2.1 §10, this is **Farm View Mode** (display preference, not shell mode). Does not emit audit events. Stored on `auth.users.farm_view_preference` as added in migration 028 (see CLAUDE_CODE_EXECUTION_PASTE.md Day 2 Part A — fold this column into 028 migration or create 028b).

---

## 7. FAB — TIS Assistant (Day 4 scope, prototype confirmation)

Prototype confirms:

- Icon: `sparkles`, 26px, white.
- Background: primary green `#6AA84F`, circle 56×56px, box-shadow elevation.
- Red dot top-right of FAB when unread TIS advisory or ≥1 MEDIUM+ advisory present.
- On click: opens `TISFloatingPanel` (360×480px desktop, 70vh bottom sheet mobile).
- Suggest pills inside panel: "Weather today", "Spray window", "Cash runway", "Buyer demand" — tap → pre-fills text input.
- Panel header: "TIS · Farm Brain" · close `x`.
- Panel footer: text input + `send` button (primary green).

All other FAB behavior per CLAUDE_CODE_EXECUTION_PASTE.md Day 4.

---

## 8. Universal (+) Log — prototype visual confirmation

Prototype renders the (+) as a center-slot mobile nav button and a top-bar pill. Behavior per CLAUDE_CODE_EXECUTION_PASTE.md Day 3 §"Universal (+) Log button" — no changes.

One clarification: on tap, the log sheet opens with tier-gated tiles (Solo 3 / Growth 8 / Commercial 14). Tile labels and routes per paste Day 3 table — unchanged.

---

## 9. Shell Mode override via Switch mode submenu

The avatar dropdown Switch mode item is the **only user-facing shell mode override**. It is NOT on the Farm Overview header. It is NOT in Settings. Putting it anywhere else would violate v4.1 Addendum §6.

Confirm on Day 3 that:
- `/farm` Farm View Mode selector does NOT change `auth.tenants.shell_mode`, only `auth.users.farm_view_preference`.
- Avatar dropdown Switch mode DOES change `auth.tenants.shell_mode`, emits audit event, rate-limited 7 days.

---

## 10. What this appendix does NOT change

- Migration 027 scope (farmer_label columns) — unchanged.
- Migration 028 scope (tis_advisories + SSE) — unchanged.
- Day 4 TIS FAB + SSE client — unchanged behavior, only visual confirmation.
- Day 5 onboarding wizard — unchanged.
- Day 6 term rename audit — unchanged, Universal Naming v2 binding.
- Day 7 farmer_label backfill — unchanged.
- Day 8 task engine verification — unchanged.

---

## 11. Verification additions (run on Day 3 before commit)

In addition to CLAUDE_CODE_EXECUTION_PASTE.md Day 3 verify block, confirm:

- [ ] Home left rail shows exactly 5 items: Feed / Following / Marketplace / Directory / Saved.
- [ ] Classroom left rail shows exactly 5 items: Overview / Tracks / My progress / Certification / Bookmarks.
- [ ] Farm left rail shows exactly 14 items in the exact order in §1.
- [ ] TIS left rail shows exactly 5 items: Chat / History / Voice / Plan my farm / Usage.
- [ ] Farm Overview renders 10 metric cards in the order in §2.
- [ ] Today's top task card renders above the metrics grid.
- [ ] Farm View Mode dropdown renders in the header row (not in avatar dropdown).
- [ ] Switch mode is present in avatar dropdown submenu (not in Farm header).
- [ ] Bell dropdown renders severity-badged rows (CRITICAL / HIGH / MEDIUM pills).
- [ ] Messages icon opens a "Coming soon" sheet, not a thread UI.
- [ ] Avatar header shows name + email + subscription pill.
- [ ] Universal (+) pill in desktop top bar + center-slot on mobile.
- [ ] TIS FAB bottom-right on /home, /classroom, /farm, /me. Hidden on /tis, /login, auth routes, `/`, Solo shell.
- [ ] Zero cartoon or emoji icons in nav/shell (lucide-react only).
- [ ] Grep `farmer-visible` strings for "Patch", "Production Unit", "Field Event" — zero hits.

---

**End of appendix. Hand this alongside `CLAUDE_CODE_EXECUTION_PASTE.md` to Claude Code on `feature/option-3-plus-nav-v2-1`.**
