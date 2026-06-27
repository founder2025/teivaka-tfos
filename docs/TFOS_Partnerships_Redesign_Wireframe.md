# Partnerships — Redesign Wireframe (audit-approved 2026-06-27)

Rebuild of the 308-line Partnerships page (`/farm/partnerships`). Fixes the audit headlines:
error-as-empty (PN1), tenant-wide buyer/supplier counts mislabelled as this farm's (PN2),
distribution date always "—" (PN3, `calculated_at` not `calculation_date`), no delete (PN4),
a11y (PN5), non-canonical helpers (PN6) — plus the persona misses: dead directory (phone not
tappable), wall of empty rows, "New agreement" silently overwrites the one rate, and honest
copy about how distributions are actually created.

Frontend over verified endpoints + 1 tiny backend guard (`partner_type` enum). Soft-delete uses
the existing `PATCH {is_active:false}` (no new endpoint, preserves the audit row).

```
┌──────────────────────────────────────────────┐
│ Partnerships                        [Farm ▾]   │ header (real states; no filler intro)
│ Everyone you work with · updated HH:MM         │
├──────────────────────────────────────────────┤
│ ⚠ Couldn't load your network · Retry          │ ERROR/RETRY (PN1) — never silent-empty
├──────────────────────────────────────────────┤
│ 🗺  LAND & PROFIT-SHARE          [Edit/New]    │ ELEVATED first (the bank-relevant record)
│  Naidu family · 30% net profit                 │ shows only with a real rate (Inviolable #9)
│  3 splits recorded · tap for the archive       │ honest count; archive copy is honest about
│  (no agreement → "Add your landowner share")   │ how splits are created (no false auto-calc)
├──────────────────────────────────────────────┤
│ Network · 2 of 5 groups active                 │ completeness glance (behavioural)
│ ┌ Commercial          3 ▸ ┐  collapsed groups  │ COLLAPSED when empty/quiet — no wall of
│ ┌ Finance             0 ▸ ┐  one line each      │ "None added yet" rows (cognitive load)
│ ┌ Government  (open) 2 ▾ ┐                       │ expand → type rows (prototype 14-type model)
│ │   Extension officers   2 added        [+ Add] │   each partner row: name · 📞 tap-to-call /
│ │     • Mr Vakacegu · 📞 · ✎ · 🗑               │   WhatsApp · edit · delete (PN4)
│ │   Ministries          none           [+ Add]  │
└──────────────────────────────────────────────┘

Buyers / Suppliers rows: count labelled "across your farms" (PN2 — the endpoints are
tenant-wide), link out to /farm/market and /farm/resources.

Modals (role=dialog, aria-modal, Esc, focus): Add/Edit partner · Edit agreement
(prefilled, labelled "Edit" when one exists) · Distribution archive (dates from calculated_at).
```

## Decisions
1. **Real states (PN1).** `getJSON`/`send` (token refresh); the network + agreement each render loading skeleton / ErrorCard+Retry / honest-empty — a failed load never reads "None added yet."
2. **Land agreement elevated + honest.** First card, accented; shown only with a real rate (Inviolable #9 preserved). The "+ New agreement" button is **"Edit agreement" when one exists** (it upserts the single farm rate — no more implying you can add several). Archive copy states plainly how splits are created (the auto-calc-on-close keystone is filed, not faked).
3. **Counts you can trust (PN2).** Buyers/Suppliers are tenant-wide endpoints → labelled "across your farms," not silently presented as this farm's.
4. **Distribution date fixed (PN3).** Reads `calculated_at` (the real column).
5. **Delete (PN4).** Soft-delete via `PATCH {is_active:false}` behind a confirm — corrects mistakes / ended relationships without breaking the audit row.
6. **Lower cognitive load.** Groups collapse to a one-line summary (count + chevron); only groups with partners auto-expand. A "network completeness" line replaces the generic intro. The 5-group/14-type prototype model is preserved inside the expansions.
7. **Operational directory.** Phone becomes tap-to-call + WhatsApp; edit + delete inline.
8. **a11y + canonical.** Cards/rows are buttons (keyboard); modals `role=dialog`+Esc+focus; `formatMoney`. `partner_type` validated server-side (no invisible orphan rows).

## Deferred (named, backend — staged, NOT faked)
- **Auto-calculate distributions on cycle close** — the flagship gap: `POST /profit-share/calculate/{cycle}` exists but **nothing calls it**, so the archive is dormant. Wire a cycle-close hook (idempotent, RLS, Inviolable #9) — risky, staged with a tested cutover. Until then the copy is honest about it.
- **Multi-agreement** per parcel/landowner + **effective-date/history** + **lease term/expiry** + **document (lease PDF) attach** — needs a real agreements table (today it's a single farm-level rate). Material for investors + customary-land reality.
- Unify the 3 partner tables (`farm_partners` + `customers` + `suppliers`) into one read-model; professional-partner **verification handshake**; exporter→consignment link; server-side **role gate** on agreement writes; export; voice/i18n; B31 provider lift.
```
