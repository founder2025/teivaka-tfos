# Prototype V262 — Coverage Matrix · Module 8: TASKS (#3) (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`coreTasksView` 13088, `renderTaskTabs`/
> `renderTimeWindow`/`renderSourceFilters`/`renderTaskQuickStats`/`renderTaskRow`
> 14760–15090, `SMALLHOLDER_TASKS` 11563, `TASK_SOURCES` 14643). Hierarchy: Page
> → Sub-page (Pending/Completed) → dropdowns/components. Columns = implied
> requirement. No codebase comparison.
>
> **Decision-Engine spine:** every task traces to a **source** (crop stage /
> weather / buyer demand / chemical WHD / worker calendar / TIS). This is the
> prescribed-action surface.

## Page identity
| Page | Route | Render fn | Sub-pages | Faces |
|---|---|---|---|---|
| Tasks | `/farm/tasks` | `coreTasksView` | Pending · Completed | producer · smallholder · worker |

## 0. Faces
| Face | Fn | Components |
|---|---|---|
| Producer | `coreTasksView` | full task table (this doc) |
| Smallholder | `SMALLHOLDER_TASKS` / `soloTaskCard` | "A few things this week" — big DONE cards (voice-forward) |
| Worker | (overview worker-shell) | "Next task" + DONE/SKIP/HELP |

## 1. Chrome + sub-page tabs
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| `h1` "Tasks" | label | — | — | — | any |
| **Pending** tab (+ count) | tab | yes | task_queue | `GET tasks?status=open` | `switchCoreTaskTab` | any |
| **Completed** tab (+ count) | tab | yes | task_queue | `GET tasks?status=done` | `switchCoreTaskTab` | any |
| Manual task (`openManualTaskModal`) | BTN | yes | task_queue | `POST tasks` | create task | F/M |

## 2. Controls row (dropdowns/filters)
| Control | Type | Values | Backend Req | API Req |
|---|---|---|---|---|
| Engine toggle (`switchCoreTaskEngine`) | dropdown | All / [engine] | yes | query param |
| Time window (`switchCoreTaskWin`) | btn-group | To do today / This week / Urgent / Done | yes | `GET tasks?window=` |
| Source/type filter (`switchCoreTaskType` / `renderSourceFilters`) | dropdown | All sources / Crop stage / Weather / Buyer demand / Chemical WHD / Worker calendar / TIS conversation | yes | `GET tasks?source=` |
| Scope (`taskScope`) | dropdown | vertical / crop / cycle | yes | `GET tasks?scope=` |

## 3. Quick stats (`renderTaskQuickStats`)
| Tile | Calc | Backend Req | API Req |
|---|---|---|---|
| Pending today | count open today | yes | `GET tasks/agg` |
| Completed today | count done today | yes | `GET tasks/agg` |
| Completion rate | done/total | yes | `GET tasks/agg` |
| Overdue | count overdue | yes | `GET tasks/agg` |

## 4. Task table (`renderTaskRow`)
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| Table cols: Task, Crop/Enterprise, Due/When, Type, Source, **Sev**, Action | TBL | yes | `GET tasks` | — | any |
| Source pill (crop stage/weather/buyer/whd/worker/tis) | badge | yes | task source | — | any |
| Severity indicator | badge | yes | task | — | any |
| **Done** (`completeTask`) | BTN | yes | `POST tasks/{id}/complete` → audit | complete | any(self) |
| **Skip** (`skipTask`, reason) | BTN | yes | `POST tasks/{id}/skip` (reason) | skip | any(self) |
| **Help** (`openTaskHelp`) | BTN | yes | `GET tasks/{id}/help` | view body_md | any |
| Row → drill (crop type / cycle) | nav | yes | `GET cycles/{id}` | `drillIntoCycle`/`drillIntoCropType` | any |
| Completed row variant ("Done · just now · Cody") | row | yes | `GET tasks?done` | — | any |
| Breadcrumb (`climbBreadcrumb`) | nav | — | — | — | any |
| Empty: "Your tasks run themselves." | STATE | — | — | — | — |

## 5. Manual task modal (`openManualTaskModal`)
| Field | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Title/imperative, body, due date, severity, crop/cycle, assign worker | FORM | yes | `POST tasks` | F/M |

## 6. Notifications / States
| Item | Trigger | Channel |
|---|---|---|
| Overdue task | due passed | in-app/WhatsApp |
| Signal→task (Decision Engine prescribed action) | non-green signal | task created |
| Toast on done/skip | mutation | in-app |
| Empty: "Your tasks run themselves." | no open tasks | STATE |

## 7. Permissions (inferred)
| Action | FOUNDER | MANAGER | WORKER | VIEWER |
|---|---|---|---|---|
| View tasks | ✓ | ✓ | ✓(assigned) | ✓ |
| Complete / skip task | ✓ | ✓ | ✓(self) | ✗ |
| Create manual task | ✓ | ✓ | ✗ | ✗ |
| Help (read body) | ✓ | ✓ | ✓ | ✓ |

## 8. Navigation
| From → To | Trigger |
|---|---|
| Rail → Tasks (Pending default) | nav |
| Tabs → Pending/Completed | `switchCoreTaskTab` |
| Source/time/scope filters | `switchCoreTask*` |
| Row → Cycle / Crop detail | `drillIntoCycle`/`drillIntoCropType` |
| Help → task body_md | `openTaskHelp` |

## 9. Data (prototype mock → implied schema)
| Const | Implied |
|---|---|
| `TASKS_RICH` | tenant.task_queue |
| `TASK_SOURCES` (7) | task source enum (Decision-Engine origin) |
| `TASK_SOURCE_LABELS` | source labels |
| `SMALLHOLDER_TASKS` | task_queue (Solo view) |

---

## Tasks — COMPLETE coverage statement
**~35 objects** across chrome, 2 sub-page tabs (Pending/Completed), 4 control dropdowns (engine/time-window/source/scope), 4 quick stats, the task table (7 cols + source/sev pills + Done/Skip/Help + drill), manual-task modal, 3 faces, notifications, permissions, navigation, data. Decision-Engine source-traceability captured. **Tasks audit = 100%, prototype-only.**

## Audit progress (`COVERAGE_MATRIX_INDEX.md`)
Done: **Overview #1 · Tasks #3 · Enterprises #5 · Production #6 · Labor #8 · Cash #10 · Compliance #13 = 7 / 20.**
Remaining: Farm History, Decision Center, Inventory, Buyers, Assets & Equipment, Locations, Analytics, Reports, Weather, Library, Gallery, Partnerships, Settings.
