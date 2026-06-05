# Prototype V262 — Coverage Matrix · Module 7: OVERVIEW (#1) (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`coreOverviewV801` 14446 → `renderMixedFarming`,
> assembled from `v801Render*` sub-renderers 50328–51234). Hierarchy: Page →
> (no tabs — composed sections) → dropdowns/components. Columns = implied
> requirement. No codebase comparison.
>
> **Structure note:** Overview has **no sub-page tabs** — it is a single
> dashboard composed of ~14 sections, with a Month/Quarter dropdown + farm/mode
> dropdowns, and **3 faces** (producer dashboard / worker-shell / empty).

## Page identity
| Page | Route | Render fn | Faces | Locked verticals |
|---|---|---|---|---|
| Overview | `/farm` (overview) | `coreOverviewV801` | producer · worker-shell · empty | non-unified verticals show `renderVerticalLockScreen` ("Coming soon · on the way") |

## 0. Faces / gates
| Face | Fn | Notes |
|---|---|---|
| Producer dashboard | `coreOverviewV801` | full 14-section dashboard (this doc) |
| Worker shell | `v801RenderWorkerShellOverview` | "Your shift" — HOURS TODAY / TASKS DONE / WAGE DUE + Next task (DONE/SKIP/HELP) |
| Empty | `v801RenderEmptyOverview` | first-run empty state |
| Vertical lock | `renderVerticalLockScreen` | "Coming soon" + "What this dashboard will show" + back link |

## 1. Header zone (`v801RenderHeaderZone`)
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| `h1` "Overview / Farm overview" + subtitle | label | yes | farm | `GET farms/{id}` | — | any |
| Farm pill (`renderHeaderFarmPill`) | dropdown | yes | farms | `GET farms` | switch farm | any |
| Mode pill (`renderHeaderModePill`) | dropdown | derived | users | `/auth/me` | — | any |
| **New cycle** (`newCycle`) | BTN | yes | cycles | `POST cycles` | create | F/M |
| Refresh | BTN | yes | — | refetch | — | any |
| Top-task card (droplet/icon) + **DONE / SKIP / HELP** (or Done/Reassign) | card+BTN×3 | yes | task_queue | `POST tasks/{id}/complete|skip`, `GET tasks/{id}/help` | complete task | any(self) |

## 2. Sponsorship banner (`v801RenderSponsorshipBanner`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Sponsor/partner banner | banner | yes | `GET sponsorship` (or static) |

## 3. Hero alerts (`v801RenderHeroAlerts`)
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Alert cards (shield/alert) — top critical signals | card×N | yes | `GET alerts?severity=critical` | any |
| Dismiss/close | BTN | yes | `PATCH alerts/{id}/dismiss` | F/M |

## 4. Today priorities (`v801RenderTodayPriorities`)
| Component | Type | Backend Req | API Req | Workflow |
|---|---|---|---|---|
| Priority/task list (→ navigate) | list | yes | `GET tasks?today` | nav |
| Per task: **DONE / SKIP / HELP** | BTN×3 | yes | `POST tasks/{id}/complete|skip`,`GET help` | task actions |
| Empty: "Good time to plan ahead." | STATE | — | — | — |

## 5. Weather strip (`v801RenderWeatherStrip`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Weather strip (today + alerts) → Weather page | SEC | yes | `GET weather` |

## 6. Metrics grid (`v801RenderMetricsGrid` + `v801RenderTile`)
| Component | Type | Backend Req | API Req | Notes |
|---|---|---|---|---|
| **Month / Quarter** period dropdown | dropdown | yes | query param | window toggle |
| Tile: Current cash | KPI | yes | `GET cash/balance` | drill modal |
| Tile: Weekly burn | KPI | yes | `GET cash/burn` | drill modal |
| Tile: Receivables overdue | KPI | yes | `GET receivables?overdue` | drill modal |
| Tile: Active cycles / Credit / others | KPI×N | yes | `GET cycles`,`GET credit-score` | |
| Tile drill modal (shield/flow detail + Close) | MOD | yes | per-metric detail | `closeOverlay` |

## 7. Cycle pipeline (`v801RenderCyclePipeline`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| "Crop runs" pipeline (stage distribution) → Production/Enterprises | SEC | yes | `GET cycles/pipeline` |

## 8. Multi-farm comparison (`v801RenderMultiFarmComparison`) — commercial
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Per-farm comparison (best/worst) | SEC | yes | `GET farms/compare` | OWNER (multi-farm) |

## 9. Demand pipeline (`v801RenderDemandPipeline`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Buyer demand → forecast → navigate Buyers | SEC | yes | `GET demand-signals` |

## 10. TIS suggestions (`v801RenderTISSuggestions`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| TIS suggestion cards (ask/act) | SEC | yes | `GET tis/suggestions` |

## 11. Recent activity (`v801RenderRecentActivity`)
| Component | Type | Backend Req | API Req | Empty |
|---|---|---|---|---|
| Recent audit events feed + refresh → Farm History | SEC | yes | `GET audit/events?recent` | "Your first event will appear here." |

## 12. Recent transactions (`v801RenderRecentTransactions`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Recent cash events (dollar) → Cash | SEC | yes | `GET cash-ledger?limit` |

## 13. Quick actions (`v801RenderQuickActions`)
| Component | Type | Backend Req | API Req | Workflow |
|---|---|---|---|---|
| Quick-action buttons (plus) → harvests / cash / labor | BTN×N | yes | `navigateToFarmSub` / event forms | log shortcuts |

## 14. Audit footer (`v801RenderAuditFooter`)
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| Hash-chain audit footer (shield) → /verify | SEC | yes | `GET audit/verify` |

## 15. Worker-shell overview (`v801RenderWorkerShellOverview`) — worker face
| Component | Type | Backend Req | API Req |
|---|---|---|---|
| "Your shift" header | label | yes | `/auth/me` |
| HOURS TODAY / TASKS DONE / WAGE DUE tiles | KPI×3 | yes | `GET labor/today`,`GET tasks?worker`,`GET wages/owed` |
| Next task + DONE / SKIP / HELP | card+BTN×3 | yes | `POST tasks/{id}/…` |

## 16. States / Notifications
| Item | Notes |
|---|---|
| Empty overview (`v801RenderEmptyOverview`) | first-run |
| Vertical lock ("Coming soon") | non-unified verticals |
| Loading / refresh | per section |
| Hero alert (critical) | top-of-page |

## 17. Permissions (inferred)
| Action | FOUNDER | MANAGER | WORKER | VIEWER |
|---|---|---|---|---|
| View overview | ✓ | ✓ | ✓(worker-shell) | ✓ |
| New cycle | ✓ | ✓ | ✗ | ✗ |
| Complete/skip task | ✓ | ✓ | ✓(self) | ✗ |
| Dismiss alert | ✓ | ✓ | ✗ | ✗ |
| Quick-action log | ✓ | ✓ | ✓ | ✗ |

## 18. Navigation
| From → To | Trigger |
|---|---|
| Rail → Overview (default farm landing) | nav |
| Metric tile → drill modal | onclick |
| Section links → Production/Cash/Buyers/Labor/Weather/History/Reports | `navigateToFarmSub` |
| Quick actions → harvests/cash/labor + event forms | `navigateToFarmSub`/`launchEventForm` |
| Audit footer → /verify | onclick |

---

## Overview — COMPLETE coverage statement
**~55 objects** across header zone, 13 dashboard sections (sponsorship, hero alerts, today priorities, weather strip, metrics grid w/ Month-Quarter dropdown + tile drill modals, cycle pipeline, multi-farm comparison, demand pipeline, TIS suggestions, recent activity, recent transactions, quick actions, audit footer), 3 faces (producer/worker-shell/empty) + vertical lock, states, permissions, navigation. No sub-page tabs (single composed dashboard). **Overview audit = 100%, prototype-only.**

## Audit progress (`COVERAGE_MATRIX_INDEX.md`)
Done: **Overview #1 · Enterprises #5 · Production #6 · Labor #8 · Cash #10 · Compliance #13 = 6 / 20.**
Remaining: Farm History, Tasks, Decision Center, Inventory, Buyers, Assets & Equipment, Locations, Analytics, Reports, Weather, Library, Gallery, Partnerships, Settings.
