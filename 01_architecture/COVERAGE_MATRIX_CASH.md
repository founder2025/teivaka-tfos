# Prototype V262 — Coverage Matrix · Module 3: CASH (forensic, 100% · PROTOTYPE-ONLY)

> **Source: V262 prototype ONLY.** No codebase/git comparison. Every row is what
> the object IS in the prototype and what it THEREFORE REQUIRES to function —
> the specification, derived from `renderCash*` / `cash*View` / cash modals
> (prototype lines ~21690–22900).
>
> Columns: Component · Type · **Backend Required** (implied) · **DB Required**
> (implied) · **API Required** (implied) · **Workflow** · **Permission** (implied)
> · Notes. Type: SEC/BTN/KPI/FORM/INP/TBL/CHT/MOD/DATA.

## Page identity
| Page | Route (prototype) | Render fn | Views | Doctrine |
|---|---|---|---|---|
| Cash | `/farm/cash` | `cashOverviewView` + tab views | Overview·Ledger·Forecast·Categories·Reconciliation·Evidence | Profit-share: F001 hidden if rate NULL; F002 tile hidden (inviolable #9) |

## A. Page chrome
| Component | Type | Backend Req | DB Req | API Req | Workflow | Permission | Notes |
|---|---|---|---|---|---|---|---|
| `h1` "Cash" | label | — | — | — | — | any farmer | |
| **Log cash in** | BTN | yes | cash_ledger | `POST cash-in` | cash-in workflow → audit | FOUNDER/MANAGER | `openLogCashIn` |
| **Log expense** | BTN | yes | cash_ledger | `POST cash-out` | expense workflow → audit | FOUNDER/MANAGER | `openLogExpense` |

## B. View tabs (6 — `renderCashViewTabs`)
| id | Label | Implied backing |
|---|---|---|
| overview | Overview | balance + rollups |
| ledger | Ledger | `GET cash-ledger` |
| forecast | Forecast | 13-week projection engine |
| categories | Categories | category aggregation + anomaly detect |
| reconciliation | Reconciliation | statement-vs-ledger reconcile |
| evidence | Evidence | Bank Evidence PDF + verify |

## C. Overview view (`cashOverviewView`)
| Component | Type | Backend Req | DB Req | API Req | Workflow | Permission | Notes |
|---|---|---|---|---|---|---|---|
| Cash balance card (Balance / Cash / Bank split) | KPI | yes | cash_ledger | `GET balance` | — | any | rail split |
| Forecast tiles (This week net + others) | KPI×N | yes | cash_ledger+projections | `GET forecast-summary` | — | any | |
| R/P strip — Receivables (clickable) | KPI | yes | accounts_receivable | `GET receivables` | drill | any | |
| R/P strip — Payables | KPI | yes | payables/recurring | `GET payables` | drill | any | |
| R/P strip — Net working capital | KPI | yes | derived | computed | — | any | |
| R/P strip — Inventory value (clickable) | KPI | yes | inputs | `GET inventory-value` | drill | any | cross-page rollup |
| Recent cash events list + "View all in ledger" | SEC | yes | cash_ledger | `GET cash-ledger?limit` | nav | any | |
| Cash event card (`renderCashEventCard`) → detail | card | yes | cash_ledger | `GET cash-ledger/{id}` | drill (`drillIntoCashEventDetail`) | any | |
| Profit-share tile (`renderProfitShareTile`, 4 sub-tiles) | KPI×4 | yes | farms.profit_share_rate_pct | `GET profit-share` | — | OWNER | **hide if rate NULL (inviolable #9)** |

## D. Ledger view (`cashLedgerView`)
| Component | Type | Backend Req | DB Req | API Req | Permission | Notes |
|---|---|---|---|---|---|---|
| Cash event list (filterable) | TBL/list | yes | cash_ledger | `GET cash-ledger` | any | type/date/category filters |
| Event row → detail | row | yes | cash_ledger | `GET /{id}` | any | |

## E. Forecast view (`cashForecastView`)
| Component | Type | Backend Req | DB Req | API Req | Workflow | Permission | Notes |
|---|---|---|---|---|---|---|---|
| 13-week rolling forecast bar chart (SVG) | CHT | yes | cash_ledger + projected_inflows + recurring | `GET forecast?weeks=13` | — | any | projection engine |
| Week-by-week table | TBL | yes | same | same | drill (`drillIntoForecastWeek`) | any | |
| Negative-week red banner/highlight | indicator | yes | derived | computed | alert | any | cash-gap warning |
| "View weather" link | BTN | — | — | nav | — | any | cross-link |

## F. Categories view (`cashCategoriesView`)
| Component | Type | Backend Req | DB Req | API Req | Permission | Notes |
|---|---|---|---|---|---|---|
| 15 categories (4 IN + 11 OUT) breakdown | KPI×15 | yes | cash_ledger + CASH_CATEGORIES | `GET cash-by-category` | any | category enum |
| Category filter (`switchCashCategoryFilter`) | BTN | yes | — | query param | any | |
| Anomalies detected | KPI | yes | cash_ledger | anomaly-detection logic | any | implied analytics |
| Per-category FJD totals | KPI | yes | aggregation | computed | any | |

## G. Reconciliation view (`cashReconciliationView`)
| Component | Type | Backend Req | DB Req | API Req | Workflow | Permission | Notes |
|---|---|---|---|---|---|---|---|
| Last reconciliation tile (TFOS balance / Statement) | KPI | yes | reconciliation table | `GET reconciliations/latest` | — | OWNER | |
| Run-new form: Source (M-PAiSA/BSP Bank/Cash count) | INP(sel) | yes | — | — | reconcile | OWNER | `recSource` |
| — Statement date | INP(date) | yes | — | — | — | OWNER | |
| — Statement balance | INP(num) | yes | — | — | — | OWNER | `recBal` |
| — "Compare against TFOS" | BTN | yes | cash_ledger | `POST reconcile/compare` | compute delta | OWNER | |
| — Confirm (`confirmReconcile`) | BTN | yes | reconciliation table | `POST reconciliations` | persist + audit | OWNER | |
| Reconciliation history table (Date/Source/TFOS bal/Statement/Delta/Status/Verify) | TBL | yes | reconciliation table | `GET reconciliations` | — | OWNER | Verify=hash |

## H. Evidence view (`cashEvidenceView`)
| Component | Type | Backend Req | DB Req | API Req | Workflow | Permission | Notes |
|---|---|---|---|---|---|---|---|
| Bank Evidence PDF generator (`generateBankEvidence`/`generateBankEvidencePDF`) | BTN/MOD | yes | audit.events + cash + compliance | `POST reports/bank-evidence` | generate→sign→dispatch | OWNER | **the moat** |
| QR verification | CHT | yes | audit hash chain | `GET verify/{hash}` | banker verify | public | |

## I. Modals (forms)
| Modal | Trigger | Fields | Confirm | Backend Req | API Req | Permission |
|---|---|---|---|---|---|---|
| Log cash in | `openLogCashIn` | farm, block, date, time, amount, category(IN), rail, reference, source/payer, attribute-to-cycle, +photo | `confirmLogCashIn` | yes | `POST cash-in` | F/M |
| Log expense | `openLogExpense` | farm, block, operator, date, time, amount, category(OUT), **personal-draw warn**, rail (Cash/Bank/M-PAiSA), reference, recipient, attribute-to-cycle checkbox, +photo | `confirmLogExpense` | yes | `POST cash-out` | F/M |
| Reconcile | (recon form) | source, date, balance | `confirmReconcile` | yes | `POST reconciliations` | OWNER |
| Correct cash event | `openCorrectCashEvent` | EVENT_CORRECTED form | — | yes | `POST cash-ledger/{id}/correct` | F/M |
| Bank Evidence PDF | `generateBankEvidencePDF` | report params | — | yes | `POST reports/bank-evidence` | OWNER |

## J. Data structures (prototype mock → implied schema)
| Const | Implied table/config | Notes |
|---|---|---|
| `CASH_CATEGORIES` (15: 4 IN + 11 OUT) | category enum/config | |
| `CASH_RAILS` (3: M-PAiSA/Cash/Bank) | payment_method enum | M-PAiSA primary |
| `FARMS_FINANCIAL` | farms financial rollup | balance/profit-share |
| `RECURRING_EXPENSES` | recurring_expenses table | feeds forecast |
| `PROJECTED_INFLOWS` | projected_inflows (from buyer demand) | feeds forecast |
| `CASH_LEDGER` | cash_ledger (hypertable) | core |
| `CASH_CORRECTIONS_LOG` | corrections (EVENT_CORRECTED) | audit |

## K. States / Notifications (implied)
| Item | Type | Trigger | Channel |
|---|---|---|---|
| Negative-week red banner | alert | forecast week < 0 | in-app (cash-gap) |
| Anomaly detected | alert | category outlier | in-app |
| Reconciliation delta mismatch | warning | statement ≠ TFOS | in-app |
| Toast on log/reconcile/generate | notification | mutation | in-app |
| Empty: no cash events | STATE | empty ledger | — |
| Profit-share hidden | STATE | rate NULL | inviolable #9 |

---

## Cash coverage summary (prototype spec)
- **Objects:** ~50 across chrome, 6 views, 5 modals, 7 data structures.
- **Implied backend the prototype demands:** cash_ledger CRUD + balance, receivables/payables/inventory rollups, **13-week forecast projection engine**, category aggregation + anomaly detection, **statement reconciliation** (M-PAiSA/BSP/cash) with delta + verify-hash, **Bank Evidence PDF generation + signing + QR verify**, profit-share gated by NULL rate, EVENT_CORRECTED corrections, M-PAiSA-primary rails.
- **Moat-critical objects:** Bank Evidence PDF + QR verify (H), reconciliation verify-hash (G), forecast cash-gap alert (E).

## Audit progress
Modules complete (forensic, prototype-only): **Labour, Harvests, Cash.** Cash + Harvests + Labour give full coverage of the cash/revenue/people core. Remaining: Compliance (next, completes the moat trio), then Overview, Cycles, Field Events, Inventory, Buyers, Equipment, Analytics, Reports, Decisions, Locations, Weather, Gallery, Library, Partnerships + Home/Classroom/TIS/Me pillars.
