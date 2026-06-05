# Prototype V262 — Coverage Matrix · Module 12: LOCATIONS (#12) (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`coreLocationsView` 29493, `renderBlockDetailPanel`
> 29883, `renderBlockSoilSection` 29854, `FARM_LAYOUT` 29227, modals). Hierarchy:
> Page → views/sections → dropdowns/components. Columns = implied requirement.
> No codebase comparison.

## Page identity
| Page | Route | Render fn | Structure |
|---|---|---|---|
| Locations | `/farm/locations` | `coreLocationsView` | SVG farm map + zone/block list + block detail panel |

## 1. Chrome
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| `h1` "Locations" | label | — | — | — | any |
| **Add zone** (`openZoneCreateModal`) | BTN | yes | zones | `POST zones` | create zone | F/M |
| **Add block** (`openBlockCreateModal`) | BTN | yes | production_units | `POST production-units` | create PU | F/M |

## 2. Farm map (SVG)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| SVG farm map (`farm-map-svg`) — zones polygons + blocks | CHT/map | yes | `GET farms/{id}/layout` | "Map view · stylized preview" |
| Map block (`farm-map-block`) clickable → select (`selectMapBlock`) | cell | yes | `GET production-units` | drill |
| Map controls: zoom in/out (`zoomMap`), center on active task (`centerOnActiveTask`) | BTN×3 | client | — | view nav |
| Highlight zone (`highlightZone`) | BTN | client | — | |

## 3. Zone + block lists
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Farm zones list (+ add) | list | yes | `GET zones` | any |
| Block list (`selectMapBlock`) + add-block | list | yes | `GET production-units` | any |
| Block list filters | dropdown | yes | `GET production-units?filter=` | any |

## 4. Block detail panel (`renderBlockDetailPanel`)
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| Status · Area | KPI | yes | `GET production-units/{id}` | — | any |
| Current crop / Days since planted | KPI×2 | yes | `GET cycles?pu=` | — | any |
| Recent events | list | yes | `GET events?pu=` | — | any |
| **Log event here** (`logEventHere`) | BTN | yes | `POST events` | log field event | F/M/WORKER |
| Close (`closeBlockDetail`) | BTN | client | — | — | any |

## 5. Block soil section (`renderBlockSoilSection`)
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Soil pH + soil data | KPI | yes | `GET production-units/{id}` (soil_ph, last_soil_test_date) | any |
| **Soil report** (`openSoilReport`) | BTN | yes | `GET soil/report` | any |
| **Soil test** (`openSoilTest`) | BTN/MOD | yes | `POST events` SOIL_TEST | F/M/WORKER |

## 6. Modals
| Modal | Trigger | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Create zone | `openZoneCreateModal` | yes | `POST zones` | F/M |
| Create block (PU) | `openBlockCreateModal` | yes | `POST production-units` | F/M |
| Soil test | `openSoilTest` | yes | `POST events` SOIL_TEST | F/M/WORKER |
| Soil report | `openSoilReport` | yes | `GET soil/report` | any |

## 7. States / Permissions / Nav
| Item | Notes |
|---|---|
| Empty: no zones/blocks → add prompts | STATE |
| Map is "stylized preview" (finer GPS on the way) | informational |
| View block → block detail panel | `selectMapBlock` |
| Block detail → Log event / Soil test | actions |
| Permissions: view any; create zone/block + soil test = F/M(/WORKER for events) | inferred |

## 8. Data (prototype mock → implied schema)
| Const | Implied |
|---|---|
| `FARM_LAYOUT` (name, boundary, zones[id/name/area/vertical/accent/polygon], blocks[code/name/status/crop/stage/area/x/y/w/h]) | tenant.zones + tenant.production_units (+ geometry) |

---

## Locations — COMPLETE coverage statement
**~25 objects** across chrome (add zone/block), SVG farm map (clickable blocks + zoom/center/highlight controls), zone + block lists with filters, block detail panel (status/crop/days/recent events/log-event), soil section (pH + soil report + soil test), 4 modals, states, permissions, data. Single-view page (map + drill), no sub-page tabs. **Locations audit = 100%, prototype-only.**

## Audit progress (`COVERAGE_MATRIX_INDEX.md`)
Done: **#1 Overview · #3 Tasks · #5 Enterprises · #6 Production · #7 Inventory · #8 Labor · #9 Buyers · #10 Cash · #11 Equipment · #12 Locations · #13 Compliance = 11 / 20.**
Remaining: Farm History, Decision Center, Analytics, Reports, Weather, Library, Gallery, Partnerships, Settings.
