# Strike #100 — Three-dropdown Crops form (CROP → CYCLE → VARIETY) + crop_varieties catalog

## The doctrine

Crops events split crop identity into three independent picker fields where applicable, satisfying Strike #98 Rule 6 (forms must capture full event identity at picker step) without conflating crop selection with cycle ordinal.

PLANTING + TRANSPLANT_LOGGED render 3 dropdowns: CROP (which production), CYCLE (which time-sequence ordinal of that crop), VARIETY (which spec within the crop). Other 7 Crops events render 2 dropdowns: CROP + CYCLE only (variety not relevant when operating on existing crop instance).

## What shipped

Backend:
- Migration 068: shared.crop_varieties table created + 6 base seed rows for CASSAVA, EGGPLANT
- Migration 069: UPPERCASE casing normalization across ~80 CRP-/FRT-/SUP- production_names (Cassava, Eggplant case retained; previously-lowercase Carrot, Mint, Lettuce normalized to CARROT, MINT, LETTUCE)
- Migration 070: 95 provisional varieties (is_provisional=TRUE) seeded across 34 high-frequency Pacific crops (CABBAGE, CAPSICUM, CHILLIES, CUCUMBER, FRENCH BEANS, LONG BEAN, SQUASH/PUMPKIN, SWEET CORN, TOMATO, WATERMELON, CARROT, CAULIFLOWER, CHINESE CABBAGE, LETTUCE, OKRA, ONION, POTATO, RADISH, SWEET POTATO, DALO TARO, YAM, KAVA, GINGER, TURMERIC, ROUROU/BELE, DURUKA, PASSIONFRUIT, PAPAYA, MANGO, BANANA, COCONUT, PINEAPPLE, DRAGON FRUIT)
- Migration 071: GRANT SELECT on shared.crop_varieties to teivaka_app runtime role (Migration 068 missed this; surfaced as 500 errors in browser)
- New router: app/routers/crop_varieties.py with GET /api/v1/crop-varieties?production_id=...
- productions.py: added crop_only=true filter (excludes is_livestock/is_aquaculture/is_forestry); ORDER BY changed from "category, production_name" to "production_name" alone (CASSAVA visible at position #8 not #70)
- events_registry.py: production_id added as required field across 8 payload schemas (Planting, TransplantLogged, Irrigation, FertilizerApplied, WeedManagement, PruningTraining, LandPrep, ChemicalApplied) plus FieldEventCreate + HarvestCreate
- variety_id + variety_other added to PlantingPayload + TransplantLoggedPayload only

Frontend:
- FieldEventNew.jsx: extracted useCropAndCycle hook + CropAndCycleFields shared component; 9 form branches refactored to use the shared subcomponent
- HarvestNew.jsx: bare-fetch CROP+CYCLE 2-dropdown (matches existing pattern, no React Query)
- Bundle: FieldEventNew-DAtPe9qD.js (21.97 KB)

## Not shipped (deferred)

Per Path B (Operator decision 2026-05-05 to preserve endurance + commit cleanly):
- Strike #102 BACKLOG: ~420-490-row Operator-locked + Architect-expanded full varieties catalog. Filed at 00_project_overview/strikes/strike_102_full_varieties_catalog_BACKLOG.md. Ships next session via Migration 073.

## Strike #99 closed

Strike #99 v2 (cycle dropdown stripping to bare ordinals) closed as VERIFIED via supersession — Strike #100's CROP+CYCLE 2-dropdown pattern replaces the bare-ordinal pattern with full identity capture. v1 + v2 backups retained.

## Backlog opened

- B70: Promote crops-with-active-cycles to top of CROP dropdown via JOIN against tenant.production_cycles filtered by farm_id
- B71: Operator review of provisional varieties (is_provisional=TRUE) in CROPS Per-Pillar Vertical Map session (B64). Ships as Strike #102.
- B72: Frontend silent-failure on /api/v1/crop-varieties errors. fetchCropVarieties throws → empty dropdown with no user-visible diagnostic
- B73: Audit prior shared.* migrations for GRANT consistency. Future shared.* table migrations must include GRANT in same migration. File as binding rule under Strike #100 close-out.
- B74: Store Operator-provided Fijian production names (Tavioka, Yaqona, Vudi, Meleni etc.) — likely as new local_name column on shared.productions OR via naming_dictionary (Section 4 of CLAUDE.md). Ships in Naming Dictionary session.

## Filed during

Strike #100 close-out, 2026-05-05. Foundation for Strike #101 (3-Layer Farming System Doctrine) and Strike #102 (full varieties expansion).
