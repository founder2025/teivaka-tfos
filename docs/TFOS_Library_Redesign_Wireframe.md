# Library — Redesign Wireframe (audit-approved 2026-06-27)

Rebuild of the 733-line Farm Library (`/farm/library`). Fixes the audit headlines: error-as-empty
(LB1), the dead Nutrition tab (LB2 — `ref_id` passed where `crop_key` expected → 404 for every crop),
unreadable KB (LB3), eager uncached load-all (LB4), raw-fetch writes (LB5), and the persona misses:
**Chemicals had no filter and ignored "what affects my crops"** (the #1 operational gap), uncached
corpora (re-fetched every visit), undated "verified" badges vs the lesson's promise, no a11y, no URL state.

Frontend over verified endpoints + ONE new read-only endpoint (`GET /agronomy/nutrition/crops`).

```
┌────────────────────────────────────────────────────────────┐
│ Library                         [How to use] [Request update]│ header
│ Knowledge for your farm · crops, chemicals, pests…           │
├────────────────────────────────────────────────────────────┤
│ 🔍 Search all libraries…              [✓ What affects my crops]│ search + relevance toggle
├────────────────────────────────────────────────────────────┤  (cross-search now spans ALL tabs
│ 12 results across libraries  crops·chem·pest·dis·fert·LIV·KB │   incl. livestock/vet + KB — LB6)
├────────────────────────────────────────────────────────────┤
│ Crops · Chemicals · Pests · Diseases · Fertilizers ·         │ tabs (sync to ?tab= — LB/URL)
│ Livestock&Vet · Nutrition · Knowledge base                   │ ONLY the active tab fetches (lazy)
├────────────────────────────────────────────────────────────┤
│ [Annual][Perennial]…  ← filter pills (EVERY tab incl. CHEM)  │ Chemicals now filterable:
│   Chemicals: [My crops][≤7d WHD][8–14d][>14d]  + sort WHD    │   by registered crop + WHD band
├────────────────────────────────────────────────────────────┤
│  ┌ card ┐ ┌ card ┐ ┌ card ┐   (role=button, keyboard)        │ 30 + show-all
│  │ Name │ │ …    │ │ …    │                                   │
│  └──────┘ └──────┘ └──────┘                                   │
│  • loading → skeleton    • error → ErrorCard + Retry (LB1)   │ per-tab states (not error-as-empty)
│  • empty(loaded) → honest "none match"                       │
└────────────────────────────────────────────────────────────┘

Row detail (modal, role=dialog, Esc, focus-trapped):
  Title = the ITEM NAME (was the literal "Library row").
  Chemicals: WHD, active ingredient, registered crops; provenance = source (honest — no faked date).
  KB: tap a card → fetches GET /kb/{id} → renders the ARTICLE BODY (was a dead-end).

Nutrition tab:
  Picker is fed by GET /agronomy/nutrition/crops → lists ONLY crops with seeded protocols,
  keyed by the real crop_key (taro), so it resolves instead of 404-ing. Each stage shows
  N·P·K g/plant + verification_status + source citation (real provenance).
```

## Decisions
1. **Real error states (LB1).** Every tab is a react-query query → `isError` renders an ErrorCard + Retry; loading → skeleton; loaded-empty → honest "none match." A failed *chemical* load never reads "No chemicals match" again.
2. **Nutrition fixed (LB2).** New `GET /agronomy/nutrition/crops` returns `{crop_key, crop_display_name}` for crops that actually have data; the picker passes `crop_key` (taro), not `ref_id` (CRP-TAR). Dead flagship → live.
3. **Chemicals is now first-class (the #1 persona miss).** Filter pills (My crops · WHD bands) + WHD sort; "What affects my crops" intersects `registered_crops` with the farmer's live cycle crops. The core question — "what can I legally use on my crop and what's its WHD?" — is now answerable by browse.
4. **KB readable (LB3).** Cards open a detail that fetches `GET /kb/{id}` and renders the article body.
5. **Cached + lazy (LB4 + no-cache miss).** All corpora move to react-query (cache, dedupe, `enabled` per active tab) — no more 9-request eager load, no more refetch-every-visit.
6. **Honest provenance.** The tables carry no per-row version/date, so the "How to use" lesson no longer promises one; detail shows the real source + (nutrition) `verification_status`. No faked dates.
7. **a11y.** Cards → `role=button`+keyboard; search hits → buttons; modals → `role=dialog` + `aria-modal` + Esc + focus. `getJSON` for the writes/nutrition (token refresh — LB5).
8. **URL state.** `?tab=` (and `?row=` deep-link) so a TIS citation (CHEM-003) can link straight to the row — the citation round-trip the lesson promises.

## Deferred (named, not faked)
- **"My Library"** (custom varieties / sightings / notes) — the lesson taught a personal half that has **no backend**; the lesson copy is corrected to describe what exists, and My-Library is filed as a real feature (needs tenant tables + CRUD), not faked.
- Per-row review **dates/versions** (needs columns on the reference/chemical tables); request-update **status tracking** (the contribution feedback loop); corpus **export/print** (manager/government); server-side search/pagination at 10×; voice/i18n; per-crop WHD (label-specific) vs the single stored value.
```
