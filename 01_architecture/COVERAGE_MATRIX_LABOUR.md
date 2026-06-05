# Prototype V262 — Coverage Matrix · Module 1: LABOUR (forensic, 100%)

> **Method:** decomposed directly from prototype source (`coreLaborView` and its
> 18 render functions + 5 data structures, lines ~20203–21700). Every object the
> code emits is catalogued below — sections, tiles, buttons, inputs, tables,
> charts, modals, states. Nothing grouped.
>
> **Backend baseline** (what production actually serves for Labour today):
> `GET/POST /api/v1/workers`, `PATCH /api/v1/workers/{id}/rate`,
> `GET/POST /api/v1/labor`. **Everything else below has no backend** — flagged
> per row.
>
> **Legend** — Type: SEC=section, BTN=button, KPI=tile, FORM=form, INP=input,
> TBL=table, CHT=chart, MOD=modal, STATE=state, DATA=data. PR=Production-Ready
> (✅ live / 🟡 partial / ❌ none).

---

## Page identity
| Page | Route | Render fn | Faces | Entry points |
|---|---|---|---|---|
| Labour | `/farm/labor` | `coreLaborView` (v801) → `farmLaborEnhanced` splits by `state.farmerLevel` (smallholder→`smallholderHelpers`, producer→`producerLaborEnhanced`, commercial→`commercialLabor`) | 3 | Left-rail `Labor` nav; KPI tiles deep-link to tabs; worker cards → worker detail |

---

## A. Page chrome
| Section | Component | Type | Backend | DB | API | Workflow | Permission | PR | Missing / Notes |
|---|---|---|---|---|---|---|---|---|---|
| Titlebar | `h1` "Labor" | label | — | — | — | — | any farmer | ✅ | static |
| Titlebar | subtitle "Your team · {farm} · N workers · M family" | label | yes | workers | `GET /workers` | — | any | 🟡 | counts live; "M family" needs `worker_type=family` (have type) |
| Titlebar | Farm pill (`v801Pills`) | BTN | yes | farms | `GET /farms` | switch farm | any | ✅ | `FarmSelector` |
| Titlebar | Mode pill (`v801Pills`) | BTN | derived | users | `/auth/me` mode | switch mode | any | 🟡 | mode derivation |
| Titlebar | **Pay wages** | BTN(secondary) | yes | wage_ledger | **none** | batch-pay workflow | FOUNDER/MANAGER | ❌ | `openBatchPay`; no WAGE_PAID endpoint |
| Titlebar | **Mark attendance** | BTN(primary) | yes | labor_attendance | `POST /labor` | log attendance | FOUNDER/MANAGER/WORKER | 🟡 | `openMarkAttendance`; API exists but no block/GPS/in-out |
| Audit strip | Recent labor events (`v82bRenderReactiveActivityPanel`) | SEC | yes | audit.events | `GET /audit/events?entity_type=labor` | — | any | ❌ | audit read feed not wired for labour |

## B. KPI strip — "Team today" (5 tiles, each deep-links to a tab)
| Tile | Type | Source calc | Backend | API | PR | Missing |
|---|---|---|---|---|---|---|
| On-site now | KPI | count `status==='on-site'` | yes | **none** | ❌ | no check-in/status endpoint |
| Expected today | KPI | count `status==='expected'` | yes | **none** | ❌ | same |
| Hours this week | KPI | Σ `hoursThisWeek` | yes | **none** (derive from `GET /labor`) | 🟡 | needs week aggregation endpoint |
| Wages owed | KPI | Σ `wagesOwed` | yes | **none** | ❌ | needs accrual/payment ledger |
| Next payday | KPI | days-to-Friday calc | client | — | 🟡 | client-only; OK |

## C. View tabs (8 — `renderLaborViewTabs`)
| id | Label | Hint | PR | Backing |
|---|---|---|---|---|
| today | Today | Who's working | 🟡 | workers (grid live; status ❌) |
| workers | Roster | Employees & teams | ✅ | `GET /workers` |
| attendance | Timesheets | Hours & days | 🟡 | `GET /labor` (grid/GPS ❌) |
| wages | Payroll | Owed & paid | ❌ | no wage endpoint |
| tasks | Tasks | Assignments | ❌ | no task-assign endpoint |
| costing | Costing | Labour cost | ❌ | no cost rollup |
| develop | Training & safety | Skills & records | ❌ | no training table |
| analytics | Productivity | Trends | ❌ | no productivity data |

## D. Today view (`laborTodayView`)
| Component | Type | Backend | API | PR | Missing |
|---|---|---|---|---|---|
| Snapshot strip (5 tiles, dup of B) | KPI×5 | yes | partial | ❌ | status/owed |
| "Operator" label + operator card (`renderTodayWorkerCard`, isOperator) | card | yes | `GET /workers` | 🟡 | `isOperator` flag not in API |
| "Team" grid of worker cards | card×N | yes | `GET /workers` | 🟡 | live status "—" |
| Worker card: avatar, name(→detail), status pill, type, rate | card parts | yes | workers | 🟡 | status/avatar-photo missing |
| Family helpers section + "Show family" checkbox (`toggleFamilyWorkers`) | INP(checkbox) | client | — | 🟡 | filter by `worker_type=family` |

## E. Roster / Workers view (`laborWorkersView`)
| Component | Type | Backend | API | Permission | PR | Missing |
|---|---|---|---|---|---|---|
| Type filter pills (All + 4 types, with counts) | BTN×5 | yes | `GET /workers?worker_type=` | any | ✅ | live |
| Search input (`updateLaborSearch`) | INP(search) | client | — | any | ✅ | client filter |
| **Add worker** (`openInviteWorkerFlow`) | BTN | yes | `POST /workers` | FOUNDER/MANAGER/AGRONOMIST | ✅ | live |
| Worker directory grid (`renderWorkerDirectoryCard`) | card×N | yes | `GET /workers` | any | 🟡 | card has extra fields ↓ |
| — avatar (photoLabel) | label | — | — | — | 🟡 | initials OK; photo ❌ |
| — name, id, started date | label | yes | workers | — | ✅ | |
| — type pill | badge | yes | workers | — | ✅ | |
| — Day rate tile | KPI | yes | workers | — | ✅ | |
| — Hours/week tile | KPI | yes | **none** | — | ❌ | needs labor aggregation |
| — Wages owed tile | KPI | yes | **none** | — | ❌ | accrual ledger |
| — YTD paid tile | KPI | yes | **none** | — | ❌ | payment ledger |
| — Productivity kg/30d | KPI | yes | **none** | — | ❌ | productivity attribution |
| — Reliability % | KPI | yes | **none** | — | ❌ | attendance scoring |
| — card onclick → worker detail (`drillIntoWorkerDetail`) | nav | yes | `GET /workers/{id}` | any | 🟡 | detail page not built |
| Empty state "No workers match these filters." | STATE | — | — | — | ✅ | |

## F. Timesheets / Attendance view (`laborAttendanceView`)
| Component | Type | Backend | API | PR | Missing |
|---|---|---|---|---|---|
| GPS precision banner | label | — | — | 🟡 | informational |
| "Include family workers" checkbox | INP | client | — | ✅ | |
| **Mark attendance** | BTN | yes | `POST /labor` | 🟡 | |
| Month nav prev/next (`switchAttendanceMonth`) | BTN×2 | client | `GET /labor?date range` | ❌ | no month-window endpoint |
| Attendance grid (workers × 31 days) | TBL | yes | `GET /labor` | ❌ | grid shape needs per-day matrix |
| — day cell (full/partial/family/sunday) clickable | cell | yes | toast or `openMarkAttendance` | ❌ | per-cell state from labor rows |
| — week-hours column | col | yes | **none** | ❌ | aggregation |
| Daily-total summary row | row | yes | **none** | ❌ | aggregation |
| Legend (5 swatches) | label | — | — | ✅ | static |

## G. Payroll / Wages view (`laborWagesView`)
| Component | Type | Backend | API | Permission | PR | Missing |
|---|---|---|---|---|---|---|
| Wages-owed banner (Friday variant) | SEC | yes | **none** | — | ❌ | accrual calc |
| "Pay all owed" (`openBatchPay`) | BTN | yes | **none** | FOUNDER/MANAGER | ❌ | WAGE_PAID batch |
| "Pay wages early" (`openPayWages`) | BTN | yes | **none** | FOUNDER/MANAGER | ❌ | |
| Period filter (4: current-week/last-week/month/quarter) | BTN×4 | client | **none** | — | ❌ | |
| Per-worker wages table (9 cols: Worker, Type, Hours, Day rate, Accrued, Paid, Owed, Method, Action) | TBL | yes | partial | — | ❌ | Accrued/Paid/Owed need ledger |
| — "Pay now" per row (`openPayWages`) | BTN | yes | **none** | FOUNDER/MANAGER | ❌ | |
| Recent payments table (8 cols incl Verify hash) | TBL | yes | **none** | — | ❌ | wage_ledger + audit hash |

## H. Fiji compliance footer (`renderFijiComplianceFooter`)
| Item | Type | Backend | Calc | PR | Missing |
|---|---|---|---|---|---|
| Minimum wage check (FJD 4.00/hr) | KPI | yes | `hourlyRate < min` | ❌ | needs hourly rate + check |
| Sunday / PH events (1.5× / 2×) | KPI | yes | attendance flags | ❌ | needs Sun/PH attendance |
| FNPF contributions YTD (8%) | KPI | yes | Σ fnpf permanent | ❌ | FNPF compute + remit |
| Underpayment risk | KPI | yes | derived | ❌ | |
| "Required for Phase 9 Bank Evidence PDF" note | label | — | — | 🟡 | ties to moat |

## I. Tasks view (`laborTasksView`)
| Component | Type | Backend | API | Permission | PR | Missing |
|---|---|---|---|---|---|---|
| Auto-attribution banner | label | — | — | — | 🟡 | |
| **Assign task** (`openAssignTask`) | BTN | yes | **none** | FOUNDER/MANAGER | ❌ | task-assign endpoint |
| Per-worker task summary cards (pending/completed/rate/overdue) | card×N | yes | **none** | — | ❌ | task data |
| — "Assign task" per card | BTN | yes | **none** | FOUNDER/MANAGER | ❌ | |
| Grouped task list (overdue/in-progress/pending/completed) | list | yes | **none** | — | ❌ | `TASK_ASSIGNMENTS` |
| Task row (`renderTaskAssignmentRow`) → v3 task detail | row | yes | tasks router? | — | ❌ | cross-link to tasks |

## J. Costing view (`laborCostingView`)
| Component | Type | Backend | API | PR | Missing |
|---|---|---|---|---|---|
| Capital strip (Wages owed now / Hours this week / Season total paid="Building") | KPI×3 | yes | **none** | ❌ | |
| Cost-by-worker card | list | yes | **none** | ❌ | |
| Labour-cost-by-business card | SEC | yes | **none** | ❌ | per-block cost split |

## K. Training & safety view (`laborDevelopView`)
| Component | Type | Backend | API | PR | Missing |
|---|---|---|---|---|---|
| Training block + "Add training" | SEC+BTN | yes | **none** | ❌ | training table |
| Certifications block + "Add certificate" | SEC+BTN | yes | **none** | ❌ | cert table (note: prod has no labour-cert) |
| Safety block + "Log incident" | SEC+BTN | yes | **none** | ❌ | incident table |
| Record modal (`openLaborRecord`→`saveLaborRecord`): What / Who / Date inputs | MOD/FORM | yes | **none** | FOUNDER/MANAGER | ❌ | client-only today |

## L. Productivity / Analytics view (`laborAnalyticsView`)
| Component | Type | Backend | Calc | PR | Missing |
|---|---|---|---|---|---|
| Productivity-by-worker bar chart + "Open full report" | CHT | yes | kg/30d per worker | ❌ | productivity attribution |
| (2nd chart) + report link | CHT | yes | — | ❌ | |
| Attendance reliability gauges + report link | CHT | yes | reliability % | ❌ | |
| Cost-per-kg card (avg / best / worst) + report link | CHT | yes | labour$/kg | ❌ | needs cycle cost + harvest |

## M. Worker Detail drill-down (`workerDetailView`, via `drillIntoWorkerDetail`)
| Component | Type | Backend | API | PR | Missing |
|---|---|---|---|---|---|
| 4-panel worker detail (profile/attendance/wages/tasks) | SEC | yes | `GET /workers/{id}` | 🟡 | only profile fields live |
| GPS block heatmap (`renderGpsHeatmap`) | CHT | yes | **none** | ❌ | GPS check-in data |

## N. Modals (forms)
| Modal | Trigger | Fields | Confirm fn | Backend | API | Permission | PR |
|---|---|---|---|---|---|---|---|
| Mark attendance | `openMarkAttendance` | worker(sel), block(sel), date, time-in, time-out, hours(num), task(textarea), +photo/+voice(stubs) | `confirmMarkAttendance` | yes | `POST /labor` | F/M/WORKER | 🟡 (block/GPS/in-out missing) |
| Pay wages (single) | `openPayWages` | worker(sel), date, time, period-from, period-to, hours, amount, method, reference(text) | `confirmPayWages` | yes | **none** | F/M | ❌ |
| Batch pay | `openBatchPay` | owed-worker list, total cash out, payment date, payment time | `confirmBatchPay` | yes | **none** | F/M | ❌ |
| Assign task | `openAssignTask` | worker(sel), block(sel), date, time, task(textarea) | `confirmAssignTask` | yes | **none** | F/M | ❌ |
| Labour record | `openLaborRecord` | what, who, date | `saveLaborRecord` | yes | **none** | F/M | ❌ |
| Add worker | `openInviteWorkerFlow` | name, type, rate, contact… | (invite flow) | yes | `POST /workers` | F/M/AGRONOMIST | ✅ |

## O. Data structures (the prototype's mock backing)
| Const | Shape | Real source | PR |
|---|---|---|---|
| `WORKER_TYPES` (4) | id,label | client enum | ✅ |
| `FIJI_LABOR_REGS` | minWage, Sun/PH multipliers, FNPF%, PH list | should be `shared.*` config | ❌ |
| `WORKERS_RICH` (7, ~25 fields each) | full worker incl status/hours/wages/fnpf/productivity/gps | `tenant.workers` (9 fields only) | 🟡 |
| `ATTENDANCE_LOG` (generated 30d) | per-day per-worker hours+block+hash | `tenant.labor_attendance` | 🟡 |
| `WAGE_LEDGER` | payments w/ hash | **no table** | ❌ |
| `TASK_ASSIGNMENTS` | tasks per worker | **no labour-task table** | ❌ |

## P. States
| State | Where | PR |
|---|---|---|
| Empty: "No workers match these filters." | Roster | ✅ |
| Empty: "No workers on this farm yet." | Costing/Today | ✅ |
| Loading: query `isLoading` text | all live tabs | 🟡 (text, no skeletons) |
| Error: fetch throws → toast "Could not …" | all mutations | 🟡 |
| Building: "Season total paid — Building" | Costing | 🟡 honest stub |

## Q. Notifications (Labour-triggered)
| Notification | Trigger | Channel | Backend | PR |
|---|---|---|---|---|
| Friday wages-owed red banner | `isFriday()` + owed>0 | in-app | yes | ❌ (needs accrual) |
| Toast on attendance/pay/record save | mutation success | in-app toast | client event | ✅ (live mutations) |
| FNPF / min-wage compliance flag | footer calc | in-app | yes | ❌ |

---

## Labour coverage summary
- **Objects catalogued:** 90+ across 13 sections, 6 modals, 6 data structures.
- **Production-ready breakdown:** ✅ ~14 (Roster core, Add worker, filters, search, type pills, mutation toasts, empty states) · 🟡 ~12 (Today grid, Timesheets log, worker detail profile) · ❌ ~64 (all of Payroll, Tasks, Costing, Training & safety, Productivity, GPS, FNPF, accruals).
- **Backend gaps Labour needs for full parity:** wage-accrual + payment ledger (WAGE_PAID), attendance check-in/status + GPS, month-window + week aggregation endpoints, labour-task assignment, training/cert/safety tables, productivity attribution, cost-per-kg rollup, FNPF compute, `FIJI_LABOR_REGS` as `shared.*` config.
- **Verdict:** Labour is **~22% production-ready by object count.** The Roster + basic attendance loop is real; the bankability surface (Payroll/FNPF/compliance) and all analytics are unbacked.

---

## Scope honesty for the full audit
This is **Module 1 of ~20** (Labour, to 100% as you demanded). The remaining pages — Overview, Tasks, Decisions, Cycles, Harvests, Field Events, Inventory, Cash, Buyers, Equipment, Compliance, Analytics, Reports, Gallery, Locations, Weather, Library, Partnerships, + Home/Classroom/TIS/Me pillars — each decompose to a comparable 60–120 objects. The **full matrix is a large multi-pass artifact** (est. 1,500–2,000 rows). I'll produce them in this exact format, one module per pass, committing each. **No implementation resumes until you say coverage is sufficient.**
