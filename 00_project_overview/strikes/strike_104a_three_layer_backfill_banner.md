# Strike #104a — 3-Layer Backfill Banner + NewCycleModal Layer Dropdown

## What shipped

Operator-visible 3-Layer classification surface for existing cycles + new cycle creation. Schema rails from Strike #103 exercised end-to-end.

Backend:
- `app/services/cycle_service.py` — `create_cycle()` accepts `layer` param (Optional, validated against `farm_layer` enum)
- `app/routers/cycles.py` — `CycleCreate.layer` field added; new endpoints `PATCH /{cycle_id}/classify-layer` + `GET /needing-classification`
- `app/routers/productions.py` — `/api/v1/productions` response now exposes `suggested_layer` + `requires_classification_at_creation` + `layer_rationale` per row

Frontend:
- `LayerBackfillBanner.jsx` (NEW, non-dismissable per Amendment 3) — yellow persistent banner on `/farm` when count > 0; modal lists per-cycle classification with pre-selected radio + rationale hint; per-row save via PATCH; banner auto-dismisses when count → 0
- `NewCycleModal.jsx` — layer dropdown after crop+PU; pre-fills from `suggested_layer` when not borderline; forces explicit pick when `requires_classification_at_creation=TRUE`; rationale hint visible
- `FarmDashboard.jsx` — mounts `LayerBackfillBanner`

## Operator visual verification (2026-05-05, F001)

10 criteria confirmed:
- Banner appears at top of `/farm` with "2 cycles need layer classification"
- No X / dismiss button on banner (Amendment 3 binding)
- CTA "Classify cycles" opens modal with 2 rows
- CASSAVA pre-selects FOOD_SECURITY + rationale "Doctrine explicit. Pacific staple."
- EGGPLANT pre-selects CASH_FLOW + rationale "Doctrine explicit. Biweekly picking once productive."
- Save per row → row removes → modal auto-closes when both done → banner disappears
- Reload `/farm` → banner stays gone (sticky via `staleTime:0` query refetch)
- + New cycle → CASSAVA → layer pre-fills FOOD_SECURITY + rationale visible
- + New cycle → PINEAPPLE (borderline) → layer dropdown empty + required + warning text

## Doctrine satisfaction

- Strike #97 Visibility Rule: operator browser-verified before commit ✓
- Strike #98 Rule 6: NewCycleModal layer dropdown required + rationale hint ✓
- Strike #101 Rule 1 (existing cycles): F001 backfilled via banner classification ✓
- Strike #101 Rule 5 (onboarding establishes layer mix BEFORE pillar): NOT YET — deferred to #104b
- Strike #88: Section 14 'Last commit:' continues to reference last phase commit ✓
- Strike #92: new endpoints surface in `/openapi.json` ✓
- Strike #90: PRE-CHECK clean (Plan B engaged when `farms.onboarding_complete` column found missing; canonical state lives at `tenants.onboarded_at`)

## Phase 5.10 doctrine flag (filed as receipt)

Phase 5.10 doctrinal cleanup specifically removed pillar commitments from onboarding ("learn the user, not pillar commitments"). Layer mix declaration is **strategic (WHY)**, not **pillar (WHAT)** — compatible with Phase 5.10. #104b LayerStrategy page (queued) will frame layer mix as strategic intent, not pillar selection. Doctrinal reconciliation explicit in #104b commit narrative.

## Limitations / what didn't ship

- LayerStrategy onboarding page for new tenants (queued as #104b)
- OnboardingContext localStorage backup (queued as #104b)
- Per-farm layer-mix declaration page (Operator request mid-#104a verify; queued as expanded #104b scope per below)

## Backlog opened

- **B79**: `/ultraplan` cloud round-trip test on Strike #105+ — must launch from `/opt/teivaka` CWD (B69 binding case study)
- **B80**: Phase 5.10 doctrine reconciliation — confirm layer-mix declaration as strategic (WHY) is doctrinally distinct from pillar commitment (WHAT). Operator review during Naming Dictionary session.
- **B81 (NEW)**: Per-farm layer-mix declaration page architecture — Operator surfaced mid-#104a verify the need for a settings surface where farmer declares "MY Cash Flow productions: [...] MY Food Security: [...] MY Asset Crops: [...]" with add/remove from full crop catalog. Schema decision: `tenant.farm_layer_strategy` table vs JSONB on `tenant.farms`. UI decision: dedicated page vs inline. Reconciliation logic: declared layer overrides `suggested_layer`; existing cycles auto-reclassified or prompted? Operator-locked design decisions per Strike #98 Rule 4. Ships as #104b expanded scope.
- **#104b queued**: New-tenant onboarding LayerStrategy extension (Strike #101 Rule 5) PLUS per-farm layer-mix declaration page (B81)
- **#104c queued**: Migration 073 NOT NULL constraint on `tenant.production_cycles.layer` (post-#104a + #104b verified, +7 days production usage)

## Files changed

- `11_application_code/app/services/cycle_service.py` (+~5 LOC)
- `11_application_code/app/routers/cycles.py` (+~80 LOC, 2 new endpoints)
- `11_application_code/app/routers/productions.py` (+3 LOC, 3 fields added to SELECT)
- `frontend/src/components/farm/LayerBackfillBanner.jsx` (NEW, ~300 LOC)
- `frontend/src/components/farm/NewCycleModal.jsx` (+~50 LOC)
- `frontend/src/pages/farmer/FarmDashboard.jsx` (+~5 LOC)

## Filed during

2026-05-05 evening Fiji time. Foundation marathon close-out — 7th strike of session (98, 99, 100, 101, 103, 104a). Operator endurance + timing per binding memory rule.
