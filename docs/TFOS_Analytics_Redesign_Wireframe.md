# Analytics — Redesign Wireframe (audit-approved 2026-06-27)

Surgical rebuild of the 960-line Analytics surface. Fixes the audit headlines: no-error-states,
stale-snapshot blindness (Decision Engine has died silently — Strike #110), no triage across 13
flat tabs, snooze-buries-crises, no token refresh, no export. Frontend over verified endpoints.

```
┌───────────────────────────────────────────┐
│ Analytics        [Snapshot 14:20][Export][Farm▾]│ header
│ Decision board · 9 live signals · …        │
├───────────────────────────────────────────┤
│ ⚠ These signals are 3 days old — the       │ STALE BANNER (new) — only when
│   Decision Engine may be behind.           │ snapshot age ≥ 24h. The sharp fix.
├───────────────────────────────────────────┤
│ RIGHT NOW · WHAT MATTERS MOST              │ TRIAGE CARD (new) — leads the page
│ [RED] Cash runway · 3 weeks                │ so the 13-tab wall isn't first.
│   2 red · 1 amber need attention           │ top RED→AMBER, with one action.
│              [Generate task] [Detail]      │
├───────────────────────────────────────────┤
│ Signals·Profit·Productivity·Cash&demand·…  │ 13 tabs (kept; triage gives the lead)
├───────────────────────────────────────────┤
│  (active view)                             │
│  • error → ErrorCard + Retry (was endless  │ ERROR STATE (new) per core view —
│    "Loading…")                             │ no more stuck spinners on 500/401
│  • loading → skeleton                       │
│  • data → view                              │
└───────────────────────────────────────────┘

Signal detail / snooze:
  RED signals are NON-SNOOZABLE — "address it or generate a task" (was: any RED could be
  hidden 24h). AMBER/GREEN still snoozable.
```

## Decisions
1. **Triage lead** — a "Right now" card surfaces the single most urgent signal (top RED, else AMBER) with Generate-task/Detail, so decision-making starts with *one* thing, not 13 tabs. All-clear shows a green "nothing needs action today."
2. **Stale banner** — when `last_snapshot_at` is ≥24h old, a loud amber warning; the engine's silent-death history means a timestamp alone isn't enough.
3. **Real error states** — core views (signals, profit/cycles, cash & demand, flip log, forecasts) render an ErrorCard+Retry on failure instead of a perpetual "Loading…".
4. **Token refresh + honest errors** — the `get()` helper now routes through the shared `getJSON` (auto-refresh + farmer-readable errors), so a 401 recovers instead of sticking.
5. **RED non-snoozable** — a red signal can't be buried; only amber/green can be acknowledged.
6. **Export** — the per-cycle P&L (the bankable table) exports to CSV for an accountant/lender.

## Deferred (named, backend — not faked)
- 3-Layer lens (Cash-Flow/Food-Security/Long-Term-Asset) on P&L/productivity; signal "why" (threshold+value+rule) needs the signals endpoint to return the rule; server-side cycle rollups + cross-view reconciliation (KPI vs cashdemand vs profit to one source); per-block/per-worker drill; synced (server) signal acknowledgement; regional/cross-farm aggregate; i18n; keyboard nav on tabs.
```
