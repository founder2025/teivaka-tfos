# TFOS Farm Pillar — Pre-Alpha Forensic Audit Ledger

Sequential redesign/audit of the Farm pillar before the 50-farmer alpha cohort.
One destination at a time; a page is not PASS until it works end-to-end, builds
clean, has no blank-screen path, scales (breakpoint named), and is honest (real
data or honest-empty). Resumable: each entry records status + findings + decisions.

Order: Overview → Tasks → Enterprise → Production → Field Events → Inventory →
Labour → Buyers → Cash → Assets & Equipment → Locations → Compliance → Analytics →
Reports → Weather → Library → Gallery → Partnerships → Settings.

Legend: 🔒 LOCKED (approved; no redesign without new evidence) · ✅ PASS · 🟡 improved, open items · ▢ not started

---

## 🔒 LOCKED PAGES
- **Settings (/farm/settings)** — LOCKED 2026-06-27 (Operator-approved). Audited (SET1–SET8) →
  scorecard (6.0→5.5 after 8-persona) → 8-persona → redesigned + wireframe → stress-tested ×1 (11
  scenarios) → optimized ×1. **#1 (security): invite privilege-escalation closed** — `create_invite`
  is now role-gated (only owner/manager invite; only an owner mints a Manager; was open — a Worker
  could invite a Manager). **#2 (privacy, SX-1): location-sharing made opt-in for new users** —
  migration `197_location_optin_default` flips `tenant.users.share_location` DEFAULT → false (was
  mig 164 DEFAULT true / opt-out); the Preferences row leads with a prominent consent callout (ON
  flagged amber, "only verified members", easy off). **Existing opted-in users left unchanged —
  backfill is a FILED Operator consent decision.** **#3 (SET1): api.js getJSON/send** (token refresh
  + humanised errors); per-card loading / error+retry / honest-empty; **Preference toggles+pills
  DISABLED until prefs load** — kills the load-flash false-default write. **SET2: account/farm
  split** — Preferences/Team/Plan/Governance/Data render WITHOUT a farm; only Farm-setup/Land/Crops/
  Marketplace need one; sectioned "Your account" / "This farm" (cut the 9-card wall). Also: owner-only
  actions hidden from WORKER/VIEWER (Invite-Manager owners-only); **real "Reset password"** via
  /auth/forgot-password (was a dead toast); **revoke a pending invite**; plan shows tier+status+
  trial-end + price/TIS-day/farm limits; lazy listings (farm-gated); a11y shared Modal (role=dialog+
  Esc+focus) on all six modals; formatMoney; Ask-TIS settings helper. Strengths kept: ID-stable
  hash-chained renames (zone/block/cycle), governance chain-integrity surfacing, real data export,
  honest M-PAiSA "in progress" / weather / WhatsApp connections. Wireframe:
  docs/TFOS_Settings_Redesign_Wireframe.md. **FILED (backend/decision, not faked): share_location
  backfill of existing opted-in users → off (Operator consent call); member remove / role-change
  (no endpoint); PIN + device/session management (no endpoint); honest i18n — language pref saved but
  app not translated (B42); composite /settings read (~13 queries); FARMER-vs-server farm-edit-gate
  role-taxonomy reconcile (SX-3); governance "view full log".** Deploy: frontend npm run build +
  backend build --no-cache api + alembic upgrade head as owner (migration 197 + invite gate).
- **Cash (/farm/money · cash)** — LOCKED 2026-06-27 (Operator-approved). Audited (CA-A + CA-B–CA-H)
  → scorecard (4.0 — capped by CA-A) → 8-persona → redesigned + wireframe → stress-tested ×1 (11
  scenarios) → optimized ×1. **#1 fix — CA-A SHOWSTOPPER: the page rendered $0 + an empty ledger
  for EVERY farm.** `getCash` returned the `{data:{entries, cash_balance_fjd}}` envelope but the
  page read top-level fields (one `.data` too shallow); the Overview tile unwraps `.data.data` and
  looked fine, hiding it. Writes succeeded, reads showed nothing — farmers logged cash and watched
  it vanish. Fixed: `getCash` unwraps `?.data` → balance + ledger + every derived view (week net,
  rails, categories, NWC, forecast, reconcile) render. **Also:** entry-time **enterprise anchor**
  (optional cycle picker sends `pu_id`+`production_id` — the API accepted them, the form never did
  — enabling per-enterprise P&L at the data layer; collapsed behind "+ Attach to a business");
  **honest forecast** (runway relabelled "Spend runway · before harvest income"; the below-zero
  alarm states it counts COSTS ONLY and points at the excluded upcoming-harvest income — no false
  "going broke" for a seasonal pre-harvest farm); **cashbook CSV export** (Ledger + Bank Evidence,
  honestly labelled "covers latest 200"); **Bank Evidence is a real view** (period balance/in/out/
  net + export + pack link, was a 1-button stub); **Overview de-dup** (receivables/credit/NWC live
  once in the capital strip); **solo-farmer edit fix** (`canManageCash` now includes FARMER — the
  owner can edit/delete their OWN cash; WORKER/VIEWER read-only); date/in-out **immutability
  surfaced honestly** (locked for backdating protection — fix = delete & re-add within 48h); a11y
  keyboard tiles. Carried strengths: getJSON/send token refresh, error/degraded/cached-on-error,
  Fiji time, formatMoney, 48h server edit window + Lock UI, hash-chained CRUD, a11y Modal + arrow
  tabs. Wireframe: docs/TFOS_Cash_Redesign_Wireframe.md (v2). **FILED (backend, named not faked):
  CA-C server-side role gate on PATCH/DELETE** (client-only + fail-open today — STAGED, not shipped
  blind: a fail-closed gate would lock out FARMER-role owners, so the read-only role set is an
  Operator auth decision); **server aggregates + pagination** (CA1 — rails/categories/"All" + export
  reconcile to the all-time balance beyond 200 entries); credit/payables accrual (CA-D); per-cycle
  P&L report consuming the new anchor (CA21/22); tax-category mapping (CA27); TRANSFER/loan/grant;
  server category enum; statement import + saved reconciliation; **receipt-snap → cash** (the parked
  OCR work lands here); B31 provider lift; voice/i18n. Deploy: frontend-only.
- **Library (/farm/library)** — LOCKED 2026-06-27 (Operator-approved). Audited (LB1–LB9) →
  scorecard (6.5→6.0 after 8-persona) → 8-persona → redesigned + wireframe → stress-tested ×1
  (11 scenarios) → optimized ×1. **#1 fix (LB1): every tab is react-query → real ErrorCard+Retry
  / skeleton / honest-empty** — a failed load (esp. the WHD-trust Chemicals tab) no longer reads
  "none match." **#2 (LB2): the Nutrition flagship resolves** — NEW `GET /agronomy/nutrition/crops`
  lists crops that actually have protocols, and the picker passes the real `crop_key` (taro), not
  the reference `ref_id` (CRP-TAR) that 404'd for every crop. **LB3: KB articles are readable**
  (GET /kb/{id} → light markdown body). **LB4: corpora are cached + lazy per active tab** (search
  enables the cross-corpora set, debounced 250ms — no 9-request eager load, no refetch-every-visit).
  **Chemicals is now first-class:** WHD-band filter pills + "what affects my crops" intersecting
  `registered_crops` with the farmer's live cycle `production_id`s (LX-3 verified: `/cycles` returns
  production_id). Also: cross-search spans livestock/vet + KB with "+N more"; **Ask-TIS on the row
  detail + KB** (chem prompt includes WHD — closes the citation loop); a11y (cards=buttons, modals
  role=dialog + Esc, modal titled by the row); `getJSON`/`send` writes (token refresh); `?tab=`+`?q=`
  URL state (citation landing); livestock partial-error per-section retry; `useCorpus` (rules-of-hooks).
  **Honesty:** the "How to use" lesson no longer promises a per-row version/date the tables don't
  store, nor a "My Library" that has no backend. Wireframe: docs/TFOS_Library_Redesign_Wireframe.md.
  Remainder filed (backend/scope, not faked): **"My Library"** (custom varieties/sightings/notes —
  needs tenant tables + CRUD); per-row review **dates/versions** (no column); request-update **status
  tracking**; corpus **export/print**; **server-side search/pagination** at 10×; dated provenance for
  government trust; voice/i18n; LX-2 lazy tab-count badges (accepted tradeoff). Deploy: frontend
  npm run build + backend build --no-cache api (new /agronomy/nutrition/crops endpoint).
- **Partnerships (/farm/partnerships)** — LOCKED 2026-06-27 (Operator-approved). Audited (PN1–PN8)
  → scorecard (6.5→6.0 after 8-persona) → 8-persona → redesigned + wireframe → stress-tested ×1
  (11 scenarios) → optimized ×1. **#1 fix (PN1): the network + agreement no longer read "None
  added yet" on a failed load** — `getJSON`/`send` (token refresh) with per-section loading /
  ErrorCard+Retry / honest-empty (this is a lender-facing surface). **#2 (PN2): buyer/supplier
  counts are tenant-wide endpoints → labelled "N · across your farms,"** not silently shown as
  this farm's; **PX-1 follow-up: those link-types are excluded from the group totals + "N of 5
  groups active"** so Commercial isn't inflated by tenant data. Also: distribution date reads the
  real `calculated_at` (PN3); **delete a partner** via soft-delete `PATCH {is_active:false}` behind
  a confirm (PN4, keeps the audit row); **land agreement elevated** (accent, first) with **"Edit
  agreement" when one exists** (was a misleading "New" that silently overwrote the single rate);
  network groups **collapse to a one-line count** (no wall of empties) + a completeness glance;
  **tap-to-call + WhatsApp** per partner; **partner search** past 6 entries; mobile name
  truncation; **Ask-TIS** grounded benchmark on the agreement rate; a11y modals (role=dialog +
  Esc) + keyboard group headers; `formatMoney`. **Backend: `partner_type` validated server-side**
  (VALID_TYPES — no invisible orphan rows). Wireframe: docs/TFOS_Partnerships_Redesign_Wireframe.md.
  **Honesty — the dormant flagship, named not faked:** the distribution split-calc endpoint
  (`POST /profit-share/calculate/{cycle}`) exists but **nothing calls it**, so the archive is empty
  in practice — the copy states honestly how splits are created and **auto-calculate-on-cycle-close
  is FILED as the backend keystone**. Remainder filed (backend/scope, not faked): multi-agreement
  per parcel + effective-date + lease term/expiry + document (lease PDF) attach (today a single
  farm-level rate); unify the 3 partner tables (farm_partners + customers + suppliers) into one
  read-model; professional-partner verification handshake; exporter→consignment link; **server-side
  role gate on agreement writes** (PX-7 — a contractual figure editable by any user); export; B31
  provider lift; voice/i18n; per-type pagination at scale. Deploy: frontend npm run build + backend
  build --no-cache api (partner_type guard).
- **Decisions (/farm/insights · decisions)** — LOCKED 2026-06-27 (Operator-approved; RE-LOCKED
  after a second stress + optimize round). **Post-lock hardening (8f71bae + c93ac0c):** the live
  deploy surfaced a real failure on Viyasiyasi Farm · Kadavu — 4/5 queries returned data, only
  `/decision-engine` errored, yet the page showed "Couldn't read everything." Root-caused + fixed
  two defects: (1) **design — signals were treated as a core input**; they're now ADVISORY (the call
  + all-clear gate on crop holds + tasks only; a signals failure shows a quiet inline note, never a
  page-wide alarm); (2) **backend — `/decision-engine` could 500**; now runs the read in a SAVEPOINT
  (`begin_nested`, Strike #113) + try/except → logs the real exception (Sentry/docker) and returns an
  honest empty `degraded:true` result instead of 500 (backend deploy: `build --no-cache api`). Then a
  second 8-persona pass caught the **cash-blind decision ladder** (the page could say "nothing urgent"
  while runway was critical) → **CASH IS NOW A FIRST-CLASS CALL TIER** (runway from `/cashdemand`:
  <4wk red, <8wk amber) + Cash-runway tile + risk card + money-read line. Also: DV-1 (surface the
  backend `degraded` flag — note no longer dead code), page-level **as-of "updated HH:MM"** (ERP
  freshness contract across mixed-vintage feeds), **since-last-visit delta** ("you cleared N holds/
  tasks", localStorage — progress reinforcement), 5 nav-count tiles, 2-col risk grid, first-run hint,
  "+N more" list overflow, `taskSev` bands VERIFIED == backend `RANK_BAND_RANGES`. Original lock:
  Audited →
  scorecard (5.5→5.0 after 8-persona) → 8-persona → redesigned + wireframe → stress-tested ×1 (11
  scenarios) → optimized ×1. **#1 fix (DC1): the page can no longer tell a farmer "the farm is
  running clear" on a failed load** — routed through `utils/api` (token refresh + honest errors),
  the green all-clear is EARNED (only when the holds+signals+tasks trio actually loaded), with
  per-section loading, cached-on-error (keeps the last values + a degraded banner when the network
  drops mid-session), full ErrorCard, and no-farm states. **#2 fix (DC2/ST-B): "Holds" + the lead
  call + the risk card read the REAL crop-compliance `blocked_count`** (the WHD gate, Inviolable #2)
  — the faked "clear to sell / no active holds" activity-count is gone — and it's scoped HONESTLY to
  CROP compliance so it can't imply farm-wide clearance it never checked. Also: ONE net
  (`net_profit_fjd`; costs shown as income−net so the page can't display two totals); dropped the
  hardcoded "normal mid-season" reassurance + the all-zero false "income ahead" (DC/ST-3); **synthetic
  2-digit standing score removed** (DC4 — words from real net/ROI only); **removed the "review
  lowest-net before spending" misadvice** that punishes Long-Term-Asset crops (Inviolable #4) + added
  the long-term-negative caveat; **removed the capital-risk "expansion readiness"** (and its
  avg-over-zeros bug) → factual portfolio summary; surfaces the engine's own `last_refresh_at` as a
  stale banner (Strike #110 guard); enterprise table capped + show-all (ST-5); period label (ST-6);
  aria-live on the call + larger tap targets (ST-2); context-rich **Ask-TIS on the specific call**;
  width now matches the Analytics tab (TfpShell + main-inner, ST-4); ModeDropdown removed (DC6),
  real farm name (DC7), formatMoney (DC10), merged routes (DC9). Wireframe:
  docs/TFOS_Decisions_Redesign_Wireframe.md. Remainder filed (backend/scope — not faked): **animal/
  poultry withholding in the holds number** (today crop-only); **farm-scoped tasks** (DC3 — `/tasks`
  has no farm_id, labelled "across all your farms"); **per-enterprise `layer`** on the crops financials
  rollup for full Inviolable-#4-aware ranking; collapse the two signal endpoints shared with Analytics
  (DC11) into one read model; lift `CurrentFarmProvider` to FarmerShell (B31 — cross-tab farm desync);
  composite `/farm/decisions` endpoint; real Opportunities/Forecasts; role-gating; regional aggregate;
  voice/i18n. Deploy: frontend-only.
- **Analytics (/farm/insights · analytics)** — LOCKED 2026-06-27 (Operator-approved). Audited →
  scorecard (6.5) → 8-persona → redesigned + wireframe → stress-tested ×1 → optimized ×1 →
  deploy-smoke fix. **#1 fix: the Decision board now leads with a "Right now" TRIAGE card** (top
  RED → AMBER signals + cash runway, which lives in /cashdemand not as a signal, so the most
  decision-critical number isn't two taps deep) instead of a wall of 13 flat tabs — and **real
  error states** replaced the perpetual "Loading…" that hid every 500/401/404. Also: **stale-
  snapshot banner** (loud amber when signals ≥24h old — the Decision Engine has silently died
  before, Strike #110, so a timestamp alone isn't enough); `get()` routed through shared `getJSON`
  (token auto-refresh + honest errors, no stuck 401); **RED signals non-snoozable** (can't bury a
  crisis — only amber/green ack); per-cycle P&L **CSV export** (the bankable table); Ask TIS deep-
  link (`/tis?q=`); role=tab + keyboard nav; removed the redundant urgent-strip (TriageCard is the
  canonical urgent surface). **Deploy-smoke caught + fixed (ee63b8e): the Signals-tab ErrorCard was
  a LATENT `_require_farm` 404** — a `farm_id` left in localStorage from a previous login isn't under
  the current account; the old non-throwing `get()` masked it as an empty "no signals configured,"
  the new `getJSON` correctly throws. ErrorCard is now **status-aware** — a 404 says "This farm isn't
  available · Choose another farm" and clears the stale selection so FarmSelector re-picks (recoverable,
  not a dead "Retry"); genuine load errors get Retry; a true 401 already redirects to /login (so an
  ErrorCard is never auth). Wireframe: docs/TFOS_Analytics_Redesign_Wireframe.md. Remainder filed
  (backend, named — not faked): 3-Layer lens (Cash-Flow/Food-Security/Long-Term-Asset) on P&L +
  productivity; signal "why" (rule + threshold + value) needs the signals endpoint to return the
  rule; **server-side cycle rollups + cross-view reconciliation to ONE source** (KPI vs cashdemand
  vs profit); per-block / per-worker drill; **synced (server-side) signal acknowledgement** (ack is
  localStorage-only today); regional / cross-farm cohort benchmark (needs ≥5 farms — honest building
  state, no fake cohort); i18n / voice. Deploy: frontend-only.
- **Gallery (/farm/records · gallery)** — LOCKED 2026-06-27 (Operator-approved). Audited → scorecard
  (6.0) → 8-persona → redesigned + wireframe → stress-tested ×2 → optimized. Page-local findings
  resolved: 200-event cap → pagination; honest copy ("field & event logs", not faked "every
  enterprise"); unified tile (tamper-evident badge + geotag + select + keyboard) across all views;
  action bar in any view; **Verified-only + search auto-exhaust** (bounded, honest cap); precise
  "Tamper-evident" wording (byte-integrity since logging, not capture authenticity); 401≠empty;
  Fiji dates; captured-by + GPS + OSM link in modal; <img> error fallback; **real downloadable
  evidence pack** (photos + verify manifest) replacing the dead Bank-Evidence navigate; render cap
  for paint speed. Wireframe: docs/TFOS_Gallery_Redesign_Wireframe.md. Remainder filed (backend,
  named — not faked): multi-source photos (harvests/poultry/cash — harvests list GET returns no
  photo_url; poultry none), EXIF capture-time, thumbnail variants + server photo index, Leaflet map
  view, AI photo analysis, cross-farm/worker filter, zip download, offline/PWA, i18n. Deploy: frontend-only.
- **History (/farm/history)** — LOCKED 2026-06-27 (Operator-approved). Audited → scorecard (4.0,
  capped by being unreachable) → 8-persona → redesigned + wireframe → stress-tested ×2 → optimized
  ×2. Page-local findings resolved: **made reachable** (was lazy-imported but never routed; /farm/history
  redirected to Records — now a real route + Farm sub-nav entry); **Fiji-local** day/time bucketing
  (was UTC string-slice → wrong day); **export includes tasks** (was dropped); **no raw UUIDs**;
  removed fake "chain INTACT" + dead per-row "Verify" → honest 48h-correction note + real /verify link;
  3 control rows → 2; decision summary (records/kg/cash/sprays/last); spray agronomic detail + photo
  lightbox; debounced **text-only** auto-exhaust search (category chips stay client-side) with honest
  25-page cap surfacing; "Ask TIS" deep-links /tis?q= with the range. Regression caught + fixed:
  removed-then-restored QueryClientProvider (FarmSelector needs it) — had crashed /farm/records too.
  Wireframe: docs/TFOS_History_Redesign_Wireframe.md. Remainder filed (backend/Phase B): server-side
  unified /history over audit.events w/ per-row hash + true totals + server search; offline/PWA cache;
  i18n; worker-name resolution + filter; corrections trail; government inspector + enterprise cross-farm/API;
  desktop two-pane/virtualization. Deploy: frontend-only.
- **Overview (/farm)** — LOCKED 2026-06-26 (Operator-approved). Audited → redesigned →
  optimized ×2 → stress-tested ×3 → all page-local findings (F1–F9, M1–M28, S1–S8,
  D1–D14, R1–R6) resolved; remainder are filed backend/cross-page slices. Do NOT
  redesign again unless new evidence requires it. Deploy: frontend-only (Tier 1).
- **Tasks (/farm/tasks)** — LOCKED 2026-06-26 (Operator-approved). Audited → redesigned →
  optimized → stress-tested ×2 → all page-local findings (T1–T8, N1–N8 [N1 retracted as a
  false alarm], TS1–TS9, U1–U5) resolved; remainder filed (T4 farm_id on /tasks, worker
  assignment, voice/i18n, compliance tag, photo upload, QueryClient lift). TS4 decided:
  single prioritized list (no kanban/toggle). Do NOT redesign again unless new evidence
  requires it. Deploy: frontend-only.
- **Weather (/farm/weather)** — LOCKED 2026-06-26 (Operator-approved). Audited → redesigned →
  optimized → stress-tested ×2 → all page-local findings (W1–W9, WX1–WX10, WXS1–WXS6,
  WS2-1–WS2-6) resolved; remainder filed (feed↔observations reconcile, push alerts, GDD/ET +
  crop-specific disease, per-block microclimate, insurance export, regional aggregate,
  thresholds→config, composite endpoint, voice/i18n). Verify-item: `tenant.weather_forecast`
  migration in prod. Do NOT redesign again unless new evidence requires it. Deploy: frontend-only.
- **Enterprise (/farm/enterprises)** — LOCKED 2026-06-26 (Operator-approved). Audited → redesigned →
  optimized → stress-tested ×1 → all page-local findings (E1–E10, EX1–EX10, ES1–ES7) resolved;
  remainder filed (real enterprise entity for Pause/Close/Worth/roles, animal financials,
  per-enterprise task count, per-block P&L grain, layer for animals/verticals, composite endpoint,
  grounded standing, certifications, ES3 200-cycle layer cap). 3-Layer doctrine surfaced. Do NOT
  redesign again unless new evidence requires it. Deploy: frontend-only.
- **Production (/farm/cycles + /cycles/:id)** — LOCKED 2026-06-26 (Operator-approved). Audited →
  redesigned → optimized → stress-tested ×1 → all page-local findings (P1–P8, PD-A–PD-H, PS1–PS5)
  resolved; remainder filed (Tasks honor ?cycle, per-cycle buyer link, BBCH stage, rotation
  disease warning, certifications, shared loading/error hook, 500-cycle cap). **WHD harvest-hold
  fails CLOSED** (PD-A safety). Do NOT redesign again unless new evidence requires it. Deploy: frontend-only.
- **Field Events (/farm/field-events)** — LOCKED 2026-06-26 (Operator-approved). Audited → redesigned
  (one write path = (+) Capture Engine; 3 legacy forms retired, ~1060 dead lines deleted, 1457→393)
  → stress-tested ×1 → all page-local findings (FE1–FE10, FX1–FX5, FES1–FES5) resolved or filed;
  remainder filed (list endpoint pu_name+author-name join [real FE1 fix], Capture Engine cycle-state
  rules FX2, WHD nudge at spray-log FE6, pest/disease severity+GPS FX4, server-side log filter,
  whole-farm feed). Do NOT redesign again unless new evidence requires it. Deploy: frontend-only.
- **Inventory (/farm/inventory → Resources tab)** — LOCKED 2026-06-26 (Operator-approved). Audited →
  redesigned → optimized → stress-tested ×1 → all page-local findings (I1–I7, I-T1–I-T3, IX1–IX7,
  INS1–INS5) resolved or filed; remainder filed (**IX1 keystone: backend auto-deduct on consumption**
  spray/feed-use → input-transaction USAGE [B37 generalized]; weighted-avg cost basis; server limit +
  date filter; item detail/movement-history; PO/awaiting-delivery; inline add-supplier; batch/lot/expiry
  traceability; seasonal days-left; QueryClient lift). On-hand is **honest** (note: sprays don't
  auto-deduct yet; flags when usage data fails to load). Do NOT redesign again unless new evidence
  requires it. Deploy: frontend-only.
- **Labour (/farm/labor → Resources tab)** — LOCKED 2026-06-26 (Operator-approved). Audited →
  deepened (8-persona) → redesigned → stress-tested ×1 → optimized — all page-local findings
  (L1–L32, L-BUG1, LS1/LS3/LS8/LS10/LS11b/LS13) resolved or filed. Fixed: removed crash landmine
  (undefined onSiteIds) + fabricated "Next payday" tile; pay defaults to this-week (no overpay
  anchor); min-wage soft guard; api.js + Fiji-day + cached-on-error; shared a11y <Modal>
  (Esc/focus/role) + arrow-key tabs; submit-lock vs double-booked wages; responsive wrap;
  real first-run; view-aware Ask AI. **Filed backend keystones (NOT faked):** payroll-period
  settlement + worker_id FK on payments (L3/L21/L22), single labour-cost source (L29), piece-rate
  (L17), REI clock-in safety (L19), FNPF/DOB statutory (L31), offline write queue (LS2), /labor
  server limit (LS6/L14), true request idempotency. On-hand pay numbers are **honest** ("Wages
  logged", settlement on roadmap). Do NOT redesign again unless new evidence requires it. Deploy: frontend-only.
- **Equipment (/farm/equipment → Resources tab)** — LOCKED 2026-06-26 (Operator-approved). Audited →
  deepened (8-persona) → redesigned → stress-tested ×1 → optimized — all page-local findings
  (EQ1–EQ40, ES1–ES15) resolved or filed. Fixed: removed printed farm UUID; honest cost labels
  ("operating cost/hr excl. depreciation" + "Value written down (book)" — nothing auto-depreciates);
  DECOMMISSIONED split to `retired` (excluded from down/service/book value); api.js + cached-on-error;
  Parts adjust modal (no window.prompt); resolve-with-condition; shared a11y <Modal> + arrow-key tabs;
  Fiji time; view-aware + per-asset ("repair or replace?") Ask AI; responsive KPI strips; Fleet sort;
  FirstRun; submit-locks; th scope. **ES5 (HIGH, FILED backend): no role gate on /equipment
  create+patch — any tenant user can decommission a capital asset; frontend hides Add/Edit for
  non-managers (fail-open) but the authoritative gate must be server-side.** Other filed keystones
  (NOT faked): fuel+maintenance → cash_ledger (EQ4), real depreciation + in cost/hr (EQ25), consume
  parts on repair (EQ26/EQ19), rental income (EQ27), implements (EQ28), km unit on create (EQ12),
  calibration/hygiene logs (EQ29/EQ30), location/holder (EQ35), utilization/ROA (EQ38), offline
  write queue (ES9), pagination past 200 (ES10). Do NOT redesign again unless new evidence requires it. Deploy: frontend-only.
- **Locations (/farm/locations → Resources tab)** — LOCKED 2026-06-26 (Operator-approved). Audited →
  deepened (8-persona) → redesigned → stress-tested ×1 → optimized — all page-local findings
  (LOC1–LOC34, LS1–LS12) resolved or filed. Fixed: removed printed farm UUID (×2) + retired
  ModeDropdown + emoji + redundant h1; api.js reads + write-failure toasts; map is the hero;
  **no-draw manual Add-block** (POST /production-units on-ramp); land summary (total/zones/blocks/
  unmapped); honest "Not mapped yet" for animals; collapsible More-tools; page + per-block Ask AI;
  shared a11y <Modal>; first-run card; friendly type labels. **LS1 honesty catch: removed a status
  legend the map didn't actually render (map colours by kind) — legend moved to the block list.**
  Filed (backend/FarmMap, NOT faked): colour map by block status (LOC23), feature-level edits +
  manual↔draw reconcile vs destructive PUT replace-all/duplicate PUs (LOC24/LS3), PostGIS spatial
  index (LOC30), area-by-3-Layer (LOC33 full), soil/water per block (LOC27/28), tenure/lease +
  verifiable GPS (LOC20/34), multi-parcel/subdivision (LOC25/26), delete/edit-area (LOC18), offline
  map (LOC19), reliable enterprise↔block binding (LS7), bulk import (LS11). Do NOT redesign again
  unless new evidence requires it. Deploy: frontend-only.
- **Buyers & sales (/farm/market → "Buyers & sales" tab)** — LOCKED 2026-06-26 (Operator-approved).
  Audited → deepened (8-persona) → redesigned → stress-tested ×1 → optimized — all page-local
  findings (B1–B32, BS1–BS10) resolved or filed. **#1 fix B1/B30: PAID reachable ONLY via Log
  payment (writes cash_ledger income + Bank Evidence); status select forward-only; PAID/CANCELLED
  out of the casual select; Cancel is confirmed — no more silent PAID-without-income.** Also: api.js
  + cached-on-error; formatMoney; Fiji time; shared a11y <Modal> + arrow-key tabs; to-chase banner;
  AR aging buckets + avg days; WhatsApp chase (intl-safe); multi-line orders (responsive); honest
  partial-pay warning; Orders filter+search; friendly status labels; view-aware Ask AI; submit-locks.
  **BS5 (HIGH, FILED backend): no role gate on /orders create/status/payment — any tenant user can
  cancel/mark-paid; frontend hides Cancel for non-managers (fail-open) but the authoritative gate
  must be server-side.** Other filed keystones (NOT faked): /status refuse PAID (B1-server),
  partial-payment state (B23), sale→harvest stock deduction/oversell guard (B24), provenance/
  traceability on sales (B27), invoice PDF (B16), credit limit (B26), animal sales via orders (B15),
  deliveries/pick-list (B31), DSO/revenue-trend (B32), offline queue, pagination (B20). Do NOT
  redesign again unless new evidence requires it. Deploy: frontend-only.
- **Payments (/farm/money → "Payments" tab)** — LOCKED 2026-06-26 (Operator-approved). Audited
  (PA1–PA16) → deepened 8-persona (PA17–PA29) → redesigned → stress-tested ×11 → optimized →
  provider quick-picks + honest copy. **#1 fix PA1: confirm books to the obligation's farm (or the
  current farm sent by the page), refusing when ambiguous instead of silently booking to the oldest
  farm — multi-farm Bank Evidence no longer corrupted.** Also: one Settle flow (instruction
  persistent, no toast loss); api.js wrapper keeping the 423 PIN-lock but no longer swallowing
  errors; allSettled load (one flaky call can't blank the page); current-farm "Books to" selector;
  one-tap Fiji provider quick-picks (M-PAiSA/MyCash/Digicel/BSP/ANZ/Westpac/HFC/Bred/Visa/MC +
  Other); real method chooser; overdue total+sort+flags; shared a11y Modal (no window.prompt/
  confirm); lucide icons; submit-locks; retry-safe confirm; friendly labels; search + show-settled;
  arrow-key tabs; enriched Ask AI; Fiji dates; honest "record now, charge later" copy. **Stress test
  caught a self-introduced white-screen crash (ST-P1 — useCurrentFarm w/o provider) — FIXED.**
  **Backend STAGED (no migration): PA1 farm-correct booking, PA18 idempotent instruct, PA24 Fiji
  date, ST-P2 adopt farm tag, ST-P3 real method label — needs `build --no-cache api` + verify-deploy.
  FILED (honest, not faked): ST-P10 server role gate/maker-checker, ST-P12 receipt-verify view +
  register export + FNPF/tax, PA22 partial settlement, PA23 Evidence-v2 on confirm, PA27 single AR
  truth, PATCH /methods/{id}/default, real in-app charging via gateway (adapter spec +
  onboarding checklist: `docs/TFOS_Payments_Provider_Adapter_Spec.md`; blocked on merchant account).**
  Do NOT redesign again unless new evidence requires it. Deploy: frontend `npm run build` + backend staged.
- **Compliance (/farm/compliance)** — LOCKED 2026-06-26 (Operator-approved). Audited (CO1–CO17) →
  deepened 8-persona (CO18–CO29) → redesigned → stress-tested ×11 (CC1–CC17) → optimized →
  CC7+CC16 built + hardened (EX1–EX3). **#1 fix: the page no longer FAKES a clean compliance state
  on load failure (CO1/CO2/CO3 + CC1–CC4) and no longer HIDES off-label/unidentified sprays
  (CO18/CO19) — on the surface lenders + regulators trust most.** Backend (crop_compliance.py):
  LEFT JOIN library + read stored whd_clearance_date (mislogged/off-label surfaced not dropped);
  off_label via registered_crops + reg_unknown flag; register adds dose/applied_by/full audit_hash;
  YTD uses current year; **NEW** `/compliance-summary` per-farm rollup (CC7) + `/register.csv`
  injection-safe export (CC16/EX1). Frontend (CropCompliance.jsx): QueryState ErrorCard/Retry
  everywhere (never green-on-error); verdict banner; real "Compliance standing" (no fake score);
  needs-attention + off-label cards (amber, not red); api.js; view-aware Ask AI; role=tab + arrow
  keys; shared Modal override (de-emphasised + block-preselected); multi-farm RollupBanner (capped
  12); register CSV download + per-row /verify/{hash} share link; responsive. Every button/download/
  share reaches a real endpoint. **Backend STAGED (no migration) — needs `build --no-cache api` +
  verify-deploy.** **FILED (honest gaps, not lies): CO5 farm-scope overrides (needs farm_id column +
  migration), CO20 precomputed holds (Inviolable-#3 at scale), CO21/CO22/CO23 unified animal-drug
  compliance / re-entry interval / MRL, CO9 cert store, CC9 mobile table columns, CC17 harvest-vs-
  orders, CO29 kava-180/PHI.** Do NOT redesign again unless new evidence requires it. Deploy:
  frontend `npm run build` + backend staged.
- **Agricultural Passport + TATI (/me/passport + verify/share/attest portals)** — LOCKED 2026-06-27
  (Operator-approved). The TATI platform (Phases 0–4): Passport read-model, Trust Engine,
  Share Sessions, Attestation, AI Summary, Document Vault. Audited (P1–P17) → 8-persona (PP18–PP29)
  → redesigned → stress ×11 (PR1–PR9) → optimized. **#1 fix (PP-18/PR-1): attestation made honest —
  a self-confirmed "officer" no longer fakes independence; link confirmations earn PARTIAL
  "community-attested" credit (trust v3 channel-discount, cap 20→38), real officers no longer
  punished by the IP heuristic (shared-NAT false-positives), IP match kept as a transparency flag
  only.** Also: public /verify proof-only (D2); Share Sessions (hashed token, expiry/revoke/one-time/
  password, access log, opt-in evidence+documents scope); Trust Engine precomputed (Inviolable #3),
  pure, expiry+recency decay + scale-magnitude; trust compute OFF the request (Celery single-tenant
  task, PR-2); AI summary grounding-validated (Inviolable #1, P-6); Document Vault disk + owner-gated
  retrieval + SHA-256; Passport hero (SVG gauge + band + as-of + milestone), prominent Share,
  attention strip; photo reuses avatar (Golden Rule). **Migrations 187→193 (apply-as-owner) +
  frontend — see `docs/TATI_DEPLOY_RUNBOOK.md` (one-paste + security smoke).** **FILED (honest,
  partner/scale-gated): PP-27 verifier ACCOUNTS (the real KYC independence — Phase 5), P-3 full
  document chain-anchoring, P-5 per-farm/cooperative scoping (multi-farm over-share), PR-5
  low-literacy/voice, PP-20 device/velocity anti-fraud, PP-21 push/WhatsApp notifications, PP-22
  config formula, PP-25 per-enterprise.** **Build is on-branch; PROVEN ONLY by py_compile/npm/engine
  tests — must deploy + run the runbook security smoke before any farmer/bank relies on it.** Do NOT
  redesign again unless new evidence requires it; the next TATI step is Phase 5 (verifier accounts)
  AFTER the alpha exercises Phases 1–4.

---

## 1. Overview (/farm) — REDESIGNED (2026-06-26) — ✅ shipped to branch, awaiting deploy

Audit approved → full redesign of `FarmDashboard.jsx` executed per
`docs/TFOS_Overview_Redesign_Wireframe.md`. Build clean (`npm run build` ✓,
i18n guard ✓). Frontend-only; no backend changed (safe slice).

**New structure (cognitive-load first):** Header (real updated-time) → Needs-you-now
band (the ONE decision) → 4 glance tiles (Cash · Net · Tasks today · Watch) →
Farm health + Decide pair → Enterprise portfolio → Money snapshot + Recent field
activity → owner depth (Ops row, Enterprise/Multi-farm compare, conditional) →
Active cycles (ACTIVE+HARVESTING) → real audit-chain footer. + Skeleton loading +
first-run "create your first farm" state.

**Fixed (verified in new code):** F1 dead code removed (881→~470 lines, 13 dead
components + dead imports gone) · F2 health copy reflects grade · F4 "watch" only
when an enterprise sold at a loss (income>0 && net<0) · F5 in-page nav dropped
(sidebar owns it) · M1 real `dataUpdatedAt` not render time · M2/M3/M28 first-run +
skeleton states · M4 single net source (financials/farm summary) · M5 poultry cards
→ /farm/poultry · M6 health uses flock survival + holds (no more always-100) ·
M9 aria-labels on score rings · M18 dedupe — `["farms"]` shared with FarmSelector +
active cycles inlined from page data (no second /cycles or /farms fetch) ·
M21 no UUID author in activity feed · M22 no-op `||"Crop"||"—"` fallback gone ·
M23 HARVESTING cycles shown · upcoming WHD clearances now drive Needs-you-now +
decisions. Internal links point at merged routes (F9).

**Filed (labelled honestly in-page, NOT faked):** composite `GET /farm/overview/{id}`
reading pre-computed signals (Inviolable #3 / M27, keystone next slice); `farm_id`
on `/tasks` (M25 — page labels tasks "across all farms"); whole-farm activity feed
(M20 — page labels the strip "Recent field activity · crop field events"); lift
CurrentFarmProvider to FarmerShell (M24/B31); bound list queries server-side (M26).

**Note:** bundle barely shrank (53→51 KB) — Rollup already tree-shook the unused
components; the real win is correctness + maintainability, not size (honest).

**DEPLOY:** frontend-only → `cd /opt/teivaka/frontend && npm run build` (Caddy serves
dist). No migration, no API rebuild. Verify: open teivaka.com/farm — skeleton then
Needs-you-now band; tap a flock card → poultry dashboard; "Updated HH:MM" is real.

**Status:** ✅ redesign shipped to `claude/beautiful-fermi-F0dLX`. Backend keystone
(composite endpoint) is the next slice when you want the query fan-out collapsed.

---

## 1-opt2. Overview (/farm) + sidebar — OPTIMIZATION PASS 2 (2026-06-26) — ✅ shipped

Third stress test surfaced two regressions I caused chasing pass-1 speed, plus
quick wins. All fixed. Build ✓.

- **R1 (regression) FIXED** — pass-1 dropped `/auth/me` and read the name from the
  JWT, but the access token has no name claim (`auth.py:106`) → greeting was always
  nameless. Re-added the `["me"]` query (staleTime 5m); greeting personalised again.
- **R2 (regression) FIXED — AI now real** — `/tis?q=…` was cosmetic (TIS.jsx never read
  it). Wired TIS to consume `?q=` once on mount and auto-send (guarded ref, no double-
  send; the click-event guard in `send(textArg)` keeps button/Enter callers safe).
  "Ask AI" from Overview now actually asks the contextual question. (DO-NOT-TOUCH TIS.jsx
  override — surgical: one effect + one signature change.)
- **R5 FIXED — safer one-tap Done** — optimistic hide on tap (can't double-complete),
  reverts on failure with a toast; `aria-live="polite"` on the Needs-you-now region so
  screen readers announce the current priority.
- **R6 FIXED** — EnterpriseCompare capped to 8 + "+N more" (consistent with the farms cap).
- a11y: reduced-motion on the sidebar chevron.

**Sidebar updated (fewer clicks + simplicity):** promoted the two daily-use destinations
**Tasks** and **Weather** to one-click top-level items (Tasks badge now always visible)
and dropped the 2-item "Plan" group. Farm rail order: Overview · Tasks · Weather ·
Grow · Sell · Prove · Insights · Account · Quick Add. LeftRail passes the open-task
badge to the top-level Tasks item.

**Still open (carry-over, backend/cross-page — honestly NOT fixed):** low-literacy
voice/i18n (S6); government/enterprise role-based view + P&L gating (S5); tasks
tenant-wide + cap 50 (S7); FarmSelector search at 500 farms; whole-farm activity feed
(M20). R3 (hard-logout on flaky refresh) + R4 (reconnect refetch herd) left as
correctness-vs-resilience trade-offs to tune deliberately, not patch.

**DEPLOY:** frontend-only → `cd /opt/teivaka/frontend && npm run build`. Verify: greeting
shows your name; Overview "Ask AI" opens TIS and auto-asks; tap Done → task vanishes
once, reverts if offline; sidebar shows Tasks (with badge) + Weather as top-level.

---

## 1-opt. Overview (/farm) — OPTIMIZATION PASS (2026-06-26) — ✅ shipped to branch

Stress-tested across 11 personas (two rounds) → optimized for speed / automation /
AI / simplicity / accessibility, folding in the critical stress-test fixes. Build ✓.

**Speed.** All derivations moved into one `useMemo` (D6) — no recompute on tab/modal
re-render. Dropped the unused `/farms/{id}` and `/auth/me` queries (name now from the
JWT via getCurrentUser) → **12→10 calls**. `refetchOnReconnect` + `retry:1` so a flaky
link self-heals instead of sticking on error.

**Honesty under failure (was the worst weakness).** Routed every call through
`utils/api` (token auto-refresh + humanised errors, B88) → an **expired session no
longer renders "FJ$ 0 / All clear"** (D14). farms-*error* now shows a Retry card, not
"create your first farm" (S2). Errored money shows "—" not 0 (S1). A `degraded` banner
("showing last saved values · Retry") replaces silent false data; the all-clear line
only shows when tasks+compliance actually loaded.

**Automation / fewer clicks.** Complete the top task **one-tap from "Needs you now"**
(no navigate). Auto-refetch on reconnect + after cycle-create.

**AI.** "Ask AI" (header removed, now in Decide) **deep-links TIS pre-seeded with the
live situation** (`/tis?q=…` — the hold, or the losing enterprise, or a general ask).
Honest: TIS still answers from the KB; we only frame the question.

**Simplicity.** One header action (Log); "Ask AI" lives where the decision is. Owner
depth (Ops, Enterprise/Multi-farm compare) only renders when it has data. Stale
docstring fixed.

**Accessibility.** `prefers-reduced-motion` honoured (`motion-reduce:` on every pulse/
transition); Active-cycle rows keyboard-operable (role=button, tabIndex, Enter/Space);
aria-labels on rings + `aria-hidden` on decorative icons; tab row uses role=tab.

**Correctness.** "Today" computed in **Pacific/Fiji** to match the backend day-boundary
(D2). MultiFarmCompare capped to 6 + "view all" (S4/500-farm). pu_name (not raw pu_id)
+ author dropped in the activity strip (D4/M21).

**D1 🔴 shared-device cache — CLOSED (2026-06-26).** Root cause: both user-initiated
sign-outs (`FarmerLayout.handleLogout`, `MeMenu.handleSignOut`) did a SOFT router
navigate + only cleared the two token keys — leaving `tfos_current_farm_id` behind and
the SPA's in-memory caches (module-level React Query clients, context) alive, so the
next user on a shared device briefly saw the previous user's data. Fix: new
`utils/auth.logout()` clears ALL auth localStorage (tokens + onboarding +
`tfos_current_farm_id`) then HARD-navigates (`window.location.assign("/login")`) — a
full reload guarantees every in-memory cache is wiped (mirrors the 401 path). Both
sign-out handlers now call it. `clearAllAuth()` also drops `tfos_current_farm_id`.
FarmerLayout edit = explicit DO-NOT-TOUCH override (2-line security fix to the logout
handler only, not the protected trial-chip/`/auth/me` logic). Removed the now-dead
`useNavigate` in both files. Build ✓.

**STILL OPEN (backend / cross-page, filed — not page-local):**
- Backend keystones unchanged: composite `/farm/overview` (Inviolable #3), `farm_id`
  on /tasks (D-tasks tenant-wide), whole-farm activity feed, role-based view (S5),
  voice/i18n for low-literacy (S6).

**DEPLOY:** frontend-only → `cd /opt/teivaka/frontend && npm run build`. No API/migration.
Verify: expire your token (wait or clear access) → page refreshes via refresh-token,
no false zeros; pull network → "showing saved data" banner; tap Done on the top task →
it completes without leaving Overview.

**Status:** ✅ optimization shipped. Next 🔴 to clear is D1 (logout cache) — auth-path,
staged for your review.

---

## 1-audit. Overview (/farm) — FORMAL FRAMEWORK AUDIT (2026-06-26) — audit record (superseded by redesign above)

Forensic audit of `frontend/src/pages/farmer/FarmDashboard.jsx` (881 lines) under the
ratified TFOS Review Framework. Backend contracts for all 12 live queries verified
against the routers (not assumed). **Audit only — no code changed; redesign awaits approval.**

**What actually renders (live path, return @811-868):** OvHeader · LayerBackfillBanner ·
HealthKpis (health hero + 5 KPIs) · AttentionAdvisor · OpsRow · EnterprisePortfolio ·
EnterpriseCompare + MultiFarmCompare · FinancialSnapshot + Recent Activity · Active cycles
(ActiveCyclesTable) · FarmSectionsNav · audit-chain footer · NewCycleModal.

**Data contracts (VERIFIED in routers).** No array-crash risk on the live path:
`financials/crops` (financials.py:135) + `labor` (labor.py:95) + `farms` (farms.py:108)
always return arrays; object endpoints (farm summary, flocks{items}, cycles{cycles},
tasks{tasks}, cash-ledger{cash_balance_fjd}, compliance{blocked_count}, chain-status)
are correctly unwrapped. Frontend extraction (716-722) matches. Theme tokens valid
(`--cream-2` index.css:41/60). All live nav targets resolve (several via the merge
redirects added in App.jsx:385-397).

**FINDINGS (ranked).**
- **F1 · SEV-1 · DEAD CODE (~40% of file).** 13 components are defined and NEVER
  rendered: HeaderRow, PillarCards, BankabilityPath, Priorities, WeatherStrip,
  FarmSummary, HeadlineMetrics, Intelligence, CyclePipeline, FarmComparison,
  QuickActions, + atoms Section & Tile, + dead helpers fjd/roiTxt/gradeColor/
  wmoWx/wx1/wxDay, + dead imports useFormModal & ModeDropdown (B90 residue lives
  here). ≈ lines 50-389. Ships in the 53 KB chunk, and the file's own header
  docstring describes components that don't render — actively misleads any auditor.
  WeatherStrip being dead means the page does NOT fetch weather (good for query
  count, but the section a farmer might expect is simply absent).
- **F2 · SEV-1 · HONESTY DEFECT.** Health-hero subtext is hardcoded optimistic —
  `"Your farm is performing — tap to view full health"` (line 453) shows regardless
  of score. A struggling farm (score 20 / "At risk") still reads "performing". This
  is a banker-facing surface; copy must reflect the real grade.
- **F3 · SEV-2 · OVER-CONFIDENT SCORE.** Farm-health `/100` (742-750) is a naive
  heuristic: crops scored 100 or 75 (only signal = net≥0), flocks ALWAYS 100
  (ignores mortality/survival), holds the only real deduction. Presented as a precise
  graded score ("Very Good"). Conflates "has activity" with "healthy". Honest-ish
  (rubric is commented, holds are real) but the precision + grade label oversell what
  the math supports.
- **F4 · SEV-2 · NOISY ALERTS.** `alerts = holds + (#crops with net<0)` (line 780).
  Every new planting (costs logged before harvest income) counts as an alert → the
  Alerts KPI + AttentionAdvisor cry wolf for normal early-cycle economics.
- **F5 · SEV-2 · DUPLICATE NAV.** In-page `FarmSectionsNav` (line 842) now duplicates
  the persistent LeftRail sidebar shipped this session. Two farm navigations on one
  screen.
- **F6 · SEV-3 · SCALE.** 12 parallel queries per open (farm, fin, crops, flocks,
  cycles, tasks, cash, farms, labor, compliance, chain, me). Fine at alpha; filed
  composite `GET /farm/overview/{id}` for scale.
- **F7 · SEV-3 · HOOKS FRAGILITY.** `q = (key,fn,enabled)=>useQuery(...)` (702) calls
  a hook inside a helper. Works (stable call order) but violates rules-of-hooks lint
  and breaks the moment any q() is wrapped in a condition.
- **F8 · SEV-3.** Nested `QueryClientProvider` local to this page (874) — cache not
  shared with the shell (B31: lift to FarmerShell).
- **F9 · SEV-3.** Internal links point at OLD routes (/farm/cash, /farm/analytics,
  /farm/reports, /farm/history, /farm/locations, /farm/labor) that now redirect —
  works but adds a navigation hop; should target merged routes directly.

**Strengths (PASS).** Real RLS data on every live tile; honest "—"/"Building" gaps
(worth, credit, FRCS, demand, margin); array-guarded live path (verified, won't
white-screen); `formatMoney()` (i18n-safe) on the live path; strike-mandated pieces
preserved (LayerBackfillBanner #104a, real audit-chain footer via /me/chain-status);
security clean (auth + farm-scoped + server-side RLS, no secrets in URLs).

**Verdict:** functionally honest and non-crashing, but carrying a large dead-code
mass (F1), one real honesty defect (F2), and two trust-eroding heuristics (F3/F4).
Redesign scope = delete F1, fix F2 copy, ground/soften F3+F4, drop F5, point links
at merged routes (F9). F6-F8 are backend/infra slices. **Awaiting approval to redesign.**

---

## 1-prev. Overview (/farm) — 🟡 improved (earlier pass, superseded by formal audit above)

**Brutal assessment.** Recently rebuilt to prototype format (real KPIs, Attention,
Advisor, Portfolio, Financial, Recent Activity) — solid and honest, but had two
real defects surfaced on the live screen and one scale risk.

**Strengths.** Real RLS data on every tile; flat icons + theme; Array-guarded (no
blank screen); honest gaps (AI recs "Building", 90-day projection omitted);
strike-mandated pieces preserved (LayerBackfillBanner, audit-chain footer); clear
"what/why" via Attention + Advisor.

**Weaknesses (found).**
- Cash Balance rendered blank — extraction read `data.balance`, but the endpoint
  returns `data.cash_balance_fjd` (cash.py:~352). FIXED → reads cash_balance_fjd,
  numeric, shows FJD 0 not blank.
- Best == Watch when only one enterprise has P&L signal (FarmDashboard derivations).
  FIXED → Watch only shows with ≥2 distinct enterprises; else "All healthy".

**Information architecture / layout.** Header → Health hero + 5 KPIs → Attention +
Advisor → Enterprise Portfolio (tabs) → Financial + Recent Activity → Active Cycles
→ audit-chain footer. Good hierarchy; matches "what next / why".

**UX + mobile.** Tiles tap to the right surface; one-handed grid; flat icons; plain
language. OK.

**AI opportunities (grounded only).** Real Best/Riskiest shown; recommendations +
90-day projection require a decision-engine projection + grounded advisor — flagged
future, not faked.

**Integration.** Links to cash / enterprises / tasks / compliance / reports / tis;
reuses financials, flocks, cycles, tasks, cash-ledger, compliance, chain-status.

**SCALE BREAKPOINT (named).** The page fires ~12 parallel queries per open (farm,
fin, crops, flocks, cycles, tasks, cash, farms, labor, compliance, chain, me).
Fine for alpha; at ~10k+ concurrent dashboard opens this is 12× the round-trips and
will pressure the API/DB pool. RECOMMEND (staged, next backend slice): a single
composite `GET /farm/overview/{farm_id}` that returns the dashboard payload in one
call. Not built this pass (additive backend work; no fabrication).

**Security.** All queries auth + farm-scoped; RLS enforced server-side. OK.

**Owner-completeness pass (what an owner of 1 farm or many, 0 or 100s of workers
wants):** added — all real, no fabrication:
- OPS row tiles: Harvested (total kg this season), Workforce (workers · hours · wages
  this week), Cost/kg (labour+inputs ÷ kg), Farms (count). From financials/crops
  (total_harvest_kg, cokg_fjd_per_kg), labor, /farms.
- ENTERPRISE COMPARISON tile: every enterprise ranked by net, with income / net / kg
  / cost-per-kg + a relative bar. From financials/crops.
- MULTI-FARM COMPARISON tile (shows only when >1 farm): per farm active cycles /
  workers / crop types / open alerts — straight from the single /farms aggregate
  (no extra calls). NOTE: per-farm NET comparison needs per-farm financials → filed
  as a /farms/portfolio aggregate (operational comparison shipped now).
Still-missing for a future pass (flagged, not faked): per-farm net/health in the
multi-farm table; income/ROI trend-over-time mini-chart (MV monthly rows exist);
inventory stock value; receivables/payables split.

**Status:** 🟡 — defects fixed + owner comparison/analytics tiles shipped; per-farm
financial aggregate + trend chart filed for a backend slice.

---

## IA RESTRUCTURE (pillar-wide) — 🟡 nav grouped (this pass)

**Finding:** the pillar had ~22 flat destinations, in no workflow order, and the
farm nav (FarmSectionsNav) had been dropped from the rebuilt Overview — so there was
NO organized in-pillar navigation. FarmerLayout tabs are app-level, not farm
destinations.

**Done:** FarmSectionsNav rewritten into 6 natural-farming-order groups —
PLAN (Overview·Tasks·Weather) · GROW (Enterprises·Production·Inventory·Labour·
Equipment·Locations) · SELL (Buyers·Services·Cash·Payments) · PROVE (Compliance·
History·Reports·Gallery) · IMPROVE (Analytics·Decisions) · ACCOUNT (Library·
Partnerships·Settings). Same 22 real routes (no dead links). Re-surfaced on Overview.

**Page-merge plan (executed per-destination during each audit, with route redirects
so nothing breaks):**
- Cash + Payments → Money (tabs)        · Buyers + Services + Marketplace → Market
- Analytics + Decisions + Insights → Insights  · History + Reports + Gallery → Records
- Inventory + Labour + Equipment + Locations → Resources (group)
- Library → Settings/Help · Partnerships → Business/Settings
Target: 22 → ~12 destinations once merges land.

**Missing (Plan side) — filed:** Calendar/Plan view, Budget-vs-actual,
Notifications inbox, surfaced Verify/traceability entry.

**Status:** 🟡 — nav grouped + workflow-ordered + re-surfaced.

### Page merges EXECUTED (tabbed destinations + redirects) — ✅
New `FarmTabs` shell lazy-loads existing pages as sub-tabs (no rewrite, no lost
function); ?tab syncs so redirects land on the right tab. 22 → ~12 destinations:
- **/farm/money** = Cash · Payments
- **/farm/market** = Buyers & sales · Services
- **/farm/records** = History · Reports · Gallery
- **/farm/insights** = Analytics · Decisions
- **/farm/resources** = Inventory · Labour · Equipment · Locations
Old routes (cash/payments/buyers/services/history/reports/gallery/analytics/
decisions/inventory/labor/equipment/locations) now `<Navigate>`-redirect to their
merged home+tab — every deep link + internal navigate() still works. Nav GROUPS
updated to the merged set. Foundation ready for a persistent grouped sidebar.
KNOWN COSMETIC FOLLOW-UP: each child page still renders its own header/FarmSelector,
so a merged page shows the tab strip + the child's title (mild redundancy). Clean
by adding an `embedded` (hide-header) prop to child pages in a later pass.

### Persistent grouped sidebar BUILT — ✅
The farm rail (`LeftRail` desktop + `PillarSubNavStrip` mobile/tablet) now renders
the consolidated nav from a single source of truth (`pillarSubNavMap.js`). Both
`FARM_NAV_GROUPS` (desktop collapsible) and `PILLAR_SUB_NAV["/farm"]` (mobile flat
strip) rewritten to the **merged destinations in natural farming order**:
- **Overview** (item, /farm)
- **Plan** — Tasks · Weather
- **Grow** — Enterprises · Production · Field log · Resources
- **Sell** — Market · Money
- **Prove** — Compliance · Records
- **Insights** (item, /farm/insights)
- **Account** — Library · Partnerships · Settings
- Quick Add (+) launcher
Every link points at a LIVE merged route (verified against App.jsx :379-397 — the 5
merged pages exist + 13 old routes redirect into them). No dead links. Task-count
badge preserved on the Plan group (collapsed-state surfaces open-task count). Desktop
collapsible group memory + active-group force-expand intact. Build clean.
22 flat routes → 15 destinations in 5 workflow groups + 2 standalone items.

---
(remaining destinations pending — appended as each is audited)

---

## 2. Tasks (/farm/tasks) — REDESIGNED (2026-06-26, audit-approved) — ✅ shipped to branch

Full rebuild of `FarmTasks.jsx` per the approved audit + `docs/TFOS_Tasks_Redesign_Wireframe.md`.
Build ✓ (chunk 53→19 KB). Frontend-only.

**CORRECTION ON RECORD (integrity):** the audit's **N1 "completion loop broken
end-to-end" was WRONG** — I grepped `completeTaskFromUrl` (a comment phrase) not the
real export `completeLinkedTask`, which HarvestNew (:279), CycleNew (:239) and poultry
HealthObservationNew (:78) all call. Routed tasks DO close. Retracted. The real gap was
only **T2** (input-required, non-routed tasks posting `""` → 422). Score corrected 4.5 → 6.

**New structure (cognitive-load-first):** header → **Do this next hero (FIRST, T6)** →
one honest progress bar (replaces 5 KPIs incl. the duplicate "Today's Focus"/"Todo
Today", T5/N3) → **Today & overdue** list with always-visible complete (no 2-tap menu) →
**Coming up** collapsible (Tomorrow/This week/Later — replaces the 5-col kanban) →
crop-plan demoted to a labelled secondary section (N2) → quick-add.

**Fixed (verified):** T1 (`utils/api` token-refresh + real error banner, no false "all
caught up"); **T2 completion always works** (routed→form; input-required→inline typed
field w/ validation; else one-tap — no blind `""`); T3 (Fiji time); T5/T7 (session
progress, dropped 200-row COMPLETED fetch); N3 (dup KPIs gone; **orphan Tasks.jsx
deleted**); N5 (icon from `icon_key`); N7 (refetch on reconnect/focus); a11y (aria-live,
progressbar, reduced-motion, keyboard, menu Esc/outside-click); AI ("Ask AI" per task
via `/tis?q=`); optimistic complete/skip with revert-on-failure.

**Filed (backend/cross-page):** `farm_id` on `/tasks` (T4 tenant-wide); worker
assignment/roles; recurring tasks; surfaced AI-suggest.

**DEPLOY:** frontend-only → `cd /opt/teivaka/frontend && npm run build`. Verify: hero
first; one-tap no-input task; input task shows inline field (no error); routed task opens
form + closes on submit; kill network → error banner not "all caught up".

---

## 2-audit. Tasks (/farm/tasks) — FORMAL FRAMEWORK AUDIT (2026-06-26) — audit record (superseded by redesign above)

Forensic audit of `FarmTasks.jsx` (383 lines). Backend contracts verified
(`/tasks`, `/crop-plan/farm-steps`, `taskBridge`, `/tasks/{id}/complete`). The page
got the "Do this next" hero earlier but never a full audit — it predates the Overview
fixes, so it carries the same class of defects + one verified functional bug.

**FINDINGS (ranked).**
- **T1 · 🔴 False "all caught up" on API error.** Raw fetch + local getJSON, retry:0,
  no error state → token expiry / 500 / offline → `openTasks=[]` → renders
  "Nothing to do — you're on top of it" (`:299-304`). Bypasses the refreshing api.js
  client (D14/S1 — the exact defect fixed on Overview).
- **T2 · 🔴 One-tap "Done" broken for input-requiring tasks.** `onDone` sends
  `input_value: ""` when `input_hint !== "none"` (`:250`), but the backend 422s unless
  the value matches the hint (`tasks.py:124-137`). The hero "Mark done" + card "Done"
  FAIL for any weight/text/photo task lacking a taskTarget route → "Couldn't complete
  (needs input?)" with no way to supply it.
- **T3 · 🟠 UTC not Fiji** — `todayISO`/`whenOf` (`:37-49`) bucket Today/Overdue/
  Tomorrow in UTC (D2). Mis-classifies near local midnight.
- **T4 · 🟠 Tasks tenant-wide, not farm-scoped** — `/tasks?status=OPEN` has no farm_id
  (`:221`, backend confirmed) yet the page is farm-selected; switching farms shows the
  same tasks (S7/M25).
- **T5 · 🟠 "Done" KPI mislabeled "Completed this session"** — actually lifetime
  completed, capped 200 (`:222/232`). Inflated/misleading.
- **T6 · 🟡 "Do this next" hero buried** — CropPlan renders above Board (`:367-368`),
  so the single most important action sits below the crop-plan list.
- **T7 · 🟡 200 COMPLETED tasks fetched just for a count** (`:222`). Needs a count.
- **T8 · 🟡 No loading skeleton / no error state** (inconsistent with locked Overview).
- **T9 · 🟡 nextTask ignores crop-plan "Do now" steps** (hero = task_queue only).
- **T10 · 🟡 No worker assignment / "whose task"** (enterprise). T13 🟢 skip reason
  hardcoded; icons lack aria-hidden.

**Strengths.** Real task_queue + audit on complete/skip; honest no-fake-AI; the hero
pattern; taskTarget routes actionable tasks to prefilled forms; crop-plan integration;
quick-add; bounded 200; flat icons + theme.

**Overall: 6/10** — good tool + right hero, dragged down by 2 🔴 (false-empty T1,
broken Done T2) + tenant-wide (T4) + mislabeled KPI (T5) + buried hero (T6).

**Proposed redesign scope (awaiting approval):** T2 (Done routes input tasks to an
inline input/form, never submits ""), T1 (api.js + real error state), T3 (Fiji time),
T5 (honest label), T6 (hero first), T7/T8 (count + skeleton); T4 farm-scope filed
(backend). Mirrors the locked-Overview standard. **Redesign NOT started.**

---

## 2-prev. Tasks (/farm/tasks) — 🟡 redesigned (earlier "Do this next" pass, superseded by formal audit above)

**Brutal truth.** Strong manager tool (kanban + KPIs + crop-plan + quick-add + real
complete/skip with audit), but it FAILED the tired-farmer / 5-second / low-literacy
test: it opened to a 5-column board + 5 KPIs to parse, never answering "what do I do
right now?" Great for a farm manager, overwhelming for a smallholder.

**Fix shipped.** A "Do this next" hero at the very top — the single highest-priority
task (due-now first, then rank), with the WHY (body_md / priority / due) and one-tap
"Mark done" (or its log-target route) + Skip. Board/KPIs remain below for managers
(progressive disclosure: one action first, depth after). All-caught-up state too.

**Strengths.** Real task_queue + audit on complete/skip; crop-plan next steps; quick
-add chips → /tasks/manual; due-bucket + priority logic; Array-guarded.

**Weaknesses / missing (filed).** No voice/photo task logging (low literacy); no
worker-assignment or bulk-complete (commercial); no snooze; AI auto-prioritise +
weather/compliance-driven suggestions exist server-side (generator) but no on-page
"AI suggest"; recurring tasks not surfaced.

**AI opportunities.** Auto-rank next action; "you usually do X on Tuesdays"; surface
weather spray-window + compliance auto-tasks inline. (Grounded — needs the generator
wired to a suggest endpoint; not faked.)

**Mobile.** Hero is one-handed + thumb-friendly; board stacks to single column.

**Integration.** Tasks ↔ cycles (crop plan), compliance (auto-tasks), weather (spray
window), labour (assign — future). Done emits audit → Records.

**Scale breakpoint.** 2 list queries (OPEN+COMPLETED, limit 200) — fine; at 10k+
tasks/farm add server-side pagination + filter (filed).

**Status:** 🟡 — "Do this next" redesign shipped; worker-assign / voice-log / AI-suggest
filed for backend slices.

---

## 3. Weather (/farm/weather) — REDESIGNED (2026-06-26, audit-approved) — ✅ shipped to branch

Full rebuild of `WeatherPage.jsx` per the approved audit + `docs/TFOS_Weather_Redesign_Wireframe.md`.
Build ✓ (chunk → 26 KB). Frontend-only. The forecast feed IS live (weather_worker, Open-Meteo
+ GDACS, 3-hourly per celery_app.py:120-128) — the old docstring "feed not connected" was stale.

**Structure (feed-primary, decision-first):** header (Ask AI + Log) → cyclone RED card at TOP
when active (+ "Add prep task" weather→task bridge) → NOW hero (live feed; staleness note;
one-tap "Log a ground reading" prefilled from the reading) → THIS WEEK (consolidated: outlook
headline + 7-day strip + spray/harvest/plant windows + disease line) → What this weather means
(one shared crop card + per-animal) → compact GREEN cyclone line → collapsible "Your logged
history" (summary + observations, deferred until opened).

**Fixed (verified):** W1 (api.js token-refresh; error→Retry vs empty→"updates every 3h / set
location" + Locations link — no false "set your location" on error). W2 (Fiji time). W3 (one
shared crop card, not faux per-crop). W4 (3 advisories → 1 "this week" block). W5 (ModeDropdown
removed). W6/W8 (refetchOnReconnect; summary+obs deferred until history opened → 8→6 initial
calls). WX1 (guidance now from the LIVE feed not just manual log; manual log demoted to optional
ground-reading; one-tap log prefilled from the now-reading). **WX2 (spray window gated on WIND
≥25, not just rain — agronomic correctness fix).** WX4 (staleness surfaced when fetched_at >4h).
WX5 (cyclone leads when active + "Add prep task" creates a real /tasks/manual task). W7
(progressive disclosure). a11y (aria-hidden icons, reduced-motion, role=alert on cyclone). More
AI (Ask AI → /tis?q= weather brief). Centered max-w-4xl column.

**Filed (backend/cross-page, honest — not faked):** reconcile feed↔observations data layer
(auto-populate summary/observations from weather_forecast so "last 30 days" works for feed-only
farmers — WX1 data layer); cyclone/heavy-rain PUSH alerts (WX5 proactive); GDD/evapotranspiration
+ crop-specific disease via KB (WX3); per-block microclimate (WX6); weather-as-insurance/loss-
evidence export (WX7); regional aggregate for extension (WX10); thresholds→config (WX8);
composite weather endpoint + shared QueryClient (W9); voice/i18n.

**DEPLOY:** frontend-only → `cd /opt/teivaka/frontend && npm run build`. Verify: active cyclone
shows red at top with "Add prep task"; Now hero shows live temp + "Log a ground reading"
prefilled; spray shows HOLD on a windy-but-dry day; history collapsed (opens → loads summary).
Verify-item: confirm `tenant.weather_forecast` migration exists in prod (else forecast 500s).

**Status:** ✅ redesign shipped. Awaiting stress pass / approval to lock.

---

## 4. Enterprise (/farm/enterprises) — AUDITED + REDESIGNED (2026-06-26, approved) — ✅ shipped

Audit findings E1–E10 + EX1–EX10 (chat); approved → full rebuild of `Enterprises.jsx` per
`docs/TFOS_Enterprise_Redesign_Wireframe.md`. Build ✓ (chunk 47.7→39.6 KB). Frontend-only.

**Headline fixes:** EX1 — **3-Layer doctrine surfaced** (Strike #101): a "By layer" 3-axis
summary strip + a layer badge on every card + a layer filter; layer read per crop from
`/cycles` (production_id→layer). EX3 — enterprise has no entity → **removed the dead
Pause/Close/Worth actions** (filed a real entity). EX2 — **dropped the hardcoded "Open
tasks: 0"** (replaced with the Layer KPI). E2/EX4/EX5 — **no black-box /100**: honest
standing labels (Profitable / Building / Losing for crops; "{n}% survival" for animals);
removed the invalid mixed-unit portfolio average. E4 — **13-tab detail → 4 real tabs**
(Dashboard · Production/Herd · Finance · Records) + one honest "more coming" line.
E9/EX8 — **5 view tabs → 3** (Portfolio · Money · Outlook; Rankings+Cash+Investor merged
into Money); dropped the redundant EnterpriseStrip. E1 — routed via `utils/api`
(token-refresh) + de-jargoned ErrorState. E6 — fixed the `||"Block"||"—"` no-op. E7 —
"to date" not "this season". EX6 — alerts/"loss" flag only enterprises that **sold at a
loss** (income>0 && net<0), never mid-cycle crops. B90 — ModeDropdown removed. retry:1 +
refetchOnReconnect (E8); role=tablist/tab on tabs (a11y). Watermarked "Example" preview kept.

**Filed (backend/cross-page, honest):** real enterprise entity (working Pause/Close/Worth/
valuation + per-enterprise roles); animal financials (income/net/ROI); per-enterprise
open-task count; per-block P&L grain; layer for animals/verticals; composite endpoint +
shared QueryClient; grounded standing via decision signals/KB; certifications.

**DEPLOY:** frontend-only → `cd /opt/teivaka/frontend && npm run build`. Verify: "By layer"
strip shows Cash flow/Food security/Long-term with net; cards carry a layer badge; no
Pause/Close buttons; open an enterprise → 4 tabs only, Layer KPI (no fake "0 open tasks");
a mid-cycle crop is NOT flagged as losing money; empty farm → watermarked Example preview.

**Status:** ✅ redesign shipped. Awaiting stress pass / approval to lock.

---

## 5. Production (/farm/cycles) — AUDITED + REDESIGNED (2026-06-26, approved) — ✅ shipped

Audit P1–P8 + PD-A–PD-H (chat); approved → CycleList.jsx rebuilt + CycleDetail.jsx fixed
per `docs/TFOS_Production_Redesign_Wireframe.md`. Build ✓. Frontend-only.

**Headline (PD-A 🔴 safety):** the WHD harvest-hold now **fails CLOSED** — green only when
compliance is verified clear; a grey "?" marker + amber banner when `/crops/compliance`
can't load (was: silently green = false "clear to harvest" on the Inviolable #2 gate).
Same in CycleDetail's compliance panel ("Couldn't verify withholding — do not harvest").

**Also fixed:** P1 "Pending (open)" reads `data.tasks` (real count, was always 0); P2 unit
cards keyboard-operable (role=button + Enter/Space); P3 CycleDetail money via formatMoney
(FJD, was `$`); P-T1 both via `utils/api` (token refresh); P5/PD-E KPIs active-scoped +
honest "to date"; **PD-B status filter (Active/Closed/Failed/All)** — closed/failed now
reachable; PD-C KPI strip responsive (auto-fit, was forced 5-col on mobile); PD-F
"Day -N"→"Not yet planted", ">100%"→"Past expected harvest"; P4 no-op fallback removed;
PD-H single breadcrumb; P6 CycleList → react-query (caching + reconnect); AI "Ask AI about
this cycle" on detail; a11y.

**Confirmed correct (not touched):** create flow enforces layer-at-creation (Strike #104a);
NurseryRegister live + honest.

**Filed (backend/cross-page):** Tasks page to honor `?cycle=` (P7); per-cycle buyer
commitments (order↔cycle link); agronomic BBCH stage; rotation disease-risk warning;
CycleDetail → react-query; certifications; weather/GDD-aware progress.

**DEPLOY:** frontend-only → `cd /opt/teivaka/frontend && npm run build`. Verify: kill
/crops/compliance → hold dots show "?" + amber banner (NOT green); status filter shows
closed/failed cycles; open a cycle → "Pending (open)" real count, money in FJD, keyboard-
openable cards; KPI strip wraps on mobile.

**Status:** ✅ redesign shipped. Awaiting stress pass / approval to lock.

---

## 6. Field Events (/farm/field-events) — AUDITED + REDESIGNED (2026-06-26, approved) — ✅ shipped

Audit FE1–FE10 + FX1–FX5 (chat); approved → FieldEventNew.jsx consolidated per
`docs/TFOS_FieldEvents_Redesign_Wireframe.md`. Build ✓ (chunk → 16 KB; the retired forms
are tree-shaken out of the bundle). Frontend-only.

**Headline (FX1/FX3):** the page had THREE in-page forms; the legacy one captured NO
evidence (photo/GPS/voice) — an inferior duplicate of the (+) Capture Engine. **All three
retired** (no longer routed to; source filed for deletion). The page is now the live LOG,
and every log action — the button + any ?type/?new deep link — opens the **(+) Capture
Engine** via `openFormModal("crops", { eventType })` (Evidence v2). One rich write path.

**Also fixed:** FE2 log keeps cached events + degraded banner on a refetch error; FE-T1 log
via `utils/api` (token refresh) + refetchOnReconnect; FE10 lucide `Lock` (not `🔒`); FE1
"By you" for self + friendly Block label (`pu_farmer_label`/`pu_name` when present, raw-id
join filed); FE4 search + type-chip filter on the log; AI page-level "Ask AI"; a11y
(focus rings, aria on lock). FX5 stale `["tasks-next"]` invalidation gone with the form.

**Kept verbatim:** FieldEventEditModal — the 48h correction window with WHD-critical chemical
re-selection + live recomputed harvest-clear date + photo. (Strong; untouched.)

**Filed (backend/cross-page):** list endpoint to join `pu_name` + author display name (FE1
real fix); Capture Engine to allow cycle states its verbs imply — LAND_PREP pre-planting,
harvest on HARVESTING cycles (FX2); WHD nudge at spray-log time (FE6); pest/disease
severity+GPS (FX4); whole-farm activity feed; server-side log filter at volume; remove the
dead legacy form source (tree-shaken from the bundle already).

**DEPLOY:** frontend-only → `cd /opt/teivaka/frontend && npm run build`. Verify: bare
/farm/field-events → the log (search + type chips, "By you", lucide lock); "Log event" or a
?type deep link → the (+) Capture Engine (photo/GPS/voice); offline w/ events → list stays +
banner; Edit within 48h still opens the WHD-aware modal.

**Status:** ✅ redesign shipped. Awaiting stress pass / approval to lock.

---

## 7. Inventory (/farm/inventory → Resources tab) — AUDITED + REDESIGNED (2026-06-26, approved) — ✅ shipped

Audit I-T1/2/3 + I1–I7 + IX1–IX7 (chat); approved → InventoryList.jsx redesigned per
`docs/TFOS_Inventory_Redesign_Wireframe.md`. Build ✓. Frontend-only.

**Honesty-first (IX1):** logging a spray doesn't deduct chemical stock (verified — backend
gap; B37 generalized). Can't fix on the frontend → made HONEST: a prominent note that
on-hand = stock you receive/use here, and field-sprays don't auto-deduct yet ("tap Use
stock to keep counts accurate"). The real fix (auto-deduct on consumption) is FILED.

**Fixed:** I-T1 GETs via utils/api (token refresh); I-T2 Movements farm-scoped (`?farm_id=`,
verified) + farm-keyed (suppliers tenant-level by design); I-T3 real error/cached state
(no false "no items" — error card when empty, degraded banner when cached); I1 dropped the
redundant `<h1>Inventory</h1>` (tab labels it); I2 row click → Edit item (+ explicit
Receive/Use per row), not the surprise purchase form; **IX3 mobile card layout** (the 10-col
table is desktop-only now); IX4/I3 days-left shows "—" not "∞" + "at current 30-day use";
IX2 value labelled "at last cost"; I5 lucide arrows in Recent events; AI "Ask AI" restock;
a11y tabs as role=tab buttons.

**Filed (backend/cross-page — the keystone first):** auto-deduct inventory on consumption
(spray/feed-use → input-transaction USAGE) — real IX1 fix (B37 generalized); weighted-avg/
FIFO cost basis (IX2); `/input-transactions` server limit + date filter (scale); item
detail/movement-history view; PO/awaiting-delivery state (IX5); add-supplier inline (IX6);
batch/lot/expiry + chemical traceability (IX7); seasonal-aware days-left (IX4); nested
QueryClient lift (B31).

**DEPLOY:** frontend-only → `cd /opt/teivaka/frontend && npm run build`. Verify: honesty note
shows; kill /inputs → "Couldn't load · Retry" (not "no items"); a row → Edit modal; per-row
Receive/Use; on a phone → stacked cards (no 10-col scroll); days-left "—" when no burn.

**Status:** ✅ redesign shipped. Awaiting stress pass / approval to lock.

---

## NEW BUILD — Teivaka Jobs board (agri-sector employment marketplace) — Phase 1 (2026-06-26)

Operator-approved (placement: Market tab; visibility: members-only; monetization: free alpha;
build Phase 1). NOT a locked-page redesign — a new community marketplace surface, built to the
same standards. Distinct from Services (one-off tasks) and the Labour page (own workforce).

**Shipped (Phase 1, end-to-end real):**
- Migration `186_jobs_board` — `community.job_listings`, `community.job_applications`,
  `community.worker_profiles` (global/cross-tenant, mirrors 178_service_jobs; grants to
  teivaka_app; apply-as-owner). **Staged — not yet applied to prod DB.**
- Router `jobs_board.py` (mounted /api/v1): worker-profile GET/PUT; job-listings post/available/
  mine/status; apply; my-applications; withdraw; applications (poster-gated, contact-on-ACCEPTED);
  decide (shortlist/decline); **hire → reuses real audited `workers.create_worker` (Labour bridge)**.
  Guards: no self-apply, unique apply, poster-gated review/hire, ownership-checked status.
- Frontend `Jobs.jsx` + Market tab "Jobs". Two views: Find work (browse/filter/apply + my
  applications + collapsible seeker profile) and Hire (post + my listings + applicants + hire→Labour).
  Standards: api.js, cached-on-error, formatMoney, Fiji time, shared a11y <Modal>, arrow-key tabs,
  min-wage soft guard, self-apply hidden, view-aware Ask AI, lucide, responsive, submit-locks.

**FILED (Phase 2/3, honest — NOT faked):** notify matching seekers on post (in-app + WhatsApp,
reuse service_jobs._whatsapp_blast); worker + employer reliability; map view; ratings/reviews;
in-app messaging; offer-letter/contract doc; FNPF tracking; server-side min-wage hard validation;
monetization (featured/paid); public board + SEO.

**DEPLOY (Tier-2 — backend migration + api rebuild + frontend):**
1. `cd /opt/teivaka && git pull origin claude/beautiful-fermi-F0dLX`
2. Backend: `docker compose -f 04_environment/docker-compose.yml build --no-cache api && docker compose -f 04_environment/docker-compose.yml up -d api && bash 04_environment/verify-deploy.sh`
3. Migration — APPLY AS OWNER (Strike #123). In-container `alembic upgrade head` runs as
   `teivaka_app` and FAILS with `permission denied for schema community` (confirmed on prod
   2026-06-26). Correct path: run the DDL as the `teivaka` owner via the db container's local
   trust auth — `docker exec -i teivaka_db psql -U teivaka -d teivaka_db < <migration DDL>`
   (idempotent CREATE IF NOT EXISTS + GRANT to teivaka_app), then bump
   `UPDATE tenant.alembic_version SET version_num='186_jobs_board';`. Verify
   `docker exec teivaka_api alembic current` = 186_jobs_board. (Do NOT use in-container
   `alembic upgrade head` for community/tenant DDL — it lacks owner privilege.)
4. Frontend: `cd /opt/teivaka/frontend && npm run build`
**Verify:** Market → Jobs → post a listing; from another member, apply; as poster, open
Applicants → Hire → tick "Add to Labour" → worker appears in Labour. Rollback: `git revert`
the commit + rebuild; migration down = `alembic downgrade -1`.

**Status:** ✅ code shipped to branch + build-verified (frontend npm build, backend py_compile).
Migration STAGED (needs apply-as-owner on prod). Awaiting deploy + stress pass.

## JA1 — Community re-home of Jobs + Services (2026-06-26)

Operator-approved: cross-tenant marketplaces move to the Community pillar; Farm keeps the
tenant-scoped Buyers & sales (the `community.*` → Community / `tenant.*` → Farm principle).
- New Community surface **"Work & hire"** (`/home/work`, `pillarSubNavMap` + `HomePillar`
  early-return → `pages/home/WorkHub.jsx`): sub-tabs Jobs | Services + ONE "Post to the
  network" launcher (chooser → hire-a-role / get-a-task / find-work / offer-service, routes to
  the right inner tab via remount key).
- `Jobs.jsx` + `ServiceHub.jsx` gained an `embedded` + `initialTab` prop (skip own TfpShell/
  page-header when hosted by WorkHub; legacy standalone path preserved).
- Farm `Market.jsx`: dropped the Jobs + Services tabs → **Buyers & sales** + a thin
  **"Hiring & logistics"** shortcut tab that deep-links to `/home/work`.
- Frontend-only; no backend/migration change. Build clean. Deploy: `npm run build`.

## 9. Payments (/farm/payments → Money tab) — AUDITED + REDESIGNED (2026-06-26, approved) — ✅ shipped, backend STAGED
Audited (PA1–PA16) → deepened 8-persona (PA1 revised + PA17–PA29) → redesigned. Backend money
loop is genuinely good (idempotent, hash-chained, server-enforced PIN); the weak half was the
frontend + three real backend correctness bugs. Spec: `docs/TFOS_Payments_Redesign_Wireframe.md`.
- **#1 workflow win (PA2/PA3/PA18):** the two-step "Generate instruction → Confirm paid" is GONE.
  One **Settle modal** ("Mark paid"/"Mark received") generates/loads the instruction, shows the
  **reference + instruction text persistently** (no more disappearing toast), offers a method
  chooser, captures the confirmation ref, and books it. Two taps, instruction always visible.
- **Backend fixes bundled (NO migration — columns exist), `routers/payments.py` → STAGE:**
  **PA1** confirm no longer blind-books to the oldest farm — uses the obligation's farm; if none,
  auto-resolves only when the tenant has exactly 1 farm, else **409 "link a farm first"** (was a
  real multi-farm Bank-Evidence corruption). Frontend now sends the current `farm_id` on create.
  **PA18** `instruct` reuses an open INITIATED txn instead of minting duplicates. **PA24** booked
  `transaction_date` uses **Fiji** date (UTC+12), not server UTC `date.today()`.
- **Frontend (`Payments.jsx`):** api.js wrapper that KEEPS the 423 PIN-lock but stops swallowing
  errors (PA4/PA17 — the silent-empty-unlocked-page bug); cached-on-error → ErrorCard/Degraded;
  **Overdue** total + overdue-first sort + red flags + "due in Nd" (PA25); shared `<Modal>` for
  settle/cancel/forgot-PIN (PA9/PA12 — no more window.prompt/confirm); lucide icons, zero emoji
  (PA8); drop redundant `<h1>` (PA10); view-aware **Ask AI** (PA11); **submit-locks** on
  create/instruct/confirm (PA20); **retry-safe confirm** — 409 "already confirmed" treated as
  success (PA19); counterparty `<datalist>` from the existing master (PA21); per-method **default**
  toggle + method chooser at settle (PA26/PA28); Fiji dates.
- **Filed (honest, NOT faked):** PA22 partial settlement (`settled_fjd` + amount-at-settle),
  PA23 Evidence v2 on confirmation (photo/GPS — highest-value Bank Evidence row; needs txn evidence
  cols + migration), PA27 single AR truth (Buyers+Cash+Payments), PA1-hardening (farm on adopt +
  backfill NULL-farm payables → `farm_id NOT NULL`), FNPF/tax mapping, payment register export,
  due-date reminders.
- Deploy: frontend `npm run build`; **backend STAGED** (build --no-cache + verify-deploy.sh) —
  not applied from this cloned env. No migration.

### 9-stress + optimize (2026-06-26)
Stress-tested across 11 scenarios; **found a self-introduced white-screen crash** (ST-P1: the page
consumed `useCurrentFarm` without a `CurrentFarmProvider` — `FarmTabs`/`Money` don't supply it;
fixed by wrapping `PaymentsInner`, mirroring CashLedger). Optimize pass fixes:
- **ST-P2 (multi-farm dead-end, my PA1 regression):** adopted obligations had no farm → my PA1
  guard 409'd them with no way to link a farm. Closed: `confirm` accepts `farm_id` (page sends the
  current farm) + validates it belongs to the tenant; `adopt` tags `farm_id`. The page now shows a
  **"Books to: <farm>"** selector (switchable when >1 farm; static when 1; auto-picks first).
- **ST-P3 (fake method chooser):** `confirm` now accepts `payment_method_id` and records THAT rail's
  label (and updates the txn) — the chooser is real, not cosmetic.
- **ST-P4 (fragile load):** `Promise.allSettled` — one flaky companion call (counterparties/farms)
  no longer blanks the whole page; payables drives ErrorCard vs DegradedBanner.
- **ST-P5** errors use `userMessage` (no "Request failed"). **ST-P6/P15** booking farm visible +
  per-row farm chip. **ST-P8/P9** search + show-settled toggle (>6 rows) + 300-cap note + datalist
  capped 50. **ST-P11** friendly category/status labels (no ALL-CAPS codes / "INSTRUCTED").
  **ST-P13** honest recorded-in-cashflow toast. **ST-P14** arrow-key tabs. **ST-P17** label
  truncation. **ST-P18** dead error-gate branch removed. **ST-P19** openSettle submit-locked.
- **Still filed (honest):** ST-P10 server role gate / maker-checker; ST-P12 receipt/verify view +
  register export + FNPF/tax; ST-P7 dedicated `PATCH /methods/{id}/default` (set-default removed
  from UI this pass rather than ship the non-atomic create-then-delete hack); PA22 partial
  settlement; PA23 Evidence-v2 on confirmation; PA27 single AR truth; offline write-queue.
- Deploy: frontend `npm run build`; backend STAGED (no migration — `farm_id`/method columns exist).
