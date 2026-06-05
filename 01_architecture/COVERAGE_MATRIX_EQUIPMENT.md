# Prototype V262 — Coverage Matrix · Module 11: ASSETS & EQUIPMENT (#11) (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`coreEquipmentView` 24230 + `equip*View`,
> `renderEquipCard`/`renderServiceRow`, `equipDetailView`, modals; lines
> ~24026–24960). Hierarchy: Page → Sub-page (tab) → dropdowns/components.
> Columns = implied requirement. No codebase comparison.
>
> **Doctrine:** dual service-due engine (hours-based AND calendar-based,
> whichever hits first, traffic-light) · cost-per-hour (operating + full w/
> depreciation) → per-cycle P&L · fuel draws from diesel inventory · F002
> ferry-parts (Kadavu pump/generator parts = 14-day lead, stock-critical-spares).

## Page identity
| Page | Route | Render fn | Sub-pages |
|---|---|---|---|
| Assets & Equipment | `/farm/equipment` | `coreEquipmentView` | Fleet · Maintenance · Usage · Costs · Parts · Analytics |

## 1. Chrome + capital tiles
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| `h1` "Equipment" | label | — | — | — | any |
| **Add equipment** (`openAddEquip`) | BTN | yes | equipment | `POST equipment` EQUIPMENT_ADDED | add | F/M |
| Tile: Total assets (→tab) | KPI | yes | `GET equipment` | nav | any |
| Tile: Book value | KPI | yes | `GET equipment/value` | nav | any |
| Tile: Service due | KPI | yes | `GET equipment?service-due` | nav | any |
| Tile: Down / at-risk | KPI | yes | `GET equipment?status=down` | nav | any |

## 2. Sub-page tabs (6 — `renderEquipViewTabs`)
| id | Sub-page | Backend Req | API Req |
|---|---|---|---|
| fleet | Fleet | yes | `GET equipment` |
| maintenance | Maintenance | yes | `GET maintenance-log` |
| usage | Usage | yes | `GET usage-log` |
| costs | Costs | yes | `GET equipment/costs` |
| parts | Parts | yes | `GET spare-parts` |
| analytics | Analytics | yes | `GET equipment/analytics` |

## 3. Filters (dropdowns)
| Filter | Type | Values | Backend Req | API Req |
|---|---|---|---|---|
| Category (`switchEquipCategoryFilter`) | dropdown | All + 9 (tractor/sprayer/pump/irrigation/handtool/vehicle/generator/processing/storage) | yes | `GET equipment?category=` |
| Status (`switchEquipStatusFilter`) | dropdown | All/operational/service-due/down | yes | `GET equipment?status=` |

## 4. Fleet sub-page (`equipFleetView` + `renderEquipCard`)
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Equipment card → detail (`drillIntoEquipDetail`) | card | yes | `GET equipment/{id}` | any |
| — status pill, Tracking (hours), Calendar (service), Cost/hour, Book value, Next action | KPI×N | yes | equipment + dual service-due | any |
| — Log usage / Maintenance / Mark resolved / Report fault | BTN×4 | yes | `POST usage`,`POST maintenance`,`PATCH`,`POST faults` | F/M/WORKER |
| Empty: no equipment | STATE | — | — | — |

## 5. Maintenance sub-page (`equipMaintenanceView` + `renderServiceRow`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Tiles: Due soon / Overdue / Down / Maintenance cost | KPI×4 | yes | `GET maintenance/agg` | |
| **Schedule service** (`openScheduleService`) | BTN | yes | `POST service` SERVICE_SCHEDULED | F/M |
| Maintenance log table (Date/Equipment/Type/Description/Parts) | TBL | yes | `GET maintenance-log` | |
| Type filter (`switchMaintenanceTypeFilter`) | dropdown | yes | query param | |
| Service row (`renderServiceRow`) — dual service-due (hours+calendar, traffic-light + countdown) | row | yes | computed | |

## 6. Usage sub-page (`equipUsageView`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Usage log (hours + fuel) | TBL | yes | `GET usage-log` | fuel draws from diesel inventory |
| Operator hours → Labor | cross-link | yes | — | |

## 7. Costs sub-page (`equipCostsView`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Cost-per-hour (operating + full w/ depreciation) | KPI | yes | `GET equipment/costs` | |
| Per-cycle cost allocation (hours × cost/hour → cycle P&L) | SEC | yes | `GET equipment/{id}/cycle-allocation` | closes cycle profit loop |

## 8. Parts sub-page (`equipPartsView`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Spare parts list (`SPARE_PARTS`) | TBL | yes | `GET spare-parts` | |
| Ferry-parts warning (F002 14-day lead, stock-critical-spares) | indicator | yes | `GET farms/{id}/ferry` | |

## 9. Analytics sub-page (`equipAnalyticsView`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Utilization / downtime / revenue-at-risk charts | CHT | yes | `GET equipment/analytics` | down asset = revenue-at-risk quantified |

## 10. Equipment detail (`equipDetailView`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Dual service-due engine (hours + calendar countdown) | indicator | yes | `GET equipment/{id}` |
| Usage history / cost breakdown / fault log | SEC | yes | `GET equipment/{id}/*` |

## 11. Modals (events)
| Modal | Trigger | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Add equipment | `openAddEquip` | yes | `POST equipment` | F/M |
| Log usage | `openLogUsage` | yes | `POST usage` EQUIPMENT_USE (fuel from inventory) | F/M/WORKER |
| Maintenance | `openMaintenance` | yes | `POST maintenance` MAINTENANCE_LOGGED (cost→cash) | F/M |
| Schedule service | `openScheduleService` | yes | `POST service` SERVICE_SCHEDULED | F/M |
| Report fault | `openFault` | yes | `POST faults` FAULT_REPORTED | F/M/WORKER |

## 12. Notifications / States
| Item | Trigger | Channel |
|---|---|---|
| Service due / overdue (dual engine) | hours or calendar threshold | in-app |
| Fault reported → downtime + revenue-at-risk | fault | in-app |
| Ferry-parts critical (F002) | spare low + 14-day lead | in-app |
| Toast on add/usage/maintenance/service/fault | mutation | in-app |

## 13. Permissions (inferred)
| Action | FOUNDER | MANAGER | WORKER | VIEWER |
|---|---|---|---|---|
| View equipment | ✓ | ✓ | ✓ | ✓ |
| Add equipment / schedule service | ✓ | ✓ | ✗ | ✗ |
| Log usage / report fault | ✓ | ✓ | ✓ | ✗ |
| Log maintenance | ✓ | ✓ | ✗ | ✗ |

## 14. Navigation
| From → To | Trigger |
|---|---|
| Rail → Equipment (Fleet default) | nav |
| Tabs → 6 sub-pages | `switchEquipView` |
| Card → Equipment detail | `drillIntoEquipDetail` |
| Usage → Labor (operator hours) · Costs → Cycle P&L · Maintenance → Cash | cross-links |

## 15. Data (prototype mock → implied schema)
| Const | Implied |
|---|---|
| `EQUIP_CATEGORIES` (9) | equipment_type enum |
| `EQUIPMENT_RICH` | tenant.equipment |
| `USAGE_LOG` | equipment usage log |
| `MAINTENANCE_LOG` | maintenance log |
| `SPARE_PARTS` | spare parts inventory |

---

## Assets & Equipment — COMPLETE coverage statement
**~55 objects** across chrome + 4 capital tiles, 6 sub-pages (Fleet/Maintenance/Usage/Costs/Parts/Analytics), 2 filter dropdowns, equip card (dual service-due + 4 actions), maintenance log + service rows, cost-per-hour → cycle P&L, parts + ferry doctrine, analytics (downtime/revenue-at-risk), equipment detail, 5 event modals, notifications, permissions, navigation, data. **Equipment audit = 100%, prototype-only.**

## Audit progress (`COVERAGE_MATRIX_INDEX.md`)
Done: **Overview #1 · Tasks #3 · Enterprises #5 · Production #6 · Inventory #7 · Labor #8 · Buyers #9 · Cash #10 · Assets & Equipment #11 · Compliance #13 = 10 / 20.**
Remaining: Farm History, Decision Center, Locations, Analytics, Reports, Weather, Library, Gallery, Partnerships, Settings.
