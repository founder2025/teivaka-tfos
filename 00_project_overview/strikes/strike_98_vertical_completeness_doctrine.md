# Strike #98 — Vertical Completeness Doctrine

## The doctrine

Every pillar (Crops, Trees & Vines, Livestock, Poultry, Bees, Fish, Forestry, Specialty, Money, Notes, Other) shipped to user-facing surface must present a complete event catalog AND complete forms covering every activity a farmer in that domain would ever log — beginner through experienced, daily through annual, routine through compliance.

**The test (catalog level):** a Pacific Island farmer of that domain opens the pillar's (+) catalog and feels "this has everything I'd ever want to log. No gaps."

**The test (form level):** a farmer opens any individual form and can describe in plain English what they just did using ONLY the form's fields. If "I transplanted 200 plants" is incomplete without "of eggplant," the form is broken on its own promise.

## Six binding rules

### Rule 1 — POULTRY-equivalent baseline (catalog level)
Most-shipped pillar sets credible target. POULTRY at filing: 50 catalog rows, 25 reachable forms, 24 padlocked. Other pillars match or exceed; don't ship under-spec.

### Rule 2 — No "coming soon" placeholder tiles
Catalog row exists only when form ships OR is explicitly padlocked with backlog tracking entry. The catalog never lies about capability.

### Rule 3 — No partial-pillar shipping to broader user base
Operator-locked taxonomy + all forms wired + Strike #92 catalog smoke + Operator visual walkthrough required before pillar opens to user traffic.

### Rule 4 — Operator-locked taxonomy per pillar
Architect proposes complete event taxonomy with Pacific reality framing (FJD economics, ferry-constrained logistics, smallholder-realistic coverage). Operator confirms with domain knowledge. NO BEST-GUESS ARCHITECT-AUTHORED TAXONOMIES SHIPPING WITHOUT OPERATOR REVIEW.

### Rule 5 — Phase 7+ ordering binding
Per-Pillar Vertical Map session sequences first; pillars after that go one at a time per Strike #79.

### Rule 6 — Forms must capture full event identity
Every form must capture every field a real farmer needs to make the event meaningful and traceable. Test: can the farmer describe in plain English what they just did using only the form's fields? If no, the form has a Strike #98 gap.

UI picker fields (dropdowns, autocompletes, radio groups) must include enough identity for the farmer to confirm correct selection. Bare ordinals ("Cycle 1") fail when multiple instances exist. At >1 instance, farmer must be able to distinguish two options at 1m visual distance.

## Discovery context

Filed during foundation work (2026-05-05). Operator surfaced principle directly: "every group should be presented as complete as possible just like how any farmer finds poultry, so i know for a fact that every form the other group might have for now is not the exact same number the group actually needs. be detailed and leave nothing behind."

Rule 6 added after Operator audited Transplant form (FieldEventNew.jsx Strike96CropsForm dispatcher) and found it captures only 4 fields (source_nursery_batch_id, plants_transplanted, spacing_cm, notes) when a Korovou farmer needs to log: crop name (only via cycle_id JOIN today), crop variety (no column anywhere — only on PLANTING events as free-text), block identity (only via pu_id JOIN), source detail beyond free-text nursery batch ID, planting depth, soil prep, water given. Form passed Strike #92 catalog smoke but failed plain-English completeness test.

The principle had been recurring across multiple sessions (Sprint 5 Path C pushback when Architect tried to ship 80 best-guess events; Sprint 6 catalog density discussions; Final Directive in CLAUDE.md). Filing #98 makes it canonical doctrine with binding force.

## Why earlier strikes don't catch this

Strike #79 (foundational completion first) governs phase ordering, not phase-completion definition. Strike #92 (catalog-fetch user-reachability) governs catalog smoke, not field-level completeness. Strike #97 (CROPS Visibility Rule) governs which UI elements are visible per role, not which fields are required.

Strike #98 adds the third leg of completeness: scope completeness per pillar AND field completeness per form.

## Backlog opened by Strike #98

- **B64**: Per-Pillar Vertical Map session — Architect drafts complete event taxonomy AND minimum viable form fields per event for all 11 pillars; Operator reviews with Pacific domain knowledge. Output: TFOS_Vertical_Completeness_Doctrine.md resource pack file. Sequences before Phase 7+ pillar work.
- **B65**: Padlocked-tile UI pattern — visual indicator (lock icon, dimmed appearance) for catalog rows whose forms haven't shipped yet; clicking surfaces "coming soon, planned for Phase X" toast or modal.
- **B66**: Form Coverage metric reframe — change CLAUDE.md Section 14 reporting from "X/49 reachable" to "Pillar P: X/N complete (Y% domain coverage)" with N being Operator-locked catalog target per pillar.
- **B67**: Strike #98 Form Audit — sweep all shipped forms with plain-English completeness test. Patient zero: Transplant (missing crop name + variety + block + source). Estimated audit scope: 25 POULTRY forms + ~15 CROPS forms + remaining pillars = ~40-60 form audits, ~5-15 minutes per form.
- **B68**: Promote crop_variety to structured catalog — when Pacific varietal taxonomy is known, replace free-text variety field with `shared.crop_varieties` table + dropdown with "type to search + add new" UX. Includes farmer-contributed entries via attribution events.
- **B69 (NEW)**: Parallel chat coordination protocol — when one chat ships a strike, the other chat receives a 1-2 sentence summary of the strike + what it changed. Tonight surfaced 5-strike drift between chats (this main chat assumed HEAD ce4e8fa / strike count 1-92; reality was HEAD 5c7929c / strike count 1-97). Future: parallel chats sync via shared CLAUDE.md commits + handover MD updates after each strike, not via Operator memory.

## Filed during

2026-05-05 ~morning Fiji time. Filed in commit following Strike #97 (5c7929c CROPS frontend unlock). Doctrine binding from this commit forward. Migration 068 (Transplant complete fields) and B67 form audit sequence after this commit.
