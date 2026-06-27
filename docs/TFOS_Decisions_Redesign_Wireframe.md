# Decisions — Redesign Wireframe (audit-approved 2026-06-27)

Rebuild of the 336-line Decision Center (`/farm/insights?tab=decisions`). Fixes the audit
headlines: false "running clear" on failure (DC1), faked "clear to sell / no holds" (DC2),
tenant-wide task bleed honestly labelled (DC3), synthetic score dropped (DC4), hardcoded
risk badges grounded (DC5), and the persona findings — agronomic misadvice on Long-Term-Asset
crops (Inviolable #4), net computed two ways, ignored snapshot staleness, "normal mid-season"
toxic positivity, capital-risk "expansion readiness" + its avg-over-zeros bug.

Frontend over verified endpoints. Real data or honest-empty. Nothing fabricated.

```
┌──────────────────────────────────────────────────────┐
│ Decisions                    [Ask TIS] [Farm ▾]       │ header — real farm NAME (DC7)
│ What needs you today, most important first            │
├──────────────────────────────────────────────────────┤
│ ⚠ These decision signals are 3 days old — the engine  │ STALE BANNER (≥24h, from the
│   may be behind.                                       │ endpoint's own last_refresh_at — DC-new)
├──────────────────────────────────────────────────────┤
│ ⚠ Couldn't load part of this page.        [Retry]     │ DEGRADED BANNER — some queries failed
│                                                        │ (DC1: never silently green on error)
├──────────────────────────────────────────────────────┤
│ THE CALL RIGHT NOW                                     │ HERO — single dominant decision.
│ ⛔ Stop — 2 compliance holds                           │ Priority: REAL holds → critical
│    Clear them before selling or harvesting             │ signal → urgent task → all-clear.
│                                   [Open compliance →]  │ All-clear ONLY when the decision
│                                                        │ trio actually loaded (DC1).
├──────────────────────────────────────────────────────┤
│  Holds 2 · Urgent 3 · Net −FJ$3,200 · 4 enterprises   │ DECISION STATE — one honest row.
│                                                        │ Holds = REAL blocked_count (DC2).
├──────────────────────────────────────────────────────┤
│ WHAT NEEDS YOU                          All tasks →    │ unified signals + open tasks,
│ [Stop] {signal} — {why}                      [Open]    │ severity-sorted. Honest states:
│ [Soon] {task}   — {why}                      [Tasks]   │  • error → row note + Retry
│ Tasks shown across all your farms (farm filter soon)   │  • empty(loaded) → "running clear"
├──────────────────────────────────────────────────────┤  • empty(failed)  → degraded, NOT clear
│ MONEY READ                              Cash & demand →│ RECONCILED: costs = income − net, so
│ Earned FJ$12,400 · spent FJ$15,600 · net −FJ$3,200.   │ income−costs == net on screen (DC-new).
│ Costs are ahead of income so far.                     │ Factual — no "normal mid-season" (DC).
├──────────────────────────────────────────────────────┤
│ ENTERPRISE STANDING                    strongest first│ factual grade (Profitable/Building/
│  Cassava   Profitable   +FJ$2,100   +48%   Earning    │ New) + net + return. NO 2-digit score
│  Eggplant  Building     −FJ$900     −22%   Costs ahead│ (DC4). Mobile → cards, desktop → table.
│  Long-term crops (kava) run negative for years — low  │ Inviolable #4 caveat; the prescriptive
│  net isn't always a problem.                          │ "review before spending" misadvice REMOVED.
├──────────────────────────────────────────────────────┤
│ RISK & WHAT TURNS ON NEXT                              │ data-driven where real, honest else:
│  Compliance  {N on hold | Clear}      → compliance    │  • Compliance: REAL blocked_count
│  Cashflow    {Tight | Healthy}        → cash          │  • Cashflow: REAL net
│  Weather     Open forecast            → weather       │  • Weather: link only, NO fake "Watch" (DC5)
│  Market / Inventory  Turns on once you log…           │  • honest building (not faked)
│  Forecasts & best-time-to-sell turn on after a season │
└──────────────────────────────────────────────────────┘

No farm selected → "Select a farm to see its decisions."
Everything failed → ErrorCard + Retry (no farm data at all).
Loading → skeleton (no perpetual blank).
```

## Decisions
1. **One hero call, not three.** The old page showed the same urgency three times (call + tiles + tell-list). Now: one dominant "call right now," a single compact stat row, then the unified list. (Cognitive load.)
2. **All-clear must be earned.** Green "running clear" renders ONLY when the decision trio (holds + signals + tasks) actually loaded. Any failure → degraded banner, never a false green (DC1).
3. **Real holds, real safety.** "Holds" + the compliance risk card + the lead call read `crops/compliance/{farm}` `blocked_count` (the WHD gate, Inviolable #2) — the faked "clear to sell / no active holds" activity-count is gone (DC2).
4. **Reconciled money.** One net (`net_profit_fjd`); costs shown as `income − net` so the page can't show two incompatible totals. No hardcoded "normal mid-season" reassurance.
5. **No synthetic score, no misadvice.** Standing is words from real net/ROI (Profitable / Building / New); the 2-digit score is gone (DC4). The "review {lowest-net} before spending" line is removed and replaced with the Inviolable-#4 long-term-crop caveat (agronomist finding).
6. **No capital-risk advice.** "Expansion readiness" (buggy avg-over-zeros + naive "ready to grow") is replaced with a factual portfolio summary; expansion/forecast advice is honestly gated to "after a season."
7. **Stale + token-safe.** Routes through `utils/api` getJSON (token auto-refresh + honest errors); surfaces the endpoint's `last_refresh_at` as a stale banner (Strike #110 silent-death guard).
8. **Honest cleanups.** Real farm name (DC7), `formatMoney` (DC10), ModeDropdown removed (DC6), nav targets merged routes (DC9), mobile-friendly standing (cards), Ask-TIS deep-link.

## Deferred (named, backend — not faked)
- **Farm-scoped tasks (DC3):** `/tasks` has no `farm_id` filter and the rows don't carry farm_id, so tasks stay tenant-wide and are *labelled* "across all your farms." Real fix = `farm_id` on the tasks list endpoint (T4 class).
- **Per-enterprise layer (Inviolable #4 full fix):** `financials/crops` doesn't return the cycle `layer`, so the page can't auto-suppress low-net Long-Term-Asset crops from "needs attention" — handled by removing the misadvice + a caveat. Full fix = expose `layer` on the crops financials rollup, then rank/advise layer-aware.
- Real Opportunities / Forecasts / Bottlenecks (need a season of data); synced server-side acknowledgement; regional/cohort aggregate; role-gating (Inviolable #9 profit-share); i18n/voice; collapse the two signal endpoints shared with Analytics (DC11) into one read model.
```
