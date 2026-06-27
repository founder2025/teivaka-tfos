# Farm History — Redesign Wireframe (audit-approved 2026-06-27)

Mobile-first (360px). Fixes from the audit: reachable route + nav, Fiji-local day
bucketing, honest trust copy (no fake "INTACT", no dead "Verify"), export incl. tasks,
decision-making summary, agronomic detail on sprays, photo thumbnails, no raw UUIDs,
dead code removed. Frontend rebuild over the *verified* endpoints (no backend risk).

```
┌───────────────────────────────────────┐
│ Farm History            [Farm ▾][⤓]   │  header: farm selector + export menu
│ Everything logged on F001, by day      │
├───────────────────────────────────────┤
│ [This season ▾]   [🔍 search block/    │  ONE filter row (preset + search).
│                       crop/who/note ]  │  "Custom…" reveals 2 date inputs.
│ All ·Harvest ·Field ·Cash ·Animals ·…  │  one category chip row (scroll)
├───────────────────────────────────────┤
│ ▤ THIS SEASON · 47 records loaded      │  DECISION SUMMARY (computed from loaded)
│   312 kg harvested · FJD 1,240 in /    │
│   FJD 580 out · 6 sprays · last: 2d ago│
├───────────────────────────────────────┤
│ Your full record, kept & timestamped.  │  HONEST note (replaces fake INTACT):
│ Records can be corrected for 48h; after│  no unbacked badge, no dead Verify.
│ that they're locked. Verify reports at │  links to /verify (real).
│ teivaka.com/verify →                   │
├───────────────────────────────────────┤
│ JUNE 2026                              │  sticky month
│ ┌ Tue 3 June ──────────── 4 records ─┐│  day card (Fiji-local date)
│ │ 14:20 🌱 Spray · Mancozeb          ││  agronomic detail on sprays:
│ │        2.5 L/100L · WHD 14 days     ││  rate + withholding
│ │ 09:10 📦 Harvest · 42 kg Dalo · A   ││
│ │ 08:05 📷[img] Field obs · leaf spot ││  photo thumbnail inline
│ │ 07:50 💰 Money in · FJD 300 · sale  ││
│ └────────────────────────────────────┘│
│ ┌ Mon 2 June ──────────── 1 record ──┐│
│ │ 16:00 ✅ Task done · Scout Block C  ││
│ └────────────────────────────────────┘│
│            [ Load older records ]      │
│   That's the whole history for range.  │
└───────────────────────────────────────┘
   Export ▾ : CSV (full range) · History book (print)
```

## Key redesign decisions
1. **Reachable**: `/farm/history` → real page (was a redirect to Records); "History" added to the Farm sub-nav (Clock icon).
2. **Cognitive load down**: 3 control rows → 2 (preset dropdown + search; categories one row; dates only on "Custom"). Content leads; controls collapse.
3. **Decision-making**: a summary strip (records, kg, cash in/out, sprays, last activity) for the active range — answers "how's the season going?" at a glance. Honestly labelled "loaded".
4. **Honesty**: removed the hardcoded "chain INTACT" and the per-row dead "Verify"; copy now states the real 48h-correction rule and links to the working public /verify.
5. **Correctness**: Fiji-local day/time bucketing; export includes tasks; no raw UUIDs (worker code or "you").
6. **Workflow**: agronomic detail on sprays (rate + WHD), photo thumbnails inline, tap a row → its source section.
7. **Removed dead code**: `ModeDropdown` (mode purged) and the unused `QueryClientProvider`.

## Deferred (honest, Phase B — needs backend, not faked)
- Server-side unified `/history` over `audit.events` with per-row hash + true total count + server-side search (today it's a client merge of 5 sources; search/total are over loaded rows — labelled as such).
- Worker-name resolution from IDs; corrections/edit trail surfaced as history events.
```
