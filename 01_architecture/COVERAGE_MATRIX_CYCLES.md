# Prototype V262 — Coverage Matrix · Module 5: CYCLES (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`renderCycle*`, `cycleDetailView`, the 6
> detail panels, `renderCyclesTable`, `renderLayerRollup`, `renderStageMiniBar`,
> `renderRecommendationCard`, modals; lines ~15201–16330, `renderCycleOutcomeCard`
> 32128). Columns = implied requirement (spec). No codebase/git comparison.
>
> **Doctrine surfaced:** 3-Layer (Cash Flow / Food Security / Long-Term Asset,
> 50/30/20 target — every cycle carries a layer); 6-status lifecycle
> (PLANNED→ACTIVE→HARVESTING→CLOSING→CLOSED / FAILED); CoGK on close. Type:
> SEC/BTN/KPI/FORM/INP/TBL/CHT/MOD/STATE/DATA.

## Page identity
| Page | Route | Render fn | Views | Doctrine |
|---|---|---|---|---|
| Cycles | `/farm/cycles` | `renderCyclesTable`/`cycleDetailView` | List·Calendar·Planner | 3-Layer; 6-status; CoGK |

## 1. Page chrome
| Component | Type | Backend Req | DB Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|---|
| `h1` "Cycles" | label | — | — | — | — | any |
| **New cycle** (`newCycle`) | BTN(primary) | yes | production_cycles | `POST cycles` | create cycle (+layer) → audit | F/M |
| View tabs (List/Calendar/Planner) | nav | — | — | — | `switchCycleView` | any |

## 2. Status filters (`renderCycleStatusFilters`)
| Filter | Backend Req | API Req |
|---|---|---|
| All / Planned / Active / Harvesting / Closing / Closed / Failed (6+all) | yes | `GET cycles?status=` |
| `switchCycleStatusFilter` | yes | query param |

## 3. Quick stats bar (`renderCycleQuickStats`, 5 tiles)
| Tile | Calc | Backend Req | API Req |
|---|---|---|---|
| Active cycles | count ACTIVE | yes | `GET cycles?status=active` |
| Harvesting this week | count window | yes | `GET cycles` agg |
| CoKG average | Σ cogk/n | yes | `GET cycles` agg |
| Expected FJD | Σ expected revenue | yes | `GET cycles` agg |
| Closing soon | count near close | yes | `GET cycles` agg |

## 4. Layer rollup (`renderLayerRollup`) — 3-Layer doctrine
| Component | Type | Backend Req | DB Req | API Req | Notes |
|---|---|---|---|---|---|
| Layer-rollup bar: Cash Flow / Food Security / Long-Term Asset | KPI×3 | yes | production_cycles.layer | `GET cycles/layer-rollup` | 50/30/20 target |
| Per-layer tile (count + area + %) | KPI | yes | derived | computed | land allocation |

## 5. Stage mini-bar (`renderStageMiniBar`)
| Component | Type | Backend Req | Notes |
|---|---|---|---|
| 6-stage progress (planted/vegetative/flowering/fruiting/harvest/closing) | indicator | yes | `STAGE_ORDER_V4`; from cycle stage |

## 6. List view (`renderCyclesTable`)
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Cycles table — cols: Cycle, Crop, PU, Stage, Day(s in), Status (+layer, CoKG) | TBL | yes | `GET cycles` | any |
| Sortable columns | sort | yes | query param | any |
| Row → cycle detail | row | yes | `GET cycles/{id}` | any |

## 7. Calendar view
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Cycle timeline calendar (plant→harvest windows) | CHT | yes | `GET cycles?calendar` | date-bucketed |

## 8. Planner view (`PLANNER_RECOMMENDATIONS` + `renderRecommendationCard`)
| Component | Type | Backend Req | DB Req | API Req | Permission |
|---|---|---|---|---|---|
| Block planner grid (PU × what to plant) | SEC | yes | production_units + rotation | `GET planner` | F/M |
| Recommendation card (`renderRecommendationCard`) | card | yes | rotation engine | `GET rotation/recommend` | F/M |
| Plan a cycle from recommendation | BTN | yes | production_cycles | `POST cycles` (PLANNED) | F/M |

## 9. Cycle detail view (`cycleDetailView`) — header + actions + progress + 6 panels
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Breadcrumb (Crops/Cycles/back — `climbCycleBreadcrumb`) | nav | — | — | any |
| Open library link (`openLibrary`) | BTN | yes | kb | `GET kb` | any |
| Action: **Log event** (`logEventForCycle`) | BTN | yes | `POST events` | log field event | F/M/WORKER |
| Action: **View tasks** (`viewTasksForCycle`) | BTN | yes | `GET tasks?cycle=` | nav | any |
| Action: **Close cycle** (`closeCycleAction`) | BTN | yes | `PATCH cycles/{id}` CLOSING/CLOSED | close → CoGK | F/M |
| Action: **Mark failed** (`markCycleFailedAction`) | BTN | yes | `PATCH cycles/{id}` FAILED | fail | F/M |
| Cycle progress (6-stage bar) | indicator | yes | cycle stage | — | any |
| State banners: "marked FAILED" / "Closed cycle" | STATE | yes | cycle_status | — | any |

### 9a. Panel — Financial summary (`renderFinancialPanel`)
| Component | Type | Backend Req | Calc | Notes |
|---|---|---|---|---|
| Spent / CoKG estimate / Expected yield / Actual yield | KPI×4 | yes | cycle_financials | core P&L |
| Plants / Cost per plant / Exp. yield per plant | KPI×3 | yes | plant count | measurement: plants |
| Block area / Cost per acre / Exp. yield per acre | KPI×3 | yes | area | measurement: area |
| Measurement pref toggle (plants/area — `setMeasurementPref`) | INP | client | — | display pref |
| Yield progress vs expected bar (`fin-yield-bar`) | indicator | yes | actual/expected | |

### 9b. Panel — Chemical compliance (`renderChemicalPanel`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| Clear to harvest / WHD status | indicator | yes | `POST harvests/compliance-check` | inviolable #2 |
| Apply chemical to cycle (`applyChemicalToCycle`) | BTN | yes | `POST events` SPRAY | sets WHD |

### 9c. Panel — Buyer commitments (`renderBuyerCommitmentsPanel`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Orders/commitments for this cycle's crop | SEC | yes | `GET orders?production=` |

### 9d. Panel — Rotation (`renderRotationPanel`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Rotation history + next-crop guidance for the PU | SEC | yes | `GET rotation?pu=` |

### 9e. Panel — Activity feed (`renderActivityFeedPanel`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Field events for this cycle (audit-backed) | SEC | yes | `GET events?cycle=` / `GET audit?entity=cycle` |

### 9f. Panel — Task summary (`renderCycleTaskSummaryPanel`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Pending/done tasks for this cycle | SEC | yes | `GET tasks?cycle=` |

## 10. Cycle outcome card (`renderCycleOutcomeCard`) — on close
| Component | Type | Backend Req | Calc | Notes |
|---|---|---|---|---|
| Outcome summary (actual yield, CoGK, reconciliation %, margin) | card | yes | cycle_financials | shown after CLOSE |

## 11. Modals / actions
| Modal | Trigger | Fields | Confirm | Backend Req | Permission |
|---|---|---|---|---|---|
| New cycle | `newCycle` | crop/production, PU, **layer (Cash Flow/Food Security/Long-Term)**, planting date, planned area/yield | `confirmNewCycle` | `POST cycles` | F/M |
| Close cycle | `closeCycleAction` | actual yield, notes | `confirmCloseCycle` | `PATCH cycles/{id}` → CoGK compute | F/M |
| Mark failed | `markCycleFailedAction` | reason | — | `PATCH cycles/{id}` FAILED | F/M |
| Log event (cycle) | `logEventForCycle` | field-event form | — | `POST events` | F/M/WORKER |
| Apply chemical (cycle) | `applyChemicalToCycle` | SPRAY form | — | `POST events` SPRAY | F/M/WORKER |

## 12. Notifications / States (implied)
| Item | Trigger | Channel |
|---|---|---|
| Closing-soon nudge | cycle near close | in-app |
| Harvest-window reminder | stage=harvest | in-app |
| WHD-block on cycle harvest | WHD active | in-app 409 |
| Toast on create/close/fail/log | mutation | in-app |
| Empty: "Cycle not found." | bad id | STATE |
| Closed / Failed banners | cycle_status | STATE |
| Layer required at creation (borderline force-pick) | new cycle | gate |

## 13. Permissions matrix (inferred)
| Action | FOUNDER | MANAGER | WORKER | VIEWER |
|---|---|---|---|---|
| View cycles | ✓ | ✓ | ✓ | ✓ |
| Create / plan cycle | ✓ | ✓ | ✗ | ✗ |
| Close / mark failed | ✓ | ✓ | ✗ | ✗ |
| Log event / apply chemical to cycle | ✓ | ✓ | ✓ | ✗ |
| Set layer classification | ✓ | ✓ | ✗ | ✗ |

## 14. Navigation paths
| From → To | Trigger |
|---|---|
| Rail → Cycles (List default) | nav |
| Tabs → List/Calendar/Planner | `switchCycleView` |
| Status pill → filtered list | `switchCycleStatusFilter` |
| Row → Cycle Detail | row onclick |
| Cycle Detail → Tasks / Library / Harvests | action buttons |
| Cycle Detail breadcrumb → back | `climbCycleBreadcrumb` |
| Detail cost flow → (from Labour worker detail) | cross-link |

## 15. Data structures (prototype mock → implied schema)
| Const | Implied table/config |
|---|---|
| `CYCLES_RICH` | tenant.production_cycles |
| `CYCLE_STATUSES` (6+all) | cycle_status enum (PLANNED/ACTIVE/HARVESTING/CLOSING/CLOSED/FAILED) |
| `STAGE_ORDER_V4` / `STAGE_LABEL_V4` (6) | production_stages |
| `PLANNER_RECOMMENDATIONS` | rotation engine output |
| (financial) | tenant.cycle_financials (CoGK, yields, costs) |

---

## Cycles — COMPLETE coverage statement
**~70 objects** across 15 sections: chrome, status filters, quick stats (5), **3-Layer rollup**, stage mini-bar, 3 views (List/Calendar/Planner), the **cycle detail (header + 4 actions + 6 panels)**, outcome card, 5 modals/actions, notifications/states, permissions matrix, navigation, data. 3-Layer doctrine + 6-status lifecycle + CoGK captured. **Cycles audit = 100%, prototype-only.**

## Audit progress
Complete (prototype-only, full depth): **Labour, Compliance, Cycles.** Prototype-only ~50obj: Cash. Drafted (git-flavored, to upgrade): Harvests. Remaining: Field Events, Inventory, Buyers, Equipment, Overview, Analytics, Reports, Decisions, Locations, Weather, Gallery, Library, Partnerships + Home/Classroom/TIS/Me.
