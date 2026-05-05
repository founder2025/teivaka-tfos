# Strike #99 — Cycle dropdown label refinement (Path B verified)

## What shipped

Cycle picker labels in CROPS event dropdowns and the Active Cycles table were inconsistent across surfaces (raw machine ID `CYC-...` in some, verbose `"<crop> on <PU>"` in others). Strike #99 unified the rendering with a duplicate-aware helper plus a separate, identity-providing table column structure.

### Backend (1 file)
- `11_application_code/app/routers/cycles.py` (+5 / -1) — `/api/v1/cycles` response now includes `block_sequence` (ROW_NUMBER PARTITION BY pu_id ORDER BY planting_date ASC NULLS LAST, cycle_id ASC) alongside existing `production_name` and `pu_farmer_label` (already in the SELECT, exposed for completeness).

### Frontend (3 files, 4 surfaces)

**Active Cycles table** — `frontend/src/components/farm/ActiveCyclesTable.jsx` (+2 / -2)
- Cycle column renders `Cycle ${c.block_sequence ?? c.cycle_id}` ("Cycle 1") with monospace styling removed.
- Crop column unchanged (renders `production_name`, e.g. "CASSAVA").
- PU column unchanged (renders `pu_farmer_label`, e.g. "My cassava block").
- Identity is provided by adjacent columns; cycle ordinal alone in the first column is enough since the row reads "Cycle 1 │ CASSAVA │ My cassava block" left-to-right.

**Cycle dropdowns (3 surfaces)** — `HarvestNew.jsx`, `FieldEventNew.jsx` (Strike96CropsForm + legacy FieldEventForm spray)
- Module-scope helper `cycleLabel(c, allCycles)`:
  - Default: render `production_name` (e.g. "CASSAVA")
  - Duplicate-aware fallback: when more than one cycle in the list shares the same `production_name`, render `${production_name} — ${pu_farmer_label || pu_id}` (e.g. "CASSAVA — My cassava block")
- Dropdown calls `cycleLabel(c, all)` via the third map argument so the full list is available without extra refactor.

## Path A → B history (closed)

- v1 attempt (prior session): label format `"<crop> on <PU>"` — Operator rejected, wanted metadata removed.
- v2 attempt (this session): stripped to bare ordinals `"Cycle 1"` — too thin for dropdowns where multiple options must be distinguished at picker time.
- Path B (this session): `cycleLabel(c, all)` helper — production_name with duplicate-aware suffix. Verified.

## Strike #98 Rule 6 satisfaction

Every cycle picker must include enough identity for the farmer to confirm correct selection at >1 instance (Strike #98 Rule 6, filed alongside this work after Operator's Transplant audit surfaced the gap on the v2 stripped form). Path B satisfies this **for the cycle picker specifically**: when crops are unique, the operator sees crop name; when duplicated, sees crop + block.

## Outstanding (deferred to Strike #100)

The cycle picker is one fix; the **broader form completeness gap** Operator surfaced in the same audit is bigger:

- PLANTING form schema-fields capture only `variety` (free text), `plant_count`, `spacing_cm`. No structured variety catalog.
- TRANSPLANT_LOGGED form schema-fields capture only `source_nursery_batch_id` (free text), `plants_transplanted`, `spacing_cm`. No crop dropdown, no variety, no destination identity beyond cycle anchor.

Strike #100 ships the three-dropdown CROP/CYCLE/VARIETY redesign for these two events plus Migration 068 (`shared.crop_varieties` catalog). Out-of-scope for #99.

## Files changed (committed by this strike)

- `11_application_code/app/routers/cycles.py`
- `frontend/src/components/farm/ActiveCyclesTable.jsx`
- `frontend/src/pages/farmer/FieldEventNew.jsx`
- `frontend/src/pages/farmer/HarvestNew.jsx`

## Backups retained on disk

- `*.bak-pre-strike-99` (03:42 — pre-v1, prior session)
- `*.bak-pre-strike-99-v2` (05:42 — pre-v2, this session, equivalent to Strike #97 baseline)
- `*.bak-pre-strike-99-pathB` (07:16 — pre-Path-B, equivalent to v2 stripped state)

Eligible for `_archive/` cleanup once Strike #100 closes, per repo hygiene cadence.

## Filed during

2026-05-05 Fiji afternoon, this session. Filed in commit following Strike #98 (45e588e Vertical Completeness Doctrine). Strike #100 follows as a separate commit in the same session.
