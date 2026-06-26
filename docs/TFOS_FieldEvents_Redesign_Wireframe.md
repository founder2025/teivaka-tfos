# TFOS Field Events Page — Redesign Wireframe & Spec (2026-06-26)

Redesign of `/farm/field-events` (FieldEventNew.jsx) after the approved audit (FE1–FE10, FX1–FX5).

## Headline decision — one write path (FX1/FX3)
The page had THREE in-page forms (legacy `FieldEventForm` + `Strike96CropsForm` +
`CropSelectionForm`) — the legacy one captured **no evidence** (photo/GPS/voice), an
inferior duplicate of the (+) Capture Engine (Evidence v2). **Retire all three.** The page
becomes **the live Log**, and every "log" action — the button, and any `?type`/`?new`
deep link — opens the **(+) Capture Engine** via `openFormModal("crops", { eventType })`
(the same target Compliance/CycleDetail already use). One rich, evidence-capturing write path.

## Visual wireframe
```
┌────────────────────────────────────────────────────────────────────────┐
│ Field events                          [🌱 Farm ▾] [✨ Ask AI] [＋ Log event]│ ← Log event → (+) Capture Engine (photo/GPS/voice)
│ Spray, irrigation, fertilizer, scouting and more — logged against blocks  │
│ [🔎 search]            Type: [All][Spray][Fertilize][Irrigate]…           │ ← search + type chips (derived; FE4 findability)
│ ⟦ amber "couldn't refresh — showing saved" banner if isError+cache (FE2) ⟧ │
│ ── Date ── Type ───── Detail ──────────── Block ── By ─── ──────────────── │
│ 24 Jun   Spray     Glyphosate · 2L       Block A   you      Edit          │ ← By "you" for self (FE1); block label not raw id; Lock icon (FE10)
│ 23 Jun   Planting  Tomato — Roma         Block B   you      🔒(Lock)       │ ← >48h → lucide Lock (not emoji)
│ …                                                                          │
│ Showing the most recent 100 · entries correct for 48h, then lock.         │
└──────────────────────────────────────────────────────────────────────────┘

Tap "Edit" (≤48h) → FieldEventEditModal (kept verbatim — WHD-critical chemical
re-select with live recomputed clear-date + photo). 48h doctrine honoured.
```

## Fixes
- **FX1/FX3** retire the 3 in-page forms; deep links + "Log event" → (+) Capture Engine
  (evidence always captured). One write path.
- **FE2** Log keeps cached events + a degraded banner on a refetch error (the recurring class).
- **FE-T1** Log via `utils/api` (token refresh). **FE10** lucide `Lock`, not `🔒`.
- **FE1** "By you" for self (from JWT); Block shows `pu_farmer_label`/`pu_name` when present,
  else a short code (raw `created_by`/`pu_id` join filed as backend).
- **FE4/findability** search + type chips on the log.
- **AI** page-level "Ask AI" (`/tis?q=`). Reduced-motion; a11y on rows/buttons.
- **FX2** (can't log LAND_PREP / against non-active cycles) — now moot for this page since
  logging is the Capture Engine; **filed** against the Engine's cycle-state rules.
- **FX5** drop the stale `["tasks-next"]` invalidation (no query uses it).

## Filed (backend / cross-page — honest)
- List endpoint to join `pu_name` + author display name (FE1 real fix).
- Capture Engine to allow the cycle states its verbs imply (LAND_PREP pre-planting, harvest
  on HARVESTING cycles — FX2); WHD nudge at spray-log time (FE6); pest/disease severity+GPS
  (FX4); whole-farm activity feed; list filter server-side at volume.
- Remove now-dead legacy form components in a follow-up (kept this pass to avoid deep-link risk).
