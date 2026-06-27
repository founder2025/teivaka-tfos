# Gallery — Redesign Wireframe (audit-approved 2026-06-27)

Mobile-first. Frontend rebuild over the verified source (field-events, now paged). Fixes the
audit: 200-cap → pagination; honest copy (field/event photos, not "every enterprise" — harvest/
animal sources are a named backend follow-up, not faked); unified tile (badge + select + keyboard)
in ALL views; action bar from any view; verified-only filter; precise "Tamper-evident" wording;
false-empty (401) fixed; Fiji dates; captured-by + GPS + map link in modal; image error fallback;
real downloadable evidence pack (photos + verify manifest) instead of a dead-end navigate.

```
┌───────────────────────────────────────┐
│ Gallery                                │  honest subtitle: "Photos from your
│ Photos from your field & event logs    │  field and event logs"
├───────────────────────────────────────┤
│ [Total 128] [This wk 6] [Verified 91]  │  stat tiles (Verified count = new)
│ [Last 03 Jun 26]                       │
├───────────────────────────────────────┤
│ Photos·Timeline·Location·Groups·AI·Pack│  view switcher (prototype)
├───────────────────────────────────────┤
│ 🔍 search   ✓Verified only             │  filters: search + verified toggle
│ All·Harvests·Field·Pest·Growing·…      │  category pills (with counts)
├───────────────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐                │  UNIFIED tile everywhere:
│ │✓ ▣  │ │  ▣  │ │✓📍▣ │   …            │   ✓ = tamper-evident badge
│ │[img]│ │[img]│ │[img]│                │   📍 = geotagged
│ │label│ │label│ │label│                │   ▣ = select (keyboard-openable)
│ └─────┘ └─────┘ └─────┘                │
│            [ Load more ]               │  pagination (no 200 cap)
├───────────────────────────────────────┤
│ Selected 3 · Download · WhatsApp ·     │  action bar shows in ANY view
│   Email · Evidence pack · Clear        │
└───────────────────────────────────────┘

Photo modal:
┌───────────────┬───────────────────────┐
│   [ photo ]   │ Event · 03 Jun 26      │
│               │ Where: Block C  📍 map │  ← GPS + OSM link when present
│               │ Captured by: Mereani   │  ← operator (was missing)
│               │ Note: leaf spot…       │
│               │ ✓ Tamper-evident       │  ← precise wording + SHA
│               │ [Download][Verify][Open]│  Verify only when audit_hash
└───────────────┴───────────────────────┘

Evidence pack (real, not a navigate):
  Select photos → "Download evidence pack" → each photo + a manifest.csv
  (label, date, block, event id, SHA-256, https://teivaka.com/verify/<hash>).
  Secondary "Open in Bank Evidence" carries the selected ids via router state.
```

## Decisions
1. **Honesty over copy:** subtitle/banner now say "field and event logs"; a one-line note says harvest + animal photo sources join as those flows gain photo capture. The over-claim is removed, not faked.
2. **One tile everywhere** — badge, geotag chip, select, keyboard — so provenance + multi-select work in Timeline/Location/Groups too (were Photos-only).
3. **"Verified only" filter + "Tamper-evident" wording** — the badge claims byte-integrity-since-logging, not capture authenticity; the copy now says exactly that.
4. **Evidence pack is real** — downloadable photos + a verify manifest; Bank Evidence handoff passes the selection via router state (no silent drop).
5. **Correctness** — Fiji dates, paginated, 401≠empty, captured-by + GPS surfaced, `<img onError>` fallback.

## Deferred (named, not faked — backend)
- Multi-source photos: add `photo_url` to the harvests list response; surface poultry/livestock + cash-receipt photos; then restore the "every enterprise" framing truthfully.
- Server-side photo index (cursor) + thumbnail variants; map view (Leaflet) for By-location; AI photo analysis; zip download; cross-farm/enterprise + government verifiable export.
```
