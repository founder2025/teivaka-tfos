# Prototype V262 — Coverage Matrix · Module 1: LABOUR (COMPLETE · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY** (`coreLaborView`, `farmLaborEnhanced`, all
> `labor*View`, `renderLabor*`, `workerDetailView`, `renderGpsHeatmap`, modals,
> + 3 faces `smallholderHelpers`/`producerLaborEnhanced`/`commercialLabor`;
> lines ~19116, 20203–21700). Every column = **what the object requires** (the
> spec), derived from the prototype. No codebase/git comparison.
>
> Type: SEC/BTN/KPI/FORM/INP/TBL/CHT/MOD/STATE/DATA. Permission inferred from
> prototype role gating (FOUNDER/MANAGER/WORKER/OWNER/any).

## 0. Faces (mode-adaptive — `farmLaborEnhanced` branches on `state.farmerLevel`)
| Face | Fn | Objects (distinct from Producer) | Backend Req |
|---|---|---|---|
| Smallholder | `smallholderHelpers` | greeting "Who helped", one helper card (name·worked·pay), 2 big job buttons ("Mark a work day", "Pay someone"), progress line | workers + labor + cash-out (simplified) |
| Producer (default) | `producerLaborEnhanced`/`coreLaborView` | full 8-tab surface (this document) | full |
| Commercial | `commercialLabor` | face-scope banner + commercial-capability cards (Team roster + roles/crews, Payroll run w/ FNPF+overtime, Productivity by worker) **then** full Producer surface | + teams/crews, payroll-run, productivity ranking |

## 1. Labour Dashboard (page chrome + KPI strip)
| Component | Type | Backend Req | DB Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|---|
| `h1` "Labor" + subtitle (farm·N workers·M family) | label | yes | workers | `GET workers` | — | any |
| Farm pill / Mode pill (`v801Pills`) | BTN×2 | yes | farms/users | `GET farms`,`/auth/me` | switch farm/mode | any |
| **Pay wages** | BTN | yes | wage_ledger | `POST wages/batch` | batch-pay | FOUNDER/MANAGER |
| **Mark attendance** | BTN | yes | labor_attendance | `POST labor` | log attendance | F/M/WORKER |
| Audit strip (recent labor events) | SEC | yes | audit.events | `GET audit?entity=labor` | — | any |
| KPI: On-site now | KPI | yes | worker check-in status | `GET attendance/today` | drill→today | any |
| KPI: Expected today | KPI | yes | roster + check-in | `GET attendance/today` | drill→today | any |
| KPI: Hours this week | KPI | yes | labor_attendance | `GET labor/agg?week` | drill→timesheets | any |
| KPI: Wages owed | KPI | yes | accrual ledger | `GET wages/owed` | drill→payroll | any |
| KPI: Next payday | KPI | client | — | — | drill→payroll | any |
| View tabs (8): Today·Roster·Timesheets·Payroll·Tasks·Costing·Training&safety·Productivity | nav | — | — | — | switch view | any |

## 2. Today — "Who's working" (`laborTodayView`)
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Snapshot strip (5 tiles — dup of KPI) | KPI×5 | yes | as §1 | any |
| Operator card (`renderTodayWorkerCard`, isOperator) | card | yes | `GET workers` (isOperator flag) | any |
| Team grid of worker cards | card×N | yes | `GET workers` | any |
| Worker card: avatar, name(→detail), status pill, type, rate | card | yes | workers + check-in status | any |
| Family helpers section + "Show family" checkbox | INP | yes | workers(type=family) | any |

## 3. Workers / Roster (`laborWorkersView` + `renderWorkerDirectoryCard`)
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Type filter pills (All + 4 types + counts) | BTN×5 | yes | `GET workers?type=` | any |
| Search input (name/ID) | INP | client | — | any |
| **Add worker** (`openInviteWorkerFlow`) | BTN | yes | `POST workers` (invite) | F/M/AGRONOMIST |
| Worker directory grid | card×N | yes | `GET workers` | any |
| — avatar(photoLabel), name, id, started date, type pill | card parts | yes | workers | any |
| — Day rate / Hours-week / Wages-owed / YTD-paid tiles | KPI×4 | yes | workers+labor+wage ledger | any |
| — Productivity kg/30d, Reliability % | KPI×2 | yes | productivity attribution + attendance scoring | any |
| — card → worker detail (`drillIntoWorkerDetail`) | nav | yes | `GET workers/{id}` | any |
| Empty state "No workers match these filters." | STATE | — | — | — |

## 4. Teams / Crews (Commercial face — `commercialLabor`)
| Component | Type | Backend Req | DB Req | API Req | Permission | Notes |
|---|---|---|---|---|---|---|
| Team roster + roles | SEC | yes | teams/crews table + worker_role | `GET teams` | OWNER | commercial-only capability card in prototype |
| Crew assignment | workflow | yes | crew_membership | `POST teams/{id}/members` | OWNER | implied by "assign roles and crews" |

## 5. Attendance / Timesheets (`laborAttendanceView`)
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| GPS precision banner | label | — | — | any |
| "Include family workers" checkbox | INP | yes | workers(type) | any |
| **Mark attendance** | BTN | yes | `POST labor` | F/M/WORKER |
| Month nav prev/next (`switchAttendanceMonth`) | BTN×2 | yes | `GET labor?month` | any |
| Attendance grid (workers × 31 days) | TBL | yes | `GET labor?month-matrix` | any |
| — day cell (full/partial/family/sunday) clickable → toast or mark | cell | yes | `GET labor`,`POST labor` | F/M/WORKER |
| — week-hours column + Daily-total summary row | TBL | yes | `GET labor/agg` | any |
| Legend (5 swatches) | label | — | — | — |

## 6. Payroll / Wages (`laborWagesView` + Fiji footer + batch/single pay)
| Component | Type | Backend Req | DB Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|---|
| Wages-owed banner (Friday variant) | SEC | yes | accrual ledger | `GET wages/owed` | alert | OWNER |
| "Pay all owed" (`openBatchPay`) | BTN | yes | wage_ledger | `POST wages/batch` | batch-pay→audit | F/M |
| "Pay wages early" (`openPayWages`) | BTN | yes | wage_ledger | `POST wages` | pay→audit | F/M |
| Period filter (current-week/last-week/month/quarter) | BTN×4 | yes | — | query param | — | any |
| Per-worker wages table (9 cols: Worker/Type/Hours/Day rate/Accrued/Paid/Owed/Method/Action) | TBL | yes | workers+labor+wage ledger | `GET wages` | — | OWNER |
| — "Pay now" per row (`openPayWages`) | BTN | yes | wage_ledger | `POST wages` | pay | F/M |
| Recent payments table (8 cols incl Verify hash) | TBL | yes | wage_ledger + audit | `GET wages/payments` | — | OWNER |
| **Fiji compliance footer** — Min wage check | KPI | yes | rates + FIJI_LABOR_REGS | computed | — | OWNER |
| — Sunday/PH events (1.5×/2×) | KPI | yes | attendance flags | computed | — | OWNER |
| — FNPF YTD (8% × permanent) | KPI | yes | wage ledger + fnpf | computed | — | OWNER |
| — Underpayment risk | KPI | yes | derived | computed | — | OWNER |

## 7. Assignments / Tasks (`laborTasksView` + `renderTaskAssignmentRow`)
| Component | Type | Backend Req | API Req | Workflow | Permission |
|---|---|---|---|---|---|
| Auto-attribution banner | label | — | — | — | any |
| **Assign task** (`openAssignTask`) | BTN | yes | `POST tasks/assign` | assign→notify | F/M |
| Per-worker task summary cards (pending/completed/rate/overdue) | card×N | yes | `GET tasks?worker=` | — | any |
| — "Assign task" per card | BTN | yes | `POST tasks/assign` | assign | F/M |
| Grouped task list (overdue/in-progress/pending/completed) | list | yes | `GET tasks` | — | any |
| Task row → v3 task detail | row | yes | `GET tasks/{id}` | drill | any |

## 8. Labour Costs (`laborCostingView`)
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Capital strip: Wages owed now / Hours this week / Season total paid | KPI×3 | yes | wage ledger + labor agg | OWNER |
| Cost-by-worker card | list | yes | `GET wages/by-worker` | OWNER |
| Labour-cost-by-business card (per block/animal split) | SEC | yes | labor↔cycle attribution | OWNER |

## 9. Training & safety (`laborDevelopView` + `openLaborRecord`)
| Component | Type | Backend Req | DB Req | API Req | Permission |
|---|---|---|---|---|---|
| Training block + "Add training" | SEC+BTN | yes | training_records | `POST labor-records/training` | F/M |
| Certifications block + "Add certificate" (expiry reminders) | SEC+BTN | yes | worker_certifications | `POST labor-records/cert` | F/M |
| Safety block + "Log incident" | SEC+BTN | yes | safety_incidents | `POST labor-records/safety` | F/M |
| Record modal (`openLaborRecord`→`saveLaborRecord`): What / Who / Date | MOD/FORM | yes | resp. table | resp. POST | F/M |

## 10. Productivity / Performance Tracking (`laborAnalyticsView`)
| Component | Type | Backend Req | Calc | API Req |
|---|---|---|---|---|
| Productivity-by-worker bar chart (`productivity-bar` rows) + "Open full report" | CHT | yes | kg output / worker-hour | `GET analytics/productivity` |
| 2nd chart (yield/output trend) + report | CHT | yes | trend | `GET analytics/labor-trend` |
| Attendance reliability gauges (`reliability-gauge` ×N) + report | CHT | yes | attended/expected | `GET analytics/reliability` |
| Cost-per-kg output card (Average / Best ratio / Worth reviewing) + report | CHT | yes | labour$ / kg harvested | `GET analytics/cost-per-kg` |

## 11. Worker Detail drill-down (`workerDetailView` — 6 panels)
| Component | Type | Backend Req | API Req | Permission |
|---|---|---|---|---|
| Breadcrumb (Crops/Labor/back — `climbLaborBreadcrumb`) | nav | — | — | any |
| Action: Correct profile (`correctWorkerProfile`) | BTN | yes | `POST workers/{id}/correct` | F/M |
| Action: Pay wages (`openPayWages`) | BTN | yes | `POST wages` | F/M |
| Action: Assign task (`openAssignTask`) | BTN | yes | `POST tasks/assign` | F/M |
| Action: Mark attendance (`openMarkAttendance`) | BTN | yes | `POST labor` | F/M/WORKER |
| Panel 1 — This week (anchor tiles: Hours/Days worked/Wages accrued/Owed/Wages/Status) | KPI×6 | yes | labor+wage agg | `GET workers/{id}/week` | any |
| Panel 2 — Cycle cost flow ("Total labor cost flowed to cycles" → `drillIntoCycleDetail`) | SEC | yes | labor↔cycle attribution | `GET workers/{id}/cycle-costs` | OWNER |
| Panel 3 — Wage payments table (Paid/Period/Hours/Amount/Method/Reference/Verify) | TBL | yes | wage_ledger | `GET workers/{id}/payments` | OWNER |
| Panel 4 — GPS heatmap (`renderGpsHeatmap`) | CHT | yes | GPS check-in per block | `GET workers/{id}/gps` | OWNER |
| Panel 5 — Task history | TBL | yes | tasks | `GET workers/{id}/tasks` | any |
| Panel 6 — Fiji compliance summary (Minimum wage / FNPF YTD / Service) | KPI×3 | yes | rates+fnpf+tenure | computed | OWNER |
| GPS block cell (`gps-block`, clickable→toast) | cell | yes | GPS data | — | OWNER |

## 12. Modals (full field lists)
| Modal | Trigger | Fields | Confirm | Backend Req | Permission |
|---|---|---|---|---|---|
| Mark attendance | `openMarkAttendance(prefWorker,prefDate)` | worker(sel), block(sel), date, time-in, time-out, hours(num), task(textarea), +photo, +voice | `confirmMarkAttendance` | `POST labor` (+block+GPS+in/out) | F/M/WORKER |
| Pay wages (single) | `openPayWages(workerId)` | worker(sel), date, time, period-from, period-to, hours(num), amount(num), method, reference(text MP-…) | `confirmPayWages` | `POST wages` | F/M |
| Batch pay | `openBatchPay` | owed-worker list, total cash out, payment date, payment time | `confirmBatchPay` | `POST wages/batch` | F/M |
| Assign task | `openAssignTask(workerId)` | worker(sel), block(sel), date, time, task(textarea) | `confirmAssignTask` | `POST tasks/assign` | F/M |
| Labour record | `openLaborRecord(kind)` | what, who, date | `saveLaborRecord` | `POST labor-records/{kind}` | F/M |
| Correct worker profile | `correctWorkerProfile`/`openCorrectWorkerProfile` | EVENT_CORRECTED fields | — | `POST workers/{id}/correct` | F/M |

## 13. Labour Reports (implied outputs)
| Report | Source | Output | Backend Req | Permission |
|---|---|---|---|---|
| Productivity report ("Open full report" ×4) | analytics | screen/PDF | `GET analytics/* ` + export | OWNER |
| Payroll / wage register | wage_ledger | CSV/PDF | `GET wages/export` | OWNER |
| FNPF per-employee statement | fnpf calc | PDF (prototype: "on the way") | `GET fnpf/statement` | OWNER |
| Labour inputs to Bank Evidence PDF | Fiji footer | feeds Phase 9 PDF | report engine | OWNER |
| Attendance timesheet export | labor_attendance | CSV | `GET labor/export` | OWNER |

## 14. Labour Notifications (implied)
| Notification | Trigger | Channel | Recipient |
|---|---|---|---|
| Friday wages-owed red banner | isFriday & owed>0 | in-app | OWNER |
| Min-wage / FNPF compliance flag | footer calc fail | in-app | OWNER |
| Certificate expiry reminder | cert near expiry | in-app/WhatsApp | OWNER |
| Task assigned → worker | assign task | in-app/WhatsApp | WORKER |
| Toast on attendance/pay/record/assign save | mutation success | in-app toast | actor |

## 15. Labour Permissions matrix (inferred from prototype gating)
| Action | FOUNDER | MANAGER | WORKER | VIEWER | OWNER(=F) |
|---|---|---|---|---|---|
| View Labour | ✓ | ✓ | ✓(self) | ✓ | ✓ |
| Add worker | ✓ | ✓ | ✗ | ✗ | ✓ |
| Edit rate / correct profile | ✓ | ✓ | ✗ | ✗ | ✓ |
| Mark attendance | ✓ | ✓ | ✓(self) | ✗ | ✓ |
| Pay wages / batch pay | ✓ | ✓ | ✗ | ✗ | ✓ |
| Assign task | ✓ | ✓ | ✗ | ✗ | ✓ |
| Add training/cert/safety record | ✓ | ✓ | ✗ | ✗ | ✓ |
| View payroll/FNPF/costing | ✓ | ✓ | ✗ | ✗ | ✓ |
| Generate labour reports | ✓ | ✓ | ✗ | ✗ | ✓ |

## 16. Navigation paths (Labour)
| From → To | Trigger |
|---|---|
| Rail → Labour (Today default) | nav |
| KPI tile → tab | `switchLaborView` |
| Worker card/row → Worker Detail | `drillIntoWorkerDetail` |
| Worker Detail → Cycle Detail | `drillIntoCycleDetail` (cost flow) |
| Worker Detail breadcrumb → back | `climbLaborBreadcrumb` |
| Task row → v3 Task detail | onclick |
| Attendance cell → mark/inspect | onclick |

## 17. Data structures (prototype mock → implied schema)
| Const | Implied table/config |
|---|---|
| `WORKER_TYPES` (4) | worker_type enum |
| `FIJI_LABOR_REGS` (minWage/Sun/PH/FNPF%/PH list) | shared.labour_regs config |
| `WORKERS_RICH` (7, ~25 fields) | tenant.workers (+status/hours/wages/fnpf/productivity/gps derived) |
| `ATTENDANCE_LOG` (30d generated) | tenant.labor_attendance |
| `WAGE_LEDGER` | tenant.wage_ledger (payments + hash) |
| `TASK_ASSIGNMENTS` | tenant.labour_tasks |
| `state.laborRecords` (training/cert/safety) | training/cert/incident tables |

## 18. States
| State | Where |
|---|---|
| Empty: "No workers match these filters." | Roster |
| Empty: "No workers on this farm yet." | Costing/Today |
| Loading | all data tabs |
| Error (mutation fail → toast) | all writes |
| Building: "Season total paid — Building" | Costing |
| Profit/wage hidden for family/operator (N/A) | cards/tables |

---

## Labour — COMPLETE coverage statement
**Sub-areas decomposed (your list, 13/13):** Dashboard §1 · Workers §3 · Teams §4 · Attendance §5 · Payroll §6 · Assignments §7 · Productivity §10 · Timesheets §5 · Labour Costs §8 · Performance Tracking §10/§11 · Labour Reports §13 · Labour Notifications §14 · Labour Permissions §15. **Plus:** 3 faces §0, Today §2, Training&safety §9, Worker Detail 6 panels §11, 6 modals §12, navigation §16, data §17, states §18.

**Total Labour objects catalogued: ~130** across 18 sections. Every prototype object the Labour module emits — across all three faces and the worker drill-down — is now individually listed with its implied backend/DB/API/workflow/permission. **Labour audit = 100% complete, prototype-only.**
