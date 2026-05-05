# Strike #99 — Cycle dropdown label unification (closed VERIFIED via Strike #100 supersession)

## What this strike resolved

Path B refinement of Strike #99 v2: cycle dropdown labels in the 5 non-PLANTING/non-TRANSPLANT Crops events (IRRIGATION, FERTILIZER_APPLIED, WEED_MANAGEMENT, PRUNING_TRAINING, LAND_PREP) plus legacy SPRAY and HARVEST forms now show production_name (CASSAVA / EGGPLANT) with duplicate-aware fallback to pu_farmer_label when same-crop duplicates exist.

## Resolution path

Strike #99 v1 deployed verbose labels. Strike #99 v2 stripped to bare "Cycle 1" ordinals — Operator audit (2026-05-05) found this insufficient for picker identity. Strike #98 Rule 6 was filed as binding doctrine in response.

Strike #99 closed as superseded by Strike #100, which:
- Replaces the bare-ordinal pattern with explicit CROP dropdown + CYCLE ordinal dropdown for ALL 9 Crops forms
- Path B's "production_name with dup-aware fallback" pattern preserved on the 7 forms that don't get CROP/VARIETY redesign
- PLANTING + TRANSPLANT_LOGGED get full 3-dropdown (CROP / CYCLE / VARIETY)

## Filed during

2026-05-05. Closed in Strike #100 commit. v1 backups (*.bak-pre-strike-99) retained.
