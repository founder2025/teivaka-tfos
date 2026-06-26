# TFOS Inventory Page — Redesign Wireframe & Spec (2026-06-26)

Redesign of `/farm/inventory` (InventoryList, rendered as the Resources "Inventory" tab)
after the approved audit (I-T1/2/3, I1–I7, IX1–IX7).

## Honesty-first decision — IX1
On-hand can't be made truly accurate from the frontend: logging a spray (field-events)
does NOT deduct chemical stock (verified — `field_events.py` has no input-transaction
logic; B37 is the filed feed-equivalent). The real fix is a **backend auto-deduct**
(spray/feed-use → input-transaction USAGE). So this redesign makes the page **honest**
about it (a clear note that on-hand = logged stock movements; sprays don't auto-deduct
yet → use "Use stock") and files the backend link. We never imply accuracy we don't have.

## Visual wireframe (Resources › Inventory tab)
```
[no second "Inventory" h1 — the tab strip labels it]   [🌱 Farm ▾] [✨ Ask AI] [＋ Add]  ← I1
[ Total value (at last cost) ][ Critical ][ Low ][ In chemicals ][ Expiring ]            ← KPIs (value labelled honestly, IX2)
ⓘ On-hand reflects stock you receive/use here. Logging a spray doesn't deduct chemicals   ← IX1 honesty note
  yet — tap "Use stock" to keep counts accurate.
[ Stock | Movements | Reorder | Suppliers | Analytics ]  (keyboard-operable tabs, a11y)
── Stock ───────────────────────────────────────────────────────────────────
 filters: category · status · storage · sort · search
 ⟦ error → "Couldn't load · Retry" (not false "no items", I-T3) ⟧
 DESKTOP: 10-col table (row → Edit item, not a surprise purchase form, I2)
 MOBILE:  stacked cards — name + category · StockBar · status · "Xd left at current use"
          · value · [Receive ↓][Use ↑][Edit]                                  ← IX3 mobile cards
 [Use stock] [Receive stock]
```

## Fixes
- **IX1** honest note + file backend auto-deduct (spray/feed-use → USAGE).
- **I-T3** error/cached state on the stock list (no false "no items").
- **I-T2** Movements farm-scoped (`?farm_id=`, verified) + farm-keyed query (suppliers stay
  tenant-level by design). (Server `limit` filed.)
- **I-T1** GETs via `utils/api` (token refresh + honest errors).
- **I1** drop the redundant `<h1>Inventory</h1>` page-header (the tab labels it); compact action row.
- **I2** row click → **Edit item** (sensible), not the surprise Receive form.
- **IX3** mobile card layout (the 10-col table is desktop-only).
- **IX4 / I3** days-left shows "—" (not "∞") + "at current use (30d)" label.
- **IX2** value KPI labelled "at last cost" (honest — no weighted-avg).
- **I5** lucide arrows in Recent events; **AI** "Ask AI" restock; a11y (tabs as buttons, keyboard rows).

## Filed (backend / cross-page — honest)
- **Auto-deduct inventory on consumption** (spray/feed-use → input-transaction USAGE) — the
  real IX1 fix (B37 generalized). The keystone.
- Weighted-average/FIFO cost basis (IX2); `/input-transactions` server `limit` + date filter
  (I-T2 scale); item detail/movement-history view; PO/"awaiting delivery" state (IX5);
  add-supplier inline (IX6); batch/lot/expiry-date + chemical traceability (IX7);
  seasonal-aware days-left (IX4); drop nested QueryClient (B31).
