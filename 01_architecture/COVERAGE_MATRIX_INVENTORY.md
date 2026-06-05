# Prototype V262 — Coverage Matrix · Module 9: INVENTORY (#7) (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`coreInventoryView` 19167 + `inventory*View`,
> `renderInventory*`, `renderMovementCard`/`renderReorderCard`/`renderSupplierCard`,
> `renderItemCompliancePanel`/`renderItemCycleAttribution`, `openReceiveStockForm`/
> `openUseStockForm`; lines ~18828–20040). Hierarchy: Page → Sub-page (tab) →
> dropdowns/components. Columns = implied requirement. No codebase comparison.
>
> **Doctrine:** ferry-aware status (F002 Kadavu 14-day lead) · WHD-tracked
> chemicals · input cost → cycle attribution.

## Page identity
| Page | Route | Render fn | Sub-pages |
|---|---|---|---|
| Inventory | `/farm/inventory` | `coreInventoryView` | Stock · Movements · Reorder · Suppliers · Analytics |

## 1. Chrome
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| `h1` "Inventory" | label | — | — | — | any |
| **Use stock** (`openUseStockForm`) | BTN(secondary) | yes | input_transactions | `POST input-transactions` INPUT_USED | consume → cycle cost | F/M/WORKER |
| **Receive stock** (`openReceiveStockForm`) | BTN(primary) | yes | inputs + input_transactions | `POST input-transactions` INPUT_RECEIVED | receive → cash out | F/M |

## 2. Sub-page tabs (5 — `renderInventoryViewTabs`, `switchInventoryView`)
| id | Sub-page | Backend Req | API Req |
|---|---|---|---|
| stock | Stock | yes | `GET inputs` |
| movements | Movements | yes | `GET input-transactions` |
| reorder | Reorder | yes | `GET inputs?status=low` |
| suppliers | Suppliers | yes | `GET suppliers` |
| analytics | Analytics | yes | `GET inputs/analytics` |

## 3. Capital strip (`renderCapitalStrip`)
| Tile | Calc | Backend Req | API Req |
|---|---|---|---|
| Total inventory value | Σ qty×cost | yes | `GET inputs/value` |
| Critical items | count critical | yes | `GET inputs?status=critical` |
| Low items | count low | yes | `GET inputs?status=low` |
| In chemicals (WHD-tracked) | Σ chem value | yes | `GET inputs?category=chemical` |
| In fuel | Σ fuel value | yes | `GET inputs?category=fuel` |

## 4. Ferry countdown (`renderFerryCountdown`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| F002 Kadavu next-ferry + 14-day lead banner | indicator | yes | `GET farms/{id}/ferry` | drives status pills |

## 5. Filters (dropdowns)
| Filter | Type | Values | Backend Req | API Req |
|---|---|---|---|---|
| Category (`switchInvCategoryFilter`) | dropdown | All + 8 categories (chemicals/fertilizers/seeds/fuel/feed/packaging/parts/ppe) | yes | `GET inputs?category=` |
| Status (`switchInvStatusFilter`) | dropdown | All/Critical/Low/OK/Excess | yes | `GET inputs?status=` |
| Storage (`switchInvStorageFilter`) | dropdown | storage locations | yes | `GET inputs?storage=` |
| Search | INP | name/SKU | client | — |

## 6. Stock sub-page (`inventoryStockView` + `renderInventoryRow`)
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Stock table — cols: SKU, Item, Category, Storage, Stock, Min/Max, Burn rate, Days left, Value, Status | TBL | yes | `GET inputs` | any |
| RESTRICTED flag (chemicals) | badge | yes | chemical_library | any |
| Status pill (ferry-aware) | badge | yes | computed | any |
| Row → item detail (`drillIntoItemDetail`) | nav | yes | `GET inputs/{sku}` | any |
| Row actions: Use stock / Receive stock | BTN×2 | yes | `POST input-transactions` | F/M/WORKER |
| Empty: "No items match these filters." | STATE | — | — | — |

## 7. Movements sub-page (`inventoryMovementsView` + `renderMovementCard`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Time window (`switchMovementsTimeWindow`) | dropdown | yes | query param |
| Movement card: type, qty, Net change, Equipment hours, date | card | yes | `GET input-transactions` |
| Movement → cycle (`drillIntoCycleDetail`) | nav | yes | `GET cycles/{id}` |
| Empty: "No movements in this window." | STATE | — | — |

## 8. Reorder sub-page (`inventoryReorderView` + `renderReorderCard`)
| Component | Type | Backend Req | API Req | Workflow |
|---|---|---|---|---|
| Reorder card (item below min + ferry lead) | card | yes | `GET inputs?status=low` | — |
| **Batch create reorder tasks** (`batchCreateReorderTasks`) | BTN | yes | `POST tasks` (bulk) | auto-reorder → Tasks |
| Empty: "Nothing to order right now." | STATE | — | — | — |

## 9. Suppliers sub-page (`inventorySuppliersView` + `renderSupplierCard`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Supplier card (name, items, lead time) | card | yes | `GET suppliers` |

## 10. Analytics sub-page (`inventoryAnalyticsView`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Burn-rate / capital-tied-up / stockout-projection charts | CHT | yes | `GET inputs/analytics` |

## 11. Item detail (`drillIntoItemDetail`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Item compliance panel (`renderItemCompliancePanel`) — WHD/restricted | SEC | yes | `GET inputs/{sku}/compliance` |
| Cycle attribution (`renderItemCycleAttribution`) — input cost → cycles | SEC | yes | `GET inputs/{sku}/attribution` |

## 12. Modals (full field lists)
| Modal | Trigger | Fields | Confirm | Backend Req | Permission |
|---|---|---|---|---|---|
| Receive stock | `openReceiveStockForm` | farm, storage, operator, date, time, item (Existing SKU / New SKU radio), SKU, quantity, unit cost, total (auto), supplier, lot number, expiry date, order context, +photo | `confirmReceiveStock` | `POST input-transactions` INPUT_RECEIVED (+cash out) | F/M |
| Use stock | `openUseStockForm` | block, SKU, quantity, cycle attribution, date | `confirmUseStock` | `POST input-transactions` INPUT_USED (+cycle cost) | F/M/WORKER |

## 13. Notifications / States
| Item | Trigger | Channel |
|---|---|---|
| Critical/low stock → reorder | below min | in-app → Tasks |
| Ferry-lead reorder warning (F002) | low + 14-day lead | in-app |
| Expiry approaching | lot near expiry | in-app |
| Toast on receive/use | mutation | in-app |
| Empty states (×3) | no items/movements/reorders | STATE |

## 14. Permissions (inferred)
| Action | FOUNDER | MANAGER | WORKER | VIEWER |
|---|---|---|---|---|
| View inventory | ✓ | ✓ | ✓ | ✓ |
| Receive stock | ✓ | ✓ | ✗ | ✗ |
| Use stock | ✓ | ✓ | ✓ | ✗ |
| Batch reorder | ✓ | ✓ | ✗ | ✗ |

## 15. Data (prototype mock → implied schema)
| Const | Implied |
|---|---|
| `INVENTORY_CATEGORIES` (8) | input category enum |
| `STORAGE_LOCATIONS` | storage locations |
| `INVENTORY_RICH` | tenant.inputs |
| `INVENTORY_MOVEMENTS` | tenant.input_transactions |
| `SUPPLIERS_DIRECTORY` | tenant.suppliers |

---

## Inventory — COMPLETE coverage statement
**~50 objects** across chrome, 5 sub-pages (Stock/Movements/Reorder/Suppliers/Analytics), capital strip (5 tiles), ferry countdown, 3 filter dropdowns + search, stock table (10 cols), movement/reorder/supplier cards, item detail (compliance + cycle attribution), 2 stock forms (Receive/Use with full fields), notifications, permissions, navigation, data. Ferry-aware + WHD-tracked + cycle-cost attribution captured. **Inventory audit = 100%, prototype-only.**

## Audit progress (`COVERAGE_MATRIX_INDEX.md`)
Done: **Overview #1 · Tasks #3 · Enterprises #5 · Production #6 · Inventory #7 · Labor #8 · Cash #10 · Compliance #13 = 8 / 20.**
Remaining: Farm History, Decision Center, Buyers, Assets & Equipment, Locations, Analytics, Reports, Weather, Library, Gallery, Partnerships, Settings.
