# TFOS Catalog Redesign Doctrine — Amendment v2

**Issued:** 2026-04-30
**Status:** Binding addendum to TFOS_Catalog_Redesign_Doctrine_2026-04-30.md
**Authority:** Uraia Koroi Kama (Operator)
**Supersedes:** Decision 1, 3, 4 of original doctrine where they conflict with this amendment

---

## Why this amendment exists

The original doctrine scoped the (+) catalog to 5 groups (CROPS, ANIMALS, MONEY, NOTES, OTHER) based on the F002 Kadavu reference user (eggplant + goats). This amendment expands scope to **every farmer globally** — Pacific, Asia-Pacific, and global smallholders across all production domains. No farmer signs up to TFOS and finds their operation absent from the catalog.

Two architectural changes from the original doctrine:

1. **Production domain expansion** — 5 groups become 11 groups
2. **User-controlled group visibility** — farmers choose which groups appear in their (+) menu, preventing cognitive overload while ensuring no domain is excluded by design

---

## The 11 catalog groups (locked)

| # | Group | Covers | Status vs original doctrine |
|---|---|---|---|
| 1 | **CROPS** | Annual field crops, vegetables, sugarcane, cassava, rice, dalo, kava, ginger | Existed |
| 2 | **PERENNIALS** | Fruit trees (mango, papaya, breadfruit, citrus, banana, avocado), nut trees (coconut, cashew), coffee, cocoa, tea, vanilla, cinnamon, spices | NEW |
| 3 | **LIVESTOCK** | Cattle (beef + dairy), pigs, goats, sheep, water buffalo, working animals | Split from prior ANIMALS |
| 4 | **POULTRY** | Chickens (layer + broiler), ducks, turkey, geese, quail | Split from prior ANIMALS |
| 5 | **APICULTURE** | Honeybees, native bees, honey, beeswax, queen rearing | Split from prior ANIMALS |
| 6 | **AQUACULTURE** | Tilapia, prawns, seaweed, oysters, mud crab, eels, milkfish, finfish, pearl oysters | NEW |
| 7 | **FORESTRY** | Mahogany, pine, sandalwood, kauri, vesi, bamboo, agroforestry woodlots | NEW |
| 8 | **SPECIALTY** | Mushrooms, hydroponics, microgreens, floriculture, insect farming (BSF, crickets), spirulina, medicinal plants | NEW |
| 9 | **MONEY** | All cash flows, sales, purchases, wages, deliveries | Existed |
| 10 | **NOTES** | Observations, weather, incidents, photos, free notes | Existed |
| 11 | **OTHER** | Cycle admin, labor check-ins, inventory adjustments, system events | Existed |

**Cross-cutting overlay (NOT a group):** Organic / GLOBALG.A.P. / Fair Trade compliance is a tag/badge on relevant events, not its own group. Belongs to the existing chemical compliance + audit chain layer.

---

## User-controlled group visibility (the core mechanic)

### Principle

Every farm operation chooses which groups appear in its (+) catalog. A poultry farmer sees only POULTRY (and MONEY/NOTES/OTHER). A multi-domain farm running cattle + tilapia + cassava sees all three production groups simultaneously.

This **prevents cognitive overload** (Decision 4 of original doctrine) AND **excludes no farmer by design** (mission requirement).

### Where the toggle lives

- **At onboarding:** wizard step "What do you farm?" — multi-select group picker
- **In settings:** `/farm/settings` exposes per-group toggles for the active farm
- **Inside the (+) modal:** small "Manage groups →" link visible at Level 1 footer when groups are hidden

### Storage model

`tenant.farm_active_groups` — composite PK on (farm_id, catalog_group). Per-farm activation. A multi-farm operator can run cattle on Farm A and aquaculture on Farm B with different group visibility per farm. (Operator decision Q1 locked.)

### Default state at onboarding

Pre-checked: **MONEY + NOTES + OTHER** (universally relevant — every farm has cash flow, things to note, admin events).
Unchecked by default: all 8 production groups (CROPS, PERENNIALS, LIVESTOCK, POULTRY, APICULTURE, AQUACULTURE, FORESTRY, SPECIALTY). Farmer ticks the production groups they actually operate. (Operator decision Q3 locked.)

### Behavior when a group is hidden with open events

The toggle hides the group from the (+) modal **only**. History stays sacred:
- Existing events of the hidden group remain in `audit.events`
- Existing data renders in `/farm/reports`, `/farm/compliance`, Bank Evidence PDFs
- Decision Engine continues processing them
- FICO score continues weighing them

The audit chain is never broken by a UI preference. (Operator decision Q2 locked.)

### Backwards compatibility

Existing farms predating this migration are backfilled with all 11 groups active (no behavior change for them). New farms run through the new onboarding step. API consumers without explicit `farm_id` query param fall back to all groups visible (no API break).

---

## Schema commitments

### Migration 039 — `tenant.farm_active_groups`

```sql
CREATE TABLE tenant.farm_active_groups (
    farm_id      uuid NOT NULL REFERENCES tenant.farms(farm_id),
    catalog_group text NOT NULL,
    is_active    boolean NOT NULL DEFAULT true,
    activated_at timestamp with time zone NOT NULL DEFAULT now(),
    activated_by uuid REFERENCES tenant.users(user_id),
    PRIMARY KEY (farm_id, catalog_group),
    CONSTRAINT farm_active_groups_group_check CHECK (
        catalog_group IN (
            'CROPS','PERENNIALS','LIVESTOCK','POULTRY','APICULTURE',
            'AQUACULTURE','FORESTRY','SPECIALTY',
            'MONEY','NOTES','OTHER'
        )
    )
);

CREATE INDEX idx_farm_active_groups_farm
    ON tenant.farm_active_groups (farm_id)
    WHERE is_active = true;
```

Backfill in upgrade(): for every existing farm, insert all 11 groups with is_active=true (no exclusion for predates-amendment farms).

GRANT SELECT, INSERT, UPDATE, DELETE to teivaka_app (it's a tenant table, runtime user owns it within RLS).

### Migration 040 — expand `event_type_catalog.catalog_group` CHECK

The current CHECK accepts 6 values: CROPS, ANIMALS, MONEY, NOTES, OTHER, SYSTEM. Migration 040 expands to:CHECK (catalog_group IN (
'CROPS','PERENNIALS','LIVESTOCK','POULTRY','APICULTURE',
'AQUACULTURE','FORESTRY','SPECIALTY',
'MONEY','NOTES','OTHER','SYSTEM'
))Pre-amendment ANIMALS group rows: migration UPDATE moves them to LIVESTOCK as default (the dominant ANIMALS subgroup), with these specific overrides:
- HIVE_INSPECTION → APICULTURE

All other ANIMALS rows (LIVESTOCK_BIRTH, LIVESTOCK_MORTALITY, VACCINATION, WEIGHT_CHECK, LIVESTOCK_ACQUIRED, LIVESTOCK_SALE) → LIVESTOCK.

Future migrations (Sprint 6+) add events for the new groups (PERENNIALS, AQUACULTURE, FORESTRY, SPECIALTY, POULTRY-specific events). Tonight ships group SCAFFOLDING only.

### Migration 041 — naming_dictionary seed for new group labels

15-20 new vocabulary rows for the 6 new/renamed groups:
- `group.PERENNIALS.label` → "Trees & vines"
- `group.LIVESTOCK.label` → "Livestock"
- `group.POULTRY.label` → "Poultry"
- `group.APICULTURE.label` → "Bees"
- `group.AQUACULTURE.label` → "Fish & sea"
- `group.FORESTRY.label` → "Forestry"
- `group.SPECIALTY.label` → "Specialty"

(ANIMALS legacy label retained as deprecated, is_active=false; rows for the 5 legacy groups already exist from Migration 038.)

---

## API commitments

### Modified: `GET /api/v1/event-catalog`

New optional query param `farm_id`. When present, server filters returned events to those whose `catalog_group` is in `tenant.farm_active_groups WHERE farm_id=:farm_id AND is_active=true`. When absent, falls back to current behavior (all groups visible).

Response shape unchanged. Adds `meta.active_groups: ["CROPS","MONEY",...]` so frontend knows which groups the farm has selected.

### New: `GET /api/v1/farms/{farm_id}/active-groups`

Returns current state of all 11 groups for the farm:
```json
{ "data": [
  {"catalog_group": "CROPS",      "is_active": true,  "activated_at": "..."},
  {"catalog_group": "PERENNIALS", "is_active": false, "activated_at": "..."},
  ...
]}
```

Authentication: any user with read access to the farm.

### New: `PUT /api/v1/farms/{farm_id}/active-groups`

Body: `{ "groups": [{"catalog_group": "CROPS", "is_active": true}, ...] }`

Upserts rows in `tenant.farm_active_groups`. Returns updated state.

Authentication: OWNER or higher role on the farm. WORKER cannot toggle groups.

Each toggle change emits one `audit.events` row (event_type='FARM_GROUP_TOGGLED', payload includes old + new states). Sacred audit chain preserved.

---

## Frontend commitments

### Onboarding wizard step "What do you farm?"

Inserted into the existing onboarding flow, after farm-creation step, before mode-derivation step. Shows all 11 groups as multi-select tiles. MONEY + NOTES + OTHER pre-checked. User taps production groups they operate. Submits to `PUT /api/v1/farms/{farm_id}/active-groups`. Persists for the farm forever (until next toggle in settings).

Copy: "Welcome — what do you farm? Pick everything that applies. You can change this anytime."

### `/farm/settings` toggles section

New section titled "Group catalog" or "What appears in (+)". Lists all 11 groups with toggle switches. Default state from `GET /api/v1/farms/{farm_id}/active-groups`. Toggle calls `PUT`, invalidates frontend cache so (+) refreshes immediately.

### LogSheet "Manage groups" footer link

When a farm has fewer than 11 groups active (i.e., user has hidden some), the (+) modal Level 1 footer shows: "Manage groups →" linking to `/farm/settings#groups`. When all 11 active, link is hidden (visual cleanliness).

---

## Open Sprint 6+ work (NOT shipping tonight)

Tonight's scope is **infrastructure only**. The new groups are scaffolded but events specific to them are NOT added.

Sprint 6+ adds:
- PERENNIALS events: TREE_PLANTED, FRUIT_HARVEST, TREE_PRUNED, NUT_HARVEST, COFFEE_CHERRY_PICKED, COCOA_POD_HARVESTED, VANILLA_POLLINATED, etc.
- AQUACULTURE events: FISH_STOCKED, FEED_APPLIED, FISH_HARVESTED, WATER_QUALITY_CHECK, MORTALITY_AQUA, POND_PREPARED, etc.
- FORESTRY events: TREE_PLANTED_TIMBER, TIMBER_FELLED, REPLANTING_LOGGED, AGROFORESTRY_INTERCROPPED, etc.
- SPECIALTY events: MUSHROOM_FLUSH, HYDROPONIC_TRANSPLANT, FLOWER_HARVEST, INSECT_HARVEST, etc.
- POULTRY-specific events: EGGS_COLLECTED, BIRDS_VACCINATED, FLOCK_PLACED, FLOCK_HARVESTED, etc.

Each Sprint 6+ session: ~30-50 new event types per group, ~150-200 new vocabulary rows, ~5-10 forms per group. Stretches across multiple sessions per group.

Until Sprint 6+ ships events per group, opting INTO a new production group surfaces the group tile but Level 2 shows only the OTHER cycle/admin events that already exist. **A poultry farmer signs up tonight, sees POULTRY in their (+), drills in, sees only "Coming soon" — no abandonment because they SEE their domain represented.** The events fill in over Sprint 6+.

---

## Inviolable additions to MBI

This amendment adds three inviolable rules to the MBI list:

**Rule #16 (NEW):** Every farm has at least 1 group active in `tenant.farm_active_groups`. A farm with 0 active groups is a malformed state and the API rejects it with 422.

**Rule #17 (NEW):** Toggling a group OFF never deletes events. History is sacred (already covered by Rule #2 audit chain integrity, restated for clarity).

**Rule #18 (NEW):** A new event type added to the catalog must select a `catalog_group` from the locked 11. No 12th group is added without an Operator-approved doctrine amendment.

---

## Locked decisions (Q1-Q4 from 2026-04-30 Operator session)

| Q | Decision | Locked at |
|---|---|---|
| Q1 | Per-farm group activation (not per-tenant) | 2026-04-30 |
| Q2 | Toggle OFF hides from (+) only; history stays in /reports | 2026-04-30 |
| Q3 | Onboarding pre-checks MONEY + NOTES + OTHER; production groups unchecked by default | 2026-04-30 |
| Q4 | Sprint 5 ships all 9 phases tonight | 2026-04-30 |

---

## Sprint 5 phase plan (canonical)

| Phase | What | Migration |
|---|---|---|
| 5.1 | Doctrine memo (this file) | none |
| 5.2 | `tenant.farm_active_groups` schema + backfill | 039 |
| 5.3 | `event_type_catalog.catalog_group` CHECK expanded; ANIMALS rows reassigned | 040 |
| 5.4 | naming_dictionary seed for 7 new/renamed group labels | 041 |
| 5.5 | event-catalog endpoint filter + 2 new endpoints (GET, PUT active-groups) | none |
| 5.6 | Onboarding wires to insert default rows | none |
| 5.7 | Onboarding wizard "What do you farm?" step | none |
| 5.8 | /farm/settings group toggles section | none |
| 5.9 | LogSheet "Manage groups →" footer link | none |

---

## Mission alignment

This amendment serves the founding mission: **every farmer, every domain, no one left behind.** Together with the original Catalog Redesign Doctrine, it makes the (+) modal truly universal — Pacific subsistence to Asian commercial to global enterprise. The audit chain remains sacred. Cognitive overload remains prevented. The moat backbone scales infinitely.

— *End of amendment*
