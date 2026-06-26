# TFOS Tasks Page — Redesign Wireframe & Spec (2026-06-26)

Redesign of `/farm/tasks` (FarmTasks.jsx) after the approved audit.
**Correction on record:** the audit's N1 ("completion loop broken end-to-end") was a
false alarm — I grepped `completeTaskFromUrl` (a comment phrase) instead of the real
export `completeLinkedTask`, which HarvestNew/CycleNew/HealthObservationNew all call.
Routed tasks DO close. The real completion gap is **T2** only (input-required, non-
routed tasks). Score corrected 4.5 → ~6 pre-redesign.

## Principles
One decision first · one reliable completion · progressive disclosure · honest under
failure · Fiji-correct time · real data only.

## Visual wireframe

```
┌────────────────────────────────────────────────────────────────────────┐
│ Tasks                                          [🌱 Farm ▾]   [＋ Add]     │
│ Your plan for today                                                       │
├────────────────────────────────────────────────────────────────────────┤
│ ⟦ amber banner if load failed — "Couldn't load tasks · Retry" (not       │
│   a false 'all caught up') ⟧                                              │
├────────────────────────────────────────────────────────────────────────┤
│ ┌── DO THIS NEXT ──────────────────────────────────────────────────────┐│ ← hero FIRST (T6)
│ │ (icon) Top-priority task                                             ││   icon from icon_key (N5)
│ │        why (body_md / priority / due)                                ││
│ │  [ Log harvest → ]  or  [ ✓ Mark done ]  or  [__value__][✓]   [Skip] ││ ← completion ALWAYS works (T2)
│ └──────────────────────────────────────────────────────────────────────┘│
│  ▓▓▓▓░░░░  3 of 8 done today                                              │ ← one honest progress line (replaces 5 KPIs / T5/N3)
├────────────────────────────────────────────────────────────────────────┤
│ TODAY & OVERDUE                                                           │ ← the focused daily list (vertical, mobile-first)
│  ⚠ (icon) Top-dress NPK — Block A · Overdue        [✓]  [⋯]              │   complete always-visible (no 2-tap menu / N11)
│    (icon) Scout for aphids — Block B · Today        [✓]  [⋯]              │
│  …                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│ ▸ Coming up  (Tomorrow 2 · This week 5 · Later 3)        [collapsed]      │ ← progressive disclosure (no 5-col wall)
├────────────────────────────────────────────────────────────────────────┤
│ Coming up on your crop plan                              [secondary]      │ ← crop-plan demoted, clearly labelled (N2 — not a competing action list)
│  (icon) Cassava · Tillering — top-dress soon            [View cycle]      │
├────────────────────────────────────────────────────────────────────────┤
│ Quick add:  [Irrigation][Fertilizer][Weeding]…[Custom]                    │
└────────────────────────────────────────────────────────────────────────┘

EMPTY:   "You're all caught up" (only when load succeeded & zero open — never on error)
LOADING: skeleton (not text)
```

## Completion logic — the heart (T2 fix; reduces clicks)
`onComplete(task)`:
1. has `taskTarget` route → navigate to the prefilled form → form calls
   `completeLinkedTask()` on submit (verified working). One tap, no 422.
2. `input_hint` is none/null → POST complete `{input_value:null}` (one-tap).
3. `input_hint` requires a value (decimal / text_short / photo) → reveal an INLINE
   field of the right type, validate client-side, POST `{input_value:<value>}`.
   No more blind `""` → no 422.
Skip → POST skip (reason). Optimistic remove on action; revert + toast on failure.

## Data / behaviour
- Route through `utils/api` (token refresh + humanised errors) → no false "all caught
  up" on expiry/offline (T1). `refetchOnReconnect` + `refetchOnWindowFocus` (N7) so
  server-generated compliance tasks appear.
- "Today" computed in **Pacific/Fiji** (T3).
- Drop the 200-row COMPLETED fetch; track **done-this-session** locally for honest
  progress (T5/T7).
- Icon from `task.icon_key` (backend-provided) → lucide map; fallback to improved
  regex (no bare "check"→health); fallback ClipboardList (N5).
- One unified task list; crop-plan is a clearly-labelled secondary "coming up"
  section, not a parallel action surface (N2).
- Context-aware **Ask AI** per task via `/tis?q=` (reuse Overview pattern).
- a11y: aria-live on hero, reduced-motion, keyboard-operable rows, menu closes on
  outside-click/Esc.

## Cleanup
- Delete orphaned `pages/farmer/Tasks.jsx` (unrouted, imported nowhere — dead code, N3).

## Filed (backend / cross-page — honest, not faked)
- `farm_id` on `/tasks` (T4 — today tenant-wide, labelled).
- Poultry-health is the only routed form whose close path is worth re-confirming
  end-to-end in a browser (it calls completeLinkedTask on onSuccess `:78`).
- Worker assignment / roles; recurring tasks; surfaced AI suggest endpoint.
