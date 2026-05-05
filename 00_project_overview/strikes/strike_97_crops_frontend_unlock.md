# Strike #97 — CROPS frontend unlock + Visibility Rule doctrine

**Filed:** 2026-05-05
**Class:** user-visible feature ship + binding doctrine
**Trigger:** Strike #96 backend façade complete; tiles padlocked until frontend wired.
Operator surfaced the deeper issue: invisible-foundation strikes break the operator
feedback loop that sustains motivation and clean scope decisions.

## What shipped
- FieldEventNew.jsx extended with `Strike96CropsForm` (data-driven conditional
  fields) + `FieldEventDispatcher` reading `?type=` URL param. Legacy
  `FieldEventForm` component byte-identical (CHEMICAL_APPLIED unchanged).
- LogSheet.jsx EVENT_ROUTES extended with 7 catalog-vocab entries pointing at
  `/farm/field-events?type=X`.
- Submits via Strike #96 polymorphic `/events` nested-anchors shape; payload
  includes catalog vocab event_type + payload_jsonb-able structured fields.

## Visibility Rule (binding doctrine)
Every strike commit must include at least one change the operator can verify
by opening teivaka.com in a browser. If a strike's deliverable can only be
verified via psql, curl, or git log, it is not a strike — it is a sub-step
of a larger strike that hasn't finished. Bundle until visible.

Exception: hotfix strikes that restore production to a known-good visible state.

## Process rules updated
1. Every paste pack contains a "WHAT THE OPERATOR WILL SEE" block at the top.
2. Operator browser verify is a STOP gate inside the paste pack, not a
   post-commit verify.
3. Backend-only and frontend-only strikes are bundled into single
   visible-deliverable strikes by default; split only with explicit operator
   approval.
4. Live verify cadence: when a `verified` reply lands, query the DB for the
   submission within a tight window (5 min) AND surface the actual row,
   not just a count. Visual unlock alone is necessary but not sufficient.

## Verify path passed (live browser smoke 2026-05-05)

- 7 padlocked tiles unlocked on (+) Crops: PLANTING, IRRIGATION,
  FERTILIZER_APPLIED, WEED_MANAGEMENT, PRUNING_TRAINING, TRANSPLANT_LOGGED,
  LAND_PREP.
- Operator tapped PLANTING; form opened with cycle pre-selected.
- Submit landed `FE-da4ecfc95f13` with `payload_jsonb.variety='Charming'`,
  `payload_jsonb.plant_count=2000` — proves new polymorphic path (legacy form
  doesn't write payload_jsonb).
- CHEMICAL_APPLIED legacy tile unchanged (dispatcher falls through to
  FieldEventForm when no `?type=` param).

## Out of scope (deferred per Visibility Rule satisfied)
- HARVEST_LOGGED migration to polymorphic `/events` → Strike #98 (must bundle
  with user-visible piece, e.g., new harvest UI affordance, per Visibility Rule).
- CROPS dashboard → Strike #99.
- CROPS Bank Evidence PDF → Strike #100.
- Toast hash-badge styling enhancement (current implementation embeds hash in
  message text; future Toast.jsx may render a proper badge component).

## Result
F001 (+) Crops: 7 previously padlocked tiles now clickable. Operator can log
real CROPS events from the browser end-to-end. Each submission emits one
audit.events row with hash chain integrity preserved.

## B-items

- **Opened:**
  - B78 — Container alembic state CI check.
  - B79 — Smoke verification psql commands need `SET app.tenant_id` prefix
    when querying tenant.* tables (RLS-forced).
  - B80 — Alignment Contract uses location-specific framing (Kadavu, Pacific
    Island smallholder) throughout. Update to universal framing — global
    smallholder agriculture as addressable market. Connectivity-class
    decisions stay framed by constraint, not geography.
