# TFOS Build Protocol — binding for every prototype-mirror page

> **Why this exists:** the prototype contains *multiple versions of the same
> screen* (legacy + live v801: `reportsLibraryView` vs `coreReportsView`,
> `NAV.farm` vs `NAV.farm_unified`). Building from a name-matched-but-not-rendered
> function caused repeated "way off" results (Cycles/Harvests nav, Analytics
> 10-vs-13 tabs, Reports Library). These two gates make that impossible.
>
> **Binding:** no page ships without passing BOTH gates. If a build skips a gate,
> it is a process violation — the Operator may reject it on sight.

## GATE 1 — Dispatch trace (not name grep)
Before reading anything, find what the app **actually renders** for the target:
1. Start at the dispatcher: `renderFarm(sub)` (and `state.vertical === 'unified'`
   → `NAV.farm_unified`). Find the **exact `core*View` it returns** for that
   `sub` id.
2. Read **that function top to bottom**, plus every helper it calls to render the
   **specific sub-page** being built (e.g. for Reports → `coreReportsView` and the
   function it dispatches for the active tab).
3. **Never** build from a `renderX`/`xView` found by grep unless the dispatch
   proves it's the one rendered. Legacy same-named functions are traps.

## GATE 2 — Full-spec confirm before code
Before writing any React:
1. Produce the **complete component inventory of the specific sub-page** — every
   tile, row, card, button, label, and description, **verbatim from the rendered
   function** (Gate 1). Not the tab headers — the full content.
2. Paste it to the Operator and get an explicit **👍**.
3. Only then write code. (Rationale: this environment cannot see rendered output;
   the Operator's sign-off on the full spec is the only check that catches a
   wrong-source read before it ships.)

## Standing rules (carry-over)
- **Prototype-only** is the source of truth for structure/labels/descriptions.
- **No fabricated data** — live where the API serves it; honest structured
  empties (naming the exact backend needed) elsewhere. Never show a fake credit
  score / number to a banker.
- **Responsive** — tab bars scroll (`shrink-0`), tile grids collapse 2→3→(4/5)
  cols, tables get `min-w` + `overflow-x-auto`.
- **Build-verify** — `npm run build` must pass (lazy chunk emitted) before push.
- **Ship instruction** — every shipped page comes with the exact
  `git checkout … <file>` + build + rsync runbook (frontend deploys on the box).

## Operator's lever
Reject any build that did **not** arrive with a Gate-2 full-spec sign-off first.
One screenshot per shipped page remains the backstop.
