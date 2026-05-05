# Strike #96 — CROPS B2 polymorphic wrapper backend façade

**Filed:** 2026-05-05
**Class:** architectural unification
**Trigger:** Operator override "build pillars before automation" exposed CROPS as
the largest unfinished pillar. Recon discovered two parallel event systems:
polymorphic /events (POULTRY) and legacy field_events (CROPS). field_events
turned out to be richer (WHD trigger, hypertable, FKs, soft delete) than
poultry_event_log.

## Architectural decision (B2 + Path A)

- B1 (pure polymorphic, abandon field_events) rejected: would destroy WHD trigger
  enforcing Inviolable Rule #1.
- B3 (extend CHECK + add registry classes only) rejected: doesn't unify
  architectural surface; doesn't solve payload storage.
- **B2 + Path A adopted**: /events endpoint becomes a façade that fans out to
  backing tables per `target_table` registry field. CROPS routes through /events
  → handler → tenant.field_events with vocabulary translation + structured-column
  mapping + payload_jsonb overflow. WHD trigger preserved; chemical_id continues
  to fire whd_clearance_date population.

## What shipped

1. Migration 067 (3 op.execute() per Strike #72):
   - ADD COLUMN `payload_jsonb jsonb` to `tenant.field_events` (hypertable-safe).
   - DROP + ADD CHECK on `event_type` adding `WEED_MANAGEMENT` and `LAND_PREP`.
2. 8 new Pydantic payload classes in `events_registry.py` registered against
   `tenant.field_events` (3-tuple registry shape preserved).
3. New `# 5b. CROPS branch` in `events.py` with `CATALOG_TO_FIELD_VERB` map +
   structured-column mapping. Existing POULTRY INSERT now in `else:`.
4. New `# 2bb. CROPS-specific:` validation block requiring `cycle_id` and
   `pu_id` (both NOT NULL on field_events).
5. `field_event_id` format: `f"FE-{uuid4().hex[:12]}"` per D1.

## Vocabulary translation (CATALOG_TO_FIELD_VERB)

| Catalog vocab        | field_events.event_type |
|----------------------|-------------------------|
| PLANTING             | PLANTING                |
| IRRIGATION           | IRRIGATE                |
| CHEMICAL_APPLIED     | SPRAY                   |
| FERTILIZER_APPLIED   | FERTILIZE               |
| WEED_MANAGEMENT      | WEED_MANAGEMENT (new)   |
| PRUNING_TRAINING     | PRUNE                   |
| TRANSPLANT_LOGGED    | TRANSPLANT              |
| LAND_PREP            | LAND_PREP (new)         |

HARVEST_LOGGED intentionally NOT included — stays on `/api/v1/harvests` legacy
path (B75 → Strike #97).

## Structured-column mapping (β single-mapper inside handler)

| Payload field            | field_events column        |
|--------------------------|----------------------------|
| `notes`                  | `observation_text`         |
| `photo_url`              | `photo_url`                |
| `gps_lat` / `gps_lng`    | `gps_lat` / `gps_lng`      |
| `input_id` / `input_qty_used` / `input_cost_fjd` | same names |
| `labor_hours` / `labor_cost_fjd`                  | same names |
| CHEMICAL_APPLIED.chemical_id            | `chemical_id`              |
| CHEMICAL_APPLIED.application_rate       | `chemical_dose_per_liter`  |
| CHEMICAL_APPLIED.tank_volume_liters     | `tank_volume_liters`       |
| CHEMICAL_APPLIED — implicit             | `chemical_application=true`|
| All validated payload fields            | `payload_jsonb` (overflow) |

## Verify path passed (live smoke 2026-05-05)

- PLANTING smoke: 201 → `FE-277b903ed8d9` in field_events; payload_jsonb populated; observation_text="Strike #96 smoke".
- WEED_MANAGEMENT smoke: 201 → `FE-0ba1e6684448`; new CHECK enum value accepted.
- CHEMICAL_APPLIED smoke: 201 → `FE-b5166d5809eb`; `whd_clearance_date = 2026-05-12` (= event_date + 7-day WHD); `chemical_application = true`; `chemical_dose_per_liter = 5.0000`; `tank_volume_liters = 20.00`. Inviolable Rule #1 dual-layer enforcement intact.
- Audit chain: 0 null hashes; 0 broken links across most-recent 10 links; 3 smoke events present in audit.events.

## Out of scope (Strike #97)

- FieldEventNew.jsx conditional fields per event_type
- LogSheet.jsx EVENT_ROUTES wiring for 7 padlocked CROPS tiles
- HARVEST_LOGGED migration to polymorphic /events (B75)
- (+) Crops tiles remain padlocked at end of #96

## Process rules born from this strike

1. **Architectural recommendations require schema-level recon** (constraints,
   triggers, FKs, structured columns) — not just code-pattern recon. The
   original Strike #96 paste pack assumed `payload_jsonb` existed on
   `tenant.field_events`; it didn't. Six concrete drift points surfaced only
   when a `\d+` was run before any code was written.
2. **Registry tuple shape must be honored** — `EVENT_TYPE_REGISTRY` is
   `dict[str, tuple[Schema, target_table, version]]`, not `dict[str, Schema]`.
   New entries must be 3-tuples.
3. **Handler dispatch is registry-tuple-driven, not elif-chain-driven** — the
   first attempt to add an `elif event_type in {...}` branch was wrong. Path A
   reads `target_table` from the destructured registry tuple.
4. **`event_type` in audit emit carries catalog vocab; field_events row carries
   translated verb.** Two vocabularies, one boundary. The audit chain stays in
   catalog space; the structured backing table stays in legacy verb space.
5. **Container alembic state can lag host alembic state.** Strike #96 surfaced
   that the api container's `/app/alembic/versions/` was stale by 4 migrations;
   `docker cp` of intermediate files was required before `alembic upgrade head`
   could chain. Worth backlogging a CI-level reconciliation check.

## B-items

- **Closed:** B64 (vocabulary fork formally resolved via CATALOG_TO_FIELD_VERB).
- **Opened:**
  - B75 — HARVEST_LOGGED legacy path → Strike #97 scope.
  - B76 — MONEY pillar B2 wrapper to `cash_ledger` backing table (Sprint 8).
  - B77 — LIVESTOCK pillar B2 wrapper if legacy register-style (Sprint 9).
