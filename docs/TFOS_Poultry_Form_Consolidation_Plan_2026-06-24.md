# Poultry form-system consolidation — audit & migration plan

**Date:** 2026-06-24 · **Status:** PLAN (no code changed yet) · **Trigger:** Operator
flagged "multiple form format / repetition" on the (+).

## The problem
Poultry events can be logged through **two parallel UIs**:
1. **(+) → Animal → Poultry** → config-driven **CaptureEngine** inline forms
   (`capture/config/animal-poultry.js`, 18 verbs). The strategic/universal system.
2. **27 dedicated full-page routes** `/farm/poultry/*` (`pages/farmer/poultry/*New.jsx`)
   — the original Sprint 6/7 forms, re-implemented as engine configs in the
   2026-06-22 "(+)-parity" pass but never retired.

Both write through the same backend, but it's double maintenance, inconsistent UX,
and the "repetition" the Operator saw.

## Key finding — NOT all dedicated pages are duplicates
Cross-referencing the 18 CaptureEngine verbs vs the 27 dedicated routes:

**A. Duplicated (in BOTH the (+) engine AND a dedicated page) — ~17, the real debt:**
EGGS_COLLECTED, EGGS_GRADED, EGGS_SOLD, BIRDS_SOLD, BIRD_REPLACEMENT, FEED_RECEIVED,
FEED_USED, WATER_CONSUMED, WEIGHT_CHECK, VACCINATION_GIVEN, MEDICATION_GIVEN,
HEALTH_OBSERVATION, MORTALITY_LOGGED, LITTER_CHANGED, COOP_CLEANED,
TEMPERATURE_RECORDED, FLOCK_MOVED, INCIDENT_REPORTED. → these are the retire candidates.

**B. Dedicated-page-ONLY (registered in /events but NOT in the (+) config) — would be
LOST if pages are deleted naively:**
FEED_PURCHASED, MORTALITY_INVESTIGATED, CULL_LOGGED, VISITOR_LOGGED,
PEST_CONTROL_APPLIED, EQUIPMENT_MAINTAINED, SUPPLIES_RECEIVED. → must be ADDED to the
(+) config before their pages can go.

**C. Genuinely distinct — KEEP (not form-duplicates):**
- `FlockPlacedNew` (FLOCK_PLACED) — register-create of a flock entity; the (+)
  already link-verbs to it (mirrors crops keeping CycleNew). Stays canonical.
- `PoultryDashboard`, `PoultryBankEvidence`, `PoultryCompliance` — dashboards/evidence,
  not capture forms.

## Dependency surface (who links to the dedicated routes — must be repointed)
- `capture/config/animal-poultry.js` — `flock_new` → `/farm/poultry/flocks/new` (KEEP).
- `pages/farmer/poultry/PoultryDashboard.jsx` — quick-action buttons → multiple `*New` routes.
- `pages/farmer/poultry/PoultryCompliance.jsx` — links.
- `pages/farmer/poultry/MortalityLoggedNew.jsx` — chains to mortality/investigated.
- `utils/taskBridge.js` — auto-tasks open `/farm/poultry/health/new?flock_id=…`.
- `pages/farmer/Enterprises.jsx` — "Place a flock" → `poultry/flocks/new` (KEEP).

## Migration plan (sequenced; each step verified before the next)
1. **Close the (+) coverage gap (B):** add the 7 page-only verbs to
   `animal-poultry.js` so the (+) can log *every* poultry event. (No deletions yet.)
   Verify each emits its audit row via /events.
2. **Repoint the linkers:** PoultryDashboard quick-actions, `taskBridge` health link,
   PoultryCompliance, and the mortality→investigated chain → open the (+) capture flow
   (deep-link into CaptureEngine with the flock pre-anchored) instead of the `*New` page.
   Keep flock-placement (FlockPlacedNew) + dashboards as-is.
3. **Retire the duplicated pages (A + the now-covered B):** delete the `*New.jsx`
   routes + lazy imports once nothing links to them; grep proves zero references.
4. **Verify:** every poultry event still reachable via the (+); PoultryDashboard
   quick-actions work; auto-tasks open the right form; build clean; smoke a few
   events → audit rows land.

## What to KEEP (do not delete)
FlockPlacedNew, PoultryDashboard, PoultryBankEvidence, PoultryCompliance.

## Risk & sizing
- **Risk:** medium — poultry is a deep, live vertical; the linker repointing (esp.
  taskBridge auto-tasks + dashboard quick-actions) is where regressions hide.
- **Mitigation:** do it as its own focused pass, per-step build+grep verification,
  retire pages only after zero references. Frontend-only; no backend/migration.
- **Sizing:** ~7 config additions + ~5 link sources repointed + ~17 page deletions.
- **Net:** one form system (CaptureEngine), ~17 fewer files, consistent UX, half the
  maintenance — without losing any event type.

## Recommendation
Worth doing — but as a dedicated, sequenced task, not folded into other work. Step 1
(close the (+) coverage gap) is independently valuable (makes the (+) complete for
poultry) and low-risk, so it's the right place to start when greenlit.
