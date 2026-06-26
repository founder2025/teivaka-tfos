# TFOS Weather Page — Redesign Wireframe & Spec (2026-06-26)

Redesign of `/farm/weather` (WeatherPage.jsx) after the approved audit (W1–W9, WX1–WX10).
Decision-first, feed-primary, honest. Real data only — never a fabricated forecast.

## Principles
The auto-feed is primary; manual logging becomes an optional *correction*. Lead with the
decision (now → this week's windows → what it means). Cyclone leads when active.

## Visual wireframe
```
┌────────────────────────────────────────────────────────────────────────┐
│ Weather                                  [🌱 Farm ▾] [✨ Ask AI] [＋ Log] │
│ Live conditions + your decisions for the week                            │
├────────────────────────────────────────────────────────────────────────┤
│ ⟦ CYCLONE — only if active: RED card at TOP ⟧                            │ ← WX5 (lead when active + actionable)
│ 🛡 Yasa · Cat 4 · 180 km away   Move stock to high ground…  [Add prep task]│   weather→task bridge (WX9)
├────────────────────────────────────────────────────────────────────────┤
│ ┌── NOW (hero) ───────────────────────────────────────────────────────┐ │ ← live feed primary (WX1)
│ │ ⛅ 29°C  Partly cloudy      💧 2mm  💦 78%  🌬 14 km/h NW            │ │   staleness note if fetched_at old (WX4)
│ │ as of 14:00 · auto-updated every 3h            [ Log a ground reading ]│ │   one-tap log prefilled from this reading (WX1/Apple)
│ └──────────────────────────────────────────────────────────────────────┘ │
│   (no feed → honest: error→Retry; empty→"updates every 3h; if it stays   │ ← W1 (error≠no-coords)
│    empty your farm may need its map location" + [Set farm location])      │
├────────────────────────────────────────────────────────────────────────┤
│ ┌── THIS WEEK — outlook & windows (consolidated) ─────────────────────┐  │ ← W4: one decision block (was 3 sections)
│ │ ⚠ Heavy rain likely Wed — 28mm · 70%   Prepare drainage, hold spray  │  │   headline from real 7-day
│ │ [Mon][Tue][Wed]…[Sun]  7-day strip (max/min, rain)                   │  │
│ │ Day  Spray  Harvest  Plant    ← Spray HOLD on rain OR WIND≥25 (WX2)  │  │   wind-gated spray (correctness fix)
│ │ Disease pressure: ELEVATED — 3 wet days; scout crops                 │  │   disease folded in as a line
│ └──────────────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────┤
│ ┌── WHAT THIS WEATHER MEANS ─────────────────────────────────────────┐  │
│ │ Crops (one shared card): rain-based guidance (not faux per-crop, W3) │  │   guidance from the FEED, not just manual log (WX1)
│ │ Animals (per-species, varies): hens=heat stress · goats=dry shelter… │  │
│ └──────────────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────┤
│ ▸ Your logged history & ground readings           [collapsed]            │ ← demoted; manual log lives here (WX1)
│   (30-day summary · recent observations · last-year-vs-this — load on open)│   summary/obs queries deferred until opened (speed)
├────────────────────────────────────────────────────────────────────────┤
│ Cyclone watch: GREEN — none within 1000 km (when not active)             │ ← compact when green
└────────────────────────────────────────────────────────────────────────┘
```

## Decision logic
- **Spray window (WX2):** HOLD if `precip_mm≥2 OR precip_prob≥50 OR wind_kmh≥25`. Harvest HOLD on rain≥5. Plant WAIT on rain≥15.
- **Today's guidance signal (WX1):** prefer the live `current` feed (precip/humidity/wind); fall back to the latest manual observation. So guidance works without manual logging.
- **Staleness (WX4):** if `now − current.fetched_at > 4h`, label "may be stale" instead of implying fresh.
- **Cyclone (WX5):** active → red card at top + "Add prep task" (POST /tasks/manual). Green → one compact line at the bottom.
- **No-feed honesty (W1):** isError → "Couldn't load · Retry"; empty (no error) → "updates every 3h; if it stays empty your farm may need its map location" + Set-location link. Never a false "set your location" on an error.

## Optimisation
- Route via `utils/api` (token refresh + humanised errors) — W1/D14 class.
- Fiji-time `today` (W2).
- `refetchOnReconnect` on; **defer summary+obs queries until the history section is opened** (8→6 initial calls, W8).
- Remove `ModeDropdown` (W5). Reduced-motion on pulses; aria-hidden on decorative icons (a11y).
- One-tap "Log a ground reading" prefilled from the live `now` reading (WX1 redundant-labour fix).
- "Ask AI" → `/tis?q=` weather brief (more AI).

## Filed (backend / cross-page — honest, not faked)
- **Reconcile feed ↔ observations** — auto-populate `weather_log`/summary from `weather_forecast` so "last 30 days" works for feed-only farmers; manual log = correction layer (WX1 data layer).
- **Cyclone / heavy-rain push alerts** (WX5 proactive).
- **GDD / evapotranspiration** agronomic metrics (WX3); **crop-specific** disease pressure via KB (Phase 10).
- **Per-block microclimate** (WX6); **weather as insurance/loss evidence export** (WX7); **regional aggregate** for extension (WX10).
- Thresholds → config (WX8); composite weather endpoint + shared QueryClient (W9); voice/i18n.
