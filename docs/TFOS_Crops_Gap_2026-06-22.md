# Crops — Prototype vs Prod Gap Analysis + Build Queue (2026-06-22)

Prime Directive step 1–2: enumerate the prototype's Crops surfaces, diff vs prod, rank.
Source: sacred prototype `docs/TFOS_MyFarm_Prototype_v263_20260608.html` (59,536 lines).
Verified against prod code (frontend/src + 11_application_code/app) + live DB catalog.

## Verdict: Crops is the strongest vertical — core is REAL

All 3 primary screens + cycle detail + the (+) catalog + ~27 event forms are REAL
(real `tenant.*` data, every (+) emits `audit.events`, honest-empty states, no mock
charts). Routes, backend, WHD enforcement, rotation panel, Crop Bank Evidence PDF — live.

## GAP 1 (Tier 1) — 12 padlocked CROPS (+) tiles  ← Strike #98 violation, build-first

Catalog = 39 CROPS `event_type`s; 27 wired in `LogSheet.jsx` EVENT_ROUTES; **12 locked**:

| Group | Locked tiles | Resolution |
|---|---|---|
| Post-harvest / sales | POST_HARVEST_LOSS, GRADING, DELIVERY_DISPATCHED, DELIVERY_CONFIRMED | build forms → `/events` (completes Bank-Evidence delivery trail) |
| Nursery lifecycle | NURSERY_BATCH_CREATED, GERMINATION_LOGGED, NURSERY_READY | BATCH→route to `/farm/nursery/new`; other 2 → small forms |
| Cycle lifecycle | CYCLE_CLOSED, STAGE_TRANSITION | functional via CycleDetail PATCH — route tile or hide |
| Input / money | INPUT_PURCHASED, INPUT_RECEIVED, PAYMENT_RECEIVED | likely MONEY/inventory — route or recategorize (not pure CROPS) |

**Recommended first build: the Post-harvest/sales pack (4 events)** — highest operator +
Bank-Evidence value, cohesive, uses the proven `Strike96CropsForm` → `/events` pipeline.

## GAP 2 (Tier 2) — secondary views the prototype promises, missing in prod

Verified absent in prod code:
- **Cycles**: Calendar (13-week) + Planner (next-cycle suggestions) sub-views. (List + detail exist.)
- **Harvests**: Buyer-grouped + Calendar + Analytics sub-views. (Log view exists.)
- **Field events**: Map (block heatmap) + Analytics sub-views; event-detail parent→child chain view. (Feed + Catalog exist; Compliance is a separate route.)
- 3-Layer roll-up bar on the Cycles list (prototype line 15475) — confirm presence in prod CycleList.

## GAP 3 (Tier 3) — flows + fidelity

- "Plant a crop" guided flow (`openPlantDirect`, prototype 31703) — absent in prod.
- PIXEL-EXACT pass (binding rule 2026-06-10): even REAL surfaces must match the
  prototype's exact CSS/markup, not a reinterpretation. Recon verified data-realness,
  NOT pixel fidelity — every shipped surface needs a fidelity diff.

## Build order (recommended)
1. Post-harvest/sales pack (4 locked tiles) — Bank-Evidence value.
2. Nursery pack (3 locked tiles).
3. Cycle-lifecycle routing (2 tiles) + input/money recategorization decision (3 tiles).
4. Tier-2 secondary views (Buyer view first — banker value).
5. Tier-3 fidelity pass + Plant-a-crop flow.

Each built backend-first, verified in-browser (the (+) tile is no longer padlocked AND
submits a real audit row), per the Prime Directive STOP gate.
